#!/usr/bin/env node
/**
 * LOGO-UX-1 + LOGO-P0b end-to-end (admin, against a locally running production build; local dev host only).
 * Works ONLY on its own fixture body "QA Logo Fixture <run>" (slug qa-logo-fixture-<run>); the owner's real bodies and
 * logos are never opened, and the SSC logo row is compared before / after. The fixture body, its stored files and the
 * browser state are removed in `finally`.
 *   L-1  Add body: drag-and-drop a PNG → preview at the 3 placements (48 / 32 / 28) → alt auto-filled → Add body →
 *        toast; the card shows "Logo added"
 *   L-2  SVG refused inline; nothing sent
 *   L-3  1.5 MB payload (browser resize forced to return it) → "File is 1.5 MB; maximum is 1 MB…"; NOTHING sent
 *   L-4  oversize ORIGINAL (≈1.5 MB photo-like PNG) → resized in the browser (< 1 MB sent) → saved; stored file is a
 *        512 × 512 WebP made by the server
 *   L-5  0.95 MB payload sent as-is (resize bypassed) → accepted end to end (the server validates it; 2 MB body limit)
 *   L-6  forced action failure (the POST answered 413, as production did) → inline "nothing was changed"; the page and
 *        the drawer stay (no error boundary). Negative control: L-4/L-5 (no interception) saved through the same path
 *   L-7  remove (confirmed) → "Logo missing"
 *   L-8  staff: the cards are read-only (no card buttons, no "Add body")
 *   L-1c the saved logo actually loads in the body card (naturalWidth 512) from our OWN origin (/media/logos/…, the
 *        LOGO-MEDIA-1 rewrite) — never the storage host
 *   L-10 exam-level override (Advanced) on the internal QA exam `qa-syllabus-test` (never a real exam): save → the
 *        exam row shows it → "Use the body's logo" (confirmed) → cleared; the override is cleared in `finally` too
 *   L-9  axe 0 serious / critical on the page and with the drawer open; layout shift on load < 0.1
 * --dry-run (the first run, non-writing): L-2, L-3 and the preview of L-1 only — no action is ever sent.
 * Screenshots (no personal data) go to E2E_SCREENS_DIR when set, never into the repo.
 * Usage: node scripts/e2e/logo-ux1.cjs [--dry-run]
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { chromium } = require('playwright');
const { qaBrowserLogin } = require('../live/qa-session.cjs');
const { BASE, admin } = require('./_e2e-env.cjs');

const DRY = process.argv.includes('--dry-run');
const SHOTS = process.env.E2E_SCREENS_DIR || '';
const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const RUN = `${Date.now().toString(36)}`;
const BODY = `QA Logo Fixture ${RUN}`;
const SLUG = `qa-logo-fixture-${RUN}`;
let failed = 0;
const step = (n, ok, info = '') => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${info ? ' — ' + info : ''}`); };

const png = (w, h, noise = false) => {
  if (!noise) return sharp({ create: { width: w, height: h, channels: 4, background: { r: 29, g: 78, b: 216, alpha: 1 } } }).png().toBuffer();
  const raw = Buffer.alloc(w * h * 3);
  for (let i = 0; i < raw.length; i++) raw[i] = (i * 2654435761) >>> 24; // deterministic noise: big PNGs
  return sharp(raw, { raw: { width: w, height: h, channels: 3 } }).png({ compressionLevel: 0 }).toBuffer();
};
/** a PNG of about `bytes` bytes (uncompressed noise, then cropped to size) */
async function pngOfSize(bytes) {
  let side = Math.ceil(Math.sqrt(bytes / 3));
  let best = null;
  for (let i = 0; i < 12; i++) {
    const b = await png(side, side, true);
    if (!best || Math.abs(b.length - bytes) < Math.abs(best.length - bytes)) best = b;
    if (b.length >= bytes * 0.97 && b.length <= bytes * 1.01) return b;
    side = Math.max(300, Math.round(side * Math.sqrt(bytes / b.length)));
  }
  if (Math.abs(best.length - bytes) > bytes * 0.05) throw new Error(`fixture size: wanted ${bytes}, got ${best.length}`);
  return best;
}

