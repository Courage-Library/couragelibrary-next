#!/usr/bin/env node
/**
 * LESSON-PERF-B3 live gate (owner decision 2026-11-18): the cached ANONYMOUS lesson access answer follows an admin
 * change on the very next request, and a signed-in reader always gets the live per-request check.
 *
 * Against a LOCAL production build (BASE, default http://localhost:3100) and the production database. It writes ONE
 * LESSON policy row for the QA test lesson (is_test_content) through the real admin page (as the QA admin) and once
 * with the service role (a write OUTSIDE the app, which does not invalidate the cache), and removes it at the end
 * (finally). It runs ONLY while the paywall is OFF and the lesson has no row of its own, so no visitor sees any change
 * (with the switch off every lesson is open; the tier only goes into the page's data-access-tier attribute).
 *
 *   L-0 preconditions: paywall OFF, a published QA test lesson, no LESSON row for it, LESSON default FREE;
 *       anonymous page → data-access-tier FREE (twice: the second answer comes from the cache)
 *   L-1 the admin sets the lesson to Pro on /admin/access → the NEXT anonymous request shows PRO (no 60 s wait)
 *   L-2 a write OUTSIDE the app (service role, no invalidation) sets it back to Free → the signed-in QA student sees FREE
 *       at once (live per-request check) while the anonymous page still shows the cached PRO (anonymous = cached)
 *   L-3 the admin clicks "Use the default" → the NEXT anonymous request shows FREE again
 *   L-4 cleanup: no LESSON row for the lesson is left (also on any failure)
 *
 * Usage: node scripts/live/test_lesson_perf_b3.cjs [http://localhost:3100]
 */
require('../db/safe-net.cjs'); // SAFE-NET
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const { pgClient, supabaseAdmin } = require(path.join(ROOT, 'scripts/db/safe-net.cjs'));
const { safeBegin } = require(path.join(ROOT, 'scripts/db/live-safety.cjs'));
const { qaBrowserLogin, qaCookies } = require('./qa-session.cjs');

const BASE = (process.argv.find((a) => /^https?:\/\//.test(a)) || 'http://localhost:3100').replace(/\/$/, '');
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(BASE).hostname)) throw new Error('runs against a local build only');
const ADMIN = 'qa-admin@courage-library.test';
const STUDENT = 'qa-student@courage-library.test';
const PAGE_MS = 30000;

let ok = true;
const chk = (n, cond, info) => {
  if (!cond) ok = false;
  console.log(`${cond ? 'PASS' : 'FAIL'} ${n}${info ? ' — ' + String(info).slice(0, 400) : ''}`);
};

async function readState() {
  const c = pgClient();
  await c.connect();
  try {
    await safeBegin(c, { readOnly: true });
    const sw = (await c.query('select paywall_enabled from public.access_settings where id')).rows[0];
    const [lesson] = (await c.query(`select d.id, n.hierarchy_path from public.learning_documents d join public.canonical_taxonomy_nodes n on n.id = d.node_id
        where d.document_type = 'NODE_LESSON' and d.status = 'PUBLISHED' and n.is_active and d.is_test_content order by d.updated_at desc limit 1`)).rows;
    const row = lesson ? (await c.query(`select tier from public.access_policies where item_kind = 'LESSON' and item_key = $1`, [lesson.id])).rows[0] : null;
    const def = (await c.query(`select tier from public.access_policies where item_kind = 'LESSON' and item_key = '*'`)).rows[0];
    await c.query('ROLLBACK');
    return { paywallOn: sw ? sw.paywall_enabled === true : null, lesson, row: row || null, def: def ? def.tier : null };
  } finally {
    await c.end().catch(() => {});
  }
}

const tierOf = (html) => {
  const m = html.match(/data-master-lesson=""[^>]*data-access-tier="(FREE|PRO)"/);
  return m ? m[1] : null;
};
async function anonTier(route) {
  const r = await fetch(BASE + route, { redirect: 'manual', signal: AbortSignal.timeout(PAGE_MS) });
  return { status: r.status, tier: tierOf(await r.text()) };
}
async function studentTier(route) {
  const jar = await qaCookies(STUDENT, BASE);
  const cookie = jar.map((c) => `${c.name}=${c.value}`).join('; ');
  const r = await fetch(BASE + route, { redirect: 'manual', headers: { cookie }, signal: AbortSignal.timeout(PAGE_MS) });
  return { status: r.status, tier: tierOf(await r.text()) };
}

