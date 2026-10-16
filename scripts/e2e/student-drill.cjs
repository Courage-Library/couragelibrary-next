/**
 * Mistake-drill flow (SEC-HOTFIX-7 check, permanent gate since DRILL-1) as the permanent QA student, against a LOCAL
 * production build.
 *
 * Since DRILL-1 (085) the drill is generated and graded server-side (fn_generate_mistake_drill / fn_submit_mistake_drill,
 * auth.uid()); the submit RPC awards no coins (TYPES-1:B-DRILL-REWARD-ARGS, Commerce). This check proves the UI flow
 * completes and records coins_awarded = 0 honestly (no coin ledger row, no gamification event):
 *   D-01 sign in → /mistakes/drill → "Start Remediation Drill" → runner shows the drill
 *   D-02 "Submit Drill" (confirm unanswered) → the result screen renders
 *   D-03 the new user_mistake_drills row is COMPLETED with coins_awarded = 0
 *   D-04 no coin_ledger / gamification_events row was written for the student during the drill
 *
 * Needs mistakes in the vault: run scripts/e2e/student-journey.cjs first, and cleanup-student (E2E_KEEP_USER=1) after.
 * Usage: E2E_STUDENT_EMAIL=qa-student@courage-library.test E2E_STUDENT_PASSWORD_KEY=QA_STUDENT_PASSWORD node scripts/e2e/student-drill.cjs
 */
const { chromium } = require('playwright');
const { BASE, EMAIL, admin, ensureStudent, stepRecorder } = require('./_e2e-env.cjs');

const { results, step } = stepRecorder();

(async () => {
  if (!process.env.E2E_STUDENT_PASSWORD_KEY) throw new Error('E2E_STUDENT_PASSWORD_KEY is required (permanent QA student only; never a throwaway user)');
  if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(BASE).hostname)) throw new Error('runs against a local build only');
  const { user, password } = await ensureStudent();
  const uid = user.id;

  const count = async (table) => {
    const { count: n, error } = await admin.from(table).select('id', { count: 'exact', head: true }).eq('user_id', uid);
    if (error) throw new Error(`${table}: ${error.code}`);
    return n || 0;
  };
  const vault = await count('user_mistake_vault');
  if (vault === 0) throw new Error('no mistakes in the vault: run scripts/e2e/student-journey.cjs first');
  const before = { ledger: await count('coin_ledger'), events: await count('gamification_events') };
  const { data: oldDrills } = await admin.from('user_mistake_drills').select('id').eq('user_id', uid);
  const oldIds = new Set((oldDrills || []).map((d) => d.id));

  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
    page.setDefaultTimeout(120000);
    await page.goto(`${BASE}/auth/login`, { waitUntil: 'networkidle', timeout: 240000 });
    await page.fill('input[name="email"]', EMAIL);
    await page.fill('input[name="password"]', password);
    await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/auth/login'), { timeout: 180000 }), page.click('button[type="submit"]')]);

    await page.goto(`${BASE}/mistakes/drill`, { waitUntil: 'networkidle', timeout: 240000 });
    await page.getByRole('button', { name: /Start Remediation Drill/i }).click();
    const submit = page.getByRole('button', { name: /Submit Drill/i });
    await submit.waitFor({ state: 'visible', timeout: 180000 });
    step('D-01 drill generated and shown', true, `${vault} vault item(s)`);

    await submit.click();
    const confirm = page.getByRole('button', { name: /Confirm Submit/i });
    if (await confirm.isVisible().catch(() => false)) await confirm.click();
    await page.getByRole('heading', { name: /Flawless Performance!|Great Remediation Progress!|Good Effort, Keep Practicing!/ }).waitFor({ timeout: 180000 });
    step('D-02 drill submitted; result screen renders', true);
  } finally {
    await browser.close();
  }

  const { data: drills } = await admin.from('user_mistake_drills').select('id, status, coins_awarded').eq('user_id', uid);
  const fresh = (drills || []).filter((d) => !oldIds.has(d.id));
  const done = fresh.find((d) => d.status === 'COMPLETED');
  step('D-03 drill row COMPLETED with coins_awarded = 0 (the submit RPC awards no coins)', Boolean(done) && done.coins_awarded === 0,
    done ? `status ${done.status}, coins_awarded ${done.coins_awarded}` : `new drills: ${JSON.stringify(fresh.map((d) => d.status))}`);
  const after = { ledger: await count('coin_ledger'), events: await count('gamification_events') };
  step('D-04 no coin ledger / gamification event written by the drill', after.ledger === before.ledger && after.events === before.events,
    `ledger ${before.ledger}→${after.ledger}, events ${before.events}→${after.events}`);

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\nDrill check: ${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error('DRILL ERROR', String(e && e.message ? e.message : e).slice(0, 300));
  process.exit(1);
});
