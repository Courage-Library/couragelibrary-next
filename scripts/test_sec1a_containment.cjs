/**
 * COURAGE LIBRARY — SEC-1A EMERGENCY CONTAINMENT TEST SUITE
 * Verifies S1 (admin escalation via user_metadata) and S2 (unverified payment
 * fulfilment) containment.
 *
 * Fully offline: does NOT read .env.local, open network connections, or touch
 * any database. All Supabase / billing dependencies are replaced with mocks.
 */

const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');

// Ensure no real credentials can be used even if present in the shell.
for (const k of Object.keys(process.env)) {
  if (/SUPABASE|POSTGRES|DATABASE_URL|ADMIN_EMAILS|PAYMENTS_ENABLED/.test(k)) delete process.env[k];
}

// ---------- TS transpile + @/ alias (same pattern as other suites) ----------
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request.startsWith('@/')) {
    const target = path.resolve(ROOT, request.slice(2));
    return originalResolveFilename.call(this, target, parent, isMain, options);
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

require.extensions['.ts'] = function (module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const result = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.React,
      esModuleInterop: true,
    },
  });
  module._compile(result.outputText, filename);
};

// ---------- Mocks ----------
let currentUser = null;
const spies = { rpc: 0, createClient: 0, createPaymentOrder: 0, getUser: 0 };

const mockSupabaseClient = () => ({
  auth: {
    getUser: async () => {
      spies.getUser++;
      return { data: { user: currentUser } };
    },
  },
  rpc: async () => {
    spies.rpc++;
    return { data: null, error: { message: 'mock' } };
  },
});

const MOCKS = {
  'server-only': {}, // SEC-1B: Next.js-only marker imported by lib/auth/require-admin.ts
  '@/lib/supabase/server': {
    createServerSupabaseClient: async () => mockSupabaseClient(),
    createAdminServerSupabaseClient: () => mockSupabaseClient(),
  },
  '@/services/user-profile.service': {
    UserProfileService: { ensureProfile: async () => null },
  },
  '@supabase/supabase-js': {
    createClient: () => {
      spies.createClient++;
      return mockSupabaseClient();
    },
  },
  '@/services/billing.service': {
    BillingService: {
      createPaymentOrder: async () => {
        spies.createPaymentOrder++;
        return { success: true, order_id: 'mock' };
      },
    },
  },
};

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (Object.prototype.hasOwnProperty.call(MOCKS, request)) return MOCKS[request];
  return originalLoad.call(this, request, parent, isMain);
};

