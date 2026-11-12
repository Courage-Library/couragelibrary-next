#!/usr/bin/env node
/**
 * SYLLABUS-UI-1 — the syllabus browser in a real browser, on the LOCAL build (scripts/live/with-server.cjs → BASE_URL).
 * READ ONLY: every non-GET request is aborted (the admin page is opened as the QA admin with cookies; no decision is
 * clicked). Student page = the exam hub's syllabus (anonymous); admin page = the newest syllabus intake review.
 * Per page × size (360×740 phone, 768×1024 tablet, 1280×860 desktop):
 *   B-1 no horizontal page scroll (the document — or, on admin, #admin-content — is never wider than the viewport)
 *   B-2 after Expand all and 3 screens of scrolling the ONE sticky bar is stuck exactly at its offset: below the site
 *       header (student) / at the admin pane's top edge (admin, nothing scrolls into view above it), and it is opaque
 *   B-3 jump-to (rail link ≥ 1024 px, the "Jump to topic" sheet below) lands the chosen topic just under the bar — not
 *       under it, not far below it — and moves focus to it; the rail marks it aria-current (scroll-spy)
 *   B-4 phone: every button / link / input in the browser is at least 44 px tall
 *   B-5 subject switch + collapse: a second subject's tab shows its own topics; a topic toggle flips aria-expanded
 *   B-6 subject tabs are ONE row and, at ≥ 1280 px, all of them fit (no hidden tab, no fade)
 *   B-7 when tabs do not fit (any width): a right-edge fade + arrow shows, and the arrow scrolls the row
 *   N-2 negative control: a squeezed tab row must overflow and show the fade + arrow
 *   N-1 negative control: with a test-only style that un-sticks the bar, B-2 FAILS (the check can see the bug)
 * Usage: node scripts/live/with-server.cjs -- "node scripts/live/test_syllabus_browse.cjs [--exam=ssc-cgl] [--only=student|admin] [--shots=<dir>]"
 * Browser: Playwright's bundled Chromium, or PW_CHANNEL=chrome|msedge for an installed one.
 */
require('../db/safe-net.cjs'); // SAFE-NET: masks IPs / hosts / e-mails / keys in all output (scripts/db/safe-net.cjs)
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const { chromium } = require(path.join(ROOT, 'node_modules/playwright'));
const { qaBrowserLogin } = require(path.join(ROOT, 'scripts/live/qa-session.cjs'));

const BASE = (process.env.BASE_URL || 'http://localhost:3100').replace(/\/$/, '');
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) throw new Error('BASE_URL must be a local dev host');
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || `--${k}=${d}`).slice(k.length + 3);
const EXAM = arg('exam', 'ssc-cgl');
const ONLY = arg('only', '');
const SHOTS = arg('shots', '');
const SIZES = [[360, 740], [768, 1024], [1280, 860]];
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

let ok = true;
const chk = (n, cond, info) => {
  if (!cond) ok = false;
  console.log(`${cond ? 'PASS' : 'FAIL'} ${n}${cond ? '' : ' — ' + (info ?? '')}`);
};
const shot = async (p, name) => {
  if (SHOTS) await p.screenshot({ path: path.join(SHOTS, `${name}.png`) });
};

