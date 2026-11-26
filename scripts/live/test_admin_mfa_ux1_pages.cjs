#!/usr/bin/env node
/**
 * ADMIN-MFA-UX-1 page checks — the REAL /admin/mfa panel in a real browser, on the LOCAL fixture build only (no sign-in,
 * no session, no Supabase request — the fixture's `preview` makes every action inert; any request to a Supabase host is
 * blocked and counted):
 *   EXAM_UX_FIXTURE=1 npx next build && EXAM_UX_FIXTURE=1 npx next start -p 3109
 *   M-1 five viewports × 8 states: 200, one <h1>, no horizontal scroll, the brand panel only ≥ 1024 px, buttons / the code
 *       field ≥ 48 px tall, no emoji, no "Admin studio" back link, the setup key only on setup step 2
 *   M-2 the code field: typing "48a21x0" → six digits shown as 4,8,2,1,0 (digits only); paste of "123 456" fills all six
 *       boxes; the submit button is enabled only at 6 digits; attributes inputmode / autocomplete / maxlength / pattern
 *   M-3 error state: aria-invalid, aria-describedby → the coral message; the button does not move when the error shows
 *   M-4 nothing leaves the page: 0 requests to Supabase / any non-local host; the console never prints the setup key
 *   --shots <dir>: setup 1–3, error, success, return — desktop 1366 + phone 390 (JPEG; outside the repo)
 * Usage: node scripts/live/test_admin_mfa_ux1_pages.cjs http://localhost:3109 [--shots dir]
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
const VIEWS = ['setup-1', 'setup-2', 'setup-3', 'setup-3-error', 'success', 'return', 'return-error', 'already'];
const SHOT_VIEWS = ['setup-1', 'setup-2', 'setup-3', 'setup-3-error', 'success', 'return'];
const KEY = 'JBSWY3DPEHPK3PXP';
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}\u{FE0F}]/u;

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
  const external = [];
  const consoleText = [];
  const newCtx = async (vp) => {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.width < 768, hasTouch: vp.width < 768, permissions: ['clipboard-read', 'clipboard-write'] });
    await ctx.route((u) => !/^(localhost|127\.0\.0\.1)$/.test(new URL(u.toString()).hostname), (r) => {
      external.push(new URL(r.request().url()).hostname);
      return r.abort();
    });
    return ctx;
  };

  // ---- M-1 every state at 5 sizes
  for (const vp of VIEWPORTS) {
    const ctx = await newCtx(vp);
    const page = await ctx.newPage();
    page.on('console', (m) => consoleText.push(m.text()));
    for (const v of VIEWS) {
      const r = await page.goto(`${BASE}/dev/admin-mfa-fixture?view=${v}`, { waitUntil: 'load', timeout: 120000 });
      await page.waitForTimeout(250);
      const m = await page.evaluate(() => {
        const vis = (el) => !!el && el.getBoundingClientRect().width > 0 && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden';
        const panel = document.querySelector('[data-auth-panel]');
        const main = document.querySelector('.cl-auth__main');
        const small = [...(main ? main.querySelectorAll('button, #mfa-code') : [])].filter((el) => vis(el) && el.getBoundingClientRect().height < 47.5).map((el) => `${el.tagName}:${(el.textContent || el.id).trim().slice(0, 16)}`);
        const links = [...document.querySelectorAll('a')].map((a) => `${a.getAttribute('href')}|${a.innerText.trim()}`);
        // the RENDERED page (scripts excluded): the fixture passes its fake enrolment as a prop (serialized for hydration);
        // the real page never has the key on the server — it exists only in the browser's Supabase response
        const body = document.body.cloneNode(true);
        body.querySelectorAll('script, template').forEach((s) => s.remove());
        return { h1: document.querySelectorAll('h1').length, panel: vis(panel), ovf: document.documentElement.scrollWidth - document.documentElement.clientWidth, small, text: document.body.innerText, html: body.outerHTML, links };
      });
      const wantPanel = vp.width >= 1024;
      const keyShown = m.html.includes(KEY) || m.html.includes('JBSW Y3DP EHPK 3PXP');
      const keyOk = v === 'setup-2' ? keyShown : !keyShown;
      const backLink = m.links.some((l) => /Admin studio/.test(l.split('|')[1]) && l.startsWith('/admin|'));
      check(
        `M-1 ${vp.name} ${v}: 200 · one h1 · panel ${wantPanel ? 'shown' : 'hidden'} · no overflow · targets ≥ 48 px · no emoji · no studio back link · key ${v === 'setup-2' ? 'shown' : 'absent'}`,
        r && r.status() === 200 && m.h1 === 1 && m.panel === wantPanel && m.ovf <= 0 && m.small.length === 0 && !EMOJI.test(m.text) && !backLink && keyOk,
        `status ${r && r.status()} · h1 ${m.h1} · panel ${m.panel} · overflow ${m.ovf}${m.small.length ? ' · small ' + m.small.join(',') : ''}${backLink ? ' · BACK LINK' : ''}${keyOk ? '' : ' · KEY'}`,
      );
      if (SHOTS && SHOT_VIEWS.includes(v) && ['1366x768', '390x844'].includes(vp.name)) {
        await page.screenshot({ path: path.join(SHOTS, `mfa-${v}-${vp.width}.jpg`), type: 'jpeg', quality: 82, fullPage: vp.width < 768 });
      }
    }
    await ctx.close();
  }

  // ---- M-2 / M-3 the code field (desktop + phone)
  for (const vp of [VIEWPORTS[0], VIEWPORTS[3]]) {
    const ctx = await newCtx(vp);
    const page = await ctx.newPage();
    page.on('console', (m) => consoleText.push(m.text()));
    await page.goto(`${BASE}/dev/admin-mfa-fixture?view=return`, { waitUntil: 'load', timeout: 120000 });
    await page.waitForTimeout(250);
    const attrs = await page.evaluate(() => {
      const i = document.querySelector('#mfa-code');
      return { im: i.inputMode, ac: i.autocomplete, ml: i.maxLength, pat: i.pattern, label: !!document.querySelector('label[for="mfa-code"]'), inputs: document.querySelectorAll('input').length };
    });
    check(`M-2 ${vp.name} one real input: numeric · one-time-code · 6 · [0-9]* · labelled`, attrs.im === 'numeric' && attrs.ac === 'one-time-code' && attrs.ml === 6 && attrs.pat === '[0-9]*' && attrs.label && attrs.inputs === 1, JSON.stringify(attrs));
    const boxes = () => page.evaluate(() => [...document.querySelectorAll('[data-mfa-otp] [aria-hidden="true"] span')].map((s) => s.textContent).join(''));
    const submitEnabled = () => page.evaluate(() => !document.querySelector('form button[type="submit"]').disabled);
    await page.click('#mfa-code');
    await page.keyboard.type('48a21x0');
    const typed = await boxes();
    const partialEnabled = await submitEnabled();
    check(`M-2 ${vp.name} typing keeps digits only; submit disabled below 6 digits`, typed === '48210' && !partialEnabled, `boxes "${typed}" · enabled ${partialEnabled}`);
    await page.fill('#mfa-code', '');
    await page.evaluate(() => navigator.clipboard.writeText('123 456'));
    await page.click('#mfa-code');
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+V' : 'Control+V');
    await page.waitForTimeout(100);
    const pasted = await boxes();
    check(`M-2 ${vp.name} paste "123 456" fills all six boxes; submit enabled at 6`, pasted === '123456' && (await submitEnabled()), `boxes "${pasted}"`);

    // M-3 the error state: described, invalid, no layout shift of the button
    await page.goto(`${BASE}/dev/admin-mfa-fixture?view=return`, { waitUntil: 'load' });
    await page.waitForTimeout(200);
    const yOk = await page.evaluate(() => document.querySelector('form button[type="submit"]').getBoundingClientRect().top);
    await page.goto(`${BASE}/dev/admin-mfa-fixture?view=return-error`, { waitUntil: 'load' });
    await page.waitForTimeout(200);
    const e = await page.evaluate(() => {
      const i = document.querySelector('#mfa-code');
      const id = i.getAttribute('aria-describedby');
      const msg = id && document.getElementById(id);
      return { invalid: i.getAttribute('aria-invalid'), msg: msg ? msg.innerText : '', y: document.querySelector('form button[type="submit"]').getBoundingClientRect().top };
    });
    check(`M-3 ${vp.name} error: aria-invalid + aria-describedby → plain-words message; the button does not move`, e.invalid === 'true' && /Too many tries/.test(e.msg) && Math.abs(e.y - yOk) < 1, `invalid ${e.invalid} · "${e.msg}" · Δy ${(e.y - yOk).toFixed(1)}`);
    await ctx.close();
  }

  // ---- M-4 nothing leaves the page; the key never reaches the console
  const offHost = external.filter((h) => !/^fonts\.(googleapis|gstatic)\.com$/.test(h));
  check('M-4 no request to Supabase or any non-local host (fonts aside); the setup key never in the console', !external.some((h) => /supabase/.test(h)) && offHost.length === 0 && !consoleText.some((t) => t.includes(KEY)), `external ${[...new Set(external)].join(',') || 'none'} · console lines ${consoleText.length}`);

  await browser.close();
  console.log(`\nADMIN-MFA-UX-1 pages: ${passes}/${passes + fails} passed`);
  process.exit(fails ? 1 : 0);
})().catch((e) => {
  console.error('page checks crashed:', e && e.message);
  process.exit(2);
});
