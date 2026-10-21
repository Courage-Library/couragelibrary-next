/**
 * Signed-in smoke for the permanent QA identities (TYPES-1 batch smokes). Read-only browsing: signs in through
 * /auth/login, opens pages, asserts content. Never prints passwords, cookies or ids.
 *
 * Usage: node scripts/smoke/signed-in-smoke.cjs <check> [baseUrl]
 *   check = student-mistake   qa-student: /mistakes lists ≥1 mistake; its detail shows the question text,
 *                             the options A–D and a marked correct answer; latest mock result renders a score
 *           student-pages     qa-student: community, descriptive, flashcards, institutes, premium, store, wallet,
 *                             dashboard render (200, no not-found, no error boundary); first thread / deck detail too;
 *                             /exams/ssc-cgl renders its syllabus section as the read model says: AVAILABLE → the
 *                             paper / section titles, no "coming soon"; NO_SYLLABUS → "Syllabus coming soon"
 *           admin-home        qa-admin:  /admin renders (200, no not-found)
 *           admin-pages       qa-admin:  B6 admin pages render (questions, sections, billing, community, descriptive,
 *                             institutes, mock-tests-management, bulk-import, taxonomy, exams) — no error boundary
 *           staff-content     qa-staff:  /admin/content and /admin/syllabus render (200, no not-found)
 *   baseUrl defaults to http://localhost:3100. Passwords come from .env.local (QA_*_PASSWORD).
 * The student check needs data: run scripts/e2e/ensure-student-fixture.cjs first (SMOKE-FIXTURE-1; idempotent,
 * creates one completed mock attempt with wrong answers for qa-student only when missing).
 */
const { chromium } = require('playwright');
const { readEnv } = require('../db/_db-env.cjs');
const { readModelForSlug, checkSyllabusSection } = require('./_syllabus-expect.cjs');

