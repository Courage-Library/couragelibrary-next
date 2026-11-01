#!/usr/bin/env node
/**
 * SEC-SITE-MEDIA-1 (migration 132) — live gate. ONE rolled-back transaction per chunk (LIVE-LOCK-SAFETY:
 * withLiveTransaction). REAL-ROLE VERIFY.
 *   --pre   132 is NOT applied: each chunk first runs the migration inside its own transaction (then rolls back)
 *   E-1 site_media + site_gallery have no personal column (e-mail / phone / name / user id / *_by / actor / owner)
 *   E-2 written through the service-role functions, a row read back by anon and by the QA student (`select *`) has
 *       exactly the image fields — no e-mail anywhere in what the public can read; the write is audited with the
 *       actor (admin_audit_logs actor_id + actor_email) for set / replace / remove (brand) and add / update / move /
 *       remove (gallery)
 *   E-3 anon and the student still cannot write either table or execute the functions (42501)
 *   Z-1 nothing persisted
 * Run: node scripts/live/test_site_media_no_email.cjs [--pre]
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ROOT = path.resolve(__dirname, '..', '..');
const { Client } = require('pg');
const { dbTarget, redactor } = require(path.join(ROOT, 'scripts/db/_db-env.cjs'));
const { withLiveTransaction } = require(path.join(ROOT, 'scripts/db/live-safety.cjs'));

const PRE = process.argv.includes('--pre');
const FILE = '20261102000132_site_media_no_email.sql';
const MIGRATION_SQL = fs.readFileSync(path.join(ROOT, 'supabase/migrations', FILE), 'utf8');
const ACTOR = 'site-media-no-email-smoke@courage-library.test';
const SHA = (s) => crypto.createHash('sha256').update(s).digest('hex');
const PERSONAL = /(e_?mail|phone|mobile|name|user_id|_by$|actor|owner|author)/i;

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
    const [stu] = await q(`select id from auth.users where email = 'qa-student@courage-library.test'`);
    const as = async (role, cl, sql, p) => {
      await c.query('savepoint s'); await c.query(`set local role ${role}`); await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(cl)]);
      try { const r = (await c.query(sql, p)).rows; await c.query('reset role'); await c.query('release savepoint s'); return { ok: true, rows: r }; }
      catch (e) { await c.query('rollback to savepoint s'); return { ok: false, code: e.code, msg: String(e.message).slice(0, 160) }; }
    };
    const SVC = { role: 'service_role' };
    const ANON = { role: 'anon' };
    const STUDENT = { sub: stu.id, role: 'authenticated', app_metadata: {} };
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

    await chunk(async () => {
      const cols = await q(`select table_name t, column_name c from information_schema.columns where table_schema = 'public' and table_name in ('site_media', 'site_gallery') order by 1, 2`);
      const bad = cols.filter((r) => PERSONAL.test(r.c));
      chk('E-1 no personal column on site_media / site_gallery', bad.length === 0 && cols.length >= 12, JSON.stringify(bad));

      await q(`delete from public.site_media`);
      await q(`delete from public.site_gallery`);
      const w = [];
      w.push(await as('service_role', SVC, `select public.fn_site_media_set('brand_header_logo', $1, 'Courage Library', 480, 96, null, $2) r`, [SHA('a'), ACTOR]));
      w.push(await as('service_role', SVC, `select public.fn_site_media_set('brand_header_logo', $1, 'Courage Library', 480, 96, null, $2) r`, [SHA('b'), ACTOR]));
      w.push(await as('service_role', SVC, `select public.fn_site_media_set('brand_square_mark', $1, 'Courage Library', 512, 512, null, $2) r`, [SHA('c'), ACTOR]));
      w.push(await as('service_role', SVC, `select public.fn_site_media_remove('brand_square_mark', null, $1) r`, [ACTOR]));
      const g1 = await as('service_role', SVC, `select public.fn_site_gallery_add($1, 'Reading room', 1280, 720, 'NO_RECOGNISABLE_PERSON', null, $2) r`, [SHA('g1'), ACTOR]);
      const g2 = await as('service_role', SVC, `select public.fn_site_gallery_add($1, 'Study desks', 1280, 720, 'WRITTEN_CONSENT', null, $2) r`, [SHA('g2'), ACTOR]);
      w.push(g1, g2);
      const id1 = g1.ok && g1.rows[0].r.id;
      w.push(await as('service_role', SVC, `select public.fn_site_gallery_update($1, 'Reading room, Kanpur', 'NO_RECOGNISABLE_PERSON', null, $2) r`, [id1, ACTOR]));
      w.push(await as('service_role', SVC, `select public.fn_site_gallery_move($1, 2, null, $2) r`, [id1, ACTOR]));
      w.push(await as('service_role', SVC, `select public.fn_site_gallery_remove($1, null, $2) r`, [id1, ACTOR]));
      const audit = (await q(`select action_type, actor_email from public.admin_audit_logs where actor_email = $1 order by created_at, action_type`, [ACTOR]));
      const types = audit.map((r) => r.action_type).sort().join();
      const read = async (role, cl) => {
        const m = await as(role, cl, `select * from public.site_media`);
        const g = await as(role, cl, `select * from public.site_gallery`);
        return { m, g };
      };
      const A = await read('anon', ANON);
      const S = await read('authenticated', STUDENT);
      const leaks = [A, S].flatMap((x) => [...(x.m.rows || []), ...(x.g.rows || [])]).filter((row) => Object.keys(row).some((k) => PERSONAL.test(k)) || Object.values(row).some((v) => /@/.test(String(v))));
      chk('E-2 public reads (anon + student, select *) have image fields only — no e-mail; every write audited with the actor',
        w.every((x) => x.ok) && A.m.ok && A.g.ok && S.m.ok && S.g.ok && A.m.rows.length === 1 && A.g.rows.length === 1 && S.m.rows.length === 1 && leaks.length === 0
          && types === 'SITE_GALLERY_ADD,SITE_GALLERY_ADD,SITE_GALLERY_MOVE,SITE_GALLERY_REMOVE,SITE_GALLERY_UPDATE,SITE_MEDIA_REMOVE,SITE_MEDIA_REPLACE,SITE_MEDIA_UPLOAD,SITE_MEDIA_UPLOAD'
          && audit.every((r) => r.actor_email === ACTOR),
        JSON.stringify({ writes: w.map((x) => x.ok || x), anonKeys: A.m.rows && A.m.rows[0] && Object.keys(A.m.rows[0]), galleryKeys: A.g.rows && A.g.rows[0] && Object.keys(A.g.rows[0]), leaks: leaks.length, types }));

      const wA = await as('anon', ANON, `update public.site_media set alt = 'hack'`);
      const wS = await as('authenticated', STUDENT, `delete from public.site_gallery`);
      const fA = await as('anon', ANON, `select public.fn_site_media_remove('brand_header_logo', null, $1)`, [ACTOR]);
      const fS = await as('authenticated', STUDENT, `select public.fn_site_gallery_add($1, 'x x x', 1280, 720, 'NO_RECOGNISABLE_PERSON', null, $2)`, [SHA('g3'), ACTOR]);
      chk('E-3 anon + student: no writes, no function calls (42501)', [wA, wS, fA, fS].every((r) => !r.ok && r.code === '42501'), JSON.stringify({ wA, wS, fA, fS }));
    });

    pending = [];
    const [z] = await q(`select (select count(*)::int from public.admin_audit_logs where actor_email = $1) a`, [ACTOR]);
    chk('Z-1 nothing persisted (0 gate audit rows)', z.a === 0, JSON.stringify(z));
    flush();
  } catch (e) {
    ok = false;
    flush();
    console.log(`FAIL SITE-MEDIA-NO-EMAIL smoke aborted — ${red(String(e.message)).slice(0, 300)}`);
  } finally {
    await c.end().catch(() => {});
  }
  console.log(ok ? 'SITE-MEDIA-NO-EMAIL live: ALL PASS' : 'SITE-MEDIA-NO-EMAIL live: FAILURES');
  process.exit(ok ? 0 : 1);
})();
