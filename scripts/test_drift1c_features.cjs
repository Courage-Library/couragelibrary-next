/**
 * COURAGE LIBRARY — DRIFT-1c FEATURE QUARANTINE OFFLINE TEST SUITE
 *
 * Fully offline: no network, no .env.local, no database. Every service module and the
 * Supabase server client are replaced by call-recording mocks, so the suite proves that
 * gated pages / API routes / server actions stop BEFORE any auth, DB or service call.
 * Run: node scripts/test_drift1c_features.cjs
 */

const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
for (const k of Object.keys(process.env)) {
  if (/SUPABASE|POSTGRES|DATABASE_URL|ADMIN_EMAILS|^FEATURE_/.test(k)) delete process.env[k];
}

// ---------- TS/TSX transpile + @/ alias ----------
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request.startsWith('@/')) return originalResolve.call(this, path.resolve(ROOT, request.slice(2)), parent, isMain, options);
  return originalResolve.call(this, request, parent, isMain, options);
};
const compile = (module, filename) => {
  const out = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
    fileName: filename,
  });
  module._compile(out.outputText, filename);
};
require.extensions['.ts'] = compile;
require.extensions['.tsx'] = compile;

// ---------- call-recording mocks for every service + supabase + admin auth ----------
const calls = [];
const recorder = (label) =>
  new Proxy(function () {}, {
    get: (_t, prop) => {
      if (prop === 'then') return undefined;
      if (prop === '__esModule') return true;
      return recorder(`${label}.${String(prop)}`);
    },
    apply: () => {
      calls.push(label);
      return Promise.resolve({ data: null, error: null });
    },
  });
const MOCK_PREFIXES = ['@/services/', '@/lib/supabase/'];
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'server-only') return {}; // SEC-1B: Next.js-only marker (lib/auth/require-admin.ts)
  if (MOCK_PREFIXES.some((p) => request.startsWith(p))) return recorder(request);
  if (request === 'next/cache') return { revalidatePath: () => calls.push('revalidatePath'), revalidateTag: () => undefined, unstable_cache: (fn) => fn };
  if (request === 'next/headers') return { cookies: async () => { calls.push('cookies'); return { get: () => undefined, getAll: () => [] }; }, headers: async () => new Map() };
  return originalLoad.call(this, request, parent, isMain);
};

// ---------- harness ----------
let passed = 0, failed = 0;
const lines = [];
async function test(name, fn) {
  try { const info = await fn(); passed++; lines.push(`  PASS  ${name}${info ? ' — ' + info : ''}`); }
  catch (e) { failed++; lines.push(`  FAIL  ${name}\n        ${e && e.message ? e.message : e}`); }
}
const assert = (c, m) => { if (!c) throw new Error(m || 'assertion failed'); };
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const load = (rel) => require(path.join(ROOT, rel));
const isNotFound = (e) => e && (String(e.digest || '').includes('NEXT_HTTP_ERROR_FALLBACK;404') || String(e.digest || '') === 'NEXT_NOT_FOUND' || /NEXT_NOT_FOUND|NEXT_HTTP_ERROR_FALLBACK/.test(String(e.message)));
const params = (obj) => ({ params: Promise.resolve(obj), searchParams: Promise.resolve({}) });

