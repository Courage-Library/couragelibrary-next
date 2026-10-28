#!/usr/bin/env node
/**
 * INTAKE-CONCEPTS-AS-OUTLINE: store SYLLABUS template v3 (lib/syllabus/syllabus-template-v3.ts) as a new DRAFT version in
 * prompt_templates and activate it — through the SAME audited RPCs an admin uses in /admin/prompts
 * (fn_prompt_template_save_draft → fn_prompt_template_activate; the current version is retired, never overwritten).
 * Idempotent: an ACTIVE SYLLABUS template with the v3 hash is left as is.
 *   --dry-run   everything inside ONE rolled-back transaction (the first run of a new writer is non-writing)
 * LIVE-LOCK-SAFETY: safeBegin (3 s / 60 s / 30 s).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ts = require('typescript');
const ROOT = path.resolve(__dirname, '..', '..');
const { Client } = require('pg');
const { dbTarget, redactor } = require(path.join(ROOT, 'scripts/db/_db-env.cjs'));
const { safeBegin } = require(path.join(ROOT, 'scripts/db/live-safety.cjs'));

const DRY = process.argv.includes('--dry-run');
const ACTOR = 'syllabus-prompt-32@courage-library.test';
const NOTES = 'INTAKE-CONCEPTS-AS-OUTLINE (contract 3.2): default depth topic → subtopic; concepts as each subtopic "outline" (lesson MUST COVER lines), not concept objects';

function templateV3() {
  const src = fs.readFileSync(path.join(ROOT, 'lib/syllabus/syllabus-template-v3.ts'), 'utf8');
  const m = { exports: {} };
  new Function('module', 'exports', ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(m, m.exports);
  return m.exports.SYLLABUS_TEMPLATE_V3;
}

(async () => {
  const body = templateV3();
  const sha = crypto.createHash('sha256').update(body, 'utf8').digest('hex');
  const target = dbTarget();
  const red = redactor(target);
  const c = new Client(target.pg);
  c.on('error', () => {});
  await c.connect();
  try {
    await safeBegin(c, { readOnly: false });
    const [active] = (await c.query(`select id, version, body_sha256 from public.prompt_templates where template_type = 'SYLLABUS' and status = 'ACTIVE'`)).rows;
    if (active && active.body_sha256 === sha) {
      console.log(`SYLLABUS v${active.version} is already the v3 text (sha256 ${sha.slice(0, 12)}…) — nothing to do`);
      await c.query('ROLLBACK');
      return;
    }
    await c.query('set local role service_role');
    const draft = (await c.query(`select public.fn_prompt_template_save_draft('SYLLABUS', $1, $2, null, $3) r`, [body, NOTES, ACTOR])).rows[0].r;
    await c.query(`select public.fn_prompt_template_activate($1, null, $2)`, [draft.id, ACTOR]);
    await c.query('reset role');
    const rows = (await c.query(`select version, status, left(body_sha256, 12) h from public.prompt_templates where template_type = 'SYLLABUS' order by version`)).rows;
    await c.query(DRY ? 'ROLLBACK' : 'COMMIT');
    console.log(`${DRY ? 'DRY-RUN (rolled back)' : 'COMMITTED'}: SYLLABUS ${rows.map((r) => `v${r.version} ${r.status} ${r.h}`).join(' · ')} (v3 sha256 ${sha.slice(0, 12)}…)`);
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    console.log(`FAILED — ${red(String(e.message)).slice(0, 300)}`);
    process.exitCode = 1;
  } finally {
    await c.end().catch(() => {});
  }
})();
