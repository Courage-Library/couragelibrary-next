#!/usr/bin/env node
/**
 * SYLLABUS-PUBLISH-IMPACT — the real computePublishImpact (lib/syllabus/publish-impact.ts) on the gate's OWN fixtures.
 * GATE-SCOPE-SWEEP (2026-10-29): it no longer measures the owner's real drafts (they come and go, and their content changes
 * while the gate runs). Inside ONE rolled-back transaction (withLiveTransaction; nothing is committed) it builds QA topics
 * (one with a published QA question, one with a published node lesson, one with QA-student progress, one empty), a
 * PUBLISHED QA-exam version A (all tiers) over all four, a PUBLISHED other-tier version T, and two DRAFTs:
 * B1 (all tiers) that drops only the EMPTY topic, B2 (tier-y) that drops the three topics with content. The impact reads
 * through the same connection (scripts/live/_pg-supabase.cjs), so it sees exactly these fixtures.
 *   I-1 the version students see now = the read model's pick (fn_exam_syllabus_read_model, anonymous) for that exam
 *   I-2 a PUBLISHED version of the same exam + cycle with ANOTHER tier is listed in otherPublished (publish does not
 *       archive it); when it is tier NULL ("all tiers") it is marked shownToStudents (the read model keeps picking it)
 *   I-3 topic arithmetic: removed ∩ added = ∅; topics = |new version's distinct rolled-up topics| (= validate counts.topics)
 *   I-4 removed topics carry their real counts (published lessons / questions / progress, checked with SQL)
 *   I-5 needsTypedConfirm ⇔ some removed topic has lessons, questions or progress
 * Run: node scripts/live/test_publish_impact.cjs
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');
const ROOT = path.resolve(__dirname, '..', '..');
const { Client } = require('pg');
const { dbTarget, redactor } = require(path.join(ROOT, 'scripts/db/_db-env.cjs'));
const { withLiveTransaction } = require(path.join(ROOT, 'scripts/db/live-safety.cjs'));
const { pgSupabase } = require(path.join(ROOT, 'scripts/live/_pg-supabase.cjs'));
const { qaTopic, publishNodeLesson, publishQaSyllabus, publishQaQuestion } = require(path.join(ROOT, 'scripts/live/_qa-course.cjs'));
const ACTOR = 'pi-smoke@courage-library.test';

const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request.startsWith('@/')) return origResolve.call(this, path.resolve(ROOT, request.slice(2)), parent, isMain, options);
  return origResolve.call(this, request, parent, isMain, options);
};
const origLoad = Module._load;
// the module's server-only guard and its default (cookie-bound) client are not used here: the gate passes its own client
Module._load = function (request, parent, isMain) {
  if (request === 'server-only') return {};
  if (request === '@/lib/supabase/server') return { createAdminServerSupabaseClient: () => { throw new Error('not used in the gate'); } };
  return origLoad.call(this, request, parent, isMain);
};
require.extensions['.ts'] = (module, filename) => {
  const out = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } });
  module._compile(out.outputText, filename);
};
const { computePublishImpact } = require(path.join(ROOT, 'lib/syllabus/publish-impact.ts'));
const { needsTypedConfirm } = require(path.join(ROOT, 'lib/syllabus/editor-assist.ts'));
const { lessonExample } = require(path.join(ROOT, 'lib/prompts/lesson-prompt.ts'));

let ok = true;
const chk = (n, cond, info) => { if (!cond) ok = false; console.log(`${cond ? 'PASS' : 'FAIL'} ${n}${cond ? '' : ' — ' + (info ?? '')}`); };

(async () => {
  const target = dbTarget();
  const red = redactor(target);
  const c = new Client(target.pg); c.on('error', () => {}); await c.connect();
  try {
    await withLiveTransaction(c, async () => {
      const q = async (sql, p) => (await c.query(sql, p)).rows;
      const lit = (o) => `'${JSON.stringify(o).replace(/'/g, "''")}'`;
      const as = async (role, cl, sql, p) => {
        await c.query('savepoint s'); await c.query(`set local role ${role}`); await c.query(`select set_config('request.jwt.claims', ${lit(cl)}, true)`);
        try { const r = (await c.query(sql, p)).rows; await c.query('reset role'); await c.query('release savepoint s'); return { ok: true, rows: r }; }
        catch (e) { await c.query('rollback to savepoint s'); return { ok: false, code: e.code, msg: String(e.message).slice(0, 240) }; }
      };
      const svc = (sql, p) => as('service_role', { role: 'service_role' }, sql, p);
      const [qa] = await q(`select id from public.exams where slug = 'qa-syllabus-test'`);
      const [qaLesson] = await q(`select u.topic_id from public.learning_documents d join public.learning_units u on u.id = d.learning_unit_id where d.canonical_slug = 'qa-number-system-concept-lesson'`);
      const [stu] = await q(`select id from auth.users where email = 'qa-student@courage-library.test'`);
      const [adm] = await q(`select id from auth.users where email = 'qa-admin@courage-library.test'`);
      if (!qa || !qaLesson || !stu || !adm) throw new Error('the QA exam / QA lesson topic / QA identities missing');
      // fixtures (all rolled back with the transaction)
      const tQ = await qaTopic(q, qaLesson.topic_id, 'pi-smoke-questions', 'PI Smoke Questions');
      await publishQaQuestion(q, tQ, adm.id, 'PISMOKE');
      const tL = await qaTopic(q, qaLesson.topic_id, 'pi-smoke-lesson', 'PI Smoke Lesson');
      const doc = await publishNodeLesson(svc, tL, lessonExample(tL), ACTOR);
      const tP = await qaTopic(q, qaLesson.topic_id, 'pi-smoke-progress', 'PI Smoke Progress');
      await q(`insert into public.user_lesson_progress (user_id, document_id, language, node_id, status) values ($1, $2, 'en', $3, 'READING')`, [stu.id, doc, tP]);
      const tE = await qaTopic(q, qaLesson.topic_id, 'pi-smoke-empty', 'PI Smoke Empty');
      const A = await publishQaSyllabus(q, qa.id, [tQ, tL, tP, tE], 'pi-smoke-a');
      const T = await publishQaSyllabus(q, qa.id, [tE], 'pi-smoke-t', { tier: 'tier-x' });
      const B1 = await publishQaSyllabus(q, qa.id, [tQ, tL, tP], 'pi-smoke-b1', { draft: true });
      const B2 = await publishQaSyllabus(q, qa.id, [tE], 'pi-smoke-b2', { tier: 'tier-y', draft: true });
      const db = pgSupabase(c);
      const cases = [
        { tag: 'B1 (all tiers, drops only the empty topic)', id: B1, tier: null, removed: [tE], confirm: false },
        { tag: 'B2 (tier-y, drops the three topics with content)', id: B2, tier: 'tier-y', removed: [tQ, tL, tP], confirm: true },
      ];
      for (const d of cases) {
        const impact = await computePublishImpact(d.id, db);
        if (!impact) { chk(`${d.tag}: impact computed`, false, 'null'); continue; }
        const rm = await as('anon', { role: 'anon' }, `select public.fn_exam_syllabus_read_model($1, null) r`, [qa.id]);
        const shown = rm.ok && rm.rows[0].r.version ? rm.rows[0].r.version.id : null;
        chk(`I-1 ${d.tag}: "students now see" = the read model's version (A, the all-tiers one)`,
          (impact.current ? impact.current.id : null) === shown && shown === A, JSON.stringify({ impact: impact.current && impact.current.id, shown, A }));
        const others = await q(`select id, tier from public.exam_syllabus_versions where exam_id = $1 and exam_cycle_id is null and status = 'PUBLISHED' and is_active and tier is distinct from $2`, [qa.id, d.tier]);
        chk(`I-2 ${d.tag}: other-tier published versions listed (${others.length}); an all-tiers one stays what students see`,
          others.length === impact.otherPublished.length && others.length === (d.tier === null ? 1 : 2)
          && others.every((o) => impact.otherPublished.some((x) => x.id === o.id && (o.tier !== null || d.tier === null || x.shownToStudents))),
          JSON.stringify({ others, listed: impact.otherPublished, T }));
        const [val] = await q(`select (public.fn_syllabus__validate($1)->'counts'->>'topics')::int n`, [d.id]);
        chk(`I-3 ${d.tag}: ${impact.topics} topics (= validate), +${impact.topicsAdded.length} −${impact.topicsRemoved.length}, no topic both added and removed`,
          impact.topics === val.n && !impact.topicsAdded.some((a) => impact.topicsRemoved.some((r) => r.id === a.id)), JSON.stringify({ topics: impact.topics, validate: val.n }));
        const bad = [];
        for (const t of impact.topicsRemoved) {
          const [r] = await q(`with recursive sub as (select id from public.canonical_taxonomy_nodes where id = $1 union all select n.id from public.canonical_taxonomy_nodes n join sub on n.parent_id = sub.id)
              select (select count(*)::int from public.learning_documents d where d.node_id in (select id from sub) and d.status = 'PUBLISHED') l,
                     (select count(*)::int from public.questions x where x.canonical_topic_id = $1 and x.status = 'published') qn,
                     (select count(*)::int from public.user_lesson_progress p where p.node_id in (select id from sub)) pr`, [t.id]);
          if (r.l !== t.publishedLessons || r.qn !== t.publishedQuestions || r.pr !== t.progressRows) bad.push(`${t.name}: ${JSON.stringify(r)} vs ${JSON.stringify(t)}`);
        }
        const sameSet = JSON.stringify(impact.topicsRemoved.map((t) => t.id).sort()) === JSON.stringify([...d.removed].sort());
        chk(`I-4 ${d.tag}: exactly the expected topics are removed, their lessons / questions / progress match SQL (${impact.topicsRemoved.map((t) => t.name).join(', ') || 'none removed'})`,
          sameSet && bad.length === 0, bad.join(' | ') || JSON.stringify(impact.topicsRemoved));
        const expect = impact.topicsRemoved.some((t) => t.publishedLessons || t.publishedQuestions || t.progressRows);
        chk(`I-5 ${d.tag}: typed confirmation required = ${d.confirm}`, expect === d.confirm && needsTypedConfirm(impact) === d.confirm, JSON.stringify(impact.topicsRemoved));
      }
    });
  } catch (e) {
    ok = false;
    console.log(`FAIL suite error — ${red(String(e && e.message ? e.message : e)).slice(0, 400)}`);
  } finally {
    await c.end().catch(() => {});
  }
  console.log(ok ? 'PUBLISH-IMPACT live: all checks passed' : 'PUBLISH-IMPACT live: FAILED');
  process.exit(ok ? 0 : 1);
})();
