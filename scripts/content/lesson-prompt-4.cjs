#!/usr/bin/env node
/**
 * LESSON-PROMPT-QUALITY-1: store LESSON template v4 (lib/prompts/lesson-template-v4.ts = v3 + exam-neutral master lessons,
 * "How exams ask this topic", real standard stems, difficulty calibration, the vocabulary word bank, answer / mistake tied
 * to the options) as a new DRAFT version in prompt_templates and activate it.
 * DEPLOY-BEFORE-ACTIVATE: the real run happens ONLY after the code that renders / checks v4 is live in production
 * (a --dry-run before that is fine). Through the SAME audited RPCs an admin uses in /admin/prompts
 * (fn_prompt_template_save_draft → fn_prompt_template_activate; v3 is retired, never overwritten).
 * Idempotent: an ACTIVE LESSON template with the v4 hash is left as is.
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
const ACTOR = 'lesson-prompt-4@courage-library.test';
const NOTES = 'LESSON-PROMPT-QUALITY-1: v3 + exam-neutral master lessons, How exams ask this topic, real stems, difficulty calibration, vocabulary word bank, answer and mistake tied to the options';

function templateV4() {
  const src = fs.readFileSync(path.join(ROOT, 'lib/prompts/lesson-template-v4.ts'), 'utf8');
  const m = { exports: {} };
  new Function('module', 'exports', ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(m, m.exports);
  return m.exports.LESSON_TEMPLATE_V4;
}

(async () => {
  const body = templateV4();
  const sha = crypto.createHash('sha256').update(body, 'utf8').digest('hex');
  const target = dbTarget();
  const red = redactor(target);
  const c = new Client(target.pg);
  c.on('error', () => {});
  await c.connect();
  try {
    await safeBegin(c, { readOnly: false });
    const [active] = (await c.query(`select id, version, body_sha256 from public.prompt_templates where template_type = 'LESSON' and status = 'ACTIVE'`)).rows;
    if (active && active.body_sha256 === sha) {
      console.log(`LESSON v${active.version} is already the v4 text (sha256 ${sha.slice(0, 12)}…) — nothing to do`);
      await c.query('ROLLBACK');
      return;
    }
    await c.query('set local role service_role');
    const draft = (await c.query(`select public.fn_prompt_template_save_draft('LESSON', $1, $2, null, $3) r`, [body, NOTES, ACTOR])).rows[0].r;
    await c.query(`select public.fn_prompt_template_activate($1, null, $2)`, [draft.id, ACTOR]);
    await c.query('reset role');
    const rows = (await c.query(`select version, status, left(body_sha256, 12) h from public.prompt_templates where template_type = 'LESSON' order by version`)).rows;
    await c.query(DRY ? 'ROLLBACK' : 'COMMIT');
    console.log(`${DRY ? 'DRY-RUN (rolled back)' : 'COMMITTED'}: LESSON ${rows.map((r) => `v${r.version} ${r.status} ${r.h}`).join(' · ')} (v4 sha256 ${sha.slice(0, 12)}…)`);
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    console.log(`FAILED — ${red(String(e.message)).slice(0, 300)}`);
    process.exitCode = 1;
  } finally {
    await c.end().catch(() => {});
  }
})();
