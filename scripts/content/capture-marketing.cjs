#!/usr/bin/env node
/**
 * HOME-1 design upgrade ("honest images"): re-capture the product screenshots used on the home page (public/marketing/).
 * Real app screens from the LOCAL production build, QA identity only (qa-student, CAPTCHA-safe QA session); content is
 * already-public published material. Never a real user, name, e-mail or id.
 *
 * For every shot: the crop's own DOM text is scanned (e-mail / "@", the QA identity's name, UUIDs, long digit runs) —
 * any hit refuses the shot; the PNG is kept outside the repo for the by-eye check; WebP copies are written at fixed
 * widths with the quality lowered until each file fits its byte budget; content/marketing-shots.ts is regenerated
 * (width / height / alt per shot).
 *
 * Modes:
 *   --readonly  learn (anonymous: a signed-in visit would save reading progress), practice (diagnostic question,
 *               GET only), analyze (the existing QA result), revise (Mistake Vault). Every non-GET request is aborted.
 *   --mock      the mock player (timer screen) + the hero phone screen. WRITES: opening the player starts an attempt for
 *               qa-student; the script submits it through the app at the end (nothing left in progress). Take a DB
 *               backup first (LOCAL-FIRST rule: any DB change).
 * Usage (live-gate runner only):
 *   node scripts/live/with-server.cjs -- "node scripts/content/capture-marketing.cjs http://localhost:3100 --readonly --raw=<dir outside repo>"
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const sharp = require('sharp');
const { chromium } = require('playwright');
const { qaBrowserLogin } = require(path.join(ROOT, 'scripts/live/qa-session.cjs'));

const BASE = (process.argv.slice(2).find((a) => /^https?:/.test(a)) || 'http://localhost:3100').replace(/\/$/, '');
const MODE = process.argv.includes('--mock') ? 'mock' : process.argv.includes('--readonly') ? 'readonly' : null;
const RAW = (process.argv.find((a) => a.startsWith('--raw=')) || '').slice(6);
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(BASE).hostname)) { console.error('refused: local build only'); process.exit(2); }
if (!MODE || !RAW || path.resolve(RAW).startsWith(path.resolve(ROOT))) { console.error('usage: <base> --readonly|--mock --raw=<dir OUTSIDE the repo>'); process.exit(2); }
fs.mkdirSync(RAW, { recursive: true });
const OUT = path.join(ROOT, 'public/marketing');
fs.mkdirSync(OUT, { recursive: true });
const MANIFEST = path.join(ROOT, 'content/marketing-shots.json');

const STUDENT = 'qa-student@courage-library.test';
const LESSON = '/learn/english-comprehension/antonyms/opposite-word-meaning';
const PRACTICE = '/practice/session?exam=ssc-cgl&mode=diagnostic';
const RESULT_ATTEMPT = '05a9215d-d1a0-46ed-8d92-60f36e7344b7'; // qa-student's existing submitted fixture attempt
// what may never appear in a marketing image
const PII = [/@/, /qa[\s_-]?student/i, /\bQA\b/, /courage-library\.test/i, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i, /\b\d{10,}\b/];

// copies per target viewport (file suffix) → pixel width: a step card is ≤ 112 / 132 / 200 CSS px wide on a 390 / 768 /
// 1280 px screen, so 240 / 320 / 480 px cover ~2–2.4x device pixels; the hero phone screen is 120 / 200 CSS px
const STEP = { css: { width: 480, height: 360 }, dpr: 3, variants: [['390', 240], ['768', 320], ['1280', 480]], maxBytes: 40 * 1024 };
const HERO = { css: { width: 390, height: 780 }, dpr: 2, variants: [['390', 240], ['1280', 480]], maxBytes: 60 * 1024 };
const SHOTS = {
  learn: { alt: 'A Courage Library lesson: Antonyms, explained in plain English with examples' },
  practice: { alt: 'A practice question from the SSC CGL diagnostic, with its answer options' },
  mock: { alt: 'The mock test screen: the exam timer, the marks for the question and Save & Next' },
  analyze: { alt: 'A mock test result: score, accuracy, and how many answers were correct, wrong or skipped' },
  revise: { alt: 'The Mistake Vault: wrong answers saved to revise, each with a Drill button' },
  hero: { alt: 'Courage Library on a phone: a mock test in progress with the exam timer' },
};

async function encode(name, png, spec) {
  const meta = await sharp(png).metadata();
  const files = {};
  let height = 0;
  for (const [label, w] of spec.variants) {
    let q = 80;
    let buf;
    for (;;) {
      buf = await sharp(png).resize({ width: w }).webp({ quality: q, effort: 6, smartSubsample: true }).toBuffer();
      if (buf.length <= spec.maxBytes || q <= 30) break;
      q -= 5;
    }
    if (buf.length > spec.maxBytes) throw new Error(`${name}-${w}: ${buf.length} B > ${spec.maxBytes} B even at q30`);
    const file = `${name}-${label}.webp`;
    fs.writeFileSync(path.join(OUT, file), buf);
    files[label] = { file, width: w, bytes: buf.length, q };
    height = Math.round((meta.height * w) / meta.width);
  }
  const top = spec.variants[spec.variants.length - 1][1];
  return { width: top, height: Math.round((meta.height * top) / meta.width), files, ratio: `${meta.width}x${meta.height}` };
}

/** scan the text inside the clip (CSS px) and refuse the shot on any personal-data pattern */
async function scan(page, clip) {
  const texts = await page.evaluate((c) => {
    const out = [];
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const t = n.textContent.trim();
      if (!t || !n.parentElement) continue;
      const r = n.parentElement.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || getComputedStyle(n.parentElement).visibility === 'hidden') continue;
      if (r.right > c.x && r.left < c.x + c.width && r.bottom > c.y && r.top < c.y + c.height) out.push(t);
    }
    const inClip = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > c.x && r.left < c.x + c.width && r.bottom > c.y && r.top < c.y + c.height; };
    const alts = [...document.querySelectorAll('img[alt], [aria-label], [title]')].filter(inClip).map((e) => e.getAttribute('alt') || e.getAttribute('aria-label') || e.getAttribute('title')).filter(Boolean);
    const marks = [...document.querySelectorAll('[data-watermark]')].filter((e) => inClip(e) && getComputedStyle(e).display !== 'none').length;
    return { texts: out, alts, marks };
  }, clip);
  if (texts.marks) return { words: 0, hits: ['a visible security watermark'] };
  const all = [...texts.texts, ...texts.alts.filter(Boolean)];
  const hits = all.filter((t) => PII.some((re) => re.test(t)));
  return { words: texts.texts.join(' ').split(/\s+/).length, hits };
}

