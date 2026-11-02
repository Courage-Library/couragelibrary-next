#!/usr/bin/env node
/**
 * HOME-1 migration 128 (exam categories) — live gate. Every chunk is ONE rolled-back transaction (LIVE-LOCK-SAFETY:
 * withLiveTransaction); one connection per chunk. REAL-ROLE VERIFY: anon / authenticated QA student / QA admin read,
 * service_role writes.
 *   --pre   128 is NOT applied: each chunk first runs the migration inside its own transaction (then rolls back)
 *   C-1 seed + backfill: 6 categories (5 public + internal); the 4 SSC exams → ssc; qa-syllabus-test → internal;
 *       every exam has a category; the column default is the internal category (an insert without one lands there)
 *   C-2 RLS: anon and the authenticated student see exactly the 5 active public categories (never internal);
 *       an inactive category disappears for them; neither can write the table (42501)
 *   C-3 ONE slug namespace (both directions): a category with an exam's slug → 23505; an exam with a category slug →
 *       23505; renaming either side into the other → 23505; distinct slugs work
 *   C-4 service_role: fn_category_save create / update (audited, keeps exams.category text in step); deactivating a
 *       category with an ACTIVE exam is refused; the internal category cannot be edited; icon set / replace / remove
 *       audited with paths categories/<id>/<sha>.webp; authenticated admin and anon cannot execute the functions (42501)
 *   Z-1 nothing persisted (categories unchanged; 0 audit rows by the gate actor)
 * Run: node scripts/live/test_exam_categories.cjs [--pre]
 */
require('../db/safe-net.cjs'); // SAFE-NET: masks IPs / hosts / e-mails / keys in all output (scripts/db/safe-net.cjs)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ROOT = path.resolve(__dirname, '..', '..');
const { Client } = require('pg');
const { dbTarget, redactor } = require(path.join(ROOT, 'scripts/db/_db-env.cjs'));
const { withLiveTransaction } = require(path.join(ROOT, 'scripts/db/live-safety.cjs'));

const PRE = process.argv.includes('--pre');
const FILE = '20261101000128_exam_categories.sql';
const MIGRATION_SQL = fs.readFileSync(path.join(ROOT, 'supabase/migrations', FILE), 'utf8');
const ACTOR = 'exam-categories-smoke@courage-library.test';
const SHA1 = crypto.createHash('sha256').update('cat-1').digest('hex');
const SHA2 = crypto.createHash('sha256').update('cat-2').digest('hex');

let ok = true;
let pending = [];
const chk = (n, cond, info) => { pending.push({ cond, line: `${cond ? 'PASS' : 'FAIL'} ${n}${cond ? '' : ' — ' + (info ?? '')}` }); };
const flush = () => { for (const r of pending) { if (!r.cond) ok = false; console.log(r.line); } pending = []; };
const isConnectionError = (e) => !!e && (['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EPIPE', 'ECONNREFUSED', 'EAI_AGAIN'].includes(e.code) || /Connection terminated|connection error|not queryable/i.test(String(e.message)));

