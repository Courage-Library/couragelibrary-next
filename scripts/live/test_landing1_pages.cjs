#!/usr/bin/env node
/**
 * LANDING-1 — the landing pages "/" (EN) and "/hi" (HI) against a LOCAL production build (anonymous, read-only):
 *   L-1 EN renders the H1 "Find your weak topics. Fix them. Score better in your next attempt."; HI renders
 *       "अपने कमज़ोर टॉपिक पहचानें"; one H1 each; the landing wrapper carries lang="en" / lang="hi"
 *   L-2 the language switch: two links (EN → /, हिंदी → /hi) with aria-current on the current one; following it changes
 *       the visible copy and the lang attribute
 *   L-3 all 10 sections present (data-landing-section: header, hero, find-exam, choose-exam, pain, how, free-pro, library,
 *       promises, faq, final-cta, footer); landmarks header / main / footer; "Start free" → /auth/signup
 *   L-4 hreflang alternates (en, hi, x-default → /) and a canonical on both pages
 *   L-5 responsive: 1280 / 768 / 390 / 360 px — no horizontal overflow (EN + HI); on phone the header shows the logo,
 *       the language switch and the menu button, and the nav / CTAs are inside the menu
 *   L-6 link check: every internal link on "/" and "/hi" answers 200 (redirects followed), never 404
 *   L-7 negative paths: "/?lang=zz" (an invalid value) → the English page, 200; JavaScript disabled → the content and
 *       links render (server-rendered), the FAQ <details> and the phone menu still open
 *   L-8 CLS < 0.1 on "/" and "/hi" (PerformanceObserver layout-shift, phone + desktop, load + scroll)
 *   L-9 data-driven categories: a live category is a link to /exams/<slug>; a category without live exams is NOT a link
 *       and shows "Coming soon" / "जल्द आ रहा है"; SSC (live today) is a link; chips only for live SSC exams
 *   L-10 accessibility basics: focusable controls ≥ 48 px tall at 390 / 360 px (BRAND2 P-03); reduced motion → no transition on the cards
 *   L-11 owner round 3: FAQ 1 names the LIVE exams (today: "SSC CGL is live now."); while no Hindi content is published the
 *        badge / sub / FAQ 3 / promise 4 show the "Hindi on the way" lines; the phone menu = Sign in, then the start action,
 *        then the nav (UXFIX1 X-05 exemption); with sign-up open the start action is "Start free" → /auth/signup
 *   --shots: full-page screenshots (desktop EN, phone EN, phone HI) → docs/design/screens/landing-1/
 * Usage: node scripts/live/test_landing1_pages.cjs [http://localhost:3100] [--shots]
 */
const fs = require('fs');
const path = require('path');

const BASE = (process.argv.find((a) => /^https?:\/\//.test(a)) || 'http://localhost:3100').replace(/\/$/, '');
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(BASE).hostname)) throw new Error('runs against a local build only');
const SHOTS = process.argv.includes('--shots');
const ROOT = path.resolve(__dirname, '..', '..');
const SHOT_DIR = path.join(ROOT, 'docs/design/screens/landing-1');
let ok = true;
let passed = 0;
let failed = 0;
const chk = (n, cond, info) => {
  if (cond) passed++; else { failed++; ok = false; }
  console.log(`${cond ? 'PASS' : 'FAIL'} ${n}${info !== undefined && info !== '' ? ' — ' + String(info).slice(0, 400) : ''}`);
};
const SECTIONS = ['header', 'hero', 'find-exam', 'choose-exam', 'pain', 'how', 'free-pro', 'library', 'promises', 'faq', 'final-cta', 'footer'];
const H1_EN = 'Find your weak topics. Fix them. Score better in your next attempt.';
const H1_HI = 'अपने कमज़ोर टॉपिक पहचानें';

