#!/usr/bin/env node
/**
 * LESSON-PROMPT-2 (migration 121) — AS THE REAL ROLES, every write inside a rolled-back transaction (withLiveTransaction →
 * safeBegin: LIVE-LOCK-SAFETY; one connection per chunk; a dropped connection re-runs the chunk once).
 *   --pre   121 is NOT applied: each chunk first runs the migration inside its own transaction (then rolls back)
 *   (none)  after apply: refuses unless 121 is APPLIED
 * Chunks: A the SQL template checker = lib/prompts/template.ts (v1, v2, sections, "one of" groups); every stored template
 * still passes · B LESSON v2 (the owner text, verbatim) saved as a DRAFT → activated → ACTIVE with the pinned hash, v1
 * RETIRED, audited, the same through the real RPCs an admin uses · C subject type REASONING (SUBJECT only) · Z nothing left.
 * Run: node scripts/live/test_lesson_prompt_2.cjs [--pre]
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Module = require('module');
const ts = require('typescript');
const ROOT = path.resolve(__dirname, '..', '..');
const { Client } = require('pg');
const { dbTarget, redactor } = require(path.join(ROOT, 'scripts/db/_db-env.cjs'));
const { withLiveTransaction } = require(path.join(ROOT, 'scripts/db/live-safety.cjs'));

const PRE = process.argv.includes('--pre');
const FILE = '20261028000121_lesson_prompt_2.sql';
const MIGRATION_SQL = fs.readFileSync(path.join(ROOT, 'supabase/migrations', FILE), 'utf8');
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request.startsWith('@/')) return origResolve.call(this, path.resolve(ROOT, request.slice(2)), parent, isMain, options);
  return origResolve.call(this, request, parent, isMain, options);
};
require.extensions['.ts'] = (module, filename) => {
  const out = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } });
  module._compile(out.outputText, filename);
};
const { templateProblems } = require(path.join(ROOT, 'lib/prompts/template.ts'));
const { LESSON_TEMPLATE_V2 } = require(path.join(ROOT, 'lib/prompts/lesson-template-v2.ts'));
const { LESSON_TEMPLATE_V1 } = require(path.join(ROOT, 'lib/prompts/lesson-prompt.ts'));
const V2_SHA = crypto.createHash('sha256').update(LESSON_TEMPLATE_V2, 'utf8').digest('hex');

let ok = true;
let pending = [];
const chk = (n, cond, info) => { pending.push({ cond, line: `${cond ? 'PASS' : 'FAIL'} ${n}${cond ? '' : ' — ' + (info ?? '')}` }); };
const flush = () => { for (const r of pending) { if (!r.cond) ok = false; console.log(r.line); } pending = []; };
const isConnectionError = (e) => !!e && (['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EPIPE', 'ECONNREFUSED'].includes(e.code) || /Connection terminated|connection error|not queryable/i.test(String(e.message)));
const ACTOR = 'lp2-smoke@courage-library.test';

(async () => {
  const target = dbTarget();
  const red = redactor(target);
  let c = new Client(target.pg); c.on('error', () => {}); await c.connect();
  const q = async (s, p) => (await c.query(s, p)).rows;
  try {
    const [led] = await q(`select count(*)::int n from public.schema_migration_ledger where filename = $1 and status = 'APPLIED'`, [FILE]);
    if (PRE && led.n > 0) throw new Error(`--pre refused: ${FILE} is already APPLIED`);
    if (!PRE && led.n === 0) throw new Error(`${FILE} is not applied (use --pre for the pre-apply smoke)`);
    const lit = (o) => `'${JSON.stringify(o).replace(/'/g, "''")}'`;
    const as = async (role, cl, sql, p) => {
      await c.query('savepoint s'); await c.query(`set local role ${role}`); await c.query(`select set_config('request.jwt.claims', ${lit(cl)}, true)`);
      try { const r = (await c.query(sql, p)).rows; await c.query('reset role'); await c.query('release savepoint s'); return { ok: true, rows: r }; }
      catch (e) { await c.query('rollback to savepoint s'); return { ok: false, code: e.code, msg: String(e.message).slice(0, 240) }; }
    };
    const svc = (sql, p) => as('service_role', { role: 'service_role' }, sql, p);
    const chunk = async (fn) => {
      for (let attempt = 1; ; attempt++) {
        pending = [];
        try {
          await c.end().catch(() => {});
          c = new Client(target.pg); c.on('error', () => {}); await c.connect();
          await withLiveTransaction(c, async () => { await fn(); });
          flush();
          return;
        } catch (e) {
          if (attempt === 1 && isConnectionError(e)) { console.log(`RETRY chunk after a dropped connection (${e.code || 'terminated'})`); continue; }
          throw e;
        }
      }
    };
    const migrate = async () => { if (PRE) await c.query(MIGRATION_SQL); };

    // ---------------- A: the checker = TS; every stored template still passes
    await chunk(async () => {
      await migrate();
      const vectors = [
        ['LESSON', LESSON_TEMPLATE_V2], ['LESSON', LESSON_TEMPLATE_V1],
        ['LESSON', '{{NODE_NAME}} {{NODE_PATH}} {{BLOCK_SPEC}} {{EXAM_LINES}} {{EXAMPLE_FOR_SUBJECT_TYPE}}'],
        ['LESSON', '{{NODE_NAME}} {{NODE_PATH}} {{BLOCK_SPEC}} {{EXAMPLE_JSON}}'],
        ['LESSON', '{{NODE_NAME}} {{NODE_PATH}} {{BLOCK_SPEC}} {{EXAM_LINES}} {{EXAMPLE_JSON}} {{#APTITUDE}}x{{/APTITUDE}} {{#LANGUAGE}}y{{/LANGUAGE}}'],
        ['LESSON', '{{NODE_NAME}} {{NODE_PATH}} {{BLOCK_SPEC}} {{EXAM_LINES}} {{EXAMPLE_JSON}} {{#STATE_SPECIFIC}}x{{/STATE_SPECIFIC}}'],
        ['LESSON', '{{NODE_NAME}} {{NODE_PATH}} {{BLOCK_SPEC}} {{EXAM_LINES}} {{EXAMPLE_JSON}} {{#APTITUDE}}open'],
        ['SYLLABUS', '{{EXAM_NAME}} {{EXAM_SLUG}} {{CYCLE}} {{TIER_JSON}} {{CHILDREN}}'],
      ];
      const bad = [];
      for (const [t, b] of vectors) {
        const r = await svc(`select public.fn_prompt_template_problems($1, $2) p`, [t, b]);
        const want = templateProblems(t, b);
        if (!r.ok || JSON.stringify(r.rows[0].p) !== JSON.stringify(want)) bad.push(`${t} ${JSON.stringify(b).slice(0, 50)}: sql=${r.ok ? JSON.stringify(r.rows[0].p) : r.msg} ts=${JSON.stringify(want)}`);
      }
      const [stored] = await q(`select count(*) filter (where cardinality(public.fn_prompt_template_problems(template_type, body)) > 0)::int bad, count(*)::int n from public.prompt_templates`);
      chk(`A-1 fn_prompt_template_problems = templateProblems on ${vectors.length} bodies (the same messages: v2 verbatim, v1, "one of" groups, sections, unknown section, open section); all ${stored.n} stored templates still pass`,
        bad.length === 0 && stored.bad === 0, bad.join(' | ') || JSON.stringify(stored));
    });

    // ---------------- B: LESSON v2 through the admin RPCs
    await chunk(async () => {
      await migrate();
      const [v1] = await q(`select id from public.prompt_templates where template_type = 'LESSON' and status = 'ACTIVE'`);
      const d = await svc(`select public.fn_prompt_template_save_draft('LESSON', $1, 'LESSON-PROMPT-2: owner-approved v2 (verbatim)', null, $2) r`, [LESSON_TEMPLATE_V2, ACTOR]);
      const act = d.ok ? await svc(`select public.fn_prompt_template_activate($1, null, $2) r`, [d.rows[0].r.id, ACTOR]) : d;
      const rows = await q(`select id, version, status, body_sha256 from public.prompt_templates where template_type = 'LESSON' order by version`);
      const [audit] = await q(`select count(*)::int n from public.admin_audit_logs where actor_email = $1 and action_type in ('PROMPT_TEMPLATE_DRAFT_SAVE', 'PROMPT_TEMPLATE_ACTIVATE')`, [ACTOR]);
      const v2 = rows.find((r) => d.ok && r.id === d.rows[0].r.id);
      chk('B-1 LESSON v2 (the owner text) saves as a DRAFT and activates: v2 ACTIVE with the pinned sha256, the previous v1 RETIRED, one ACTIVE, audited (save + activate)',
        d.ok && act.ok && v2 && v2.status === 'ACTIVE' && v2.body_sha256 === V2_SHA && rows.find((r) => r.id === v1.id).status === 'RETIRED' && rows.filter((r) => r.status === 'ACTIVE').length === 1 && audit.n === 2,
        JSON.stringify({ d: d.ok ? 'ok' : d.msg, act: act.ok ? 'ok' : act.msg, rows: rows.map((r) => [r.version, r.status, r.body_sha256.slice(0, 10)]), audit }));
    });

    // ---------------- C: subject type REASONING
    await chunk(async () => {
      await migrate();
      const [subj] = await q(`select id from public.canonical_taxonomy_nodes where node_type = 'SUBJECT' order by display_order limit 1`);
      const [topic] = await q(`select id from public.canonical_taxonomy_nodes where node_type = 'TOPIC' limit 1`);
      const okSubj = await svc(`update public.canonical_taxonomy_nodes set subject_type = 'REASONING' where id = $1`, [subj.id]);
      const badTopic = await svc(`update public.canonical_taxonomy_nodes set subject_type = 'REASONING' where id = $1`, [topic.id]);
      const badType = await svc(`update public.canonical_taxonomy_nodes set subject_type = 'MATHS' where id = $1`, [subj.id]);
      chk('C-1 subject type REASONING is accepted on a SUBJECT; refused on a TOPIC and an unknown type stays refused (23514)',
        okSubj.ok && !badTopic.ok && badTopic.code === '23514' && !badType.ok && badType.code === '23514', JSON.stringify({ okSubj, badTopic: badTopic.code, badType: badType.code }));
    });

    const [z] = await q(`select (select count(*)::int from public.admin_audit_logs where actor_email = $1) audit,
        (select count(*)::int from public.prompt_templates where template_type = 'LESSON' and body_sha256 = $2) v2`, [ACTOR, V2_SHA]);
    chk(`Z-1 nothing persisted by the smoke: 0 audit rows${PRE ? ', no v2 stored' : ''}`, z.audit === 0 && (!PRE || z.v2 === 0), JSON.stringify(z));
    flush();
  } catch (e) {
    ok = false;
    flush();
    console.log(`FAIL LESSON-PROMPT-2 smoke aborted — ${red(String(e.message)).slice(0, 300)}`);
  } finally {
    await c.end().catch(() => {});
  }
  console.log(ok ? 'LESSON-PROMPT-2: ALL PASS' : 'LESSON-PROMPT-2: FAILURES');
  process.exit(ok ? 0 : 1);
})();
