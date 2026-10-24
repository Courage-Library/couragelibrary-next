/**
 * UX-1b accessibility suite for the app shells (public + signed-in student). Playwright + in-page checks
 * (no axe in the repo; no new dependency).
 *
 * LOCAL ONLY: signs in as the permanent qa-student identity (.env.local QA_STUDENT_PASSWORD) and refuses
 * any non-localhost base URL. Signed-in production checks are run by the owner.
 *
 * At 390, 768 and 1440 px, public (/, /exams) and student (/dashboard, /mistakes):
 *   S-1 landmarks: one banner, one main#main-content, one contentinfo; every nav landmark has a unique name
 *   S-2 skip link: the first Tab stop, visible when focused, moves focus to <main>
 *   S-3 shell names / text size / contrast: every link and button in header, footer and bottom nav is named,
 *       no text below 12 px, text contrast ≥ 4.5:1 (3:1 large)
 *   S-4 shell fits: header, footer and bottom nav never overflow the viewport horizontally
 *   S-5 bottom nav: on phones / tablets for the student only (5 labelled items, aria-current on the active
 *       route, ≥44 px targets), hidden from 1440; never shown signed out; does not cover the footer
 *   S-6 layout stability: cumulative layout shift of the loaded page ≤ 0.1
 * Interactions:
 *   S-7 (1440) keyboard: Learn menu opens with Enter, its links are reachable, Esc closes it and focus returns;
 *       the student account menu works the same way and contains Sign out
 *   S-8 (390) mobile menu: a modal dialog named "Menu", focus moves in and stays in, Esc closes and focus
 *       returns to the menu button
 *   S-9 (390) account sheet from the bottom nav: dialog named "Account" with Sign out; Esc closes
 *
 * Run: node scripts/test_ux1b_shell_a11y.cjs [http://localhost:3100]
 */
const { chromium } = require('playwright');
const { readEnv } = require('./db/_db-env.cjs');

const BASE = (process.argv.slice(2).find((a) => /^https?:/.test(a)) || 'http://localhost:3100').replace(/\/$/, '');
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(BASE).hostname)) {
  console.error('refused: this suite signs in with a QA identity and runs against a local build only');
  process.exit(2);
}

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try {
    const info = await fn();
    passed++;
    console.log(`  PASS  ${name}${info ? ' — ' + info : ''}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL  ${name}\n        ${String(e && e.message ? e.message : e).slice(0, 3000)}`);
  }
}
const assert = (c, m) => {
  if (!c) throw new Error(m || 'assertion failed');
};

