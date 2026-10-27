/**
 * SMOKE-FIXTURE-1 — make sure the permanent qa-student has the data the `student-mistake` smoke needs:
 * one COMPLETED mock attempt with at least one wrong answer and at least one open Mistake Vault row.
 *
 * Idempotent: when the fixture already exists it does nothing. Otherwise it completes ONE published, free,
 * non-dynamic SSC CGL mock through the normal app (browser on the LOCAL production build): sign in → start →
 * answer Q1–Q2 wrong and Q3–Q5 right (deterministic) → submit. No direct table writes (decision #42): every write
 * is made by the app's own paths. The answer key is read server-side (read-only, verified TLS) only to choose
 * which option to click — the same approach as scripts/e2e/student-journey.cjs.
 *
 * Safety:
 *   - only qa-student@courage-library.test (permanent identity; CAPTCHA-safe QA session via scripts/live/qa-session.cjs, CI-FIX-1); it is never
 *     created, modified or deleted here, and no other user is touched;
 *   - local build only (refuses any non-localhost base); run it through the live-gate runner:
 *       node scripts/live/with-server.cjs -- "node scripts/e2e/ensure-student-fixture.cjs http://localhost:3100"
 *   - the mock used must contain none of the 8 retired CA-4 fixture questions (QB-KEY-1) and only versions with a
 *     valid key (4 options A–D, key among them);
 *   - refuses if qa-student has an in-progress attempt (it never edits rows to clear one);
 *   - every wait is bounded; prints no secrets or hosts.
 *
 * Usage: node scripts/e2e/ensure-student-fixture.cjs [http://localhost:3100] [--mock-slug=<slug>]
 * Exit 0 = fixture present (already or now); 1 = could not create it (details printed).
 */
const { safeBegin } = require('../db/live-safety.cjs'); // LIVE-LOCK-SWEEP: the one safe BEGIN (timeouts + rollback on stop)
const { Client } = require('pg');
const { chromium } = require('playwright');
const { qaBrowserLogin } = require('../live/qa-session.cjs');
const { dbTarget } = require('../db/_db-env.cjs');

const BASE = (process.argv.slice(2).find((a) => /^https?:/.test(a)) || process.env.BASE_URL || 'http://localhost:3100').replace(/\/$/, '');
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(BASE).hostname)) { console.error('refused: local build only'); process.exit(2); }
const SLUG_ARG = (process.argv.find((a) => a.startsWith('--mock-slug=')) || '').split('=')[1] || null;
const EMAIL = 'qa-student@courage-library.test';

// QB-KEY-1: the 8 retired CA-4 fixture questions (docs/reports/qb/QB_KEY1_STAGE1_REPORT.md §1.1) — never in the fixture mock
const CA4_FIXTURE_QUESTION_PREFIXES = ['c6cbfdbf', '234486ee', '597c1c98', '1fdd3747', 'd00219c2', '3735364e', '78bd0707', '94b30583'];
const WRONG = 2;
const RIGHT = 3;

/** read-only query helper: one transaction, verified TLS, ≤ 3 attempts on network errors */
async function readOnly(fn) {
  let last = null;
  for (let i = 1; i <= 3; i++) {
    const c = new Client({ ...dbTarget().pg, port: 6543 });
    c.on('error', () => {});
    try {
      await c.connect();
      await safeBegin(c, { readOnly: true });

      const out = await fn((s, p) => c.query(s, p).then((r) => r.rows));
      await c.query('ROLLBACK');
      return out;
    } catch (e) { last = e; } finally { await c.end().catch(() => {}); }
  }
  throw new Error(`DB read failed (${last && (last.code || last.name)})`);
}