// ---------- Harness ----------
let passed = 0;
let failed = 0;
const results = [];
async function test(name, fn) {
  try {
    await fn();
    passed++;
    results.push(`  PASS  ${name}`);
  } catch (e) {
    failed++;
    results.push(`  FAIL  ${name}\n        ${e && e.message ? e.message : e}`);
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}
function resetSpies() {
  for (const k of Object.keys(spies)) spies[k] = 0;
}
function fakeRequest(body, withSession) {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (withSession) headers.set('Cookie', 'sb-mock-auth-token=fake');
  return new Request('http://localhost/api/test', { method: 'POST', headers, body: JSON.stringify(body) });
}

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

(async () => {
  const { AdminService } = require(path.join(ROOT, 'services/admin.service.ts'));
  const check = async (user, adminEmails) => {
    if (adminEmails === undefined) delete process.env.ADMIN_EMAILS;
    else process.env.ADMIN_EMAILS = adminEmails;
    currentUser = user;
    return AdminService.checkIsAdminOrStaff();
  };

  // ===================== S1 =====================
  console.log('\n[S1] Admin authorization');

  await test('S1-1 user_metadata.role=admin, no app_metadata, email not listed -> false', async () => {
    const r = await check({ id: 'u1', email: 'attacker@example.com', user_metadata: { role: 'admin' }, app_metadata: {} }, 'owner@example.com');
    assert(r.isAdmin === false, `got ${r.isAdmin}`);
  });
  await test('S1-2 user_metadata.role=staff -> false', async () => {
    const r = await check({ id: 'u2', email: 'attacker@example.com', user_metadata: { role: 'staff' }, app_metadata: {} }, 'owner@example.com');
    assert(r.isAdmin === false, `got ${r.isAdmin}`);
  });
  await test('S1-3 user_metadata.role=admin with ADMIN_EMAILS unset -> false', async () => {
    const r = await check({ id: 'u3', email: 'attacker@example.com', user_metadata: { role: 'admin' } }, undefined);
    assert(r.isAdmin === false, `got ${r.isAdmin}`);
  });
  await test('S1-4 app_metadata.role=admin -> true', async () => {
    const r = await check({ id: 'u4', email: 'x@example.com', app_metadata: { role: 'admin' } }, undefined);
    assert(r.isAdmin === true, `got ${r.isAdmin}`);
  });
  await test('S1-5 app_metadata.role=staff -> true', async () => {
    const r = await check({ id: 'u5', email: 'x@example.com', app_metadata: { role: 'staff' } }, '');
    assert(r.isAdmin === true, `got ${r.isAdmin}`);
  });
  await test('S1-6 email in ADMIN_EMAILS (case-insensitive, trimmed) -> true', async () => {
    const r = await check({ id: 'u6', email: 'Owner@Example.COM' }, '  other@example.com ,  OWNER@example.com  ');
    assert(r.isAdmin === true, `got ${r.isAdmin}`);
    assert(r.userId === 'u6' && r.userEmail === 'Owner@Example.COM', 'return shape changed');
  });
  await test('S1-7 ADMIN_EMAILS unset + no app_metadata -> false for previously hard-coded addresses', async () => {
    // Previously hard-coded fallback addresses, read from the pre-SEC-1A commit so no
    // personal address is stored in this file.
    let legacy = [];
    try {
      const old = require('child_process').execFileSync('git', ['show', 'b8bd693:services/admin.service.ts'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      const m = old.match(/process\.env\.ADMIN_EMAILS \|\| "([^"]+)"/);
      if (m) legacy = m[1].split(',').map((e) => e.trim());
    } catch { /* history unavailable */ }
    assert(legacy.length > 0, 'could not load legacy addresses from git history');
    for (const email of legacy) {
      for (const env of [undefined, '', ' , ']) {
        const r = await check({ id: 'u7', email }, env);
        assert(r.isAdmin === false, `legacy address granted admin with ADMIN_EMAILS=${JSON.stringify(env)}`);
      }
    }
  });
  await test('S1-8 ADMIN_EMAILS empty string does not match empty/odd emails', async () => {
    const r1 = await check({ id: 'u8', email: '' }, '');
    const r2 = await check({ id: 'u8', email: undefined }, ',,');
    assert(r1.isAdmin === false && r2.isAdmin === false, 'empty entries matched');
  });
  await test('S1-9 no user -> false', async () => {
    const r = await check(null, 'owner@example.com');
    assert(r.isAdmin === false && r.userId === undefined, `got ${JSON.stringify(r)}`);
  });
  await test('S1-10 static: admin.service.ts has no user_metadata role check', async () => {
    const src = read('services/admin.service.ts');
    assert(!/user_metadata\??\.role/.test(src), 'user_metadata.role still referenced');
  });
  await test('S1-11 static: admin.service.ts contains no @gmail.com literal', async () => {
    const src = read('services/admin.service.ts');
    assert(!src.includes('@gmail.com'), 'gmail literal present');
  });
  await test('S1-12 static: no user_metadata role-based authorization anywhere in app/services/lib/actions/components', async () => {
    const offenders = [];
    const walk = (dir) => {
      if (!fs.existsSync(dir)) return;
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, ent.name);
        if (ent.isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(ent.name) && /user_metadata\??\.role/.test(fs.readFileSync(p, 'utf8'))) offenders.push(path.relative(ROOT, p));
      }
    };
    ['app', 'services', 'lib', 'actions', 'components'].forEach((d) => walk(path.join(ROOT, d)));
    assert(offenders.length === 0, `offenders: ${offenders.join(', ')}`);
  });

  // ===================== S2 =====================
  console.log('[S2] Payment containment');
  const fulfill = require(path.join(ROOT, 'app/api/billing/fulfill-order/route.ts'));
  const createOrder = require(path.join(ROOT, 'app/api/billing/create-order/route.ts'));

  const bodies = [
    {},
    { orderId: '00000000-0000-0000-0000-000000000000', gatewayPaymentId: 'pay_1234567890123_abcdef', gatewaySignature: 'sig_x', amount: 1 },
  ];

  await test('S2-1 fulfill-order POST (no session / fake session, any body) -> 503, RPC never invoked', async () => {
    delete process.env.PAYMENTS_ENABLED;
    for (const body of bodies) {
      for (const withSession of [false, true]) {
        currentUser = withSession ? { id: 'u', email: 'x@example.com' } : null;
        resetSpies();
        const res = await fulfill.POST(fakeRequest(body, withSession));
        const json = await res.json();
        assert(res.status === 503, `status ${res.status}`);
        assert(json.success === false && json.error && json.error.code === 'PAYMENTS_TEMPORARILY_DISABLED', JSON.stringify(json));
        assert(json.error.message === 'Online payments are temporarily unavailable.', 'message mismatch');
        assert(spies.rpc === 0 && spies.createClient === 0 && spies.getUser === 0, `spies ${JSON.stringify(spies)}`);
      }
    }
  });
  await test('S2-2 fulfill-order with PAYMENTS_ENABLED=true still never fulfils (501, no RPC)', async () => {
    process.env.PAYMENTS_ENABLED = 'true';
    resetSpies();
    const res = await fulfill.POST(fakeRequest(bodies[1], true));
    assert(res.status === 501, `status ${res.status}`);
    assert(spies.rpc === 0 && spies.createClient === 0, `spies ${JSON.stringify(spies)}`);
    delete process.env.PAYMENTS_ENABLED;
  });
  await test('S2-3 create-order POST -> 503 and BillingService never invoked', async () => {
    delete process.env.PAYMENTS_ENABLED;
    resetSpies();
    const res = await createOrder.POST(fakeRequest({ orderType: 'SUBSCRIPTION_PURCHASE', planId: 'p' }, true));
    const json = await res.json();
    assert(res.status === 503 && json.error.code === 'PAYMENTS_TEMPORARILY_DISABLED', `status ${res.status}`);
    assert(spies.createPaymentOrder === 0, 'createPaymentOrder was called');
  });
  await test('S2-4 flag is strict: only "true" enables (unset/""/"1"/"TRUE"/"false" -> 503)', async () => {
    for (const v of [undefined, '', '1', 'TRUE', 'yes', 'false']) {
      if (v === undefined) delete process.env.PAYMENTS_ENABLED;
      else process.env.PAYMENTS_ENABLED = v;
      const a = await fulfill.POST(fakeRequest({}, false));
      const b = await createOrder.POST(fakeRequest({}, false));
      assert(a.status === 503 && b.status === 503, `PAYMENTS_ENABLED=${JSON.stringify(v)} -> ${a.status}/${b.status}`);
    }
    delete process.env.PAYMENTS_ENABLED;
  });
  await test('S2-5 create-order with PAYMENTS_ENABLED=true reaches BillingService (gate is the flag)', async () => {
    process.env.PAYMENTS_ENABLED = 'true';
    resetSpies();
    const res = await createOrder.POST(fakeRequest({ planId: 'p' }, true));
    assert(res.status === 200 && spies.createPaymentOrder === 1, `status ${res.status}, calls ${spies.createPaymentOrder}`);
    delete process.env.PAYMENTS_ENABLED;
  });
  await test('S2-6 static: fulfill-order route has no anon-key fallback / admin client / RPC', async () => {
    const src = read('app/api/billing/fulfill-order/route.ts');
    assert(!src.includes('NEXT_PUBLIC_SUPABASE_ANON_KEY'), 'anon key referenced');
    assert(!src.includes('SUPABASE_SERVICE_ROLE_KEY'), 'service role key referenced');
    assert(!src.includes('createClient'), 'createClient present');
    assert(!src.includes('fn_verify_and_fulfill_payment'), 'RPC still referenced');
  });
  await test('S2-7 static: checkout-client.tsx no longer fabricates pay_ ids or calls fulfill-order', async () => {
    const src = read('app/checkout/[orderId]/checkout-client.tsx');
    assert(!/`pay_\$\{/.test(src) && !src.includes('mockPaymentId'), 'pay_ id generation present');
    assert(!src.includes('/api/billing/fulfill-order'), 'fulfill-order call present');
  });
  await test('S2-8 static: payments flag is server-side only (no NEXT_PUBLIC_ variant)', async () => {
    const src = read('config/payments.ts');
    assert(src.includes('process.env.PAYMENTS_ENABLED === "true"'), 'strict flag check missing');
    assert(!src.includes('process.env.NEXT_PUBLIC_'), 'public flag present');
    const pricing = read('app/pricing/pricing-client.tsx');
    assert(!pricing.includes('process.env'), 'client reads env');
    assert(read('app/pricing/page.tsx').includes('isPaymentsEnabled()'), 'pricing page does not pass server flag');
  });

  console.log(results.join('\n'));
  console.log(`\nSEC-1A containment: ${passed}/${passed + failed} passed`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => {
  console.error('Suite crashed:', e && e.message ? e.message : e);
  process.exit(1);
});