// the site chrome and the candidate security watermark (it carries a masked candidate id + attempt id) are hidden
const CHROME_CSS = 'body > header, header[data-header-solid], body footer, nav[aria-label="Student"], a[href="#main-content"], [data-sonner-toaster], [data-watermark] { display: none !important; }';

async function shoot(page, name, clipFrom, spec, lift = 12) {
  await page.addStyleTag({ content: CHROME_CSS });
  const el = page.locator(clipFrom).first();
  await el.waitFor({ state: 'visible', timeout: 60000 }).catch(async (e) => { await page.screenshot({ path: path.join(RAW, `${name}-FAILED.png`) }); throw e; });
  await el.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollTo(0, 0));
  const box = await el.boundingBox();
  const y = Math.max(0, Math.round(box.y) - lift);
  await page.evaluate((top) => window.scrollTo(0, top), y);
  await page.waitForTimeout(500);
  const clip = { x: 0, y: 0, width: spec.css.width, height: spec.css.height };
  const s = await scan(page, clip);
  if (s.hits.length) throw new Error(`${name}: personal-data pattern in the crop → refused (${s.hits.length} hit(s))`);
  const png = await page.screenshot({ clip });
  fs.writeFileSync(path.join(RAW, `${name}.png`), png);
  const enc = await encode(name, png, spec);
  console.log(`${name}: ${s.words} words scanned, 0 hits; ${Object.values(enc.files).map((f) => `${f.file} ${(f.bytes / 1024).toFixed(1)} KB q${f.q}`).join(', ')}`);
  return { ...enc, alt: SHOTS[name].alt };
}

