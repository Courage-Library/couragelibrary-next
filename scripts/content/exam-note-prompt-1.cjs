#!/usr/bin/env node
/**
 * EXAM-NOTE-PROMPT-1 (migration 127): store EXAM_NOTE template v1 (lib/prompts/exam-note-prompt.ts EXAM_NOTE_TEMPLATE_V1 —
 * the same text the code serves as its fallback until a DB version is active) as a DRAFT in prompt_templates and
 * activate it, through the SAME audited RPCs an admin uses in /admin/prompts (fn_prompt_template_save_draft →
 * fn_prompt_template_activate).
 * DEPLOY-BEFORE-ACTIVATE: the real run happens ONLY after production runs the code that reads EXAM_NOTE (a --dry-run
 * before that is fine). Idempotent: an ACTIVE EXAM_NOTE template with the v1 hash is left as is.
 *   --dry-run   everything inside ONE rolled-back transaction (the first run of a new writer is non-writing)
 * LIVE-LOCK-SAFETY: safeBegin (3 s / 60 s / 30 s).
 */
require('../db/safe-net.cjs'); // SAFE-NET: masks IPs / hosts / e-mails / keys in all output (scripts/db/safe-net.cjs)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ts = require('typescript');
const Module = require('module');
const ROOT = path.resolve(__dirname, '..', '..');
const { Client } = require('pg');
const { dbTarget, redactor } = require(path.join(ROOT, 'scripts/db/_db-env.cjs'));
const { safeBegin } = require(path.join(ROOT, 'scripts/db/live-safety.cjs'));

const DRY = process.argv.includes('--dry-run');
const ACTOR = 'exam-note-prompt-1@courage-library.test';
const NOTES = 'EXAM-NOTE-PROMPT-1: v1 — short per-exam note: how the exam asks the topic, weightage in words from its published syllabus, traps, tips, practice examples; no invented facts';

function templateV1() {
  const origResolve = Module._resolveFilename;
  Module._resolveFilename = function (r, ...rest) { return origResolve.call(this, r.startsWith('@/') ? path.join(ROOT, r.slice(2)) : r, ...rest); };
  require.extensions['.ts'] = (m, fn) => m._compile(ts.transpileModule(fs.readFileSync(fn, 'utf8'), { fileName: fn, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText, fn);
  try {
    return require(path.join(ROOT, 'lib/prompts/exam-note-prompt.ts')).EXAM_NOTE_TEMPLATE_V1;
  } finally {
    Module._resolveFilename = origResolve;
  }
}

(async () => {
  const body = templateV1();
  const sha = crypto.createHash('sha256').update(body, 'utf8').digest('hex');
  const target = dbTarget();
  const red = redactor(target);
  const c = new Client(target.pg);
  c.on('error', () => {});
  await c.connect();
  try {
    await safeBegin(c, { readOnly: false });
    const [active] = (await c.query(`select id, version, body_sha256 from public.prompt_templates where template_type = 'EXAM_NOTE' and status = 'ACTIVE'`)).rows;
    if (active && active.body_sha256 === sha) {
      console.log(`EXAM_NOTE v${active.version} is already the v1 text (sha256 ${sha.slice(0, 12)}…) — nothing to do`);
      await c.query('ROLLBACK');
      return;
    }
    await c.query('set local role service_role');
    const draft = (await c.query(`select public.fn_prompt_template_save_draft('EXAM_NOTE', $1, $2, null, $3) r`, [body, NOTES, ACTOR])).rows[0].r;
    await c.query(`select public.fn_prompt_template_activate($1, null, $2)`, [draft.id, ACTOR]);
    await c.query('reset role');
    const rows = (await c.query(`select version, status, left(body_sha256, 12) h from public.prompt_templates where template_type = 'EXAM_NOTE' order by version`)).rows;
    await c.query(DRY ? 'ROLLBACK' : 'COMMIT');
    console.log(`${DRY ? 'DRY-RUN (rolled back)' : 'COMMITTED'}: EXAM_NOTE ${rows.map((r) => `v${r.version} ${r.status} ${r.h}`).join(' · ')} (v1 sha256 ${sha.slice(0, 12)}…)`);
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    console.log(`FAILED — ${red(String(e.message)).slice(0, 300)}`);
    process.exitCode = 1;
  } finally {
    await c.end().catch(() => {});
  }
})();