(async () => {
  const F = load('config/features.ts');

  // ===================== Flag parsing =====================
  await test('FLAG-1 all four flags default OFF when unset', async () => {
    const f = F.getFeatureFlags();
    assert(Object.values(f).every((v) => v === false), JSON.stringify(f));
  });
  await test('FLAG-2 only exactly "true" enables; any other explicit value disables', async () => {
    for (const [v, want] of [['true', true], ['TRUE', false], ['1', false], ['yes', false], ['false', false], [' true', false]]) {
      process.env.FEATURE_LIVE_TESTS = v;
      assert(F.isFeatureEnabled('LIVE_TESTS') === want, `FEATURE_LIVE_TESTS=${JSON.stringify(v)}`);
    }
    delete process.env.FEATURE_LIVE_TESTS;
  });
  await test('FLAG-3 server-only: no NEXT_PUBLIC_ flag and no client module imports config/features', async () => {
    assert(!/NEXT_PUBLIC_/.test(read('config/features.ts').replace(/\/\*[\s\S]*?\*\//, '')), 'NEXT_PUBLIC_ in flags');
    const walk = (d, acc = []) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p, acc); } else if (/\.(ts|tsx)$/.test(e.name)) acc.push(p); } return acc; };
    const offenders = ['app', 'components', 'lib'].flatMap((d) => walk(path.join(ROOT, d))).filter((f) => {
      const s = fs.readFileSync(f, 'utf8');
      return /^\s*["']use client["']/.test(s) && /config\/features/.test(s);
    });
    assert(offenders.length === 0, offenders.map((o) => path.relative(ROOT, o)).join(', '));
  });

  // ===================== Pages → notFound before any call =====================
  const pages = [
    ['app/live-tests/page.tsx', {}],
    ['app/live-tests/[slug]/page.tsx', { slug: 'x' }],
    ['app/live-tests/[slug]/take/page.tsx', { slug: 'x' }],
    ['app/live-tests/[slug]/result/page.tsx', { slug: 'x' }],
    ['app/live-tests/[slug]/submitted/page.tsx', { slug: 'x' }],
    ['app/certificates/page.tsx', {}],
    ['app/verify/c/[code]/page.tsx', { code: 'ABC' }],
    ['app/achievements/page.tsx', {}],
    ['app/performance/page.tsx', {}],
    ['app/battles/page.tsx', {}],
    ['app/battles/[id]/page.tsx', { id: 'x' }],
  ];
  for (const [rel, p] of pages) {
    await test(`PAGE ${rel.replace('app', '').replace('/page.tsx', '') || '/'} → notFound() before any service/DB call`, async () => {
      calls.length = 0;
      const mod = load(rel);
      let threw = null;
      try { await mod.default(params(p)); } catch (e) { threw = e; }
      assert(isNotFound(threw), `did not call notFound (${threw ? threw.message : 'returned'})`);
      if (mod.generateMetadata) {
        let t2 = null;
        try { await mod.generateMetadata(params(p)); } catch (e) { t2 = e; }
        assert(isNotFound(t2), 'generateMetadata did not call notFound');
      }
      assert(calls.length === 0, `calls before gate: ${calls.join(', ')}`);
    });
  }

  // ===================== API routes → 404 FEATURE_DISABLED before auth/DB =====================
  const apis = ['create', 'join', 'room-details', 'active-round', 'submit-answer', 'finalize'].map((r) => `app/api/battles/${r}/route.ts`).concat(['app/api/assessment/adaptive-step/route.ts']);
  for (const rel of apis) {
    await test(`API ${rel.replace('app', '').replace('/route.ts', '')} → 404 FEATURE_DISABLED before auth/DB`, async () => {
      calls.length = 0;
      const mod = load(rel);
      const handler = mod.POST || mod.GET;
      const res = await handler(new Request('http://localhost/x', { method: mod.POST ? 'POST' : 'GET', body: mod.POST ? '{}' : undefined }));
      const body = await res.json();
      assert(res.status === 404 && body.code === 'FEATURE_DISABLED', `status ${res.status} ${JSON.stringify(body)}`);
      assert(calls.length === 0, `calls before gate: ${calls.join(', ')}`);
    });
  }

  // ===================== Server actions → FEATURE_DISABLED before auth/services =====================
  const actionFiles = [
    ['app/admin/adaptive/actions.ts', 37],
    ['app/live-tests/actions.ts', 7],
    ['app/admin/live-tests/actions.ts', 17],
    ['app/admin/live-tests/intelligence/actions.ts', 4],
    ['app/performance/actions.ts', 5],
  ];
  for (const [rel, expected] of actionFiles) {
    await test(`ACTIONS ${rel}: all ${expected} exports return FEATURE_DISABLED with zero calls`, async () => {
      const mod = load(rel);
      const fns = Object.entries(mod).filter(([, v]) => typeof v === 'function');
      assert(fns.length === expected, `found ${fns.length} actions`);
      for (const [name, fn] of fns) {
        calls.length = 0;
        const r = await fn({}, {}, {}, {});
        assert(r && r.code === 'FEATURE_DISABLED', `${name} returned ${JSON.stringify(r)}`);
        assert(calls.length === 0, `${name} calls: ${calls.join(', ')}`);
      }
    });
  }
  await test('ACTIONS app/admin/actions.ts: dead duplicate adaptive block (37) gated', async () => {
    const src = read('app/admin/actions.ts');
    const adaptiveNames = Object.keys(load('app/admin/adaptive/actions.ts'));
    const missing = adaptiveNames.filter((n) => {
      const i = src.indexOf(`export async function ${n}(`);
      return i >= 0 && !src.slice(i, i + 600).includes('featureDisabledActionResult("ADAPTIVE")');
    });
    assert(missing.length === 0, missing.join(', '));
  });

  // ===================== Admin pages → panel, no service calls =====================
  for (const [rel, key] of [['app/admin/adaptive/page.tsx', 'ADAPTIVE'], ['app/admin/live-tests/page.tsx', 'LIVE_TESTS'], ['app/admin/live-tests/[id]/results/page.tsx', 'LIVE_TESTS'], ['app/admin/achievements/page.tsx', 'LIVE_TESTS']]) {
    await test(`ADMIN ${rel.replace('app', '').replace('/page.tsx', '')} → "Feature not enabled" panel, zero calls`, async () => {
      calls.length = 0;
      const el = await load(rel).default(params({ id: 'x' }));
      assert(el && el.props && el.props.feature === key, `returned ${el && el.type && el.type.name}`);
      assert(calls.length === 0, calls.join(', '));
    });
  }
  await test('ADMIN /admin/live-tests/** layout (covers client intelligence pages) renders the panel', async () => {
    const el = load('app/admin/live-tests/layout.tsx').default({ children: 'CHILD' });
    assert(el && el.props && el.props.feature === 'LIVE_TESTS');
  });

  // ===================== Mock take page: adaptive detection skipped =====================
  await test('TAKE /mock-tests/[id]/take: AdaptiveSessionService never invoked when ADAPTIVE off', async () => {
    calls.length = 0;
    const src = read('app/mock-tests/[id]/take/page.tsx');
    assert(/isFeatureEnabled\("ADAPTIVE"\)\s*\?\s*await AdaptiveSessionService\.detectAdaptiveTest/.test(src), 'detection not gated');
    assert(/if \(adaptiveDetection\?\.isAdaptive\)/.test(src), 'branch not null-safe');
  });

  // ===================== Mixed services =====================
  await test('SERVICE candidate-intelligence: every live_test_* query goes through liveTestsQuery()', async () => {
    const src = read('services/candidate-intelligence.service.ts');
    const total = (src.match(/\.from\("live_test_/g) || []).length;
    const wrapped = (src.match(/liveTestsQuery\(adminSb\)\s*\n\s*\.from\("live_test_/g) || []).length;
    assert(total === wrapped && total === 7, `${wrapped}/${total}`);
  });
  await test('SERVICE exam-onboarding: adaptive/live counts gated', async () => {
    const src = read('services/exam-onboarding/exam-onboarding.service.ts');
    assert(src.includes(`isFeatureEnabled("LIVE_TESTS") ? getCount('live_tests')`) && src.includes(`isFeatureEnabled("ADAPTIVE") ? getCount('adaptive_test_configs')`));
  });

  // ===================== Navigation hides links =====================
  await test('NAV battles link gated in main-nav, header-controls, mobile-nav; header passes server flag', async () => {
    for (const f of ['components/layout/main-nav.tsx', 'components/layout/header-controls.tsx', 'components/layout/mobile-nav.tsx']) {
      const s = read(f);
      const i = s.indexOf('href="/battles"');
      assert(i > 0 && /\{battlesEnabled && \(\s*$/.test(s.slice(Math.max(0, i - 120), i).split('<Link')[0]), `${f} not gated`);
      assert(/battlesEnabled = false/.test(s), `${f} default not false`);
    }
    const h = read('components/layout/header.tsx');
    assert((h.match(/battlesEnabled=\{isFeatureEnabled\("BATTLES"\)\}/g) || []).length === 2, 'header does not pass flag to both');
  });
  await test('NAV dashboard battle card gated', async () => {
    const s = read('app/dashboard/page.tsx');
    const i = s.indexOf('<Link href="/battles"');
    assert(/\{isFeatureEnabled\("BATTLES"\) && \(\s*$/.test(s.slice(i - 80, i)), 'dashboard card not gated');
  });
  await test('NAV admin sidebar hides /admin/adaptive and /admin/live-tests when off', async () => {
    const s = read('components/admin/admin-sidebar.tsx');
    for (const [href, flag] of [['/admin/adaptive', 'adaptiveEnabled'], ['/admin/live-tests', 'liveTestsEnabled']]) {
      const i = s.indexOf(`href="${href}"`);
      assert(new RegExp(`\\{${flag} && \\(\\s*<Link\\s*$`).test(s.slice(i - 80, i)), `${href} not gated`);
    }
    const l = read('app/admin/layout.tsx');
    assert(l.includes('adaptiveEnabled={isFeatureEnabled("ADAPTIVE")}') && l.includes('liveTestsEnabled={isFeatureEnabled("LIVE_TESTS")}'));
  });

  // ===================== Flags ON → gate opens (sanity) =====================
  await test('ON sanity: with FEATURE_BATTLES=true the battles API proceeds past the gate', async () => {
    process.env.FEATURE_BATTLES = 'true';
    calls.length = 0;
    const mod = load('app/api/battles/create/route.ts');
    try { await mod.POST(new Request('http://localhost/x', { method: 'POST', body: '{}' })); } catch { /* mocks may not satisfy the handler */ }
    delete process.env.FEATURE_BATTLES;
    assert(calls.length > 0, 'service not reached when enabled');
  });

  console.log(lines.join('\n'));
  console.log(`\nDRIFT-1c feature quarantine suite: ${passed}/${passed + failed} passed`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => { console.error('Suite crashed:', e && e.stack ? e.stack.slice(0, 600) : e); process.exit(1); });
