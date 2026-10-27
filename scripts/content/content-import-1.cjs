#!/usr/bin/env node
/**
 * CONTENT-IMPORT-1 (architect GO 2026-10-27): SSC GD 2025 PYQ CSVs (CONTENT-SOURCE-1 S1) → the canonical bank, through
 * the EXISTING import path (QuestionCsvImporterService → five gates → fn_import_question_drafts). Rules:
 *   - official questions only; NO third-party publisher content (rows with publisher / site / watermark markers are skipped)
 *   - explanations: the legacy Courage Library ones, or skipped + reported (the import function requires ≥ 40 chars)
 *   - hash de-dup: exact stem + options inside the source; the bank checksum via gate 5 (a re-run imports 0 rows)
 *   - taxonomy: scripts/content/content-import-1.topic-map.json, EXACT names only; unmapped = skipped + reported
 *   - EN / HI: language from the script (the CSV label is unreliable); a row is a language version of ONE question;
 *     translation-pair candidates are flagged, never guessed
 *   - NEEDS_FIGURE: flagged, image URLs are dropped and NEVER fetched (legacy storage is out of bounds)
 *   - gate-passing items → IN_REVIEW (they enter Focus review); flagged items stay DRAFT with the reason in
 *     authoring_metadata.importInfo; NOTHING is published (publishing = human only)
 * Modes:
 *   (default) DRY-RUN — reads only (gate lookups), writes nothing; proves it with before / after row counts
 *   --what-if-inactive-exam   DRY-RUN only: shows the result if gate 4 accepted the (inactive) SSC GD exam
 *   --commit                  imports the rows that passed a fresh dry-run, then moves the clean ones to IN_REVIEW
 * Output: counts on stdout; the per-row report (stems included) goes to --out, which must be OUTSIDE the repo.
 * Run: node scripts/content/content-import-1.cjs --src="D:/Courage Library/csv" --out="E:/CourageLibrary-Backups/content-import-1"
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '../..');
const arg = (k) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').slice(k.length + 3);
const flag = (k) => process.argv.includes(`--${k}`);
const SRC = arg('src');
const OUT = path.resolve(arg('out') || 'E:/CourageLibrary-Backups/content-import-1');
const COMMIT = flag('commit');
const WHAT_IF = flag('what-if-inactive-exam');
if (!SRC) throw new Error('--src=<folder with the 5 CSVs> is required');
if (OUT.startsWith(ROOT + path.sep)) throw new Error('--out must be outside the repository (the report contains question text)');
if (COMMIT && WHAT_IF) throw new Error('--what-if-inactive-exam is a dry-run simulation; it can never be combined with --commit');

// ---------- TS services (same loader as the offline gates) ----------
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request === 'server-only') return require.resolve('./_server-only-stub.cjs');
  if (request.startsWith('@/')) return origResolve.call(this, path.resolve(ROOT, request.slice(2)), parent, isMain, options);
  return origResolve.call(this, request, parent, isMain, options);
};
require.extensions['.ts'] = (module, filename) => {
  const out = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } });
  module._compile(out.outputText, filename);
};
if (typeof globalThis.WebSocket === 'undefined') globalThis.WebSocket = class DummyWebSocket {}; // Node 20 (F1-a)

const { readEnv, dbTarget } = require('../db/_db-env.cjs');
const { findUserByEmail } = require('../e2e/find-user.cjs');
const { createClient } = require('@supabase/supabase-js');
const { Client } = require('pg');
const { QuestionCsvImporterService } = require(path.join(ROOT, 'services/question-factory/question-csv-importer.service.ts'));
const { createDbGateLookups } = require(path.join(ROOT, 'services/question-factory/question-factory-importer.service.ts'));

const MAP = JSON.parse(fs.readFileSync(path.join(__dirname, 'content-import-1.topic-map.json'), 'utf8'));
const FILES = ['English.csv', 'GA.csv', 'QA.csv', 'Reasoning.csv', 'Hindi.csv'];
const EXAM_SLUG = 'ssc-gd';
const PYQ_YEAR = 2025;
const MIN_EXPLANATION = 40;
const THIRD_PARTY = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(?:com|in|net|org)\b|adda ?247|testbook|oliveboard|gradeup|byju|unacademy|examstocks|safalta|careerpower|career power|mahendra|kiran|rojgar|telegram|youtube|whatsapp|©|copyright)/i;
const FIGURE_WORDS = /(figure|diagram|given image|picture|आकृति|चित्र)/i;

// ---------- CSV (RFC 4180) ----------
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; } else if (c === '"') q = false; else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}
const devanagari = (s) => {
  const letters = [...String(s)].filter((ch) => /\p{L}/u.test(ch));
  return letters.filter((ch) => ch >= '\u0900' && ch <= '\u097f').length / Math.max(1, letters.length);
};
const norm = (s) => String(s).normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();

// ---------- normalize + classify (offline) ----------
function normalizeAll() {
  const out = [];
  for (const file of FILES) {
    const [header, ...data] = parseCsv(fs.readFileSync(path.join(SRC, file), 'utf8').replace(/^\uFEFF/, ''));
    const col = Object.fromEntries(header.map((h, i) => [h.trim(), i]));
    const map = MAP[file];
    data.forEach((cells, i) => {
      const get = (k) => String(cells[col[k]] ?? '').trim();
      const ref = `${file}#${i + 2}`;
      const r = { ref, file, line: i + 2, skip: null, flags: [], info: {} };
      if (get('question_text') === 'question_text') { r.skip = 'HEADER_ROW'; out.push(r); return; }
      r.stem = get('question_text');
      r.topicLabel = get('topic');
      r.key = get('correct_answer').toUpperCase();
      r.difficulty = ['easy', 'medium', 'hard'].includes(get('difficulty').toLowerCase()) ? get('difficulty').toLowerCase() : 'medium';
      r.explanation = get('explanation');
      r.language = devanagari(r.stem) > 0.5 ? 'hi' : 'en';
      if ((get('language').toLowerCase().startsWith('hi') ? 'hi' : 'en') !== r.language) r.info.languageLabelMismatch = true;
      let opts = null;
      try { opts = JSON.parse(get('options')); } catch { /* invalid */ }
      const keys = opts && typeof opts === 'object' && !Array.isArray(opts) ? Object.keys(opts) : [];
      r.options = keys.length ? Object.fromEntries(keys.map((k) => [k.toUpperCase(), String(opts[k] ?? '').trim()])) : null;
      if (get('options_type') && get('options_type') !== 'text' && !['A', 'B', 'C', 'D'].includes(get('options_type'))) r.skip = 'NEEDS_FIGURE_OPTIONS';
      else if (!r.options || JSON.stringify(Object.keys(r.options).sort()) !== '["A","B","C","D"]' || Object.values(r.options).some((v) => !v)) r.skip = 'INVALID_OPTIONS';
      else if (!['A', 'B', 'C', 'D'].includes(r.key)) r.skip = 'SHIFTED_OR_INVALID_KEY';
      else if (!map || !map.subject) r.skip = 'UNMAPPED_SUBJECT';
      else if (!map.topics[r.topicLabel]) r.skip = 'UNMAPPED_TOPIC';
      else if ([r.stem, r.explanation, ...Object.values(r.options)].some((t) => THIRD_PARTY.test(t))) r.skip = 'THIRD_PARTY_MARKER';
      else if (r.explanation.length < MIN_EXPLANATION) r.skip = 'EXPLANATION_MISSING_OR_SHORT';
      if (!r.skip) {
        r.subject = map.subject;
        r.topicSlug = map.topics[r.topicLabel];
        if (get('question_image') || FIGURE_WORDS.test(r.stem)) r.flags.push('NEEDS_FIGURE');
      }
      out.push(r);
    });
  }
  // exact duplicates inside the source (stem + options), first one kept
  const seen = new Map();
  for (const r of out.filter((x) => !x.skip)) {
    const h = norm(r.stem) + '|' + ['A', 'B', 'C', 'D'].map((k) => norm(r.options[k])).join('|');
    if (seen.has(h)) { r.skip = 'DUP_IN_SOURCE'; r.info.duplicateOf = seen.get(h); } else seen.set(h, r.ref);
  }
  // EN ↔ HI translation-pair CANDIDATES (same file + topic + key + identical numbers in every option): flagged, never paired
  const fp = (r) => `${r.file}|${r.topicSlug}|${r.key}|` + ['A', 'B', 'C', 'D'].map((k) => r.options[k].replace(/[^0-9.]/g, '')).join('|');
  const live = out.filter((x) => !x.skip && ['A', 'B', 'C', 'D'].some((k) => /\d/.test(x.options[k])));
  const byFp = new Map();
  for (const r of live) byFp.set(fp(r), [...(byFp.get(fp(r)) || []), r]);
  for (const group of byFp.values()) {
    if (new Set(group.map((g) => g.language)).size > 1) for (const g of group) { g.flags.push('PAIR_CANDIDATE'); g.info.pairWith = group.filter((x) => x !== g).map((x) => x.ref); }
  }
  return out;
}