(async () => {
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 120)));

    // L-1 / L-3 / L-4 / L-9 on both languages
    const info = {};
    for (const [lang, url] of [['en', '/'], ['hi', '/hi']]) {
      const resp = await page.goto(BASE + url, { waitUntil: 'load', timeout: 60000 });
      const d = await page.evaluate(() => {
        const lp = document.querySelector('[data-landing="v1"]');
        const a = (sel) => [...document.querySelectorAll(sel)];
        return {
          h1: a('h1').map((h) => h.textContent.replace(/\s+/g, ' ').trim()),
          lang: lp && lp.getAttribute('lang'),
          sections: a('[data-landing-section]').map((s) => s.getAttribute('data-landing-section')),
          landmarks: { header: !!document.querySelector('[data-landing="v1"] header'), main: !!document.querySelector('main#main-content'), footer: !!document.querySelector('[data-landing="v1"] footer') },
          start: a('a[data-landing-cta="start"]').map((x) => x.getAttribute('href')),
          switcher: a('.lp-lang a').map((x) => ({ href: x.getAttribute('href'), current: x.getAttribute('aria-current'), text: x.textContent.trim() })),
          canonical: (document.querySelector('link[rel="canonical"]') || {}).href || null,
          alternates: a('link[rel="alternate"][hreflang]').map((l) => [l.getAttribute('hreflang'), new URL(l.href).pathname]),
          cats: a('[data-category]').map((c) => ({ slug: c.getAttribute('data-category'), link: c.tagName === 'A', href: c.getAttribute('href'), live: c.getAttribute('data-live'), soon: !!c.querySelector('.lp-exam__soon'), soonText: (c.querySelector('.lp-exam__soon') || {}).textContent || '' })),
          chips: a('.lp-chips a').map((x) => x.getAttribute('href')),
          visible: document.body.innerText,
        };
      });
      info[lang] = d;
      const wantH1 = lang === 'en' ? d.h1[0] === H1_EN : (d.h1[0] || '').startsWith(H1_HI);
      chk(`L-1 ${url} → 200, ONE h1 = the ${lang.toUpperCase()} headline, lang="${lang}"`, resp && resp.status() === 200 && d.h1.length === 1 && wantH1 && d.lang === lang, `${resp && resp.status()} ${JSON.stringify(d.h1)} lang=${d.lang}`);
      const missing = SECTIONS.filter((s) => !d.sections.includes(s));
      chk(`L-3 ${url}: all sections present (10 page sections + header / footer) and the landmarks; "Start free" → /auth/signup`,
        missing.length === 0 && d.landmarks.header && d.landmarks.main && d.landmarks.footer && d.start.length >= 1 && d.start.every((h) => h === '/auth/signup'), `missing: ${missing.join(',')} ${JSON.stringify(d.landmarks)} ${d.start}`);
      const alt = Object.fromEntries(d.alternates);
      chk(`L-4 ${url}: canonical ${url} + hreflang en → /, hi → /hi, x-default → /`,
        d.canonical && new URL(d.canonical).pathname === url && alt.en === '/' && alt.hi === '/hi' && alt['x-default'] === '/', `${d.canonical} ${JSON.stringify(d.alternates)}`);
      const sw = d.switcher;
      chk(`L-2 ${url}: the switch is two links (EN → /, हिंदी → /hi), aria-current on ${lang.toUpperCase()} only`,
        sw.length === 2 && sw[0].href === '/' && sw[1].href === '/hi' && (lang === 'en' ? sw[0].current === 'page' && !sw[1].current : sw[1].current === 'page' && !sw[0].current), JSON.stringify(sw));
      const bad = d.cats.filter((c) => c.slug !== 'all' && (c.live === 'true' ? !(c.link && c.href === `/exams/${c.slug}` && !c.soon) : (c.link || !c.soon)));
      const soonWord = lang === 'en' ? 'Coming soon' : 'जल्द आ रहा है';
      chk(`L-9 ${url}: live categories are links to /exams/<slug>; the others are not links and say "${soonWord}"; SSC (live) is a link; chips only for LIVE SSC exams`,
        d.cats.length === 8 && bad.length === 0 && d.cats.filter((c) => c.soon).every((c) => c.soonText === soonWord) && d.chips.length >= 1 && d.chips.every((h) => ['/exams/ssc-cgl', '/exams/ssc-chsl', '/exams/ssc-mts'].includes(h)) && d.cats.find((c) => c.slug === 'ssc').live === 'true',
        `${d.cats.map((c) => `${c.slug}:${c.live}`).join(' ')} bad=${JSON.stringify(bad)} chips=${d.chips}`);
    }
    // L-11 owner round 3: data-driven copy as served today
    {
      const en = info.en.visible;
      const hi = info.hi.visible;
      const lines = {};
      for (const [lang, url] of [['en', '/'], ['hi', '/hi']]) {
        await page.goto(BASE + url, { waitUntil: 'load' });
        lines[lang] = await page.evaluate(() => ({
          faq1: document.querySelector('.lp-faq details p').textContent.trim(),
          faq3: document.querySelectorAll('.lp-faq summary')[2].textContent.trim(),
          badge: document.querySelector('.lp-badge').textContent.trim(),
          sub: document.querySelector('.lp-sub').textContent.trim(),
          promise4: document.querySelectorAll('.lp-pr b')[3].textContent.trim(),
          made: document.querySelector('.lp-ft__legal span:last-child').textContent.trim(),
          ssc: (document.querySelector('[data-category="ssc"] small') || {}).textContent || '',
          soonSubtitles: [...document.querySelectorAll('[data-live="false"] small')].map((x) => x.textContent.trim()),
        }));
      }
      // LANDING-1.1: the footer line follows the published-Hindi condition; a live card names its live exams; /hi in the sitemap
      chk('L-12 footer "made" line without published Hindi content: EN "Made for government-exam aspirants" / HI "सरकारी परीक्षाओं के aspirants के लिए"',
        lines.en.made === 'Made for government-exam aspirants' && lines.hi.made === 'सरकारी परीक्षाओं के aspirants के लिए', JSON.stringify([lines.en.made, lines.hi.made]));
      chk('L-12 the live SSC card names its live exams: EN "CGL live · more coming" / HI "CGL उपलब्ध · और जल्द" (no CHSL / MTS / GD); Coming-soon cards keep their examples',
        lines.en.ssc.trim() === 'CGL live · more coming' && lines.hi.ssc.trim() === 'CGL उपलब्ध · और जल्द' && lines.en.soonSubtitles.length >= 1 && lines.en.soonSubtitles.every((x) => x.length > 0), JSON.stringify([lines.en.ssc, lines.hi.ssc]));
      const sm = await (await fetch(BASE + '/sitemap.xml', { signal: AbortSignal.timeout(60000) })).text();
      const smHome = (sm.match(/<url>\s*<loc>[^<]*?<\/loc>[\s\S]*?<\/url>/g) || []).find((u) => /<loc>https?:\/\/[^<\/]+\/?<\/loc>/.test(u)) || '';
      const smHi = (sm.match(/<url>[\s\S]*?<\/url>/g) || []).find((u) => /<loc>https?:\/\/[^<]+\/hi<\/loc>/.test(u)) || '';
      const pick = (u, tag) => (u.match(new RegExp(`<${tag}>([^<]*)</${tag}>`)) || [])[1];
      chk('L-12 /sitemap.xml lists /hi with the same priority / changefreq as "/" and hreflang alternates en + hi on both',
        smHi && pick(smHi, 'priority') === pick(smHome, 'priority') && pick(smHi, 'changefreq') === pick(smHome, 'changefreq') && /hreflang="hi"/.test(smHi) && /hreflang="en"/.test(smHi) && /hreflang="hi"/.test(smHome),
        `${pick(smHome, 'priority')}/${pick(smHome, 'changefreq')} vs ${pick(smHi, 'priority')}/${pick(smHi, 'changefreq')}`);
      chk('L-11 FAQ 1 names the live exams (EN "SSC CGL is live now.", HI "SSC CGL अभी उपलब्ध है।"); no CHSL / MTS claim in it',
        lines.en.faq1.startsWith('SSC CGL is live now.') && lines.hi.faq1.startsWith('SSC CGL अभी उपलब्ध है।') && !/CHSL|MTS/.test(lines.en.faq1 + lines.hi.faq1), JSON.stringify([lines.en.faq1, lines.hi.faq1]));
      const claim = /Hindi (&|and) English|in Hindi and English|Learn in the language you think in|Can I study in Hindi|हिंदी और English में/;
      const noHindiClaim = ['en', 'hi'].every((l) => !claim.test(JSON.stringify(lines[l]))) && lines.en.promise4 === 'Hindi on the way' && lines.en.faq3 === 'Is it available in Hindi?' && lines.hi.promise4 === 'हिंदी जल्द आ रही है';
      chk('L-11 no published Hindi content today → the "Hindi on the way" lines (badge, sub, FAQ 3, promise 4; EN + HI), no Hindi claim', noHindiClaim, JSON.stringify(lines));
      chk('L-11 sign-up open → every start action is "Start free" / "मुफ़्त शुरू करें" → /auth/signup', /Start free/.test(en) && /मुफ़्त शुरू करें/.test(hi), '');
    }
    // L-2 following the switch changes the copy and the lang
    await page.goto(BASE + '/', { waitUntil: 'load' });
    await page.click('.lp-lang a[hreflang="hi"]');
    await page.waitForURL(/\/hi$/);
    const after = await page.evaluate(() => ({ h1: document.querySelector('h1').textContent, lang: document.querySelector('[data-landing="v1"]').getAttribute('lang') }));
    chk('L-2 following "हिंदी" on / → /hi: the visible H1 and the lang attribute change', after.h1.startsWith(H1_HI) && after.lang === 'hi', JSON.stringify(after));
    chk('L-1 no page error on load', errors.length === 0, errors.join(' | '));

    // L-5 responsive
    for (const w of [1280, 768, 390, 360]) {
      for (const url of ['/', '/hi']) {
        const p = await ctx.newPage();
        await p.setViewportSize({ width: w, height: 900 });
        await p.goto(BASE + url, { waitUntil: 'load' });
        const r = await p.evaluate(() => {
          const vis = (el) => !!el && el.getBoundingClientRect().width > 0 && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden';
          return {
            sw: document.documentElement.scrollWidth,
            cw: document.documentElement.clientWidth,
            logo: vis(document.querySelector('.lp-hd .lp-logo')),
            lang: vis(document.querySelector('.lp-hd .lp-lang')),
            burger: vis(document.querySelector('.lp-burger')),
            nav: vis(document.querySelector('.lp-hd .lp-nav')),
            cta: vis(document.querySelector('.lp-hd .lp-hd__auth.auth-out')),
          };
        });
        const phone = w <= 600;
        chk(`L-5 ${w} px ${url}: no horizontal overflow${phone ? '; header = logo + language switch + menu button (nav and CTAs in the menu)' : ''}`,
          r.sw <= r.cw && (!phone || (r.logo && r.lang && r.burger && !r.nav && !r.cta)), JSON.stringify(r));
        if (phone && url === '/') {
          await p.click('.lp-burger');
          const menu = await p.evaluate(() => [...document.querySelectorAll('.lp-menu__panel a')].filter((a) => a.getBoundingClientRect().height > 0).map((a) => a.getAttribute('href')));
          chk(`L-5 ${w} px: the menu opens with Sign in FIRST, the start action SECOND, then Exams, Current Affairs, Mock Tests`, menu[0] === '/auth/login' && ['/auth/signup', '/exams'].includes(menu[1]) && ['/exams', '/current-affairs', '/mock-tests'].every((h) => menu.slice(2).includes(h)), menu.join(' '));
          // L-10 tap targets ≥ 44 px (visible links / summaries)
          const small = await p.evaluate(() => [...document.querySelectorAll('[data-landing="v1"] a, [data-landing="v1"] summary')]
            .filter((a) => { const r = a.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(a).visibility !== 'hidden'; })
            .filter((a) => a.getBoundingClientRect().height < 48)
            .map((a) => `${(a.textContent || a.getAttribute('aria-label') || '').trim().slice(0, 24)}:${Math.round(a.getBoundingClientRect().height)}`));
          chk(`L-10 ${w} px: every visible link / summary is ≥ 48 px tall`, small.length === 0, small.join(', '));
        }
        await p.close();
      }
    }

    // L-6 link check (every internal href on both pages)
    const hrefs = new Set([...info.en.visible ? [] : []]);
    for (const url of ['/', '/hi']) {
      await page.goto(BASE + url, { waitUntil: 'load' });
      for (const h of await page.evaluate(() => [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')))) {
        if (h.startsWith('/') && !h.startsWith('//')) hrefs.add(h.split('#')[0] || '/');
      }
    }
    const bad = [];
    for (const h of hrefs) {
      const r = await fetch(BASE + h, { redirect: 'follow', signal: AbortSignal.timeout(60000) }).catch(() => null);
      if (!r || r.status !== 200) bad.push(`${h}:${r ? r.status : 'ERR'}`);
    }
    chk(`L-6 every internal link answers 200 (${hrefs.size} distinct)`, bad.length === 0, bad.join(' '));

    // L-7 negative paths
    const inv = await fetch(BASE + '/?lang=zz', { signal: AbortSignal.timeout(60000) });
    const invHtml = await inv.text();
    chk('L-7 /?lang=zz (an invalid value) → 200, the English page', inv.status === 200 && invHtml.includes('lang="en" data-landing="v1"') && invHtml.includes('Find your weak topics.'), String(inv.status));
    const nojs = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
    const nj = await nojs.newPage();
    await nj.goto(BASE + '/hi', { waitUntil: 'load' });
    const before = await nj.evaluate(() => ({ h1: document.querySelector('h1') && document.querySelector('h1').textContent, links: document.querySelectorAll('a[href]').length, open: [...document.querySelectorAll('.lp-faq details')].map((d) => d.open) }));
    await nj.click('.lp-faq details:nth-child(2) summary');
    await nj.click('.lp-burger');
    const afterNj = await nj.evaluate(() => ({ second: document.querySelectorAll('.lp-faq details')[1].open, menu: document.querySelector('.lp-menu').open }));
    chk('L-7 JavaScript disabled: the content and links render; a FAQ item and the phone menu still open (native <details>)',
      before.h1 && before.h1.startsWith(H1_HI) && before.links > 20 && before.open[0] === true && afterNj.second === true && afterNj.menu === true, JSON.stringify({ before: { ...before, h1: !!before.h1 }, afterNj }));
    await nojs.close();

    // L-8 CLS
    for (const [vw, vh] of [[390, 844], [1280, 900]]) {
      for (const url of ['/', '/hi']) {
        const c = await browser.newContext({ viewport: { width: vw, height: vh } });
        const p = await c.newPage();
        await p.addInitScript(() => {
          window.__cls = 0;
          new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
        });
        await p.goto(BASE + url, { waitUntil: 'load' });
        await p.waitForTimeout(1200);
        await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); } });
        await p.waitForTimeout(500);
        const cls = await p.evaluate(() => window.__cls);
        chk(`L-8 CLS ${url} @ ${vw} px = ${cls.toFixed(4)} (< 0.1)`, cls < 0.1, cls.toFixed(4));
        await c.close();
      }
    }

    // L-10 reduced motion
    const rm = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1280, height: 900 } });
    const rp = await rm.newPage();
    await rp.goto(BASE + '/', { waitUntil: 'load' });
    const tr = await rp.evaluate(() => [...document.querySelectorAll('.lp-exam, .lp-pill, .lp-faq details')].map((e) => getComputedStyle(e).transitionDuration).filter((d) => d.split(',').some((x) => parseFloat(x) > 0)));
    chk('L-10 prefers-reduced-motion: no transition on cards, buttons, FAQ', tr.length === 0, tr.join(' '));
    await rm.close();

    if (SHOTS) {
      fs.mkdirSync(SHOT_DIR, { recursive: true });
      // JPEG (≈ 250–350 KB each): full-page PNGs were ≈ 0.8–1.2 MB each
      for (const [name, url, vw, vh] of [['desktop-en.jpg', '/', 1280, 900], ['phone-en.jpg', '/', 390, 844], ['phone-hi.jpg', '/hi', 390, 844]]) {
        const c = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 1 });
        const p = await c.newPage();
        await p.goto(BASE + url, { waitUntil: 'load' });
        await p.waitForTimeout(800);
        await p.screenshot({ path: path.join(SHOT_DIR, name), fullPage: true, type: 'jpeg', quality: 78 });
        await c.close();
        console.log(`SHOT docs/design/screens/landing-1/${name}`);
      }
    }
    await ctx.close();
  } catch (e) {
    chk('L-x the page check ran to the end', false, e && e.message ? e.message : e);
  } finally {
    await browser.close().catch(() => {});
  }
  console.log(`LANDING-1 pages: ${passed}/${passed + failed} passed — ${ok ? 'ALL PASS' : 'FAILURES'}`);
  process.exit(ok ? 0 : 1);
})();
