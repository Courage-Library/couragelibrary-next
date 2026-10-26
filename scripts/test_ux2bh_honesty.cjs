/**
 * UX-2b.H + UX-2b.H2: honest copy (H-1 … H-11, E-1 … E-7). Every sentence a student reads must be true today.
 *
 * Offline (no network):
 *   U-1  formatMockShape: "{N} question(s) · {duration}", 0 / missing / NaN handled (lib/assessment/display-rules.ts)
 *   U-2  canShowRank boundaries (RANK_MIN_COHORT)
 *   S-1  banned phrases are gone from the touched source files (comments excluded)
 *   S-2  pricing: the payments-OFF view returns before the unchanged payments-ON markup and contains no price,
 *        GST, "most popular", coupon, checkout or fetch
 *   S-3  result view: every standing.rank / percentile / n use sits inside the {standing && ...} branch (null < RANK_MIN_COHORT)
 *   S-4  current affairs: the hub calls only CurrentAffairsService.getHubData (no new query path); the quiz section and
 *        card render only for status ALREADY_PUBLISHED; no "being curated" / "5-gate" / "fact-checked" copy
 *   S-5  mock size comes from formatMockShape; no "Full-length mock" / "Shorter mock" / old mislabels
 *   S-6  (H2) unbacked official / verified / authoritative / commission-accurate / partner claims gone from the
 *        touched source files (H2_STATIC; the same patterns hit HEAD before UX-2b.H2)
 *   S-7  (H2) CA sources card: canonical tier names and only the real review process
 * Live (local build via scripts/live/with-server.cjs; qa-student from .env.local, never printed; read-only):
 *   L-1  each H-item's banned phrase is absent on its route, signed out and signed in, at 360 and 1280
 *   L-2  global guard on every view, every match (H + H2 phrases; allow-list ALLOW below, each with its rule)
 *   L-3  pricing with payments OFF: no purchasable price / GST / "most popular" / coupon / checkout button; only the
 *        live free features are ticked; Pro reads "Opening soon" + "Pricing announced soon"
 *   L-4  current affairs: honest empty state for a day with 0 published; latest-published link when one exists
 *        (VACUOUS when nothing is published); no quiz card without a published quiz
 *   L-5  rank gate: the QA result (cohort below RANK_MIN_COHORT) shows no rank / percentile and the honest line
 *   L-6  mock list: every card states "{N} question(s) · {duration}"; no length judgement
 *   L-7  axe 0 critical / serious and exactly one h1 on every touched route (360, 1280)
 *   L-8  /live-tests is still flag-off (404) and its copy is checked statically (S-1)
 *   L-9  read-only: no non-GET request except the sign-in
 * Payments ON (`--payments-on`, against a server started with PAYMENTS_ENABLED=true in the test environment only):
 *   P-1  /pricing with payments ON but PRO_ENABLED off: nothing purchasable at 360 and 1280 (F9-B retired the old
 *        payments-ON markup and its snapshot comparison; the Pro view is gated by test_f9b_payments.cjs PB-09)
 *
 * Run:  node scripts/test_ux2bh_honesty.cjs --offline
 *       node scripts/live/with-server.cjs -- "node scripts/test_ux2bh_honesty.cjs http://localhost:3100"
 *       PAYMENTS_ENABLED=true node scripts/live/with-server.cjs -- "node scripts/test_ux2bh_honesty.cjs --payments-on http://localhost:3100"
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OFFLINE = process.argv.includes('--offline');
const PAYMENTS_ON = process.argv.includes('--payments-on');
const BASE = (process.argv.slice(2).find((a) => /^https?:/.test(a)) || 'http://localhost:3100').replace(/\/$/, '');
const SNAPSHOT = path.join(ROOT, 'docs/reports/ux/ux2bh/before/pricing_payments_on_snapshot.json');

let passed = 0;
let failed = 0;
let vacuous = 0;
const check = (id, name, ok, info) => {
  if (ok) passed++;
  else failed++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${id} ${name}${info ? ' — ' + info : ''}`);
};
const warnVacuous = (id, name) => {
  vacuous++;
  console.log(`  WARN  VACUOUS (0 items): ${id} ${name}`);
};
// line endings normalised: a core.autocrlf checkout must not change what the static checks see
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '');

// Banned per H-item (rendered and source). /live-tests is flag-off, so H-2 is checked in source only.
const H = {
  'H-1': { route: '/auth/signup', file: 'app/auth/signup/page.tsx', banned: [/thousands of/i] },
  'H-2': { route: null, file: 'app/live-tests/page.tsx', banned: [/thousands of/i, /simultaneously/i] },
  'H-3': { route: '/current-affairs', file: 'app/current-affairs/page.tsx', banned: [/fact verification/i, /being processed/i, /5-gate/i] },
  'H-4': { route: '/current-affairs', file: 'app/current-affairs/page.tsx', banned: [/fact-checked/i, /verified provenance/i, /intelligence/i, /high-yield/i] },
  'H-5': { route: '/current-affairs', file: 'components/current-affairs/current-affairs-daily-quiz-card.tsx', banned: [/being curated/i, /curation in progress/i, /verified events/i] },
  'H-6': { route: '/pricing', file: 'config/site.ts', banned: [/one-stop/i] },
  'H-7': { route: '/pricing', file: null, banned: [/most popular/i, /\+\s*18%\s*GST/i, /discount coupon/i, /upgrade to pro now/i] },
  'H-8': { route: 'RESULT|MOCK|LEADERBOARD', file: null, banned: [/\bofficial\b/i] },
  'H-9': { route: 'RESULT', file: null, banned: [/verified candidate/i, /top 3 podium/i, /live competition/i, /\btopper\b/i] },
  'H-10': { route: '/mock-tests|/dashboard', file: 'components/assessment/mock-test-dashboard-view.tsx', banned: [/full-length mock\b/i, /shorter mock/i, /full-length mock tests/i, /full-length mocks scheduled/i, /start full mock/i, /full-length exam/i, /full-length simulations/i] },
  'H-11': { route: '/dashboard', file: 'app/dashboard/page.tsx', banned: [/readiness engine/i, /spaced repetition/i, /great job/i] },
};
const GLOBAL = [/thousands of/i, /\bofficial\b/i, /most popular/i, /fact verification/i, /being curated/i, /one-stop/i, /verified candidate/i,
  // UX-2b.H2
  /\bverified\b/i, /authoritative/i, /commission-accurate/i, /verified national press/i, /verified sources/i, /verified provenance/i];
// "Full-length mock" / "Shorter mock" (E-7) are checked on /mock-tests only (H-10 + L-6): the wallet's earning rule
// "Full-Length Mock +25 CL" is a reward-rule label outside UX-2b.H2's approved wallet wording (report §6).
// Allow-list (UX-2b.H2 report §3). Each entry: the rule that makes the use true. Matched against ±80 characters around a hit.
const ALLOW = [
  { id: 'A-1', rule: 'names a third party\'s official material we show or link: the exam\'s "Official Sources" section / nav lists the commission\'s own notices', rx: /Official [Ss]ources/ },
  { id: 'A-2', rule: 'third party\'s official notice / website (the commission\'s notification, an institute\'s own website)', rx: /official (commission )?(notification|notice)|official website|Official Website/i },
  { id: 'A-3', rule: 'CA source-type name (canonical Tier 1 = official government / statutory)', rx: /Tier 1 — Official government/ },
  // A-4 is scoped: STORED exam-guide content (published exam-knowledge module titles, descriptions, articles, FAQs) on
  // /exams/<slug>/… only, and only these words. It mostly names SSC's own material ("the official SSC portal"); the
  // "Authoritative guide …" descriptions are content claims listed for the content phase (data, not editable here).
  // Our own UI wording on those routes is checked strictly by L-11.
  { id: 'A-4', rule: 'stored exam-guide content (DB) on /exams/<slug>/… (content phase; UI chrome checked by L-11)', routes: /^\/exams\/[a-z0-9-]+(\/|$)/, words: /^(official|verified|authoritative)$/i, rx: /[\s\S]/ },
];

function loadTs(rel) {
  const ts = require('typescript');
  const out = ts.transpileModule(read(rel), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const m = { exports: {} };
  new Function('module', 'exports', 'require', out)(m, m.exports, require);
  return m.exports;
}

function offline() {
  console.log('Offline');
  const R = loadTs('lib/assessment/display-rules.ts');
  // UX-2b.H2 (E-7): the mock size is stated as facts; the H-10 full-length rule and its helpers are gone
  const cases = [
    [{ totalQuestions: 1, durationMinutes: 1 }, '1 question · 1 min'],
    [{ totalQuestions: 25, durationMinutes: 15 }, '25 questions · 15 min'],
    [{ totalQuestions: 100, durationMinutes: 60 }, '100 questions · 1 hr'],
    [{ totalQuestions: 90, durationMinutes: 90 }, '90 questions · 1 hr 30 min'],
    [{ totalQuestions: 80, durationMinutes: 60 }, '80 questions · 1 hr'],
    [{ totalQuestions: 150, durationMinutes: 125 }, '150 questions · 2 hr 5 min'],
    [{ totalQuestions: 0, durationMinutes: 0 }, ''],
    [{ totalQuestions: 25, durationMinutes: 0 }, '25 questions'],
    [{ totalQuestions: undefined, durationMinutes: 15 }, '15 min'],
    [{ totalQuestions: NaN, durationMinutes: NaN }, ''],
    [{ totalQuestions: null, durationMinutes: null }, ''],
    [{}, ''],
  ];
  const bad = cases.filter(([m, want]) => R.formatMockShape(m) !== want);
  check('U-1', `formatMockShape: "{N} question(s) · {duration}" (${cases.length} cases incl. 1 question, 90/90 → 1 hr 30 min, 0 / missing / NaN → no "NaN")`,
    bad.length === 0 && typeof R.isFullLengthMock === 'undefined' && typeof R.mockLengthLabel === 'undefined',
    bad.map(([m, w]) => `${JSON.stringify(m)} → "${R.formatMockShape(m)}" (want "${w}")`).join('; '));
  const rk = [[29, false], [30, true], [3, false], [0, false], [500, true], [NaN, false]];
  const rbad = rk.filter(([n, want]) => R.canShowRank(n) !== want);
  check('U-2', `rank gate: shown only for a cohort ≥ RANK_MIN_COHORT (${R.RANK_MIN_COHORT}; placeholder pending owner)`, R.RANK_MIN_COHORT === 30 && rbad.length === 0, rbad.map(([n]) => n).join(','));

  const hits = [];
  for (const [id, h] of Object.entries(H)) {
    if (!h.file) continue;
    const s = code(read(h.file));
    for (const rx of h.banned) if (rx.test(s)) hits.push(`${id} ${h.file}: ${rx.source}`);
  }
  const extra = [
    ['components/assessment/result-view-client.tsx', [/\bofficial\b/i, /verified candidate/i, /top 3 podium/i, /live competition/i, /topper score/i]],
    ['app/mock-tests/[id]/page.tsx', [/\bofficial\b/i]],
    ['components/assessment/leaderboard-view-client.tsx', [/\bofficial\b/i, /verified candidate/i]],
  ];
  for (const [f, rxs] of extra) for (const rx of rxs) if (rx.test(code(read(f)))) hits.push(`${f}: ${rx.source}`);
  check('S-1', 'banned phrases gone from the touched source files', hits.length === 0, hits.join('; '));

  const pc = read('app/pricing/pricing-client.tsx');
  const offIdx = pc.indexOf('if (!paymentsEnabled) return <PaymentsOffView');
  // F9-B (architect GO) replaced the old payments-ON markup with ProPricingView; its honesty is gated by
  // scripts/test_f9b_payments.cjs PB-09. The OFF view must still return first and stay free of any price.
  const onIdx = pc.indexOf('return <ProPricingView');
  const offView = pc.slice(pc.indexOf('function PaymentsOffView'));
  check('S-2', 'pricing: OFF view returns first; it has no price, GST, most popular, coupon, checkout or fetch',
    offIdx > 0 && onIdx > offIdx && offView.length > 200 && !/₹|GST|MOST POPULAR|most popular|[Cc]oupon|handleCheckout|fetch\(|create-order|basePriceInr|createProOrderAction/.test(offView),
    `off@${offIdx} on@${onIdx}`);

  // F4: the builder returns standing = null below RANK_MIN_COHORT (cohortStanding); the view renders rank / percentile
  // only inside the {standing && (...)} branch, and nothing about the cohort outside it
  const rv = read('components/assessment/result-view-client.tsx');
  const g0 = rv.indexOf('{standing && (');
  const g1 = rv.indexOf('</section>', g0);
  const uses = [...rv.matchAll(/standing\.(rank|percentile|n)\b/g)].map((m) => m.index);
  const ra = read('lib/assessment/result-analysis.ts');
  check('S-3', 'result view: every standing.rank / percentile / n is inside the standing branch; null below RANK_MIN_COHORT',
    g0 > 0 && uses.length >= 3 && uses.every((i) => i > g0 && i < g1) && /if \(n < RANK_MIN_COHORT\) return null;/.test(ra), `${uses.length} uses`);

  const ca = read('app/current-affairs/page.tsx');
  const calls = [...new Set([...ca.matchAll(/CurrentAffairsService\.(\w+)/g)].map((m) => m[1]))];
  const card = read('components/current-affairs/current-affairs-daily-quiz-card.tsx');
  check('S-4', 'current affairs: only getHubData; quiz section + card only for ALREADY_PUBLISHED',
    calls.length === 1 && calls[0] === 'getHubData' && /dailyQuiz\.status === 'ALREADY_PUBLISHED' && \(/.test(ca) &&
      /const isAvailable = dailyQuiz\.status === 'ALREADY_PUBLISHED' && Boolean\(dailyQuiz\.mockTestId\);\s*if \(!isAvailable\) return null;/.test(card),
    `service calls [${calls.join(',')}]`);

  const mv = code(read('components/assessment/mock-test-dashboard-view.tsx'));
  const dash = code(read('app/dashboard/page.tsx'));
  check('S-5', 'mock size from formatMockShape; no length judgement ("Full-length mock" / "Shorter mock") or old mislabels on /mock-tests or /dashboard',
    /formatMockShape\(test\)/.test(mv) && !/mockLengthLabel|isFullLengthMock|Full-length mock|Shorter mock|Full-Length|Full Mock|full-length (exam|simulations)/i.test(mv) &&
      !/full-length/i.test(dash));

  // UX-2b.H2: unbacked official / verified claims removed from the touched source files (comments excluded)
  const H2_SRC = H2_STATIC.map(([f, rxs]) => [f, rxs.filter((rx) => rx.test(code(read(f)))).map((rx) => rx.source)]).filter(([, h]) => h.length);
  check('S-6', `H2 claims gone from ${H2_STATIC.length} touched source files (official / verified / authoritative / commission-accurate / provenance / partner)`,
    H2_SRC.length === 0, H2_SRC.map(([f, h]) => `${f}: ${h.join(',')}`).join('; '));
  const sc = read('components/current-affairs/current-affairs-sources-card.tsx');
  const tiers = ['Tier 1 — Official government / statutory', 'Tier 2 — Intergovernmental / public institution', 'Tier 3 — Reputable national media', 'Tier 4 — Secondary (blogs, social media, coaching)'];
  check('S-7', 'CA sources card uses the canonical tier names and states only the real review process',
    tiers.every((t) => sc.includes(`label: '${t}'`)) && /passes automated checks and a review by our staff/.test(sc) && !/Every event point is checked/.test(sc));
}

// Static H2 checks (file → patterns that must be absent outside comments). Run against HEAD they must hit (report §7).
const H2_STATIC = [
  ['app/exams/page.tsx', [/Official Knowledge Repository/, /commission-accurate/i, /\bVerified\b/, /official notification timelines/i]],
  ['components/exams/exam-hero.tsx', [/Official Verified/]],
  ['app/exams/[slug]/page.tsx', [/Official notification dates/]],
  ['app/exams/[slug]/cycle/[cycleYear]/page.tsx', [/Official notification details/]],
  ['components/exams/exam-module-card.tsx', [/Verified: \{/, /verified parameters/i]],
  ['components/exams/exam-module-reader-view.tsx', [/Verified: \{/]],
  ['components/current-affairs/current-affairs-sources-card.tsx', [/Verified National Press/, /Verified Sources/, /Fact Provenance/, /Every event point is checked/]],
  ['components/current-affairs/current-affairs-card.tsx', [/Verified Sources/]],
  ['app/current-affairs/date/[date]/page.tsx', [/verified provenance/i]],
  ['components/assessment/leaderboard-view-client.tsx', [/Verified Position/]],
  ['components/assessment/result-view-client.tsx', [/submission verified/i, /Verified answer keys/i]],
  ['components/wallet/wallet-view-client.tsx', [/Verified CL Wallet/]],
  ['app/institutes/page.tsx', [/verified institutional/i, /being verified/i, /Partner/]],
  ['components/premium/premium-hub-view.tsx', [/official question papers/i, /Official Papers/, /simulate official test/i, /previous year questions/i]],
  ['components/store/redeem-modal.tsx', [/Official Courage Library study gear/]],
];

async function live() {
  const { chromium } = require('playwright');
  const { readEnv } = require('./db/_db-env.cjs');
  const AXE = fs.readFileSync(path.join(ROOT, 'node_modules', 'axe-core', 'axe.min.js'), 'utf8');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const nonGet = [];
  const watch = (page, who) =>
    page.on('request', (rq) => {
      if (!['GET', 'HEAD'].includes(rq.method())) nonGet.push(`${who} ${rq.method()} ${new URL(rq.url()).pathname.replace(/[0-9a-f-]{36}/g, '[id]')}`);
    });
  const view = async (page, url, w) => {
    await page.setViewportSize({ width: w, height: w === 360 ? 780 : 900 });
    let res;
    let info;
    for (let i = 1; i <= 3; i++) {
      res = await page.goto(BASE + url, { waitUntil: 'load', timeout: 90000 });
      await page.locator('main').first().waitFor({ timeout: 30000 }).catch(() => undefined);
      await page.waitForTimeout(800);
      info = await page.evaluate(() => ({
        text: (document.querySelector('main') || document.body).innerText,
        h1: document.querySelectorAll('h1').length,
        signedIn: !/Get started/.test(document.querySelector('header')?.textContent || ''),
      }));
      if (!page.__signedIn || info.signedIn) break; // a signed-in view is required when signed in (getUser can time out)
    }
    return { status: res.status(), ...info };
  };
  const axe = async (page) => {
    await page.addScriptTag({ content: AXE });
    return page.evaluate(async () => {
      const r = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } });
      return r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}×${v.nodes.length}`);
    });
  };

  if (PAYMENTS_ON) {
    console.log('Payments ON (test environment toggle)');
    const snap = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
    const page = await browser.newPage();
    watch(page, 'anon');
    for (const w of [360, 1280]) {
      await page.setViewportSize({ width: w, height: 900 });
      await page.goto(BASE + '/pricing', { waitUntil: 'load' });
      await page.waitForTimeout(1500);
      const html = await page.evaluate(() => document.querySelector('main').innerHTML.replace(/\s+/g, ' '));
      // F9-B (architect GO) retired the old payments-ON markup (snapshot kept for history: snap[w]). Payments ON with
      // PRO_ENABLED off must still show nothing purchasable; the Pro view's honesty is F9-B PB-09.
      check('P-1', `/pricing @${w} payments ON, Pro off: nothing purchasable (no price, no checkout)`, !/₹[1-9]|Pay ₹|data-pro-pay/.test(html) && html.length > 0 && !!snap[w], `${html.length} chars`);
    }
    await browser.close();
    check('L-9', 'read-only: no non-GET request', nonGet.length === 0, nonGet.join(', '));
    return;
  }

  // ---- signed out ----
  console.log('Live (payments OFF, as configured)');
  const anon = await browser.newPage();
  watch(anon, 'anon');
  // resolve a test id (the list links no pre-test page: id from the page payload, as in UX-T0)
  await anon.goto(BASE + '/mock-tests', { waitUntil: 'load' });
  const testId = ((await anon.content()).match(/testId\W{1,6}([0-9a-f]{8}-[0-9a-f-]{27})/) || [])[1];
  // UX-2b.H2 routes: exam directory, hub, cycle and one module page; CA day page; /institutes (signed out too)
  await anon.goto(BASE + '/exams/ssc-cgl', { waitUntil: 'load' });
  const examLinks = await anon.$$eval('a[href^="/exams/ssc-cgl/"]', (as) => as.map((a) => a.getAttribute('href')));
  // the hub does not link its cycle page; use the active cycle year it shows ("Cycle 2026 …") when that page answers 200
  const cycleYear = ((await anon.evaluate(() => document.body.innerText)).match(/Cycle (\d{4})/) || [])[1];
  const cycleOk = cycleYear ? (await anon.request.get(`${BASE}/exams/ssc-cgl/cycle/${cycleYear}`, { maxRedirects: 0 })).status() === 200 : false;
  const cycleHref = examLinks.find((h) => /\/cycle\/\d{4}$/.test(h)) || (cycleOk ? `/exams/ssc-cgl/cycle/${cycleYear}` : null);
  const moduleHref = examLinks.find((h) => /^\/exams\/ssc-cgl\/[a-z0-9-]+$/.test(h) && !/\/cycle/.test(h)) || null;
  const todayIst = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
  const H2_ROUTES = ['/exams', '/exams/ssc-cgl', cycleHref, moduleHref, `/current-affairs/date/${todayIst}`, '/institutes'].filter(Boolean);
  if (!cycleHref) warnVacuous('L-10', 'no cycle link on /exams/ssc-cgl');
  if (!moduleHref) warnVacuous('L-10', 'no module link on /exams/ssc-cgl');
  const routesOut = ['/auth/signup', '/current-affairs', '/pricing', '/mock-tests', testId ? `/mock-tests/${testId}` : null, ...H2_ROUTES].filter(Boolean);
  const seen = {};
  for (const r of routesOut) for (const w of [360, 1280]) seen[`out ${r} @${w}`] = { ...(await view(anon, r, w)), axe: await axe(anon) };

  // ---- signed in ----
  const signedInCtx = await browser.newContext();
  // CI-FIX-1 (#74): CAPTCHA-safe QA session cookies (no login form; scripts/live/qa-session.cjs)
  await require('./live/qa-session.cjs').qaBrowserLogin(signedInCtx, 'qa-student@courage-library.test', BASE);
  const page = await signedInCtx.newPage();
  watch(page, 'student');
  page.setDefaultTimeout(60000);
  page.__signedIn = true;
  await page.goto(BASE + '/mock-tests', { waitUntil: 'load' });
  await page.locator('a[href*="/result"]').first().waitFor({ state: 'visible', timeout: 30000 }).catch(() => undefined);
  const resultHref = await page.$$eval('a[href*="/result"]', (as) => (as[0] ? as[0].getAttribute('href') : null));
  const routesIn = ['/dashboard', '/mock-tests', '/current-affairs', '/pricing', resultHref, testId ? `/mock-tests/${testId}` : null, testId ? `/mock-tests/${testId}/leaderboard` : null,
    ...H2_ROUTES, '/wallet', '/premium', '/store'].filter(Boolean);
  for (const r of routesIn) for (const w of [360, 1280]) seen[`in ${r} @${w}`] = { ...(await view(page, r, w)), axe: await axe(page) };
  const label = (k) => k.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, '[id]');

  // L-1 per item
  const routeOf = (k) => k.split(' ')[1];
  const isRoute = (k, spec) =>
    spec.split('|').some((s) => (s === 'RESULT' ? /\/result$/.test(routeOf(k)) : s === 'MOCK' ? /^\/mock-tests\/[0-9a-f-]{36}$/.test(routeOf(k)) : s === 'LEADERBOARD' ? /\/leaderboard$/.test(routeOf(k)) : routeOf(k) === s));
  for (const [id, h] of Object.entries(H)) {
    if (!h.route) continue;
    const keys = Object.keys(seen).filter((k) => isRoute(k, h.route));
    const hits = keys.flatMap((k) => h.banned.filter((rx) => rx.test(seen[k].text)).map((rx) => `${label(k)}: ${rx.source}`));
    if (keys.length === 0) warnVacuous(id, 'no page rendered for this item');
    else check('L-1', `${id} banned phrases absent (${keys.length} views)`, hits.length === 0, hits.join('; '));
  }

  // L-2 global guard
  const g = [];
  const allowed = {};
  for (const [k, v] of Object.entries(seen)) for (const rx of GLOBAL) {
    // every match, not only the first: an allowed use must not hide a later disallowed one
    for (const m of v.text.matchAll(new RegExp(rx.source, rx.flags.includes('g') ? rx.flags : rx.flags + 'g'))) {
      const ctx = v.text.slice(Math.max(0, m.index - 80), m.index + m[0].length + 80);
      const route = k.split(' ')[1];
      const a = ALLOW.find((x) => (!x.routes || x.routes.test(route)) && (!x.words || x.words.test(m[0])) && x.rx.test(ctx));
      if (a) allowed[a.id] = (allowed[a.id] || 0) + 1;
      else g.push(`${label(k)}: "${ctx.replace(/\s+/g, ' ').slice(60, 150)}"`);
    }
  }
  check('L-2', `global guard on ${Object.keys(seen).length} views (H + H2 phrases; every match; allow-list ${ALLOW.map((a) => a.id).join(',')})`, g.length === 0,
    `${g.length} disallowed${g.length ? ': ' + [...new Set(g)].slice(0, 8).join(' | ') : ''}; allowed ${JSON.stringify(allowed)}`);

  // L-3 pricing (payments OFF here)
  for (const k of Object.keys(seen).filter((x) => / \/pricing @/.test(x))) {
    const t = seen[k].text;
    const ok = !/₹\s*[1-9]/.test(t) && !/GST/.test(t) && !/most popular/i.test(t) && !/coupon/i.test(t) && /Opening soon/.test(t) && /Pricing announced soon/.test(t);
    check('L-3', `${label(k)} payments OFF: no price / GST / most popular / coupon; Pro "Opening soon" + "Pricing announced soon"`, ok);
  }
  {
    const p = await browser.newPage();
    await p.goto(BASE + '/pricing', { waitUntil: 'load' });
    // textContent keeps the PricingCard's sr-only "Included: " / "Not included: " prefix on the same item
    const dom = await p.evaluate(() => ({
      inputs: document.querySelectorAll('main input').length,
      buttons: [...document.querySelectorAll('main button')].filter((b) => !b.disabled).map((b) => b.textContent.trim()),
      items: [...document.querySelectorAll('main li')].map((li) => li.textContent.trim()),
    }));
    const ticked = dom.items.filter((x) => x.startsWith('Included: ')).map((x) => x.slice('Included: '.length));
    const LIVE = ['Mock tests with full answer review', 'Mistake Vault: revise and drill every question you got wrong', 'Exam guides: pattern, syllabus and eligibility'];
    check('L-3b', '/pricing payments OFF: no coupon input, no enabled checkout button; ticked = exactly the 3 live free features',
      dom.inputs === 0 && dom.buttons.length === 0 && ticked.length === LIVE.length && LIVE.every((f) => ticked.includes(f)),
      `inputs ${dom.inputs}, enabled buttons ${dom.buttons.length}, ticked [${ticked.join(' | ')}]`);
    await p.close();
  }

  // L-4 current affairs (DRAFT exclusion itself is covered by scripts/test_ca_routes.cjs)
  for (const k of Object.keys(seen).filter((x) => / \/current-affairs @/.test(x))) {
    const t = seen[k].text;
    const empty = /No current affairs published for .+ yet\./.test(t);
    const latest = /Read the latest published day:/.test(t);
    const none = /Nothing has been published yet/.test(t);
    const hasTodayArticles = !empty;
    check('L-4', `${label(k)}: honest empty state or articles; no quiz card without a published quiz`,
      (hasTodayArticles || latest || none) && !/Daily Current Affairs Quiz/.test(t) === !/Start Daily Quiz/.test(t) && !/being curated/i.test(t),
      empty ? (latest ? 'empty → latest-published link' : 'empty → nothing published yet') : 'today has articles');
    if (empty && none) warnVacuous('L-4b', `${label(k)} latest-published link (no published article in the database)`);
  }

  // L-5 rank gate on the QA result (cohort 3)
  const rk = Object.keys(seen).filter((k) => /\/result @/.test(k));
  for (const k of rk) {
    const t = seen[k].text;
    const n = Number((t.match(/Students\s*\n\s*(\d+)/) || [])[1]);
    if (!(n < 30)) {
      warnVacuous('L-5', `${label(k)} cohort ${n} is not below the threshold`);
      continue;
    }
    check('L-5', `${label(k)} cohort ${n} < 30: no rank / percentile; honest line shown`,
      /Your rank appears once more students take this mock\./.test(t) && !/#\d+\s*of\s*\d+/.test(t) && !/Percentile/.test(t) && !/scored higher than/i.test(t));
  }

  // L-6 (UX-2b.H2, E-7): every card in "More Mock Tests" states its size as "{N} question(s) · {duration}"; no judgement
  for (const k of Object.keys(seen).filter((x) => / \/mock-tests @/.test(x))) {
    const t = seen[k].text;
    const start = t.indexOf('More Mock Tests');
    const endIdx = t.indexOf('Recent Attempts', start);
    const sec = start < 0 ? '' : t.slice(start, endIdx > start ? endIdx : undefined);
    const cards = (sec.match(/\d+ Marks/g) || []).length;
    const shaped = [...sec.matchAll(/(\d+) (question|questions) · (\d+ hr(?: \d+ min)?|\d+ min)\s*•\s*\d+ Marks/g)];
    const plural = shaped.every((m) => (m[1] === '1') === (m[2] === 'question'));
    if (cards === 0) warnVacuous('L-6', `${label(k)} no mock cards in "More Mock Tests"`);
    else check('L-6', `${label(k)}: ${cards} cards state "{N} question(s) · {duration}"; no "Full-length mock" / "Shorter mock" / "NaN"`,
      shaped.length === cards && plural && !/Full-length mock|Shorter mock|NaN/i.test(t),
      `${shaped.length}/${cards} shaped, e.g. "${shaped[0] ? shaped[0][0].split('•')[0].trim() : ''}"`);
  }

  // L-7 a11y on every view. ONE recorded exception (owner ruling, UX-2b.H2: further failures go to a follow-up a11y
  // phase): /wallet @1280, 1 color-contrast node (components/wallet/wallet-view-client.tsx:545 transaction-date cell).
  // It is matched exactly (route, width, rule, node count), so any other or additional failure still fails here.
  const KNOWN_A11Y = [{ key: /^in \/wallet @1280$/, axe: ['color-contrast×1'], why: 'wallet-view-client.tsx:545 (follow-up a11y phase)' }];
  const known = [];
  const a11y = Object.entries(seen)
    .filter(([, v]) => v.axe.length > 0 || v.h1 !== 1 || v.status !== 200)
    .filter(([k, v]) => {
      const kx = KNOWN_A11Y.find((x) => x.key.test(k) && v.h1 === 1 && v.status === 200 && v.axe.join(',') === x.axe.join(','));
      if (kx) known.push(`${k} [${v.axe.join(',')}] ${kx.why}`);
      return !kx;
    })
    .map(([k, v]) => `${label(k)} ${v.status} h1=${v.h1} [${v.axe.join(',')}]`);
  check('L-7', `axe 0 critical/serious, one h1, 200 on ${Object.keys(seen).length} views (${known.length} recorded exception)`, a11y.length === 0, [...a11y, ...known.map((x) => 'KNOWN ' + x)].join('; '));

  // L-11 (H2) our own UI wording on the exam pages (stored guide text is A-4, listed for the content phase)
  const chrome = [/Official Verified/, /Official Knowledge Repository/, /commission-accurate/i, /Verified: \d/, /verified parameters/i, /Verified syllabus/i];
  const examViews = Object.keys(seen).filter((k) => /^\/exams(\/|$)/.test(k.split(' ')[1]));
  const ch = examViews.flatMap((k) => chrome.filter((rx) => rx.test(seen[k].text)).map((rx) => `${label(k)}: ${rx.source}`));
  check('L-11', `exam pages: no "Official Verified" / "Official Knowledge Repository" / "commission-accurate" / "Verified: {date}" UI copy (${examViews.length} views)`,
    examViews.length >= 8 && ch.length === 0 && examViews.some((k) => /Information as of /.test(seen[k].text)), ch.join('; '));

  // L-8 live tests still flag-off
  const lt = await anon.request.get(BASE + '/live-tests', { maxRedirects: 0 });
  check('L-8', '/live-tests is still flag-off (404); its copy is checked in source (S-1)', lt.status() === 404, String(lt.status()));

  await browser.close();
  const unexpected = nonGet.filter((r) => !/^student POST \/auth\/login$/.test(r));
  check('L-9', 'read-only: no non-GET request except the sign-in', unexpected.length === 0, `${nonGet.length} non-GET`);
}

(async () => {
  console.log('UX-2b.H honest copy');
  if (!PAYMENTS_ON) offline();
  if (!OFFLINE) await live();
  console.log(`UX-2b.H: ${passed}/${passed + failed} passed${vacuous ? `, ${vacuous} vacuous` : ''}`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error('ERROR', String(e.message).replace(/[0-9a-f-]{36}/g, '[id]'));
  process.exit(1);
});
