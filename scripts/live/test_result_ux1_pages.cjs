#!/usr/bin/env node
/**
 * RESULT-UX-1 page checks — the REAL result view inside THE student shell, in a real browser, against a LOCAL fixture
 * build only:  EXAM_UX_FIXTURE=1 npx next build && EXAM_UX_FIXTURE=1 npx next start -p 3107
 * (route /dev/result-fixture: a made-up attempt, no session, no database; nothing is sent anywhere)
 *   P-1 five viewports (1366×768, 1920×1080, 768×1024, 390×844, 360×740): no horizontal page scroll; one h1; page order;
 *       CLS < 0.1 (load + scroll to the end); no emoji in the rendered text
 *   P-2 phones / tablet (< 1024 px): the result bar sits exactly ON the student nav (stacked, both visible), and the
 *       bar never covers content (the last content ends above the bar)
 *   P-3 review mode (390 / 360): "Review N mistakes" opens one question per screen on Wrong; the student nav is hidden;
 *       Prev · 1 / N · Next wrong; the explanation and the Learn button are in view on the card; back returns to the
 *       summary at the same scroll position and the nav comes back
 *   P-4 desktop review: filters + section written to the URL (and restored on reload); rows expand / collapse with
 *       aria-expanded; Next wrong moves to the next wrong question; keyboard reaches the filters and expanders with a
 *       visible focus ring; past attempts collapsed by default
 *   P-5 the chart has a text alternative; reduced motion = no running animation
 * --shots → JPEG screenshots in docs/design/screens/result-ux-1/ (synthetic fixture only: no personal data)
 * Usage: node scripts/live/test_result_ux1_pages.cjs http://localhost:3107 [--shots]
 */
const fs = require('fs');
const path = require('path');

const BASE = (process.argv.find((a) => /^https?:\/\//.test(a)) || 'http://localhost:3107').replace(/\/$/, '');
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(BASE).hostname)) throw new Error('runs against a local build only');
const SHOTS = process.argv.includes('--shots');
const SHOT_DIR = path.join(__dirname, '..', '..', 'docs', 'design', 'screens', 'result-ux-1');
const FIXTURE = '/dev/result-fixture';
const VIEWPORTS = [
  { name: '1366x768', width: 1366, height: 768 },
  { name: '1920x1080', width: 1920, height: 1080 },
  { name: '768x1024', width: 768, height: 1024 },
  { name: '390x844', width: 390, height: 844 },
  { name: '360x740', width: 360, height: 740 },
];
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{2712}\u{2714}\u{2716}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/u;