(async () => {
  const manifest = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : {};
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const ctxFor = async (spec, signedIn) => {
    const ctx = await browser.newContext({ viewport: spec.css, deviceScaleFactor: spec.dpr, isMobile: spec.css.width < 500, hasTouch: spec.css.width < 500, reducedMotion: 'reduce' });
    if (signedIn) await qaBrowserLogin(ctx, STUDENT, BASE);
    const page = await ctx.newPage();
    page.setDefaultTimeout(120000);
    return { ctx, page };
  };
  try {
    if (MODE === 'readonly') {
      // learn: anonymous (a signed-in view saves reading progress)
      {
        const { ctx, page } = await ctxFor(STEP, false);
        await page.route('**/*', (r) => (r.request().method() === 'GET' ? r.continue() : r.abort()));
        const r = await page.goto(BASE + LESSON, { waitUntil: 'networkidle' });
        if (r.status() !== 200) throw new Error(`learn: ${LESSON} → ${r.status()}`);
        manifest.learn = await shoot(page, 'learn', 'main h2', STEP);
        await ctx.close();
      }
      const { ctx, page } = await ctxFor(STEP, true);
      await page.route('**/*', (r) => (r.request().method() === 'GET' ? r.continue() : r.abort()));
      const pr = await page.goto(BASE + PRACTICE, { waitUntil: 'networkidle' });
      if (pr.status() !== 200) throw new Error(`practice: ${PRACTICE} → ${pr.status()} (run with PRACTICE_ENABLED=true for the local server)`);
      manifest.practice = await shoot(page, 'practice', 'main h1', STEP, 44);
      await page.goto(`${BASE}/mock-tests/${RESULT_ATTEMPT}/result`, { waitUntil: 'networkidle' });
      manifest.analyze = await shoot(page, 'analyze', 'main h1, main h2', STEP);
      await page.goto(`${BASE}/mistakes`, { waitUntil: 'networkidle' });
      manifest.revise = await shoot(page, 'revise', 'main h2', STEP);
      await ctx.close();
    } else {
      // WRITES (backup first): opening the player starts (or resumes) an attempt for qa-student; it is ALWAYS submitted
      // at the end through the app, from a desktop-width page (phones keep "Submit test" inside the palette)
      const ready = async (pg) => {
        const go = pg.getByRole('button', { name: /save\s*&\s*next/i }).first();
        for (let i = 0; i < 10 && !(await go.isVisible().catch(() => false)); i++) {
          const b = pg.getByRole('button', { name: /Begin Test|Resume/i });
          if (await b.count()) await b.first().click().catch(() => undefined);
          await go.waitFor({ state: 'visible', timeout: 15000 }).catch(() => undefined);
        }
        await go.waitFor({ state: 'visible', timeout: 60000 }).catch(async (e) => {
          await pg.screenshot({ path: path.join(RAW, `player-not-ready-${pg.viewportSize().width}.png`) });
          console.log('buttons:', (await pg.getByRole('button').allInnerTexts()).map((t) => t.trim()).filter(Boolean).slice(0, 15).join(' | '));
          throw e;
        });
        await pg.waitForTimeout(1500);
      };
      let takeUrl = null;
      let failure = null;
      try {
        const hero = await ctxFor(HERO, true);
        const page = hero.page;
        await page.goto(`${BASE}/mock-tests`, { waitUntil: 'networkidle' });
        const start = page.getByRole('link', { name: /start (today's )?mock/i }).or(page.getByRole('button', { name: /start (today's )?mock/i })).first();
        // the start link opens the instructions (agree → player) or the player directly (an attempt in progress resumes)
        await Promise.all([page.waitForURL(/\/mock-tests\/[0-9a-f-]{36}(\/take)?(\?|$)/, { timeout: 120000 }), start.click()]);
        if (!/\/take/.test(page.url())) {
          const agree = page.getByRole('button', { name: /I Agree & Start Test/i }).first();
          await agree.waitFor({ state: 'visible' });
          await Promise.all([page.waitForURL(/\/take/), agree.click()]);
        }
        takeUrl = page.url();
        await ready(page);
        manifest.hero = await shoot(page, 'hero', 'main', HERO, 0);
        await hero.ctx.close();
        const step = await ctxFor(STEP, true);
        await step.page.goto(takeUrl, { waitUntil: 'networkidle' });
        await ready(step.page);
        manifest.mock = await shoot(step.page, 'mock', 'main', STEP, 0);
        await step.ctx.close();
      } catch (e) {
        failure = e;
      } finally {
        if (takeUrl) {
          const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
          await qaBrowserLogin(ctx, STUDENT, BASE);
          const pg = await ctx.newPage();
          pg.setDefaultTimeout(120000);
          await pg.goto(takeUrl, { waitUntil: 'networkidle' });
          await ready(pg);
          await pg.getByRole('button', { name: /^submit test$/i }).first().click();
          const confirm = pg.getByRole('dialog').getByRole('button', { name: /submit test/i });
          await confirm.first().waitFor({ state: 'visible', timeout: 30000 });
          await Promise.all([pg.waitForURL(/result/, { timeout: 180000 }).catch(() => undefined), confirm.first().click()]);
          console.log(`attempt submitted: ${/result/.test(pg.url()) ? 'yes (result page)' : 'NO — check qa-student for an in-progress attempt'}`);
          await ctx.close();
        } else {
          console.log('attempt: the player was never opened (nothing to submit)');
        }
      }
      if (failure) throw failure;
    }
  } finally {
    await browser.close();
  }
  fs.writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log('manifest:', Object.keys(manifest).join(', '));
})().catch((e) => { console.log('ERROR', String(e.message).replace(/[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+/g, '[ip]').slice(0, 300)); process.exit(1); });
