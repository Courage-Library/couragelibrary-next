#!/usr/bin/env node
/**
 * LAUNCH-MODE-1 → PAY-1 148 (the access mode is RETIRED: migration 148 drops exam_course_launches.access_mode,
 * fn_gated_course_document_ids and the p_access_mode argument) — AS THE REAL ROLES, every write inside a rolled-back
 * transaction (withLiveTransaction → safeBegin: LIVE-LOCK-SAFETY; one connection per chunk; a dropped connection re-runs
 * the chunk once).
 *   --pre   148 is NOT applied: each chunk first runs the migration inside its own transaction (then rolls back)
 *   (none)  after apply: refuses unless 148 is APPLIED
 * Chunks: A shape (no access_mode column, no gating function, only the 6-argument launch function: INVOKER, clients
 *   cannot call; anon reads status, never coverage) · B launch / pause: LIVE → the course's lessons are live; LIVE again
 *   refused ("already LIVE"); pause → none live; pause again refused; audited EXAM_COURSE_LAUNCH / _PAUSE without a mode
 *   · Z nothing left.
 * GATE-SCOPE-SWEEP (2026-10-29): the course is the QA exam's, built in each chunk (its own topic + published node lesson +
 * published QA syllabus, scripts/live/_qa-course.cjs) — never real SSC CGL; gated / live counts are taken over THAT
 * course's documents only, and the Pro plan count is compared with its value at the start (the owner launches courses
 * and edits plans).
 * Run: node scripts/live/test_launch_mode1.cjs [--pre]
 */
require('../db/safe-net.cjs'); // SAFE-NET: masks IPs / hosts / e-mails / keys in all output (scripts/db/safe-net.cjs)
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');
const ROOT = path.resolve(__dirname, '..', '..');
const { Client } = require('pg');
const { dbTarget, redactor } = require(path.join(ROOT, 'scripts/db/_db-env.cjs'));
const { withLiveTransaction } = require(path.join(ROOT, 'scripts/db/live-safety.cjs'));
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request.startsWith('@/')) return origResolve.call(this, path.resolve(ROOT, request.slice(2)), parent, isMain, options);
  return origResolve.call(this, request, parent, isMain, options);
};
require.extensions['.ts'] = (module, filename) => {
  const out = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } });
  module._compile(out.outputText, filename);
};
const { lessonExample } = require(path.join(ROOT, 'lib/prompts/lesson-prompt.ts'));
const { qaTopic, publishNodeLesson, publishQaSyllabus, qaExamLogo } = require(path.join(ROOT, 'scripts/live/_qa-course.cjs'));

const PRE = process.argv.includes('--pre');
const FILE = '20261118000148_pay1_cleanup.sql';
const MIGRATION_SQL = fs.readFileSync(path.join(ROOT, 'supabase/migrations', FILE), 'utf8');

let ok = true;
let pending = [];
const chk = (n, cond, info) => { pending.push({ cond, line: `${cond ? 'PASS' : 'FAIL'} ${n}${cond ? '' : ' — ' + (info ?? '')}` }); };
const flush = () => { for (const r of pending) { if (!r.cond) ok = false; console.log(r.line); } pending = []; };
const isConnectionError = (e) => !!e && (['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EPIPE', 'ECONNREFUSED'].includes(e.code) || /Connection terminated|connection error|not queryable/i.test(String(e.message)));
const ACTOR = 'lm1-smoke@courage-library.test';
const COV = { total: 10, en: 1, hi: 0 };