async function fixtureState(uid) {
  return readOnly(async (q) => (await q(`SELECT
      (SELECT count(*) FROM public.test_attempts t WHERE t.user_id = $1 AND t.status IN ('submitted','completed')
         AND EXISTS (SELECT 1 FROM public.attempt_answers aa WHERE aa.attempt_id = t.id AND aa.is_correct = false))::int completed_with_wrong,
      (SELECT count(*) FROM public.user_mistake_vault v WHERE v.user_id = $1 AND v.lifecycle_status IN ('UNRESOLVED','REVISITING'))::int open_vault,
      (SELECT count(*) FROM public.test_attempts t WHERE t.user_id = $1 AND t.status = 'in_progress')::int in_progress`, [uid]))[0]);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const uid = await readOnly(async (q) => ((await q(`SELECT id FROM auth.users WHERE email = $1`, [EMAIL]))[0] || {}).id);
  if (!uid) { console.error('qa-student does not exist (permanent identity missing) — not creating it'); process.exit(1); }
  const before = await fixtureState(uid);
  console.log(`qa-student state: completed attempts with a wrong answer ${before.completed_with_wrong}, open vault rows ${before.open_vault}, in-progress ${before.in_progress}`);
  if (before.completed_with_wrong >= 1 && before.open_vault >= 1) { console.log('FIXTURE PRESENT — nothing to do'); process.exit(0); }
  if (before.in_progress > 0) { console.error('qa-student has an in-progress attempt — refusing (finish or clean it with cleanup-student first)'); process.exit(1); }

  // choose the mock: published, free, non-dynamic, SSC CGL; no CA-4 fixture question; every version has a valid key
  const mock = await readOnly(async (q) => {
    const rows = await q(`
      SELECT mt.id, mt.slug,
             count(mq.id)::int n_q,
             count(*) FILTER (WHERE left(v.question_id::text, 8) = ANY($1))::int ca4,
             count(*) FILTER (WHERE (SELECT count(*) FROM public.question_options o WHERE o.question_version_id = v.id) <> 4
                OR NOT EXISTS (SELECT 1 FROM public.question_answers a JOIN public.question_options o ON o.question_version_id = a.question_version_id AND o.option_key = a.correct_option_key WHERE a.question_version_id = v.id))::int invalid
        FROM public.mock_tests mt
        JOIN public.mock_templates tp ON tp.id = mt.template_id
        JOIN public.exams e ON e.id = tp.exam_id
        JOIN public.mock_questions mq ON mq.mock_test_id = mt.id
        JOIN public.question_versions v ON v.id = mq.question_version_id
       WHERE mt.status = 'published' AND mt.is_free AND NOT mt.is_dynamic AND e.slug = 'ssc-cgl'
       GROUP BY mt.id, mt.slug`, [CA4_FIXTURE_QUESTION_PREFIXES]);
    const ok = rows.filter((r) => r.ca4 === 0 && r.invalid === 0 && r.n_q >= WRONG + RIGHT);
    const pick = (SLUG_ARG && ok.find((r) => r.slug === SLUG_ARG)) || ok.find((r) => r.slug === 'ssc-cgl-daily-monday-mock') || ok.sort((a, b) => a.slug.localeCompare(b.slug))[0];
    return pick || null;
  });
  if (!mock) { console.error('no eligible mock (published, free, SSC CGL, no CA-4 fixture question, all keys valid)'); process.exit(1); }
  console.log(`mock: ${mock.slug} (${mock.n_q} questions, CA-4 fixtures 0, invalid keys 0)`);

  const key = await readOnly((q) => q(`
    SELECT mq.question_order, a.correct_option_key correct,
           json_agg(json_build_object('k', o.option_key, 't', o.option_text) ORDER BY o.option_key) opts
      FROM public.mock_questions mq
      JOIN public.question_answers a ON a.question_version_id = mq.question_version_id
      JOIN public.question_options o ON o.question_version_id = mq.question_version_id
     WHERE mq.mock_test_id = $1 GROUP BY mq.question_order, a.correct_option_key ORDER BY mq.question_order LIMIT $2`, [mock.id, WRONG + RIGHT]));

  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  let ok = false;
  try {
    const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    // CI-FIX-1 (#74): CAPTCHA-safe QA session cookies (no login form; scripts/live/qa-session.cjs)
    await qaBrowserLogin(context, EMAIL, BASE);
    const page = await context.newPage();
    page.setDefaultTimeout(120000);
    await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle', timeout: 180000 });
    if (new URL(page.url()).pathname.startsWith('/auth/login')) throw new Error('QA session not accepted (qa-student)');
    console.log('signed in');

    // start the mock (same UI path as the E2E journey)
    await page.goto(`${BASE}/mock-tests/${mock.id}`, { waitUntil: 'networkidle', timeout: 180000 });
    const agree = page.getByRole('button', { name: /I Agree & Start Test/i });
    await agree.first().waitFor({ state: 'visible', timeout: 180000 });
    await Promise.all([page.waitForURL(/\/take/, { timeout: 180000 }), agree.first().click()]);
    await page.waitForLoadState('networkidle');
    const begin = page.getByRole('button', { name: /Begin Test/i });
    const submitBtn = page.getByRole('button', { name: /Submit Test/i }).first();
    await begin.first().waitFor({ state: 'visible', timeout: 120000 }).catch(() => undefined);
    await sleep(3000);
    for (let i = 0; i < 10 && !(await submitBtn.isVisible().catch(() => false)); i++) {
      if (await begin.count()) await begin.first().click().catch(() => undefined);
      await submitBtn.waitFor({ state: 'visible', timeout: 15000 }).catch(() => undefined);
    }
    await submitBtn.waitFor({ state: 'visible', timeout: 60000 });
    console.log('player started');

    // answer: first WRONG wrong, next RIGHT right
    const nextBtn = () => page.getByRole('button', { name: /(save\s*&\s*next|^next)/i }).first();
    for (let i = 0; i < key.length; i++) {
      const k = key[i];
      const wantWrong = i < WRONG;
      const opt = wantWrong ? k.opts.find((o) => o.k !== k.correct) : k.opts.find((o) => o.k === k.correct);
      const card = page.locator('button[role="radio"]').filter({ has: page.getByText(opt.t, { exact: true }) }).first();
      const clicked = await card.click({ timeout: 15000 }).then(() => true).catch(() => false);
      if (!clicked) await page.keyboard.press(opt.k.toLowerCase());
      await sleep(700);
      if (i < key.length - 1) await nextBtn().click();
      await sleep(500);
    }
    // autosave is asynchronous: bounded poll (≤ 30 s) through the student's own state
    for (let i = 0; i < 30; i++) {
      const saved = await readOnly(async (q) => (await q(`SELECT count(*)::int n FROM public.attempt_answers aa JOIN public.test_attempts t ON t.id = aa.attempt_id
          WHERE t.user_id = $1 AND t.status = 'in_progress' AND aa.selected_option_key IS NOT NULL`, [uid]))[0].n);
      if (saved >= key.length) break;
      await sleep(1000);
    }
    console.log(`answered ${key.length} (${WRONG} wrong, ${RIGHT} right)`);

    // submit (same confirm handling as the journey)
    await page.getByRole('button', { name: /^submit/i }).first().click();
    await sleep(800);
    const confirm = page.getByRole('button', { name: /(confirm|yes).*submit|submit (test|now|exam)|final submit/i });
    await Promise.all([
      page.waitForURL(/result/, { timeout: 180000 }).catch(() => undefined),
      (await confirm.count()) ? confirm.last().click() : page.getByRole('button', { name: /submit/i }).last().click(),
    ]);
    await page.waitForLoadState('networkidle').catch(() => undefined);
    console.log(`after submit: ${/result/.test(page.url()) ? 'result page' : 'no result page'}`);

    // postcondition (bounded: the vault rows are written by the submit path)
    for (let i = 0; i < 20 && !ok; i++) {
      const s = await fixtureState(uid);
      ok = s.completed_with_wrong >= 1 && s.open_vault >= 1;
      if (!ok) await sleep(1500);
      else console.log(`qa-student state: completed attempts with a wrong answer ${s.completed_with_wrong}, open vault rows ${s.open_vault}`);
    }
  } finally {
    await browser.close();
  }
  if (!ok) { console.error('FIXTURE NOT CREATED: postcondition not met after submit'); process.exit(1); }
  console.log('FIXTURE CREATED');
})().catch((e) => { console.error('ERROR', String(e && e.message ? e.message : e).split('\n')[0].slice(0, 200)); process.exit(1); });
