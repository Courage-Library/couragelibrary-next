#!/usr/bin/env node
/**
 * PAY-1 B5 (migration 150; owner D8 + E1–E7, 2026-11-18) — AS THE REAL ROLES, every write inside a rolled-back
 * transaction (withLiveTransaction → safeBegin: LIVE-LOCK-SAFETY). No e-mail is sent; no network beyond the database.
 *   --pre   150 is NOT applied: each chunk first runs the migration inside its own transaction (then rolls back)
 *   (none)  after apply: refuses unless 150 is APPLIED
 *   --local=<port>  a throwaway LOCAL PostgreSQL (scripts/db/local-pg.cjs) instead of the project database
 * Chunks:
 *   A shape: email_events exists, RLS on, NO policy; anon and the QA student can neither read nor insert (42501); the
 *     service role inserts, cannot DELETE (42501); a second row for the same event_key → 23505 (at most once); a bad
 *     kind / status / key / attempts → 23514; the FAILED → CLAIMED take-back is compare-and-swap (the second loses)
 *   B every read the e-mail server makes works as the service role on the real schema (receipts by order, refund ids
 *     in payment_transactions via @>, unapplied refunds in the audit log, Pro ends, order modes, retries / keys)
 *   C the job lease "pro_emails": one holder at a time, released by the holder
 *   Z nothing persisted
 * Run: node scripts/live/test_pay1_b5.cjs [--pre]
 */
require('../db/safe-net.cjs'); // SAFE-NET
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const { Client } = require('pg');
const { dbTarget, redactor } = require(path.join(ROOT, 'scripts/db/_db-env.cjs'));
const { withLiveTransaction } = require(path.join(ROOT, 'scripts/db/live-safety.cjs'));

const PRE = process.argv.includes('--pre');
const LOCAL = (process.argv.find((a) => a.startsWith('--local=')) || '').slice('--local='.length);
if (LOCAL && !/^\d{4,5}$/.test(LOCAL)) throw new Error('--local=<port>');
const PG = () => (LOCAL ? { host: '127.0.0.1', port: Number(LOCAL), user: 'postgres', database: 'postgres' } : dbTarget().pg);
const FILE = '20261118000150_pay1_b5_email_events.sql';
const MIGRATION_SQL = fs.readFileSync(path.join(ROOT, 'supabase/migrations', FILE), 'utf8');

let ok = true;
let pending = [];
const chk = (n, cond, info) => { pending.push({ cond, line: `${cond ? 'PASS' : 'FAIL'} ${n}${cond ? '' : ' — ' + String(info ?? '').slice(0, 600)}` }); };
const flush = () => { for (const r of pending) { if (!r.cond) ok = false; console.log(r.line); } pending = []; };
const isConnectionError = (e) => !!e && (['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EPIPE', 'ECONNREFUSED'].includes(e.code) || /Connection terminated|connection error|not queryable/i.test(String(e.message)));

