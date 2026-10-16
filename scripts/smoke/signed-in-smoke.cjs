/**
 * Signed-in smoke for the permanent QA identities (TYPES-1 batch smokes). Read-only browsing: signs in through
 * /auth/login, opens pages, asserts content. Never prints passwords, cookies or ids.
 *
 * Usage: node scripts/smoke/signed-in-smoke.cjs <check> [baseUrl]
 *   check = student-mistake   qa-student: /mistakes lists ≥1 mistake; its detail shows the question text,
 *                             the options A–D and a marked correct answer; latest mock result renders a score
 *           student-pages     qa-student: community, descriptive, flashcards, institutes, premium, store, wallet,
 *                             dashboard render (200, no not-found, no error boundary); first thread / deck detail too
 *           admin-home        qa-admin:  /admin renders (200, no not-found)
 *           admin-pages       qa-admin:  B6 admin pages render (questions, sections, billing, community, descriptive,
 *                             institutes, mock-tests-management, bulk-import, taxonomy, exams) — no error boundary
 *           staff-content     qa-staff:  /admin/content and /admin/syllabus render (200, no not-found)
 *   baseUrl defaults to http://localhost:3100. Passwords come from .env.local (QA_*_PASSWORD).
 * The student check needs data: run the E2E journey first (E2E_KEEP_USER=1) and the data-only cleanup after.
 */
const { chromium } = require('playwright');
const { readEnv } = require('../db/_db-env.cjs');

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
let fails = 0;
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

(async () => {
  if (!IDS[CHECK]) throw new Error(`unknown check ${CHECK}`);
  const [email, key] = IDS[CHECK];
  const password = env(key);
  if (!password) throw new Error(`${key} missing in .env.local`);
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await (await browser.newContext()).newPage();
  for (let i = 1; i <= 3; i++) {
    await page.goto(`${BASE}/auth/login`, { waitUntil: 'networkidle', timeout: 120000 });
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await Promise.all([page.waitForURL((u) => !/\/auth\/login/.test(String(u)), { timeout: 60000 }).catch(() => undefined), page.locator('button[type="submit"]').first().click()]);
    if (!/\/auth\/login/.test(page.url())) break;
    if (i === 3) throw new Error(`sign-in failed (${CHECK.split('-')[0]})`);
  }
  check('signed in', true, new URL(page.url()).pathname);

  if (CHECK === 'student-mistake') {
    await page.goto(`${BASE}/mistakes`, { waitUntil: 'networkidle', timeout: 120000 });
    const hrefs = await page.$$eval('a[href^="/mistakes/"]', (as) => as.map((a) => a.getAttribute('href')).filter((h) => /^\/mistakes\/[0-9a-f-]{36}$/.test(h)));
    check('/mistakes lists at least one mistake', hrefs.length > 0, `${hrefs.length} links`);
    if (hrefs.length) {
      const res = await page.goto(BASE + hrefs[0], { waitUntil: 'networkidle', timeout: 120000 });
      const info = await page.evaluate(readMistakeDetail);
      check('mistake detail → 200, not not-found', res && res.status() === 200 && !(await isNotFound(page)), String(res && res.status()));
      check('mistake detail shows question text (non-empty prompt)', info.promptLen > 10, `${info.promptLen} chars`);
      check('mistake detail shows the options A–D', info.optionLetters >= 2, `${info.optionLetters} option letters`);
      check('mistake detail marks the correct answer', info.correctMarked);
    }
    await page.goto(`${BASE}/mock-tests`, { waitUntil: 'networkidle', timeout: 120000 });
    const resultHref = await page.$$eval('a[href*="/result"]', (as) => (as[0] ? as[0].getAttribute('href') : null));
    if (resultHref) {
      const r = await page.goto(BASE + resultHref, { waitUntil: 'networkidle', timeout: 120000 });
      check('mock result renders a score', r && r.status() === 200 && /score|marks|accuracy/i.test(await page.content()));
    } else {
      check('mock result link present on /mock-tests', false, 'none found');
    }
  } else if (CHECK === 'student-pages') {
    const PAGES = ['/dashboard', '/community', '/descriptive', '/descriptive/submissions', '/flashcards', '/institutes', '/premium', '/store', '/wallet'];
    const visit = async (p) => {
      const r = await page.goto(BASE + p, { waitUntil: 'networkidle', timeout: 120000 });
      const html = await page.content();
      const errorBoundary = /Something went wrong|Application error/i.test(html);
      check(`${p.replace(/[0-9a-f-]{36}/g, '[id]')} → 200, renders`, r && r.status() === 200 && !(await isNotFound(page)) && !errorBoundary, String(r && r.status()) + (errorBoundary ? ' error-boundary' : ''));
    };
    for (const p of PAGES) await visit(p);
    for (const [list, re] of [['/community', /^\/community\/[0-9a-f-]{36}$/], ['/flashcards', /^\/flashcards\/[0-9a-f-]{36}$/]]) {
      await page.goto(BASE + list, { waitUntil: 'networkidle', timeout: 120000 });
      const href = await page.$$eval('a[href]', (as, src) => { const r = new RegExp(src); const h = as.map((a) => a.getAttribute('href')).find((x) => r.test(x || '')); return h || null; }, re.source);
      if (href) await visit(href); else console.log(`INFO  no detail link on ${list} (no data)`);
    }
  } else if (CHECK === 'admin-pages') {
    const ADMIN = ['/admin', '/admin/questions', '/admin/sections', '/admin/billing', '/admin/community', '/admin/descriptive', '/admin/institutes', '/admin/mock-tests-management', '/admin/bulk-import', '/admin/taxonomy', '/admin/exams', '/admin/syllabus-reconciliation', '/admin/exam-knowledge', '/admin/design-system', '/admin/syllabus'];
    for (const p of ADMIN) {
      const r = await page.goto(BASE + p, { waitUntil: 'networkidle', timeout: 180000 });
      const html = await page.content();
      const errorBoundary = /Something went wrong|Application error/i.test(html);
      check(`${p} → 200, renders`, r && r.status() === 200 && !(await isNotFound(page)) && !errorBoundary, String(r && r.status()) + (errorBoundary ? ' error-boundary' : ''));
    }
  } else {
    // GAP2-4b: staff also reach the syllabus editor (publish stays admin-only)
    for (const p of CHECK === 'admin-home' ? ['/admin'] : ['/admin/content', '/admin/syllabus']) {
      const r = await page.goto(BASE + p, { waitUntil: 'networkidle', timeout: 120000 });
      check(`${p} → 200 and renders`, r && r.status() === 200 && !(await isNotFound(page)), String(r && r.status()));
    }
  }
  await browser.close();
  console.log(fails ? `\nSIGNED-IN SMOKE (${CHECK}): ${fails} failed` : `\nSIGNED-IN SMOKE (${CHECK}): all passed`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('SIGNED-IN SMOKE ERROR', String(e.message).slice(0, 200)); process.exit(1); });