async function main() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const files = {
    logo: await png(600, 400),
    svg: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><script>alert(1)</script><rect width="300" height="300"/></svg>'),
    original15: await pngOfSize(1.5 * 1024 * 1024),
    payload15: await pngOfSize(1.5 * 1024 * 1024),
    payload095: await pngOfSize(0.95 * 1024 * 1024),
  };
  console.log(`  fixtures: original ${(files.original15.length / 1048576).toFixed(2)} MB, payloads ${(files.payload15.length / 1048576).toFixed(2)} / ${(files.payload095.length / 1048576).toFixed(2)} MB`);
  const ssc = async () => (await admin.from('conducting_orgs').select('logo_path, logo_alt, logo_updated_at').eq('slug', 'ssc').maybeSingle()).data;
  const sscBefore = await ssc();
  let orgId = null;
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await qaBrowserLogin(ctx, 'qa-admin@courage-library.test', BASE);
    const page = await ctx.newPage();
    await page.addInitScript(() => {
      window.__cls = 0;
      try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true }); } catch {}
      // test hook (this page only, set by the test): canvas.toBlob returns a given payload instead of the resized image
      // bytes of every Server Action body the page sends (FormData files + fields), read before it leaves the page
      window.__sent = [];
      const of = window.fetch;
      window.fetch = function (input, init) {
        const h = init && init.headers;
        const isAction = h && (h['Next-Action'] || h['next-action'] || (typeof h.get === 'function' && h.get('next-action')));
        if (isAction && init.body instanceof FormData) {
          let n = 0;
          for (const [, v] of init.body.entries()) n += typeof v === 'string' ? v.length : v.size;
          window.__sent.push(n);
        }
        return of.apply(this, arguments);
      };
      const orig = HTMLCanvasElement.prototype.toBlob;
      HTMLCanvasElement.prototype.toBlob = function (cb, type, q) {
        if (window.__forceBlob) return cb(window.__forceBlob);
        return orig.call(this, cb, type, q);
      };
    });
    // bytes of every Server Action request the browser actually sent (multipart bodies are not exposed as post data)
    const posts = [];
    page.on('request', (r) => { if (r.method() === 'POST' && r.headers()['next-action']) posts.push(r); });
    const sentLog = () => page.evaluate(() => window.__sent.slice());
    const axe = async () => { await page.addScriptTag({ content: AXE }); return page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations.filter((v) => ['serious', 'critical'].includes(v.impact)).map((v) => `${v.id}×${v.nodes.length}`)); };
    const shot = async (n) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, `${n}.png`) }); } };
    const drawer = () => page.locator('dialog[data-studio-drawer][open]');
    const setFile = async (buf, name, type) => drawer().locator('[data-logo-input]').setInputFiles({ name, mimeType: type, buffer: buf });
    const dropFile = async (buf, name, type) => {
      const dt = await page.evaluateHandle(({ b64, name, type }) => {
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const d = new DataTransfer();
        d.items.add(new File([bytes], name, { type }));
        return d;
      }, { b64: buf.toString('base64'), name, type });
      await drawer().locator('[data-logo-dropzone]').dispatchEvent('dragover', { dataTransfer: dt });
      await drawer().locator('[data-logo-dropzone]').dispatchEvent('drop', { dataTransfer: dt });
    };
    const forceBlob = (buf, type) => page.evaluate(({ b64, type }) => { window.__forceBlob = b64 ? new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], { type }) : null; }, { b64: buf ? buf.toString('base64') : null, type });
    const toast = () => page.locator('[role="status"]').filter({ hasText: /Logo saved|added with its logo|Logo removed/ }).first();
    /** waits for success (drawer closed + toast); on an inline error / timeout throws with what the drawer says */
    const saved = async () => {
      const r = await Promise.race([
        // success closes the drawer (a toast from an earlier save may still be showing, so the toast alone is no signal)
        page.locator('dialog[data-studio-drawer][open]').waitFor({ state: 'detached', timeout: 60000 }).then(() => toast().waitFor({ timeout: 10000 })).then(() => null),
        page.locator('dialog[open] [data-logo-error]').waitFor({ timeout: 60000 }).then(async () => `inline error: ${await page.locator('dialog[open] [data-logo-error]').textContent()}`),
      ]).catch(() => 'timeout');
      if (r) { await shot('fail-save'); throw new Error(`save did not succeed (${r}; boundary ${await boundary()})`); }
    };
    const boundary = () => page.locator('text=This page could not be loaded').count();

    await page.goto(`${BASE}/admin/exams`, { waitUntil: 'load', timeout: 180000 });
    await page.locator('[data-conducting-bodies]').scrollIntoViewIfNeeded();
    await shot('01-bodies-grid');
    await page.waitForTimeout(2000);
    const loadCls = await page.evaluate(() => window.__cls);
    const a0 = await axe();
    step('L-9a page: axe 0 serious/critical; layout shift on load < 0.1', a0.length === 0 && loadCls < 0.1, `${a0.join(' ')} cls ${loadCls}`);

    // ---- L-1 (preview) / L-2 / L-3 in the Add body drawer
    await page.locator('[data-add-body]').click();
    await drawer().waitFor();
    await drawer().getByLabel('Official name').fill(BODY);
    await dropFile(files.logo, 'logo.png', 'image/png');
    await drawer().locator('[data-logo-prepared]').waitFor({ timeout: 15000 });
    const sizes = await drawer().locator('[data-preview-placement] [data-exam-logo]').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().width)));
    const alt = await drawer().locator('[data-logo-alt]').inputValue();
    step('L-1a drag-and-drop → preview at hub / card / admin row (48 / 32 / 28); alt auto-filled', sizes.join() === '48,32,28' && alt === `${BODY} logo`, `${sizes} "${alt}"`);
    const a1 = await axe();
    step('L-9b drawer open: axe 0 serious/critical', a1.length === 0, a1.join(' '));
    await shot('02-add-body-preview');

    const sent0 = posts.length;
    await setFile(files.svg, 'logo.svg', 'image/svg+xml');
    const svgMsg = await drawer().locator('[data-logo-file-error]').textContent({ timeout: 10000 });
    step('L-2 SVG refused inline; nothing sent', /Only PNG, JPG or WebP/.test(svgMsg || '') && posts.length === sent0, svgMsg);
    await forceBlob(files.payload15, 'image/png');
    await setFile(files.logo, 'logo.png', 'image/png');
    const bigMsg = await drawer().locator('[data-logo-file-error]').textContent({ timeout: 10000 });
    await forceBlob(null);
    step('L-3 1.5 MB payload → "File is 1.5 MB; maximum is 1 MB. Resize to 512×512 and try again."; nothing sent', bigMsg === 'File is 1.5 MB; maximum is 1 MB. Resize to 512×512 and try again.' && posts.length === sent0 && (await drawer().locator('[data-logo-save]').isDisabled()), bigMsg);
    await shot('03-too-large');

    if (DRY) {
      step('DRY-RUN: no Server Action was sent', posts.length === 0, `${posts.length} sent`);
      return;
    }

    // ---- L-1 save
    await dropFile(files.logo, 'logo.png', 'image/png');
    await drawer().locator('[data-logo-prepared]').waitFor();
    await drawer().locator('[data-logo-save]').click();
    await saved();
    const created = (await admin.from('conducting_orgs').select('id, logo_path, logo_alt').eq('slug', SLUG).maybeSingle()).data;
    orgId = created && created.id;
    const card = page.locator(`[data-org="${SLUG}"]`);
    await card.locator('[data-logo-ok]').waitFor({ timeout: 30000 });
    step('L-1b Add body → body created WITH its logo; toast; card "Logo added"', Boolean(created && created.logo_path && created.logo_alt === `${BODY} logo`), JSON.stringify(created));
    const img = card.locator('img');
    await img.scrollIntoViewIfNeeded();
    await page.waitForFunction((sel) => { const i = document.querySelector(sel); return i && i.complete && i.naturalWidth > 0; }, `[data-org="${SLUG}"] img`, { timeout: 20000 }).catch(() => {});
    const nat = await img.evaluate(async (i) => {
      let status = 0;
      let type = '';
      try { const r = await fetch(i.src, { cache: 'no-store' }); status = r.status; type = r.headers.get('content-type') || ''; } catch (e) { status = -1; type = String(e && e.name); }
      return { w: i.naturalWidth, src: new URL(i.src).origin === location.origin && /^\/media\/logos\/orgs\//.test(new URL(i.src).pathname), status, type };
    });
    step('L-1c the saved logo loads in the card from the same-origin /media/logos rewrite', nat.w === 512 && nat.src, JSON.stringify(nat));
    await shot('04-body-added');

    // ---- L-4 replace with an oversize original (resized in the browser)
    await card.locator('button').click();
    await drawer().waitFor();
    const before4 = posts.length;
    const sentBefore4 = (await sentLog()).length;
    await setFile(files.original15, 'big-original.png', 'image/png');
    const prepText = await drawer().locator('[data-logo-prepared]').textContent({ timeout: 20000 });
    await drawer().locator('[data-logo-save]').click();
    await saved();
    const sent4 = (await sentLog()).slice(sentBefore4);
    const r4 = (await admin.from('conducting_orgs').select('logo_path').eq('id', orgId).single()).data;
    const stored = r4 && (await admin.storage.from('org-logos').download(r4.logo_path)).data;
    const meta = stored ? await sharp(Buffer.from(await stored.arrayBuffer())).metadata() : {};
    step('L-4 oversize original (≈1.5 MB) resized in the browser → < 1 MB sent → saved as a 512×512 WebP; replaced', /original \d+ × \d+, 1\.\d MB/.test(prepText || '') && posts.length - before4 === 1 && sent4.length === 1 && sent4[0] > 0 && sent4[0] < 1024 * 1024 && r4.logo_path !== created.logo_path && meta.format === 'webp' && meta.width === 512, `${prepText} · sent ${sent4.map((b) => (b / 1024).toFixed(0) + ' KB')} · ${meta.format} ${meta.width}`);

    // ---- L-6 forced action failure (413 like production) → inline error, page intact
    await card.locator('button').click();
    await drawer().waitFor();
    await page.route(`${BASE}/admin/exams`, (route) => (route.request().method() === 'POST' ? route.fulfill({ status: 413, contentType: 'text/plain', body: 'Body exceeded 1 MB limit' }) : route.continue()));
    await setFile(files.logo, 'logo.png', 'image/png');
    await drawer().locator('[data-logo-prepared]').waitFor();
    await drawer().locator('[data-logo-save]').click();
    const err6 = await drawer().locator('[data-logo-error]').textContent({ timeout: 30000 });
    await page.unroute(`${BASE}/admin/exams`);
    const r6 = (await admin.from('conducting_orgs').select('logo_path').eq('id', orgId).single()).data;
    step('L-6 the upload POST answered 413 → inline "nothing was changed"; drawer + page intact; no error boundary; row unchanged', /nothing was changed/.test(err6 || '') && (await boundary()) === 0 && (await drawer().count()) === 1 && r6.logo_path === r4.logo_path, err6);
    await shot('05-forced-413-inline');

    // ---- L-5 0.95 MB payload sent as-is (server validates; under the 2 MB body limit)
    const before5 = posts.length;
    const sentBefore5 = (await sentLog()).length;
    const prev5 = await drawer().locator('[data-logo-prepared]').textContent();
    await forceBlob(files.payload095, 'image/png');
    await setFile(files.logo, 'logo.png', 'image/png');
    await page.waitForFunction((prev) => { const t = document.querySelector('dialog[open] [data-logo-prepared]'); return t && t.textContent !== prev; }, prev5, { timeout: 20000 });
    await forceBlob(null);
    await drawer().locator('[data-logo-save]').click();
    await saved();
    const sent5 = (await sentLog()).slice(sentBefore5);
    const r5 = (await admin.from('conducting_orgs').select('logo_path').eq('id', orgId).single()).data;
    step('L-5 0.95 MB payload accepted end to end (server sniffed, validated, re-encoded); the body limit no longer rejects it', posts.length - before5 === 1 && sent5.length === 1 && sent5[0] > 0.9 * 1024 * 1024 && r5.logo_path !== r4.logo_path && (await boundary()) === 0, `sent ${sent5.map((b) => (b / 1048576).toFixed(2) + ' MB')}`);

    // ---- L-7 remove (confirmed)
    await card.locator('button').click();
    await drawer().waitFor();
    await drawer().getByRole('button', { name: 'Remove logo' }).click();
    await drawer().locator('[data-logo-remove-confirm]').click();
    await card.locator('[data-logo-missing]').waitFor({ timeout: 30000 });
    const r7 = (await admin.from('conducting_orgs').select('logo_path').eq('id', orgId).single()).data;
    step('L-7 remove (confirmed) → "Logo missing"; row cleared', r7.logo_path === null);
    await shot('06-removed');

    // ---- L-10 exam-level override on the internal QA exam only
    const qaCard = page.locator('[data-exam-card="qa-syllabus-test"]');
    // the L-7 toast (fixed, bottom right) can sit over the card: let it auto-dismiss, then centre the card
    await toast().waitFor({ state: 'detached', timeout: 15000 }).catch(() => {});
    await qaCard.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await qaCard.locator('[data-exam-logo-advanced]').click();
    await drawer().waitFor();
    const advTitle = await drawer().locator('h2').textContent();
    await dropFile(files.logo, 'exam-logo.png', 'image/png');
    await drawer().locator('[data-logo-prepared]').waitFor();
    await drawer().locator('[data-logo-save]').click();
    const examSaved = await Promise.race([
      page.locator('dialog[data-studio-drawer][open]').waitFor({ state: 'detached', timeout: 60000 }).then(() => true),
      page.locator('dialog[open] [data-logo-error]').waitFor({ timeout: 60000 }).then(() => false),
    ]).catch(() => false);
    const q1 = (await admin.from('exams').select('logo_override_path').eq('slug', 'qa-syllabus-test').single()).data;
    await qaCard.locator('[data-exam-logo]').first().waitFor({ timeout: 30000 }).catch(() => {});
    const rowShows = await qaCard.locator('[data-exam-logo]').count();
    await qaCard.locator('[data-exam-logo-advanced]').click();
    await drawer().waitFor();
    await drawer().getByRole('button', { name: "Use the body's logo" }).click();
    await drawer().locator('[data-logo-remove-confirm]').click();
    await page.locator('dialog[data-studio-drawer][open]').waitFor({ state: 'detached', timeout: 60000 }).catch(() => {});
    const q2 = (await admin.from('exams').select('logo_override_path').eq('slug', 'qa-syllabus-test').single()).data;
    step('L-10 Advanced: exam-level override on the QA exam → saved, shown on its row, then "Use the body\'s logo" clears it', /Exam's own logo/.test(advTitle || '') && examSaved && Boolean(q1 && q1.logo_override_path) && rowShows >= 1 && q2 && q2.logo_override_path === null, `${advTitle} · saved ${examSaved} · row ${rowShows} · after ${q2 && q2.logo_override_path}`);
    await ctx.close();

    // ---- L-8 staff read-only
    const sctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await qaBrowserLogin(sctx, 'qa-staff@courage-library.test', BASE);
    const sp = await sctx.newPage();
    await sp.goto(`${BASE}/admin/exams`, { waitUntil: 'load', timeout: 180000 });
    const panel = sp.locator('[data-conducting-bodies]');
    await panel.waitFor();
    const staffButtons = await panel.locator('button').count();
    const staffCards = await panel.locator('li[data-org]').count();
    step('L-8 staff: cards shown read-only (no card buttons, no "Add body"); no "Advanced" logo controls', staffCards > 0 && staffButtons === 0 && (await sp.locator('[data-exam-logo-advanced]').count()) === 0, `${staffCards} cards, ${staffButtons} buttons`);
    if (SHOTS) await sp.screenshot({ path: path.join(SHOTS, '07-staff-read-only.png') });
    await sctx.close();
  } finally {
    // the fixture body + its stored files go, whatever happened; never another body
    const { data: rows } = await admin.from('conducting_orgs').select('id, slug').like('slug', `qa-logo-fixture-${RUN}%`);
    for (const r of rows || []) {
      for (let i = 1; i <= 3; i++) {
        try {
          const { data: objs } = await admin.storage.from('org-logos').list(`orgs/${r.id}`);
          if (objs && objs.length) await admin.storage.from('org-logos').remove(objs.map((o) => `orgs/${r.id}/${o.name}`));
          const d = await admin.from('conducting_orgs').delete().eq('id', r.id);
          if (d.error) throw new Error(d.error.code || d.error.message);
          const still = (await admin.from('conducting_orgs').select('id').eq('id', r.id)).data || [];
          if (!still.length) break;
          throw new Error('row still present');
        } catch (e) {
          console.log(`  WARN  cleanup attempt ${i}: ${String(e.message).slice(0, 120)}`);
          await new Promise((ok) => setTimeout(ok, 2000));
        }
      }
    }
    const left = (await admin.from('conducting_orgs').select('id').like('slug', `qa-logo-fixture-${RUN}%`)).data || [];
    step(`CLEANUP fixture body removed (${(rows || []).length} found)`, left.length === 0);
    // the QA exam's override (L-10) never outlives the run
    const { data: qa } = await admin.from('exams').select('id, logo_override_path').eq('slug', 'qa-syllabus-test').maybeSingle();
    if (qa && qa.logo_override_path) {
      await admin.from('exams').update({ logo_override_sha256: null, logo_override_alt: null }).eq('id', qa.id);
      console.log('  WARN  cleared the QA exam override left by a failed L-10');
    }
    if (qa) {
      const { data: objs } = await admin.storage.from('org-logos').list(`exams/${qa.id}`);
      if (objs && objs.length) await admin.storage.from('org-logos').remove(objs.map((o) => `exams/${qa.id}/${o.name}`));
    }
    const sscAfter = await ssc();
    step("CLEANUP the owner's SSC logo row untouched", JSON.stringify(sscAfter) === JSON.stringify(sscBefore));
    await browser.close();
  }
}

main()
  .catch((e) => { failed++; console.log(`FAIL  suite — ${String(e && e.message ? e.message : e).replace(/[a-z0-9.-]+\.supabase\.(co|com)/gi, '[host]').slice(0, 300)}`); })
  .finally(() => { console.log(`\nLOGO-UX-1 E2E${DRY ? ' (dry run)' : ''}: ${failed ? `${failed} FAILED` : 'all passed'}`); process.exit(failed ? 1 : 0); });