(async () => {
  const target = dbTarget();
  const red = redactor(target);
  let c = new Client(target.pg); c.on('error', () => {}); await c.connect();
  const q = async (s, p) => (await c.query(s, p)).rows;
  try {
    const [led] = await q(`select count(*)::int n from public.schema_migration_ledger where filename = $1 and status = 'APPLIED'`, [FILE]);
    if (PRE && led.n > 0) throw new Error(`--pre refused: ${FILE} is already APPLIED`);
    if (!PRE && led.n === 0) throw new Error(`${FILE} is not applied (use --pre for the pre-apply smoke)`);
    const ids = Object.fromEntries((await q(`select email, id from auth.users where email in ('qa-admin@courage-library.test', 'qa-student@courage-library.test')`)).map((r) => [r.email.split('@')[0], r.id]));
    if (!ids['qa-admin'] || !ids['qa-student']) throw new Error('QA identities missing');
    const as = async (role, cl, sql, p) => {
      await c.query('savepoint s'); await c.query(`set local role ${role}`); await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(cl)]);
      try { const r = (await c.query(sql, p)).rows; await c.query('reset role'); await c.query('release savepoint s'); return { ok: true, rows: r }; }
      catch (e) { await c.query('rollback to savepoint s'); return { ok: false, code: e.code, msg: String(e.message).slice(0, 240) }; }
    };
    const ANON = { role: 'anon' };
    const STUDENT = { sub: ids['qa-student'], role: 'authenticated', app_metadata: {} };
    const ADMIN = { sub: ids['qa-admin'], role: 'authenticated', aal: 'aal2', app_metadata: { role: 'admin' } };
    const SVC = { role: 'service_role' };
    const svc = (sql, p) => as('service_role', SVC, sql, p);
    const chunk = async (fn) => {
      for (let attempt = 1; ; attempt++) {
        pending = [];
        try {
          await c.end().catch(() => {});
          c = new Client(target.pg); c.on('error', () => {}); await c.connect();
          await withLiveTransaction(c, async () => { if (PRE) await c.query(MIGRATION_SQL); await fn(); });
          flush();
          return;
        } catch (e) {
          if (attempt === 1 && isConnectionError(e)) { console.log(`RETRY chunk after a dropped connection (${e.code || 'terminated'})`); continue; }
          throw e;
        }
      }
    };
    const SAVE = `select public.fn_category_save($1, $2, $3, $4, $5, $6, null, $7) r`;

    await chunk(async () => {
      const cats = await q(`select slug, is_active, is_internal from public.exam_categories order by display_order`);
      const map = await q(`select e.slug, c.slug cat from public.exams e join public.exam_categories c on c.id = e.category_id`);
      const m = Object.fromEntries(map.map((r) => [r.slug, r.cat]));
      const [nulls] = await q(`select count(*)::int n from public.exams where category_id is null`);
      const [org] = await q(`select id from public.conducting_orgs where slug = 'ssc'`);
      const [ins] = await q(`insert into public.exams (org_id, title, slug, category, is_active) values ($1, 'Cat Default Probe', 'cat-default-probe', 'x', false) returning (select slug from public.exam_categories where id = category_id) cat`, [org.id]);
      chk('C-1 seed (5 public + internal), backfill (SSC exams → ssc, QA → internal), no exam without a category, default = internal',
        cats.map((x) => x.slug).join() === 'ssc,police,defence,railway,banking,internal' && cats.filter((x) => x.is_internal).map((x) => x.slug).join() === 'internal'
          && ['ssc-cgl', 'ssc-chsl', 'ssc-mts', 'ssc-gd'].every((s) => !m[s] || m[s] === 'ssc') && m['ssc-cgl'] === 'ssc' && m['qa-syllabus-test'] === 'internal' && nulls.n === 0 && ins.cat === 'internal',
        JSON.stringify({ cats, m, nulls, ins }));
    });

    await chunk(async () => {
      const read = async (cl) => (await as(cl === ANON ? 'anon' : 'authenticated', cl, `select slug from public.exam_categories order by display_order`)).rows.map((r) => r.slug).join();
      const a = await read(ANON);
      const s = await read(STUDENT);
      await q(`update public.exam_categories set is_active = false where slug = 'banking'`);
      const a2 = await read(ANON);
      const wA = await as('anon', ANON, `update public.exam_categories set name = 'X' where slug = 'ssc'`);
      const wS = await as('authenticated', STUDENT, `insert into public.exam_categories (slug, name) values ('hack', 'Hack')`);
      chk('C-2 RLS: anon + student see the 5 public categories (never internal); inactive hidden; no client writes (42501)',
        a === 'ssc,police,defence,railway,banking' && s === a && a2 === 'ssc,police,defence,railway' && !wA.ok && wA.code === '42501' && !wS.ok && wS.code === '42501',
        JSON.stringify({ a, s, a2, wA, wS }));
    });

    await chunk(async () => {
      const [org] = await q(`select id from public.conducting_orgs where slug = 'ssc'`);
      const catLikeExam = await svc(SAVE, [null, 'ssc-cgl', 'Clash', null, 50, true, ACTOR]);
      const examLikeCat = await as('service_role', SVC, `insert into public.exams (org_id, title, slug, category, is_active) values ($1, 'Clash', 'police', 'x', false)`, [org.id]);
      const renameExam = await as('service_role', SVC, `update public.exams set slug = 'railway' where slug = 'qa-syllabus-test'`);
      const renameCat = await as('service_role', SVC, `update public.exam_categories set slug = 'ssc-cgl' where slug = 'defence'`);
      const fine = await svc(SAVE, [null, 'teaching', 'Teaching', 'TET and teacher exams.', 6, true, ACTOR]);
      chk('C-3 one slug namespace, both directions (create + rename): 23505; distinct slugs work',
        [catLikeExam, examLikeCat, renameExam, renameCat].every((r) => !r.ok && r.code === '23505') && fine.ok,
        JSON.stringify({ catLikeExam, examLikeCat, renameExam, renameCat, fine: fine.ok }));
    });

    await chunk(async () => {
      const created = await svc(SAVE, [null, 'teaching', 'Teaching', 'TET exams.', 6, true, ACTOR]);
      const id = created.ok && created.rows[0].r.id;
      const [ssc] = await q(`select id from public.exam_categories where slug = 'ssc'`);
      const upd = await svc(SAVE, [ssc.id, 'ssc', 'SSC exams', 'Staff Selection Commission exams.', 1, true, ACTOR]);
      const [txt] = await q(`select category from public.exams where slug = 'ssc-cgl'`);
      const deact = await svc(SAVE, [ssc.id, 'ssc', 'SSC exams', null, 1, false, ACTOR]);
      const [internal] = await q(`select id from public.exam_categories where slug = 'internal'`);
      const editInternal = await svc(SAVE, [internal.id, 'internal', 'Shown', null, 1, true, ACTOR]);
      const s1 = await svc(`select public.fn_category_icon_set($1, $2, 'Teaching icon', null, $3) r`, [id, SHA1, ACTOR]);
      const s2 = await svc(`select public.fn_category_icon_set($1, $2, 'Teaching icon', null, $3) r`, [id, SHA2, ACTOR]);
      const rm = await svc(`select public.fn_category_icon_remove($1, null, $2) r`, [id, ACTOR]);
      const audit = (await q(`select action_type from public.admin_audit_logs where actor_email = $1 order by action_type`, [ACTOR])).map((r) => r.action_type);
      const admin = await as('authenticated', ADMIN, SAVE, [null, 'x-admin', 'X', null, 1, true, ACTOR]);
      const anon = await as('anon', ANON, `select public.fn_category_icon_remove($1, null, $2)`, [id, ACTOR]);
      chk('C-4 service_role writes: create / update (keeps exams.category text in step) / refuse deactivating with active exams / internal locked / icon set-replace-remove; audited; admin + anon 42501',
        created.ok && upd.ok && txt.category === 'SSC exams' && !deact.ok && /active exams/.test(deact.msg) && !editInternal.ok && editInternal.code === '42501'
          && s1.ok && s1.rows[0].r.path === `categories/${id}/${SHA1}.webp` && s1.rows[0].r.old_path === null && s2.ok && s2.rows[0].r.old_path === `categories/${id}/${SHA1}.webp` && rm.ok && rm.rows[0].r.old_path === `categories/${id}/${SHA2}.webp`
          && audit.join() === 'EXAM_CATEGORY_CREATE,EXAM_CATEGORY_ICON_REMOVE,EXAM_CATEGORY_ICON_REPLACE,EXAM_CATEGORY_ICON_UPLOAD,EXAM_CATEGORY_UPDATE'
          && !admin.ok && admin.code === '42501' && !anon.ok && anon.code === '42501',
        JSON.stringify({ created: created.ok || created, upd: upd.ok || upd, txt, deact, editInternal, s1: s1.ok ? s1.rows[0].r : s1, s2: s2.ok || s2, rm: rm.ok || rm, audit, admin, anon }));
    });

    pending = [];
    const [z] = await q(`select (select count(*)::int from public.admin_audit_logs where actor_email = $1) a,
        (select count(*)::int from public.exams where slug = 'cat-default-probe') e`, [ACTOR]);
    const cats = PRE ? 0 : (await q(`select count(*)::int n from public.exam_categories where slug in ('teaching', 'hack', 'x-admin')`))[0].n;
    chk('Z-1 nothing persisted (0 gate audit rows, 0 probe exams, 0 probe categories)', z.a === 0 && z.e === 0 && cats === 0, JSON.stringify({ z, cats }));
    flush();
  } catch (e) {
    ok = false;
    flush();
    console.log(`FAIL EXAM-CATEGORIES smoke aborted — ${red(String(e.message)).slice(0, 300)}`);
  } finally {
    await c.end().catch(() => {});
  }
  console.log(ok ? 'EXAM-CATEGORIES live: ALL PASS' : 'EXAM-CATEGORIES live: FAILURES');
  process.exit(ok ? 0 : 1);
})();