/** In-page shell audit. */
function shellAudit() {
  const out = { banner: 0, main: 0, mainId: false, contentinfo: 0, navNames: [], unnamed: [], small: [], contrast: [], overflow: [] };
  const visible = (el) => {
    if (el.closest('[hidden]')) return false;
    for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (s.display === 'none' || s.visibility === 'hidden' || parseFloat(s.opacity) === 0) return false;
    }
    const r = el.getBoundingClientRect();
    return r.width > 0 || r.height > 0;
  };
  const isSr = (el) => {
    for (let e = el; e && e !== document.body; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (s.position === 'absolute' && (s.clip === 'rect(0px, 0px, 0px, 0px)' || s.clipPath === 'inset(50%)')) return true;
    }
    return false;
  };
  const top = [...document.querySelectorAll('header, main, footer')].filter((e) => !e.parentElement.closest('header, main, footer, article, aside, section, nav'));
  out.banner = top.filter((e) => e.tagName === 'HEADER' && visible(e)).length;
  out.main = document.querySelectorAll('main').length;
  out.mainId = Boolean(document.querySelector('main#main-content'));
  out.contentinfo = top.filter((e) => e.tagName === 'FOOTER' && visible(e)).length;
  const navs = [...document.querySelectorAll('nav')].filter((n) => visible(n) && (n.closest('body > header, header.sticky, footer, nav[aria-label=Student]') || n.matches('nav[aria-label=Student]')));
  out.navNames = navs.map((n) => n.getAttribute('aria-label') || '');

  const regions = [...document.querySelectorAll('header.sticky, footer, nav[aria-label=Student]')].filter(visible);
  const parse = (c) => {
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillStyle = c;
    const v = ctx.fillStyle;
    if (v.startsWith('#')) {
      const n = parseInt(v.slice(1), 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
    }
    const m = v.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
    return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]] : null;
  };
  const blend = (f, b) => [0, 1, 2].map((i) => f[i] * f[3] + b[i] * (1 - f[3])).concat(1);
  const bgOf = (el) => {
    const layers = [];
    for (let e = el; e; e = e.parentElement) {
      const c = parse(getComputedStyle(e).backgroundColor);
      if (c && c[3] > 0) {
        layers.push(c);
        if (c[3] >= 1) break;
      }
    }
    let acc = [255, 255, 255, 1];
    for (const l of layers.reverse()) acc = blend(l, acc);
    return acc;
  };
  const lum = (c) => c.slice(0, 3).map((x) => x / 255).map((s) => (s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4)).reduce((a, s, i) => a + s * [0.2126, 0.7152, 0.0722][i], 0);
  const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };
  const nameOf = (el) => (el.getAttribute('aria-label') || el.textContent || el.querySelector('img[alt]')?.getAttribute('alt') || '').trim();
  for (const r of regions) {
    const rect = r.getBoundingClientRect();
    if (rect.right > window.innerWidth + 1 || r.scrollWidth > r.clientWidth + 1) out.overflow.push(`${r.tagName.toLowerCase()} ${Math.round(rect.right)} / ${window.innerWidth}`);
    for (const el of r.querySelectorAll('a[href], button')) if (visible(el) && !nameOf(el)) out.unnamed.push(el.outerHTML.slice(0, 120));
    const w = document.createTreeWalker(r, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const el = n.parentElement;
      if (!n.textContent.trim() || !visible(el) || isSr(el)) continue;
      const s = getComputedStyle(el);
      const px = parseFloat(s.fontSize);
      if (px < 12) out.small.push(`${px}px "${n.textContent.trim().slice(0, 30)}"`);
      const fg = parse(s.color);
      const bg = bgOf(el);
      const rr = ratio(fg[3] < 1 ? blend(fg, bg) : fg, bg);
      const large = px >= 24 || (px >= 18.66 && parseInt(s.fontWeight, 10) >= 700);
      if (rr < (large ? 3 : 4.5)) out.contrast.push(`${rr.toFixed(2)}:1 "${n.textContent.trim().slice(0, 30)}"`);
    }
  }
  return out;
}

// CI-FIX-1 (#74): CAPTCHA-safe QA session cookies (no login form; scripts/live/qa-session.cjs). `env` is unused.
// eslint-disable-next-line no-unused-vars
async function signIn(page, env) {
  await require('./live/qa-session.cjs').qaBrowserLogin(page.context(), 'qa-student@courage-library.test', BASE);
}

const CLS = `window.__cls = 0; new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true });`;