const toCsvRow = (r) => ({
  question_text: r.stem,
  options: JSON.stringify(r.options),
  correct_answer: r.key,
  difficulty: r.difficulty,
  explanation: r.explanation,
  language: r.language,
  subject: r.subject,
  topic: r.topicSlug,
  pyq_year: String(PYQ_YEAR),
  pyq_source: EXAM_SLUG,
  pyq_reference: `SSC GD Constable ${PYQ_YEAR} (date / shift not recorded in the source)`,
});
const importInfo = (r) => ({ source: 'CONTENT-IMPORT-1', sourceRef: r.ref, legacyTopic: r.topicLabel, flags: r.flags, explanationSource: 'legacy Courage Library (to verify in review)' });

/** Row counts, in a READ ONLY transaction under LIVE-LOCK-SAFETY (lock 3 s, statement 60 s, idle-in-transaction 30 s). */
async function counts(pg) {
  await pg.query('BEGIN READ ONLY');
  try {
    await pg.query("SET LOCAL lock_timeout = '3s'");
    await pg.query("SET LOCAL statement_timeout = '60s'");
    await pg.query("SET LOCAL idle_in_transaction_session_timeout = '30s'");
    const c = await pg.query(`select (select count(*) from question_versions)::int qv, (select count(*) from questions)::int q, (select count(*) from question_import_batches)::int b, (select count(*) from admin_audit_logs)::int a, (select count(*) from question_sources)::int s,
      (select count(*) from question_versions where lifecycle_status = 'IN_REVIEW')::int in_review, (select count(*) from question_versions where lifecycle_status = 'DRAFT')::int draft, (select count(*) from question_versions where lifecycle_status = 'PUBLISHED')::int published`);
    return c.rows[0];
  } finally {
    await pg.query('ROLLBACK');
  }
}

