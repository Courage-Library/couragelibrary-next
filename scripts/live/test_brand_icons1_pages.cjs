#!/usr/bin/env node
/**
 * BRAND-ICONS-1 page checks — real pages in a real browser, against a LOCAL fixture build only (anonymous, no sign-in,
 * no writes, synthetic fixture data):  EXAM_UX_FIXTURE=1 npx next build && EXAM_UX_FIXTURE=1 npx next start -p 3107
 *   --record <file>  on the PRE-change build: the target sizes (nav items, centre button, result actions) and the exam
 *                    screen's SVG markup per viewport → JSON
 *   --expect <file>  on the branch build, against that JSON:
 *     P-1 five viewports: every nav / result-action target has the same size as before (± 0.5 px); CLS < 0.1 (load +
 *         scroll); no horizontal scroll
 *     P-2 exactly ONE visible nav icon shows the active style (its triangle filled with its own gradient), on the
 *         aria-current item; the brand icons render (nav + centre button + result actions)
 *     P-3 every id on the page is unique (gradient ids)
 *     P-4 the exam screen's SVG markup is byte-identical to the pre-change build (exam fixture)
 *     P-5 dashboard cards fixture (dev/brand-icons-fixture): four active card icons + the idle "Coming soon" lock; CLS
 *   --shots <dir>    screenshots: sidebar expanded / collapsed (1366), phone bar (390), result actions (1366 + 390),
 *                    dashboard cards (1366 + 390)
 * Usage: node scripts/live/test_brand_icons1_pages.cjs http://localhost:3107 (--record f | --expect f) [--shots dir]
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const BASE = (process.argv.find((a) => /^https?:\/\//.test(a)) || 'http://localhost:3107').replace(/\/$/, '');
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(BASE).hostname)) throw new Error('runs against a local build only');
const arg = (k) => {
  const i = process.argv.indexOf(k);
  return i > 0 ? process.argv[i + 1] : null;
};
const RECORD = arg('--record');
const EXPECT = arg('--expect');
const SHOTS = arg('--shots');
const VIEWPORTS = [
  { name: '1366x768', width: 1366, height: 768 },
  { name: '1920x1080', width: 1920, height: 1080 },
  { name: '768x1024', width: 768, height: 1024 },
  { name: '390x844', width: 390, height: 844 },
  { name: '360x740', width: 360, height: 740 },
];

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
  const base = EXPECT ? JSON.parse(fs.readFileSync(EXPECT, 'utf8')) : null;
  const rec = { targets: {}, exam: {} };
  const shotEl = async (pg, el, file) => {
    await el.evaluate((e) => e.scrollIntoView({ block: "center" }));
    await pg.waitForTimeout(150);
    const b = await el.boundingBox();
    await pg.screenshot({ path: file, type: "jpeg", quality: 85, clip: { x: Math.max(0, b.x - 8), y: Math.max(0, b.y - 8), width: b.width + 16, height: b.height + 16 } });
  };
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
  // the targets of this phase, measured where they are visible (sidebar ≥ 1024 px, phone bar below)
  const measure = (page) =>
    page.evaluate(() => {
      const vis = (el) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
      };
      const out = {};
      const add = (k, el) => {
        if (!el || !vis(el)) return;
        const r = el.getBoundingClientRect();
        out[k] = [Math.round(r.width * 2) / 2, Math.round(r.height * 2) / 2];
      };
      document.querySelectorAll('[data-student-key]').forEach((a) => add(`nav:${a.closest('[data-student-bar]') ? 'bar' : 'side'}:${a.dataset.studentKey}`, a));
      add('fab', document.querySelector('[data-todays-mock]'));
      const acts = document.querySelector('[data-review-actions]');
      if (acts) [...acts.querySelectorAll('a,button')].forEach((el, i) => add(`review:${i}:${el.getAttribute('aria-label') || el.textContent.trim().slice(0, 20)}`, el));
      document.querySelectorAll('a[aria-label^="Learn "], a[aria-label^="Practice "]').forEach((el, i) => add(`topic:${i}:${el.getAttribute('aria-label').split(' ')[0]}`, el));
      return out;
    });

  for (const vp of VIEWPORTS) {
    const ctx = await newCtx(vp);
    const page = await ctx.newPage();
    await page.addInitScript(clsInit);
    // ---- result fixture: the student shell + the result actions
    const r = await page.goto(`${BASE}/dev/result-fixture`, { waitUntil: 'load', timeout: 120000 });
    await page.waitForTimeout(400);
    await scrollEnd(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    const t = await measure(page);
    rec.targets[vp.name] = t;
    if (EXPECT) {
      check(`P-0 ${vp.name} result fixture answers`, r && r.status() === 200, String(r && r.status()));
      const was = base.targets[vp.name] || {};
      const diff = Object.keys(was).filter((k) => !t[k] || t[k][0] !== was[k][0] || t[k][1] !== was[k][1]).map((k) => `${k} ${JSON.stringify(was[k])}→${JSON.stringify(t[k] || null)}`);
      check(`P-1 ${vp.name} ${Object.keys(was).length} targets (nav, centre button, result actions) the same size as before`, Object.keys(was).length >= 4 && diff.length === 0, diff.slice(0, 4).join(' | '));
      const m = await page.evaluate(() => ({ cls: window.__cls, ovf: document.documentElement.scrollWidth - document.documentElement.clientWidth }));
      check(`P-1 ${vp.name} CLS < 0.1 · no horizontal scroll`, m.cls < 0.1 && m.ovf <= 0, `CLS ${m.cls.toFixed(4)} · overflow ${m.ovf}`);
      // (a) the server HTML marks exactly the current item ("/mock-tests/…/result" → Mocks) in both navs. The fixture's
      // URL is /dev/result-fixture, so the client enhancer then re-derives the item from THAT url (none) — on the real
      // result page the url is /mock-tests/… and Mocks stays current. (b)/(c) therefore set aria-current the way the
      // enhancer does after a client navigation and check that the active style follows it.
      const html = await (await page.request.get(`${BASE}/dev/result-fixture`)).text();
      const cur = [...html.matchAll(/<a\b[^>]*data-student-key="([a-zA-Z]+)"[^>]*>/g)].filter((m) => /aria-current="page"/.test(m[0])).map((m) => m[1]);
      check(`P-2 ${vp.name} server HTML: exactly the Mocks item is current (sidebar + phone bar)`, cur.join() === 'mocks,mocks', cur.join() || 'none');
      const a = await page.evaluate(() => {
        const vis = (el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
        };
        const setCurrent = (key) => document.querySelectorAll('[data-student-key]').forEach((el) => (el.dataset.studentKey === key ? el.setAttribute('aria-current', 'page') : el.removeAttribute('aria-current')));
        const activeNow = () =>
          [...document.querySelectorAll('[data-student-key] svg[data-brand-icon]')]
            .filter(vis)
            .filter((s) => {
              const tri = s.querySelector('.cl-bi__tri');
              return tri && /^url\(/.test(getComputedStyle(tri).fill);
            })
            .map((s) => s.closest('[data-student-key]').dataset.studentKey);
        const nav = [...document.querySelectorAll('[data-student-key] svg[data-brand-icon]')].filter(vis).length;
        setCurrent('mocks');
        const a1 = activeNow();
        setCurrent('home');
        const a2 = activeNow();
        setCurrent('__none__');
        const a3 = activeNow();
        const fab = document.querySelector('[data-todays-mock] svg[data-brand-icon="todays-mock"][data-variant="onBlue"]');
        const ids = [...document.querySelectorAll('[id]')].map((e) => e.id);
        const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
        const actions = ['learn', 'mistake-vault', 'practice'].map((n) => document.querySelectorAll(`main svg[data-brand-icon="${n}"]`).length);
        return { nav, a1, a2, a3, fab: !!fab, dup: [...new Set(dup)].slice(0, 3), ids: ids.length, actions };
      });
      check(`P-2 ${vp.name} exactly one visible nav icon in the active style, on the aria-current item; it follows aria-current (client navigation); none without a current item`, a.nav >= 3 && a.a1.join() === 'mocks' && a.a2.join() === 'home' && a.a3.length === 0, `${a.nav} visible · mocks→[${a.a1}] · home→[${a.a2}] · none→[${a.a3}]`);
      check(`P-2 ${vp.name} brand icons render: centre button todays-mock on blue (phone), result actions learn / mistake-vault / practice`, (vp.width >= 1024 || a.fab) && a.actions.every((n) => n >= 1), `fab ${a.fab} · actions ${a.actions.join('/')}`);
      check(`P-3 ${vp.name} every id on the page is unique`, a.dup.length === 0, `${a.ids} ids${a.dup.length ? ' · dup ' + a.dup.join(', ') : ''}`);
    }
    if (SHOTS && vp.name === '1366x768') {
      await page.evaluate(() => window.scrollTo(0, 0));
      // the current item as on the real result page (/mock-tests/… → Mocks; see P-2)
      await page.evaluate(() => document.querySelectorAll('[data-student-key]').forEach((el) => (el.dataset.studentKey === 'mocks' ? el.setAttribute('aria-current', 'page') : el.removeAttribute('aria-current'))));
      await page.screenshot({ path: path.join(SHOTS, 'sidebar-expanded-1366.jpg'), type: 'jpeg', quality: 80, clip: { x: 0, y: 0, width: 420, height: 560 } });
      await page.evaluate(() => document.documentElement.setAttribute('data-sidebar', 'collapsed'));
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(SHOTS, 'sidebar-collapsed-1366.jpg'), type: 'jpeg', quality: 80, clip: { x: 0, y: 0, width: 420, height: 560 } });
      await page.evaluate(() => document.documentElement.removeAttribute('data-sidebar'));
      const acts = await page.$('[data-review-actions]');
      if (acts) {
        await acts.scrollIntoViewIfNeeded();
        const card = await acts.evaluateHandle((el) => el.closest('[data-review-card]') || el.parentElement);
        await card.asElement().screenshot({ path: path.join(SHOTS, 'result-actions-1366.jpg'), type: 'jpeg', quality: 80 });
      }
      const topic = await page.$('a[aria-label^="Practice "]');
      if (topic) {
        await topic.scrollIntoViewIfNeeded();
        const row = await topic.evaluateHandle((el) => el.closest('li,tr,div[class*="rounded"]') || el.parentElement);
        await row.asElement().screenshot({ path: path.join(SHOTS, 'result-topic-actions-1366.jpg'), type: 'jpeg', quality: 80 });
      }
    }
    if (SHOTS && vp.name === '390x844') {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.evaluate(() => document.querySelectorAll('[data-student-key]').forEach((el) => (el.dataset.studentKey === 'mocks' ? el.setAttribute('aria-current', 'page') : el.removeAttribute('aria-current'))));
      await page.screenshot({ path: path.join(SHOTS, 'phone-bar-390.jpg'), type: 'jpeg', quality: 80, clip: { x: 0, y: vp.height - 120, width: vp.width, height: 120 } });
      const acts = await page.$('[data-review-actions]');
      if (acts) {
        await acts.scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(SHOTS, 'result-actions-390.jpg'), type: 'jpeg', quality: 80 });
      }
    }

    // ---- exam fixture: the SVG markup must not change (P-4)
    await page.goto(`${BASE}/dev/exam-fixture`, { waitUntil: 'load', timeout: 120000 });
    await page.waitForTimeout(500);
    const svgs = await page.evaluate(() => [...document.querySelectorAll('svg')].map((s) => s.outerHTML).join('\n'));
    const h = crypto.createHash('sha256').update(svgs).digest('hex').slice(0, 16);
    rec.exam[vp.name] = h;
    if (EXPECT) check(`P-4 ${vp.name} exam screen SVG markup unchanged`, base.exam[vp.name] === h, `${h} vs ${base.exam[vp.name]}`);

    // ---- dashboard cards fixture (branch build only)
    if (EXPECT) {
      const page2 = await ctx.newPage();
      await page2.addInitScript(clsInit);
      const r2 = await page2.goto(`${BASE}/dev/brand-icons-fixture`, { waitUntil: 'load', timeout: 120000 });
      await page2.waitForTimeout(400);
      await scrollEnd(page2);
      const c = await page2.evaluate(() => {
        const fill = (s) => getComputedStyle(s.querySelector('path:last-of-type')).fill;
        const on = [...document.querySelectorAll('[data-fixture-cards="on"] svg[data-brand-icon]')].map((s) => `${s.dataset.brandIcon}:${s.dataset.variant}:${/^url\(/.test(fill(s)) ? 'grad' : 'flat'}`);
        const soon = [...document.querySelectorAll('[data-fixture-cards="soon"] [data-memory-lock-card] svg[data-brand-icon]')].map((s) => `${s.dataset.brandIcon}:${s.dataset.variant}`);
        const ids = [...document.querySelectorAll('[id]')].map((e) => e.id);
        return { on, soon, dup: ids.length - new Set(ids).size, cls: window.__cls };
      });
      check(`P-5 ${vp.name} dashboard cards: mocks / practice / mistake-vault / memory-lock active with the gradient; "Coming soon" lock idle; unique ids; CLS < 0.1`, r2 && r2.status() === 200 && c.on.join() === 'mocks:active:grad,practice:active:grad,mistake-vault:active:grad,memory-lock:active:grad' && c.soon.join() === 'memory-lock:idle' && c.dup === 0 && c.cls < 0.1, `${c.on.join(' ')} · soon ${c.soon.join()} · dup ${c.dup} · CLS ${c.cls.toFixed(4)}`);
      if (SHOTS && ['1366x768', '390x844'].includes(vp.name)) {
        await shotEl(page2, await page2.$('[data-fixture-cards="on"]'), path.join(SHOTS, `dashboard-cards-${vp.width}.jpg`));
        const soon = await page2.$('[data-fixture-cards="soon"]');
        if (vp.width === 1366) await shotEl(page2, soon, path.join(SHOTS, 'dashboard-cards-coming-soon-1366.jpg'));
        if (vp.width === 1366) await shotEl(page2, await page2.$('[data-fixture-sheet]'), path.join(SHOTS, 'brand-icons-sheet-1366.jpg'));
      }
      await page2.close();
    }
    await ctx.close();
  }
  await browser.close();
  if (RECORD) {
    fs.writeFileSync(RECORD, JSON.stringify(rec, null, 1));
    console.log(`recorded ${Object.values(rec.targets).reduce((n, t) => n + Object.keys(t).length, 0)} targets + ${Object.keys(rec.exam).length} exam hashes → ${RECORD}`);
  }
  if (EXPECT) {
    console.log(`\nBRAND-ICONS-1 pages: ${passes}/${passes + fails} passed`);
    process.exit(fails ? 1 : 0);
  }
})();
