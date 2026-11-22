#!/usr/bin/env node
/**
 * EXAM-UX-1 page checks — the REAL exam player in a real browser, against a LOCAL fixture build only:
 *   EXAM_UX_FIXTURE=1 npx next build && EXAM_UX_FIXTURE=1 npx next start -p 3107
 *   (route /dev/exam-fixture: a synthetic attempt with fake ids — no sign-in, no database read or write; every
 *   /api/assessment/* call is answered by this script and never reaches the server)
 *   E-1 six viewports (1280×720, 1366×768, 1920×1080, 768×1024, 390×844, 360×740): the page never scrolls, the action
 *       bar is fully on screen, top bar / tabs / bar heights (60·52·68 desktop, 54·44·64 below 1024), only the question
 *       panel scrolls (long passage), the section tabs are ONE row (all four visible at desktop widths), no sideways page
 *       overflow
 *   E-2 legend: 5 states, the counts add up to the section and follow Save & Next / Mark for review & next; filters with
 *       counts narrow the grid
 *   E-3 never auto-advance: choosing an option keeps the same question
 *   E-4 timer (fake clock): normal → amber at 5:00 → red at 1:00, token colours, ONE announcement each; no flashing
 *   E-5 phone sheet: opens, focus stays inside (Tab), Esc closes and returns focus; Submit test opens the existing
 *       confirmation ("Submit your test?")
 *   E-6 keyboard: tabs move with the arrow keys; the options are a radio group moving with ArrowDown
 *   E-7 targets ≥ 44 px (desktop) / ≥ 48 px action bar + palette cells; reduced motion = no running animation
 *   E-8 CLS < 0.1 (load → start → navigate) at 1366×768 and 390×844
 *   E-9 isolation: no request leaves this machine, nothing is submitted
 * --shots → JPEG screenshots in docs/design/screens/exam-ux-1/ (synthetic fixture only: no personal data)
 * Usage: node scripts/live/test_exam_ux1_pages.cjs http://localhost:3107 [--shots]
 */
const fs = require('fs');
const path = require('path');

const BASE = (process.argv.find((a) => /^https?:\/\//.test(a)) || 'http://localhost:3107').replace(/\/$/, '');
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(BASE).hostname)) throw new Error('runs against a local build only');
const SHOTS = process.argv.includes('--shots');
const SHOT_DIR = path.join(__dirname, '..', '..', 'docs', 'design', 'screens', 'exam-ux-1');
const FIXTURE = '/dev/exam-fixture';
const VIEWPORTS = [
  { name: '1280x720', width: 1280, height: 720 },
  { name: '1366x768', width: 1366, height: 768 },
  { name: '1920x1080', width: 1920, height: 1080 },
  { name: '768x1024', width: 768, height: 1024 },
  { name: '390x844', width: 390, height: 844 },
  { name: '360x740', width: 360, height: 740 },
];
const TOKENS = { amberTint: 'rgb(255, 244, 220)', amberText: 'rgb(138, 90, 0)', redTint: 'rgb(253, 236, 234)', redText: 'rgb(180, 35, 24)' };