/** in the page: the bar, the scroller and the offset the bar should stick at */
function geometry(kind) {
  const bar = document.querySelector('[data-syllabus-bar]');
  const scroller = kind === 'admin' ? document.getElementById('admin-content') : null;
  const header = kind === 'student' ? document.querySelector('header[data-header-solid]') : null;
  const b = bar ? bar.getBoundingClientRect() : null;
  const expectTop = kind === 'admin' ? scroller.getBoundingClientRect().top : header ? header.getBoundingClientRect().bottom : 0;
  const bg = bar ? getComputedStyle(bar).backgroundColor : '';
  return {
    barTop: b ? Math.round(b.top) : null,
    barBottom: b ? Math.round(b.bottom) : null,
    expectTop: Math.round(expectTop),
    opaque: /^rgb\(/.test(bg) || /rgba\(.*,\s*1\)$/.test(bg),
    position: bar ? getComputedStyle(bar).position : null,
    docOverflow: document.documentElement.scrollWidth - window.innerWidth,
    paneOverflow: scroller ? scroller.scrollWidth - scroller.clientWidth : 0,
  };
}

async function scrollScreens(p, kind, n) {
  await p.evaluate(([k, n]) => {
    const sc = k === 'admin' ? document.getElementById('admin-content') : null;
    const h = sc ? sc.clientHeight : window.innerHeight;
    // start where the browser starts, then n screens further — but never past its end (a sticky bar leaves with its
    // list, which is correct; the check is about the bar while the list is on screen)
    const root = document.querySelector('[data-syllabus-browser]').getBoundingClientRect();
    const base = sc ? sc.getBoundingClientRect().top - sc.scrollTop : -window.scrollY;
    const start = root.top - base;
    const end = root.bottom - base - h;
    const to = Math.max(start, Math.min(start + h * n, end));
    if (sc) sc.scrollTop = to;
    else window.scrollTo(0, to);
  }, [kind, n]);
  await p.waitForTimeout(250);
}

async function checkPage(p, kind, w) {
  const tag = `${kind} ${w}px`;
  await p.waitForSelector('[data-syllabus-browser]', { timeout: 30000 });
  // B-5 subject switch + aria-expanded
  const tabs = p.locator('[data-subject-tabs] [role="tab"]');
  const nTabs = await tabs.count();
  if (nTabs > 1) {
    await tabs.nth(1).click();
    const sel = await tabs.nth(1).getAttribute('aria-selected');
    const panelId = await tabs.nth(1).getAttribute('aria-controls');
    const panelVisible = panelId ? await p.locator(`[id="${panelId}"]`).isVisible() : false;
    chk(`B-5 ${tag} second subject tab selects its panel`, sel === 'true' && panelVisible, `selected ${sel}, panel visible ${panelVisible}`);
    await tabs.nth(0).click();
  }
  // B-6 / B-7 tabs: one row; all fit at ≥ 1280 px; when some do not fit, a right-edge fade + arrow shows and works
  if (nTabs > 1) {
    const t = await p.evaluate(() => {
      const el = document.querySelector('[data-subject-tabs]');
      return { over: el.scrollWidth - el.clientWidth, rows: new Set([...el.querySelectorAll('[role="tab"]')].map((b) => Math.round(b.getBoundingClientRect().top))).size, fade: Boolean(document.querySelector('[data-tabs-fade="right"]')) };
    });
    chk(`B-6 ${tag} subject tabs are one row`, t.rows === 1, `${t.rows} rows`);
    if (w >= 1280) chk(`B-6 ${tag} all ${nTabs} subject tabs fit (no hidden tab)`, t.over <= 0 && !t.fade, `overflow ${t.over}px, fade ${t.fade}`);
    if (t.over > 0) {
      const before = await p.evaluate(() => document.querySelector('[data-subject-tabs]').scrollLeft);
      const more = p.locator('[data-tabs-more]');
      const shown = t.fade && (await more.isVisible());
      if (shown) await more.click();
      await p.waitForTimeout(600);
      const after = await p.evaluate(() => document.querySelector('[data-subject-tabs]').scrollLeft);
      chk(`B-7 ${tag} hidden tabs: right-edge fade + arrow, the arrow scrolls the tabs`, shown && after > before, `fade ${t.fade}, arrow ${shown}, scrollLeft ${before} → ${after}`);
      await shot(p, `after-${kind}-${w}-tabs-overflow`);
      await p.evaluate(() => { document.querySelector('[data-subject-tabs]').scrollLeft = 0; });
    }
  }
  const toggle = p.locator('[data-subject-panel]:not([hidden]) button[data-topic-toggle]').first();
  if (await toggle.count()) {
    const before = await toggle.getAttribute('aria-expanded');
    await toggle.click();
    const after = await toggle.getAttribute('aria-expanded');
    await toggle.click();
    chk(`B-5 ${tag} topic toggle flips aria-expanded`, before === 'false' && after === 'true', `${before} → ${after}`);
  }

  // B-4 tap targets on the phone
  if (w < 768) {
    const small = await p.$$eval('[data-syllabus-browser] button, [data-syllabus-browser] input, [data-syllabus-browser] a', (els) =>
      els.filter((e) => e.offsetParent !== null && e.getBoundingClientRect().height > 0 && e.getBoundingClientRect().height < 44).map((e) => `${e.tagName.toLowerCase()} "${(e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 30)}" ${Math.round(e.getBoundingClientRect().height)}px`),
    );
    chk(`B-4 ${tag} tap targets ≥ 44 px`, small.length === 0, small.slice(0, 5).join('; '));
  }

  // B-2 sticky after Expand all + 3 screens
  await p.locator('[data-expand-all]').click();
  await p.waitForTimeout(200);
  await scrollScreens(p, kind, 3);
  const g = await p.evaluate(geometry, kind);
  chk(`B-1 ${tag} no horizontal scroll`, g.docOverflow <= 0 && g.paneOverflow <= 0, `document +${g.docOverflow}px, pane +${g.paneOverflow}px`);
  chk(`B-2 ${tag} the bar is stuck at its offset and opaque`, g.position === 'sticky' && Math.abs(g.barTop - g.expectTop) <= 1 && g.opaque, JSON.stringify(g));
  await shot(p, `after-${kind}-${w}-scrolled`);

  // B-3 jump-to: a topic near the end of the open subject
  const target = await p.$$eval('[data-subject-panel]:not([hidden]) li[data-topic]:not([hidden])', (lis) => {
    const li = lis[Math.max(0, lis.length - 2)];
    return li ? { id: li.id, topic: li.getAttribute('data-topic') } : null;
  });
  if (!target) {
    chk(`B-3 ${tag} a topic to jump to`, false, 'no topics');
    return;
  }
  await scrollScreens(p, kind, 0);
  if (w >= 1024) {
    await p.locator(`[data-rail] a[data-rail-id="${target.topic}"]`).click();
  } else {
    await p.locator('[data-jump-open]').click();
    await p.waitForSelector('dialog[data-jump-sheet][open]');
    await shot(p, `after-${kind}-${w}-jump-sheet`);
    await p.locator(`dialog[data-jump-sheet] button[data-jump-id="${target.topic}"]`).click();
  }
  // smooth scroll: wait until the topic stops moving (≤ 6 s), not a fixed time — a long admin list scrolls further
  await p.evaluate(async (id) => {
    const el = document.getElementById(id);
    let last = NaN;
    let still = 0;
    for (let t = 0; t < 60 && still < 3; t++) {
      await new Promise((r) => setTimeout(r, 100));
      const y = Math.round(el.getBoundingClientRect().top);
      still = y === last ? still + 1 : 0;
      last = y;
    }
  }, target.id);
  const j = await p.evaluate((id) => {
    const li = document.getElementById(id);
    const bar = document.querySelector('[data-syllabus-bar]').getBoundingClientRect();
    const r = li.getBoundingClientRect();
    const rail = document.querySelector('[data-rail] a[aria-current="location"]');
    return { top: Math.round(r.top), barBottom: Math.round(bar.bottom), focusInside: li.contains(document.activeElement), railCurrent: rail ? rail.getAttribute('data-rail-id') : null, sheetOpen: Boolean(document.querySelector('dialog[data-jump-sheet][open]')) };
  }, target.id);
  chk(`B-3 ${tag} jump lands the topic just under the bar, focused`, !j.sheetOpen && j.top >= j.barBottom - 1 && j.top <= j.barBottom + 40 && j.focusInside, JSON.stringify(j));
  if (w >= 1024) chk(`B-3 ${tag} the rail marks the topic (scroll-spy)`, j.railCurrent === target.topic, `current ${j.railCurrent}`);
  await shot(p, `after-${kind}-${w}-jumped`);
}

(async () => {
  console.log(`SYLLABUS-UI-1 browser gate (${BASE})`);
  const browser = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
  const guard = (ctx) => ctx.route('**/*', (r) => (['GET', 'HEAD'].includes(r.request().method()) ? r.continue() : r.abort()));
  try {
    for (const [w, h] of SIZES) {
      if (ONLY !== 'admin') {
        const ctx = await browser.newContext({ viewport: { width: w, height: h } });
        await guard(ctx);
        const p = await ctx.newPage();
        await p.goto(`${BASE}/exams/${EXAM}`, { waitUntil: 'networkidle' });
        await p.evaluate(() => { const d = document.querySelector('#syllabus details'); if (d) d.open = true; });
        await p.evaluate(() => document.getElementById('syllabus').scrollIntoView());
        await shot(p, `after-student-${w}-top`);
        await checkPage(p, 'student', w);
        if (w === 1280) {
          // N-1 negative control: an un-stuck bar must fail B-2
          await p.addStyleTag({ content: '[data-syllabus-bar]{position:static !important}' });
          await scrollScreens(p, 'student', 3);
          const g = await p.evaluate(geometry, 'student');
          const wouldPass = g.position === 'sticky' && Math.abs(g.barTop - g.expectTop) <= 1;
          chk('N-1 negative control: an un-stuck bar fails B-2', !wouldPass, JSON.stringify(g));
          // N-2 negative control: squeeze the tab row — the fade + arrow must appear (B-6 / B-7 can see hidden tabs)
          await p.addStyleTag({ content: '[data-subject-tabs-wrap]{max-width:220px}' });
          await p.waitForTimeout(400);
          const squeezed = await p.evaluate(() => ({ over: (() => { const el = document.querySelector('[data-subject-tabs]'); return el.scrollWidth - el.clientWidth; })(), fade: Boolean(document.querySelector('[data-tabs-fade="right"] [data-tabs-more]')) }));
          chk('N-2 negative control: a squeezed tab row overflows and shows the fade + arrow', squeezed.over > 0 && squeezed.fade, JSON.stringify(squeezed));
        }
        await ctx.close();
      }
      if (ONLY !== 'student') {
        const ctx = await browser.newContext({ viewport: { width: w, height: h } });
        await qaBrowserLogin(ctx, 'qa-admin@courage-library.test', BASE);
        await guard(ctx);
        const p = await ctx.newPage();
        let href = null;
        for (let attempt = 1; attempt <= 2 && !href; attempt++) {
          // one retry: the sign-in check can time out on a slow line ("Connection problem")
          await p.goto(`${BASE}/admin/syllabus/intake`, { waitUntil: 'networkidle' });
          href = await p.$$eval('a[href^="/admin/syllabus/intake/"]', (as) => as.map((a) => a.getAttribute('href')).find((x) => /intake\/[0-9a-f-]{36}$/.test(x)) || null);
        }
        if (!href) {
          chk(`admin ${w}px an intake session to open`, false, 'none listed (or the intake list did not load)');
        } else {
          await p.goto(`${BASE}${href}`, { waitUntil: 'networkidle' });
          await p.evaluate(() => document.querySelector('[data-syllabus-browser]')?.scrollIntoView());
          await shot(p, `after-admin-${w}-top`);
          await checkPage(p, 'admin', w);
        }
        await ctx.close();
      }
    }
  } catch (e) {
    chk('run', false, e.message.split('\n')[0]);
  } finally {
    await browser.close();
  }
  console.log(ok ? 'SYLLABUS-UI-1 browser gate: PASS' : 'SYLLABUS-UI-1 browser gate: FAIL');
  process.exit(ok ? 0 : 1);
})();
