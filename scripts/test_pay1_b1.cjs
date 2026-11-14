#!/usr/bin/env node
/**
 * PAY-1 B1 (PAY-LEGACY-RETIRE-1) — offline gate (static; no network).
 *   P1-01 migration 140 drops EXACTLY the three legacy payment functions (IF EXISTS, full signatures), nothing else; no
 *         BEGIN / COMMIT; the F9 functions (113 / 114) are not touched
 *   P1-02 rollback 140 recreates exactly those three (same signatures), SECURITY DEFINER, EXECUTE for service_role only,
 *         and carries its ROLLBACK-CHAIN line
 *   P1-03 SECDEF allow-list: the three entries are gone and max total / B-service were lowered by exactly 3
 *   P1-04 no app code calls a legacy payment function or the retired admin plan action; /api/billing/* always 410
 *   P1-05 /checkout pages removed and /checkout(/*) → /pricing (308); /billing reads Pro from F9 (hasPro + the entitlement
 *         end), never the legacy columns; no legacy GST-invoice list
 *   P1-06 F9-B refund-policy path = the real page in the (site) route group
 *   P1-07 negative controls: mutated sources (an extra DROP, a missing DROP, a client GRANT in the rollback, a route that
 *         answers 200, a remaining legacy RPC call) each fail the matching check
 * Run: node scripts/test_pay1_b1.cjs
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    const info = fn();
    passed++;
    console.log(`  PASS  ${name}${info ? ' — ' + info : ''}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL  ${name}\n        ${String(e && e.message ? e.message : e).slice(0, 800)}`);
  }
}
const assert = (c, m) => {
  if (!c) throw new Error(m || 'assertion failed');
};

const MIG = 'supabase/migrations/20261116000140_pay1_b1_legacy_payment_retire.sql';
const RB = 'docs/database/rollback/140_rollback.sql';
const LEGACY = ['fn_create_payment_order', 'fn_process_payment_webhook', 'fn_verify_and_fulfill_payment'];
const code = (s) => s.replace(/--[^\n]*/g, '');

