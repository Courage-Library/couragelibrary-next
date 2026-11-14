#!/usr/bin/env node
/**
 * PAY-1 B1 — live gate for migration 140 (PAY-LEGACY-RETIRE-1). Every check runs in ONE transaction that is always
 * rolled back (withLiveTransaction). Prints counts / booleans only.
 *   B1-1 after 140 (with --pre: 140 applied inside the transaction) the three legacy payment functions are gone
 *   B1-2 the F9 payment functions (114) are all still there, SECURITY DEFINER, service_role only
 *   B1-3 nothing in public calls a dropped function (no function body names them)
 *   B1-4 rollback 140 (in the same transaction) recreates the three: SECURITY DEFINER, EXECUTE for postgres /
 *        service_role only, and the definition is byte-identical to the one recorded in the rollback file
 * Run: node scripts/live/test_pay1_b1.cjs --local=54329 --pre   (local)
 *      node scripts/live/test_pay1_b1.cjs [--pre]               (project DB)
 */
require('../db/safe-net.cjs'); // SAFE-NET
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ROOT = path.resolve(__dirname, '..', '..');
const { Client } = require('pg');
const { pgClient } = require(path.join(ROOT, 'scripts/db/safe-net.cjs'));
const { withLiveTransaction } = require(path.join(ROOT, 'scripts/db/live-safety.cjs'));

const PRE = process.argv.includes('--pre');
const LOCAL = (process.argv.find((a) => a.startsWith('--local=')) || '').slice('--local='.length);
const SQL = fs.readFileSync(path.join(ROOT, 'supabase/migrations/20261116000140_pay1_b1_legacy_payment_retire.sql'), 'utf8');
const RB = fs.readFileSync(path.join(ROOT, 'docs/database/rollback/140_rollback.sql'), 'utf8');
const LEGACY = ['fn_create_payment_order', 'fn_process_payment_webhook', 'fn_verify_and_fulfill_payment'];
const F9 = ['fn_has_pro', 'fn_create_pro_order', 'fn_attach_gateway_order', 'fn_fulfil_pro_order', 'fn_mark_pro_order_failed', 'fn_refund_pro_payment', 'fn_grant_library_pro', 'fn_revoke_library_pro'];
const md5 = (s) => crypto.createHash('md5').update(String(s).replace(/\r\n/g, '\n').trim()).digest('hex');

let ok = true;
const chk = (n, cond, info) => {
  if (!cond) ok = false;
  console.log(`${cond ? 'PASS' : 'FAIL'} ${n}${cond ? '' : ' — ' + String(info ?? '').slice(0, 600)}`);
};
function client() {
  if (!LOCAL) return pgClient();
  if (!/^\d{4,5}$/.test(LOCAL)) throw new Error('--local=<port>');
  const c = new Client({ host: '127.0.0.1', port: Number(LOCAL), user: 'postgres', database: 'postgres' });
  c.on('error', () => {});
  return c;
}

(async () => {
  const c = client();
  await c.connect();
  const q = async (s, p) => (await c.query(s, p)).rows;
  try {
    await withLiveTransaction(c, async () => {
      if (PRE) await c.query(SQL);
      const present = async (names) => (await q(`select p.proname, p.prosecdef secdef, coalesce(p.proacl::text,'') acl, pg_get_functiondef(p.oid) def
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = any($1)`, [names]));
      const gone = await present(LEGACY);
      chk('B1-1 the three legacy payment functions are gone', gone.length === 0, gone.map((r) => r.proname).join(', '));

      const f9 = await present(F9);
      const clientAcl = (acl) => /(^|[{,])(anon|authenticated|)=/.test(acl);
      chk('B1-2 the 8 F9 payment functions are intact (SECURITY DEFINER, no client EXECUTE)',
        f9.length === F9.length && f9.every((r) => r.secdef && !clientAcl(r.acl)), JSON.stringify(f9.map((r) => ({ f: r.proname, secdef: r.secdef, client: clientAcl(r.acl) }))));

      const callers = (await q(`select count(*)::int n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.prosrc ~ $1`, [`(${LEGACY.join('|')})\\(`]))[0].n;
      chk('B1-3 no function in public calls a dropped function', callers === 0, `callers ${callers}`);

      // the rollback, inside this same (rolled-back) transaction
      await c.query(RB);
      const back = await present(LEGACY);
      const recorded = [...RB.matchAll(/(CREATE OR REPLACE FUNCTION public\.(fn_[a-z_]+)\([\s\S]*?\n\$function\$);/g)].reduce((m, x) => ((m[x[2]] = md5(x[1])), m), {});
      const same = back.every((r) => recorded[r.proname] && recorded[r.proname] === md5(r.def));
      const aclOk = back.every((r) => r.secdef && /service_role=X/.test(r.acl) && !clientAcl(r.acl));
      chk('B1-4 rollback 140 recreates the 3 byte-identically (SECDEF, EXECUTE postgres / service_role only)', back.length === 3 && same && aclOk,
        JSON.stringify({ back: back.length, recorded: Object.keys(recorded).length, same, aclOk }));
    });
  } catch (e) {
    ok = false;
    console.log(`FAIL — ${String(e && e.message ? e.message : e).slice(0, 300)}`);
  } finally {
    await c.end().catch(() => {});
  }
  console.log(`PAY-1 B1 live${LOCAL ? ' [LOCAL]' : ''}: ${ok ? 'ALL PASS' : 'FAILURES'}`);
  process.exitCode = ok ? 0 : 1;
})();