let fails = 0;
let passes = 0;
const check = (name, ok, info) => {
  if (ok) passes++;
  else fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? ' — ' + info : ''}`);
};
const isLocal = (u) => {
  try {
    const h = new URL(u).hostname;
    return ['localhost', '127.0.0.1', '[::1]'].includes(h) || u.startsWith('data:') || u.startsWith('blob:');
  } catch {
    return true;
  }
};

(async () => {
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  if (SHOTS) fs.mkdirSync(SHOT_DIR, { recursive: true });
  const net = { external: 0, api: {}, submits: 0 };

  async function open(vp, query = '', opts = {}) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.width < 768, hasTouch: vp.width < 768, reducedMotion: opts.reducedMotion || 'no-preference' });
    const page = await ctx.newPage();
    await page.route('**/api/assessment/**', async (route) => {
      const name = new URL(route.request().url()).pathname.split('/').pop();
      net.api[name] = (net.api[name] || 0) + 1;
      if (name === 'submit-attempt') {
        net.submits++;
        return route.fulfill({ status: 503, contentType: 'application/json', body: '{"success":false}' });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' });
    });
    page.on('request', (r) => {
      if (!isLocal(r.url())) net.external++;
    });
    await page.addInitScript(() => {
      window.__cls = 0;
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
      }).observe({ type: 'layout-shift', buffered: true });
    });
    if (opts.clock) await page.clock.install({ time: new Date('2026-11-22T10:00:00+05:30') });
    const resp = await page.goto(`${BASE}${FIXTURE}${query}`, { waitUntil: 'load', timeout: 120000 });
    if (!resp || resp.status() !== 200) throw new Error(`fixture answered ${resp && resp.status()} — build and start with EXAM_UX_FIXTURE=1`);
    await page.getByRole('button', { name: /Begin Test/ }).click();
    await page.locator('[data-exam-layout="v1"]').waitFor({ timeout: 30000 });
    await page.waitForTimeout(opts.clock ? 0 : 300);
    return { ctx, page };
  }
  const shot = async (page, name) => {
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, `${name}.jpg`), type: 'jpeg', quality: 75 });
  };
  const legend = (page) =>
    page.evaluate(() => {
      const scope = [...document.querySelectorAll('[data-palette-legend]')].find((el) => el.getClientRects().length > 0);
      if (!scope) return null;
      const out = {};
      for (const li of scope.querySelectorAll('[data-legend-state]')) out[li.getAttribute('data-legend-state')] = Number(li.querySelector('[data-legend-count]')?.textContent);
      return out;
    });

  // ---------------------------------------------------------------- E-1 viewports
  for (const vp of VIEWPORTS) {
    const { ctx, page } = await open(vp, '?long=1');
    const r = await page.evaluate(() => {
      const box = (sel) => {
        const el = [...document.querySelectorAll(sel)].find((x) => x.getClientRects().length > 0);
        return el ? el.getBoundingClientRect() : null;
      };
      const bar = box('[data-action-bar]');
      const tabs = [...document.querySelectorAll('[role="tab"]')];
      const list = document.querySelector('[role="tablist"]');
      const q = document.querySelector('[data-question-scroll]');
      const tops = new Set(tabs.map((t) => Math.round(t.getBoundingClientRect().top)));
      // every element that can scroll vertically (and has more content than room)
      const scrollers = [...document.querySelectorAll('[data-exam-layout] *')].filter((el) => {
        const s = getComputedStyle(el);
        return /(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 1 && el.getClientRects().length > 0;
      }).map((el) => el.getAttribute('data-question-scroll') !== null ? 'question' : el.getAttribute('data-palette-column') !== null ? 'palette' : el.tagName.toLowerCase());
      const vis = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
      const topbar = document.querySelector('[data-exam-topbar]');
      const hdrBtns = topbar ? [...topbar.querySelectorAll('button, a, [role="timer"]')].filter(vis) : [];
      return {
        hdrOff: hdrBtns.filter((el) => { const b = el.getBoundingClientRect(); return b.left < -0.5 || b.right > window.innerWidth + 0.5; }).map((el) => (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 20)),
        hdrDesktopOnly: ['[data-header-label="instructions"]', '[data-header-label="fullscreen"]', '[data-submit-test]'].map((s) => vis(topbar && topbar.querySelector(s))),
        hdrPalette: vis(topbar && topbar.querySelector('[data-palette-open]')),
        titleW: Math.round(topbar?.querySelector('[data-exam-title]')?.getBoundingClientRect().width || 0),
        pageScroll: document.documentElement.scrollHeight - window.innerHeight,
        overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        top: Math.round(box('[data-exam-topbar]')?.height || 0),
        tabsH: Math.round(list?.getBoundingClientRect().height || 0),
        barH: bar ? Math.round(bar.height) : 0,
        barTop: bar ? bar.top : -1,
        barBottom: bar ? bar.bottom : 1e9,
        vh: window.innerHeight,
        tabRows: tops.size,
        tabsFit: list ? list.scrollWidth <= list.clientWidth + 1 : false,
        qScrollable: q ? q.scrollHeight > q.clientHeight : false,
        scrollers,
      };
    });
    const desk = vp.width >= 1024;
    const want = desk ? [60, 52, 68] : [54, 44, 64];
    check(`E-1 ${vp.name}: no page scroll, no sideways overflow`, r.pageScroll <= 0 && r.overflowX <= 0, `page scroll ${r.pageScroll}, overflow ${r.overflowX}`);
    check(
      `E-1 ${vp.name}: top bar — ${desk ? 'Instructions · Full screen · Submit test, no palette button' : 'palette button, desktop-only buttons hidden'}; nothing off screen; title ≥ 64 px`,
      r.hdrOff.length === 0 && r.titleW >= 64 && (desk ? r.hdrDesktopOnly.every(Boolean) && !r.hdrPalette : !r.hdrDesktopOnly.some(Boolean) && r.hdrPalette),
      `off-screen [${r.hdrOff.join(', ')}] · desktop-only ${r.hdrDesktopOnly.map(Number).join('')} · palette ${r.hdrPalette} · title ${r.titleW} px`,
    );
    check(`E-1 ${vp.name}: action bar fully on screen`, r.barTop >= 0 && r.barBottom <= r.vh + 0.5, `bar ${Math.round(r.barTop)}–${Math.round(r.barBottom)} of ${r.vh}`);
    check(`E-1 ${vp.name}: heights top ${want[0]} · tabs ${want[1]} · bar ${want[2]}`, r.top === want[0] && r.tabsH === want[1] && r.barH === want[2], `top ${r.top} · tabs ${r.tabsH} · bar ${r.barH}`);
    check(`E-1 ${vp.name}: only the question scrolls (long passage)`, r.qScrollable && r.scrollers.every((s) => s === 'question' || s === 'palette') && r.scrollers.includes('question'), r.scrollers.join(', '));
    check(`E-1 ${vp.name}: tabs on one row${desk ? ', all visible' : ''}`, r.tabRows === 1 && (!desk || r.tabsFit), `${r.tabRows} row(s)${desk ? `, fit ${r.tabsFit}` : ''}`);
    // scrolling the question keeps the bar and the page still
    const before = await page.locator('[data-action-bar]').boundingBox();
    await page.locator('[data-question-scroll]').evaluate((el) => el.scrollTo(0, el.scrollHeight));
    await page.waitForTimeout(100);
    const after = await page.locator('[data-action-bar]').boundingBox();
    const winY = await page.evaluate(() => window.scrollY);
    check(`E-1 ${vp.name}: scrolling the question moves neither the bar nor the page`, before && after && Math.abs(before.y - after.y) < 1 && winY === 0, `bar Δ ${before && after ? Math.round(after.y - before.y) : '?'}, window ${winY}`);
    if (vp.name === '1366x768') {
      await page.locator('[data-question-scroll]').evaluate((el) => el.scrollTo(0, 0));
      await shot(page, 'desktop-1366-long-passage');
    }
    await ctx.close();
  }

  // ---------------------------------------------------------------- E-2 / E-3 legend, filters, no auto-advance (1366×768)
  {
    const { ctx, page } = await open(VIEWPORTS[1], '?answered=3');
    const l0 = await legend(page);
    const sum = l0 ? Object.values(l0).reduce((a, b) => a + b, 0) : -1;
    check('E-2 legend: 5 states with counts adding up to the section (25)', l0 && Object.keys(l0).length === 5 && sum === 25 && Object.values(l0).every(Number.isFinite), JSON.stringify(l0));
    // go to question 4 (unanswered), choose an option: still question 4 (no auto-advance)
    await page.locator('[data-palette-column] button[aria-label^="Question 4,"]').click();
    const cur = () => page.evaluate(() => document.querySelector('[data-palette-column] [aria-current="true"]')?.getAttribute('aria-label') || '');
    const c4 = await cur();
    await page.locator('[role="radiogroup"] [role="radio"]').nth(1).click();
    await page.waitForTimeout(400);
    const c4b = await cur();
    check('E-3 choosing an option stays on the question (no auto-advance)', /^Question 4,/.test(c4) && /^Question 4,/.test(c4b), `${c4} → ${c4b}`);
    const l1 = await legend(page);
    await page.locator('[data-cbt="save-next"]').click();
    await page.waitForTimeout(300);
    const l2 = await legend(page);
    check('E-2 Save & Next: answered +1', l2.answered === l1.answered + 1 || l2.answered === l0.answered + 1, `answered ${l0.answered} → ${l2.answered}`);
    await page.locator('[data-cbt="mark-next"]').click();
    await page.waitForTimeout(300);
    const l3 = await legend(page);
    check('E-2 Mark for review & next: marked +1', l3.marked === l2.marked + 1, `marked ${l2.marked} → ${l3.marked}`);
    // filters
    const pal = page.locator('[data-palette-column]');
    const fc = await pal.evaluate((el) => Object.fromEntries([...el.querySelectorAll('[data-filter-count]')].map((s) => [s.getAttribute('data-filter-count'), Number(s.textContent)])));
    await pal.locator('[data-filter="marked"]').click();
    const nMarked = await pal.locator('[data-palette-grid] button').count();
    await pal.locator('[data-filter="unanswered"]').click();
    const nUn = await pal.locator('[data-palette-grid] button').count();
    await pal.locator('[data-filter="all"]').click();
    const nAll = await pal.locator('[data-palette-grid] button').count();
    check('E-2 filters with counts narrow the grid', fc.all === 25 && nAll === 25 && nMarked === fc.marked && nUn === fc.unanswered && fc.marked === l3.marked + l3.marked_answered, `${JSON.stringify(fc)} → grid ${nAll}/${nUn}/${nMarked}`);
    check('E-2 no "Go to question" on screen', (await page.getByText(/go to question/i).count()) === 0);
    // E-6 keyboard: tabs + radio group
    const tab0 = page.locator('[role="tab"][aria-selected="true"]');
    await tab0.focus();
    await page.keyboard.press('ArrowRight');
    const focusName = await page.evaluate(() => (document.activeElement?.getAttribute('role') === 'tab' ? document.activeElement.textContent : ''));
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    const selName = await page.locator('[role="tab"][aria-selected="true"]').innerText();
    check('E-6 tabs: ArrowRight moves focus to the next tab, Enter opens it (manual activation)', /General Awareness/.test(focusName) && /General Awareness/.test(selName), `${focusName.replace(/\s+/g, ' ')} → ${selName.replace(/\s+/g, ' ')}`);
    const radios = page.locator('[role="radiogroup"] [role="radio"]');
    await radios.nth(0).focus();
    await page.keyboard.press('ArrowDown');
    const focusedIdx = await page.evaluate(() => [...document.querySelectorAll('[role="radiogroup"] [role="radio"]')].indexOf(document.activeElement));
    check('E-6 options: a radio group, ArrowDown moves', focusedIdx === 1 && (await radios.count()) === 4, `focus on option ${focusedIdx}`);
    // E-7 targets at desktop
    const small = await page.evaluate(() =>
      [...document.querySelectorAll('[data-exam-layout] button, [data-exam-layout] a')]
        .filter((el) => el.getClientRects().length > 0)
        .map((el) => ({ t: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 28), h: Math.round(el.getBoundingClientRect().height), w: Math.round(el.getBoundingClientRect().width) }))
        .filter((b) => b.h < 44 || b.w < 44),
    );
    check('E-7 desktop targets ≥ 44 px', small.length === 0, small.slice(0, 6).map((b) => `${b.t} ${b.w}×${b.h}`).join('; '));
    await ctx.close();
  }

  // ---------------------------------------------------------------- E-4 timer (fake clock), desktop 1366×768
  {
    const { ctx, page } = await open(VIEWPORTS[1], '?remaining=303&answered=6', { clock: true });
    const timer = page.locator('[data-exam-topbar] [role="timer"]');
    const state = () =>
      timer.evaluate((el) => ({ tone: el.getAttribute('data-timer-tone'), bg: getComputedStyle(el).backgroundColor, color: getComputedStyle(el).color, announce: el.querySelector('[data-timer-announce]')?.textContent || '', label: el.getAttribute('aria-label'), anim: el.getAnimations({ subtree: true }).length }));
    const s0 = await state();
    await shot(page, 'desktop-1366-timer-normal');
    await page.clock.runFor(5000);
    const s1 = await state();
    await page.mouse.move(5, 5);
    await shot(page, 'desktop-1366-timer-amber');
    await page.clock.runFor(236000);
    const s2 = await state();
    await page.clock.runFor(5000);
    const s3 = await state();
    await shot(page, 'desktop-1366-timer-red');
    check('E-4 timer normal above 5:00 (no announcement)', s0.tone === 'normal' && s0.announce === '' && /Time left: 05:0[23]/.test(s0.label), `${s0.tone} · "${s0.label}"`);
    check('E-4 amber at ≤ 5:00 with the token colours + "5 minutes left."', s1.tone === 'amber' && s1.bg === TOKENS.amberTint && s1.color === TOKENS.amberText && s1.announce === '5 minutes left.', `${s1.tone} ${s1.bg} ${s1.color} "${s1.announce}"`);
    check('E-4 still amber at 1:0x, announcement unchanged (no per-second chatter)', s2.tone === 'amber' && s2.announce === '5 minutes left.' && /Time left: 01:0\d/.test(s2.label),`${s2.tone} "${s2.label}"`);
    check('E-4 red at ≤ 1:00 with the token colours + "1 minute left."', s3.tone === 'red' && s3.bg === TOKENS.redTint && s3.color === TOKENS.redText && s3.announce === '1 minute left.', `${s3.tone} ${s3.bg} ${s3.color} "${s3.announce}"`);
    check('E-4 no flashing (no running animation on the timer)', [s0, s1, s3].every((s) => s.anim === 0));
    await ctx.close();
  }

  // ---------------------------------------------------------------- E-5 phone sheet + E-7 phone targets (390×844)
  {
    const { ctx, page } = await open(VIEWPORTS[4], '?answered=5');
    await shot(page, 'phone-390-question');
    const small = await page.evaluate(() =>
      [...document.querySelectorAll('[data-action-bar] button, [data-exam-topbar] button')]
        .filter((el) => el.getClientRects().length > 0)
        .map((el) => ({ t: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 24), h: Math.round(el.getBoundingClientRect().height), w: Math.round(el.getBoundingClientRect().width) }))
        .filter((b) => b.h < 48 || b.w < 48),
    );
    check('E-7 phone action bar + top bar targets ≥ 48 px', small.length === 0, small.map((b) => `${b.t} ${b.w}×${b.h}`).join('; '));
    const phoneLabels = await page.locator('[data-cbt-phone]').evaluateAll((els) => els.filter((e) => e.getClientRects().length > 0).map((e) => e.getAttribute('aria-label') || e.textContent.trim()));
    check('E-5 phone bar: Previous · Mark · Clear (labelled icons) + Save & Next', phoneLabels.length === 4 && /Previous/.test(phoneLabels[0]) && /Mark for review/.test(phoneLabels[1]) && /Clear response/.test(phoneLabels[2]) && /Save & Next/.test(phoneLabels[3]), phoneLabels.join(' · '));
    const opener = page.locator('[data-palette-open]');
    await opener.click();
    const sheet = page.locator('[data-palette-sheet]');
    await sheet.waitFor({ state: 'visible' });
    await page.waitForTimeout(250);
    await shot(page, 'phone-390-palette-sheet');
    const sheetHas = await sheet.evaluate((el) => ({ legend: !!el.querySelector('[data-palette-legend]'), filters: !!el.querySelector('[data-palette-filters]'), grid: el.querySelectorAll('[data-palette-grid] button').length, submit: !!el.querySelector('[data-submit-test-sheet]'), text: el.textContent }));
    check('E-5 sheet: legend, filters, grid, Submit test, Instructions, Full screen', sheetHas.legend && sheetHas.filters && sheetHas.grid === 25 && sheetHas.submit && /Instructions/.test(sheetHas.text) && /Full screen/.test(sheetHas.text), `grid ${sheetHas.grid}`);
    const cells = await sheet.locator('[data-palette-grid] button').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
    check('E-7 sheet palette cells ≥ 48 px', cells.every((h) => h >= 48), `min ${Math.min(...cells)}`);
    let inside = true;
    let inDialog = 0;
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab');
      // native modal <dialog> (showModal): the page behind is inert — focus is inside the dialog or, between cycles, in
      // the browser itself (document.body); never on an element of the page behind
      const where = await page.evaluate(() => { const a = document.activeElement; return !a ? 'none' : a.closest('dialog[open]') ? 'dialog' : a === document.body ? 'browser' : 'page'; });
      if (where === 'dialog') inDialog++;
      inside = inside && (where === 'dialog' || where === 'browser');
    }
    check('E-5 focus stays inside the sheet (40 × Tab, never on the page behind)', inside && inDialog >= 36, `${inDialog}/40 in the sheet`);
    await page.keyboard.press('Escape');
    await sheet.waitFor({ state: 'hidden' });
    const back = await page.evaluate(() => document.activeElement?.hasAttribute('data-palette-open'));
    check('E-5 Esc closes the sheet and returns focus to the palette button', back);
    await opener.click();
    await sheet.waitFor({ state: 'visible' });
    await page.locator('[data-submit-test-sheet]').click();
    const confirm = page.getByRole('dialog', { name: 'Submit your test?' });
    await confirm.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    check('E-5 Submit test opens the existing confirmation (sheet closed)', (await confirm.isVisible()) && !(await sheet.isVisible()));
    check('E-9 nothing submitted (the confirmation only opened)', net.submits === 0, `submit calls ${net.submits}`);
    await ctx.close();
  }

  // ---------------------------------------------------------------- E-7 reduced motion
  {
    const { ctx, page } = await open(VIEWPORTS[4], '', { reducedMotion: 'reduce' });
    await page.locator('[data-palette-open]').click();
    await page.locator('[data-palette-sheet]').waitFor({ state: 'visible' });
    const anims = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length);
    check('E-7 reduced motion: no running animation (sheet open)', anims === 0, `${anims} running`);
    await ctx.close();
  }

  // ---------------------------------------------------------------- E-8 CLS
  for (const vp of [VIEWPORTS[1], VIEWPORTS[4]]) {
    const { ctx, page } = await open(vp, '?answered=2');
    await page.locator(vp.width >= 1024 ? '[data-cbt="save-next"]' : '[data-cbt-phone="save-next"]').click();
    await page.waitForTimeout(400);
    await page.locator('[role="tab"]').nth(2).click();
    await page.waitForTimeout(600);
    const cls = await page.evaluate(() => window.__cls);
    check(`E-8 CLS < 0.1 at ${vp.name} (load → start → navigate)`, cls < 0.1, cls.toFixed(4));
    await ctx.close();
  }

  check('E-9 no request left this machine', net.external === 0, `${net.external} external`);
  check('E-9 every /api/assessment call answered by the check (none reached the server)', Object.keys(net.api).length > 0, Object.entries(net.api).map(([k, v]) => `${k} ${v}`).join(', '));
  await browser.close();
  console.log(`\nEXAM-UX-1 pages: ${passes}/${passes + fails} passed`);
  process.exit(fails ? 1 : 0);
})().catch((e) => {
  console.error(`EXAM-UX-1 pages: error — ${String(e && e.message).slice(0, 300)}`);
  process.exit(1);
});