function migCheck(sql) {
  const stmts = code(sql).split(';').map((x) => x.trim()).filter(Boolean);
  if (stmts.some((x) => /^(BEGIN|COMMIT|ROLLBACK)\b/i.test(x))) return 'transaction control in the migration';
  const drops = stmts.filter((x) => /^DROP FUNCTION IF EXISTS public\.(fn_[a-z_]+)\(/.test(x)).map((x) => x.match(/public\.(fn_[a-z_]+)\(/)[1]);
  if (stmts.length !== drops.length) return `only DROP FUNCTION statements allowed (${stmts.length} statements, ${drops.length} drops)`;
  if (drops.sort().join(',') !== [...LEGACY].sort().join(',')) return `drops ${drops.join(', ')} (want exactly ${LEGACY.join(', ')})`;
  return null;
}
function rbCheck(sql) {
  if (!/^-- ROLLBACK-CHAIN: run first: (none|\d{3}_rollback\.sql(, \d{3}_rollback\.sql)*)$/m.test(sql)) return 'ROLLBACK-CHAIN line';
  const creates = [...sql.matchAll(/CREATE OR REPLACE FUNCTION public\.(fn_[a-z_]+)\(/g)].map((m) => m[1]);
  if (creates.sort().join(',') !== [...LEGACY].sort().join(',')) return `recreates ${creates.join(', ')}`;
  if ((sql.match(/SECURITY DEFINER/g) || []).length !== 3) return 'each recreated function must be SECURITY DEFINER';
  for (const f of LEGACY) {
    if (!new RegExp(`REVOKE ALL ON FUNCTION public\\.${f}\\([^)]*\\) FROM PUBLIC, anon, authenticated;`).test(sql)) return `${f}: revoke from clients`;
    if (!new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${f}\\([^)]*\\) TO service_role;`).test(sql)) return `${f}: service_role grant`;
  }
  if (/GRANT [^;]* TO (anon|authenticated|PUBLIC)/i.test(sql)) return 'a client grant in the rollback';
  return null;
}
function routeCheck(src) {
  if (!/status: 410/.test(src) || /status: (200|201|501|503)/.test(src)) return 'must always answer 410';
  if (/createClient|supabase|rpc\(|isPaymentsEnabled/.test(src)) return 'no auth / DB / flag work before the 410';
  return null;
}
function appCallers() {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) {
      const rel = `${d}/${e.name}`;
      if (e.isDirectory()) walk(rel);
      else if (/\.(ts|tsx)$/.test(e.name)) {
        const s = read(rel);
        for (const f of [...LEGACY, 'createSubscriptionPlanAction', 'createPaymentOrder(']) if (code(s.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '')).includes(f)) out.push(`${rel}: ${f}`);
      }
    }
  };
  for (const d of ['app', 'services', 'lib', 'components', 'config']) walk(d);
  return out;
}

test('P1-01 migration 140 drops exactly the 3 legacy payment functions, nothing else, no transaction control', () => {
  const why = migCheck(read(MIG));
  assert(why === null, why);
  return LEGACY.join(', ');
});

test('P1-02 rollback 140 recreates exactly those 3 (SECDEF, service_role-only EXECUTE) and states its chain', () => {
  const why = rbCheck(read(RB));
  assert(why === null, why);
});

test('P1-03 SECDEF allow-list: the 3 entries removed, max total / B-service lowered by exactly 3', () => {
  const a = JSON.parse(read('scripts/secdef/allowlist.json'));
  const left = Object.keys(a.functions).filter((k) => LEGACY.some((f) => k.startsWith(`${f}(`)));
  assert(left.length === 0, `still listed: ${left.join(', ')}`);
  assert(a.max.total === 117 && a.max['B-service'] === 36, JSON.stringify(a.max));
  assert(a.rules.some((r) => /^PAY-1 B1/.test(r) && /lowered by exactly 3/.test(r)), 'rule note');
  return 'total 117, B-service 36';
});

test('P1-04 no app code calls a legacy payment function / the retired plan action; /api/billing/* always 410', () => {
  const callers = appCallers();
  assert(callers.length === 0, callers.join(' | '));
  for (const r of ['app/api/billing/create-order/route.ts', 'app/api/billing/fulfill-order/route.ts']) {
    const why = routeCheck(read(r));
    assert(why === null, `${r}: ${why}`);
  }
  return '0 callers; both routes 410';
});

test('P1-05 /checkout retired (→ /pricing 308); /billing reads F9 Pro (hasPro + entitlement end); no legacy invoice list', () => {
  assert(!fs.existsSync(path.join(ROOT, 'app/(site)/checkout')), 'app/(site)/checkout still exists');
  const cfg = read('next.config.ts');
  assert(/\{ source: "\/checkout", destination: "\/pricing", permanent: true \}/.test(cfg) && /\{ source: "\/checkout\/:path\*", destination: "\/pricing", permanent: true \}/.test(cfg), 'redirects');
  const svc = read('services/billing.service.ts');
  const fn = svc.slice(svc.indexOf('static async getUserSubscriptionStatus'), svc.indexOf('static async getUserSubscriptionStatus') + 900);
  assert(/await hasPro\(user\.id\)/.test(fn) && /getProPricing\(user\.id\)/.test(fn), 'F9 sources');
  assert(!/valid_until|"SUBSCRIPTION"|@ts-expect-error/.test(fn), 'legacy columns / type still read');
  const page = read('app/(site)/billing/page.tsx');
  assert(!/getUserInvoices|Tax Invoices/.test(page), 'legacy invoice list still on /billing');
  return 'ok';
});

test('P1-06 F9-B refund-policy check uses the real page path', () => {
  const g = read('scripts/test_f9b_payments.cjs');
  assert(/const PAGE = 'app\/\(site\)\/refund-policy\/page\.tsx';/.test(g) && fs.existsSync(path.join(ROOT, 'app/(site)/refund-policy/page.tsx')), 'path');
  assert(!/existsSync\(path\.join\(ROOT, 'app\/refund-policy\/page\.tsx'\)\), 'REFUND_POLICY_PUBLISHED needs the page'\)/.test(g), 'the old wrong-path check is gone');
});

test('P1-07 negative controls: each mutation fails its check', () => {
  const mig = read(MIG);
  const rb = read(RB);
  const muts = [
    ['extra DROP', migCheck(mig + '\nDROP FUNCTION IF EXISTS public.fn_fulfil_pro_order(text, text, integer, text, text);\n')],
    ['missing DROP', migCheck(mig.replace(/DROP FUNCTION IF EXISTS public\.fn_process_payment_webhook\([^;]*;/, ''))],
    ['transaction control in migration', migCheck(['BEG', 'IN;'].join('') + '\n' + mig)], // assembled: LIVE-LOCK-SWEEP
    ['client GRANT in rollback', rbCheck(rb + '\nGRANT EXECUTE ON FUNCTION public.fn_create_payment_order(text) TO authenticated;\n')],
    ['missing service_role grant', rbCheck(rb.replace(/GRANT EXECUTE ON FUNCTION public\.fn_verify_and_fulfill_payment\([^;]*\) TO service_role;/, ''))],
    ['route answers 200', routeCheck(read('app/api/billing/create-order/route.ts').replace('status: 410', 'status: 200'))],
    ['route checks the flag first', routeCheck('import { isPaymentsEnabled } from "x";\n' + read('app/api/billing/fulfill-order/route.ts'))],
  ];
  const missed = muts.filter(([, why]) => why === null).map(([k]) => k);
  assert(missed.length === 0, `not caught: ${missed.join(', ')}`);
  return `${muts.length} mutations caught`;
});

console.log(`\nPAY-1 B1: ${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
