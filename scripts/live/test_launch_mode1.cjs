#!/usr/bin/env node
/**
 * LAUNCH-MODE-1 (migration 123) — AS THE REAL ROLES, every write inside a rolled-back transaction (withLiveTransaction →
 * safeBegin: LIVE-LOCK-SAFETY; one connection per chunk; a dropped connection re-runs the chunk once).
 *   --pre   123 is NOT applied: each chunk first runs the migration inside its own transaction (then rolls back)
 *   (none)  after apply: refuses unless 123 is APPLIED
 * Chunks: A shape (default FREE_ALL; anon reads access_mode, never coverage; the 122 signature is gone; clients cannot
 *   call) · B FREE_ALL launch gates nothing (fn_gated_course_document_ids empty, fn_live_course_document_ids = the course)
 *   · C FREE_N refused while no Pro plan is active; with one: FREE_N gates the course; a mode change of a LIVE course is
 *   EXAM_COURSE_MODE; the same mode twice refused; a pause keeps the mode · Z nothing left.
 * GATE-SCOPE-SWEEP (2026-10-29): the course is the QA exam's, built in each chunk (its own topic + published node lesson +
 * published QA syllabus, scripts/live/_qa-course.cjs) — never real SSC CGL; gated / live counts are taken over THAT
 * course's documents only, and the Pro plan count is compared with its value at the start (the owner launches courses
 * and edits plans).
 * Run: node scripts/live/test_launch_mode1.cjs [--pre]
 */
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
const { qaTopic, publishNodeLesson, publishQaSyllabus } = require(path.join(ROOT, 'scripts/live/_qa-course.cjs'));

const PRE = process.argv.includes('--pre');
const FILE = '20261028000123_launch_mode_1.sql';
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
    const set = (status, mode, cov = COV) => svc(`select public.fn_exam_course_launch_set($1, null, $2, $3, $4, null, $5) r`, [exam.id, status, mode, cov, ACTOR]);
    // counted over the fixture course's documents only (other courses may be launched by the owner)
    const count = async (fn, docs) => (await as('anon', ANON, `select count(*)::int n from public.${fn}() g(id) where g.id = any($1::uuid[])`, [docs])).rows?.[0]?.n;
    const course = async () => {
      const t = await qaTopic(q, qaLesson.topic_id, 'lm1-smoke-topic', 'LM1 Smoke Topic');
      await publishNodeLesson(svc, t, lessonExample(t), ACTOR);
      await publishQaSyllabus(q, exam.id, [t], 'lm1-smoke');
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

    // ---------------- A: shape + grants
    await chunk(async () => {
      await migrate();
      await course(); // a launch needs a published syllabus
      const [old] = await q(`select to_regprocedure('public.fn_exam_course_launch_set(uuid, uuid, text, jsonb, uuid, text)') IS NOT NULL o`);
      const stuCall = await as('authenticated', STU, `select public.fn_exam_course_launch_set($1, null, 'LIVE', 'FREE_ALL', '{"total":1,"en":1}', null, 'x@example.test')`, [exam.id]);
      const badMode = await set('LIVE', 'FREE_SOME');
      const live = await set('LIVE', 'FREE_ALL');
      const anonMode = await as('anon', ANON, `select status, access_mode from public.exam_course_launches where exam_id = $1`, [exam.id]);
      const anonCov = await as('anon', ANON, `select coverage from public.exam_course_launches`);
      chk('A-1 the 122 signature is gone; a student cannot call (42501); an unknown mode is refused; anon reads status + access_mode (FREE_ALL), never the coverage (42501)',
        !old.o && !stuCall.ok && stuCall.code === '42501' && !badMode.ok && live.ok && live.rows[0].r.access_mode === 'FREE_ALL'
        && anonMode.ok && anonMode.rows[0]?.access_mode === 'FREE_ALL' && !anonCov.ok && anonCov.code === '42501',
        JSON.stringify({ old: old.o, stuCall: stuCall.code, badMode: badMode.msg, live: live.ok || live.msg, anonMode, anonCov: anonCov.code }));
    });

    // ---------------- B: FREE_ALL gates nothing
    await chunk(async () => {
      await migrate();
      await course();
      const docs = await outlineDocs();
      const n = docs.length;
      const liveBefore = await count('fn_live_course_document_ids', docs);
      const live = await set('LIVE', 'FREE_ALL');
      const gated = await count('fn_gated_course_document_ids', docs);
      const liveDocs = await count('fn_live_course_document_ids', docs);
      chk(`B-1 a FREE_ALL launch gates nothing (gated = 0) while the course is LIVE (live lessons = the outline's ${n}; 0 before the launch)`, live.ok && n === 1 && liveBefore === 0 && gated === 0 && liveDocs === n, JSON.stringify({ live: live.ok || live.msg, gated, liveBefore, liveDocs, n }));
    });

    // ---------------- C: FREE_N needs an active plan; mode changes; pause keeps the mode
    await chunk(async () => {
      await migrate();
      await course();
      const docs = await outlineDocs();
      const n = docs.length;
      await q(`update public.pro_plan_versions set active = false where active`); // rolled back with the chunk
      const noPlan = await set('LIVE', 'FREE_N');
      const liveAll = await set('LIVE', 'FREE_ALL');
      const toN = await set('LIVE', 'FREE_N');
      await q(`update public.pro_plan_versions set active = true where plan_code = (select min(plan_code) from public.pro_plan_versions)`);
      const toN2 = await set('LIVE', 'FREE_N');
      const gated = await count('fn_gated_course_document_ids', docs);
      const same = await set('LIVE', 'FREE_N');
      const paused = await set('PAUSED', 'FREE_ALL');
      const [row] = await q(`select status, access_mode from public.exam_course_launches where exam_id = $1`, [exam.id]);
      const gatedPaused = await count('fn_gated_course_document_ids', docs);
      const audit = (await q(`select action_type a, new_value ->> 'access_mode' m from public.admin_audit_logs where actor_email = $1 and action_type like 'EXAM_COURSE_%' order by created_at, id`, [ACTOR])).map((r) => `${r.a}:${r.m}`);
      chk(`C-1 FREE_N refused while no Pro plan is active (launch and mode change); with one: LIVE FREE_ALL → FREE_N is EXAM_COURSE_MODE and gates the course (${n}); the same mode twice refused; a pause keeps FREE_N and gates nothing; audited`,
        !noPlan.ok && /FREE_N needs payments/.test(noPlan.msg) && liveAll.ok && !toN.ok && /no Pro plan is active/.test(toN.msg) && toN2.ok && n === 1 && gated === n && !same.ok
        && paused.ok && row.status === 'PAUSED' && row.access_mode === 'FREE_N' && gatedPaused === 0
        // one transaction = one now(): compare the audit rows as a set, not by order
        && JSON.stringify([...audit].sort()) === JSON.stringify(['EXAM_COURSE_LAUNCH:FREE_ALL', 'EXAM_COURSE_MODE:FREE_N', 'EXAM_COURSE_PAUSE:FREE_N']),
        JSON.stringify({ noPlan: noPlan.msg, liveAll: liveAll.ok, toN: toN.msg, toN2: toN2.ok || toN2.msg, gated, n, same: same.msg, paused: paused.ok, row, gatedPaused, audit }));
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
