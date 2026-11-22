#!/usr/bin/env node
/**
 * NAV-1 Stage B page checks — THE student shell + exam focus in a real browser, against a LOCAL production build only,
 * signed in as the permanent QA student (scripts/live/qa-session.cjs: test identity on the reserved .test domain, session
 * minted server-side; never a production sign-in, never another account). No page here starts an attempt (exam focus
 * is checked on an attempt URL of a mock that does not exist → no attempt row is created).
 *   S-1 desktop (1280): sidebar 240 px with Home · Practice · Mocks · Current Affairs · Mistake Vault + Help + Collapse,
 *       the active item has aria-current and the top-bar title follows it; no visitor header; no bottom bar
 *   S-2 collapse → 72 px, icons only (labels stay the accessible name, title = tooltip); reload keeps it with no layout
 *       shift (applied before paint); expand again
 *   S-3 phone (390 / 360): top bar + bottom bar (Home · Practice · Today's mock · Mocks · CA), the centre button → the Mocks
 *       list, 56 px; no sidebar; no horizontal overflow; nothing ends under the bar
 *   S-4 avatar menu (desktop) / sheet (phone): opens, focus inside, Tab trapped, Esc closes + focus back, overlay closes
 *   S-5 exam focus: an attempt URL renders no visitor header, sidebar, bottom bar or footer; a result URL shows the nav
 *   S-6 keyboard only: skip link first, then the sidebar items in order; Enter follows a link
 *   S-7 reduced motion: no transition; CLS < 0.1 on student pages (390 + 1280)
 *   S-8 the cached pages stay visitor pages for a signed-in user ("Go to dashboard", no student shell)
 *   S-9 Sign out (the existing flow) signs the QA student out
 * --shots → JPEG screenshots in docs/design/screens/nav-1/ (QA test identity only — no personal data)
 * Usage: node scripts/live/test_nav1_student.cjs http://localhost:3107 [--shots]
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const BASE = (process.argv.find((a) => /^https?:\/\//.test(a)) || 'http://localhost:3107').replace(/\/$/, '');
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(BASE).hostname)) throw new Error('runs against a local build only');
const SHOTS = process.argv.includes('--shots');
const SHOT_DIR = path.join(ROOT, 'docs', 'design', 'screens', 'nav-1');
const { qaBrowserLogin } = require(path.join(ROOT, 'scripts/live/qa-session.cjs'));
const QA = 'qa-student@courage-library.test';

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
  const newCtx = async (opts) => {
    const ctx = await browser.newContext(opts);
    await ctx.addInitScript(() => {
      window.__cls = 0;
      new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
    });
    await qaBrowserLogin(ctx, QA, BASE);
    return ctx;
  };
  const vis = (sel) => `(() => { const el = document.querySelector(${JSON.stringify(sel)}); return !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden'; })()`;

  // S-1 / S-2 / S-4 / S-6 / S-7 desktop
  {
    const ctx = await newCtx({ viewport: { width: 1280, height: 860 } });
    const page = await ctx.newPage();
    const r0 = await page.goto(BASE + '/dashboard', { waitUntil: 'load', timeout: 90000 });
    await page.waitForTimeout(600);
    const d = await page.evaluate(() => {
      const side = document.querySelector('.cl-ss__side');
      return {
        url: location.pathname,
        side: side ? Math.round(side.getBoundingClientRect().width) : 0,
        items: [...document.querySelectorAll('.cl-ss__nav [data-student-key]')].map((a) => a.dataset.studentKey).join(','),
        current: [...document.querySelectorAll('.cl-ss__nav [aria-current="page"]')].map((a) => a.dataset.studentKey).join(','),
        title: (document.querySelector('[data-student-title]') || {}).textContent,
        visitor: document.querySelectorAll('[data-visitor-header]').length,
        bar: (() => { const b = document.querySelector('.cl-ss__bar'); return !!b && b.getClientRects().length > 0 && getComputedStyle(b).display !== 'none'; })(),
        help: !!document.querySelector('.cl-ss__foot a[href="/help"]'),
        h1: document.querySelectorAll('h1').length,
      };
    });
    check('S-1 signed in: /dashboard renders the student shell (no redirect to sign-in)', r0.status() === 200 && d.url === '/dashboard', `${r0.status()} ${d.url}`);
    check('S-1 sidebar 240 px: Home · Practice · Mocks · Current Affairs · Mistake Vault (+ Help, Collapse); no visitor header; no bottom bar', d.side === 240 && /^home,(practice,)?mocks,currentAffairs,mistakeVault$/.test(d.items) && d.help && d.visitor === 0 && !d.bar, JSON.stringify(d));
    check('S-1 the active item: Home on /dashboard (aria-current) and the title "Home"; the page keeps its own single h1', d.current === 'home' && d.title === 'Home' && d.h1 <= 1, JSON.stringify(d));
    await shot(page, 'student-desktop-expanded');
    // client-side navigation keeps the active item in sync
    await page.click('.cl-ss__nav a[data-student-key="mocks"]');
    await page.waitForURL(/\/mock-tests$/);
    await page.waitForTimeout(500);
    const m = await page.evaluate(() => ({ current: [...document.querySelectorAll('.cl-ss__nav [aria-current="page"]')].map((a) => a.dataset.studentKey).join(','), title: document.querySelector('[data-student-title]').textContent }));
    check('S-1 after client navigation to Mocks: aria-current + title follow', m.current === 'mocks' && m.title === 'Mocks', JSON.stringify(m));

    // S-2 collapse, persisted, no shift on reload
    await page.click('[data-sidebar-toggle]');
    await page.waitForTimeout(250);
    const c1 = await page.evaluate(() => ({ w: Math.round(document.querySelector('.cl-ss__side').getBoundingClientRect().width), attr: document.documentElement.getAttribute('data-sidebar'), label: document.querySelector('[data-sidebar-toggle]').getAttribute('aria-label'), lblW: Math.round(document.querySelector('.cl-ss__nav .cl-ss__lbl').getBoundingClientRect().width), title: document.querySelector('.cl-ss__nav a').getAttribute('title') }));
    await shot(page, 'student-desktop-collapsed');
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(800);
    const c2 = await page.evaluate(() => ({ w: Math.round(document.querySelector('.cl-ss__side').getBoundingClientRect().width), cls: window.__cls }));
    check('S-2 collapse → 72 px, icons only (label visually hidden, tooltip title), toggle says "Expand"', c1.w === 72 && c1.attr === 'collapsed' && c1.label === 'Expand' && c1.lblW <= 1 && !!c1.title, JSON.stringify(c1));
    check('S-2 reload keeps it collapsed with no layout shift (applied before paint)', c2.w === 72 && c2.cls < 0.01, JSON.stringify(c2));
    await page.click('[data-sidebar-toggle]');
    await page.waitForTimeout(200);
    const c3 = await page.evaluate(() => Math.round(document.querySelector('.cl-ss__side').getBoundingClientRect().width));
    check('S-2 expand again → 240 px', c3 === 240, String(c3));

    // S-4 avatar menu (desktop)
    await page.click('[data-account-toggle]');
    await page.waitForTimeout(250);
    const a1 = await page.evaluate(() => ({ open: document.querySelector('[data-account-menu]').open, inside: !!document.activeElement.closest('[data-account-panel]'), items: [...document.querySelectorAll('[data-account-panel] [data-account-item]')].filter((x) => x.getClientRects().length).map((x) => x.dataset.accountItem).join(','), out: !!document.querySelector('[data-account-panel] [data-sign-out]'), lang: document.querySelectorAll('[data-account-panel] [data-lang-choice]').length }));
    await shot(page, 'student-desktop-avatar-menu');
    let escaped = false;
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('Tab');
      if (!(await page.evaluate(() => !!document.activeElement.closest('[data-account-menu]')))) escaped = true;
    }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    const a2 = await page.evaluate(() => ({ open: document.querySelector('[data-account-menu]').open, focus: document.activeElement.hasAttribute('data-account-toggle') }));
    check('S-4 avatar menu: opens with focus inside; Help + Language + Sign out (no bell)', a1.open && a1.inside && /help/.test(a1.items) && a1.out && a1.lang === 2 && !document_has_bell(a1.items), JSON.stringify(a1));
    check('S-4 avatar menu: Tab trapped (20 presses), Esc closes and returns focus', !escaped && !a2.open && a2.focus, JSON.stringify({ escaped, ...a2 }));

    // S-6 keyboard only
    await page.goto(BASE + '/dashboard', { waitUntil: 'load' });
    await page.waitForTimeout(400);
    await page.keyboard.press('Tab');
    const k1 = await page.evaluate(() => document.activeElement.getAttribute('href'));
    const seq = [];
    for (let i = 0; i < 9; i++) {
      await page.keyboard.press('Tab');
      seq.push(await page.evaluate(() => document.activeElement.dataset.studentKey || document.activeElement.getAttribute('href') || document.activeElement.tagName));
      if (seq.at(-1) === 'mocks') break; // stop on the Mocks link, then follow it with Enter
    }
    const target = await page.evaluate(() => document.activeElement.getAttribute('href'));
    await page.keyboard.press('Enter');
    await page.waitForURL((u) => u.pathname === (target || '').split('?')[0], { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(800);
    const navigated = new URL(page.url()).pathname;
    check('S-6 keyboard: skip link first, then the logo and the sidebar items in order; Enter follows', k1 === '#main-content' && seq.indexOf('home') >= 0 && seq.indexOf('mocks') > seq.indexOf('home') && navigated === (target || '').split('?')[0], JSON.stringify({ k1, seq, target, navigated }));

    // S-7 CLS desktop
    for (const url of ['/dashboard', '/mock-tests', '/current-affairs', '/mistakes']) {
      await page.goto(BASE + url, { waitUntil: 'load' });
      await page.waitForTimeout(1200);
      const cls = await page.evaluate(() => window.__cls);
      check(`S-7 CLS ${url} @ 1280 = ${cls.toFixed(4)}`, cls < 0.1);
    }

    // S-5 exam focus + result page
    // The layout is decided by the URL (AppShell). A real attempt page would START an attempt (a database write), so the
    // signed-in HTML of an attempt URL is fetched WITHOUT a browser (no JavaScript runs, nothing is started; the page
    // itself sends a missing mock back to the list). Only real elements count (the serialized page data is ignored).
    const cookieHeader = (await ctx.cookies(BASE)).map((c) => `${c.name}=${c.value}`).join('; ');
    const htmlOf = async (p) => {
      const r = await fetch(BASE + p, { headers: { cookie: cookieHeader }, redirect: 'manual' });
      const html = await r.text();
      const dom = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, ''); // real elements only (drop the serialized data)
      return { status: r.status, dom };
    };
    const take = await htmlOf('/mock-tests/00000000-0000-4000-8000-000000000000/take');
    const ef = { status: take.status, focus: /<main id="main-content"[^>]*data-exam-focus=""/.test(take.dom), shell: /data-student-shell=""/.test(take.dom), side: /class="cl-ss__side"/.test(take.dom), bar: /class="cl-ss__bar"/.test(take.dom), header: /<header\b/.test(take.dom), footer: /<footer\b/.test(take.dom) };
    check('S-5 exam focus (signed in, attempt URL): only <main> — no visitor header, sidebar, bottom bar or footer', ef.status === 200 && ef.focus && !ef.shell && !ef.side && !ef.bar && !ef.header && !ef.footer, JSON.stringify(ef));
    const res = await htmlOf('/mock-tests/00000000-0000-4000-8000-000000000000/result');
    const rs = { status: res.status, shell: /data-student-shell=""/.test(res.dom), focus: /data-exam-focus=""/.test(res.dom) };
    check('S-5 a result URL shows the student nav again', rs.shell && !rs.focus, JSON.stringify(rs));

    // S-8 the cached pages stay visitor pages for a signed-in user
    await page.goto(BASE + '/', { waitUntil: 'load' });
    await page.waitForTimeout(300);
    const cp = await page.evaluate(() => ({ visitor: !!document.querySelector('[data-visitor-header]'), shell: !!document.querySelector('[data-student-shell]'), dash: (() => { const a = document.querySelector('[data-dashboard="header"]'); return !!a && a.getClientRects().length > 0; })() }));
    check('S-8 "/" stays the cached visitor page for a signed-in user: "Go to dashboard", no student shell', cp.visitor && !cp.shell && cp.dash, JSON.stringify(cp));
    await ctx.close();
  }

  // S-3 / S-4 / S-7 phone
  for (const w of [390, 360]) {
    const ctx = await newCtx({ viewport: { width: w, height: 844 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await page.goto(BASE + '/dashboard', { waitUntil: 'load', timeout: 90000 });
    await page.waitForTimeout(700);
    const p = await page.evaluate(() => {
      const bar = document.querySelector('.cl-ss__bar');
      const fab = document.querySelector('[data-todays-mock] .cl-ss__fab-c');
      const b = bar.getBoundingClientRect();
      return {
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        side: getComputedStyle(document.querySelector('.cl-ss__side')).display,
        tabs: [...bar.querySelectorAll('a')].map((a) => a.getAttribute('href')).join(','),
        fab: fab ? Math.round(fab.getBoundingClientRect().width) : 0,
        fabAria: document.querySelector('[data-todays-mock]').getAttribute('aria-label'),
        small: [...bar.querySelectorAll('a')].filter((a) => a.getBoundingClientRect().height < 48 || a.getBoundingClientRect().width < 48).length,
        barTop: Math.round(b.top),
        top: Math.round(document.querySelector('.cl-ss__top').getBoundingClientRect().height),
        current: [...bar.querySelectorAll('[aria-current="page"]')].map((a) => a.getAttribute('href')).join(','),
      };
    });
    if (w === 390) await shot(page, 'student-phone-bottom-bar');
    check(`S-3 ${w}: bottom bar Home · Practice · Today's mock · Mocks · CA; centre → /mock-tests, 56 px, labelled; no sidebar; no overflow`, p.overflow <= 0 && p.side === 'none' && /^\/dashboard,(\/practice,)?\/mock-tests,\/mock-tests,\/current-affairs$/.test(p.tabs) && p.fab === 56 && p.fabAria === "Start today's free mock" && p.small === 0 && p.current === '/dashboard' && p.top === 58, JSON.stringify(p));
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(300);
    const end = await page.evaluate(() => {
      const f = document.querySelector('.cl-ss__col footer') || document.querySelector('.cl-ss__col > :last-child');
      return { footerBottom: Math.round(f.getBoundingClientRect().bottom), barTop: Math.round(document.querySelector('.cl-ss__bar').getBoundingClientRect().top) };
    });
    check(`S-3 ${w}: nothing ends under the bar (the footer ends at / above its top)`, end.footerBottom <= end.barTop + 1, JSON.stringify(end));
    // S-4 avatar sheet
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.click('[data-account-toggle]');
    await page.waitForTimeout(300);
    const s1 = await page.evaluate(() => ({ open: document.querySelector('[data-account-menu]').open, inside: !!document.activeElement.closest('[data-account-panel]'), locked: document.documentElement.hasAttribute('data-account-open'), items: [...document.querySelectorAll('[data-account-panel] [data-account-item]')].filter((x) => x.getClientRects().length).map((x) => x.dataset.accountItem).join(','), atBottom: Math.round(document.querySelector('[data-account-panel]').getBoundingClientRect().bottom) === window.innerHeight }));
    if (w === 390) await shot(page, 'student-phone-avatar-sheet');
    check(`S-4 ${w}: avatar sheet from the bottom, focus inside, page locked; Mistake Vault + Help`, s1.open && s1.inside && s1.locked && /^mistakeVault,/.test(s1.items) && /help/.test(s1.items) && s1.atBottom, JSON.stringify(s1));
    // nothing (the bottom bar) covers the sheet: Sign out is the element actually hit at its centre
    const hit = await page.evaluate(() => { const b = document.querySelector('[data-sign-out]'); b.scrollIntoView({ block: 'nearest' }); const r = b.getBoundingClientRect(); const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { hit: !!el && (el === b || b.contains(el)), barCovers: !!el && !!el.closest('.cl-ss__bar') }; });
    check(`S-4 ${w}: the bottom bar does not cover the sheet (Sign out is reachable)`, hit.hit && !hit.barCovers, JSON.stringify(hit));
    await page.locator('[data-account-backdrop]').click({ position: { x: 20, y: 40 } });
    await page.waitForTimeout(150);
    const s2 = await page.evaluate(() => ({ open: document.querySelector('[data-account-menu]').open, locked: document.documentElement.hasAttribute('data-account-open') }));
    check(`S-4 ${w}: the overlay closes the sheet and unlocks the page`, !s2.open && !s2.locked, JSON.stringify(s2));
    if (w === 390) {
      for (const url of ['/dashboard', '/mock-tests', '/current-affairs']) {
        await page.goto(BASE + url, { waitUntil: 'load' });
        await page.waitForTimeout(1200);
        const cls = await page.evaluate(() => window.__cls);
        check(`S-7 CLS ${url} @ 390 = ${cls.toFixed(4)}`, cls < 0.1);
      }
    }
    await ctx.close();
  }

  // S-7 reduced motion
  {
    const ctx = await newCtx({ viewport: { width: 1280, height: 860 }, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await page.goto(BASE + '/dashboard', { waitUntil: 'load' });
    const dur = await page.evaluate(() => getComputedStyle(document.querySelector('.cl-ss__it')).transitionDuration);
    check('S-7 reduced motion: no transition on the sidebar items', /^0s(, 0s)*$/.test(dur), dur);
    await ctx.close();
  }

  // S-9 Sign out (the existing flow) — last
  {
    const ctx = await newCtx({ viewport: { width: 1280, height: 860 } });
    const page = await ctx.newPage();
    await page.goto(BASE + '/dashboard', { waitUntil: 'load' });
    await page.click('[data-account-toggle]');
    await page.click('[data-sign-out]');
    await page.waitForLoadState('load');
    await page.waitForTimeout(1200);
    await page.goto(BASE + '/mistakes', { waitUntil: 'load' });
    const after = await page.evaluate(() => ({ path: location.pathname, shell: !!document.querySelector('[data-student-shell]'), visitor: !!document.querySelector('[data-visitor-header]') }));
    check('S-9 Sign out: the QA student is signed out (no student shell afterwards)', !after.shell && (after.visitor || /\/auth\/login/.test(after.path)), JSON.stringify(after));
    await ctx.close();
  }

  await browser.close();
  console.log(`\nNAV-1 student pages: ${passes} passed, ${fails} failed`);
  process.exit(fails ? 1 : 0);
})().catch((e) => {
  console.log('ERR', String(e && e.message).slice(0, 300));
  process.exit(1);
});

function document_has_bell(items) {
  return /notification/i.test(items);
}
