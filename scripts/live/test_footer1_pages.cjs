#!/usr/bin/env node
/**
 * FOOTER-1 page checks — real pages in a real browser, against a LOCAL build only (anonymous, no sign-in, no writes):
 *   EXAM_UX_FIXTURE=1 npx next build && EXAM_UX_FIXTURE=1 npx next start -p 3107
 *   (the student footer is checked on the local result fixture — THE student shell + the RESULT-UX-1 bar, synthetic
 *   data — and exam focus on the local exam fixture; both exist only in that flagged local build)
 *   G-1 five viewports (1366×768, 1920×1080, 768×1024, 390×844, 360×740) × public pages (/, /hi, /exams, /about,
 *       /privacy, /auth/login): exactly one <footer>, THE public footer; no horizontal scroll; CLS < 0.1 (load + scroll);
 *       no emoji; phone link targets ≥ 44 px (48 px rows)
 *   G-2 band: on /exams, /about, /privacy; not on /, /hi, /auth/login; hidden on a cached page for a signed-in visitor
 *       (an auth-cookie NAME only — no session, no real account)
 *   G-3 language: the switch only in the / and /hi footers; Hindi footer copy on /hi; English on /exams
 *   G-4 compliance: Privacy, Terms, Refund, Shipping, Contact linked on every public page; every footer link answers
 *   G-5 student: THE student line on the result fixture; at the end of the page it is fully visible ABOVE the bottom nav
 *       and the "Review N mistakes" bar (360×740, 390×844, 768×1024) and right of the sidebar on desktop; CLS < 0.1
 *   G-6 exam focus: no footer at all inside a live attempt (exam fixture)
 * --shots → JPEG screenshots in docs/design/screens/footer-1/ (public pages + synthetic fixtures only: no personal data)
 * Usage: node scripts/live/test_footer1_pages.cjs http://localhost:3107 [--shots]
 */
const fs = require('fs');
const path = require('path');