const [, , CHECK = 'student-mistake', BASE_ARG] = process.argv;
const BASE = (BASE_ARG || 'http://localhost:3100').replace(/\/$/, '');
const env = readEnv();
const IDS = {
  'student-mistake': ['qa-student@courage-library.test', 'QA_STUDENT_PASSWORD'],
  'student-pages': ['qa-student@courage-library.test', 'QA_STUDENT_PASSWORD'],
  'admin-home': ['qa-admin@courage-library.test', 'QA_ADMIN_PASSWORD'],
  'admin-pages': ['qa-admin@courage-library.test', 'QA_ADMIN_PASSWORD'],
  'staff-content': ['qa-staff@courage-library.test', 'QA_STAFF_PASSWORD'],
};
// app/error.tsx ("Something went wrong") or Next's error page ("Application error: a client-side / server-side
// exception has occurred"). Not a bare "Application error": published exam content can contain that phrase.
const ERROR_BOUNDARY = /Something went wrong|Application error: a (client|server)-side exception/i;
let fails = 0;
let vacuous = 0; // GATE-HYGIENE-1: a skipped check is reported as VACUOUS, never a silent pass
const check = (name, ok, info) => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? ' — ' + info : ''}`); };
const isNotFound = async (page) => /NEXT_HTTP_ERROR_FALLBACK;404|This page could not be found/.test(await page.content());

/** Runs in the page: reads the mistake detail without relying on ids or exact markup. */
function readMistakeDetail() {
  const lines = document.body.innerText.split(/\n/).map((l) => l.trim()).filter(Boolean);
  const i = lines.indexOf('QUESTION PROMPT');
  const prompt = i >= 0 ? lines[i + 1] || '' : '';
  const end = lines.findIndex((l, k) => k > i && /^(Explanation|My Revision Note)/.test(l));
  const block = i >= 0 ? lines.slice(i + 2, end > i ? end : i + 30) : [];
  const letters = new Set(block.filter((l) => /^[A-D]$/.test(l)));
  const rows = [...document.querySelectorAll('div, li, button, label')].filter((el) => /^[A-D]\s*\n/.test(el.innerText || '') && (el.innerText || '').length < 300);
  const marked = rows.some((el) => /emerald|green|success/.test(String(el.className || '')));
  return { promptLen: /^My Revision Note$/.test(prompt) ? 0 : prompt.length, optionLetters: letters.size, correctMarked: marked };
}

// PROD-TIMEOUT-1 (architect-approved): no 'networkidle'. Every navigation waits for 'load', then a page-specific required
// element, then observes a short window and FAILS if any path is requested > 3× or any request stays open > 30 s
// (counts recorded). networkidle measured "prefetching stopped", not "page ready", and timed out on prefetch bursts.
const OBSERVE_MS = 3000;
// loop-revealing requests (document, fetch / XHR / RSC, script, other) may repeat at most 3× per path; static resources
// (images, fonts, media, stylesheets, manifest) at most 10× — a page with several <img> of the same logo legitimately
// fetches it more than 3× (srcset variants), which is not a loop. Both maxima are recorded.
const STATIC_TYPES = new Set(['image', 'font', 'media', 'stylesheet', 'manifest']);
// Chromium reports some image fetches (e.g. the logo preloaded by next/image) as type "other": the path decides too
const STATIC_PATH = /^\/_next\/(image|static\/media)\b|\.(png|jpe?g|gif|svg|webp|avif|ico|woff2?|ttf|otf|css)$/i;
const MAX_REPEAT = 3;
const MAX_STATIC_REPEAT = 10;
const H = (name) => (pg) => pg.getByRole('heading', { name }).first();
const REQUIRED = {
  '/auth/login': ['email field', (pg) => pg.locator('input[type="email"]').first()],
  '/mistakes': ['a mistake detail link', (pg) => pg.locator('a[href^="/mistakes/"]:not([href^="/mistakes/drill"])').first()],
  'mistake-detail': ['"Question prompt" heading', H(/question prompt/i)],
  '/mock-tests': ['"Mock Tests" heading', H(/^Mock Tests$/)],
  'mock-result': ['"Question Review" heading', H(/Question Review/i)],
  '/dashboard': ['"Welcome back" heading', H(/^Welcome back/)],
  '/community': ['"Community Knowledge Exchange" heading', H(/Community Knowledge Exchange/)],
  '/descriptive': ['"Descriptive Answer Writing Studio" heading', H(/Descriptive Answer Writing Studio/)],
  '/descriptive/submissions': ['"My Descriptive Submissions" heading', H(/My Descriptive Submissions/)],
  '/flashcards': ['"Flashcard Library" heading', H(/Flashcard Library/)],
  '/institutes': ['"Coaching Institutes" heading', H(/^Coaching Institutes/)],
  // UX-2b: /premium permanently redirects to /pricing; the smoke follows the redirect and expects the pricing page
  '/premium': ['"Plans and pricing" heading (redirected from /premium)', H(/^Plans and pricing$/)],
  '/store': ['"Turn your consistency" heading', H(/Turn your consistency/)],
  '/wallet': ['"How to Earn CL Coins" heading', H(/How to Earn CL Coins/)],
  'detail-h1': ['an h1', (pg) => pg.locator('h1').first()],
  '/exams/ssc-cgl': ['"SSC CGL" heading + syllabus section', (pg) => pg.locator('section#syllabus')],
  '/admin': ['"Admin Studio Overview" heading', H(/Admin Studio Overview/)],
  '/admin/questions': ['"Question Bank Studio" heading', H(/Question Bank Studio/)],
  '/admin/sections': ['"Pattern Sections" heading', H(/Pattern Sections/)],
  '/admin/billing': ['"Subscription Plans" heading', H(/Subscription Plans & Payment Orders/)],
  '/admin/community': ['"Community Discussion Moderation" heading', H(/Community Discussion Moderation/)],
  '/admin/descriptive': ['"Mains Descriptive Questions" heading', H(/Mains Descriptive Questions/)],
  '/admin/institutes': ['"Partner Coaching Institutes CMS" heading', H(/Partner Coaching Institutes CMS/)],
  '/admin/mock-tests-management': ['"Mock Test Management" heading', H(/^Mock Test Management$/)],
  '/admin/bulk-import': ['"Bulk Question Importer" heading', H(/Bulk Question Importer/)],
  '/admin/taxonomy': ['"Academic Taxonomy" heading', H(/Academic Taxonomy/)],
  '/admin/exams': ['"Examination Management Hub" heading', H(/Examination Management Hub/)],
  '/admin/exam-knowledge': ['"Exam Knowledge Studio" heading', H(/Exam Knowledge Studio/)],
  '/admin/design-system': ['"Design system" heading', H(/^Design system$/)],
  '/admin/syllabus': ['"Syllabus" heading', H(/^Syllabus$/)],
  '/admin/content': ['"Admin Content Studio" heading', H(/Admin Content Studio/)],
};

(async () => {
  if (!IDS[CHECK]) throw new Error(`unknown check ${CHECK}`);
  const [email, key] = IDS[CHECK];
  const password = env(key);
  if (!password) throw new Error(`${key} missing in .env.local`);
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await (await browser.newContext()).newPage();
  const NET = { reqs: new Map(), active: false };
  const origin = new URL(BASE).origin;
  const pathOf = (u) => { try { const x = new URL(u); return (x.origin === origin ? '' : x.hostname.endsWith('supabase.co') ? '[supabase]' : '[external]') + x.pathname; } catch { return '?'; } };
  page.on('request', (r) => { if (NET.active) NET.reqs.set(r, { key: `${r.method()} ${pathOf(r.url())}`, isStatic: STATIC_TYPES.has(r.resourceType()) || STATIC_PATH.test(pathOf(r.url())), start: Date.now(), end: null }); });
  page.on('requestfinished', (r) => { const e = NET.reqs.get(r); if (e) e.end = Date.now(); });
  page.on('requestfailed', (r) => { const e = NET.reqs.get(r); if (e) e.end = Date.now(); });
  /** navigate: 'load' → required element visible → observe; checks the element and the request pattern; returns the response */
  const go = async (p, reqKey, timeout = 120000) => {
    const label = p.replace(/[0-9a-f-]{36}/g, '[id]');
    const [what, locate] = REQUIRED[reqKey || p];
    NET.reqs = new Map();
    NET.active = true;
    const res = await page.goto(BASE + p, { waitUntil: 'load', timeout });
    let visible = true;
    try { await locate(page).waitFor({ state: 'visible', timeout }); } catch { visible = false; }
    await page.waitForTimeout(OBSERVE_MS);
    NET.active = false;
    const now = Date.now();
    const all = [...NET.reqs.values()];
    const tally = (list) => { const m = {}; for (const e of list) m[e.key] = (m[e.key] || 0) + 1; return Object.entries(m).sort((a, b) => b[1] - a[1])[0] || ['-', 0]; };
    const [topKey, top] = tally(all.filter((e) => !e.isStatic));
    const [sKey, sTop] = tally(all.filter((e) => e.isStatic));
    const long = all.filter((e) => (e.end === null ? now : e.end) - e.start > 30000);
    let where = '';
    if (!visible) {
      const at = await page.evaluate(() => ({ path: location.pathname, h: [...document.querySelectorAll('h1,h2')].filter((e) => e.offsetParent !== null).map((e) => e.innerText.trim().slice(0, 40)).slice(0, 3) })).catch(() => ({ path: '?', h: [] }));
      where = `; now at ${at.path.replace(/[0-9a-f-]{36}/g, '[id]')}, headings ${JSON.stringify(at.h)}`;
    }
    check(`${label} required element visible (${what})`, visible, visible ? '' : `not visible within ${timeout / 1000} s${where}`);
    check(`${label} network: no path requested > ${MAX_REPEAT}× (static > ${MAX_STATIC_REPEAT}×), nothing open > 30 s`, top <= MAX_REPEAT && sTop <= MAX_STATIC_REPEAT && long.length === 0,
      `${all.length} requests, max ${top}× ${topKey}, static max ${sTop}× ${sKey}${long.length ? `, ${long.length} > 30 s: ${long.slice(0, 3).map((e) => e.key).join(', ')}` : ', none > 30 s'}`);
    return res;
  };
  for (let i = 1; i <= 3; i++) {
    await go('/auth/login');
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await Promise.all([page.waitForURL((u) => !/\/auth\/login/.test(String(u)), { timeout: 60000 }).catch(() => undefined), page.locator('button[type="submit"]').first().click()]);
    if (!/\/auth\/login/.test(page.url())) break;
    if (i === 3) throw new Error(`sign-in failed (${CHECK.split('-')[0]})`);
  }
  check('signed in', true, new URL(page.url()).pathname);

  if (CHECK === 'student-mistake') {
    await go('/mistakes');
    const hrefs = await page.$$eval('a[href^="/mistakes/"]', (as) => as.map((a) => a.getAttribute('href')).filter((h) => /^\/mistakes\/[0-9a-f-]{36}$/.test(h)));
    check('/mistakes lists at least one mistake', hrefs.length > 0, `${hrefs.length} links`);
    if (hrefs.length) {
      const res = await go(hrefs[0], 'mistake-detail');
      const info = await page.evaluate(readMistakeDetail);
      check('mistake detail → 200, not not-found', res && res.status() === 200 && !(await isNotFound(page)), String(res && res.status()));
      check('mistake detail shows question text (non-empty prompt)', info.promptLen > 10, `${info.promptLen} chars`);
      check('mistake detail shows the options A–D', info.optionLetters >= 2, `${info.optionLetters} option letters`);
      check('mistake detail marks the correct answer', info.correctMarked);
    }
    await go('/mock-tests');
    await page.locator('a[href*="/result"]').first().waitFor({ state: 'visible', timeout: 30000 }).catch(() => undefined);
    const resultHref = await page.$$eval('a[href*="/result"]', (as) => (as[0] ? as[0].getAttribute('href') : null));
    if (resultHref) {
      const r = await go(resultHref, 'mock-result');
      check('mock result renders a score', r && r.status() === 200 && /score|marks|accuracy/i.test(await page.content()));
    } else {
      check('mock result link present on /mock-tests', false, 'none found');
    }
  } else if (CHECK === 'student-pages') {
    const PAGES = ['/dashboard', '/community', '/descriptive', '/descriptive/submissions', '/flashcards', '/institutes', '/premium', '/store', '/wallet'];
    const visit = async (p, reqKey) => {
      const r = await go(p, reqKey);
      const html = await page.content();
      const errorBoundary = ERROR_BOUNDARY.test(html);
      check(`${p.replace(/[0-9a-f-]{36}/g, '[id]')} → 200, renders`, r && r.status() === 200 && !(await isNotFound(page)) && !errorBoundary, String(r && r.status()) + (errorBoundary ? ' error-boundary' : ''));
    };
    for (const p of PAGES) await visit(p);
    for (const [list, re] of [['/community', /^\/community\/[0-9a-f-]{36}$/], ['/flashcards', /^\/flashcards\/[0-9a-f-]{36}$/]]) {
      await go(list);
      const href = await page.$$eval('a[href]', (as, src) => { const r = new RegExp(src); const h = as.map((a) => a.getAttribute('href')).find((x) => r.test(x || '')); return h || null; }, re.source);
      if (href) await visit(href, 'detail-h1'); else { vacuous++; console.log(`WARN  VACUOUS (0 items): no detail link on ${list} — its detail page was not checked`); }
    }
    // GAP2-4b + QB-KEY-1 round 2: the exam hub's syllabus section must match the canonical read model — AVAILABLE →
    // the paper / section titles and no coming-soon; NO_SYLLABUS → "Syllabus coming soon" (scripts/smoke/_syllabus-expect.cjs)
    await visit('/exams/ssc-cgl');
    const hub = await page.content();
    const rm = await readModelForSlug(env, 'ssc-cgl');
    const sy = checkSyllabusSection(hub, rm);
    check('/exams/ssc-cgl syllabus section matches the read model', sy.ok, sy.detail);
  } else if (CHECK === 'admin-pages') {
    const ADMIN = ['/admin', '/admin/questions', '/admin/sections', '/admin/billing', '/admin/community', '/admin/descriptive', '/admin/institutes', '/admin/mock-tests-management', '/admin/bulk-import', '/admin/taxonomy', '/admin/exams', '/admin/exam-knowledge', '/admin/design-system', '/admin/syllabus'];
    for (const p of ADMIN) {
      const r = await go(p, undefined, 180000);
      const html = await page.content();
      const errorBoundary = ERROR_BOUNDARY.test(html);
      check(`${p} → 200, renders`, r && r.status() === 200 && !(await isNotFound(page)) && !errorBoundary, String(r && r.status()) + (errorBoundary ? ' error-boundary' : ''));
    }
  } else {
    // GAP2-4b: staff also reach the syllabus editor (publish stays admin-only)
    for (const p of CHECK === 'admin-home' ? ['/admin'] : ['/admin/content', '/admin/syllabus']) {
      const r = await go(p);
      check(`${p} → 200 and renders`, r && r.status() === 200 && !(await isNotFound(page)), String(r && r.status()));
    }
  }
  await browser.close();
  const vac = vacuous ? ` (${vacuous} VACUOUS WARN)` : '';
  console.log(fails ? `\nSIGNED-IN SMOKE (${CHECK}): ${fails} failed${vac}` : `\nSIGNED-IN SMOKE (${CHECK}): all passed${vac}`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('SIGNED-IN SMOKE ERROR', String(e.message).slice(0, 200)); process.exit(1); });
