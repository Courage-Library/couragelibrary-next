#!/usr/bin/env node
/**
 * PAY-1 B7 cleanup (owner H4 a, 2026-11-19): after the end-to-end run, revoke any TEST-mode Pro still active for a QA
 * account (the run's test purchases give the QA student real Pro in the shared database). Nothing else is touched:
 * orders, payments, receipts and webhook rows stay as the test record (admin totals count live orders only).
 *   - only entitlements whose order is gateway_mode = 'test' AND whose account is in the reserved QA domain
 *   - refuses if a test-mode entitlement of a NON-QA account exists (must never happen; stop and report)
 *   - one PRO_B7_CLEANUP audit row per entitlement (ids only); the Pro lock per user, as the payment functions
 *   - default = DRY RUN (counts only, rolled back); --apply writes in ONE transaction
 * Before --apply (owner rules): node scripts/db/backup.cjs pre-b7-cleanup --resilient (verified 100%) + one TLS check.
 * Usage: node scripts/db/b7-cleanup.cjs [--apply]
 */
require('./safe-net.cjs'); // SAFE-NET
const path = require('path');
const { Client } = require('pg');
const { dbTarget, redactor } = require(path.join(__dirname, '_db-env.cjs'));
const { safeBegin } = require(path.join(__dirname, 'live-safety.cjs'));

const APPLY = process.argv.includes('--apply');
const QA_LIKE = '%@courage-library.test';

(async () => {
  const red = redactor(dbTarget());
  const c = new Client(dbTarget().pg);
  c.on('error', () => {});
  await c.connect();
  let done = false;
  try {
    await safeBegin(c);
    const rows = (await c.query(`
      select e.id, e.user_id, lower(u.email) like $1 qa
        from public.user_entitlements e
        join public.payment_orders o on o.id = e.order_id
        join auth.users u on u.id = e.user_id
       where o.gateway_mode = 'test' and e.is_active and e.revoked_at is null
       order by e.user_id, e.starts_at`, [QA_LIKE])).rows;
    const nonQa = rows.filter((r) => !r.qa);
    if (nonQa.length) throw new Error(`REFUSED: ${nonQa.length} test-mode entitlement(s) belong to a NON-QA account — stop and report`);
    const users = [...new Set(rows.map((r) => r.user_id))];
    for (const u of users) await c.query(`select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('pro_entitlement:' || $1::text, 0))`, [u]);
    let n = 0;
    for (const r of rows) {
      n += (await c.query(`update public.user_entitlements set is_active = false, revoked_at = now(), updated_at = now() where id = $1 and is_active and revoked_at is null`, [r.id])).rowCount;
      await c.query(`insert into public.admin_audit_logs (actor_id, actor_email, action_type, target_entity, target_id, new_value, reason)
                     values (null, 'system:b7-cleanup', 'PRO_B7_CLEANUP', 'user_entitlements', $1, jsonb_build_object('user_id', $2::text), 'PAY-1 B7: test-mode Pro of a QA account revoked after the run')`, [r.id, r.user_id]);
    }
    const [{ left }] = (await c.query(`select count(*)::int left from public.user_entitlements e join public.payment_orders o on o.id = e.order_id
        where o.gateway_mode = 'test' and e.is_active and e.revoked_at is null`)).rows;
    if (APPLY) {
      if (left !== 0) throw new Error(`after the revoke ${left} test-mode entitlement(s) are still active — rolled back`);
      await c.query('COMMIT');
      done = true;
      console.log(`B7-CLEANUP APPLIED: ${n} test-mode entitlement(s) of ${users.length} QA account(s) revoked; audit rows ${rows.length}; left active: 0`);
    } else {
      await c.query('ROLLBACK');
      done = true;
      console.log(`B7-CLEANUP DRY RUN (rolled back): would revoke ${n} test-mode entitlement(s) of ${users.length} QA account(s); left active after: ${left}`);
    }
  } catch (e) {
    if (!done) await c.query('ROLLBACK').catch(() => {});
    console.log(`B7-CLEANUP FAILED (nothing written): ${red(String(e.message)).slice(0, 300)}`);
    process.exitCode = 1;
  } finally {
    await c.end().catch(() => {});
  }
})();
