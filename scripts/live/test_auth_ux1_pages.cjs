#!/usr/bin/env node
/**
 * AUTH-UX-1 page checks — real pages in a real browser, against a LOCAL fixture build only (anonymous; nothing is ever
 * submitted to Supabase; requests to Google and Cloudflare are blocked; only .test addresses are typed):
 *   EXAM_UX_FIXTURE=1 npx next build && EXAM_UX_FIXTURE=1 npx next start -p 3109
 *   P-1 five viewports × /auth/login, /auth/signup, /auth/forgot-password, /auth/update-password: 200, one <h1>, CLS < 0.1
 *       (load + scroll), no horizontal scroll, the brand panel only ≥ 1024 px, fields / submit ≥ 48 px tall, no age
 *       number in the visible text
 *   P-2 Create account (fixture, consent unticked): "Create account" → the consent error, focus on the box, NO request
 *       sent; pressing Google → the same, Google stays inert; ticked → Google is live (not inert, no blocking button)
 *   P-3 sign-in: no checkbox; the eye toggle flips type + aria-pressed + aria-label
 *   P-4 the security-check path (no token can arrive — Cloudflare is blocked): Sign in → "Finishing security check…" →
 *       within ~9 s the "Quick security check" card; NO request sent; Retry clears the card
 *   --shots <dir>: desktop + phone sign-in, error, security check, create account (+ consent error), forgot, reset
 * Usage: node scripts/live/test_auth_ux1_pages.cjs http://localhost:3109 [--shots dir]
 */
const fs = require('fs');
const path = require('path');

const BASE = (process.argv.find((a) => /^https?:\/\//.test(a)) || 'http://localhost:3109').replace(/\/$/, '');
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(BASE).hostname)) throw new Error('runs against a local build only');
const SHOTS = (() => {
  const i = process.argv.indexOf('--shots');
  return i > 0 ? process.argv[i + 1] : null;
})();
const VIEWPORTS = [
  { name: '1366x768', width: 1366, height: 768 },
  { name: '1920x1080', width: 1920, height: 1080 },
  { name: '768x1024', width: 768, height: 1024 },
  { name: '390x844', width: 390, height: 844 },
  { name: '360x740', width: 360, height: 740 },
];
const PAGES = ['/auth/login', '/auth/signup', '/auth/forgot-password', '/auth/update-password'];
const AGE = /\b18\b|adults? only|\bor older\b|\byears? old\b/i;

