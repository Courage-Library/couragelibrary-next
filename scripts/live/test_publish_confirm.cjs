#!/usr/bin/env node
/**
 * PUBLISH-CONFIRM-SERVER (migration 125) — AS THE REAL ROLES (QA admin / QA staff JWT claims), every write inside a
 * rolled-back transaction (withLiveTransaction → safeBegin; one connection per chunk; a dropped connection re-runs the
 * chunk once). Fixtures: syllabus versions of the QA test exam only. GATE-SCOPE-SWEEP (2026-10-29): the topics are the
 * chunk's OWN (scripts/live/_qa-course.cjs): one with a published QA question, one with a published node lesson, two
 * empty — never real topics picked by content state (the owner fills real topics with content).
 *   --pre   125 is NOT applied: each chunk first runs the migration inside its own transaction (then rolls back)
 *   (none)  after apply: refuses unless 125 is APPLIED
 *   A  catalog: one fn_syllabus_publish (uuid, text), SECURITY DEFINER, search_path '', EXECUTE authenticated only;
 *      the SECURITY DEFINER count is unchanged by 125
 *   B  a published QA version maps a topic with published QUESTIONS; a draft without it → CONFIRM_REQUIRED (the topic
 *      and its count listed), NOTHING written (the old version still PUBLISHED, the draft still DRAFT, no audit row);
 *      a wrong phrase → refused; "PUBLISH v<n>" → published, the old one archived, the audit row lists the removal
 *   C  the same for a topic with a published LESSON (node lesson on the topic or below) and for student PROGRESS
 *   D  no confirmation needed: nothing removed; or only a topic WITHOUT content removed
 *   E  any tier: a published version of another tier in the same cycle counts too (the stricter rule)
 *   F  staff cannot publish (42501); one-argument calls still work
 *   Z  nothing left behind
 * Run: node scripts/live/test_publish_confirm.cjs [--pre]
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
const { qaTopic, publishNodeLesson, publishQaQuestion } = require(path.join(ROOT, 'scripts/live/_qa-course.cjs'));
const ACTOR = 'pc-smoke@courage-library.test';

const PRE = process.argv.includes('--pre');
const FILE = '20261029000125_publish_confirm_server.sql';
const MIGRATION_SQL = fs.readFileSync(path.join(ROOT, 'supabase/migrations', FILE), 'utf8');
let ok = true;
let pending = [];
const chk = (n, cond, info) => { pending.push({ cond, line: `${cond ? 'PASS' : 'FAIL'} ${n}${cond ? '' : ' — ' + (info ?? '')}` }); };
const flush = () => { for (const r of pending) { if (!r.cond) ok = false; console.log(r.line); } pending = []; };
const isConnectionError = (e) => !!e && (['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EPIPE', 'ECONNREFUSED'].includes(e.code) || /Connection terminated|connection error|not queryable/i.test(String(e.message)));

(async () => {
  const target = dbTarget();
  const red = redactor(target);
  let c = new Client(target.pg); c.on('error', () => {}); await c.connect();
  const q = async (s, p) => (await c.query(s, p)).rows;
  try {
    const [led] = await q(`select count(*)::int n from public.schema_migration_ledger where filename = $1 and status = 'APPLIED'`, [FILE]);
    if (PRE && led.n > 0) throw new Error(`--pre refused: ${FILE} is already APPLIED`);
    if (!PRE && led.n === 0) throw new Error(`${FILE} is not applied (use --pre for the pre-apply smoke)`);
    const [qa] = await q(`select id from public.exams where slug = 'qa-syllabus-test'`);
    const ids = Object.fromEntries((await q(`select email, id from auth.users where email in ('qa-admin@courage-library.test','qa-staff@courage-library.test','qa-student@courage-library.test')`)).map((r) => [r.email.split('@')[0], r.id]));
    const ADMIN = { sub: ids['qa-admin'], role: 'authenticated', email: 'qa-admin@courage-library.test', app_metadata: { role: 'admin' } };
    const STAFF = { sub: ids['qa-staff'], role: 'authenticated', email: 'qa-staff@courage-library.test', app_metadata: { role: 'staff' } };
    const [qaLesson] = await q(`select u.topic_id from public.learning_documents d join public.learning_units u on u.id = d.learning_unit_id where d.canonical_slug = 'qa-number-system-concept-lesson'`);
    if (!qaLesson || !qa || !ADMIN.sub || !STAFF.sub) throw new Error('fixtures missing (the QA lesson topic, QA exam, QA identities)');
    // the chunk's own topics (built inside each chunk's rolled-back transaction by fx())
    let withQ;
    let withL;
    let E1;
    let E2;

    const lit = (o) => `'${JSON.stringify(o).replace(/'/g, "''")}'`;
    const as = async (role, cl, sql, p) => {
      await c.query('savepoint s'); await c.query(`set local role ${role}`); await c.query(`select set_config('request.jwt.claims', ${lit(cl)}, true)`);
      try { const r = (await c.query(sql, p)).rows; await c.query('reset role'); await c.query('release savepoint s'); return { ok: true, rows: r }; }
      catch (e) { await c.query('rollback to savepoint s'); return { ok: false, code: e.code, msg: String(e.message).slice(0, 240) }; }
    };
    const rpc = async (cl, fn, args) => {
      const r = await as('authenticated', cl, `select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) r`, args);
      if (!r.ok) throw new Error(`${fn}: ${r.msg}`);
      return r.rows[0].r;
    };
    const chunk = async (fn) => {
      for (let attempt = 1; ; attempt++) {
        pending = [];
        try {
          await c.end().catch(() => {});
          c = new Client(target.pg); c.on('error', () => {}); await c.connect();
          await withLiveTransaction(c, async () => { if (PRE) await c.query(MIGRATION_SQL); await fx(); await fn(); });
          flush();
          return;
        } catch (e) {
          if (attempt === 1 && isConnectionError(e)) { console.log(`RETRY chunk after a dropped connection (${e.code || 'terminated'})`); continue; }
          throw e;
        }
      }
    };
    /** a valid QA draft: one SECTION + one UNIT mapped to the given topics; returns { id, n } */
    const draft = async (topics, tier = null) => {
      const d = await rpc(ADMIN, 'fn_syllabus_create_draft', [qa.id, null, null, null]);
      if (tier) await c.query(`update public.exam_syllabus_versions set tier = $2 where id = $1`, [d.version_id, tier]);
      const sec = (await rpc(ADMIN, 'fn_syllabus_upsert_node', [d.version_id, { kind: 'SECTION', title: 'PC section' }])).node_id;
      const unit = (await rpc(ADMIN, 'fn_syllabus_upsert_node', [d.version_id, { kind: 'UNIT', title: 'PC unit', parent_id: sec }])).node_id;
      await rpc(ADMIN, 'fn_syllabus_set_unit_mappings', [unit, topics, null]);
      return { id: d.version_id, n: d.version_number };
    };
    const fx = async () => {
      const mk = async (slug, name) => ({ id: await qaTopic(q, qaLesson.topic_id, slug, name), name });
      withQ = await mk('pc-smoke-questions', 'PC Smoke Questions');
      await publishQaQuestion(q, withQ.id, ids['qa-admin'], 'PCSMOKE');
      withL = await mk('pc-smoke-lesson', 'PC Smoke Lesson');
      withL.doc = await publishNodeLesson(svc, withL.id, lessonExample(withL.id), ACTOR);
      E1 = await mk('pc-smoke-empty-1', 'PC Smoke Empty 1');
      E2 = await mk('pc-smoke-empty-2', 'PC Smoke Empty 2');
    };
    const svc = (sql, p) => as('service_role', { role: 'service_role' }, sql, p);
    const pub = (v, confirm) => rpc(ADMIN, 'fn_syllabus_publish', confirm === undefined ? [v.id] : [v.id, confirm]);
    const status = async (v) => (await q(`select status from public.exam_syllabus_versions where id = $1`, [v.id]))[0].status;
    const pubAudits = async () => (await q(`select count(*)::int n from public.admin_audit_logs where action_type = 'SYLLABUS_PUBLISH' and actor_id = $1`, [ADMIN.sub]))[0].n;

    // ---------------- A catalog
    await chunk(async () => {
      const fns = await q(`select pg_get_function_identity_arguments(p.oid) a, p.prosecdef d, p.proconfig cfg,
          has_function_privilege('anon', p.oid, 'EXECUTE') anon, has_function_privilege('authenticated', p.oid, 'EXECUTE') auth
          from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'fn_syllabus_publish'`);
      const [n] = await q(`select count(*)::int n from pg_proc where pronamespace = 'public'::regnamespace and prosecdef`);
      chk(`A-1 one fn_syllabus_publish(uuid, text): SECURITY DEFINER, search_path '', EXECUTE authenticated only; ${n.n} SECURITY DEFINER functions (unchanged: 116)`,
        fns.length === 1 && fns[0].a === 'p_version_id uuid, p_confirm text' && fns[0].d && JSON.stringify(fns[0].cfg) === '["search_path=\\"\\""]' && !fns[0].anon && fns[0].auth && n.n === 116,
        JSON.stringify({ fns, n }));
    });

    // ---------------- B questions
    await chunk(async () => {
      const A = await draft([withQ.id, E1.id]);
      const a = await pub(A);
      const B = await draft([E1.id]);
      const a0 = await pubAudits();
      const no = await pub(B);
      const wrong = await pub(B, 'PUBLISH v0');
      const unchanged = (await status(A)) === 'PUBLISHED' && (await status(B)) === 'DRAFT' && (await pubAudits()) === a0;
      chk(`B-1 a removed topic with published questions (${withQ.name}) → CONFIRM_REQUIRED with the topic + count; a wrong phrase too; nothing written, nothing audited`,
        a.success && no.success === false && no.code === 'CONFIRM_REQUIRED' && no.confirm === `PUBLISH v${B.n}` && no.removed.length === 1 && no.removed[0].topic_id === withQ.id && no.removed[0].questions > 0
        && wrong.success === false && wrong.code === 'CONFIRM_REQUIRED' && unchanged, JSON.stringify({ no, wrong, unchanged }));
      const yes = await pub(B, `PUBLISH v${B.n}`);
      const [aud] = await q(`select new_value v from public.admin_audit_logs where action_type = 'SYLLABUS_PUBLISH' and target_id = $1::text`, [B.id]);
      chk('B-2 with "PUBLISH v<n>" it publishes, the previous version is archived, and the audit row records the confirmed removal',
        yes.success && yes.archived_previous_version_id === A.id && (await status(A)) === 'ARCHIVED' && (await status(B)) === 'PUBLISHED'
        && aud && aud.v.confirmed_removals && aud.v.confirmed_removals[0].topic_id === withQ.id, JSON.stringify({ yes, aud }));
    });

    // ---------------- C lesson + progress
    await chunk(async () => {
      const A = await draft([withL.id, E1.id]);
      await pub(A);
      const B = await draft([E1.id]);
      const no = await pub(B);
      chk(`C-1 a removed topic with a published lesson (${withL.name}) → CONFIRM_REQUIRED (lessons counted)`,
        no.code === 'CONFIRM_REQUIRED' && no.removed.some((r) => r.topic_id === withL.id && r.lessons > 0), JSON.stringify(no));
    });
    await chunk(async () => {
      // student progress on an otherwise empty topic: a QA-student progress row on a node below it (rolled back)
      const doc = { id: withL.doc };
      const ins = await as('postgres', {}, `insert into public.user_lesson_progress (user_id, document_id, language, node_id, status) values ($1, $2, 'en', $3, 'READING') returning user_id`, [ids['qa-student'], doc.id, E2.id]);
      const A = await draft([E2.id, E1.id]);
      await pub(A);
      const B = await draft([E1.id]);
      const no = await pub(B);
      chk(`C-2 a removed topic with student lesson progress (${E2.name}) → CONFIRM_REQUIRED (progress counted)`,
        ins.ok && no.code === 'CONFIRM_REQUIRED' && no.removed.some((r) => r.topic_id === E2.id && r.progress === 1), JSON.stringify({ ins, no }));
    });

    // ---------------- D no confirmation needed
    await chunk(async () => {
      const A = await draft([withQ.id, E1.id]);
      await pub(A);
      const same = await draft([withQ.id, E1.id, E2.id]);
      const r1 = await pub(same);
      const B = await draft([withQ.id]);
      const r2 = await pub(B);
      chk('D-1 no confirmation when nothing is removed, or when the only removed topic has no lessons, questions or progress',
        r1.success && r2.success, JSON.stringify({ r1, r2 }));
    });

    // ---------------- E other tier (stricter: any published version of the same exam + cycle)
    await chunk(async () => {
      const T = await draft([withQ.id], 'tier-x');
      await pub(T);
      const N = await draft([E1.id]);
      const no = await pub(N);
      chk('E-1 a published version of ANOTHER tier in the same cycle counts too → CONFIRM_REQUIRED', no.code === 'CONFIRM_REQUIRED' && no.removed[0].topic_id === withQ.id, JSON.stringify(no));
    });

    // ---------------- F roles + compatibility
    await chunk(async () => {
      const A = await draft([E1.id]);
      const staff = await as('authenticated', STAFF, `select public.fn_syllabus_publish($1, null) r`, [A.id]);
      const anon = await as('anon', { role: 'anon' }, `select public.fn_syllabus_publish($1) r`, [A.id]);
      const one = await as('authenticated', ADMIN, `select public.fn_syllabus_publish($1) r`, [A.id]);
      chk('F-1 staff refused (42501), anon has no EXECUTE (42501); the one-argument call still works (admin)',
        !staff.ok && staff.code === '42501' && !anon.ok && anon.code === '42501' && one.ok && one.rows[0].r.success, JSON.stringify({ staff, anon: anon.code, one: one.ok }));
    });

    // ---------------- Z
    pending = [];
    const [z] = await q(`select count(*)::int n from public.exam_syllabus_versions where exam_id = $1 and status = 'PUBLISHED'`, [qa.id]);
    const [p] = await q(`select count(*)::int n from public.user_lesson_progress where user_id = $1`, [ids['qa-student']]);
    chk('Z nothing left behind (no QA version published, no QA-student progress row)', z.n === 0 && p.n === 0, JSON.stringify({ z, p }));
    flush();
  } catch (e) {
    ok = false;
    console.log(`FAIL suite error — ${red(String(e && e.message ? e.message : e)).slice(0, 400)}`);
  } finally {
    await c.end().catch(() => {});
  }
  console.log(ok ? 'PUBLISH-CONFIRM live: all checks passed' : 'PUBLISH-CONFIRM live: FAILED');
  process.exit(ok ? 0 : 1);
})();
