#!/usr/bin/env node
/**
 * PAY-1 B7 — offline gate (no network, no DB; owner H1–H7 + conditions, 2026-11-19).
 *   B7-01 config: the refund policy is published (its page exists); checkout opens on a Preview / local only with a TEST
 *         key — a live key, even approved, is refused outside a production deployment (LIVE_KEY_OUTSIDE_PRODUCTION);
 *         production with an approved live key still opens (F9-C later); the 149/F9 order of reasons is kept
 *   B7-02 the run-sheet checker: the Preview URL must be the pay-b7-e2e branch alias (never production); production is
 *         only read anonymously (a GET of /pricing, an unsigned webhook POST that must answer 503); the only database
 *         write is the rolled-back S2 call (a test-mode order for a non-QA account); secrets come from .env.local only
 *   B7-03 the cleanup: test-mode orders AND QA accounts only; refuses on a non-QA test entitlement; DRY RUN by default,
 *         COMMIT only with --apply and nothing left active; an audit row per entitlement
 *   B7-04 the Vercel names check: production must have none of the payment names; the B7 names only branch-scoped; the
 *         value field is never read, decrypted or printed
 *   B7-05 negative controls: each mutation is caught
 * Run: node scripts/test_pay1_b7.cjs
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
let passed = 0;
let failed = 0;
const results = [];
async function test(name, fn) {
  try {
    const info = await fn();
    passed++;
    results.push(`  PASS  ${name}${info ? ' — ' + info : ''}`);
  } catch (e) {
    failed++;
    results.push(`  FAIL  ${name}\n        ${String(e && e.message ? e.message : e).slice(0, 900)}`);
  }
}
const assert = (c, m) => {
  if (!c) throw new Error(m || 'assertion failed');
};
const ts = require('typescript');
function loadTs(rel, src) {
  const filename = path.join(ROOT, rel);
  const m = new Module(filename, module);
  m.filename = filename;
  m.paths = Module._nodeModulePaths(path.dirname(filename));
  m._compile(ts.transpileModule(src ?? read(rel), { fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, filename);
  return m.exports;
}

const CFG_SRC = read('config/payments.ts');
const SHEET = read('scripts/live/test_pay1_b7.cjs');
const CLEAN = read('scripts/db/b7-cleanup.cjs');
const VENV = read('scripts/ops/vercel-env-names.cjs');

function checkConfig(C) {
  assert(C.REFUND_POLICY_PUBLISHED === true, 'the refund policy must be published for B7');
  assert(fs.existsSync(path.join(ROOT, 'app/(site)/refund-policy/page.tsx')), 'the refund policy page is missing');
  const base = { PAYMENTS_ENABLED: 'true', PRO_ENABLED: 'true', RAZORPAY_KEY_SECRET: 's', RAZORPAY_WEBHOOK_SECRET: 'w' };
  const T = 'rzp_test_ABCdef123456';
  const L = 'rzp_live_ABCdef123456';
  const st = (env) => C.checkoutState({ ...base, ...env });
  assert(st({ RAZORPAY_KEY_ID: T, VERCEL_ENV: 'preview' }).open === true && st({ RAZORPAY_KEY_ID: T, VERCEL_ENV: 'preview' }).mode === 'test', 'Preview + test key → open (test)');
  assert(st({ RAZORPAY_KEY_ID: T }).open === true, 'local + test key → open');
  assert(st({ RAZORPAY_KEY_ID: L, VERCEL_ENV: 'preview', RAZORPAY_LIVE_APPROVED: 'true' }).reason === 'LIVE_KEY_OUTSIDE_PRODUCTION', 'Preview + approved live key must be refused');
  assert(st({ RAZORPAY_KEY_ID: L, RAZORPAY_LIVE_APPROVED: 'true' }).reason === 'LIVE_KEY_OUTSIDE_PRODUCTION', 'local + approved live key must be refused');
  assert(st({ RAZORPAY_KEY_ID: L, VERCEL_ENV: 'preview' }).reason === 'LIVE_KEY_NOT_APPROVED', 'an unapproved live key → LIVE_KEY_NOT_APPROVED (F9 order kept)');
  assert(st({ RAZORPAY_KEY_ID: L, VERCEL_ENV: 'production', RAZORPAY_LIVE_APPROVED: 'true' }).open === true, 'production + approved live key → open (F9-C)');
  assert(C.checkoutState({ ...base, RAZORPAY_KEY_ID: T, PAYMENTS_ENABLED: undefined }).reason === 'PAYMENTS_OFF', 'no switch → PAYMENTS_OFF');
  assert(typeof C.CHECKOUT_CLOSED_MESSAGE.LIVE_KEY_OUTSIDE_PRODUCTION === 'string', 'a message for the new reason');
  return '7 cases';
}

function checkSheet(src) {
  assert(/!\/-git-pay-b7-e2e-\[a-z0-9-\]\+\\\.vercel\\\.app\$\/\.test\(h\.hostname\)/.test(src) && /if \(u\.startsWith\(PROD\)\) throw/.test(src), 'the Preview URL must be the B7 branch alias, never production');
  const prodUses = [...src.matchAll(/\$\{PROD\}([^`]*)`/g)].map((m) => m[1]);
  assert(prodUses.length === 2 && prodUses.includes('/pricing') && prodUses.includes('/api/webhooks/razorpay'), `production touched beyond /pricing + the unsigned webhook: ${prodUses.join(', ')}`);
  assert(/\$\{PROD\}\/api\/webhooks\/razorpay`, \{ method: 'POST', body: '\{\}'/.test(src) && !/\$\{PROD\}[^`]*`[^)]*(authorization|x-vercel-protection-bypass|x-razorpay-signature)/i.test(src), 'the production webhook call must be unsigned and carry no secret');
  const writes = [...src.matchAll(/\{ write: true \}/g)].length;
  assert(writes === 1, `exactly one (rolled-back) write block (${writes})`);
  const w = src.slice(src.indexOf("await withDb(async (c) => {\n        const [nonQa]"), src.indexOf('}, { write: true });'));
  assert(/fn_create_pro_order\(\$1, 'PRO_3M', 'k-b7-s2-nonqa-01', 'test'\)/.test(w) && /not like '%@courage-library\.test'/.test(w) && !/insert|update|delete/i.test(w.replace(/fn_create_pro_order/g, '')), 'the write block is only the S2 refusal');
  assert(/if \(write\) return await withLiveTransaction\(c, \(\) => fn\(c\)\);/.test(src), 'the write block is rolled back (withLiveTransaction)');
  assert(/await safeBegin\(c, \{ readOnly: true \}\);/.test(src), 'every other step is read-only');
  assert(!/console\.log\([^)]*(secret|SECRET|bypass)/.test(src.replace(/VERCEL_AUTOMATION_BYPASS_SECRET is not set|B7_CRON_SECRET is not set/g, '')), 'a secret may be printed');
  assert(/require\('\.\.\/db\/safe-net\.cjs'\)/.test(src), 'SAFE-NET');
}

function checkCleanup(src) {
  assert((src.match(/o\.gateway_mode = 'test' and e\.is_active and e\.revoked_at is null/g) || []).length === 2, 'test-mode orders only (the revoke list and the left-over count)');
  assert(/if \(nonQa\.length\) throw new Error\(`REFUSED/.test(src), 'refuses on a non-QA test entitlement');
  assert(/const APPLY = process\.argv\.includes\('--apply'\);/.test(src) && /if \(APPLY\) \{\s+if \(left !== 0\) throw[\s\S]*?await c\.query\('COMMIT'\);/.test(src), 'COMMIT only with --apply and nothing left');
  assert((src.match(/'COMMIT'/g) || []).length === 1, 'one COMMIT only');
  assert(/'PRO_B7_CLEANUP'/.test(src), 'audit row');
  assert(/hashtextextended\('pro_entitlement:'/.test(src), 'the per-user Pro lock');
  assert(/require\('\.\/safe-net\.cjs'\)/.test(src), 'SAFE-NET');
}

function checkVenv(src) {
  assert(/const PAYMENT_NAMES = \['PAYMENTS_ENABLED', 'PRO_ENABLED', 'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET', 'RAZORPAY_LIVE_APPROVED'\];/.test(src), 'the production payment names');
  assert(!/\.value\b|decrypt=true|decrypt: true/.test(src), 'the value field must never be read or decrypted');
  assert(/\.map\(\(e\) => \(\{ key: String\(e\.key\), target: [^}]*branch: e\.gitBranch \|\| null \}\)\)/.test(src), 'only names / targets / branch are kept');
  assert(/v\.target\.includes\('preview'\) && !v\.branch && B7_NAMES\.includes\(v\.key\)/.test(src), 'no B7 name for all Previews');
  assert(!/console\.log\([^)]*\$\{token/.test(src) && !/console\.log\(token/.test(src), 'the token may be printed');
}

(async () => {
  const C = loadTs('config/payments.ts');
  await test('B7-01 config: policy published; test keys only outside production', () => checkConfig(C));
  await test('B7-02 the run-sheet checker (Preview only, production read anonymously, one rolled-back write)', () => checkSheet(SHEET));
  await test('B7-03 the cleanup (QA + test-mode only, dry run by default, audited)', () => checkCleanup(CLEAN));
  await test('B7-04 the Vercel names check (names only, never values)', () => checkVenv(VENV));
  await test('B7-05 negative controls: each mutation is caught', async () => {
    const mut = (s, a, b) => { assert(s.includes(a), `mutation anchor missing: ${a.slice(0, 60)}`); return s.replace(a, b); };
    const cases = [
      ['config: no outside-production guard', () => checkConfig(loadTs('config/payments.ts', mut(CFG_SRC, '  if (mode === "live" && env.VERCEL_ENV !== "production") return { open: false, reason: "LIVE_KEY_OUTSIDE_PRODUCTION" };\n', '')))],
      ['config: guard only on preview', () => checkConfig(loadTs('config/payments.ts', mut(CFG_SRC, 'env.VERCEL_ENV !== "production"', 'env.VERCEL_ENV === "preview"')))],
      ['config: policy unpublished', () => checkConfig(loadTs('config/payments.ts', mut(CFG_SRC, 'export const REFUND_POLICY_PUBLISHED = true;', 'export const REFUND_POLICY_PUBLISHED = false;')))],
      ['sheet: any preview URL', () => checkSheet(mut(SHEET, "!/-git-pay-b7-e2e-[a-z0-9-]+\\.vercel\\.app$/.test(h.hostname)", 'false'))],
      ['sheet: production reconcile', () => checkSheet(mut(SHEET, '${base}/api/cron/reconcile', '${PROD}/api/cron/reconcile'))],
      ['sheet: signed production webhook', () => checkSheet(mut(SHEET, "`${PROD}/api/webhooks/razorpay`, { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' }", "`${PROD}/api/webhooks/razorpay`, { method: 'POST', body: '{}', headers: { 'content-type': 'application/json', authorization: envLocal('B7_CRON_SECRET') }"))],
      ['sheet: committed write', () => checkSheet(mut(SHEET, 'if (write) return await withLiveTransaction(c, () => fn(c));', "if (write) { await c.query('BEGIN'); const r = await fn(c); await c.query('COMMIT'); return r; }"))],
      ['sheet: prints the bypass secret', () => checkSheet(mut(SHEET, "  return { 'x-vercel-protection-bypass': s };", "  console.log('bypass', s);\n  return { 'x-vercel-protection-bypass': s };"))],
      ['cleanup: live orders too', () => checkCleanup(mut(CLEAN, "where o.gateway_mode = 'test' and e.is_active", "where e.is_active"))],
      ['cleanup: no non-QA refusal', () => checkCleanup(mut(CLEAN, 'if (nonQa.length) throw new Error(`REFUSED', 'if (false) throw new Error(`REFUSED'))],
      ['cleanup: commits on dry run', () => checkCleanup(mut(CLEAN, "      await c.query('ROLLBACK');\n      done = true;\n      console.log(`B7-CLEANUP DRY RUN", "      await c.query('COMMIT');\n      done = true;\n      console.log(`B7-CLEANUP DRY RUN"))],
      ['venv: reads values', () => checkVenv(mut(VENV, 'branch: e.gitBranch || null }', 'branch: e.gitBranch || null, value: e.value }'))],
      ['venv: misses RAZORPAY_LIVE_APPROVED', () => checkVenv(mut(VENV, ", 'RAZORPAY_WEBHOOK_SECRET', 'RAZORPAY_LIVE_APPROVED'];", ", 'RAZORPAY_WEBHOOK_SECRET'];"))],
    ];
    const missed = [];
    for (const [name, fn] of cases) {
      try { await fn(); missed.push(name); } catch (e) { if (/mutation anchor missing/.test(String(e.message))) missed.push(`${name}: ${e.message}`); }
    }
    assert(missed.length === 0, `not caught: ${missed.join(' | ')}`);
    return `${cases.length} mutations caught`;
  });
  console.log(results.join('\n'));
  console.log(`\nPAY1-B7: ${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
})();