(async () => {
  const s = await readState();
  if (s.paywallOn !== false || !s.lesson || s.row || s.def !== 'FREE') {
    // never change anything a visitor could see: refuse to run outside the safe state
    console.log(`SKIP L-0..L-4 — preconditions not met (paywall off: ${s.paywallOn === false}, QA test lesson: ${Boolean(s.lesson)}, own row: ${Boolean(s.row)}, LESSON default: ${s.def})`);
    console.log('LESSON-PERF-B3 live: VACUOUS (nothing written)');
    process.exit(s.paywallOn === true || s.row ? 1 : 0);
  }
  const id = s.lesson.id;
  const route = `/learn/${s.lesson.hierarchy_path.split('.').join('/')}`;
  const admin = supabaseAdmin();
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const a0 = await anonTier(route);
    const a0b = await anonTier(route);
    chk('L-0 preconditions: paywall OFF, QA test lesson without its own row, LESSON default FREE; anonymous page → FREE (twice)', a0.status === 200 && a0.tier === 'FREE' && a0b.tier === 'FREE', `${a0.status} ${a0.tier} / ${a0b.tier}`);

    // the admin page as the QA admin (MFA-elevated session cookies; no password, no captcha)
    const ctx = await browser.newContext();
    await qaBrowserLogin(ctx, ADMIN, BASE);
    const page = await ctx.newPage();
    page.setDefaultTimeout(PAGE_MS);
    await page.goto(BASE + '/admin/access', { waitUntil: 'load' });
    await page.locator('#ap-kind').selectOption('LESSON');
    await page.locator('#ap-key').fill(id);
    await page.locator('#ap-tier').selectOption('PRO');
    await page.getByRole('button', { name: 'Save this item' }).click();
    await page.getByText(`LESSON ${id} is now Pro.`).waitFor({ state: 'visible' });
    const a1 = await anonTier(route);
    chk('L-1 the admin sets the lesson to Pro on /admin/access → the NEXT anonymous request shows PRO', a1.tier === 'PRO', `${a1.status} ${a1.tier}`);

    // a write outside the app: the service role, no cache invalidation
    const { error: wErr } = await admin.rpc('fn_access_policy_set', { p_kind: 'LESSON', p_key: id, p_tier: 'FREE', p_actor_id: null, p_actor_email: 'gate:LESSON-PERF-B3' });
    const st = await studentTier(route);
    const a2 = await anonTier(route);
    chk('L-2 a write outside the app (no invalidation) → the signed-in QA student sees FREE at once (live); the anonymous page still shows the cached PRO', !wErr && st.status === 200 && st.tier === 'FREE' && a2.tier === 'PRO',
      `${wErr ? `write failed (${wErr.code || String(wErr.message || 'network').slice(0, 60)})` : 'written'}; student ${st.status} ${st.tier}; anonymous ${a2.tier}`);

    await page.goto(BASE + '/admin/access', { waitUntil: 'load' });
    const row = page.locator('li', { hasText: id });
    await row.getByRole('button', { name: 'Use the default' }).click();
    await page.getByText(`LESSON ${id} now follows its default.`).waitFor({ state: 'visible' });
    const a3 = await anonTier(route);
    chk('L-3 the admin clicks "Use the default" → the NEXT anonymous request shows FREE again', a3.tier === 'FREE', `${a3.status} ${a3.tier}`);
    await ctx.close();
  } catch (e) {
    chk('L-x the gate ran to the end', false, e && e.message ? e.message.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, '[id]') : e);
  } finally {
    await browser.close().catch(() => {});
    // cleanup: the lesson has no row of its own again (it had none before)
    // (retried: a dropped connection must not leave the row behind)
    for (let i = 1; i <= 3; i++) {
      try {
        const { data: left, error } = await admin.from('access_policies').select('tier').eq('item_kind', 'LESSON').eq('item_key', id).maybeSingle();
        if (error) throw error;
        if (left) { const { error: cErr } = await admin.rpc('fn_access_policy_clear', { p_kind: 'LESSON', p_key: id, p_actor_id: null, p_actor_email: 'gate:LESSON-PERF-B3' }); if (cErr) throw cErr; }
        break;
      } catch {
        if (i === 3) console.log('WARN cleanup could not reach the database — check access_policies for the QA lesson');
      }
    }
    const after = await readState();
    chk('L-4 cleanup: no LESSON row left for the QA lesson; paywall still OFF', !after.row && after.paywallOn === false, `row ${after.row ? after.row.tier : 'none'}`);
  }
  console.log(`LESSON-PERF-B3 live: ${ok ? 'ALL PASS' : 'FAILURES'}`);
  process.exit(ok ? 0 : 1);
})().catch((e) => {
  console.log(`FAIL — ${String(e && e.message ? e.message : e).slice(0, 300)}`);
  process.exit(1);
});
