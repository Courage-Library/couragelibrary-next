#!/usr/bin/env node
/**
 * NAV-1 Stage A page checks — THE visitor header in a real browser, against a LOCAL production build only
 * (`next build && next start -p 3107`; anonymous, no sign-in, no database write).
 *   P-1 pages × widths (1280 / 1024 / 768 / 390 / 360): no horizontal overflow; exactly one visitor header and no other
 *       <header>; desktop links ≥ 900 px, phone bar (logo · start · menu) below; the language switch only on / and /hi
 *   P-2 every header link answers (no 404)
 *   P-3 Exams menu (≥ 900 px): click opens, outside click closes; keyboard: Enter / ArrowDown open and move, Esc closes and
 *       returns focus to the trigger; a live category is a link, "Coming soon" is not
 *   P-4 phone drawer: opens, focus moves in and Tab stays inside, Esc closes and returns focus to the toggle
 *   P-5 no JavaScript: Exams is a link to /exams; the drawer opens natively
 *   P-6 targets ≥ 48 px (pills: their hit area), reduced motion = no transition
 *   P-7 CLS < 0.1 (load + scroll) on every page at 390 and 1280, EN and HI
 *   P-8 signed-in hint (an auth-cookie name only, no real session): the cached pages show "Go to dashboard";
 *       the live sign-up setting decides Start free / Explore exams (both states are gated offline in NAV-1 N-5)
 * --shots → JPEG screenshots in docs/design/screens/nav-1/ (anonymous pages only: no personal data)
 * Usage: node scripts/live/test_nav1_pages.cjs http://localhost:3107 [--shots]
 */
const fs = require('fs');
const path = require('path');

