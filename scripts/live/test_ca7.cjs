#!/usr/bin/env node
/**
 * CA-7 (migration 122) — AS THE REAL ROLES, every write inside a rolled-back transaction (withLiveTransaction →
 * safeBegin: LIVE-LOCK-SAFETY; one connection per chunk; a dropped connection re-runs the chunk once).
 *   --pre   122 is NOT applied: each chunk first runs the migration inside its own transaction (then rolls back)
 *   (none)  after apply: refuses unless 122 is APPLIED
 * Chunks: A flags (INTERNAL excluded from servable lessons, its subtree too; anon reads is_test_content, not is_internal)
 *   · B launch (service only, audited; LIVE needs a coverage snapshot; anon / students see LIVE rows and only exam / cycle
 *   / status; fn_live_course_document_ids follows LIVE; pause; a client cannot write) · C exam notes (validated blocks,
 *   one draft, publish retires, frozen, HI after EN, internal node refused, public reads PUBLISHED only, audited)
 *   · D the progress RPC records ONE ARTICLE_VIEWED per day (topic + node type set), anon refused · Z nothing left.
 * Run: node scripts/live/test_ca7.cjs [--pre]
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
const FILE = '20261028000122_ca7_launch_notes_internal.sql';
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
const { examNoteExample } = require(path.join(ROOT, 'lib/lessons/exam-note.ts'));

let ok = true;
let pending = [];
const chk = (n, cond, info) => { pending.push({ cond, line: `${cond ? 'PASS' : 'FAIL'} ${n}${cond ? '' : ' — ' + (info ?? '')}` }); };
const flush = () => { for (const r of pending) { if (!r.cond) ok = false; console.log(r.line); } pending = []; };
const isConnectionError = (e) => !!e && (['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EPIPE', 'ECONNREFUSED'].includes(e.code) || /Connection terminated|connection error|not queryable/i.test(String(e.message)));
const ACTOR = 'ca7-smoke@courage-library.test';

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
    for (const [k, e] of [['admin', 'qa-admin@courage-library.test'], ['student', 'qa-student@courage-library.test']]) ids[k] = (await q(`select id from auth.users where email = $1`, [e]))[0]?.id;
    const [lesson] = await q(`select d.id, d.node_id, n.hierarchy_path, n.parent_id, n.node_type from public.learning_documents d join public.canonical_taxonomy_nodes n on n.id = d.node_id
                               where d.document_type = 'NODE_LESSON' and d.status = 'PUBLISHED' order by d.created_at limit 1`);
    const [exam] = await q(`select e.id from public.exams e where e.slug = 'ssc-cgl'`);
    const [catchAll] = await q(`select id from public.canonical_taxonomy_nodes where node_type = 'TOPIC' and slug like '%-general' order by hierarchy_path limit 1`);
    if (!ids.admin || !ids.student || !lesson || !exam || !catchAll) throw new Error('QA users / a published node lesson / ssc-cgl / a catch-all node missing');

    const lit = (o) => `'${JSON.stringify(o).replace(/'/g, "''")}'`;
    const as = async (role, cl, sql, p) => {
      await c.query('savepoint s'); await c.query(`set local role ${role}`); await c.query(`select set_config('request.jwt.claims', ${lit(cl)}, true)`);
      try { const r = (await c.query(sql, p)).rows; await c.query('reset role'); await c.query('release savepoint s'); return { ok: true, rows: r }; }
      catch (e) { await c.query('rollback to savepoint s'); return { ok: false, code: e.code, msg: String(e.message).slice(0, 240) }; }
    };
    const ANON = { role: 'anon' };
    const STU = { sub: ids.student, role: 'authenticated', aal: 'aal1', app_metadata: {} };
    const ADMIN = { sub: ids.admin, role: 'authenticated', aal: 'aal2', app_metadata: { role: 'admin' } };
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
    const servableHas = async (docId) => (await q(`select count(*)::int n from public.fn_servable_node_lessons() where document_id = $1`, [docId]))[0].n === 1;

    // ---------------- A: flags
    await chunk(async () => {
      await migrate();
      const before = await servableHas(lesson.id);
      await q(`update public.canonical_taxonomy_nodes set is_internal = true where id = $1`, [lesson.node_id]);
      const ownInternal = await servableHas(lesson.id);
      await q(`update public.canonical_taxonomy_nodes set is_internal = false where id = $1`, [lesson.node_id]);
      let parentInternal = null;
      if (lesson.node_type !== 'TOPIC' && lesson.parent_id) {
        await q(`update public.canonical_taxonomy_nodes set is_internal = true where id = $1`, [lesson.parent_id]);
        parentInternal = await servableHas(lesson.id);
        await q(`update public.canonical_taxonomy_nodes set is_internal = false where id = $1`, [lesson.parent_id]);
      }
      const anonFlag = await as('anon', ANON, `select is_test_content from public.learning_documents where id = $1`, [lesson.id]);
      const [stored] = await q(`select is_test_content from public.learning_documents where id = $1`, [lesson.id]);
      chk('A-1 an INTERNAL node (and anything under it) is never a servable lesson; anon reads is_test_content (the sitemap filter) = the stored value',
        before && !ownInternal && parentInternal !== true && anonFlag.ok && anonFlag.rows[0].is_test_content === stored.is_test_content,
        JSON.stringify({ before, ownInternal, parentInternal, anonFlag, stored }));
    });

    // ---------------- B: launch
    await chunk(async () => {
      await migrate();
      // LAUNCH-MODE-1 (123): the launch carries an access mode; FREE_ALL keeps this chunk's 122 assertions
      const set = (status, cov) => svc(`select public.fn_exam_course_launch_set($1, null, $2, 'FREE_ALL', $3, null, $4) r`, [exam.id, status, cov, ACTOR]);
      const pauseFirst = await set('PAUSED', null);
      const noCov = await set('LIVE', null);
      const live = await set('LIVE', { total: 10, en: 1, hi: 0 });
      const again = await set('LIVE', { total: 10, en: 1, hi: 0 });
      const anonRow = await as('anon', ANON, `select exam_id, status from public.exam_course_launches where exam_id = $1`, [exam.id]);
      const anonCov = await as('anon', ANON, `select coverage from public.exam_course_launches`);
      const liveDocs = await as('anon', ANON, `select count(*)::int n from public.fn_live_course_document_ids()`);
      const outline = (await q(`select public.fn_exam_course_outline($1, null, 'en') o`, [exam.id]))[0].o;
      const outlineDocs = new Set((outline.chapters || []).flatMap((ch) => (ch.lessons || []).map((l) => l.document_id)));
      const stuSet = await as('authenticated', STU, `select public.fn_exam_course_launch_set($1, null, 'LIVE', 'FREE_ALL', '{"total":1,"en":1}', null, 'x@example.test')`, [exam.id]);
      const adminInsert = await as('authenticated', ADMIN, `insert into public.exam_course_launches (exam_id, status, coverage, launched_by_email, changed_by_email) values ($1, 'LIVE', '{}', 'x', 'x')`, [exam.id]);
      const paused = await set('PAUSED', null);
      const anonAfter = await as('anon', ANON, `select count(*)::int n from public.exam_course_launches`);
      const liveAfter = await as('anon', ANON, `select count(*)::int n from public.fn_live_course_document_ids()`);
      const [audit] = await q(`select count(*) filter (where action_type = 'EXAM_COURSE_LAUNCH')::int l, count(*) filter (where action_type = 'EXAM_COURSE_PAUSE')::int p from public.admin_audit_logs where actor_email = $1`, [ACTOR]);
      chk('B-1 launch: pause before launch refused; LIVE without a coverage snapshot refused; LIVE → anon sees the row (exam / status only; coverage denied 42501) and fn_live_course_document_ids = the course outline\'s lessons; LIVE twice refused; a student RPC call and an admin table write are denied (42501); PAUSED → nothing public; audited (1 launch + 1 pause)',
        !pauseFirst.ok && !noCov.ok && live.ok && !again.ok && anonRow.ok && anonRow.rows.length === 1 && anonRow.rows[0].status === 'LIVE' && !anonCov.ok && anonCov.code === '42501'
        && liveDocs.ok && liveDocs.rows[0].n === outlineDocs.size && !stuSet.ok && stuSet.code === '42501' && !adminInsert.ok && adminInsert.code === '42501'
        && paused.ok && anonAfter.rows[0].n === 0 && liveAfter.rows[0].n === 0 && audit.l === 1 && audit.p === 1,
        JSON.stringify({ pauseFirst: pauseFirst.msg, noCov: noCov.msg, live: live.ok || live.msg, again: again.msg, anonRow, anonCov: anonCov.code, liveDocs: liveDocs.rows, outlineDocs: outlineDocs.size, stuSet: stuSet.code, adminInsert: adminInsert.code, paused: paused.ok || paused.msg, anonAfter: anonAfter.rows, liveAfter: liveAfter.rows, audit }));
    });

    // ---------------- C: exam notes
    await chunk(async () => {
      await migrate();
      const ex = examNoteExample('SSC CGL', 'Number System');
      const save = (node, lang, meta, blocks) => svc(`select public.fn_exam_note_save_draft($1, $2, $3, $4, $5, null, $6) r`, [exam.id, node, lang, JSON.stringify(meta), JSON.stringify(blocks), ACTOR]);
      await q(`update public.canonical_taxonomy_nodes set is_internal = true where id = $1`, [catchAll.id]); // rolled back with the chunk
      const bad = await save(lesson.node_id, 'en', ex.meta, [{ id: 'x', type: 'nope' }]);
      const internal = await save(catchAll.id, 'en', ex.meta, ex.blocks);
      const hiFirst = await save(lesson.node_id, 'hi', ex.meta, ex.blocks);
      const d1 = await save(lesson.node_id, 'en', ex.meta, ex.blocks);
      const d2 = await save(lesson.node_id, 'en', { ...ex.meta, title: 'Edited title' }, ex.blocks);
      const anonDraft = await as('anon', ANON, `select count(*)::int n from public.exam_node_notes`);
      const pub = d1.ok ? await svc(`select public.fn_exam_note_publish($1, null, $2) r`, [d1.rows[0].r.id, ACTOR]) : d1;
      const frozen = d1.ok ? await svc(`update public.exam_node_notes set blocks = '[]' where id = $1`, [d1.rows[0].r.id]) : d1;
      const anonPub = await as('anon', ANON, `select meta ->> 'title' t, status from public.exam_node_notes where exam_id = $1 and node_id = $2`, [exam.id, lesson.node_id]);
      const anonEmail = await as('anon', ANON, `select created_by_email from public.exam_node_notes`);
      const hiNow = await save(lesson.node_id, 'hi', ex.meta, ex.blocks);
      const d3 = await save(lesson.node_id, 'en', ex.meta, ex.blocks);
      const pub2 = d3.ok ? await svc(`select public.fn_exam_note_publish($1, null, $2) r`, [d3.rows[0].r.id, ACTOR]) : d3;
      const [st] = await q(`select count(*) filter (where status = 'PUBLISHED')::int p, count(*) filter (where status = 'RETIRED')::int r from public.exam_node_notes where exam_id = $1 and node_id = $2 and language = 'en'`, [exam.id, lesson.node_id]);
      const stuWrite = await as('authenticated', STU, `insert into public.exam_node_notes (exam_id, node_id, language, version, meta, blocks, blocks_hash, created_by_email) values ($1, $2, 'en', 9, '{}', '[]', $3, 'x')`, [exam.id, lesson.node_id, '0'.repeat(64)]);
      const [audit] = await q(`select count(*) filter (where action_type = 'EXAM_NOTE_DRAFT_SAVE')::int s, count(*) filter (where action_type = 'EXAM_NOTE_PUBLISH')::int p from public.admin_audit_logs where actor_email = $1`, [ACTOR]);
      chk('C-1 exam notes: invalid blocks refused (22023); an INTERNAL node refused; HI before a published EN refused; saving twice updates ONE draft; anon sees no draft; publish → anon reads the PUBLISHED note (no author column, 42501); a published body is frozen; HI allowed after EN; a new publish retires the old; a student cannot write (42501); audited',
        !bad.ok && bad.code === '22023' && !internal.ok && !hiFirst.ok && d1.ok && d2.ok && d1.rows[0].r.id === d2.rows[0].r.id && anonDraft.rows[0].n === 0 && pub.ok && !frozen.ok
        && anonPub.ok && anonPub.rows.length === 1 && anonPub.rows[0].t === 'Edited title' && anonPub.rows[0].status === 'PUBLISHED' && !anonEmail.ok && anonEmail.code === '42501'
        && hiNow.ok && d3.ok && pub2.ok && st.p === 1 && st.r === 1 && !stuWrite.ok && stuWrite.code === '42501' && audit.s === 4 && audit.p === 2,
        JSON.stringify({ bad: bad.code, internal: internal.msg, hiFirst: hiFirst.msg, d1: d1.ok, d2: d2.ok, anonDraft: anonDraft.rows, pub: pub.ok || pub.msg, frozen: frozen.ok, anonPub, anonEmail: anonEmail.code, hiNow: hiNow.ok || hiNow.msg, st, stuWrite: stuWrite.code, audit }));
    });

    // ---------------- D: view events through the progress RPC
    await chunk(async () => {
      await migrate();
      const call = (role, cl) => as(role, cl, `select public.fn_lesson_progress_save($1, 'en', 'READING', null) r`, [lesson.id]);
      const a1 = await call('authenticated', STU);
      const a2 = await call('authenticated', STU);
      const anon = await call('anon', ANON);
      const ev = await q(`select topic_id_node_type t, resource_slug, idempotency_key k from public.learning_activity_events where user_id = $1 and event_type = 'ARTICLE_VIEWED' and metadata ->> 'document_id' = $2`, [ids.student, lesson.id]);
      const own = await as('authenticated', STU, `select count(*)::int n from public.learning_activity_events where event_type = 'ARTICLE_VIEWED'`);
      chk('D-1 the progress RPC records ONE ARTICLE_VIEWED per user, lesson, language and day (two calls → one event; topic node type TOPIC; idempotency key set); the student reads their own event; anon cannot call (42501)',
        a1.ok && a2.ok && ev.length === 1 && ev[0].t === 'TOPIC' && /^article_viewed:/.test(ev[0].k) && own.ok && own.rows[0].n >= 1 && !anon.ok && anon.code === '42501',
        JSON.stringify({ a1: a1.ok || a1.msg, a2: a2.ok, ev, own: own.rows, anon: anon.code }));
    });

    const [z] = await q(`select (select count(*)::int from public.admin_audit_logs where actor_email = $1) audit,
        ${PRE ? '0' : `(select count(*)::int from public.exam_course_launches where launched_by_email = $1 or changed_by_email = $1)`} launches,
        ${PRE ? '0' : `(select count(*)::int from public.exam_node_notes where created_by_email = $1)`} notes`, [ACTOR]);
    chk(`Z-1 nothing persisted by the smoke: 0 audit rows / launches / notes${PRE ? ' (the migration itself rolled back each time)' : ''}`, z.audit === 0 && z.launches === 0 && z.notes === 0, JSON.stringify(z));
    flush();
  } catch (e) {
    ok = false;
    flush();
    console.log(`FAIL CA7 smoke aborted — ${red(String(e.message)).slice(0, 300)}`);
  } finally {
    await c.end().catch(() => {});
  }
  console.log(ok ? 'CA7: ALL PASS' : 'CA7: FAILURES');
  process.exit(ok ? 0 : 1);
})();