let fails = 0;
let passes = 0;
const check = (name, ok, info) => {
  if (ok) passes++;
  else fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? ' — ' + info : ''}`);
};
const isLocal = (u) => {
  try {
    return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(u).hostname) || u.startsWith('data:') || u.startsWith('blob:');
  } catch {
    return true;
  }
};

(async () => {
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  if (SHOTS) fs.mkdirSync(SHOT_DIR, { recursive: true });
  let external = 0;
  const open = async (vp, query = '', opts = {}) => {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.width < 768, hasTouch: vp.width < 768, reducedMotion: opts.reducedMotion || 'no-preference' });
    const page = await ctx.newPage();
    page.on('request', (r) => {
      if (!isLocal(r.url())) external++;
    });
    await page.addInitScript(() => {
      window.__cls = 0;
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
      }).observe({ type: 'layout-shift', buffered: true });
    });
    const resp = await page.goto(`${BASE}${FIXTURE}${query}`, { waitUntil: 'load', timeout: 120000 });
    if (!resp || resp.status() !== 200) throw new Error(`fixture answered ${resp && resp.status()} — build and start with EXAM_UX_FIXTURE=1`);
    await page.locator('[data-result-ux="v1"]').waitFor({ timeout: 30000 });
    await page.waitForTimeout(300);
    return { ctx, page };
  };
  const shot = async (page, name, full = false) => {
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, `${name}.jpg`), type: 'jpeg', quality: 72, fullPage: full });
  };

  // ---------------------------------------------------------------- P-1 / P-2 viewports
  for (const vp of VIEWPORTS) {
    const { ctx, page } = await open(vp);
    await shot(page, `result-${vp.name}`);
    const r = await page.evaluate(async () => {
      const h1 = document.querySelectorAll('h1').length;
      const order = [...document.querySelectorAll('[data-result-section]')].map((e) => e.getAttribute('data-result-section'));
      const text = document.body.innerText;
      // scroll to the end in steps (CLS during scroll)
      for (let y = 0; y < document.documentElement.scrollHeight; y += 600) {
        window.scrollTo(0, y);
        await new Promise((res) => setTimeout(res, 30));
      }
      window.scrollTo(0, document.documentElement.scrollHeight);
      await new Promise((res) => setTimeout(res, 200));
      const vis = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).display !== 'none';
      const bar = document.querySelector('[data-result-bar="summary"]');
      const nav = document.querySelector('.cl-ss__bar');
      const sections = [...document.querySelectorAll('[data-result-section]')];
      const last = sections[sections.length - 1];
      // nothing (e.g. the nav's raised centre button) may sit on the bar's button
      const btn = bar && bar.querySelector('button');
      const br = btn && vis(btn) ? btn.getBoundingClientRect() : null;
      const pts = br ? [[0.5, 0.5], [0.1, 0.5], [0.9, 0.5]].map(([fx, fy]) => document.elementFromPoint(br.left + br.width * fx, br.top + br.height * fy)) : [];
      return {
        barButtonOnTop: br ? pts.every((el) => el && btn.contains(el)) : null,
        h1,
        order,
        text,
        overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        bar: vis(bar) ? bar.getBoundingClientRect().toJSON() : null,
        nav: vis(nav) ? nav.getBoundingClientRect().toJSON() : null,
        lastBottom: last ? last.getBoundingClientRect().bottom : 0,
        cls: window.__cls,
      };
    });
    const phone = vp.width < 1024;
    check(`P-1 ${vp.name}: no horizontal page scroll`, r.overflowX <= 0, `overflow ${r.overflowX}`);
    check(`P-1 ${vp.name}: one h1, page order`, r.h1 === 1 && r.order.join(',') === 'summary,next-steps,weak-topics,sections,review,past-attempts', `h1 ${r.h1} · ${r.order.join(' → ')}`);
    check(`P-1 ${vp.name}: CLS < 0.1 (load + scroll)`, r.cls < 0.1, r.cls.toFixed(4));
    check(`P-1 ${vp.name}: no emoji in the page`, !EMOJI.test(r.text));
    if (phone) {
      check(`P-2 ${vp.name}: result bar stacked exactly on the student nav (both visible)`, r.bar && r.nav && Math.abs(r.bar.bottom - r.nav.top) <= 1, r.bar && r.nav ? `bar ${Math.round(r.bar.top)}–${Math.round(r.bar.bottom)} · nav ${Math.round(r.nav.top)}` : `bar ${!!r.bar} nav ${!!r.nav}`);
      check(`P-2 ${vp.name}: nothing covers the bar's button (the nav's raised centre button stays clear)`, r.barButtonOnTop === true, String(r.barButtonOnTop));
      check(`P-2 ${vp.name}: the bar never covers content (end of page)`, r.bar && r.lastBottom <= r.bar.top + 0.5, r.bar ? `last content ends ${Math.round(r.lastBottom)} · bar top ${Math.round(r.bar.top)}` : 'no bar');
    } else {
      check(`P-2 ${vp.name}: no phone bar on desktop`, !r.bar && !r.nav);
    }
    await ctx.close();
  }

  // ---------------------------------------------------------------- P-3 phone review mode
  for (const vp of [VIEWPORTS[3], VIEWPORTS[4]]) {
    const { ctx, page } = await open(vp);
    await page.locator('#weak-topics').scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    const y0 = await page.evaluate(() => window.scrollY);
    const label = await page.locator('[data-result-bar="summary"] button').innerText();
    await page.locator('[data-result-bar="summary"] button').click();
    await page.locator('[data-review-mode]').waitFor();
    await page.waitForTimeout(250);
    const m = await page.evaluate(() => {
      const vis = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).display !== 'none';
      const view = document.querySelector('[data-review-mode]');
      const card = view.querySelector('[data-review-card]');
      const bar = document.querySelector('[data-result-bar="review"]').getBoundingClientRect();
      return {
        url: location.search,
        navVisible: vis(document.querySelector('.cl-ss__bar')),
        cards: view.querySelectorAll('[data-review-card]').length,
        state: card && card.getAttribute('data-review-card'),
        counter: view.querySelector('[data-review-counter]').textContent,
        barBottom: bar.bottom,
        vh: window.innerHeight,
        explanation: !!card.querySelector('[data-explanation]'),
        learn: !!card.querySelector('[data-learn-button]'),
        summaryHidden: !vis(document.querySelector('[data-result-section="summary"]')),
      };
    });
    const total = Number((label.match(/\d+/) || [])[0]);
    check(`P-3 ${vp.name}: "${label}" opens review mode on Wrong`, /review=1/.test(m.url) && /filter=wrong/.test(m.url) && m.cards === 1 && m.state === 'wrong' && m.summaryHidden, `${m.url} · ${m.state}`);
    check(`P-3 ${vp.name}: student nav hidden; review bar at the bottom`, !m.navVisible && Math.abs(m.barBottom - m.vh) <= 1, `nav ${m.navVisible} · bar bottom ${Math.round(m.barBottom)} / ${m.vh}`);
    check(`P-3 ${vp.name}: counter 1 / ${total}; explanation + Learn on the card`, m.counter === `1 / ${total}` && m.explanation && m.learn, m.counter);
    if (vp.name === '390x844') await shot(page, 'phone-390-review-mode');
    if (vp.name === '390x844') await shot(page, 'phone-390-review-mode-full', true);
    await page.locator('[data-review-next]').click();
    await page.waitForTimeout(200);
    const c2 = await page.locator('[data-review-counter]').innerText();
    await page.locator('[data-review-prev]').click();
    await page.waitForTimeout(200);
    const c3 = await page.locator('[data-review-counter]').innerText();
    check(`P-3 ${vp.name}: Next wrong / Prev`, c2 === `2 / ${total}` && c3 === `1 / ${total}`, `${c2} → ${c3}`);
    await page.locator('[data-review-back]').click();
    await page.locator('[data-result-section="summary"]').waitFor({ state: 'visible' });
    await page.waitForTimeout(300);
    const back = await page.evaluate(() => ({ y: window.scrollY, url: location.search, nav: getComputedStyle(document.querySelector('.cl-ss__bar')).display !== 'none' }));
    check(`P-3 ${vp.name}: back → the summary at the same scroll position, nav back`, Math.abs(back.y - y0) <= 2 && !/review=1/.test(back.url) && back.nav, `y ${y0} → ${back.y} · ${back.url || '(no query)'}`);
    await ctx.close();
  }

  // ---------------------------------------------------------------- P-4 desktop review
  {
    const { ctx, page } = await open(VIEWPORTS[0]);
    const def = await page.locator('[data-review-filters] [aria-pressed="true"]').getAttribute('data-filter');
    check('P-4 opens on Wrong', def === 'wrong', def);
    await page.evaluate(() => document.getElementById('review').scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(300);
    const activeChip = await page.locator('[data-jump-bar] a[aria-current="location"]').innerText();
    check('P-4 the active jump chip follows the scroll', activeChip === 'Question review', activeChip);
    const blankRows = await page.evaluate(() => [...document.querySelectorAll('[data-review-row]')].slice(0, 5).filter((r) => !r.innerText.trim()).length);
    check('P-4 collapsed rows paint their content', blankRows === 0, `${blankRows} blank`);
    await shot(page, 'desktop-1366-review');
    // keyboard: focus the Skipped filter with Tab, press Enter
    await page.locator('[data-review-filters] [data-filter="wrong"]').focus();
    await page.keyboard.press('Tab');
    const ring = await page.evaluate(() => {
      const a = document.activeElement;
      const s = getComputedStyle(a);
      return { f: a.getAttribute('data-filter'), ring: s.outlineStyle !== 'none' || (s.boxShadow && s.boxShadow !== 'none') };
    });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    const url1 = await page.evaluate(() => location.search);
    check('P-4 keyboard reaches a filter (focus ring) and Enter applies it; the filter is in the URL', ring.f === 'skipped' && ring.ring && /filter=skipped/.test(url1), `${ring.f} ring ${ring.ring} · ${url1}`);
    await page.locator('[data-section-filter] button', { hasText: 'Quant' }).click();
    await page.waitForTimeout(200);
    const url2 = await page.evaluate(() => location.search);
    await page.reload({ waitUntil: 'load' });
    await page.locator('[data-result-ux="v1"]').waitFor();
    const restored = await page.evaluate(() => ({ f: document.querySelector('[data-review-filters] [aria-pressed="true"]')?.getAttribute('data-filter'), s: document.querySelector('[data-section-filter] [aria-pressed="true"]')?.textContent }));
    check('P-4 filter + section in the URL, restored on reload', /filter=skipped/.test(url2) && /section=Quant/.test(url2) && restored.f === 'skipped' && restored.s === 'Quant', `${url2} → ${JSON.stringify(restored)}`);
    // expanders
    await page.goto(`${BASE}${FIXTURE}?filter=wrong`, { waitUntil: 'load' });
    await page.locator('[data-result-ux="v1"]').waitFor();
    const row = page.locator('[data-review-row]').first();
    const before = await row.getAttribute('aria-expanded');
    await row.focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(150);
    const cards = await page.locator('[data-review-card]').count();
    const collapse = page.locator('button[aria-label^="Collapse question"][aria-expanded="true"]');
    check('P-4 rows expand from the keyboard; expanded cards carry aria-expanded="true"', before === 'false' && cards === 2 && (await collapse.count()) === 2, `cards ${cards}`);
    // Next wrong
    const firstCard = page.locator('[data-review-card]').first();
    const h1 = await firstCard.locator('h3').innerText();
    await firstCard.locator('[data-next-wrong]').click();
    await page.waitForTimeout(400);
    const headings = await page.locator('[data-review-card] h3').allInnerTexts();
    check('P-4 Next wrong opens the next wrong question', !headings.includes(h1) && headings.length >= 1, `${h1.split('·')[0].trim()} → ${headings.map((t) => t.split('·')[0].trim()).join(', ')}`);
    const past = await page.evaluate(() => ({ exp: document.querySelector('[aria-controls="past-list"]')?.getAttribute('aria-expanded'), hidden: document.getElementById('past-list')?.hidden }));
    check('P-4 past attempts collapsed by default', past.exp === 'false' && past.hidden === true, JSON.stringify(past));
    // P-5 chart text alternative
    const alt = await page.evaluate(() => ({ cap: document.querySelector('[data-trend-chart] table caption')?.textContent, rows: document.querySelectorAll('[data-trend-chart] table tbody tr').length, svgHidden: document.querySelector('[data-trend-chart] svg')?.getAttribute('aria-hidden') }));
    check('P-5 chart text alternative (table) and the SVG is decoration', alt.cap && alt.rows >= 2 && alt.svgHidden === 'true', JSON.stringify(alt));
    await ctx.close();
  }

  // ---------------------------------------------------------------- P-5 reduced motion + first attempt
  {
    const { ctx, page } = await open(VIEWPORTS[3], '', { reducedMotion: 'reduce' });
    await page.locator('[data-result-bar="summary"] button').click();
    await page.locator('[data-review-mode]').waitFor();
    const anims = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length);
    check('P-5 reduced motion: no running animation', anims === 0, `${anims}`);
    await ctx.close();
    const f = await open(VIEWPORTS[0], '?first=1&nowrong=1');
    const fr = await f.page.evaluate(() => ({ delta: !!document.querySelector('[data-delta]'), empty: !!document.querySelector('[data-trend-empty]'), past: !!document.querySelector('[data-result-section="past-attempts"]'), def: document.querySelector('[data-review-filters] [aria-pressed="true"]')?.getAttribute('data-filter') }));
    check('P-5 first attempt, no wrong: no delta / trend / past attempts; review opens on All', !fr.delta && fr.empty && !fr.past && fr.def === 'all', JSON.stringify(fr));
    await f.ctx.close();
  }

  check('P-6 no request left this machine', external === 0, `${external} external`);
  await browser.close();
  console.log(`\nRESULT-UX-1 pages: ${passes}/${passes + fails} passed`);
  process.exit(fails ? 1 : 0);
})().catch((e) => {
  console.error(`RESULT-UX-1 pages: error — ${String(e && e.message).slice(0, 400)}`);
  process.exit(1);
});