(async () => {
  const env = readEnv();
  const target = dbTarget(); // ref + TLS guard before anything connects
  const sb = createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
  const pg = new Client({ ...target.pg, port: 6543 });
  await pg.connect();
  const before = await counts(pg);

  const actor = await findUserByEmail(sb, 'qa-admin@courage-library.test');
  if (!actor) throw new Error('QA admin identity missing (scripts/qa/ensure-qa-identities.cjs)');

  const rows = normalizeAll();
  const candidates = rows.filter((r) => !r.skip);
  let lookups;
  if (WHAT_IF) {
    const real = createDbGateLookups(sb);
    const { data: gd } = await sb.from('exams').select('id').eq('slug', EXAM_SLUG).maybeSingle();
    lookups = { ...real, resolveExamSlug: async (s) => (s === EXAM_SLUG && gd ? gd.id : real.resolveExamSlug(s)) };
  }
  const dry = await QuestionCsvImporterService.run({ rows: candidates.map(toCsvRow), mode: 'dry-run', actorId: actor.id, supabase: sb, lookups });
  candidates.forEach((r, i) => {
    const res = dry.rows[i];
    r.gate = res.status;
    r.gateErrors = res.errors;
    r.gateWarnings = res.warnings;
    if (res.status === 'REJECTED') {
      const e = res.errors.join(' ');
      r.skip = /Duplicate option text/.test(e) ? 'OPTION_TEXT_DUPLICATE'
        : /(?:exact|near)[- ]duplicate.*?of batch item/i.test(e) ? 'DUPLICATE_IN_IMPORT_BATCH'
        : /duplicat/i.test(e) ? 'DUPLICATE_IN_BANK'
        : /examSlug/.test(e) ? 'GATE4_PYQ_EXAM_NOT_RESOLVED' : 'GATE_REJECTED';
    }
    else if (res.warnings.some((w) => /near-dup|similar/i.test(w))) r.flags.push('NEAR_DUPLICATE');
  });

  let committed = null;
  if (COMMIT) {
    const pass = candidates.filter((r) => !r.skip);
    const res = await QuestionCsvImporterService.run({ rows: pass.map(toCsvRow), mode: 'commit', actorId: actor.id, supabase: sb, rowMetadata: pass.map(importInfo) });
    committed = { imported: 0, inReview: 0, draftFlagged: 0, failed: 0, batches: res.batchIds.length };
    // one audit row per import batch (the same action the factory service writes for an import)
    for (const batchId of res.batchIds) {
      const n = res.rows.filter((x) => x.status === 'IMPORTED').length;
      await sb.from('admin_audit_logs').insert({ actor_id: actor.id, actor_email: actor.email, action_type: 'QF_IMPORT_DRAFTS', target_entity: 'question_import_batch', target_id: batchId, old_value: null, new_value: { origin: 'CSV_IMPORT', source: 'CONTENT-IMPORT-1', importedInRun: n }, reason: null });
    }
    for (const [i, r] of pass.entries()) {
      const x = res.rows[i];
      if (x.status !== 'IMPORTED') { r.skip = 'COMMIT_REJECTED'; r.gateErrors = x.errors; committed.failed++; continue; }
      committed.imported++;
      r.versionId = x.versionId;
      if (r.flags.length) { r.final = 'DRAFT'; committed.draftFlagged++; continue; }
      const { data, error } = await sb.rpc('fn_transition_question_version', { p_version_id: x.versionId, p_to: 'IN_REVIEW', p_actor: actor.id, p_notes: 'CONTENT-IMPORT-1: passed the automated gates', p_checklist: null });
      if (error || !data?.success) { r.final = 'DRAFT'; r.flags.push('TRANSITION_FAILED'); committed.draftFlagged++; continue; }
      await sb.from('admin_audit_logs').insert({ actor_id: actor.id, actor_email: actor.email, action_type: 'QF_TRANSITION_IN_REVIEW', target_entity: 'question_version', target_id: x.versionId, old_value: { lifecycle_status: 'DRAFT' }, new_value: { lifecycle_status: 'IN_REVIEW', source: 'CONTENT-IMPORT-1' }, reason: null });
      r.final = 'IN_REVIEW';
      committed.inReview++;
    }
  }
  const after = await counts(pg);
  await pg.end();

  const tally = (list, key) => list.reduce((m, r) => ((m[r[key] || '—'] = (m[r[key] || '—'] || 0) + 1), m), {});
  const perFile = Object.fromEntries(FILES.map((f) => [f, tally(rows.filter((r) => r.file === f), 'skip')]));
  const flagged = rows.filter((r) => !r.skip && r.flags.length);
  const summary = {
    mode: COMMIT ? 'COMMIT' : WHAT_IF ? 'DRY-RUN (what-if: gate 4 accepts the inactive SSC GD exam)' : 'DRY-RUN',
    sourceRows: rows.length,
    skippedByReason: tally(rows.filter((r) => r.skip), 'skip'),
    wouldImport: rows.filter((r) => !r.skip).length,
    wouldGoInReview: rows.filter((r) => !r.skip && !r.flags.length).length,
    wouldStayDraftFlagged: flagged.length,
    flags: flagged.flatMap((r) => r.flags).reduce((m, f) => ((m[f] = (m[f] || 0) + 1), m), {}),
    bySubjectLanguage: rows.filter((r) => !r.skip).reduce((m, r) => ((m[`${r.subject} / ${r.language}`] = (m[`${r.subject} / ${r.language}`] || 0) + 1), m), {}),
    perFile,
    committed,
    dbCounts: { before, after, unchanged: JSON.stringify(before) === JSON.stringify(after) },
  };
  fs.mkdirSync(OUT, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  fs.writeFileSync(path.join(OUT, `report-${COMMIT ? 'commit' : WHAT_IF ? 'whatif' : 'dryrun'}-${stamp}.json`), JSON.stringify({ summary, rows }, null, 1));
  console.log(JSON.stringify(summary, null, 1));
  if (!COMMIT && !summary.dbCounts.unchanged) { console.error('DRY-RUN WROTE ROWS — investigate'); process.exit(3); }
})().catch((e) => { console.error('ERROR', String(e && e.message ? e.message : e).replace(/postgres(ql)?:\/\/\S+/g, '[url]').slice(0, 300)); process.exit(2); });