let fails = 0;
let passes = 0;
const check = (name, ok, info) => {
  if (ok) passes++;
  else fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? ' — ' + info : ''}`);
};

(async () => {
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  const newCtx = async (vp) => {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.width < 768, hasTouch: vp.width < 768 });
    // never reach the providers from a test
    await ctx.route(/accounts\.google\.com|challenges\.cloudflare\.com|googleapis\.com|gstatic\.com/, (r) => r.abort());
    return ctx;
  };
  const clsInit = () => {
    window.__cls = 0;
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
    }).observe({ type: 'layout-shift', buffered: true });
  };
  const scrollEnd = (page) =>
    page.evaluate(async () => {
      for (let y = 0; y < document.documentElement.scrollHeight; y += 600) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 25));
      }
      window.scrollTo(0, 0);
      await new Promise((r) => setTimeout(r, 200));
    });

  // ---- P-1 the real pages at 5 sizes
  for (const vp of VIEWPORTS) {
    const ctx = await newCtx(vp);
    const page = await ctx.newPage();
    await page.addInitScript(clsInit);
    for (const p of PAGES) {
      const r = await page.goto(BASE + p, { waitUntil: 'load', timeout: 120000 });
      await page.waitForTimeout(300);
      await scrollEnd(page);
      const m = await page.evaluate(() => {
        const panel = document.querySelector('[data-auth-panel]');
        const vis = (el) => !!el && el.getBoundingClientRect().width > 0 && getComputedStyle(el).display !== 'none';
        const main = document.querySelector('.cl-auth__main');
        const small = [...(main ? main.querySelectorAll('input:not([type="hidden"]):not([type="checkbox"]), button[type="submit"]') : [])].filter((el) => vis(el) && el.getBoundingClientRect().height < 47.5).map((el) => `${el.tagName}:${el.getAttribute('name') || el.textContent.trim().slice(0, 12)}`);
        return { h1: document.querySelectorAll('h1').length, panel: vis(panel), ovf: document.documentElement.scrollWidth - document.documentElement.clientWidth, cls: window.__cls, small, text: (main ? main.innerText : '') + ' ' + (panel ? panel.innerText : '') };
      });
      const wantPanel = vp.width >= 1024;
      check(`P-1 ${vp.name} ${p}: 200 · one h1 · panel ${wantPanel ? 'shown' : 'hidden'} · no overflow · CLS < 0.1 · targets ≥ 48 px · no age number`, r && r.status() === 200 && m.h1 === 1 && m.panel === wantPanel && m.ovf <= 0 && m.cls < 0.1 && m.small.length === 0 && !AGE.test(m.text), `status ${r && r.status()} · h1 ${m.h1} · panel ${m.panel} · overflow ${m.ovf} · CLS ${m.cls.toFixed(4)}${m.small.length ? ' · small ' + m.small.join(',') : ''}${AGE.test(m.text) ? ' · AGE TEXT' : ''}`);
      await page.evaluate(() => (window.__cls = 0));
    }
    if (SHOTS && ['1366x768', '390x844'].includes(vp.name)) {
      await page.goto(`${BASE}/auth/login`, { waitUntil: 'load' });
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(SHOTS, `sign-in-${vp.width}.jpg`), type: 'jpeg', quality: 80, fullPage: vp.width < 768 });
    }
    await ctx.close();
  }

  // ---- P-2 … P-4 on the fixture (real forms, fixed states, nothing submitted)
  for (const vp of [VIEWPORTS[0], VIEWPORTS[3]]) {
    const ctx = await newCtx(vp);
    const page = await ctx.newPage();
    const posts = [];
    page.on('request', (q) => {
      if (q.method() === 'POST') posts.push(q.url());
    });
    // P-2 consent gates Create account
    await page.goto(`${BASE}/dev/auth-fixture?view=signup`, { waitUntil: 'load', timeout: 120000 });
    await page.waitForTimeout(300);
    await page.fill('#signup-name', 'Fixture Person');
    await page.fill('#signup-email', 'fixture@example.test');
    await page.fill('#signup-password', 'fixture123abc');
    posts.length = 0;
    await page.click('[data-auth-submit]');
    await page.waitForTimeout(400);
    const c1 = await page.evaluate(() => ({ err: !!document.querySelector('#signup-consent-error'), focus: document.activeElement && document.activeElement.id }));
    check(`P-2 ${vp.name} Create account, consent unticked: the consent error, focus on the box, nothing sent`, c1.err && c1.focus === 'signup-consent' && posts.length === 0, `error ${c1.err} · focus ${c1.focus} · POSTs ${posts.length}`);
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    await page.click('[data-google-blocked]');
    await page.waitForTimeout(200);
    const c2 = await page.evaluate(() => ({ focus: document.activeElement && document.activeElement.id, inert: document.querySelector('[data-google-slot]').hasAttribute('inert') }));
    check(`P-2 ${vp.name} Google pressed while unticked: consent focused, Google inert, nothing sent`, c2.focus === 'signup-consent' && c2.inert && posts.length === 0, `focus ${c2.focus} · inert ${c2.inert} · POSTs ${posts.length}`);
    await page.check('#signup-consent');
    await page.waitForTimeout(200);
    const c3 = await page.evaluate(() => ({ inert: document.querySelector('[data-google-slot]').hasAttribute('inert'), blocker: !!document.querySelector('[data-google-blocked]'), err: !!document.querySelector('#signup-consent-error') }));
    check(`P-2 ${vp.name} ticked: Google live (not inert, no blocking button), the error gone`, !c3.inert && !c3.blocker && !c3.err, JSON.stringify(c3));
    if (SHOTS && vp.width === 1366) {
      await page.goto(`${BASE}/dev/auth-fixture?view=signup`, { waitUntil: 'load' });
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(SHOTS, 'create-account-1366.jpg'), type: 'jpeg', quality: 80 });
      await page.goto(`${BASE}/dev/auth-fixture?view=signup-consent`, { waitUntil: 'load' });
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(SHOTS, 'create-account-consent-error-1366.jpg'), type: 'jpeg', quality: 80 });
    }
    if (SHOTS && vp.width === 390) {
      await page.goto(`${BASE}/dev/auth-fixture?view=signup`, { waitUntil: 'load' });
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(SHOTS, 'create-account-390.jpg'), type: 'jpeg', quality: 80, fullPage: true });
    }

    // P-3 sign-in: no checkbox; the eye toggle
    await page.goto(`${BASE}/dev/auth-fixture?view=login`, { waitUntil: 'load', timeout: 120000 });
    await page.waitForTimeout(300);
    const boxes = await page.locator('main input[type="checkbox"], .cl-auth__main input[type="checkbox"]').count();
    await page.fill('#login-password', 'fixture123abc');
    const t0 = await page.evaluate(() => {
      const b = document.querySelector('[data-password-toggle]');
      return { type: document.getElementById('login-password').type, pressed: b.getAttribute('aria-pressed'), label: b.getAttribute('aria-label') };
    });
    await page.click('[data-password-toggle]');
    const t1 = await page.evaluate(() => {
      const b = document.querySelector('[data-password-toggle]');
      return { type: document.getElementById('login-password').type, pressed: b.getAttribute('aria-pressed'), label: b.getAttribute('aria-label') };
    });
    check(`P-3 ${vp.name} sign-in: no checkbox; eye toggle password→text, aria-pressed false→true, Show→Hide`, boxes === 0 && t0.type === 'password' && t0.pressed === 'false' && t0.label === 'Show password' && t1.type === 'text' && t1.pressed === 'true' && t1.label === 'Hide password', `boxes ${boxes} · ${JSON.stringify(t0)} → ${JSON.stringify(t1)}`);

    // P-4 the security-check path (Cloudflare blocked → no token)
    await page.goto(`${BASE}/dev/auth-fixture?view=login`, { waitUntil: 'load', timeout: 120000 });
    await page.waitForTimeout(300);
    await page.fill('#login-email', 'fixture@example.test');
    await page.fill('#login-password', 'fixture123abc');
    posts.length = 0;
    await page.click('[data-auth-submit]');
    await page.waitForTimeout(500);
    const waiting = await page.locator('[data-security-waiting]').count();
    await page.waitForSelector('[data-security-check]', { timeout: 11000 }).catch(() => null);
    const card = await page.locator('[data-security-check]').count();
    check(`P-4 ${vp.name} no token: "Finishing security check…", then the "Quick security check" card; nothing sent`, waiting === 1 && card === 1 && posts.length === 0, `waiting ${waiting} · card ${card} · POSTs ${posts.length}`);
    if (SHOTS && vp.width === 1366) await page.screenshot({ path: path.join(SHOTS, 'security-check-1366.jpg'), type: 'jpeg', quality: 80 });
    if (SHOTS && vp.width === 390) await page.screenshot({ path: path.join(SHOTS, 'security-check-390.jpg'), type: 'jpeg', quality: 80, fullPage: true });
    await page.click('[data-security-retry]');
    await page.waitForTimeout(300);
    check(`P-4 ${vp.name} Retry clears the card`, (await page.locator('[data-security-check]').count()) === 0, '');

    if (SHOTS && vp.width === 1366) {
      for (const [view, file] of [['login-error', 'sign-in-error-1366.jpg'], ['forgot', 'forgot-password-1366.jpg'], ['reset', 'reset-password-1366.jpg']]) {
        await page.goto(`${BASE}/dev/auth-fixture?view=${view}`, { waitUntil: 'load' });
        await page.waitForTimeout(300);
        await page.screenshot({ path: path.join(SHOTS, file), type: 'jpeg', quality: 80 });
      }
    }
    await ctx.close();
  }

  await browser.close();
  console.log(`\nAUTH-UX-1 pages: ${passes}/${passes + fails} passed`);
  process.exit(fails ? 1 : 0);
})();
