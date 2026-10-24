/**
 * Student E2E journey against a locally running app (npm run dev -- --port 3100) and the dev DB.
 * login → /mock-tests → start daily mock → 3 wrong + 3 right (autosave) → guards → reload → submit
 * → result → /mistakes shows the 3 wrong answers → mistake detail → /admin blocked.
 * Follow with assert-mistake-lineage.cjs, then cleanup-student.cjs.
 * Usage: node scripts/e2e/student-journey.cjs
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { qaBrowserLogin, qaUserClient } = require('../live/qa-session.cjs');
const { BASE, EMAIL, OUT_DIR, SCREENS_DIR, admin, ensureStudent, resolveMockId, stepRecorder } = require('./_e2e-env.cjs');

const { results, step } = stepRecorder();
if (SCREENS_DIR) fs.mkdirSync(SCREENS_DIR, { recursive: true });
const shot = async (page, name) => {
  if (SCREENS_DIR) await page.screenshot({ path: path.join(SCREENS_DIR, name + '.png'), fullPage: false });
};
const pathOf = (url) => new URL(url).pathname.replace(/[0-9a-f-]{36}/g, ':id');

(async () => {
  const MOCK = await resolveMockId();
  const { user } = await ensureStudent();
  const uid = user.id;
  console.log('student id prefix:', uid.slice(0, 8));

  // Answer key (service role, server-side) — used only to pick right/wrong options.
  const { data: mqs, error: mqErr } = await admin
    .from('mock_questions')
    .select('id, question_order, question_version_id, question_versions(question_text, question_options(option_key, option_text), question_answers(correct_option_key))')
    .eq('mock_test_id', MOCK)
    .order('question_order', { ascending: true });
  if (mqErr) throw mqErr;
  const key = mqs.map((m) => {
    const qv = m.question_versions;
    const ans = Array.isArray(qv.question_answers) ? qv.question_answers[0] : qv.question_answers;
    return { order: m.question_order, text: qv.question_text, options: qv.question_options, correct: ans?.correct_option_key };
  });

  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  // 1. Sign in — CI-FIX-1 (#74): CAPTCHA-safe QA session cookies (no login form; scripts/live/qa-session.cjs)
  await qaBrowserLogin(context, EMAIL, BASE);
  const page = await context.newPage();
  page.setDefaultTimeout(120000);
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle', timeout: 240000 });
  step('E2E-01 signed in (QA session) → dashboard', new URL(page.url()).pathname === '/dashboard', new URL(page.url()).pathname);
  await shot(page, '01-dashboard');

  // 2. Mock tests list
  await page.goto(`${BASE}/mock-tests`, { waitUntil: 'networkidle', timeout: 240000 });
  step('E2E-02 /mock-tests renders', (await page.content()).includes('Mock'));
  await shot(page, '02-mock-tests');

  // 3. Start the mock. Client navigation can take >8 s in dev mode: wait for it, never race a second goto.
  await page.goto(`${BASE}/mock-tests/${MOCK}`, { waitUntil: 'networkidle', timeout: 240000 });
  await shot(page, '03-mock-detail');
  const agree = page.getByRole('button', { name: /I Agree & Start Test/i });
  await agree.first().waitFor({ state: 'visible', timeout: 240000 });
  await Promise.all([page.waitForURL(/\/take/, { timeout: 300000 }), agree.first().click()]);
  await page.waitForLoadState('networkidle');
  const begin = page.getByRole('button', { name: /Begin Test/i });
  const submitBtn = page.getByRole('button', { name: /Submit Test/i }).first();
  await begin.first().waitFor({ state: 'visible', timeout: 300000 }).catch(() => undefined);
  // Let the dev-server bundle hydrate before the first click (an early click can be lost), then
  // retry Begin until the player shows.
  await page.waitForTimeout(5000);
  for (let i = 0; i < 10 && !(await submitBtn.isVisible().catch(() => false)); i++) {
    if (await begin.count()) await begin.first().click().catch(() => undefined);
    await submitBtn.waitFor({ state: 'visible', timeout: 20000 }).catch(() => undefined);
  }
  if (!(await submitBtn.isVisible().catch(() => false))) {
    await shot(page, '04-player-not-started');
    console.log('player text:', (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(0, 400));
  }
  await submitBtn.waitFor({ state: 'visible', timeout: 60000 });
  await page.waitForTimeout(1500);
  await shot(page, '04-player-started');
  step('E2E-03 player started', (await page.getByRole('button', { name: /submit/i }).count()) > 0);

  const { data: att } = await admin.from('test_attempts').select('id, status, started_at').eq('user_id', uid).eq('mock_test_id', MOCK).eq('status', 'in_progress').maybeSingle();
  step('E2E-04 attempt in_progress created', !!att, att ? `attempt ${att.id.slice(0, 8)}` : 'none');
  if (!att) throw new Error('no in-progress attempt');

  // 4. Answer 6 questions: first 3 wrong, next 3 right.
  const chosen = [];
  const nextBtn = () => page.getByRole('button', { name: /(save\s*&\s*next|^next)/i }).first();
  for (let i = 0; i < 6; i++) {
    const k = key[i];
    const wantWrong = i < 3;
    const opt = wantWrong ? k.options.find((o) => o.option_key !== k.correct) : k.options.find((o) => o.option_key === k.correct);
    // Scope to the option card (a bare text match can hit the question palette, e.g. "36").
    const card = page.locator('div.cursor-pointer').filter({ has: page.getByText(opt.option_text, { exact: true }) }).first();
    const clicked = await card.click({ timeout: 15000 }).then(() => true).catch(() => false);
    if (!clicked) await page.keyboard.press(opt.option_key.toLowerCase());
    chosen.push({ i, key: opt.option_key, correct: k.correct, wrong: wantWrong });
    await page.waitForTimeout(700);
    if (i < 5) await nextBtn().click();
    await page.waitForTimeout(500);
  }
  // Autosave is asynchronous (slow on a dev server): poll up to 30 s instead of sampling once.
  let saved = [];
  for (let i = 0; i < 30; i++) {
    const { data } = await admin.from('attempt_answers').select('selected_option_key').eq('attempt_id', att.id);
    saved = (data || []).filter((a) => a.selected_option_key);
    if (saved.length >= 6) break;
    await page.waitForTimeout(1000);
  }
  step('E2E-05 answered 6 questions (3 wrong, 3 right) and autosaved', saved.length >= 6, `${saved.length} answer rows`);
  await shot(page, '05-answered');

  // 5. Concurrent second attempt on the same daily mock (student session, direct insert) is rejected.
  const uc = await qaUserClient(EMAIL); // CI-FIX-1 (#74): CAPTCHA-safe QA session
  const { error: dupErr } = await uc.from('test_attempts').insert({ user_id: uid, mock_test_id: MOCK, status: 'in_progress', started_at: new Date().toISOString() });
  step('E2E-06 second concurrent attempt rejected', !!dupErr && /23505|ACTIVE_ATTEMPT_EXISTS|duplicate/i.test(`${dupErr.code} ${dupErr.message}`), dupErr ? `${dupErr.code}` : 'INSERTED (unexpected)');

  // 6. Student cannot read the answer key.
  const { data: qa, error: qaErr } = await uc.from('question_answers').select('question_version_id').limit(5);
  step('E2E-07 student cannot read question_answers', !!qaErr || (qa || []).length === 0, qaErr ? `${qaErr.code} denied` : `${(qa || []).length} rows`);

  // 7. Reload mid-test: answers and timer restored.
  const timerText = async () => (await page.$$eval('body *', (els) => els.map((e) => (e.childElementCount === 0 ? (e.textContent || '').trim() : '')).filter((t) => /^\d{1,2}:\d{2}(:\d{2})?$/.test(t))))[0] || null;
  const tBefore = await timerText();
  await page.reload({ waitUntil: 'networkidle', timeout: 240000 });
  const resume = page.getByRole('button', { name: /Begin Test|Resume/i });
  if (await resume.count()) await resume.first().click();
  await page.waitForTimeout(2000);
  const tAfter = await timerText();
  const q1 = page.getByRole('button', { name: /^1$/ }).first();
  if (await q1.count()) await q1.click();
  await page.waitForTimeout(800);
  const selectedNow = await page.$$eval('[class*="border-blue-500"]', (els) => els.map((e) => (e.innerText || '').trim().slice(0, 60)));
  const firstWrongText = key[0].options.find((o) => o.option_key === chosen[0].key).option_text;
  step('E2E-08 reload restores answers', selectedNow.some((t) => t.includes(firstWrongText.slice(0, 20))), `selected after reload: ${selectedNow.length}`);
  step('E2E-09 reload restores timer (from started_at)', !!tBefore && !!tAfter, `before ${tBefore} → after ${tAfter}`);
  await shot(page, '06-after-reload');

  // 8. Submit
  await page.getByRole('button', { name: /^submit/i }).first().click();
  await page.waitForTimeout(800);
  const confirm = page.getByRole('button', { name: /(confirm|yes).*submit|submit (test|now|exam)|final submit/i });
  await Promise.all([
    page.waitForURL(/result/, { timeout: 240000 }).catch(() => undefined),
    (await confirm.count()) ? confirm.last().click() : page.getByRole('button', { name: /submit/i }).last().click(),
  ]);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  step('E2E-10 submit → result page renders score', /result/.test(page.url()) && /score|marks|accuracy/i.test(await page.content()), pathOf(page.url()));
  await shot(page, '07-result');

  // 9. /mistakes shows the 3 wrong answers.
  await page.goto(`${BASE}/mistakes`, { waitUntil: 'networkidle', timeout: 240000 });
  await page.waitForTimeout(1500);
  const mHtml = (await page.content()).replace(/\s+/g, ' ');
  const visible = key.slice(0, 3).map((k) => k.text.replace(/\s+/g, ' ').slice(0, 30)).filter((s) => mHtml.includes(s)).length;
  step('E2E-11 /mistakes shows the wrong answers', visible === 3, `${visible}/3 wrong stems visible`);
  await shot(page, '08-mistakes');

  // 10. Open one mistake.
  const links = await page.$$eval('a[href^="/mistakes/"]', (els) => [...new Set(els.map((e) => e.getAttribute('href')))].filter((h) => h && h.split('/').length >= 3));
  if (links.length) {
    const resp = await page.goto(BASE + links[0], { waitUntil: 'networkidle', timeout: 240000 });
    await page.waitForTimeout(1500);
    step('E2E-12 open one mistake', !!resp && resp.status() === 200 && !/could not be found/i.test(await page.content()), pathOf(BASE + links[0]));
    await shot(page, '09-mistake-detail');
  } else {
    step('E2E-12 open one mistake', false, 'no mistake links');
  }

  // 11. Student cannot open /admin (SEC-1C: signed in without a role → not-found page, no admin UI).
  await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle', timeout: 240000 });
  const adminHtml = await page.content();
  step('E2E-13 student blocked from /admin', /Page Not Found/i.test(adminHtml) && !/QUESTION BANK|Admin Studio Console|aria-label="Admin/i.test(adminHtml));
  await shot(page, '10-admin-restricted');

  await browser.close();
  fs.writeFileSync(path.join(OUT_DIR, 'e2e_journey_result.json'), JSON.stringify({ uid8: uid.slice(0, 8), attempt8: att.id.slice(0, 8), chosen, results }, null, 1));
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\nJourney: ${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.log('JOURNEY ERR', String(e.message).slice(0, 400));
  process.exit(1);
});