const BASE = (process.argv.find((a) => /^https?:\/\//.test(a)) || 'http://localhost:3107').replace(/\/$/, '');
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(BASE).hostname)) throw new Error('runs against a local build only');
const SHOTS = process.argv.includes('--shots');
const SHOT_DIR = path.join(__dirname, '..', '..', 'docs', 'design', 'screens', 'nav-1');
const PAGES = ['/', '/hi', '/exams', '/exams/ssc', '/current-affairs', '/about', '/auth/login'];
const WIDTHS = [1280, 1024, 768, 390, 360];

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
  if (SHOTS) fs.mkdirSync(SHOT_DIR, { recursive: true });
  const shot = async (page, name) => {
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, `${name}.jpg`), type: 'jpeg', quality: 72 });
  };

  // P-1 / P-6 / P-7
  const headerLinks = new Set();
  for (const w of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 860 }, isMobile: w < 768 });
    const page = await ctx.newPage();
    await page.addInitScript(() => {
      window.__cls = 0;
      new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
    });
    for (const url of PAGES) {
      const resp = await page.goto(BASE + url, { waitUntil: 'load', timeout: 90000 });
      await page.waitForTimeout(400);
      const r = await page.evaluate(() => {
        const vis = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
        const hd = document.querySelectorAll('[data-visitor-header]');
        const h = hd[0];
        return {
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          visitorHeaders: hd.length,
          otherHeaders: [...document.querySelectorAll('header')].filter((x) => !x.hasAttribute('data-visitor-header') && vis(x)).length,
          nav: vis(h && h.querySelector('.cl-vh__nav')),
          burger: vis(h && h.querySelector('.cl-vh__burger')),
          compact: vis(h && h.querySelector('.cl-vh__compact')),
          signinBar: vis(h && h.querySelector('.cl-vh__signin')),
          langBar: vis(h && h.querySelector('.cl-vh__lang--bar')),
          langAny: !!(h && h.querySelector('[data-lang-switch]')),
          height: h ? Math.round(h.getBoundingClientRect().height) : 0,
          links: h ? [...h.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')) : [],
          small: h
            ? [...h.querySelectorAll('a, summary')]
                .filter((el) => vis(el) && !el.closest('[hidden]') && !el.closest('details:not([open]) > :not(summary)'))
                .map((el) => {
                  const b = el.getBoundingClientRect();
                  const after = getComputedStyle(el, '::after');
                  const extra = after.content !== 'none' && after.position === 'absolute' ? -2 * parseFloat(after.top || '0') : 0;
                  return { t: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 24), h: Math.round(b.height + Math.max(0, extra)) };
                })
                .filter((x) => x.h < 48)
            : [],
        };
      });
      const desk = w >= 900;
      const lang = url === '/' || url === '/hi';
      r.links.forEach((l) => headerLinks.add(l));
      check(`P-1 ${url} @ ${w}: 200, no overflow, one visitor header`, resp.status() === 200 && r.overflow <= 0 && r.visitorHeaders === 1 && r.otherHeaders === 0, `status ${resp.status()} overflow ${r.overflow} headers ${r.visitorHeaders}+${r.otherHeaders}`);
      check(`P-1 ${url} @ ${w}: ${desk ? 'desktop links + Sign in' : 'phone bar (compact start + menu)'}; height ${desk ? 66 : 60}`, desk ? r.nav && r.signinBar && !r.burger && !r.compact && r.height === 67 : !r.nav && r.burger && r.compact && !r.signinBar && r.height === 61, JSON.stringify({ nav: r.nav, burger: r.burger, compact: r.compact, signin: r.signinBar, h: r.height }));
      check(`P-1 ${url} @ ${w}: language switch ${lang ? 'present' : 'absent'}`, lang ? r.langAny && (desk ? r.langBar : !r.langBar) : !r.langAny);
      check(`P-6 ${url} @ ${w}: visible header targets ≥ 48 px`, r.small.length === 0, JSON.stringify(r.small));
    }
    if (w === 1280 || w === 390) {
      for (const url of PAGES) {
        await page.goto(BASE + url, { waitUntil: 'load', timeout: 90000 });
        await page.waitForTimeout(1200);
        await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise((res) => setTimeout(res, 60)); } });
        await page.waitForTimeout(300);
        const cls = await page.evaluate(() => window.__cls);
        check(`P-7 CLS ${url} @ ${w} = ${cls.toFixed(4)}`, cls < 0.1);
        await page.evaluate(() => { window.__cls = 0; });
      }
    }
    await ctx.close();
  }

  // P-2 every header link answers
  {
    const bad = [];
    for (const l of headerLinks) {
      if (!l.startsWith('/')) continue;
      const r = await fetch(BASE + l, { redirect: 'manual' });
      if (r.status >= 400) bad.push(`${l} ${r.status}`);
    }
    check(`P-2 every header link answers (${headerLinks.size} links)`, bad.length === 0, bad.join(', '));
  }

  // P-3 Exams menu
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    const page = await ctx.newPage();
    await page.goto(BASE + '/', { waitUntil: 'load' });
    await page.waitForTimeout(500);
    const triggers = await page.locator('[data-exams-trigger]').count();
    check('P-3 exactly one Exams trigger on the page', triggers === 1, String(triggers));
    const trig = page.locator('[data-exams-trigger]').first();
    await trig.click();
    const open1 = await page.locator('[data-exams-panel]').isVisible();
    const tiles = await page.evaluate(() => ({
      live: [...document.querySelectorAll('[data-exams-panel] a.cl-vh__cat')].map((a) => a.getAttribute('href')),
      soonLinks: [...document.querySelectorAll('[data-exams-panel] [data-category-soon]')].filter((x) => x.closest('a')).length,
      soon: document.querySelectorAll('[data-exams-panel] [data-category-soon]').length,
      expanded: document.querySelector('[data-exams-trigger]').getAttribute('aria-expanded'),
      haspopup: document.querySelector('[data-exams-trigger]').getAttribute('aria-haspopup'),
    }));
    await shot(page, 'visitor-desktop-exams-menu');
    await page.mouse.click(1000, 600);
    const closedOutside = await page.locator('[data-exams-panel]').isHidden();
    check('P-3 Exams menu: click opens; live categories are links, Coming soon are not; outside click closes', open1 && tiles.expanded === 'true' && tiles.haspopup === 'true' && tiles.live.every((h) => /^\/exams\/[a-z-]+$/.test(h)) && tiles.soon > 0 && tiles.soonLinks === 0 && closedOutside, JSON.stringify({ open1, ...tiles, closedOutside }));
    await trig.focus();
    await page.keyboard.press('Enter');
    const openKey = await page.locator('[data-exams-panel]').isVisible();
    await page.keyboard.press('ArrowDown');
    const firstFocused = await page.evaluate(() => document.activeElement && document.activeElement.hasAttribute('data-exams-item'));
    await page.keyboard.press('ArrowDown');
    const moved = await page.evaluate(() => document.activeElement && document.activeElement.hasAttribute('data-exams-item'));
    await page.keyboard.press('Escape');
    const escClosed = await page.locator('[data-exams-panel]').isHidden();
    const focusBack = await page.evaluate(() => document.activeElement && document.activeElement.hasAttribute('data-exams-trigger'));
    check('P-3 Exams menu keyboard: Enter opens, arrows move, Esc closes and returns focus', openKey && firstFocused && moved && escClosed && focusBack, JSON.stringify({ openKey, firstFocused, moved, escClosed, focusBack }));
    await shot(page, 'visitor-desktop-closed');
    await page.goto(BASE + '/hi', { waitUntil: 'load' });
    await page.waitForTimeout(400);
    await shot(page, 'visitor-desktop-hi');
    await ctx.close();
  }

  // P-4 phone drawer
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await page.goto(BASE + '/', { waitUntil: 'load' });
    await page.waitForTimeout(500);
    await shot(page, 'visitor-phone-closed');
    await page.locator('[data-drawer-toggle]').click();
    await page.waitForTimeout(300);
    const st = await page.evaluate(() => ({
      open: document.querySelector('[data-nav-drawer]').open,
      inside: !!document.activeElement.closest('[data-drawer-panel]'),
      locked: document.documentElement.hasAttribute('data-nav-drawer-open'),
      signinFirst: (() => { const a = [...document.querySelectorAll('[data-drawer-panel] .auth-out.cl-vh__ctas a')]; return a.length === 2 && a[0].getAttribute('href') === '/auth/login'; })(),
    }));
    await page.locator('.cl-vh__acc > summary').click();
    await page.waitForTimeout(200);
    await shot(page, 'visitor-phone-drawer');
    let escaped = false;
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press('Tab');
      const ok = await page.evaluate(() => !!document.activeElement.closest('[data-drawer-panel]') || document.activeElement.hasAttribute('data-drawer-toggle'));
      if (!ok) escaped = true;
    }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150); // the details toggle event is asynchronous
    const after = await page.evaluate(() => ({ open: document.querySelector('[data-nav-drawer]').open, focus: document.activeElement.hasAttribute('data-drawer-toggle'), locked: document.documentElement.hasAttribute('data-nav-drawer-open') }));
    check('P-4 drawer: opens, focus inside, page locked, Sign in before the start action', st.open && st.inside && st.locked && st.signinFirst, JSON.stringify(st));
    check('P-4 drawer: Tab stays inside (30 presses); Esc closes, focus returns, page unlocked', !escaped && !after.open && after.focus && !after.locked, JSON.stringify({ escaped, ...after }));
    await page.locator('[data-drawer-toggle]').click();
    await page.locator('[data-drawer-backdrop]').click({ position: { x: 10, y: 300 } });
    const overlayClosed = await page.evaluate(() => !document.querySelector('[data-nav-drawer]').open);
    check('P-4 drawer: the overlay closes it', overlayClosed);
    await ctx.close();
  }

  // P-5 no JavaScript
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, javaScriptEnabled: false });
    const page = await ctx.newPage();
    await page.goto(BASE + '/about', { waitUntil: 'load' });
    // without JavaScript a streamed (Suspense) header stays in React's hidden template: click the visible one
    await page.locator('[data-exams-trigger]:visible').click();
    await page.waitForLoadState('load');
    const atExams = new URL(page.url()).pathname === '/exams';
    await ctx.close();
    const ph = await browser.newContext({ viewport: { width: 390, height: 844 }, javaScriptEnabled: false });
    const p2 = await ph.newPage();
    await p2.goto(BASE + '/exams', { waitUntil: 'load' });
    await p2.locator('[data-drawer-toggle]:visible').click();
    const opened = await p2.evaluate(() => document.querySelector('[data-nav-drawer]').open);
    const link = await p2.locator('[data-drawer-panel] a[href="/current-affairs"]').isVisible();
    await ph.close();
    check('P-5 no JavaScript: Exams → /exams; the drawer opens natively with working links', atExams && opened && link, JSON.stringify({ atExams, opened, link }));
  }

  // P-6 reduced motion
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await page.goto(BASE + '/exams', { waitUntil: 'load' });
    const dur = await page.evaluate(() => getComputedStyle(document.querySelector('.cl-vh__link')).transitionDuration);
    check('P-6 reduced motion: no transition on the header links', /^0s(, 0s)*$/.test(dur), dur);
    await ctx.close();
  }

  // P-8 signed-in hint + the live sign-up setting
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    await ctx.addCookies([{ name: 'sb-navcheck-auth-token', value: 'x', url: BASE }]);
    const page = await ctx.newPage();
    const out = [];
    for (const url of ['/', '/hi', '/exams', '/exams/ssc']) {
      await page.goto(BASE + url, { waitUntil: 'load' });
      const r = await page.evaluate(() => {
        const vis = (s) => { const el = document.querySelector(s); return !!el && el.getClientRects().length > 0; };
        return { dash: vis('[data-dashboard="header"]'), signin: vis('.cl-vh__signin') };
      });
      if (!r.dash || r.signin) out.push(`${url} ${JSON.stringify(r)}`);
    }
    await page.goto(BASE + '/', { waitUntil: 'load' });
    await shot(page, 'visitor-desktop-signed-in-hint');
    check('P-8 signed-in hint: Go to dashboard replaces Sign in + Start free on the cached pages', out.length === 0, out.join(' | '));
    await ctx.close();
    const anon = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    const p = await anon.newPage();
    await p.goto(BASE + '/about', { waitUntil: 'load' });
    await p.waitForTimeout(800);
    const start = await p.evaluate(() => { const a = document.querySelector('[data-start="header"]'); return a ? { href: a.getAttribute('href'), label: a.textContent.trim() } : null; });
    const okStart = start && ((start.href === '/auth/signup' && start.label === 'Start free') || (start.href === '/exams' && start.label === 'Explore exams'));
    check(`P-8 start action follows the live sign-up setting (${start ? start.label : 'none'})`, !!okStart, JSON.stringify(start));
    await anon.close();
  }

  await browser.close();
  console.log(`\nNAV-1 pages: ${passes} passed, ${fails} failed`);
  process.exit(fails ? 1 : 0);
})().catch((e) => {
  console.log('ERR', e.message);
  process.exit(1);
});
