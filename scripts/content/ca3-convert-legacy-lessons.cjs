#!/usr/bin/env node
/**
 * CA-3 step 2 — convert the legacy lessons (LessonDocumentSpec v1 in Storage) into DB blocks, then VERIFY.
 * Source: the local archive written by ca3-archive-legacy-lessons.cjs (every file's sha256 re-checked against the
 * manifest AND the DB row's recorded hash) — the compiled MDX is never used (it drops steps / options / variables).
 * Per legacy document whose CURRENT version is LEGACY_MDX:
 *   convertV1 (lib/lessons/convert-v1.ts) → validateLesson (TS) → coverageGaps must be EMPTY (no v1 text lost) →
 *   fn_lesson_save_draft (LEGACY_CONVERSION; the DB validates + hashes + audits) → fn_lesson_publish (the BLOCKS version
 *   becomes current; the legacy version is demoted, never deleted) → re-read: DB validator clean, hash recomputed,
 *   coverage again on what the DB stored, the legacy row unchanged.
 * One transaction under safeBegin (LIVE-LOCK-SAFETY + rollback on stop). Without --apply it ROLLS BACK (dry run).
 * Writes <archive>/conversion-report.json. The Storage files stay archived and untouched.
 * Run: node scripts/content/ca3-convert-legacy-lessons.cjs [--apply]
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Module = require('module');
const ts = require('typescript');
const { Client } = require('pg');
const { dbTarget, redactor } = require('../db/_db-env.cjs');
const { safeBegin } = require('../db/live-safety.cjs'); // LIVE-LOCK-SWEEP: the one safe BEGIN

const ROOT = path.resolve(__dirname, '..', '..');
const APPLY = process.argv.includes('--apply');
const ACTOR = 'system:ca3-legacy-conversion';
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request.startsWith('@/')) return origResolve.call(this, path.resolve(ROOT, request.slice(2)), parent, isMain, options);
  return origResolve.call(this, request, parent, isMain, options);
};
require.extensions['.ts'] = (module, filename) => {
  const out = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } });
  module._compile(out.outputText, filename);
};
const { convertV1, coverageGaps } = require(path.join(ROOT, 'lib/lessons/convert-v1.ts'));
const { validateLesson } = require(path.join(ROOT, 'lib/lessons/blocks.ts'));
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

(async () => {
  const target = dbTarget();
  const red = redactor(target);
  const archive = path.join(target.backupDir, 'ca3', 'legacy-lessons');
  const manifest = JSON.parse(fs.readFileSync(path.join(archive, 'manifest.json'), 'utf8'));
  const c = new Client(target.pg);
  c.on('error', () => {});
  await c.connect();
  const q = async (s, p) => (await c.query(s, p)).rows;
  const report = { mode: APPLY ? 'APPLY' : 'DRY_RUN', at: new Date().toISOString(), lessons: [] };
  let bad = 0;
  try {
    await safeBegin(c);
    const legacy = await q(`select v.id, v.document_id, v.version_number, v.source_spec_hash, d.canonical_slug,
        md5(v.id::text || v.review_status || v.is_published::text || v.source_spec_hash || v.compiled_artifact_hash) row_sig
      from public.document_versions v join public.learning_documents d on d.id = v.document_id
     where v.is_current and v.content_format = 'LEGACY_MDX' order by d.canonical_slug`);
    for (const r of legacy) {
      const entry = { slug: r.canonical_slug, document_id: r.document_id, legacy_version: r.version_number, checks: {} };
      report.lessons.push(entry);
      const m = manifest.versions.find((x) => x.version_id === r.id);
      const specPath = path.join(archive, r.document_id, `v${r.version_number}`, 'spec.json');
      const buf = m && fs.existsSync(specPath) ? fs.readFileSync(specPath) : null;
      entry.checks.archive = Boolean(buf && sha(buf) === m.files['spec.json'].sha256 && sha(buf) === r.source_spec_hash);
      if (!entry.checks.archive) { bad++; console.log(`FAIL ${r.canonical_slug}: archived spec missing or hash ≠ manifest / DB`); continue; }
      const spec = JSON.parse(buf.toString('utf8'));
      const conv = convertV1(spec);
      const v = validateLesson(conv.meta, conv.blocks);
      const gaps = coverageGaps(spec, conv);
      entry.checks.ts_valid = v.ok;
      entry.checks.coverage_gaps = gaps.length;
      if (!v.ok || gaps.length) { bad++; console.log(`FAIL ${r.canonical_slug}: ${v.ok ? '' : 'invalid blocks; '}${gaps.length} v1 texts missing`); continue; }

      const [saved] = await q(`select public.fn_lesson_save_draft($1, 'en', $2::jsonb, $3::jsonb, 'LEGACY_CONVERSION', null, $4) r`, [r.document_id, JSON.stringify(conv.meta), JSON.stringify(conv.blocks), ACTOR]);
      const versionId = saved.r.version_id;
      await q(`select public.fn_lesson_publish($1, null, $2)`, [versionId, ACTOR]);
      const [db] = await q(`select v.version_number, v.lesson_meta, v.blocks, v.is_current, v.language, v.content_format,
          jsonb_array_length(public.fn_lesson_blocks_errors(v.lesson_meta, v.blocks)) db_errors,
          v.blocks_hash = encode(sha256(convert_to(v.lesson_meta::text || E'\\n' || v.blocks::text, 'UTF8')), 'hex') hash_ok,
          (select current_published_version_id from public.learning_documents where id = v.document_id) = v.id pointer_ok
        from public.document_versions v where v.id = $1`, [versionId]);
      const [old] = await q(`select is_current, md5(id::text || review_status || is_published::text || source_spec_hash || compiled_artifact_hash) row_sig from public.document_versions where id = $1`, [r.id]);
      Object.assign(entry, { blocks_version: db.version_number, blocks: db.blocks.length });
      Object.assign(entry.checks, {
        db_valid: db.db_errors === 0,
        hash_ok: db.hash_ok,
        pointer_ok: db.pointer_ok,
        current_en_blocks: db.is_current && db.language === 'en' && db.content_format === 'BLOCKS',
        db_coverage_gaps: coverageGaps(spec, { meta: db.lesson_meta, blocks: db.blocks }).length,
        legacy_demoted_not_changed: old.is_current === false && old.row_sig === r.row_sig,
      });
      const pass = Object.values(entry.checks).every((x) => x === true || x === 0);
      if (!pass) bad++;
      console.log(`${pass ? 'ok  ' : 'FAIL'} ${r.canonical_slug}: legacy v${r.version_number} → blocks v${db.version_number} (${db.blocks.length} blocks) ${JSON.stringify(entry.checks)}`);
    }
    if (APPLY && !bad) await c.query('COMMIT');
    else await c.query('ROLLBACK');
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    bad++;
    console.log(`FAIL conversion aborted (rolled back) — ${red(String(e && e.message ? e.message : e)).slice(0, 200)}`);
  } finally {
    await c.end().catch(() => {});
  }
  report.result = bad ? 'FAILED (rolled back)' : APPLY ? 'COMMITTED' : 'DRY RUN OK (rolled back)';
  fs.writeFileSync(path.join(archive, `conversion-report${APPLY ? '' : '-dry-run'}.json`), JSON.stringify(report, null, 2));
  console.log(`${report.result}: ${report.lessons.length} legacy lesson(s)`);
  process.exit(bad ? 1 : 0);
})();
