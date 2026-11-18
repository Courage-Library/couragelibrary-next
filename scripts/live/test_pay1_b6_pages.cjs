#!/usr/bin/env node
/**
 * PAY-1 B6 — the refund pages against a LOCAL production build (read-only; no approval is recorded, nothing is refunded):
 *   P-1 /admin/payments as the QA admin → 200, renders "Refund check" (the lookup form, the 7-day list), "Payments to
 *       refund" and "E-mails to check"; no error boundary / client exception
 *   P-2 /admin/payments?lookup=<a well-formed id that does not exist> → the "No Pro payment found" answer
 *   P-3 /admin/payments?lookup=<junk> → the format hint (never an error)
 *   P-4 /billing as the QA student → 200, no error boundary / client exception
 *   P-5 /admin/payments as the QA student → not the admin page (redirect / refused)
 * Usage: node scripts/live/test_pay1_b6_pages.cjs [http://localhost:3100]
 */
require('../db/safe-net.cjs'); // SAFE-NET
const { qaBrowserLogin } = require('./qa-session.cjs');

const BASE = (process.argv.find((a) => /^https?:\/\//.test(a)) || 'http://localhost:3100').replace(/\/$/, '');
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(BASE).hostname)) throw new Error('runs against a local build only');
let ok = true;
const chk = (n, cond, info) => {
  if (!cond) ok = false;
  console.log(`${cond ? 'PASS' : 'FAIL'} ${n}${info ? ' — ' + String(info).slice(0, 300) : ''}`);
};
const ERROR_BOUNDARY = /Something went wrong|Application error: a (client|server)-side exception/i;

(async () => {
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const open = async (ctx, url) => {
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 120)));
      const resp = await page.goto(url, { waitUntil: 'load', timeout: 60000 });
      const html = await page.content();
      await page.close();
      return { status: resp ? resp.status() : 0, url: resp ? resp.url() : '', html, errors };
    };
    const admin = await browser.newContext();
    await qaBrowserLogin(admin, 'qa-admin@courage-library.test', BASE);
    const p1 = await open(admin, `${BASE}/admin/payments`);
    chk('P-1 /admin/payments → 200 with "Refund check", the lookup form, the 7-day list, "Payments to refund", "E-mails to check"; no error',
      p1.status === 200 && /data-refund-check=""/.test(p1.html) && /Refund check/.test(p1.html) && /name="lookup"/.test(p1.html) && /Paid in the last 7 days/.test(p1.html)
      && /data-payments-to-refund=""/.test(p1.html) && /data-email-issues=""/.test(p1.html) && !ERROR_BOUNDARY.test(p1.html) && p1.errors.length === 0, `${p1.status} ${p1.errors.join(' | ')}`);
    const p2 = await open(admin, `${BASE}/admin/payments?lookup=pay_B6NOSUCH00001`);
    chk('P-2 a well-formed payment id that does not exist → "No Pro payment found"', p2.status === 200 && /No Pro payment found/.test(p2.html) && !ERROR_BOUNDARY.test(p2.html), String(p2.status));
    const p3 = await open(admin, `${BASE}/admin/payments?lookup=${encodeURIComponent("x'; select 1")}`);
    chk('P-3 junk in the lookup → the format hint, no error', p3.status === 200 && /Enter a Razorpay payment id/.test(p3.html) && !ERROR_BOUNDARY.test(p3.html), String(p3.status));
    await admin.close();
    const stu = await browser.newContext();
    await qaBrowserLogin(stu, 'qa-student@courage-library.test', BASE);
    const p4 = await open(stu, `${BASE}/billing`);
    chk('P-4 /billing as the student → 200, no error', p4.status === 200 && !ERROR_BOUNDARY.test(p4.html) && p4.errors.length === 0, `${p4.status} ${p4.errors.join(' | ')}`);
    const p5 = await open(stu, `${BASE}/admin/payments`);
    chk('P-5 /admin/payments as the student → not the admin page', !/data-refund-check=""/.test(p5.html), `${p5.status} ${new URL(p5.url || BASE).pathname}`);
    await stu.close();
  } catch (e) {
    chk('P-x the page check ran to the end', false, e && e.message ? e.message : e);
  } finally {
    await browser.close().catch(() => {});
  }
  console.log(`PAY-1 B6 pages: ${ok ? 'ALL PASS' : 'FAILURES'}`);
  process.exit(ok ? 0 : 1);
})();
