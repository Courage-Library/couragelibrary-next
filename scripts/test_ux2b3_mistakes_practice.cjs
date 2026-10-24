/**
 * UX-2b.3: /mistakes + /practice (P0 a11y / dead-CTA fixes, honest stats, design-system migration).
 *
 * Static (always; no network):
 *   S-1 touched files score 0 on the ratchet metrics (raw colour, palette class, dark:, text < 12px, legacy import)
 *   S-2 touched files: no transition-all, no dead animate-in / zoom-in / fade-in / slide-in / animate-pulse-subtle,
 *       no hover:scale, no font-black / font-extrabold, no opacity-* utility (no dimmed text)
 *   S-3 no nested interactive markup: no <Link> / <a> wrapping a <Button> / <button>
 *   S-4 /practice: no <Button>/<button> (every CTA is a link); no "Adaptive" / PYQ claim
 *   S-5 jargon is gone from the /mistakes UI source (MPI, Cognitive Failure Breakdown, Longitudinal Journey,
 *       Cross-Exam Intelligence, Personal Revision Engine, Remediation, slip)
 *   S-6 retention never falls back to a made-up 100%: the "Stayed mastered" value is null (shown "—") when nothing is
 *       mastered, with the hint "Master a mistake to see your retention"
 * Live (local build; qa-student from .env.local, never printed; read-only: FAILS on any non-GET request except sign-in):
 *   L-1  /practice: every CTA in <main> is a link whose href answers 200 for the student; no <button> in <main>;
 *        no "Adaptive" / "PYQ" text
 *   L-2  /mistakes at 360 / 768 / 1280: signed-in view, axe 0 critical + 0 serious (incl. color-contrast), before and
 *        after expanding every accordion section
 *   L-3  every <select> has an accessible name from a visible <label>; no nested interactive elements; every link /
 *        button in <main> has an accessible name
 *   L-4  no computed text < 12px inside <main> (accordions expanded); tap targets in <main> ≥ 44 px at 360
 *   L-5  honesty: with 0 mastered, "Stayed mastered" shows "—" + "Master a mistake to see your retention", never
 *        "100%"; the jargon strings are absent from the rendered page
 *   L-6  empty states render EmptyState: 0 mistakes (anonymous visitor: no vault rows), 0 bookmarks (?bookmarked=true;
 *        VACUOUS if qa-student has bookmarks), filtered to nothing (?q=<no match>)
 *   L-7  filters keep the URL contract: status=UNRESOLVED / REVISITING / MASTERED, repeated=true, bookmarked=true,
 *        q, subject, cognitive, sort, page; the filter links carry those params; the filter form (explicit "Apply filters") sets subject and keeps status
 *   L-8  signed out: /mistakes, /mistakes?bookmarked=true, /mistakes/drill and /practice answer exactly as before
 *        UX-2b.3 (200, no redirect; /mistakes shows its empty state)
 *
 * Run:  node scripts/test_ux2b3_mistakes_practice.cjs --offline
 *       node scripts/live/with-server.cjs -- "node scripts/test_ux2b3_mistakes_practice.cjs http://localhost:3100"
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OFFLINE = process.argv.includes('--offline');
const BASE = (process.argv.slice(2).find((a) => /^https?:/.test(a)) || 'http://localhost:3100').replace(/\/$/, '');

const PRACTICE = 'app/practice/page.tsx';
const FILES = [
  PRACTICE,
  'app/mistakes/page.tsx',
  ...['hero', 'kpi-strip', 'revision-health', 'longitudinal-card', 'filter-bar', 'card', 'bookmark-button', 'pagination', 'empty-state', 'sidebar'].map(
    (n) => `components/mistakes/mistake-${n}.tsx`,
  ),
];
// + UX-1b U-1 system words, which can arrive through stored data (e.g. mistake-type descriptions)
const JARGON = [/\bMPI\b/, /Cognitive Failure Breakdown/i, /Longitudinal Journey/i, /Cross-Exam Intelligence/i, /Personal Revision Engine/i, /\bRemediation\b/i, /telemetry/i, /deterministic/i];
// UI source only: "slip" as UI wording is gone, but "Calculation Slip" is a mistake-type NAME from the service data
// (MistakeLongitudinalIntelligenceService.CANONICAL_COGNITIVE_TYPES), so the rendered-page check does not ban it
const JARGON_SOURCE = [...JARGON, /\bslips?\b/i];

let passed = 0;
let failed = 0;
let vacuous = 0;
const check = (id, name, ok, info) => {
  if (ok) passed++;
  else failed++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${id} ${name}${info ? ' — ' + info : ''}`);
};
const warnVacuous = (id, name) => {
  vacuous++;
  console.log(`  WARN  VACUOUS (0 items): ${id} ${name}`);
};

// ---- ratchet metrics (same regexes as scripts/test_design_ratchet.cjs) ----
const PALETTE = 'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';
const PROPS = 'bg|text|border(?:-[trblxyse])?|ring(?:-offset)?|outline|fill|stroke|from|via|to|divide|placeholder|decoration|shadow|accent|caret|inset-shadow|drop-shadow';
const RX = {
  rawColor: [/(?<![\w&/])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![\w-])/g, /(?<![a-zA-Z])(?:rgba?|hsla?|oklch|oklab|lab|lch)\(/g],
  paletteClass: new RegExp(`(?<![\\w-])(?:${PROPS})-(?:${PALETTE})-(?:50|[1-9]00|950)(?:\\/\\d+)?(?![\\w-])`, 'g'),
  darkClass: /(?<![\w-])dark:/g,
};
function smallText(src) {
  let n = 0;
  for (const m of src.matchAll(/text-\[(\d*\.?\d+)px\]/g)) if (parseFloat(m[1]) < 12) n++;
  for (const m of src.matchAll(/text-\[(\d*\.?\d+)rem\]/g)) if (parseFloat(m[1]) < 0.75) n++;
  for (const m of src.matchAll(/fontSize\s*:\s*["']?(\d*\.?\d+)(px)?["']?\s*[,}]/g)) if (parseFloat(m[1]) < 12) n++;
  return n;
}

function staticChecks() {
  console.log('Static');
  const src = Object.fromEntries(FILES.map((f) => [f, fs.readFileSync(path.join(ROOT, f), 'utf8')]));
  const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''); // comments may name banned things

  const metrics = FILES.map((f) => {
    const s = src[f];
    const raw = RX.rawColor.reduce((n, rx) => n + (s.match(rx) || []).length, 0);
    return [f, raw, (s.match(RX.paletteClass) || []).length, (s.match(RX.darkClass) || []).length, smallText(s), (s.match(/@\/components\/ui\/legacy\//g) || []).length];
  }).filter((r) => r.slice(1).some((n) => n > 0));
  check('S-1', `touched files score 0 on the ratchet metrics (${FILES.length} files)`, metrics.length === 0, metrics.map((r) => `${r[0]} ${r.slice(1).join('/')}`).join('; '));

  const MOTION = /transition-all|animate-in\b|zoom-in-\d+|fade-in\b|slide-in-from|animate-pulse-subtle|hover:scale|group-hover:scale|font-black|font-extrabold|(?<![\w-])opacity-\d+/g;
  const motion = FILES.map((f) => [f, code(src[f]).match(MOTION) || []]).filter(([, m]) => m.length);
  check('S-2', 'no transition-all / dead animate classes / hover scale / weights > 700 / opacity utilities', motion.length === 0, motion.map(([f, m]) => `${f}: ${[...new Set(m)].join(',')}`).join('; '));

  const NESTED = /<(Link|a)\b[^>]*>\s*<(Button|button)\b/;
  const nested = FILES.filter((f) => NESTED.test(src[f]));
  check('S-3', 'no <Link>/<a> wrapping a <Button>/<button>', nested.length === 0, nested.join(', '));

  const p = code(src[PRACTICE]);
  check('S-4', '/practice: every CTA is a link (no <Button>/<button>); no "Adaptive" or PYQ claim',
    !/<(Button|button)\b/.test(p) && !/Adaptive|PYQ|previous years/i.test(p) && (p.match(/<ButtonLink\b/g) || []).length >= 2,
    `${(p.match(/<ButtonLink\b/g) || []).length} ButtonLinks`);

  const jar = [];
  for (const f of FILES.filter((x) => x !== PRACTICE)) {
    // only UI strings matter: JSX text and string literals (identifiers such as mpi / recommendationReason are data)
    const strings = (code(src[f]).match(/>[^<>{}]+<|"[^"\n]*"|`[^`]*`/g) || []).join('\n');
    for (const rx of JARGON_SOURCE) if (rx.test(strings)) jar.push(`${f}: ${rx.source}`);
  }
  check('S-5', 'no jargon strings in the /mistakes UI source', jar.length === 0, jar.join('; '));

  const lc = src['components/mistakes/mistake-longitudinal-card.tsx'];
  check('S-6', 'retention shows "—" (null) when nothing is mastered; no "100%" fallback',
    /value=\{masteredCount > 0 \? `\$\{retentionPct\}%` : null\}/.test(lc) && /Master a mistake to see your retention/.test(lc) && !/"100%"/.test(lc));
}

// ---------------------------------------------------------------- live ----
async function live() {
  const { chromium } = require('playwright');
  const { readEnv } = require('./db/_db-env.cjs');
  const AXE = fs.readFileSync(path.join(ROOT, 'node_modules', 'axe-core', 'axe.min.js'), 'utf8');
  const password = readEnv()('QA_STUDENT_PASSWORD');
  if (!password) throw new Error('QA_STUDENT_PASSWORD missing (never printed)');

  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const nonGet = [];
  const watch = (page, who) =>
    page.on('request', (rq) => {
      if (!['GET', 'HEAD'].includes(rq.method())) nonGet.push(`${who} ${rq.method()} ${new URL(rq.url()).pathname.replace(/[0-9a-f-]{36}/g, '[id]')}`);
    });

  const axe = async (page) => {
    await page.addScriptTag({ content: AXE });
    return page.evaluate(async () => {
      const r = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } });
      return r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}×${v.nodes.length}`);
    });
  };
  const expandAll = (page) =>
    page.evaluate(() => {
      for (const b of document.querySelectorAll('main button[aria-expanded="false"]')) b.click();
    });
  const probe = (page) =>
    page.evaluate(() => {
      const main = document.querySelector('main') || document.body;
      const vis = (el) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
      };
      const interactive = [...main.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, summary')].filter(vis);
      const inline = (el) => el.tagName === 'A' && el.closest('p, li') && getComputedStyle(el).display === 'inline';
      const small = interactive.filter((el) => !inline(el) && el.getAttribute('aria-hidden') !== 'true').filter((el) => {
        const r = el.getBoundingClientRect();
        return r.height < 44 || r.width < 44;
      });
      const name = (el) =>
        (el.getAttribute('aria-label') || (el.getAttribute('aria-labelledby') || '').split(' ').map((id) => document.getElementById(id)?.textContent || '').join(' ') || el.textContent || el.getAttribute('title') || '').trim();
      const unnamed = interactive.filter((el) => ['A', 'BUTTON'].includes(el.tagName) && !name(el));
      const selects = [...main.querySelectorAll('select')];
      const unlabelled = selects.filter((s) => !(s.id && document.querySelector(`label[for="${s.id}"]`)?.textContent.trim()));
      const nested = main.querySelectorAll('a a, a button, button a, button button, a input, button input').length;
      const textEls = [...main.querySelectorAll('*')].filter((el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && vis(el));
      const tiny = textEls.filter((el) => parseFloat(getComputedStyle(el).fontSize) < 12 && !el.closest('.sr-only'));
      return {
        h1: [...document.querySelectorAll('h1')].map((h) => h.textContent.trim()),
        // the signed-out header always offers "Get started" (every width); the signed-in header never does
        signedIn: !!document.querySelector('header') && !/Get started/.test(document.querySelector('header').textContent || ''),
        interactive: interactive.length,
        small: small.length,
        smallEx: small.slice(0, 4).map((el) => `${name(el).slice(0, 24)} ${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)}`),
        unnamed: unnamed.length,
        selects: selects.length,
        unlabelled: unlabelled.length,
        nested,
        textEls: textEls.length,
        tiny: tiny.length,
        tinyEx: tiny.slice(0, 3).map((el) => `${el.textContent.trim().slice(0, 20)}@${getComputedStyle(el).fontSize}`),
        text: main.innerText,
        emptyTitle: [...main.querySelectorAll('.border-dashed h2, .border-dashed h3, .border-dashed h4')].map((h) => h.textContent.trim()),
        // the "Stayed mastered" StatTile only (its label is the tile's first span)
        retentionTile: ([...main.querySelectorAll('span')].find((sp) => sp.textContent.trim() === 'Stayed mastered')?.parentElement?.innerText || '').replace(/\s*\n\s*/g, ' | '),
        cards: main.querySelectorAll('article[aria-label^="Mistake:"]').length,
        cardText: [...main.querySelectorAll('article[aria-label^="Mistake:"]')].map((a) => a.innerText),
        hrefs: [...main.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')),
        mainButtons: main.querySelectorAll('button').length,
      };
    });

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(60000);
  watch(page, 'student');
  // CI-FIX-1 (#74): CAPTCHA-safe QA session cookies (no login form; scripts/live/qa-session.cjs)
  await require('./live/qa-session.cjs').qaBrowserLogin(ctx, 'qa-student@courage-library.test', BASE);
  console.log('Live (signed in as the QA student)');
  // A signed-in render is required: the server's getUser() can time out on a slow network and render the anonymous view.
  const go = async (url, width = 1280) => {
    await page.setViewportSize({ width, height: width === 360 ? 780 : 900 });
    let res;
    let p;
    for (let i = 1; i <= 3; i++) {
      res = await page.goto(BASE + url, { waitUntil: 'load', timeout: 90000 });
      await page.locator('main h1').first().waitFor({ state: 'visible', timeout: 30000 }).catch(() => undefined);
      p = await probe(page);
      if (p.signedIn) break;
    }
    return { status: res.status(), p };
  };

  // L-1 /practice
  {
    const { status, p } = await go('/practice');
    const ctas = p.hrefs.filter((h) => h.startsWith('/'));
    const results = [];
    for (const h of ctas) results.push([h, (await page.request.get(BASE + h, { maxRedirects: 0 })).status()]);
    const bad = results.filter(([, s]) => s !== 200);
    check('L-1', '/practice: every CTA is a real link answering 200 for the student; no <button>; no Adaptive / PYQ text',
      status === 200 && p.signedIn && ctas.length >= 3 && bad.length === 0 && p.mainButtons === 0 && !/Adaptive|PYQ/i.test(p.text),
      `${results.map(([h, s]) => `${h} ${s}`).join(', ')}; buttons in main ${p.mainButtons}`);
  }

  // L-2 … L-5 /mistakes at three widths
  let masteredZero = null;
  for (const w of [360, 768, 1280]) {
    const { status, p } = await go('/mistakes', w);
    const a1 = await axe(page);
    await expandAll(page);
    await page.waitForTimeout(400);
    const a2 = await axe(page);
    const q = await probe(page);
    check('L-2', `/mistakes @${w}: signed-in view; axe 0 critical/serious (closed + all sections open)`,
      status === 200 && p.signedIn && q.cards > 0 && a1.length === 0 && a2.length === 0,
      `cards ${q.cards}; closed [${a1.join(',')}] open [${a2.join(',')}]`);
    check('L-3', `/mistakes @${w}: selects labelled, nothing nested, every control named`,
      q.selects >= 3 && q.unlabelled === 0 && q.nested === 0 && q.unnamed === 0,
      `${q.selects} selects (${q.unlabelled} unlabelled), nested ${q.nested}, unnamed ${q.unnamed} of ${q.interactive}`);
    check('L-4', `/mistakes @${w}: no text < 12px in <main>${w === 360 ? '; tap targets ≥ 44px' : ''}`,
      q.textEls > 20 && q.tiny === 0 && (w !== 360 || q.small === 0),
      `${q.tiny} of ${q.textEls} text elements < 12px ${q.tinyEx.join(' ')}${w === 360 ? `; ${q.small} of ${q.interactive} targets < 44px ${q.smallEx.join('; ')}` : ''}`);
    if (w === 360) {
      const mastered = (q.text.match(/Mastered\s*\n\s*(\d+)\s*\n\s*Correct twice in a row/) || [])[1];
      masteredZero = mastered === '0';
      const jargon = JARGON.filter((rx) => rx.test(q.text)).map((rx) => rx.source);
      if (masteredZero) {
        const tile = q.retentionTile;
        check('L-5', 'honesty: 0 mastered → "Stayed mastered" shows "—" with "Master a mistake to see your retention"; no "100%"; no jargon',
          /—/.test(tile) && /Master a mistake to see your retention/.test(tile) && !/\d+%/.test(tile) && jargon.length === 0,
          `tile "${tile}"; jargon [${jargon.join(',')}]`);
      } else {
        warnVacuous('L-5', `qa-student has mastered mistakes (${mastered}); retention "—" case not observable`);
        check('L-5b', 'no jargon on the rendered page', jargon.length === 0, jargon.join(','));
      }
    }
  }

  // L-6 empty states (signed in)
  {
    const { p: bm } = await go('/mistakes?bookmarked=true');
    if (bm.cards > 0) warnVacuous('L-6b', `qa-student has ${bm.cards} bookmarked mistakes; 0-bookmark state not observable`);
    else check('L-6b', '0 bookmarks → EmptyState "No bookmarked mistakes"', bm.emptyTitle.includes('No bookmarked mistakes'), JSON.stringify(bm.emptyTitle));
    const { p: nm } = await go('/mistakes?q=zz-no-match-ux2b3');
    check('L-6c', 'filtered to nothing → EmptyState "No mistakes match these filters"', nm.cards === 0 && nm.emptyTitle.includes('No mistakes match these filters'), JSON.stringify(nm.emptyTitle));
  }

  // L-7 filter contract
  {
    const { p: all } = await go('/mistakes');
    const total = all.cards;
    const hasLink = (frag) => all.hrefs.some((h) => h.includes(frag));
    check('L-7a', 'filter links carry the URL contract (status=UNRESOLVED / REVISITING / MASTERED, repeated=true, bookmarked=true)',
      ['status=UNRESOLVED', 'status=REVISITING', 'status=MASTERED', 'repeated=true', 'bookmarked=true'].every(hasLink));
    const only = async (qs, badge) => {
      const { status, p } = await go('/mistakes?' + qs);
      return { status, cards: p.cards, ok: p.cardText.every((t) => badge.test(t)), empty: p.emptyTitle };
    };
    const un = await only('status=UNRESOLVED', /Needs revision/);
    const rv = await only('status=REVISITING', /Correct once/);
    const ms = await only('status=MASTERED', /Mastered/);
    const rp = await only('repeated=true', /Wrong \d+ times/);
    check('L-7b', 'status / repeated filters return only matching cards',
      [un, rv, ms, rp].every((r) => r.status === 200 && r.ok) && un.cards + rv.cards + ms.cards === total,
      `all ${total}; UNRESOLVED ${un.cards}, REVISITING ${rv.cards}, MASTERED ${ms.cards}${ms.cards === 0 ? ` (${ms.empty[0] || 'no empty state'})` : ''}, repeated ${rp.cards}`);
    const word = (all.cardText[0] || '').split('\n').find((l) => l.length > 30)?.split(/\s+/).find((x) => /^[A-Za-z]{6,}$/.test(x));
    const { p: qp } = word ? await go('/mistakes?q=' + encodeURIComponent(word)) : { p: { cards: 0, cardText: [] } };
    check('L-7c', 'q= search narrows to matching mistakes', !!word && qp.cards >= 1 && qp.cards <= total && qp.cardText.every((t) => t.toLowerCase().includes(word.toLowerCase())), `q="${word}" → ${qp.cards}`);
    const { status: s1, p: so } = await go('/mistakes?sort=oldest&page=1');
    check('L-7d', 'sort= and page= are accepted (same set, 200)', s1 === 200 && so.cards === total, `${so.cards}`);
    // the filter form (GET, explicit "Apply filters"; no navigation on select change, WCAG 3.2.2) keeps the contract
    await go('/mistakes?status=UNRESOLVED');
    // choose the subject of a real card, so the filtered list is checkable
    const subjects = await page.$eval('#mistake-subject', (s) => [...s.options].filter((o) => o.value !== 'ALL').map((o) => [o.value, o.textContent.trim()]));
    const pick = subjects.find(([, name]) => un.cards > 0 && all.cardText.some((t) => t.includes(name) && /Needs revision/.test(t)));
    if (!pick) warnVacuous('L-7e', 'no subject option matches an UNRESOLVED card');
    else {
      const urlBefore = page.url();
      await page.selectOption('#mistake-subject', pick[0]);
      const changedOnSelect = page.url() !== urlBefore;
      await Promise.all([
        page.waitForURL(/[?&]subject=/, { timeout: 90000 }).catch(() => undefined),
        page.getByRole('button', { name: 'Apply filters' }).click(),
      ]);
      await page.locator('main h1').first().waitFor({ state: 'visible', timeout: 30000 }).catch(() => undefined);
      const p = await probe(page);
      const u = new URL(page.url());
      const expected = all.cardText.filter((t) => t.includes(pick[1]) && /Needs revision/.test(t)).length;
      check('L-7e', 'Subject + "Apply filters" → ?subject= (status kept, page dropped), list filtered; no navigation on select change',
        !changedOnSelect && u.searchParams.get('subject') === pick[0] && u.searchParams.get('status') === 'UNRESOLVED' && !u.searchParams.has('page') &&
          p.signedIn && p.cards === expected && p.cardText.every((t) => t.includes(pick[1])),
        `${pick[1]}: ${p.cards} cards (expected ${expected}); params ${[...u.searchParams.keys()].join(',')}`);
      const cog = await page.$eval('#mistake-cognitive', (s) => [...s.options].map((o) => o.value).find((v) => v !== 'ALL') || null);
      const { status: cs } = cog ? await go('/mistakes?cognitive=' + encodeURIComponent(cog)) : { status: 0 };
      check('L-7f', 'cognitive= is accepted', !!cog && cs === 200);
    }
  }
  await ctx.close();

  // L-6a + L-8 signed out (an anonymous visitor has no vault rows: the 0-mistakes state)
  {
    const actx = await browser.newContext({ viewport: { width: 360, height: 780 } });
    const ap = await actx.newPage();
    watch(ap, 'anon');
    const rows = [];
    for (const u of ['/mistakes', '/mistakes?bookmarked=true', '/mistakes/drill', '/practice']) {
      const r = await ap.request.get(BASE + u, { maxRedirects: 0 });
      rows.push([u, r.status(), r.headers().location || '-']);
    }
    check('L-8', 'signed out: /mistakes, ?bookmarked=true, /mistakes/drill, /practice answer 200 with no redirect (as before)',
      rows.every(([, s, l]) => s === 200 && l === '-'), rows.map((r) => r.join(' ')).join('; '));
    await ap.goto(BASE + '/mistakes', { waitUntil: 'load' });
    await ap.locator('main .border-dashed').first().waitFor({ state: 'visible', timeout: 30000 }).catch(() => undefined);
    const e = await probe(ap);
    const a = await axe(ap);
    check('L-6a', '0 mistakes → EmptyState "No mistakes yet" with one action; h1 "Mistakes"; axe 0 serious/critical',
      e.emptyTitle.includes('No mistakes yet') && e.h1.includes('Mistakes') && e.hrefs.includes('/mock-tests') && a.length === 0, `${JSON.stringify(e.emptyTitle)} h1 ${JSON.stringify(e.h1)} axe [${a.join(',')}]`);
    await actx.close();
  }
  await browser.close();

  const unexpected = nonGet.filter((r) => !/^student POST \/auth\/login$/.test(r));
  check('L-9', 'read-only: no non-GET request except the sign-in', unexpected.length === 0, `${nonGet.length} non-GET (${[...new Set(nonGet)].join(', ')})`);
}

(async () => {
  console.log('UX-2b.3 mistakes + practice');
  staticChecks();
  if (!OFFLINE) await live();
  console.log(`UX-2b.3: ${passed}/${passed + failed} passed${vacuous ? `, ${vacuous} vacuous` : ''}`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error('ERROR', String(e.message).replace(/[0-9a-f-]{36}/g, '[id]'));
  process.exit(1);
});