(async () => {
  const target = dbTarget();
  const red = redactor(target);
  let c = new Client(target.pg); c.on('error', () => {}); await c.connect();
  const q = async (s, p) => (await c.query(s, p)).rows;
  try {
    const [led] = await q(`select count(*)::int n from public.schema_migration_ledger where filename = $1 and status = 'APPLIED'`, [FILE]);
    if (PRE && led.n > 0) throw new Error(`--pre refused: ${FILE} is already APPLIED`);
    if (!PRE && led.n === 0) throw new Error(`${FILE} is not applied (use --pre for the pre-apply smoke)`);
    const [exam] = await q(`select id from public.exams where slug = 'qa-syllabus-test'`);
    const [stu] = await q(`select id from auth.users where email = 'qa-student@courage-library.test'`);
    const [qaLesson] = await q(`select u.topic_id from public.learning_documents d join public.learning_units u on u.id = d.learning_unit_id where d.canonical_slug = 'qa-number-system-concept-lesson'`);
    if (!exam || !stu || !qaLesson) throw new Error('the QA exam / QA student / QA lesson missing');
    const [{ n: plansBefore }] = await q(`select count(*)::int n from public.pro_plan_versions where active`);
    const lit = (o) => `'${JSON.stringify(o).replace(/'/g, "''")}'`;
    const as = async (role, cl, sql, p) => {
      await c.query('savepoint s'); await c.query(`set local role ${role}`); await c.query(`select set_config('request.jwt.claims', ${lit(cl)}, true)`);
      try { const r = (await c.query(sql, p)).rows; await c.query('reset role'); await c.query('release savepoint s'); return { ok: true, rows: r }; }
      catch (e) { await c.query('rollback to savepoint s'); return { ok: false, code: e.code, msg: String(e.message).slice(0, 240) }; }
    };
    const ANON = { role: 'anon' };
    const STU = { sub: stu.id, role: 'authenticated', aal: 'aal1', app_metadata: {} };
    const svc = (sql, p) => as('service_role', { role: 'service_role' }, sql, p);
    const set = (status, cov = COV) => svc(`select public.fn_exam_course_launch_set($1, null, $2, $3, null, $4) r`, [exam.id, status, cov, ACTOR]);
    // counted over the fixture course's documents only (other courses may be launched by the owner)
    const count = async (fn, docs) => (await as('anon', ANON, `select count(*)::int n from public.${fn}() g(id) where g.id = any($1::uuid[])`, [docs])).rows?.[0]?.n;
    const course = async () => {
      const t = await qaTopic(q, qaLesson.topic_id, 'lm1-smoke-topic', 'LM1 Smoke Topic');
      await publishNodeLesson(svc, t, lessonExample(t), ACTOR);
      await publishQaSyllabus(q, exam.id, [t], 'lm1-smoke');
      await qaExamLogo(q, exam.id); // EXAM-LOGO-1: a launch needs a logo
    };
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
    const outlineDocs = async () => [...new Set(((await q(`select public.fn_exam_course_outline($1, null, 'en') o`, [exam.id]))[0].o.chapters || []).flatMap((ch) => (ch.lessons || []).map((l) => l.document_id)))];

    // ---------------- A: shape + grants (PAY-1 148)
    await chunk(async () => {
      await migrate();
      await course(); // a launch needs a published syllabus
      const [shape] = await q(`select to_regprocedure('public.fn_exam_course_launch_set(uuid, uuid, text, text, jsonb, uuid, text)') IS NOT NULL old7,
          to_regprocedure('public.fn_gated_course_document_ids()') IS NOT NULL gated,
          exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'exam_course_launches' and column_name = 'access_mode') col,
          (select prosecdef from pg_proc where oid = to_regprocedure('public.fn_exam_course_launch_set(uuid, uuid, text, jsonb, uuid, text)')) secdef`);
      const stuCall = await as('authenticated', STU, `select public.fn_exam_course_launch_set($1, null, 'LIVE', '{"total":1,"en":1}', null, 'x@example.test')`, [exam.id]);
      const anonCall = await as('anon', ANON, `select public.fn_exam_course_launch_set($1, null, 'LIVE', '{"total":1,"en":1}', null, 'x@example.test')`, [exam.id]);
      const live = await set('LIVE');
      const anonRow = await as('anon', ANON, `select status from public.exam_course_launches where exam_id = $1`, [exam.id]);
      const anonCov = await as('anon', ANON, `select coverage from public.exam_course_launches`);
      chk('A-1 no access_mode column, no gating function, no 7-argument launch function; the 6-argument one is INVOKER and a student / anon cannot call it (42501); it returns no mode; anon reads status, never the coverage (42501)',
        !shape.old7 && !shape.gated && !shape.col && shape.secdef === false && !stuCall.ok && stuCall.code === '42501' && !anonCall.ok && anonCall.code === '42501'
        && live.ok && live.rows[0].r.status === 'LIVE' && !('access_mode' in live.rows[0].r)
        && anonRow.ok && anonRow.rows[0]?.status === 'LIVE' && !anonCov.ok && anonCov.code === '42501',
        JSON.stringify({ shape, stuCall: stuCall.code, anonCall: anonCall.code, live: live.ok ? live.rows[0].r : live.msg, anonRow, anonCov: anonCov.code }));
    });

    // ---------------- B: launch / pause, audited without a mode
    await chunk(async () => {
      await migrate();
      await course();
      const docs = await outlineDocs();
      const n = docs.length;
      const liveBefore = await count('fn_live_course_document_ids', docs);
      const noCov = await set('LIVE', null);
      const live = await set('LIVE');
      const liveDocs = await count('fn_live_course_document_ids', docs);
      const again = await set('LIVE');
      const paused = await set('PAUSED');
      const pausedDocs = await count('fn_live_course_document_ids', docs);
      const pausedAgain = await set('PAUSED');
      const relaunch = await set('LIVE');
      const audit = (await q(`select action_type a, (new_value ? 'access_mode') or coalesce(old_value ? 'access_mode', false) m from public.admin_audit_logs where actor_email = $1 and action_type like 'EXAM_COURSE_%'`, [ACTOR]));
      const kinds = audit.map((r) => r.a).sort();
      chk(`B-1 launch → the course's ${n} lesson(s) live (0 before); a launch without coverage refused; LIVE again refused ("already LIVE"); pause → 0 live; pause again refused; relaunch ok; audited LAUNCH / PAUSE / LAUNCH, never with a mode`,
        n === 1 && liveBefore === 0 && !noCov.ok && /coverage snapshot is required/.test(noCov.msg) && live.ok && liveDocs === n
        && !again.ok && /already LIVE/.test(again.msg) && paused.ok && pausedDocs === 0 && !pausedAgain.ok && relaunch.ok
        // one transaction = one now(): compare the audit rows as a set, not by order
        && JSON.stringify(kinds) === JSON.stringify(['EXAM_COURSE_LAUNCH', 'EXAM_COURSE_LAUNCH', 'EXAM_COURSE_PAUSE']) && audit.every((r) => !r.m),
        JSON.stringify({ n, liveBefore, noCov: noCov.msg, live: live.ok || live.msg, liveDocs, again: again.msg, paused: paused.ok || paused.msg, pausedDocs, pausedAgain: pausedAgain.msg, relaunch: relaunch.ok || relaunch.msg, audit }));
    });

    const [z] = await q(`select (select count(*)::int from public.admin_audit_logs where actor_email = $1) audit,
        (select count(*)::int from public.exam_course_launches where changed_by_email = $1 or launched_by_email = $1) launches,
        (select count(*)::int from public.pro_plan_versions where active) plans`, [ACTOR]);
    chk(`Z-1 nothing persisted: 0 audit rows / launches; the Pro plans untouched (${z.plans} active)`, z.audit === 0 && z.launches === 0 && z.plans === plansBefore, JSON.stringify(z));
    flush();
  } catch (e) {
    ok = false;
    flush();
    console.log(`FAIL LAUNCH-MODE-1 smoke aborted — ${red(String(e.message)).slice(0, 300)}`);
  } finally {
    await c.end().catch(() => {});
  }
  console.log(ok ? 'LAUNCH-MODE-1: ALL PASS' : 'LAUNCH-MODE-1: FAILURES');
  process.exit(ok ? 0 : 1);
})();
