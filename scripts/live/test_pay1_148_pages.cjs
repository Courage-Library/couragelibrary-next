#!/usr/bin/env node
/**
 * PAY-1 148 — the admin screens the cleanup touched, signed in as the QA admin against a LOCAL production build:
 *   /admin/coverage (+ one exam: the launch screen without an access mode), /admin/payments/premium (the candidate tool
 *   without the retired quota report), /admin/students/library-pro (uses the same candidate search). Each → 200, renders,
 *   no error boundary; the coverage screen still offers exactly one launch / pause primary and no access-mode control.
 * Read-only: nothing is clicked that writes.
 * Usage: node scripts/live/test_pay1_148_pages.cjs [http://localhost:3100]
 */
require('../db/safe-net.cjs'); // SAFE-NET
const { qaBrowserLogin } = require('./qa-session.cjs');

const BASE = (process.argv.find((a) => /^https?:\/\//.test(a)) || 'http://localhost:3100').replace(/\/$/, '');
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(BASE).hostname)) throw new Error('runs against a local build only');
const ERROR_BOUNDARY = /Something went wrong|Application error: a (client|server)-side exception/i;
let ok = true;
const chk = (n, cond, info) => {
  if (!cond) ok = false;
  console.log(`${cond ? 'PASS' : 'FAIL'} ${n}${info ? ' — ' + String(info).slice(0, 300) : ''}`);
};

(async () => {
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const ctx = await browser.newContext();
    await qaBrowserLogin(ctx, 'qa-admin@courage-library.test', BASE);
    const page = await ctx.newPage();
    page.setDefaultTimeout(60000);
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 120)));
    const visit = async (p) => {
      const r = await page.goto(BASE + p, { waitUntil: 'load' });
      const html = await page.content();
      return { status: r ? r.status() : 0, html, boundary: ERROR_BOUNDARY.test(html) };
    };
    for (const p of ['/admin/payments/premium', '/admin/students/library-pro']) {
      const v = await visit(p);
      chk(`P-1 ${p} → 200, renders, no error boundary`, v.status === 200 && !v.boundary, `${v.status}${v.boundary ? ' error-boundary' : ''}`);
      if (p === '/admin/payments/premium') chk('P-2 /admin/payments/premium: the retired quota report is gone', !/Real-time Quota Breakdown/i.test(v.html));
    }
    const cov = await visit('/admin/coverage');
    chk('P-3 /admin/coverage → 200, renders', cov.status === 200 && !cov.boundary, String(cov.status));
    const href = await page.locator('nav[aria-label="Exams"] a').first().getAttribute('href').catch(() => null);
    if (!href) chk('P-4 /admin/coverage?exam=… (an exam link exists)', false, 'no exam link');
    else {
      const one = await visit(href);
      const primaries = await page.getByRole('button', { name: /^(Launch course|Pause course)$/ }).count();
      chk('P-4 the launch screen for one exam → 200, renders; no access-mode control; at most one launch / pause primary',
        one.status === 200 && !one.boundary && !/name="access-mode"|FREE_N|Change access/.test(one.html) && primaries <= 1, `${one.status} primaries ${primaries}`);
    }
    chk('P-5 no client-side exception on any of the pages', errors.length === 0, errors.join(' | '));
    await ctx.close();
  } catch (e) {
    chk('P-x the check ran to the end', false, e && e.message ? e.message : e);
  } finally {
    await browser.close().catch(() => {});
  }
  console.log(`PAY-1 148 pages: ${ok ? 'ALL PASS' : 'FAILURES'}`);
  process.exit(ok ? 0 : 1);
})();