(async () => {
  console.log(`UX-1b shell a11y — ${BASE}`);
  const env = readEnv();
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const anonCtx = await browser.newContext();
  const stuCtx = await browser.newContext();
  await anonCtx.addInitScript(CLS);
  await stuCtx.addInitScript(CLS);
  const login = await stuCtx.newPage();
  try {
    await signIn(login, env);
    await login.close();
    const CASES = [
      ['anon', anonCtx, '/'],
      ['anon', anonCtx, '/exams'],
      ['student', stuCtx, '/dashboard'],
      ['student', stuCtx, '/mistakes'],
    ];
    for (const width of [390, 768, 1440]) {
      for (const [who, ctx, route] of CASES) {
        const page = await ctx.newPage();
        await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
        await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 120000 });
        await page.waitForTimeout(500);
        const tag = `@${width} ${who} ${route}`;
        const a = await page.evaluate(shellAudit);
        await test(`S-1 ${tag}: landmarks (one banner / main#main-content / contentinfo; unique nav names)`, async () => {
          assert(a.banner === 1 && a.main === 1 && a.mainId && a.contentinfo === 1, JSON.stringify({ banner: a.banner, main: a.main, mainId: a.mainId, contentinfo: a.contentinfo }));
          assert(a.navNames.every(Boolean), `unnamed nav: ${JSON.stringify(a.navNames)}`);
          assert(new Set(a.navNames).size === a.navNames.length, `duplicate nav names: ${JSON.stringify(a.navNames)}`);
        });
        await test(`S-2 ${tag}: skip link is the first Tab stop and moves focus to main`, async () => {
          await page.evaluate(() => {
            window.scrollTo(0, 0);
            document.activeElement && document.activeElement.blur();
          });
          await page.keyboard.press('Tab');
          const first = await page.evaluate(() => {
            const el = document.activeElement;
            const r = el.getBoundingClientRect();
            return { text: el.textContent.trim(), href: el.getAttribute('href'), visible: r.width > 1 && r.height > 1 && r.top >= 0 };
          });
          assert(first.text === 'Skip to content' && first.href === '#main-content' && first.visible, JSON.stringify(first));
          await page.keyboard.press('Enter');
          await page.waitForTimeout(150);
          const now = await page.evaluate(() => document.activeElement && document.activeElement.id);
          assert(now === 'main-content', `focus after skip: ${now}`);
        });
        await test(`S-3 ${tag}: shell controls named, text ≥12px, contrast passes`, async () => {
          assert(a.unnamed.length === 0, `unnamed: ${a.unnamed.join(' | ')}`);
          assert(a.small.length === 0, `small: ${a.small.join(' | ')}`);
          assert(a.contrast.length === 0, `contrast: ${a.contrast.join(' | ')}`);
        });
        await test(`S-4 ${tag}: header, footer and bottom nav fit the viewport`, async () => assert(a.overflow.length === 0, a.overflow.join(', ')));
        await test(`S-5 ${tag}: bottom nav only for students below 1440`, async () => {
          const nav = page.locator('nav[aria-label="Student"]');
          const shown = await nav.isVisible().catch(() => false);
          if (who === 'anon' || width === 1440) {
            assert(!shown, 'bottom nav should not be visible');
            return;
          }
          assert(shown, 'bottom nav missing');
          const items = await nav.evaluate((n) =>
            [...n.querySelectorAll('a, button')].map((e) => ({ name: e.textContent.trim(), current: e.getAttribute('aria-current'), h: e.getBoundingClientRect().height, w: e.getBoundingClientRect().width })),
          );
          assert(items.length === 5, `items: ${items.map((i) => i.name).join(', ')}`);
          assert(items.every((i) => i.h >= 44 && i.w >= 44), `small targets: ${JSON.stringify(items)}`);
          const cur = items.filter((i) => i.current === 'page').map((i) => i.name);
          const want = route === '/dashboard' ? 'Dashboard' : 'Mistakes';
          assert(cur.length === 1 && cur[0] === want, `aria-current on ${JSON.stringify(cur)} (expected ${want})`);
          await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
          await page.waitForTimeout(150);
          const covered = await page.evaluate(() => {
            const f = document.querySelector('footer').getBoundingClientRect();
            const n = document.querySelector('nav[aria-label="Student"]').getBoundingClientRect();
            return f.bottom > n.top + 1;
          });
          assert(!covered, 'the bottom nav covers the footer at the end of the page');
        });
        await test(`S-6 ${tag}: layout shift ≤ 0.1`, async () => {
          const cls = await page.evaluate(() => window.__cls || 0);
          assert(cls <= 0.1, `CLS ${cls.toFixed(3)}`);
          return `CLS ${cls.toFixed(3)}`;
        });
        await page.close();
      }
    }

    // ---- interactions
    await test('S-7 @1440 keyboard: Learn menu (anon) and account menu (student) open, Esc closes, focus returns', async () => {
      const p = await anonCtx.newPage();
      await p.setViewportSize({ width: 1440, height: 1000 });
      await p.goto(BASE + '/exams', { waitUntil: 'networkidle', timeout: 120000 });
      const learn = p.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Learn' });
      await learn.focus();
      await p.keyboard.press('Enter');
      assert((await learn.getAttribute('aria-expanded')) === 'true', 'Learn did not open');
      const panel = p.locator(`[id="${await learn.getAttribute('aria-controls')}"]`);
      assert(await panel.isVisible(), 'panel hidden');
      await p.keyboard.press('Tab');
      const inPanel = await p.evaluate((id) => Boolean(document.activeElement.closest(`[id="${id}"]`)), await learn.getAttribute('aria-controls'));
      assert(inPanel, 'Tab did not move into the open Learn menu');
      await p.keyboard.press('Escape');
      assert((await learn.getAttribute('aria-expanded')) === 'false', 'Esc did not close');
      assert(await learn.evaluate((b) => b === document.activeElement), 'focus did not return to Learn');
      await p.close();

      const s = await stuCtx.newPage();
      await s.setViewportSize({ width: 1440, height: 1000 });
      await s.goto(BASE + '/dashboard', { waitUntil: 'networkidle', timeout: 120000 });
      const acct = s.getByRole('button', { name: /^Account: / });
      await acct.focus();
      await s.keyboard.press('Enter');
      const apanel = s.locator(`[id="${await acct.getAttribute('aria-controls')}"]`);
      assert(await apanel.getByRole('button', { name: 'Sign out' }).isVisible(), 'Sign out missing in the account menu');
      await s.keyboard.press('Escape');
      assert(!(await apanel.isVisible()), 'account menu did not close');
      await s.close();
    });

    await test('S-8 @390 mobile menu: modal dialog, focus stays in, Esc closes, focus returns', async () => {
      const p = await anonCtx.newPage();
      await p.setViewportSize({ width: 390, height: 844 });
      await p.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 120000 });
      const btn = p.getByRole('button', { name: 'Open menu' });
      await btn.focus();
      await p.keyboard.press('Enter');
      const dlg = p.getByRole('dialog', { name: 'Menu' });
      await dlg.waitFor({ state: 'visible' });
      for (let i = 0; i < 8; i++) {
        await p.keyboard.press('Tab');
        const behind = await p.evaluate(() => Boolean(document.activeElement && document.activeElement !== document.body && !document.activeElement.closest('dialog[open]')));
        assert(!behind, 'focus escaped the menu');
      }
      const links = await dlg.getByRole('link').count();
      assert(links >= 8, `only ${links} links in the menu`);
      await p.keyboard.press('Escape');
      await dlg.waitFor({ state: 'hidden' });
      assert(await btn.evaluate((b) => b === document.activeElement), 'focus did not return to the menu button');
      await p.close();
    });

    await test('S-9 @390 account sheet from the bottom nav: named dialog with Sign out; Esc closes', async () => {
      const s = await stuCtx.newPage();
      await s.setViewportSize({ width: 390, height: 844 });
      await s.goto(BASE + '/mistakes', { waitUntil: 'networkidle', timeout: 120000 });
      await s.getByRole('navigation', { name: 'Student' }).getByRole('button', { name: 'Account' }).click();
      const dlg = s.getByRole('dialog', { name: 'Account' });
      await dlg.waitFor({ state: 'visible' });
      assert(await dlg.getByRole('button', { name: 'Sign out' }).isVisible(), 'Sign out missing');
      await s.keyboard.press('Escape');
      await dlg.waitFor({ state: 'hidden' });
      await s.close();
    });
  } finally {
    await browser.close();
  }
  console.log(`\nUX-1b shell a11y: ${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error('SUITE ERROR', String(e && e.message).slice(0, 300));
  process.exit(1);
});
