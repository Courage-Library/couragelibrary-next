/**
 * UX-2b.H: honest copy (H-1 … H-11). Every sentence a student reads must be true today.
 *
 * Offline (no network):
 *   U-1  isFullLengthMock / mockLengthLabel boundaries (lib/assessment/display-rules.ts)
 *   U-2  canShowRank boundaries (RANK_MIN_COHORT)
 *   S-1  banned phrases are gone from the touched source files (comments excluded)
 *   S-2  pricing: the payments-OFF view returns before the unchanged payments-ON markup and contains no price,
 *        GST, "most popular", coupon, checkout or fetch
 *   S-3  result view: every standing.rank / standing.percentile use sits inside the canShowRank(...) branch
 *   S-4  current affairs: the hub calls only CurrentAffairsService.getHubData (no new query path); the quiz section and
 *        card render only for status ALREADY_PUBLISHED; no "being curated" / "5-gate" / "fact-checked" copy
 *   S-5  mock labels come from mockLengthLabel; no "Full-Length" / "Full Mock" / "full-length exam" copy
 * Live (local build via scripts/live/with-server.cjs; qa-student from .env.local, never printed; read-only):
 *   L-1  each H-item's banned phrase is absent on its route, signed out and signed in, at 360 and 1280
 *   L-2  global guard on the touched routes (allow-list in ALLOW below, each justified)
 *   L-3  pricing with payments OFF: no purchasable price / GST / "most popular" / coupon / checkout button; only the
 *        live free features are ticked; Pro reads "Opening soon" + "Pricing announced soon"
 *   L-4  current affairs: honest empty state for a day with 0 published; latest-published link when one exists
 *        (VACUOUS when nothing is published); no quiz card without a published quiz
 *   L-5  rank gate: the QA result (cohort below RANK_MIN_COHORT) shows no rank / percentile and the honest line
 *   L-6  mock list: every card's length label matches the rule applied to the size it displays
 *   L-7  axe 0 critical / serious and exactly one h1 on every touched route (360, 1280)
 *   L-8  /live-tests is still flag-off (404) and its copy is checked statically (S-1)
 *   L-9  read-only: no non-GET request except the sign-in
 * Payments ON (`--payments-on`, against a server started with PAYMENTS_ENABLED=true in the test environment only):
 *   P-1  /pricing <main> markup equals the pre-change baseline snapshot at 360 and 1280 (signed out)
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
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
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
  'H-10': { route: '/mock-tests|/dashboard', file: 'components/assessment/mock-test-dashboard-view.tsx', banned: [/full-length mock tests/i, /full-length mocks scheduled/i, /start full mock/i, /full-length exam/i, /full-length simulations/i] },
  'H-11': { route: '/dashboard', file: 'app/dashboard/page.tsx', banned: [/readiness engine/i, /spaced repetition/i, /great job/i] },
};
const GLOBAL = [/thousands of/i, /\bofficial\b/i, /most popular/i, /fact verification/i, /being curated/i, /one-stop/i, /verified candidate/i];
// Allow-list: legitimate uses only (none needed on the touched routes today; kept explicit for future additions).
const ALLOW = [];

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
  const cases = [
    [{ totalQuestions: 100, durationMinutes: 60 }, true],
    [{ totalQuestions: 99, durationMinutes: 60 }, false],
    [{ totalQuestions: 100, durationMinutes: 59 }, false],
    [{ totalQuestions: 25, durationMinutes: 15 }, false],
    [{ totalQuestions: 100, durationMinutes: 90 }, true],
    [{ totalQuestions: 150, durationMinutes: 120 }, true],
    [{ totalQuestions: 25, durationMinutes: 60 }, false],
    [{ totalQuestions: NaN, durationMinutes: 60 }, false],
  ];
  const bad = cases.filter(([m, want]) => R.isFullLengthMock(m) !== want || R.mockLengthLabel(m) !== (want ? 'Full-length mock' : 'Shorter mock'));
  check('U-1', `full-length rule: ≥ ${R.FULL_LENGTH_MIN_QUESTIONS} questions AND ≥ ${R.FULL_LENGTH_MIN_MINUTES} min (${cases.length} boundary cases)`, bad.length === 0, bad.map(([m]) => JSON.stringify(m)).join(' '));
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
  const onIdx = pc.indexOf('return (\n    <div className="py-12 bg-slate-50/50');
  const offView = pc.slice(pc.indexOf('function PaymentsOffView'));
  check('S-2', 'pricing: OFF view returns first; it has no price, GST, most popular, coupon, checkout or fetch',
    offIdx > 0 && onIdx > offIdx && offView.length > 200 && !/₹|GST|MOST POPULAR|most popular|[Cc]oupon|handleCheckout|fetch\(|create-order|basePriceInr/.test(offView),
    `off@${offIdx} on@${onIdx}`);

  const rv = read('components/assessment/result-view-client.tsx');
  const g0 = rv.indexOf('canShowRank(standing.totalParticipants) ? (');
  const g1 = rv.indexOf(') : (', g0);
  const uses = [...rv.matchAll(/standing\.(rank|percentile)\b/g)].map((m) => m.index);
  check('S-3', 'result view: every standing.rank / standing.percentile is inside the canShowRank branch',
    g0 > 0 && uses.length >= 3 && uses.every((i) => i > g0 && i < g1), `${uses.length} uses`);

  const ca = read('app/current-affairs/page.tsx');
  const calls = [...new Set([...ca.matchAll(/CurrentAffairsService\.(\w+)/g)].map((m) => m[1]))];
  const card = read('components/current-affairs/current-affairs-daily-quiz-card.tsx');
  check('S-4', 'current affairs: only getHubData; quiz section + card only for ALREADY_PUBLISHED',
    calls.length === 1 && calls[0] === 'getHubData' && /dailyQuiz\.status === 'ALREADY_PUBLISHED' && \(/.test(ca) &&
      /const isAvailable = dailyQuiz\.status === 'ALREADY_PUBLISHED' && Boolean\(dailyQuiz\.mockTestId\);\s*if \(!isAvailable\) return null;/.test(card),
    `service calls [${calls.join(',')}]`);

  const mv = code(read('components/assessment/mock-test-dashboard-view.tsx'));
  const dash = code(read('app/dashboard/page.tsx'));
  check('S-5', 'mock labels from mockLengthLabel; no full-length mislabels on /mock-tests or /dashboard',
    /mockLengthLabel\(test\)/.test(mv) && !/Full-Length|Full Mock|full-length (exam|simulations)/i.test(mv) && !/full-length/i.test(dash));
}

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
      check('P-1', `/pricing @${w} payments ON: <main> markup equals the pre-change snapshot`, html === snap[w].html, `${html.length} vs ${snap[w].html.length} chars`);
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
  const routesOut = ['/auth/signup', '/current-affairs', '/pricing', '/mock-tests', testId ? `/mock-tests/${testId}` : null].filter(Boolean);
  const seen = {};
  for (const r of routesOut) for (const w of [360, 1280]) seen[`out ${r} @${w}`] = { ...(await view(anon, r, w)), axe: await axe(anon) };

  // ---- signed in ----
  const page = await browser.newPage();
  watch(page, 'student');
  page.setDefaultTimeout(60000);
  const password = readEnv()('QA_STUDENT_PASSWORD');
  for (let i = 1; i <= 3; i++) {
    await page.goto(BASE + '/auth/login', { waitUntil: 'load' });
    await page.fill('input[type="email"]', 'qa-student@courage-library.test');
    await page.fill('input[type="password"]', password);
    await Promise.all([page.waitForURL((u) => !/\/auth\/login/.test(String(u)), { timeout: 60000 }).catch(() => undefined), page.locator('button[type="submit"]').first().click()]);
    if (!/\/auth\/login/.test(page.url())) break;
    if (i === 3) throw new Error('sign-in failed');
  }
  page.__signedIn = true;
  await page.goto(BASE + '/mock-tests', { waitUntil: 'load' });
  await page.locator('a[href*="/result"]').first().waitFor({ state: 'visible', timeout: 30000 }).catch(() => undefined);
  const resultHref = await page.$$eval('a[href*="/result"]', (as) => (as[0] ? as[0].getAttribute('href') : null));
  const routesIn = ['/dashboard', '/mock-tests', '/current-affairs', '/pricing', resultHref, testId ? `/mock-tests/${testId}` : null, testId ? `/mock-tests/${testId}/leaderboard` : null].filter(Boolean);
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
  for (const [k, v] of Object.entries(seen)) for (const rx of GLOBAL) {
    const m = v.text.match(rx);
    if (m && !ALLOW.some((a) => a.test(v.text.slice(Math.max(0, m.index - 60), m.index + 60)))) g.push(`${label(k)}: "${m[0]}"`);
  }
  check('L-2', `global guard on ${Object.keys(seen).length} views (thousands of, official, most popular, fact verification, being curated, one-stop, verified candidate)`, g.length === 0, g.join('; '));

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

  // L-6 mock labels match the rule on the sizes the cards show
  for (const k of Object.keys(seen).filter((x) => / \/mock-tests @/.test(x))) {
    const t = seen[k].text;
    const sec = t.slice(t.indexOf('More Mock Tests'));
    const cards = [...sec.matchAll(/(Full-length mock|Shorter mock)[\s\S]*?(\d+)m Duration\s*•\s*(\d+) Questions/g)];
    const wrong = cards.filter(([, lab, m, q]) => (Number(q) >= 100 && Number(m) >= 60) !== (lab === 'Full-length mock'));
    if (cards.length === 0) warnVacuous('L-6', `${label(k)} no mock cards in "More Mock Tests"`);
    else check('L-6', `${label(k)}: ${cards.length} card labels match the full-length rule`, wrong.length === 0, `${cards.filter((c) => c[1] === 'Full-length mock').length} full-length, ${cards.filter((c) => c[1] === 'Shorter mock').length} shorter`);
  }

  // L-7 a11y on every view
  const a11y = Object.entries(seen).filter(([, v]) => v.axe.length > 0 || v.h1 !== 1 || v.status !== 200).map(([k, v]) => `${label(k)} ${v.status} h1=${v.h1} [${v.axe.join(',')}]`);
  check('L-7', `axe 0 critical/serious, one h1, 200 on ${Object.keys(seen).length} views`, a11y.length === 0, a11y.join('; '));

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