const BASE = (process.argv.find((a) => /^https?:\/\//.test(a)) || 'http://localhost:3107').replace(/\/$/, '');
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(BASE).hostname)) throw new Error('runs against a local build only');
const SHOTS = process.argv.includes('--shots');
const SHOT_DIR = path.join(__dirname, '..', '..', 'docs', 'design', 'screens', 'footer-1');
const VIEWPORTS = [
  { name: '1366x768', width: 1366, height: 768 },
  { name: '1920x1080', width: 1920, height: 1080 },
  { name: '768x1024', width: 768, height: 1024 },
  { name: '390x844', width: 390, height: 844 },
  { name: '360x740', width: 360, height: 740 },
];
const PAGES = [
  { url: '/', band: false, lang: 'en', switch: true },
  { url: '/hi', band: false, lang: 'hi', switch: true },
  { url: '/exams', band: true, lang: 'en', switch: false },
  { url: '/about', band: true, lang: 'en', switch: false },
  { url: '/privacy', band: true, lang: 'en', switch: false },
  { url: '/auth/login', band: false, lang: 'en', switch: false },
];
const COMPLIANCE = ['/privacy', '/terms', '/refund-policy', '/shipping-policy', '/contact'];
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{2712}\u{2714}\u{2716}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/u;

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
  const footerHrefs = new Set();
  const newCtx = (vp) => browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.width < 768, hasTouch: vp.width < 768 });
  const clsInit = () => {
    window.__cls = 0;
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
    }).observe({ type: 'layout-shift', buffered: true });
  };
  const scrollEnd = async (page) =>
    page.evaluate(async () => {
      for (let y = 0; y < document.documentElement.scrollHeight; y += 700) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 25));
      }
      window.scrollTo(0, document.documentElement.scrollHeight);
      await new Promise((r) => setTimeout(r, 250));
    });

  // ---------------------------------------------------------------- G-1 … G-4 public pages
  for (const vp of VIEWPORTS) {
    const ctx = await newCtx(vp);
    const page = await ctx.newPage();
    await page.addInitScript(clsInit);
    for (const p of PAGES) {
      const resp = await page.goto(BASE + p.url, { waitUntil: 'load', timeout: 120000 });
      await page.waitForTimeout(300);
      await scrollEnd(page);
      const r = await page.evaluate(() => {
        const f = document.querySelectorAll('footer');
        const pub = document.querySelector('footer[data-footer="public"]');
        const band = document.querySelector('[data-footer-band]');
        const vis = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).display !== 'none';
        const links = pub ? [...pub.querySelectorAll('a')].filter(vis) : [];
        return {
          footers: f.length,
          kind: f[0] && f[0].getAttribute('data-footer'),
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          band: vis(band),
          bandStart: band && band.querySelector('[data-footer-start]') ? band.querySelector('[data-footer-start]').getAttribute('data-footer-start') : null,
          sw: !!(pub && pub.querySelector('[data-lang-switch]')),
          lang: pub && pub.getAttribute('lang'),
          text: pub ? pub.innerText : '',
          hrefs: links.map((a) => a.getAttribute('href')),
          small: links.map((a) => ({ t: (a.getAttribute('aria-label') || a.textContent).trim().slice(0, 24), h: Math.round(a.getBoundingClientRect().height) })).filter((x) => x.h < 44),
          cls: window.__cls,
        };
      });
      const tag = `${vp.name} ${p.url}`;
      const phone = vp.width < 900;
      check(`G-1 ${tag}: one <footer> = THE public footer`, resp.status() === 200 && r.footers === 1 && r.kind === 'public', `${resp.status()} · ${r.footers} × ${r.kind}`);
      check(`G-1 ${tag}: no horizontal scroll · CLS < 0.1 · no emoji`, r.overflow <= 0 && r.cls < 0.1 && !EMOJI.test(r.text), `overflow ${r.overflow} · CLS ${r.cls.toFixed(4)}`);
      if (phone) check(`G-1 ${tag}: footer link targets ≥ 44 px`, r.small.length === 0, r.small.slice(0, 4).map((x) => `${x.t} ${x.h}`).join('; '));
      check(`G-2 ${tag}: band ${p.band ? 'shown' : 'absent'}`, r.band === p.band && (!p.band || r.bandStart === 'signup' || r.bandStart === 'explore'), `${r.band} ${r.bandStart || ''}`);
      check(`G-3 ${tag}: switch ${p.switch ? 'shown' : 'absent'} · ${p.lang} copy`, r.sw === p.switch && r.lang === p.lang && (p.lang === 'hi' ? /परीक्षाएँ/.test(r.text) && /मदद और नियम/.test(r.text) : /Help & legal/.test(r.text)), `${r.sw} · ${r.lang}`);
      check(`G-4 ${tag}: the five compliance links`, COMPLIANCE.every((h) => r.hrefs.includes(h)), COMPLIANCE.filter((h) => !r.hrefs.includes(h)).join(', '));
      r.hrefs.forEach((h) => footerHrefs.add(h));
      if (SHOTS && ['/exams', '/hi'].includes(p.url) && (p.url === '/exams' || ['1366x768', '390x844'].includes(vp.name))) {
        await page.locator(p.band ? '[data-footer-band]' : 'footer').first().scrollIntoViewIfNeeded();
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        await page.waitForTimeout(150);
        await page.screenshot({ path: path.join(SHOT_DIR, `public-${p.url === '/hi' ? 'hi' : 'exams'}-${vp.name}.jpg`), type: 'jpeg', quality: 72 });
      }
    }
    await ctx.close();
  }

  // G-4 every footer link answers
  {
    const ctx = await browser.newContext();
    const bad = [];
    const dataHubs = [];
    for (const h of footerHrefs) {
      if (!h.startsWith('/')) continue;
      // a live category hub reads the database; this local server runs with Supabase blackholed, so its answer is
      // checked on production after release (the route itself is gated offline: FOOTER-1 F-3)
      if (/^\/exams\/[^/]+$/.test(h)) {
        dataHubs.push(h);
        continue;
      }
      const res = await ctx.request.get(BASE + h, { maxRedirects: 3, timeout: 120000 });
      if (res.status() >= 400) bad.push(`${h} ${res.status()}`);
    }
    check('G-4 every footer link answers (no 4xx / 5xx)', bad.length === 0, bad.length ? bad.join(', ') : `${footerHrefs.size - dataHubs.length} links${dataHubs.length ? ` (+ ${dataHubs.join(', ')} checked on production)` : ''}`);
    await ctx.close();
  }

  // G-2 signed-in visitor on a cached page: the band hides by the pre-paint hint (an auth-cookie NAME only)
  {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    await ctx.addCookies([{ name: 'sb-fixture-auth-token', value: 'x', url: BASE }]);
    const page = await ctx.newPage();
    await page.goto(`${BASE}/exams`, { waitUntil: 'load' });
    const r = await page.evaluate(() => ({ auth: document.documentElement.getAttribute('data-auth'), band: getComputedStyle(document.querySelector('[data-footer-band]')).display }));
    check('G-2 /exams with an auth-cookie name: the band is hidden (data-auth hint)', r.auth === 'in' && r.band === 'none', JSON.stringify(r));
    await ctx.close();
  }

  // ---------------------------------------------------------------- G-5 student line (result fixture)
  for (const vp of VIEWPORTS) {
    const ctx = await newCtx(vp);
    const page = await ctx.newPage();
    await page.addInitScript(clsInit);
    const resp = await page.goto(`${BASE}/dev/result-fixture`, { waitUntil: 'load', timeout: 120000 });
    await page.waitForTimeout(300);
    await scrollEnd(page);
    const r = await page.evaluate(() => {
      const vis = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).display !== 'none';
      const f = document.querySelectorAll('footer');
      const sf = document.querySelector('footer[data-footer="student"]');
      const b = sf ? sf.getBoundingClientRect() : null;
      const nav = document.querySelector('.cl-ss__bar');
      const bar = document.querySelector('[data-result-bar="summary"]');
      const side = document.querySelector('.cl-ss__side');
      const covers = (el) => vis(el) && b && el.getBoundingClientRect().top < b.bottom - 0.5;
      // nothing sits on the line: sample its links
      const links = sf ? [...sf.querySelectorAll('a')].filter(vis) : [];
      const onTop = links.every((a) => {
        const r2 = a.getBoundingClientRect();
        const el = document.elementFromPoint(r2.left + r2.width / 2, r2.top + r2.height / 2);
        return el && a.contains(el);
      });
      return {
        status: 0,
        footers: f.length,
        kind: f[0] && f[0].getAttribute('data-footer'),
        top: b ? b.top : -1,
        bottom: b ? b.bottom : 1e9,
        vh: window.innerHeight,
        navCovers: covers(nav),
        barCovers: covers(bar),
        onTop,
        rightOfSidebar: !vis(side) || (b && b.left >= side.getBoundingClientRect().right - 0.5),
        small: links.map((a) => Math.round(a.getBoundingClientRect().height)).filter((h) => h < 44),
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        cls: window.__cls,
        text: sf ? sf.innerText : '',
      };
    });
    const tag = `${vp.name} result fixture`;
    check(`G-5 ${tag}: one <footer> = THE student line`, resp.status() === 200 && r.footers === 1 && r.kind === 'student', `${r.footers} × ${r.kind}`);
    check(`G-5 ${tag}: fully visible at the end of the page, above the bottom nav and the result bar`, r.top >= 0 && r.bottom <= r.vh + 0.5 && !r.navCovers && !r.barCovers && r.onTop, `line ${Math.round(r.top)}–${Math.round(r.bottom)} of ${r.vh} · nav ${r.navCovers} · bar ${r.barCovers} · on top ${r.onTop}`);
    check(`G-5 ${tag}: right of the sidebar · no horizontal scroll · CLS < 0.1 · no emoji`, r.rightOfSidebar && r.overflow <= 0 && r.cls < 0.1 && !EMOJI.test(r.text), `overflow ${r.overflow} · CLS ${r.cls.toFixed(4)}`);
    if (vp.width < 1024) check(`G-5 ${tag}: line link targets ≥ 44 px`, r.small.length === 0, r.small.join(', '));
    if (SHOTS && ['1366x768', '390x844', '360x740'].includes(vp.name)) await page.screenshot({ path: path.join(SHOT_DIR, `student-${vp.name}.jpg`), type: 'jpeg', quality: 72 });
    await ctx.close();
  }

  // ---------------------------------------------------------------- G-6 exam focus
  for (const vp of [VIEWPORTS[0], VIEWPORTS[3]]) {
    const ctx = await newCtx(vp);
    const page = await ctx.newPage();
    await page.route('**/api/assessment/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' }));
    await page.goto(`${BASE}/dev/exam-fixture`, { waitUntil: 'load', timeout: 120000 });
    const before = await page.evaluate(() => document.querySelectorAll('footer').length);
    await page.getByRole('button', { name: /Begin Test/ }).click();
    await page.locator('[data-exam-layout="v1"]').waitFor();
    const after = await page.evaluate(() => document.querySelectorAll('footer').length);
    check(`G-6 ${vp.name} exam focus: no footer`, before === 0 && after === 0, `${before} / ${after}`);
    await ctx.close();
  }

  await browser.close();
  console.log(`\nFOOTER-1 pages: ${passes}/${passes + fails} passed`);
  process.exit(fails ? 1 : 0);
})().catch((e) => {
  console.error(`FOOTER-1 pages: error — ${String(e && e.message).slice(0, 400)}`);
  process.exit(1);
});
