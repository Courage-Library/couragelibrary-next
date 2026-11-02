#!/usr/bin/env node
/**
 * HOME-1 site media — migration 129, reshaped by 131 (brand settings: header logo, square mark, footer logo) — live
 * gate. Every chunk is ONE rolled-back transaction (LIVE-LOCK-SAFETY: withLiveTransaction). REAL-ROLE VERIFY: anon /
 * student read; service_role writes; admin / anon cannot execute the functions.
 *   --pre   131 is NOT applied: each chunk first runs the migration inside its own transaction (then rolls back)
 *   M-1 service_role: set → SITE_MEDIA_UPLOAD (path site/brand_header_logo/<sha>.webp; the square mark is .png),
 *       replace → _REPLACE with the old path returned, remove → _REMOVE with the old path; a bad key (incl. the old
 *       'home_photo') / alt / size is refused (23514)
 *   M-2 anon + the authenticated student read the row (public photo); neither can write the table (42501);
 *       the authenticated QA admin and anon cannot execute the functions (42501)
 *   Z-1 nothing persisted (0 rows added, 0 audit rows by the gate actor)
 * Run: node scripts/live/test_site_media.cjs [--pre]
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
const FILE = '20261101000131_brand_assets.sql';
const MIGRATION_SQL = fs.readFileSync(path.join(ROOT, 'supabase/migrations', FILE), 'utf8');
const ACTOR = 'site-media-smoke@courage-library.test';
const SHA1 = crypto.createHash('sha256').update('photo-1').digest('hex');
const SHA2 = crypto.createHash('sha256').update('photo-2').digest('hex');

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
    const SET = `select public.fn_site_media_set($1, $2, $3, $4, $5, null, $6) r`;
    const chunk = async (fn) => {
      for (let attempt = 1; ; attempt++) {
        pending = [];
        try {
          await c.end().catch(() => {});
          c = new Client(target.pg); c.on('error', () => {}); await c.connect();
          await withLiveTransaction(c, async () => { if (PRE) await c.query(MIGRATION_SQL); await q(`delete from public.site_media`); await fn(); });
          flush();
          return;
        } catch (e) {
          if (attempt === 1 && isConnectionError(e)) { console.log(`RETRY chunk after a dropped connection (${e.code || 'terminated'})`); continue; }
          throw e;
        }
      }
    };

    await chunk(async () => {
      const s1 = await as('service_role', SVC, SET, ['brand_header_logo', SHA1, 'Courage Library', 480, 96, ACTOR]);
      const s2 = await as('service_role', SVC, SET, ['brand_header_logo', SHA2, 'Courage Library', 600, 120, ACTOR]);
      const rm = await as('service_role', SVC, `select public.fn_site_media_remove('brand_header_logo', null, $1) r`, [ACTOR]);
      const sq = await as('service_role', SVC, SET, ['brand_square_mark', SHA1, 'Courage Library', 512, 512, ACTOR]);
      const badKey = await as('service_role', SVC, SET, ['home_photo', SHA1, 'Alt text', 1280, 720, ACTOR]);
      const badAlt = await as('service_role', SVC, SET, ['brand_footer_logo', SHA1, 'x', 480, 96, ACTOR]);
      const badSize = await as('service_role', SVC, SET, ['brand_footer_logo', SHA1, 'Alt text', 20, 96, ACTOR]);
      const audit = (await q(`select action_type from public.admin_audit_logs where actor_email = $1 order by created_at, action_type`, [ACTOR])).map((r) => r.action_type).sort();
      chk('M-1 service_role: set / replace / remove audited (paths returned); bad key / alt / size refused (23514)',
        s1.ok && s1.rows[0].r.path === `site/brand_header_logo/${SHA1}.webp` && s1.rows[0].r.old_path === null && s2.ok && s2.rows[0].r.old_path === `site/brand_header_logo/${SHA1}.webp`
          && rm.ok && rm.rows[0].r.old_path === `site/brand_header_logo/${SHA2}.webp` && sq.ok && sq.rows[0].r.path === `site/brand_square_mark/${SHA1}.png`
          && [badKey, badAlt, badSize].every((r) => !r.ok && r.code === '23514')
          && audit.join() === 'SITE_MEDIA_REMOVE,SITE_MEDIA_REPLACE,SITE_MEDIA_UPLOAD,SITE_MEDIA_UPLOAD',
        JSON.stringify({ s1: s1.ok ? s1.rows[0].r : s1, s2: s2.ok || s2, rm: rm.ok ? rm.rows[0].r : rm, sq: sq.ok ? sq.rows[0].r : sq, badKey, badAlt, badSize, audit }));
    });

    await chunk(async () => {
      await as('service_role', SVC, SET, ['brand_header_logo', SHA1, 'Courage Library', 480, 96, ACTOR]);
      const read = async (role, cl) => (await as(role, cl, `select key, path, width, height from public.site_media`)).rows || [];
      const a = await read('anon', ANON);
      const s = await read('authenticated', STUDENT);
      const wA = await as('anon', ANON, `update public.site_media set alt = 'hack'`);
      const wS = await as('authenticated', STUDENT, `delete from public.site_media`);
      const fA = await as('authenticated', ADMIN, SET, ['brand_header_logo', SHA2, 'Alt text', 480, 96, ACTOR]);
      const fN = await as('anon', ANON, `select public.fn_site_media_remove('brand_header_logo', null, $1)`, [ACTOR]);
      chk('M-2 anon + student read the brand row; no client writes (42501); admin + anon cannot execute the functions (42501)',
        a.length === 1 && a[0].width === 480 && s.length === 1 && !wA.ok && wA.code === '42501' && !wS.ok && wS.code === '42501' && !fA.ok && fA.code === '42501' && !fN.ok && fN.code === '42501',
        JSON.stringify({ a, s, wA, wS, fA, fN }));
    });

    pending = [];
    const [z] = await q(`select (select count(*)::int from public.admin_audit_logs where actor_email = $1) a`, [ACTOR]);
    chk('Z-1 nothing persisted (0 gate audit rows)', z.a === 0, JSON.stringify(z));
    flush();
  } catch (e) {
    ok = false;
    flush();
    console.log(`FAIL SITE-MEDIA smoke aborted — ${red(String(e.message)).slice(0, 300)}`);
  } finally {
    await c.end().catch(() => {});
  }
  console.log(ok ? 'SITE-MEDIA live: ALL PASS' : 'SITE-MEDIA live: FAILURES');
  process.exit(ok ? 0 : 1);
})();
