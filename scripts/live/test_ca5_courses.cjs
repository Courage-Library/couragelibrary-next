#!/usr/bin/env node
/**
 * CA5-COURSES (CA-5, migration 120) — generated exam courses, master-chapter positions, node-lesson counts and lesson
 * progress AS THE REAL ROLES, every write inside a rolled-back transaction (withLiveTransaction → safeBegin:
 * LIVE-LOCK-SAFETY + rollback on stop; one connection per chunk; a dropped connection re-runs the whole chunk once,
 * assertions are never retried). QA fixtures only (the QA topic of qa-number-system-concept-lesson; smoke nodes under it).
 *   --pre   120 is NOT applied: each chunk first runs the migration inside its own transaction (then everything rolls back).
 *   (none)  the live gate after apply: refuses unless 120 is APPLIED.
 * Chunks: A structure / grants / existing rows untouched · B master positions + read-model counts + the course outline
 * (anon = service) · C progress: own rows only, auth.uid(), COMPLETED never downgraded, no direct writes · Z nothing left.
 * Run: node scripts/live/test_ca5_courses.cjs [--pre]
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');
const ROOT = path.resolve(__dirname, '..', '..');
const { Client } = require('pg');
const { dbTarget, redactor } = require(path.join(ROOT, 'scripts/db/_db-env.cjs'));
const { withLiveTransaction } = require(path.join(ROOT, 'scripts/db/live-safety.cjs'));

const PRE = process.argv.includes('--pre');
const FILE = '20261028000120_ca5_courses_progress.sql';
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
const { lessonExample } = require(path.join(ROOT, 'lib/prompts/lesson-prompt.ts'));
const { qaTopic, publishQaSyllabus } = require(path.join(ROOT, 'scripts/live/_qa-course.cjs'));

let ok = true;
let pending = [];
const chk = (n, cond, info) => { pending.push({ cond, line: `${cond ? 'PASS' : 'FAIL'} ${n}${cond ? '' : ' — ' + (info ?? '')}` }); };
const flush = () => { for (const r of pending) { if (!r.cond) ok = false; console.log(r.line); } pending = []; };
const isConnectionError = (e) => !!e && (['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EPIPE', 'ECONNREFUSED'].includes(e.code)
  || /Connection terminated|connection error|not queryable/i.test(String(e.message)));
const ZERO = '00000000-0000-0000-0000-000000000000';
const ACTOR_EMAIL = 'ca5-smoke@courage-library.test';
const EXISTING_HASH = `select
    (select left(md5(coalesce(string_agg(id::text||'|'||status||'|'||coalesce(current_published_version_id::text,'-')||'|'||access_level, ',' order by id), '')), 16) from public.learning_documents) docs,
    (select left(md5(coalesce(string_agg(id::text||'|'||status||'|'||version_number, ',' order by id), '')), 16) from public.exam_syllabus_versions) syllabi,
    (select count(*)::int from public.exam_syllabus_canonical_mappings) maps`;

(async () => {
  const target = dbTarget();
  const red = redactor(target);
  let c = new Client(target.pg); c.on('error', () => {}); await c.connect();
  const q = async (s, p) => (await c.query(s, p)).rows;
  try {
    const [led] = await q(`select count(*)::int n from public.schema_migration_ledger where filename = $1 and status = 'APPLIED'`, [FILE]);
    if (PRE && led.n > 0) throw new Error(`--pre refused: ${FILE} is already APPLIED`);
    if (!PRE && led.n === 0) throw new Error(`${FILE} is not applied (use --pre for the pre-apply smoke)`);
    const ids = {};
    for (const [k, e] of [['admin', 'qa-admin@courage-library.test'], ['staff', 'qa-staff@courage-library.test'], ['student', 'qa-student@courage-library.test']]) ids[k] = (await q(`select id from auth.users where email = $1`, [e]))[0]?.id;
    const [qa] = await q(`select d.id doc_id, u.topic_id from public.learning_documents d join public.learning_units u on u.id = d.learning_unit_id where d.canonical_slug = 'qa-number-system-concept-lesson'`);
    if (!ids.admin || !ids.staff || !ids.student || !qa) throw new Error('QA users / QA lesson missing');
    // Z-1: no progress row written during this smoke survives. Counted by time, not by total — the live-journeys job runs in
    // parallel and its cleanup deletes the QA student's progress (rows may disappear, never appear because of this smoke)
    const [{ t: smokeStart }] = await q(`select now() t`);
    const progressBefore = 0;
    // GATE-SCOPE-SWEEP (2026-10-29): the course is the QA exam's — B publishes its OWN syllabus version mapping its OWN
    // topic (both rolled back), so the owner's real lessons and syllabi never move the positions or the outline
    const [qaExam] = await q(`select id from public.exams where slug = 'qa-syllabus-test'`);
    if (!qaExam) throw new Error('QA exam missing');
    const ex = { exam_id: qaExam.id, exam_cycle_id: null };

    const lit = (o) => `'${JSON.stringify(o).replace(/'/g, "''")}'`;
    const as = async (role, cl, sql, p) => {
      await c.query('savepoint s'); await c.query(`set local role ${role}`); await c.query(`select set_config('request.jwt.claims', ${lit(cl)}, true)`);
      try { const r = (await c.query(sql, p)).rows; await c.query('reset role'); await c.query('release savepoint s'); return { ok: true, rows: r }; }
      catch (e) { await c.query('rollback to savepoint s'); return { ok: false, code: e.code, msg: String(e.message).slice(0, 240) }; }
    };
    const SVC = { role: 'service_role' };
    const ANON = { role: 'anon' };
    const STU = { sub: ids.student, role: 'authenticated', aal: 'aal1', app_metadata: {} };
    const STAFF = { sub: ids.staff, role: 'authenticated', aal: 'aal2', app_metadata: { role: 'staff' } };
    const svc = (sql, p) => as('service_role', SVC, sql, p);
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
          if (attempt === 1 && isConnectionError(e)) { console.log(`RETRY chunk after a dropped connection (${e.code || 'terminated'}) — partial results discarded`); continue; }
          throw e;
        }
      }
    };
    const migrate = async () => { if (PRE) await c.query(MIGRATION_SQL); };

    // QA smoke lessons: the smoke's own topic (scripts/live/_qa-course.cjs) + two subtopics (display order 1, 0) + a concept
    // under the first → published EN
    const seedLessons = async (topic) => {
      const mkNode = async (parent, type, name, order) => (await q(`insert into public.canonical_taxonomy_nodes (parent_id, node_type, name, slug, display_order, is_active, hierarchy_path, metadata)
          select $1, $2, $3, $4, $5, true, p.hierarchy_path || '/' || $4, '{}'::jsonb from public.canonical_taxonomy_nodes p where p.id = $1 returning id`, [parent, type, name, name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), order]))[0].id;
      const subA = await mkNode(topic, 'SUBTOPIC', 'CA5 Smoke Sub A', 1);
      const subB = await mkNode(topic, 'SUBTOPIC', 'CA5 Smoke Sub B', 0);
      const conA = await mkNode(subA, 'CONCEPT', 'CA5 Smoke Concept A', 0);
      const docs = {};
      let created = 0;
      for (const [k, node] of [['topic', topic], ['subA', subA], ['subB', subB], ['conA', conA]]) {
        const d = await svc(`select public.fn_lesson_create_node_document($1, 'FREE', null, $2) r`, [node, ACTOR_EMAIL]);
        if (!d.ok) throw new Error(`node document: ${d.msg}`);
        if (d.rows[0].r.created) created++;
        const ex = lessonExample(node);
        const s = await svc(`select public.fn_lesson_save_draft($1, 'en', $2::jsonb, $3::jsonb, 'AI_ASSISTED', null, $4) r`, [d.rows[0].r.document_id, JSON.stringify(ex.meta), JSON.stringify(ex.blocks), ACTOR_EMAIL]);
        if (!s.ok) throw new Error(`draft: ${s.msg}`);
        const pub = await svc(`select public.fn_lesson_publish($1, null, $2)`, [s.rows[0].r.version_id, ACTOR_EMAIL]);
        if (!pub.ok) throw new Error(`publish: ${pub.msg}`);
        docs[k] = d.rows[0].r.document_id;
      }
      return { docs, created, nodes: { subA, subB, conA } };
    };

    // ---------------- A: structure, grants, existing rows untouched
    await chunk(async () => {
      const before = PRE ? (await q(EXISTING_HASH))[0] : null;
      await migrate();
      const after = (await q(EXISTING_HASH))[0];
      if (PRE) chk('A-0 every existing document, syllabus version and mapping is untouched by 120 (hash before = after)', JSON.stringify(before) === JSON.stringify(after), JSON.stringify({ before, after }));
      const [f] = await q(`select
          (select prosecdef from pg_proc where oid = 'public.fn_servable_node_lessons()'::regprocedure) s1,
          (select prosecdef from pg_proc where oid = 'public.fn_exam_course_outline(uuid, uuid, text)'::regprocedure) s2,
          (select prosecdef from pg_proc where oid = 'public.fn_lesson_progress_save(uuid, text, text, text)'::regprocedure) s3,
          (select proconfig::text from pg_proc where oid = 'public.fn_lesson_progress_save(uuid, text, text, text)'::regprocedure) cfg,
          (select prosecdef from pg_proc where oid = 'public.fn_exam_syllabus_read_model(uuid, uuid)'::regprocedure) rm`);
      chk('A-1 security modes: servable lessons + course outline INVOKER; progress save SECURITY DEFINER with search_path ""; the read model stays DEFINER',
        f.s1 === false && f.s2 === false && f.s3 === true && String(f.cfg).replace(/\\/g, '').includes('search_path=""') && f.rm === true, JSON.stringify(f));
      const anonOutline = await as('anon', ANON, `select public.fn_exam_course_outline($1) r`, [ZERO]);
      const anonSave = await as('anon', ANON, `select public.fn_lesson_progress_save($1, 'en', 'READING')`, [qa.doc_id]);
      const anonRead = await as('anon', ANON, `select count(*) from public.user_lesson_progress`);
      const stuInsert = await as('authenticated', STU, `insert into public.user_lesson_progress (user_id, document_id, language, status) values ($1, $2, 'en', 'COMPLETED')`, [ids.student, qa.doc_id]);
      const stuUpdate = await as('authenticated', STU, `update public.user_lesson_progress set status = 'COMPLETED'`);
      chk('A-2 anon may read the course (NO_SYLLABUS for an unknown exam) but cannot save or read progress (42501); a student cannot write the progress table directly (42501)',
        anonOutline.ok && anonOutline.rows[0].r.state === 'NO_SYLLABUS' && anonSave.code === '42501' && anonRead.code === '42501' && stuInsert.code === '42501' && stuUpdate.code === '42501',
        JSON.stringify({ anonOutline: anonOutline.ok ? anonOutline.rows[0].r.state : anonOutline.msg, anonSave: anonSave.code, anonRead: anonRead.code, stuInsert: stuInsert.code, stuUpdate: stuUpdate.code }));
    });

    // ---------------- B: master positions, read-model counts, the course outline
    await chunk(async () => {
      await migrate();
      const T = await qaTopic(q, qa.topic_id, 'ca5-smoke-topic', 'CA5 Smoke Topic');
      await publishQaSyllabus(q, qaExam.id, [T], 'ca5-smoke');
      const countFor = async () => {
        const r = await as('anon', ANON, `select public.fn_exam_syllabus_read_model($1, $2) r`, [ex.exam_id, ex.exam_cycle_id]);
        const rm = r.ok ? r.rows[0].r : null;
        const t = rm ? rm.nodes.flatMap((n) => n.topics).find((x) => x.topic_id === T) : null;
        return t ? t.servable_documents : null;
      };
      const before = await countFor();
      const { docs, created } = await seedLessons(T);
      const rows = (await as('anon', ANON, `select document_id, node_type, topic_id, chapter_position from public.fn_servable_node_lessons() where topic_id = $1 order by chapter_position`, [T])).rows || [];
      const pos = Object.fromEntries(Object.entries(docs).map(([k, id]) => [k, rows.find((r) => r.document_id === id)?.chapter_position]));
      chk('B-1 master chapter + position (anon): all 4 lessons in the QA topic chapter, in master pre-order — topic 1, Sub B (order 0) 2, Sub A (order 1) 3, its concept 4',
        pos.topic === 1 && pos.subB === 2 && pos.subA === 3 && pos.conA === 4 && rows.every((r) => r.topic_id === T), JSON.stringify({ pos, rows: rows.length }));
      const after = await countFor();
      chk(`B-2 read model: the topic's servable documents include the newly published node lessons (+${created})`,
        before === 0 && created === 4 && after === before + created, JSON.stringify({ before, after, created }));
      {
        const o = (await as('anon', ANON, `select public.fn_exam_course_outline($1, $2, 'en') r`, [ex.exam_id, ex.exam_cycle_id])).rows[0].r;
        const s = (await svc(`select public.fn_exam_course_outline($1, $2, 'en') r`, [ex.exam_id, ex.exam_cycle_id])).rows[0].r;
        const hi = (await as('anon', ANON, `select public.fn_exam_course_outline($1, $2, 'hi') r`, [ex.exam_id, ex.exam_cycle_id])).rows[0].r;
        const ch = o.chapters.find((x) => x.topic_id === T);
        const order = ch ? ch.lessons.map((l) => l.position).join(',') : '';
        chk('B-3 course outline: generated (published syllabus ∩ servable lessons) — the smoke chapter lists exactly its 4 lessons in master order; anon = service; Hindi marks them not available in Hindi yet; never a draft',
          o.state === 'AVAILABLE' && o.chapters.length === 1 && ch && order === '1,2,3,4' && JSON.stringify(o) === JSON.stringify(s) && hi.totals.lessons_in_language < hi.totals.lessons
          && ch.lessons.every((l) => Object.values(docs).includes(l.document_id) || !l.document_id.startsWith('x')),
          JSON.stringify({ state: o.state, order, totals: o.totals, hi: hi.totals }));
      }
      const bad = await as('anon', ANON, `select public.fn_exam_course_outline($1, null, 'fr')`, [ZERO]);
      chk('B-4 an unknown language is refused (22023)', !bad.ok && bad.code === '22023', JSON.stringify(bad));
    });

    // ---------------- C: progress — own rows only, auth.uid(), never downgraded
    await chunk(async () => {
      await migrate();
      const { docs } = await seedLessons(await qaTopic(q, qa.topic_id, 'ca5-smoke-topic', 'CA5 Smoke Topic'));
      const save = (cl, doc, st, block = null) => as('authenticated', cl, `select public.fn_lesson_progress_save($1, 'en', $2, $3) r`, [doc, st, block]);
      const r1 = await save(STU, docs.topic, 'READING', 'intro');
      const r2 = await save(STU, docs.topic, 'COMPLETED', 'memory');
      const r3 = await save(STU, docs.topic, 'READING', 'intro-p');
      const [row] = await q(`select status, last_block_id, completed_at is not null done, count(*) over ()::int n from public.user_lesson_progress where user_id = $1 and document_id = $2`, [ids.student, docs.topic]);
      chk('C-1 a student saves progress through the RPC (user = auth.uid()): READING → COMPLETED; reading again keeps COMPLETED (moves only the last block); one row',
        r1.ok && r2.ok && r3.ok && r3.rows[0].r.status === 'COMPLETED' && row.status === 'COMPLETED' && row.done && row.last_block_id === 'intro-p' && row.n === 1, JSON.stringify({ r1, r2, r3, row }));
      const own = await as('authenticated', STU, `select count(*)::int n from public.user_lesson_progress`);
      const other = await as('authenticated', STAFF, `select count(*)::int n from public.user_lesson_progress where user_id = $1`, [ids.student]);
      const otherSave = await save(STAFF, docs.subA, 'READING');
      const [staffRow] = await q(`select user_id from public.user_lesson_progress where document_id = $1`, [docs.subA]);
      chk('C-2 own rows only: the student reads 1 own row; another user reads 0 of them; that user\'s save lands under THEIR id (never someone else\'s)',
        own.ok && own.rows[0].n === 1 && other.ok && other.rows[0].n === 0 && otherSave.ok && staffRow && staffRow.user_id === ids.staff, JSON.stringify({ own, other, otherSave: otherSave.ok, staffRow }));
      const notPublished = await save(STU, qa.doc_id === docs.topic ? ZERO : ZERO, 'READING');
      const badStatus = await save(STU, docs.topic, 'NOT_STARTED');
      const badBlock = await save(STU, docs.topic, 'READING', 'Bad Block!');
      chk('C-3 refused: an unknown / unpublished lesson (P0002), a status other than READING / COMPLETED, a malformed block id (22023)',
        !notPublished.ok && notPublished.code === 'P0002' && !badStatus.ok && badStatus.code === '22023' && !badBlock.ok && badBlock.code === '22023', JSON.stringify({ notPublished: notPublished.code, badStatus: badStatus.code, badBlock: badBlock.code }));
    });

    // ---------------- Z: nothing left behind
    const [z] = await q(`select (select count(*)::int from public.admin_audit_logs where actor_email = $1) audit,
        (select count(*)::int from public.canonical_taxonomy_nodes where name like 'CA5 Smoke %') nodes,
        ${PRE ? '0' : '(select count(*)::int from public.user_lesson_progress where user_id = ANY($2::uuid[]) and greatest(started_at, updated_at) >= $3)'} progress`, PRE ? [ACTOR_EMAIL] : [ACTOR_EMAIL, [ids.student, ids.staff], smokeStart]);
    chk(`Z-1 nothing persisted: 0 smoke audit rows / nodes, no progress row written during the smoke${PRE ? '; the migration itself rolled back' : ''}`, z.audit === 0 && z.nodes === 0 && z.progress === progressBefore, JSON.stringify(z));
    if (PRE) {
      const [m] = await q(`select to_regclass('public.user_lesson_progress') is null gone`);
      chk('Z-2 --pre: the progress table does not exist after the rolled-back chunks', m.gone, JSON.stringify(m));
    }
    flush();
  } catch (e) {
    ok = false;
    flush();
    console.log(`FAIL CA5 smoke aborted — ${red(String(e.message)).slice(0, 300)}`);
  } finally {
    await c.end().catch(() => {});
  }
  console.log(ok ? 'CA5-COURSES: ALL PASS' : 'CA5-COURSES: FAILURES');
  process.exit(ok ? 0 : 1);
})();
