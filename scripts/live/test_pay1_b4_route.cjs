#!/usr/bin/env node
/**
 * PAY-1 B4 — the reconcile route and the admin payments page against a LOCAL production build (checkout is closed
 * locally, so the route never reaches the database or Razorpay):
 *   R-1 GET → 405 (POST only); R-2 POST without / with a wrong bearer / with the secret in the query string → 401;
 *   R-3 POST with the right bearer → 200 { skipped: CHECKOUT_CLOSED } while checkout is closed (it is, before B7);
 *   R-4 /admin/payments as the QA admin → 200, renders "Payments to refund" and the order list, no error boundary.
 * The CRON_SECRET is read from the local env and never printed.
 * Usage: node scripts/live/test_pay1_b4_route.cjs [http://localhost:3100]
 */
require('../db/safe-net.cjs'); // SAFE-NET
const fs = require('fs');
const path = require('path');
const { qaBrowserLogin } = require('./qa-session.cjs');

const BASE = (process.argv.find((a) => /^https?:\/\//.test(a)) || 'http://localhost:3100').replace(/\/$/, '');
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(BASE).hostname)) throw new Error('runs against a local build only');
const envFile = path.resolve(__dirname, '..', '..', '.env.local');
const fromFile = fs.existsSync(envFile) ? ((fs.readFileSync(envFile, 'utf8').match(/^CRON_SECRET=(.*)$/m) || [])[1] || '').trim().replace(/^"|"$/g, '') : '';
const SECRET = process.env.CRON_SECRET || fromFile;
let ok = true;
const chk = (n, cond, info) => {
  if (!cond) ok = false;
  console.log(`${cond ? 'PASS' : 'FAIL'} ${n}${info ? ' — ' + String(info).slice(0, 300) : ''}`);
};
const ERROR_BOUNDARY = /Something went wrong|Application error: a (client|server)-side exception/i;

(async () => {
  const url = `${BASE}/api/cron/reconcile`;
  const call = (method, headers = {}, u = url) => fetch(u, { method, headers, redirect: 'manual', signal: AbortSignal.timeout(30000) });
  const g = await call('GET');
  chk('R-1 GET → 405 (POST only)', g.status === 405, String(g.status));
  const none = await call('POST');
  const wrong = await call('POST', { authorization: 'Bearer not-the-secret-0000000000' });
  const query = SECRET ? await call('POST', {}, `${url}?key=${encodeURIComponent(SECRET)}`) : { status: 0 };
  chk('R-2 POST without / with a wrong bearer / with the secret in the query string → 401', none.status === 401 && wrong.status === 401 && (!SECRET || query.status === 401), `${none.status} ${wrong.status} ${query.status}`);
  if (!SECRET || SECRET.length < 16) chk('R-3 the right bearer → 200 skipped (needs CRON_SECRET ≥ 16 chars locally)', false, 'CRON_SECRET not set locally');
  else {
    const r = await call('POST', { authorization: `Bearer ${SECRET}` });
    const body = await r.json().catch(() => null);
    chk('R-3 the right bearer → 200 { skipped: CHECKOUT_CLOSED } (checkout is closed until B7)', r.status === 200 && body && body.skipped === 'CHECKOUT_CLOSED', `${r.status} ${body && body.skipped}`);
  }
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const ctx = await browser.newContext();
    await qaBrowserLogin(ctx, 'qa-admin@courage-library.test', BASE);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 120)));
    const resp = await page.goto(`${BASE}/admin/payments`, { waitUntil: 'load', timeout: 60000 });
    const html = await page.content();
    chk('R-4 /admin/payments → 200, "Payments to refund" + the order list, no error boundary / client exception',
      resp && resp.status() === 200 && /data-payments-to-refund=""/.test(html) && /Payments to refund/.test(html) && /Payment orders \(/.test(html) && !ERROR_BOUNDARY.test(html) && errors.length === 0,
      `${resp && resp.status()} ${errors.join(' | ')}`);
    await ctx.close();
  } catch (e) {
    chk('R-x the page check ran to the end', false, e && e.message ? e.message : e);
  } finally {
    await browser.close().catch(() => {});
  }
  console.log(`PAY-1 B4 route + page: ${ok ? 'ALL PASS' : 'FAILURES'}`);
  process.exit(ok ? 0 : 1);
})();