(async () => {
  const red = LOCAL ? (s) => s : redactor(dbTarget());
  let c = new Client(PG()); c.on('error', () => {}); await c.connect();
  const q = async (s, p) => (await c.query(s, p)).rows;
  try {
    const [led] = await q(`select count(*)::int n from public.schema_migration_ledger where filename = $1 and status = 'APPLIED'`, [FILE]);
    if (PRE && led.n > 0) throw new Error(`--pre refused: ${FILE} is already APPLIED`);
    if (!PRE && led.n === 0) throw new Error(`${FILE} is not applied (use --pre for the pre-apply smoke)`);
    // a throwaway LOCAL copy holds no user rows: create the stub QA student there (never on the project database)
    if (LOCAL) await q(`insert into auth.users (id, email) select '00000000-0000-4000-8000-0000000005b5', 'qa-student@courage-library.test'
                         where not exists (select 1 from auth.users where email = 'qa-student@courage-library.test')`);
    const [stu] = await q(`select id from auth.users where email = 'qa-student@courage-library.test'`);
    if (!stu) throw new Error('the QA student is missing');
    const lit = (o) => `'${JSON.stringify(o).replace(/'/g, "''")}'`;
    const as = async (role, cl, sql, p) => {
      await c.query('savepoint s'); await c.query(`set local role ${role}`); await c.query(`select set_config('request.jwt.claims', ${lit(cl)}, true)`);
      try { const r = (await c.query(sql, p)).rows; await c.query('reset role'); await c.query('release savepoint s'); return { ok: true, rows: r }; }
      catch (e) { await c.query('rollback to savepoint s'); return { ok: false, code: e.code, msg: String(e.message).slice(0, 160) }; }
    };
    const ANON = { role: 'anon' };
    const STU = { sub: stu.id, role: 'authenticated', aal: 'aal1', app_metadata: {} };
    const SVC = { role: 'service_role' };
    const chunk = async (fn) => {
      for (let attempt = 1; ; attempt++) {
        pending = [];
        try {
          await c.end().catch(() => {});
          c = new Client(PG()); c.on('error', () => {}); await c.connect();
          await withLiveTransaction(c, async () => { if (PRE) await c.query(MIGRATION_SQL); await fn(); });
          flush();
          return;
        } catch (e) {
          if (attempt === 1 && isConnectionError(e)) { console.log(`RETRY chunk after a dropped connection (${e.code || 'terminated'})`); continue; }
          throw e;
        }
      }
    };
    const ins = (key, extra = {}) => {
      const r = { kind: 'PRO_RECEIPT', event_key: key, user_id: stu.id, gateway_mode: 'test', status: 'CLAIMED', attempts: 1, ...extra };
      return as('service_role', SVC, `insert into public.email_events (kind, event_key, user_id, gateway_mode, status, attempts) values ($1, $2, $3, $4, $5, $6) returning id`,
        [r.kind, r.event_key, r.user_id, r.gateway_mode, r.status, r.attempts]);
    };

    await chunk(async () => {
      const [shape] = await q(`select (select relrowsecurity from pg_class where oid = 'public.email_events'::regclass) rls,
          (select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'email_events') policies,
          (select count(*)::int from information_schema.columns where table_schema = 'public' and table_name = 'email_events') cols`);
      chk('A-1 email_events: RLS on, no policy, 12 columns (ids + outcome only)', shape.rls === true && shape.policies === 0 && shape.cols === 12, JSON.stringify(shape));
      const denied = [];
      for (const [role, cl] of [['anon', ANON], ['authenticated', STU]]) {
        for (const sql of ['select * from public.email_events limit 1', `insert into public.email_events (kind, event_key, user_id) values ('PRO_RECEIPT', 'receipt:b5gate-deny', '${stu.id}')`]) {
          const r = await as(role, cl, sql);
          if (r.ok || r.code !== '42501') denied.push(`${role}: ${sql.slice(0, 40)} → ${r.ok ? 'ALLOWED' : r.code}`);
        }
      }
      chk('A-2 anon and the QA student can neither read nor insert email_events (42501)', denied.length === 0, denied.join(' | '));
      const first = await ins('receipt:b5gate-0001');
      const dup = await ins('receipt:b5gate-0001');
      const del = await as('service_role', SVC, `delete from public.email_events where event_key = 'receipt:b5gate-0001'`);
      chk('A-3 the service role inserts once; the same event_key again → 23505 (at most once); DELETE is not granted (42501)',
        first.ok && !dup.ok && dup.code === '23505' && !del.ok && del.code === '42501', JSON.stringify({ first: first.ok || first.code, dup: dup.code, del: del.ok || del.code }));
      const bad = [];
      for (const [label, key, extra] of [
        ['kind', 'receipt:b5gate-0002', { kind: 'NEWSLETTER' }],
        ['status', 'receipt:b5gate-0003', { status: 'QUEUED' }],
        ['key prefix', 'promo:b5gate-0004', {}],
        ['key characters', 'receipt:b5 gate <x>', {}],
        ['attempts', 'receipt:b5gate-0005', { attempts: 4 }],
        ['mode', 'receipt:b5gate-0006', { gateway_mode: 'sandbox' }],
      ]) {
        const r = await ins(key, extra);
        if (r.ok || r.code !== '23514') bad.push(`${label} → ${r.ok ? 'ACCEPTED' : r.code}`);
      }
      chk('A-4 a bad kind / status / key / attempts / mode → 23514', bad.length === 0, bad.join(' | '));
      await ins('receipt:b5gate-0007', { status: 'FAILED', attempts: 1 });
      const take = `update public.email_events set status = 'CLAIMED', attempts = attempts + 1 where event_key = 'receipt:b5gate-0007' and status = 'FAILED' and attempts = 1 returning attempts`;
      const t1 = await as('service_role', SVC, take);
      const t2 = await as('service_role', SVC, take);
      chk('A-5 the FAILED → CLAIMED take-back is compare-and-swap: the first wins (attempts 2), the second changes nothing',
        t1.ok && t1.rows.length === 1 && t1.rows[0].attempts === 2 && t2.ok && t2.rows.length === 0, JSON.stringify({ t1: t1.rows, t2: t2.rows }));
    });

    await chunk(async () => {
      const reads = [
        ['receipt by order', `select receipt_number, plan_code, amount_paise, period_end, created_at from public.payment_receipts where order_id = $1`, [stu.id]],
        ['receipts since', `select order_id from public.payment_receipts where created_at >= now() - interval '7 days' order by created_at limit 25`],
        ['refund id in a transaction (@>)', `select order_id, refund_amount, status from public.payment_transactions where gateway_response_json @> $1::jsonb limit 1`, [JSON.stringify({ refund_ids: ['rfnd_B5gate'] })]],
        ['refunded transactions since', `select order_id, gateway_response_json from public.payment_transactions where refund_amount > 0 and updated_at >= now() - interval '7 days' limit 25`],
        ['unapplied refunds', `select target_id, new_value from public.admin_audit_logs where action_type = 'PRO_UNAPPLIED_PAYMENT_REFUNDED' and new_value ->> 'refund_id' = 'rfnd_B5gate' limit 1`],
        ['order modes', `select id, user_id, gateway_mode from public.payment_orders where id = $1`, [stu.id]],
        ['Pro ends', `select user_id, expires_at, order_id from public.user_entitlements where is_active and revoked_at is null and entitlement_type in ('PRO_SUBSCRIPTION', 'PROMOTIONAL_PASS') and expires_at > now() and expires_at <= now() + interval '7 days' limit 100`],
        ['retries', `select id, kind, event_key, user_id, gateway_mode from public.email_events where status = 'FAILED' and attempts < 3 and updated_at < now() - interval '30 minutes' order by updated_at limit 25`],
        ['admin list', `select id, kind, event_key, status, attempts, error_code, gateway_mode, created_at from public.email_events where status = 'UNKNOWN' or (status = 'FAILED' and attempts >= 3) order by created_at desc limit 100`],
        ['stale claims', `update public.email_events set status = 'UNKNOWN', error_code = 'STALE_CLAIM', updated_at = now() where status = 'CLAIMED' and updated_at < now() - interval '10 minutes' and event_key like 'receipt:b5gate%' returning id`],
      ];
      const bad = [];
      for (const [label, sql, p] of reads) {
        const r = await as('service_role', SVC, sql, p);
        if (!r.ok) bad.push(`${label}: ${r.code} ${r.msg}`);
      }
      chk(`B-1 every read / update the e-mail server makes works as the service role (${reads.length})`, bad.length === 0, bad.join(' | '));
    });

    await chunk(async () => {
      const L = async (h, s) => { const r = await as('service_role', SVC, `select public.fn_payment_job_lease('pro_emails', $1, $2) r`, [h, s]); return r.ok ? r.rows[0].r : r.code; };
      const h1 = '00000000-0000-4000-8000-0000000000e1';
      const h2 = '00000000-0000-4000-8000-0000000000e2';
      const a1 = await L(h1, 120);
      const a2 = await L(h2, 120);
      const rel = await L(h1, 0);
      const a3 = await L(h2, 120);
      chk('C-1 the e-mail job lease: one holder at a time; after the holder releases, another gets it', a1 === true && a2 === false && rel === true && a3 === true, JSON.stringify({ a1, a2, rel, a3 }));
    });

    if (!PRE) {
      const [z] = await q(`select (select count(*)::int from public.email_events where event_key like 'receipt:b5gate%') rows,
          (select count(*)::int from public.payment_job_leases where job = 'pro_emails' and holder in ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000e2')) leases`);
      chk('Z-1 nothing persisted (gate rows, the gate lease)', z.rows === 0 && z.leases === 0, JSON.stringify(z));
    } else {
      const [z] = await q(`select to_regclass('public.email_events') is null gone`);
      chk('Z-1 nothing persisted (--pre: email_events does not exist after the rolled-back chunks)', z.gone === true, JSON.stringify(z));
    }
    flush();
  } catch (e) {
    ok = false;
    flush();
    console.log(`FAIL PAY1-B5 live aborted — ${red(String(e.message)).slice(0, 300)}`);
  } finally {
    await c.end().catch(() => {});
  }
  console.log(ok ? 'PAY-1 B5 live: ALL PASS' : 'PAY-1 B5 live: FAILURES');
  process.exit(ok ? 0 : 1);
})();
