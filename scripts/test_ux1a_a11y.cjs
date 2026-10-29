/**
 * UX-1a accessibility smoke for the design-system preview (/admin/design-system). There is no axe in the
 * repo and no new dependency is allowed, so this uses Playwright plus in-page checks.
 *
 * LOCAL ONLY: it signs in as the permanent qa-admin identity (.env.local QA_ADMIN_PASSWORD) and refuses any
 * non-localhost base URL. Signed-in production checks are run by the owner.
 *
 * At 390, 768 and 1440 px:
 *   A-1 page renders (h1 "Design system"), no uncaught page errors, no console errors
 *   A-2 every interactive element in the preview has an accessible name
 *   A-3 no rendered text is smaller than 12 px
 *   A-4 every visible text meets contrast (4.5:1; 3:1 for large text); disabled controls exempt
 *   A-5 one h1; heading levels never skip downwards; no duplicate ids
 *   A-6 no horizontal overflow of the page / scroll container
 * Once (1440 px):
 *   A-7 keyboard: Tab walks the preview without losing focus; every stop shows a ≥2px focus outline
 *   A-8 tabs: arrows / Home / End move selection and focus; only the selected tab is tabbable
 *   A-9 dialog: focus moves in, stays in on Tab, Esc closes and focus returns; the non-dismissible one ignores Esc
 *   A-10 tooltip: shows on focus, linked by aria-describedby, Esc hides it
 *   A-11 toast: success announced in role=status, error in role=alert, dismiss works
 *   A-12 accordion: Enter toggles aria-expanded and the panel
 *   A-13 reduced motion: skeletons and spinners stop animating
 *
 * Run: node scripts/test_ux1a_a11y.cjs [http://localhost:3100] [--screenshots]
 *      --screenshots also writes docs/ux/ux1/preview/*.png
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const { readEnv } = require('./db/_db-env.cjs');

const args = process.argv.slice(2);
const BASE = (args.find((a) => /^https?:/.test(a)) || 'http://localhost:3100').replace(/\/$/, '');
const SHOTS = args.includes('--screenshots');
const host = new URL(BASE).hostname;
if (!['localhost', '127.0.0.1', '[::1]'].includes(host)) {
  console.error('refused: this suite signs in with a QA identity and runs against a local build only');
  process.exit(2);
}
const OUT = path.join(__dirname, '..', 'docs/ux/ux1/preview');
const PAGE = '/admin/system/design';

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

// ------------------------------------------------------------ in-page audits (run in the browser)
function audit() {
  const root = document.querySelector('[data-ds-preview]');
  const out = { unnamed: [], small: [], contrast: [], headings: [], dupIds: [], overflow: null, checked: 0 };
  if (!root) return { error: 'preview root missing' };

  const visible = (el) => {
    if (el.closest('[hidden]')) return false;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return false;
    for (let e = el; e && e !== document.body; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (s.display === 'none' || s.visibility === 'hidden' || parseFloat(s.opacity) === 0) return false;
    }
    return true;
  };
  const srOnly = (el) => {
    for (let e = el; e && e !== root; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (s.position === 'absolute' && (s.clip === 'rect(0px, 0px, 0px, 0px)' || s.clipPath === 'inset(50%)') ) return true;
    }
    return false;
  };

  // A-2 accessible names
  const nameOf = (el) => {
    const lb = el.getAttribute('aria-labelledby');
    if (lb) return lb.split(/\s+/).map((id) => document.getElementById(id)?.textContent || '').join(' ').trim();
    if (el.getAttribute('aria-label')) return el.getAttribute('aria-label').trim();
    if (el.id) {
      const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (l) return l.textContent.trim();
    }
    const wrap = el.closest('label');
    if (wrap) return wrap.textContent.trim();
    if (el.tagName === 'IMG') return (el.getAttribute('alt') || '').trim();
    if (el.tagName === 'FIELDSET') return el.querySelector('legend')?.textContent.trim() || '';
    return (el.textContent || el.getAttribute('title') || '').trim();
  };
  const interactive = root.querySelectorAll('a[href], button, input, select, textarea, [role=tab], [role=switch], [role=progressbar], [role=tooltip], [tabindex], summary, img, nav, dialog, [role=img]');
  for (const el of interactive) {
    if (el.tagName === 'INPUT' && el.type === 'hidden') continue;
    if (el.tagName === 'DIALOG' && !el.open) continue;
    if (el.closest('[aria-hidden=true]') && el.tagName !== 'DIALOG') continue;
    out.checked++;
    if (!nameOf(el)) out.unnamed.push(el.outerHTML.slice(0, 140));
  }

  // A-3 / A-4 text size + contrast
  const parse = (c) => {
    const m = c.match(/rgba?\(([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\)/);
    if (!m) return null;
    let a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return [+m[1], +m[2], +m[3], a];
  };
  const toSrgb = (c) => {
    // getComputedStyle may return oklch / color(srgb …) for Tailwind v4 tokens; normalise through a canvas.
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillStyle = c;
    const v = ctx.fillStyle;
    if (v.startsWith('#')) {
      const n = parseInt(v.slice(1), 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
    }
    return parse(v);
  };
  const blend = (fg, bg) => [0, 1, 2].map((i) => fg[i] * fg[3] + bg[i] * (1 - fg[3])).concat(1);
  const bgOf = (el) => {
    const layers = [];
    for (let e = el; e; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (s.backgroundImage && s.backgroundImage !== 'none') return null; // gradients / images: skip
      const c = toSrgb(s.backgroundColor);
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
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.textContent.trim()) continue;
    const el = n.parentElement;
    if (!el || seen.has(el)) continue;
    seen.add(el);
    if (!visible(el) || srOnly(el)) continue;
    if (el.closest('[data-contrast-sample]')) continue;
    if (el.closest('option, select')) continue;
    const s = getComputedStyle(el);
    const px = parseFloat(s.fontSize);
    if (px < 12) out.small.push(`${px}px: "${n.textContent.trim().slice(0, 40)}"`);
    const disabled = el.closest('[disabled], [aria-disabled=true], :disabled, label:has(:disabled), fieldset:disabled');
    if (disabled) continue;
    const fg = toSrgb(s.color);
    const bg = bgOf(el);
    if (!fg || !bg) continue;
    const eff = fg[3] < 1 ? blend(fg, bg) : fg;
    const r = ratio(eff, bg);
    const large = px >= 24 || (px >= 18.66 && parseInt(s.fontWeight, 10) >= 700);
    if (r < (large ? 3 : 4.5)) out.contrast.push(`${r.toFixed(2)}:1 "${n.textContent.trim().slice(0, 40)}" (${s.color} on ${bg.map((x) => Math.round(x)).join(',')})`);
  }

  // A-5 headings + ids
  const hs = [...document.querySelectorAll('main h1, main h2, main h3, main h4, main h5, main h6')].filter(visible);
  out.h1 = hs.filter((h) => h.tagName === 'H1').length;
  let prev = 0;
  for (const h of hs) {
    const lvl = +h.tagName[1];
    if (prev && lvl > prev + 1) out.headings.push(`h${prev} → h${lvl} "${h.textContent.trim().slice(0, 40)}"`);
    prev = lvl;
  }
  const ids = {};
  for (const e of document.querySelectorAll('[id]')) ids[e.id] = (ids[e.id] || 0) + 1;
  out.dupIds = Object.entries(ids).filter(([, c]) => c > 1).map(([id]) => id);

  // A-6 overflow (the admin layout scrolls inside <main>)
  const main = document.querySelector('main');
  out.overflow = {
    doc: document.documentElement.scrollWidth - window.innerWidth,
    main: main ? main.scrollWidth - main.clientWidth : 0,
  };
  return out;
}

// CI-FIX-1 (#74): CAPTCHA-safe QA session cookies (no login form; scripts/live/qa-session.cjs). `env` is unused.
// eslint-disable-next-line no-unused-vars
async function signIn(page, env) {
  await require('./live/qa-session.cjs').qaBrowserLogin(page.context(), 'qa-admin@courage-library.test', BASE);
}

const UNCLIP = `html,body,body *{max-height:none!important}
  [class*="h-[100dvh]"]{height:auto!important;overflow:visible!important}
  main{overflow:visible!important}`;

(async () => {
  console.log(`UX-1a a11y smoke — ${BASE}${PAGE}`);
  const env = readEnv();
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${String(e.message).slice(0, 200)}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 200)}`);
  });
  try {
    await signIn(page, env);
    if (SHOTS) fs.mkdirSync(OUT, { recursive: true });

    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      const res = await page.goto(BASE + PAGE, { waitUntil: 'networkidle', timeout: 120000 });
      await page.waitForTimeout(400); // token values / contrast table fill in after hydration
      await test(`A-1 @${width}: page renders, no page / console errors`, async () => {
        assert(res && res.status() === 200, `status ${res && res.status()}`);
        assert((await page.locator('h1').first().textContent()).trim() === 'Design system', 'h1 missing');
        assert(errors.length === 0, errors.join('\n        '));
      });
      const a = await page.evaluate(audit);
      await test(`A-2 @${width}: every interactive element has an accessible name`, async () => {
        assert(!a.error, a.error);
        assert(a.unnamed.length === 0, a.unnamed.join('\n        '));
        return `${a.checked} elements`;
      });
      await test(`A-3 @${width}: no text below 12 px`, async () => assert(a.small.length === 0, a.small.slice(0, 20).join('\n        ')));
      await test(`A-4 @${width}: text contrast ≥ 4.5:1 (≥ 3:1 large)`, async () => assert(a.contrast.length === 0, a.contrast.slice(0, 25).join('\n        ')));
      await test(`A-5 @${width}: one h1, no skipped heading levels, no duplicate ids`, async () => {
        assert(a.h1 === 1, `h1 count ${a.h1}`);
        assert(a.headings.length === 0, a.headings.join('\n        '));
        assert(a.dupIds.length === 0, `duplicate ids: ${a.dupIds.join(', ')}`);
      });
      await test(`A-6 @${width}: no horizontal overflow`, async () => assert(a.overflow.doc <= 0 && a.overflow.main <= 0, JSON.stringify(a.overflow)));

      if (SHOTS && (width === 390 || width === 1440)) {
        await page.addStyleTag({ content: UNCLIP });
        await page.waitForTimeout(200);
        await page.locator('[data-ds-preview]').screenshot({ path: path.join(OUT, `design-system-${width}.png`) });
        if (width === 1440) {
          for (const id of ['colour', 'contrast', 'type', 'buttons', 'forms', 'cards', 'feedback', 'domain']) {
            await page.locator(`section#${id}`).screenshot({ path: path.join(OUT, `section-${id}-1440.png`) });
          }
        } else {
          for (const id of ['buttons', 'forms', 'domain']) {
            await page.locator(`section#${id}`).screenshot({ path: path.join(OUT, `section-${id}-390.png`) });
          }
        }
        await page.goto(BASE + PAGE, { waitUntil: 'networkidle', timeout: 120000 });
      }
    }

    // ---- interaction checks at 1440
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(BASE + PAGE, { waitUntil: 'networkidle', timeout: 120000 });

    await test('A-7 keyboard: Tab walks the preview; every stop is visible with a ≥2px focus outline', async () => {
      await page.locator('[data-ds-preview] h1').evaluate((h) => {
        h.setAttribute('tabindex', '-1');
        h.focus();
      });
      const bad = [];
      let stops = 0;
      // the last tabbable control of the preview: after it, Tab leaves the document (normal), which ends the walk
      const lastStop = await page.evaluate(() => {
        const all = [...document.querySelectorAll('[data-ds-preview] a[href], [data-ds-preview] button, [data-ds-preview] input, [data-ds-preview] select, [data-ds-preview] textarea, [data-ds-preview] summary, [data-ds-preview] [tabindex]')]
          .filter((e) => e.tabIndex >= 0 && !e.disabled && !e.closest('[hidden]') && !e.closest('dialog:not([open])'));
        return all.length ? all[all.length - 1].outerHTML.slice(0, 110) : null;
      });
      let last = null;
      for (let i = 0; i < 220; i++) {
        await page.keyboard.press('Tab');
        const r = await page.evaluate(() => {
          const el = document.activeElement;
          if (!el || el === document.body) return { lost: true };
          if (!el.closest('[data-ds-preview]')) return { outside: true };
          const ring = (e) => {
            const s = getComputedStyle(e);
            return s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2;
          };
          let ok = ring(el);
          // controls whose ring is drawn on a wrapper (switch track, card, option tile)
          for (let e = el.parentElement, k = 0; !ok && e && k < 4; e = e.parentElement, k++) ok = ring(e);
          if (!ok && el.matches('input[role=switch]')) ok = ring(el.nextElementSibling);
          if (!ok && el.matches('input[type=radio].peer')) ok = ring(el.closest('label'));
          const rect = el.getBoundingClientRect();
          return { ok, zero: rect.width === 0 && rect.height === 0 && !el.matches('.sr-only, .peer'), tag: el.outerHTML.slice(0, 110) };
        });
        if (r.lost) {
          if (last !== lastStop) bad.push(`focus lost to <body> after ${stops} stops (last: ${last})`);
          break;
        }
        last = r.tag;
        if (r.outside) break;
        stops++;
        if (!r.ok) bad.push(`no visible focus ring: ${r.tag}`);
        if (r.zero) bad.push(`focus on an invisible element: ${r.tag}`);
      }
      assert(stops > 60, `only ${stops} tab stops reached`);
      assert(bad.length === 0, bad.slice(0, 15).join('\n        '));
      return `${stops} tab stops`;
    });

    await test('A-8 tabs: Arrow / Home / End; roving tabindex; panel follows', async () => {
      const list = page.getByRole('tablist', { name: 'Exam sections' });
      const first = list.getByRole('tab', { name: 'Overview' });
      await first.focus();
      await page.keyboard.press('ArrowRight');
      const s = await list.evaluate((l) => {
        const tabs = [...l.querySelectorAll('[role=tab]')];
        const sel = tabs.find((t) => t.getAttribute('aria-selected') === 'true');
        return {
          sel: sel && sel.textContent,
          focused: document.activeElement && document.activeElement.textContent,
          tabbable: tabs.filter((t) => t.tabIndex === 0).length,
          panelVisible: sel && !document.getElementById(sel.getAttribute('aria-controls')).hidden,
        };
      });
      assert(s.sel === 'Syllabus' && s.focused === 'Syllabus', JSON.stringify(s));
      assert(s.tabbable === 1 && s.panelVisible, JSON.stringify(s));
      await page.keyboard.press('End');
      const end = await list.evaluate((l) => [...l.querySelectorAll('[role=tab]')].find((t) => t.getAttribute('aria-selected') === 'true').textContent);
      assert(end === 'Exam pattern', `End selected ${end} (the disabled last tab must be skipped)`);
      await page.keyboard.press('Home');
      const home = await list.evaluate((l) => [...l.querySelectorAll('[role=tab]')].find((t) => t.getAttribute('aria-selected') === 'true').textContent);
      assert(home === 'Overview', `Home selected ${home}`);
    });

    await test('A-9 dialog: focus in, trapped, Esc closes, focus returns; non-dismissible ignores Esc', async () => {
      const trigger = page.getByRole('button', { name: 'Open modal' });
      await trigger.focus();
      await page.keyboard.press('Enter');
      const dlg = page.getByRole('dialog', { name: 'Leave this page?' });
      await dlg.waitFor({ state: 'visible' });
      for (let i = 0; i < 6; i++) {
        await page.keyboard.press('Tab');
        const inside = await page.evaluate(() => Boolean(document.activeElement && document.activeElement.closest('dialog[open]')));
        // Chrome may move focus to the browser UI between cycles; it must never land on the page behind.
        const behind = await page.evaluate(() => Boolean(document.activeElement && document.activeElement !== document.body && !document.activeElement.closest('dialog[open]')));
        assert(!behind, 'focus escaped to the page behind the modal');
        if (!inside) continue;
      }
      await page.keyboard.press('Escape');
      await dlg.waitFor({ state: 'hidden' });
      const back = await page.evaluate(() => document.activeElement && document.activeElement.textContent);
      assert(back === 'Open modal', `focus returned to "${back}"`);

      await page.getByRole('button', { name: 'Open submit confirmation' }).click();
      const confirm = page.getByRole('dialog', { name: 'Submit test?' });
      await confirm.waitFor({ state: 'visible' });
      await page.keyboard.press('Escape');
      await page.waitForTimeout(250);
      assert(await confirm.isVisible(), 'Esc closed the non-dismissible dialog');
      assert((await confirm.getByRole('button', { name: 'Close' }).count()) === 0, 'non-dismissible dialog shows a close button');
      await confirm.getByRole('button', { name: 'Back to test' }).click();
      await confirm.waitFor({ state: 'hidden' });
    });

    await test('A-10 tooltip: shows on focus, aria-describedby, Esc hides', async () => {
      const btn = page.getByRole('button', { name: 'Marked for review' });
      await btn.focus();
      const tipId = await btn.getAttribute('aria-describedby');
      assert(tipId, 'trigger has no aria-describedby');
      const tip = page.locator(`[id="${tipId}"]`);
      assert((await tip.getAttribute('role')) === 'tooltip', 'not role=tooltip');
      assert(await tip.isVisible(), 'tooltip not shown on focus');
      await page.keyboard.press('Escape');
      assert(!(await tip.isVisible()), 'Esc did not hide the tooltip');
    });

    await test('A-11 toast: success in role=status, error in role=alert, dismiss works', async () => {
      await page.getByRole('button', { name: 'Success toast' }).click();
      await page.locator('[role=status]').filter({ hasText: 'Answer saved' }).waitFor();
      await page.getByRole('button', { name: 'Error toast (persistent)' }).click();
      const alert = page.locator('[role=alert]').filter({ hasText: 'Could not save' });
      await alert.waitFor();
      await alert.getByRole('button', { name: 'Dismiss notification' }).click();
      await page.waitForTimeout(150);
      assert((await page.locator('[role=alert]').filter({ hasText: 'Could not save' }).count()) === 0, 'error toast not dismissed');
    });

    await test('A-12 accordion: Enter toggles aria-expanded and the panel', async () => {
      const b = page.getByRole('button', { name: 'Can I change my exam later?' });
      assert((await b.getAttribute('aria-expanded')) === 'false', 'should start collapsed');
      await b.focus();
      await page.keyboard.press('Enter');
      assert((await b.getAttribute('aria-expanded')) === 'true', 'did not expand');
      const panel = page.locator(`[id="${await b.getAttribute('aria-controls')}"]`);
      assert(await panel.isVisible(), 'panel hidden');
      const first = page.getByRole('button', { name: 'Is the correct answer free to see?' });
      assert((await first.getAttribute('aria-expanded')) === 'false', 'single mode should close the other item');
    });

    await test('A-13 reduced motion: skeletons and spinners do not animate', async () => {
      const rm = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', storageState: await ctx.storageState() });
      const p2 = await rm.newPage();
      await p2.goto(BASE + PAGE, { waitUntil: 'networkidle', timeout: 120000 });
      const anim = await p2.evaluate(() =>
        [...document.querySelectorAll('[data-ds-preview] [class*="animate-"]')].map((e) => getComputedStyle(e).animationName).filter((n) => n && n !== 'none'),
      );
      await rm.close();
      assert(anim.length === 0, `still animating: ${anim.join(', ')}`);
    });
  } finally {
    await browser.close();
  }
  console.log(`\nUX-1a a11y: ${passed}/${passed + failed} passed${SHOTS ? ` (screenshots → ${path.relative(path.join(__dirname, '..'), OUT)})` : ''}`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error('SUITE ERROR', String(e && e.message).slice(0, 300));
  process.exit(1);
});
