#!/usr/bin/env node
require('../db/safe-net.cjs'); // SAFE-NET: masks IPs / hosts / e-mails / keys in all output (scripts/db/safe-net.cjs)
/**
 * UX-IMP-1 — live gate on the LOCAL production build (refuses any other host). READ ONLY (GET page loads; the QA admin
 * session is only used to READ /admin/exams).
 *   L-1 login: getByLabel('Email address') / getByLabel('Password') resolve to the inputs; exactly one h1; inputs and
 *       links ≥ 48 px; axe (WCAG 2.x A/AA) 0 violations on the form; the sign-up link matches the setting
 *   L-2 exam hub: every visible link / button has an EFFECTIVE hit area ≥ 48 px (a stretched card link counts its card);
 *       mocks render in orderMocks order (free first, full-length before sectional)
 *   L-3 category page: the intro names only exams the page lists
 *   L-5 home: with JavaScript OFF and with a full-page capture (no scrolling), every section is visible (opacity 1);
 *       NEGATIVE CONTROL: a section forced to opacity 0 in the page is detected by the same probe
 *   L-8 header: on /auth/login the bar's "Sign in" carries aria-current="page"; on /exams it does not
 *   L-10 hub timing (warm, 3 loads at 390): TTFB and LCP printed (informational; the budget gate is BRAND2 P-06)
 * Run: node scripts/live/with-server.cjs -- "node scripts/live/test_ux_imp1.cjs http://localhost:3100 [--shots=<dir>]"
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const { chromium } = require('playwright');
const BASE = (process.argv.slice(2).find((a) => /^https?:/.test(a)) || 'http://localhost:3100').replace(/\/$/, '');
const SHOTS = (process.argv.find((a) => a.startsWith('--shots=')) || '').slice(8);
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(BASE).hostname)) { console.error('refused: local build only'); process.exit(2); }
const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js', { paths: [ROOT] }), 'utf8');
let ok = true;
const chk = (n, c, info) => { if (!c) ok = false; console.log(`${c ? 'PASS' : 'FAIL'} ${n}${c ? '' : ' — ' + String(info).slice(0, 500)}`); };

const smallTargets = () => {
  const vis = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  return [...document.querySelectorAll('main a[href], main button, main input, main select, header a[href], header button')]
    .filter(vis)
    .filter((e) => !e.closest('.sr-only') && !/^#main/.test(e.getAttribute('href') || ''))
    .map((e) => {
      // a stretched card link (CardLink: after:absolute after:inset-0) is as big as its card — measure the card
      const card = e.hasAttribute('data-card-link') ? e.closest('[data-mock-card], li') : null;
      const box = (card || e).getBoundingClientRect();
      return { t: `${e.tagName.toLowerCase()} "${(e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 30)}"`, w: Math.round(box.width), h: Math.round(box.height) };
    })
    .filter((x) => x.h < 48 || x.w < 24);
};

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const width of [390, 1280]) {
      const ctx = await browser.newContext({ viewport: { width, height: width < 500 ? 844 : 900 }, isMobile: width < 500, hasTouch: width < 500 });
      const page = await ctx.newPage();
      // L-1 login
      await page.goto(BASE + '/auth/login', { waitUntil: 'networkidle' });
      const email = page.getByLabel('Email address');
      const pw = page.getByLabel(/^Password/); // the label carries the required marker after the word
      const l1 = {
        email: (await email.getAttribute('name').catch(() => null)) === 'email',
        password: (await pw.getAttribute('name').catch(() => null)) === 'password',
        h1: await page.locator('h1').count(),
        heights: await page.evaluate(() => [...document.querySelectorAll('main input[name="email"], main input[name="password"]')].map((e) => Math.round(e.getBoundingClientRect().height))),
        small: await page.evaluate(smallTargets),
        signup: await page.evaluate(() => document.querySelector('[data-signup-link]')?.getAttribute('data-signup-link')),
        signupLinks: await page.locator('main a[href="/auth/signup"]').count(),
      };
      await page.addScriptTag({ content: AXE });
      l1.axe = await page.evaluate(async () => (await window.axe.run(document.querySelector('main') || document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })).violations.map((v) => `${v.id}×${v.nodes.length}`));
      chk(`L-1 login @${width}: labels bound, one h1, inputs ≥ 48 px, targets ≥ 48 px, axe 0, sign-up link follows the setting`,
        l1.email && l1.password && l1.h1 === 1 && l1.heights.every((h) => h >= 48) && l1.small.length === 0 && l1.axe.length === 0 && ((l1.signup === 'closed' && l1.signupLinks === 0) || (l1.signup === 'open' && l1.signupLinks === 1)),
        JSON.stringify(l1));
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `login-${width}.png`), fullPage: true });
      // L-8 header current page
      const cur = await page.evaluate(() => [...document.querySelectorAll('header a[href="/auth/login"]')].filter((e) => e.getClientRects().length).map((e) => e.getAttribute('aria-current')));
      await page.goto(BASE + '/exams', { waitUntil: 'networkidle' });
      const curExams = await page.evaluate(() => [...document.querySelectorAll('header a[href="/auth/login"]')].filter((e) => e.getClientRects().length).map((e) => e.getAttribute('aria-current')));
      chk(`L-8 header @${width}: "Sign in" is aria-current on /auth/login only`, cur.length >= 1 && cur.every((v) => v === 'page') && curExams.every((v) => v === null), JSON.stringify({ cur, curExams }));
      // L-2 hub
      await page.goto(BASE + '/exams/ssc-cgl', { waitUntil: 'networkidle' });
      const hub = await page.evaluate(smallTargets);
      const mocks = await page.evaluate(() => [...document.querySelectorAll('[data-mock-card]')].map((c) => ({ free: /Free/.test(c.textContent), full: /Full length|Full-length/i.test(c.textContent), sectional: /Sectional/i.test(c.textContent) })));
      const rank = (m) => (m.free ? 0 : 3) + (m.full ? 0 : m.sectional ? 1 : 2);
      const ordered = mocks.every((m, i) => i === 0 || rank(mocks[i - 1]) <= rank(m));
      chk(`L-2 hub @${width}: every target ≥ 48 px (effective); mocks free → full → sectional`, hub.length === 0 && ordered, JSON.stringify({ small: hub.slice(0, 8), mocks: mocks.length, ordered }));
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `exam-hub-ssc-cgl-${width}.png`), fullPage: true });
      if (width === 390) console.log('INFO hub guide titles:', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('[data-guide-group]')].map((g) => ({ group: g.querySelector('h3')?.textContent, titles: [...g.querySelectorAll('[data-guide-card] span')].map((s) => s.textContent) })))));
      // L-3 category
      await page.goto(BASE + '/exams/ssc', { waitUntil: 'networkidle' });
      const cat = await page.evaluate(() => ({ intro: document.querySelector('[data-category-intro]')?.textContent || '', listed: document.querySelector('ul[aria-label$=" exams"]')?.textContent || '' }));
      const named = (cat.intro.match(/SSC [A-Z]{2,4}/g) || []);
      chk(`L-3 category @${width}: the intro names only listed exams`, cat.intro.length > 0 && named.length > 0 && named.every((n) => cat.listed.includes(n)), JSON.stringify({ intro: cat.intro, named, listed: cat.listed.slice(0, 200) }));
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `category-ssc-${width}.png`), fullPage: true });
      // L-5 home, full-page capture without scrolling
      await page.goto(BASE + '/', { waitUntil: 'networkidle' });
      const hidden = await page.evaluate(() => [...document.querySelectorAll('[data-reveal]')].filter((s) => getComputedStyle(s).opacity !== '1' || getComputedStyle(s).visibility === 'hidden').length);
      const control = await page.evaluate(() => { const s = document.querySelector('[data-reveal]'); s.style.opacity = '0'; const n = [...document.querySelectorAll('[data-reveal]')].filter((x) => getComputedStyle(x).opacity !== '1').length; s.style.opacity = ''; return n; });
      chk(`L-5 home @${width}: every section visible without scrolling (negative control: a forced opacity 0 is detected)`, hidden === 0 && control === 1, JSON.stringify({ hidden, control }));
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `home-${width}.png`), fullPage: true });
      await ctx.close();
    }
    // L-5 JavaScript off
    const off = await browser.newContext({ viewport: { width: 390, height: 844 }, javaScriptEnabled: false });
    const p2 = await off.newPage();
    await p2.goto(BASE + '/', { waitUntil: 'load' });
    const offHidden = await p2.evaluate(() => [...document.querySelectorAll('[data-reveal]')].filter((s) => getComputedStyle(s).opacity !== '1').length);
    chk('L-5 home, JavaScript off: every section visible', offHidden === 0, offHidden);
    await off.close();
    // L-10 hub timing (informational)
    const t = [];
    for (let i = 0; i < 3; i++) {
      const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
      const p = await c.newPage();
      await p.addInitScript(() => { window.__lcp = 0; new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true }); });
      await p.goto(BASE + '/exams/ssc-cgl', { waitUntil: 'networkidle' });
      await p.waitForTimeout(800);
      t.push(await p.evaluate(() => ({ ttfb: Math.round(performance.getEntriesByType('navigation')[0].responseStart), lcp: Math.round(window.__lcp) })));
      await c.close();
    }
    console.log('INFO L-10 hub @390 warm (ttfb / lcp ms):', JSON.stringify(t));
  } finally {
    await browser.close();
  }
  console.log(ok ? 'UX-IMP-1 live: ALL PASS' : 'UX-IMP-1 live: FAILURES');
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.log('ERROR', String(e.message).slice(0, 300)); process.exit(1); });
