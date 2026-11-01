#!/usr/bin/env node
/**
 * HOME-1 migration 130 (the library gallery) — live gate. Every chunk is ONE rolled-back transaction
 * (LIVE-LOCK-SAFETY: withLiveTransaction). REAL-ROLE VERIFY: anon / student read; service_role writes; admin / anon
 * cannot execute the functions.
 *   --pre   130 is NOT applied: each chunk first runs the migration inside its own transaction (then rolls back)
 *   G-1 service_role: add → positions 1, 2, 3 in order (path site/gallery/<sha>.webp), audited SITE_GALLERY_ADD; the
 *       7th photo is refused (SITE_GALLERY_FULL, 22023); the same photo twice (23505), a bad people basis / alt / size
 *       (23514) are refused
 *   G-2 move 3 → 1 shifts the others (positions stay 1..n), remove compacts (no gap) and returns the old path, update
 *       changes alt + basis; all audited (SITE_GALLERY_MOVE / _REMOVE / _UPDATE)
 *   G-3 anon + the authenticated student read the rows; neither can write the table (42501); the authenticated QA
 *       admin and anon cannot execute the functions (42501)
 *   Z-1 nothing persisted (0 audit rows by the gate actor)
 * Run: node scripts/live/test_site_gallery.cjs [--pre]
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ROOT = path.resolve(__dirname, '..', '..');
const { Client } = require('pg');
const { dbTarget, redactor } = require(path.join(ROOT, 'scripts/db/_db-env.cjs'));
const { withLiveTransaction } = require(path.join(ROOT, 'scripts/db/live-safety.cjs'));

const PRE = process.argv.includes('--pre');
const FILE = '20261101000130_site_gallery.sql';
const MIGRATION_SQL = fs.readFileSync(path.join(ROOT, 'supabase/migrations', FILE), 'utf8');
const ACTOR = 'site-gallery-smoke@courage-library.test';
const SHA = (i) => crypto.createHash('sha256').update(`gallery-${i}`).digest('hex');

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
    const as = async (role, cl, sql, p) => {
      await c.query('savepoint s'); await c.query(`set local role ${role}`); await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(cl)]);
      try { const r = (await c.query(sql, p)).rows; await c.query('reset role'); await c.query('release savepoint s'); return { ok: true, rows: r }; }
      catch (e) { await c.query('rollback to savepoint s'); return { ok: false, code: e.code, msg: String(e.message).slice(0, 200) }; }
    };
    const SVC = { role: 'service_role' };
    const ANON = { role: 'anon' };
    const STUDENT = { sub: ids['qa-student'], role: 'authenticated', app_metadata: {} };
    const ADMIN = { sub: ids['qa-admin'], role: 'authenticated', aal: 'aal2', app_metadata: { role: 'admin' } };
    const ADD = `select public.fn_site_gallery_add($1, $2, $3, $4, $5, null, $6) r`;
    const add = (i, basis = 'NO_RECOGNISABLE_PERSON', alt = `Reading room ${i}`, w = 1280) => as('service_role', SVC, ADD, [SHA(i), alt, w, 720, basis, ACTOR]);
    const order = async () => (await q(`select position, sha256 from public.site_gallery order by position`)).map((r) => `${r.position}:${[1, 2, 3, 4, 5, 6, 7].find((i) => SHA(i) === r.sha256)}`).join(',');
    const chunk = async (fn) => {
      for (let attempt = 1; ; attempt++) {
        pending = [];
        try {
          await c.end().catch(() => {});
          c = new Client(target.pg); c.on('error', () => {}); await c.connect();
          await withLiveTransaction(c, async () => { if (PRE) await c.query(MIGRATION_SQL); await q(`delete from public.site_gallery`); await fn(); });
          flush();
          return;
        } catch (e) {
          if (attempt === 1 && isConnectionError(e)) { console.log(`RETRY chunk after a dropped connection (${e.code || 'terminated'})`); continue; }
          throw e;
        }
      }
    };

    await chunk(async () => {
      const a = [];
      for (let i = 1; i <= 6; i++) a.push(await add(i, i === 2 ? 'WRITTEN_CONSENT' : 'NO_RECOGNISABLE_PERSON'));
      const full = await add(7);
      await q(`delete from public.site_gallery where position = 6`);
      const dup = await add(1);
      const badBasis = await add(7, 'MAYBE');
      const badAlt = await add(7, 'NO_RECOGNISABLE_PERSON', 'x');
      const badSize = await add(7, 'NO_RECOGNISABLE_PERSON', 'Reading room', 100);
      const audits = (await q(`select count(*)::int n from public.admin_audit_logs where actor_email = $1 and action_type = 'SITE_GALLERY_ADD'`, [ACTOR]))[0].n;
      chk('G-1 add → positions 1..6 in order (path site/gallery/<sha>.webp, audited); 7th refused (FULL); duplicate / bad basis / alt / size refused',
        a.every((r, i) => r.ok && r.rows[0].r.position === i + 1 && r.rows[0].r.path === `site/gallery/${SHA(i + 1)}.webp`) && audits === 6
          && !full.ok && full.code === '22023' && /SITE_GALLERY_FULL/.test(full.msg) && !dup.ok && dup.code === '23505' && [badBasis, badAlt, badSize].every((r) => !r.ok && r.code === '23514'),
        JSON.stringify({ a: a.map((r) => (r.ok ? r.rows[0].r.position : r)), full, dup, badBasis, badAlt, badSize, audits }));
    });

    await chunk(async () => {
      const ids3 = [];
      for (let i = 1; i <= 3; i++) ids3.push((await add(i)).rows[0].r.id);
      const mv = await as('service_role', SVC, `select public.fn_site_gallery_move($1, 1, null, $2) r`, [ids3[2], ACTOR]);
      const afterMove = await order();
      const mvFar = await as('service_role', SVC, `select public.fn_site_gallery_move($1, 99, null, $2) r`, [ids3[2], ACTOR]);
      const afterFar = await order();
      const rm = await as('service_role', SVC, `select public.fn_site_gallery_remove($1, null, $2) r`, [ids3[0], ACTOR]);
      const afterRm = await order();
      const up = await as('service_role', SVC, `select public.fn_site_gallery_update($1, $2, 'WRITTEN_CONSENT', null, $3) r`, [ids3[1], 'Study desks by the window', ACTOR]);
      const row = (await q(`select alt, people_basis from public.site_gallery where id = $1`, [ids3[1]]))[0];
      const types = (await q(`select action_type from public.admin_audit_logs where actor_email = $1 and action_type <> 'SITE_GALLERY_ADD' order by action_type`, [ACTOR])).map((r) => r.action_type).join(',');
      chk('G-2 move shifts the others (1..n), a far move clamps to the end, remove compacts + returns the old path, update changes alt + basis; audited',
        mv.ok && afterMove === '1:3,2:1,3:2' && mvFar.ok && mvFar.rows[0].r.position === 3 && afterFar === '1:1,2:2,3:3'
          && rm.ok && rm.rows[0].r.old_path === `site/gallery/${SHA(1)}.webp` && afterRm === '1:2,2:3'
          && up.ok && row.alt === 'Study desks by the window' && row.people_basis === 'WRITTEN_CONSENT'
          && types === 'SITE_GALLERY_MOVE,SITE_GALLERY_MOVE,SITE_GALLERY_REMOVE,SITE_GALLERY_UPDATE',
        JSON.stringify({ mv: mv.ok || mv, afterMove, mvFar: mvFar.ok ? mvFar.rows[0].r : mvFar, afterFar, rm: rm.ok ? rm.rows[0].r : rm, afterRm, up: up.ok || up, row, types }));
    });

    await chunk(async () => {
      const id = (await add(1)).rows[0].r.id;
      const read = async (role, cl) => (await as(role, cl, `select position, path, width from public.site_gallery`)).rows || [];
      const a = await read('anon', ANON);
      const s = await read('authenticated', STUDENT);
      const wA = await as('anon', ANON, `update public.site_gallery set alt = 'hack'`);
      const wS = await as('authenticated', STUDENT, `delete from public.site_gallery`);
      const iS = await as('authenticated', STUDENT, `insert into public.site_gallery (position, sha256, alt, people_basis, width, height, updated_by_email) values (2, $1, 'Alt text', 'NO_RECOGNISABLE_PERSON', 1280, 720, 'x')`, [SHA(2)]);
      const fA = await as('authenticated', ADMIN, ADD, [SHA(2), 'Alt text', 1280, 720, 'NO_RECOGNISABLE_PERSON', ACTOR]);
      const fN = await as('anon', ANON, `select public.fn_site_gallery_remove($1, null, $2)`, [id, ACTOR]);
      const fM = await as('authenticated', ADMIN, `select public.fn_site_gallery_move($1, 1, null, $2)`, [id, ACTOR]);
      chk('G-3 anon + student read the gallery; no client writes (42501); admin + anon cannot execute the functions (42501)',
        a.length === 1 && a[0].width === 1280 && s.length === 1 && [wA, wS, iS, fA, fN, fM].every((r) => !r.ok && r.code === '42501'),
        JSON.stringify({ a, s, wA, wS, iS, fA, fN, fM }));
    });

    pending = [];
    const [z] = await q(`select (select count(*)::int from public.admin_audit_logs where actor_email = $1) a`, [ACTOR]);
    chk('Z-1 nothing persisted (0 gate audit rows)', z.a === 0, JSON.stringify(z));
    flush();
  } catch (e) {
    ok = false;
    flush();
    console.log(`FAIL SITE-GALLERY smoke aborted — ${red(String(e.message)).slice(0, 300)}`);
  } finally {
    await c.end().catch(() => {});
  }
  console.log(ok ? 'SITE-GALLERY live: ALL PASS' : 'SITE-GALLERY live: FAILURES');
  process.exit(ok ? 0 : 1);
})();
