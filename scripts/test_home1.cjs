#!/usr/bin/env node
/**
 * HOME-1 (landing redesign + exam categories, migration 128) — offline gate.
 *   H-1 structure: hero → categories → how it works (5) → what you get → trust → free and Pro → FAQ → final CTA; the
 *       hero has ONE action spot, no step card, no list; the closed-sign-up primary is "Explore exams" → /#categories
 *   H-2 owner rule: NO exam-specific content or action on home (no exam names / exam URLs / exam cards); negative
 *       control: a planted exam name in the copy is caught
 *   H-3 honest copy (CCPA coaching ads; UX research phase 1): no promises of selection, no toppers / ratings /
 *       testimonials / student counts, no prices (Pro = features only, "Pricing at launch"); "What you get" lists only
 *       live features; the FAQ JSON-LD = the visible FAQ; negative control: a planted price / guarantee is caught
 *   H-4 categories on home: a category with exams is a link to /exams/<slug>; one without is a non-link "Coming soon";
 *       counts only from the data (render with stubbed data)
 *   H-5 R10 / readability: footer links ≥ 48 × 48, mobile footer = <details>, mobile menu actions size lg, dialog
 *       close 48 px; home chips ≥ 14 px (no 12 px text classes in the home / category sections)
 *   H-6 categories model: 128 hygiene (no BEGIN / COMMIT, rollback present, preflight + proof), ONE slug namespace on
 *       BOTH tables, RLS shows only active non-internal rows, writes INVOKER + service_role only; the TS icon keys =
 *       the SQL CHECK; logos / icons render the smallest sized copy (logoSrcFor)
 *   H-7 owner decision 1 (compact, no section cut): phones show ONE line per loop step, Free and Pro is a small
 *       comparison table (th scope, screen-reader cell text, no prices), the FAQ is <details> accordions (questions only),
 *       the Kanpur story is ≤ 3 lines (≤ 160 characters)
 *   H-8 owner decision 2 (129, the home page photo): the server pipeline (real sharp) re-encodes to 1280 / 768 / 390 px
 *       WebP, keeps the aspect ratio, drops metadata; refuses SVG, < 1280 px wide, a tall / panorama ratio (negative
 *       controls); the trust section renders it lazy with width / height + srcset from same-origin /media (no CLS) and
 *       stays text-only without it; the admin panel requires alt text + the "no recognisable person" confirmation and
 *       wraps every call; the actions are admin-only and store the copies before the audited switch
 *   H-9 owner UI review: the "CL" monogram tile (no dot); category line icons ≈ 58 % of a 48 px soft primary circle;
 *       live categories = a full-width row, coming-soon tiles 2 per row with an odd last tile spanning the row; "What
 *       you get" = one column of rows on phones with full rows on wider screens (no orphan for 1–6 features); FAQ
 *       chevron turns on open (no arrow); legal links without "(draft)" (LEGAL-PAGES-1: the pages are the approved text); the final CTA
 *       says "Free during early access."; sections alternate white / canvas with one accent-bar heading style, gradient
 *       only on the hero and the final CTA
 * HOME-1 design upgrade (owner, 2026-11-01; header = solid, footer = deep navy, "honest images"):
 *   H-8  (130) the library gallery: pipeline + negative controls, lazy / sized / same-origin render, panel + actions
 *   H-10 one solid sticky header (no glass pill), shadow only after scroll, 64 px, 48 px actions
 *   H-11 deep-navy footer: contrast computed from the tokens (links / headings ≥ 4.5:1), on-dark focus, accordions
 *   H-12 the connected loop: 5 steps, arrows, timeline lines, the return to step 1, a screenshot per step; depth CSS
 *        only on the hero + final CTA
 *   H-13 every home image has width / height / alt / lazy (hero: fetchpriority low); phone image bytes ≤ 120 KB
 *   H-14 public/marketing = the manifest: real WebP, budgets, no metadata, alt text, README; no personal-data patterns
 *   (mutation negative controls for H-10..H-14 were run before commit)
 * Run: node scripts/test_home1.cjs
 */
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const Module = require('module');
const React = require('react');

const ROOT = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n/g, '\n');
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
let passed = 0;
let failed = 0;
async function test(name, fn) {
  try { const info = await fn(); passed++; console.log(`  PASS  ${name}${info ? ' — ' + info : ''}`); } catch (e) { failed++; console.log(`  FAIL  ${name}\n        ${String(e && e.message ? e.message : e).slice(0, 900)}`); }
}
const assert = (c, m) => { if (!c) throw new Error(m || 'assertion failed'); };

const STUBS = { 'server-only': {}, 'next/link': { __esModule: true, default: (p) => React.createElement('a', { href: p.href, className: p.className, 'data-category-tile': p['data-category-tile'] }, p.children) } };
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (r, ...rest) { return origResolve.call(this, r.startsWith('@/') ? path.join(ROOT, r.slice(2)) : r, ...rest); };
const origLoad = Module._load;
Module._load = function (request, parent, isMain) { return Object.prototype.hasOwnProperty.call(STUBS, request) ? STUBS[request] : origLoad.call(this, request, parent, isMain); };
require.extensions['.ts'] = require.extensions['.tsx'] = (m, fn) => m._compile(ts.transpileModule(fs.readFileSync(fn, 'utf8'), { fileName: fn, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } }).outputText, fn);

const SECTIONS = 'components/landing/landing-sections.tsx';
function* walkSrc(dir = ROOT, depth = 0) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.next', '.git', 'public', 'docs', 'scripts', 'supabase'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory() && depth < 8) yield* walkSrc(p, depth + 1);
    else if (/\.(tsx?|css)$/.test(e.name)) yield p;
  }
}
// LANDING-1: "/" moved to app/(landing)/page.tsx (the old page file is gone)
const CONTENT = 'content/landing.ts';
const EXAM_WORDS = /SSC CGL|SSC CHSL|SSC MTS|SSC GD|\/exams\/ssc-|Explore SSC/;
const BANNED = /guarantee|guaranteed|100%|topper|rank ?1|AIR \d|testimonial|rating|\b\d[\d,]* (students|aspirants|users)\b|selection (is )?(sure|assured)/i;
const PRICE = /₹|\bRs\.?\s?\d|\bINR\b|\/month|per month|\bprices?\b/;

(async () => {
  // LANDING-1 (owner L2, 2026-11-21): H-1 (order / 5 steps) and H-2 (no exam names on home) are RETIRED — the 21 Nov
  // LANDING_V1_SPEC replaces them; their successors are scripts/test_landing1.cjs LD-3 (structure, 6 steps, data-driven
  // cards and chips). H-17 and H-19 below are retired the same way (owner round 3). The old landing components stay in
  // the repo (no longer rendered on "/") until a clean-up phase; the checks of them that still pass are kept.
  // H-3 and H-20 are KEPT and re-pointed at the new landing files (owner round 3).

  await test('H-3 honest copy (re-pointed to LANDING-1): no promises / toppers / testimonials / counts / prices in EITHER language and EITHER Hindi state; FAQ JSON-LD = visible FAQ; negative control', () => {
    const { LANDING_EN } = require(path.join(ROOT, 'content/landing-page/en.ts'));
    const { LANDING_HI } = require(path.join(ROOT, 'content/landing-page/hi.ts'));
    const { resolveLandingCopy } = require(path.join(ROOT, 'lib/landing/landing-copy.ts'));
    const variants = [];
    for (const base of [LANDING_EN, LANDING_HI]) for (const hindiLive of [false, true]) for (const signupOpen of [false, true]) {
      variants.push(resolveLandingCopy(base, { liveExamNames: ['SSC CGL'], hindiLive, signupOpen }).t);
    }
    // the promise TITLE "No fake toppers" is a negation (owner-approved spec) — only that exact title is exempt
    const all = JSON.stringify(variants).replace(/"No fake toppers"|"कोई नकली टॉपर नहीं"/g, '""');
    const b = all.match(BANNED);
    assert(!b, `banned: ${b && b[0]}`);
    assert(!PRICE.test(all), 'a price');
    assert(variants.every((t) => !/₹|\d/.test(t.plans.pro.note)), 'Pro: no price, no number');
    assert(BANNED.test(all + ' guaranteed selection') && PRICE.test(all + ' ₹499'), 'negative control');
    const data = read('lib/landing/landing-page-data.ts');
    assert(/mainEntity: t\.faq\.items\.map\(\(f\) => \(\{ "@type": "Question", name: f\.q, acceptedAnswer: \{ "@type": "Answer", text: f\.a \} \}\)\)/.test(data), 'FAQ JSON-LD = the visible FAQ items');
    for (const f of ['app/(landing)/page.tsx', 'app/(landing)/hi/page.tsx']) {
      const p = code(read(f));
      assert(/<JsonLd data=\{landingFaqJsonLd\(t\)\} \/>/.test(p) && /<LandingPageV1 t=\{t\}/.test(p), `${f}: JSON-LD and the page use the SAME resolved copy`);
    }
    return `${variants.length} resolved variants × ${variants[0].faq.items.length} FAQ items`;
  });

  await test('H-4 category tiles: link only with exams; honest "Coming soon" otherwise; counts from data only', () => {
    const { renderToStaticMarkup } = require('react-dom/server');
    const S = require(path.join(ROOT, SECTIONS));
    const cats = [
      { id: '1', slug: 'ssc', name: 'SSC', shortDesc: null, iconKey: 'ssc', icon: null, activeExams: 3 },
      { id: '2', slug: 'police', name: 'Police', shortDesc: null, iconKey: 'police', icon: null, activeExams: 0 },
    ];
    const html = renderToStaticMarkup(React.createElement(S.LandingCategories, { categories: cats }));
    assert(/href="\/exams\/ssc"/.test(html) && !/href="\/exams\/police"/.test(html), 'link rules');
    assert(/aria-disabled="true"[\s\S]*?Police[\s\S]*?Coming soon/.test(html) && /3 exams/.test(html), 'labels');
    const fallback = renderToStaticMarkup(React.createElement(S.LandingCategories, { categories: null })).replace(/<[^>]+>/g, ' ');
    assert(/could not be loaded/.test(fallback) && !/\d/.test(fallback), 'fallback without numbers');
  });

  await test('H-5 R10 targets + readability: footer 48×48 + <details> on phones, menu actions lg, dialog close 48, home chips ≥ 14 px', () => {
    const f = read('components/shell/site-footer.tsx');
    assert(/min-h-12 min-w-12/.test(f) && /<details key=\{g\.heading\}/.test(f) && /md:hidden/.test(f) && /data-not-affiliated/.test(f), 'footer');
    // NAV-1 Stage A (re-pointed, rule kept): the signed-out phone menu is the shared visitor header's drawer — its Sign in
    // and start actions are full-width 48 px buttons
    const vh = read('components/nav/visitor-header.tsx');
    const navCss = read('app/nav.css');
    assert(/href=\{VISITOR_ROUTES\.signIn\}[^>]*data-menu-item="signin"/.test(vh) && /data-menu-item="start"/.test(vh) && /\.cl-vh__ctas \.cl-vh__pill \{\s+height: 48px;\s+width: 100%;/.test(navCss), 'mobile menu actions');
    assert(/inline-flex size-12 shrink-0/.test(read('components/ui/dialog.tsx')), 'dialog close 48 px');
    for (const file of [SECTIONS, 'components/exams/category-page.tsx']) assert(!/text-\[1[0-3]px\]|text-caption|text-xs\b/.test(code(read(file))), `${file}: text under 14 px`);
  });

  await test('H-6 categories model: 128 hygiene, ONE slug namespace on both tables, RLS public = active non-internal, INVOKER writes; TS icon keys = SQL; sized copies rendered', () => {
    const sql = read('supabase/migrations/20261101000128_exam_categories.sql');
    const c = sql.replace(/--[^\n]*/g, '');
    assert(!/^\s*(BEGIN|COMMIT|ROLLBACK)\s*;/im.test(c) && /CATEGORIES_PREFLIGHT/.test(sql) && /CATEGORIES_PROOF/.test(sql) && fs.existsSync(path.join(ROOT, 'docs/database/rollback/128_rollback.sql')), 'hygiene');
    assert(/CREATE TRIGGER trg_exam_categories_slug_namespace BEFORE INSERT OR UPDATE OF slug ON public\.exam_categories/.test(sql) && /CREATE TRIGGER trg_exams_slug_namespace BEFORE INSERT OR UPDATE OF slug ON public\.exams/.test(sql), 'namespace triggers on BOTH tables');
    assert(/FOR SELECT TO anon, authenticated USING \(is_active AND NOT is_internal\)/.test(sql) && !/SECURITY DEFINER/i.test(c), 'RLS / no SECDEF');
    for (const fn of ['fn_category_save', 'fn_category_icon_set', 'fn_category_icon_remove']) assert(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\([^)]*\\) TO service_role;`).test(sql) && new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\([^)]*\\) FROM PUBLIC, anon, authenticated;`).test(sql), `${fn} grants`);
    const sqlKeys = /icon_key IN \(([^)]*)\)/.exec(sql)[1].match(/'([a-z]+)'/g).map((k) => k.slice(1, -1));
    const K = require(path.join(ROOT, 'lib/exams/categories.ts'));
    assert(JSON.stringify([...K.CATEGORY_ICON_KEYS]) === JSON.stringify(sqlKeys), `icon keys TS ${K.CATEGORY_ICON_KEYS} vs SQL ${sqlKeys}`);
    assert(/src=\{logoSrcFor\(logo, px\)\}/.test(read('components/exams/exam-logo-badge.tsx')) && /src=\{logoSrcFor\(category\.icon, px\)\}/.test(read('components/exams/category-icon.tsx')), 'sized copies');
    const L = require(path.join(ROOT, 'lib/logos/exam-logo.ts'));
    const p = `orgs/${'1'.repeat(8)}-1111-4111-8111-${'1'.repeat(12)}/${'a'.repeat(64)}.webp`;
    const logo = L.examLogo({ org: { path: p, alt: 'x' } });
    assert(L.logoSrcFor(logo, 28).endsWith('-64.webp') && L.logoSrcFor(logo, 48).endsWith('-128.webp') && L.logoSrcFor(logo, 200) === logo.src, 'variant choice');
  });

  await test('H-7 compact (owner decision 1): one line per step on phones, comparison table, accordion FAQ, story ≤ 3 lines', () => {
    const C = require(path.join(ROOT, CONTENT));
    const s = read(SECTIONS);
    assert(C.LANDING_LOOP.steps.every((x) => x.short && x.short.length <= 32) && /lg:hidden">\{step\.short\}<\/p>/.test(s) && /data-loop-step=\{i \+ 1\}/.test(s), 'loop: one line per step');
    const T = C.LANDING_PLANS.table;
    assert(/<table className="w-full border-collapse/.test(s) && /<caption className="sr-only">/.test(s) && /scope="col"/.test(s) && /scope="row"/.test(s) && /sr-only">\{pro \? "Included in Pro" : "Included free"\}/.test(s) && /Not included/.test(s), 'table semantics');
    assert(T.rows.length >= 4 && !PRICE.test(JSON.stringify(T)) && /Pricing at launch/.test(T.proNote), 'table copy');
    assert(/<details key=\{f\.q\}/.test(s) && /<summary className="focus-ring flex min-h-12/.test(s), 'accordion FAQ');
    assert(C.LANDING_TRUST.short.length <= 160 && /\{LANDING_TRUST\.short\}/.test(s), `story ${C.LANDING_TRUST.short.length} chars`);
  });

  await test('H-8 library gallery (130): real pipeline (1280 / 768 / 390 WebP, aspect kept, metadata dropped), negative controls; lazy + sized render; panel + actions safe', async () => {
    const sharp = require('sharp');
    const P = require(path.join(ROOT, 'lib/media/photo-image.ts'));
    const img = (w, h, fmt = 'jpeg') => sharp({ create: { width: w, height: h, channels: 3, background: { r: 120, g: 140, b: 160 } } }).withMetadata({ exif: { IFD0: { Artist: 'SECRET-PERSON' } } })[fmt]().toBuffer();
    const r = await P.processHomePhoto(await img(1600, 900));
    assert(r.ok, `pipeline: ${r.message}`);
    const m = await sharp(r.main).metadata();
    assert(m.format === 'webp' && m.width === 1280 && m.height === 720 && !m.exif && !r.main.includes(Buffer.from('SECRET-PERSON')), `main ${m.width}x${m.height}`);
    for (const w of [768, 390]) { const v = await sharp(r.variants[w]).metadata(); assert(v.width === w && v.format === 'webp' && Math.abs(v.height - Math.round((w * 9) / 16)) <= 1, `copy ${w}`); }
    const bad = await Promise.all([
      P.processHomePhoto(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="1000"/>')),
      P.processHomePhoto(await img(1000, 600)),
      P.processHomePhoto(await img(1400, 2000)),
      P.processHomePhoto(await img(4000, 1000)),
    ]);
    assert(bad.every((b) => !b.ok) && /PNG, JPG or WebP/.test(bad[0].message) && /at least 1280/.test(bad[1].message) && /landscape/.test(bad[2].message) && /landscape/.test(bad[3].message), 'negative controls: SVG / narrow / tall / panorama');
    const { renderToStaticMarkup } = require('react-dom/server');
    const S = require(path.join(ROOT, SECTIONS));
    const R2 = require(path.join(ROOT, 'lib/media/photo-rules.ts'));
    const row = (i, basis = 'NO_RECOGNISABLE_PERSON') => ({ id: `00000000-0000-4000-8000-00000000000${i}`, position: i, path: `site/gallery/${String(i).repeat(64)}.webp`, alt: `Reading room ${i}`, width: 1280, height: 720, people_basis: basis });
    const photos = [1, 2, 3, 4].map((i) => R2.galleryPhotoFrom(row(i, i === 2 ? 'WRITTEN_CONSENT' : 'NO_RECOGNISABLE_PERSON')));
    assert(photos.every(Boolean), 'gallery rows map');
    const html = renderToStaticMarkup(React.createElement(S.LandingTrust, { photos }));
    const tags = html.match(/<img[^>]*>/g) || [];
    assert(tags.length === 4 && tags.every((t) => /loading="lazy"/.test(t) && /width="1280"/.test(t) && /height="720"/.test(t) && /alt="Reading room \d"/.test(t) && /srcSet="\/media\/logos\/site\/gallery\/(\d)\1{63}-390\.webp 390w, /.test(t)) && !/supabase/.test(html), 'gallery render: lazy, sized, same-origin copies');
    assert(/<ul[^>]*aria-label="Photos of the library"[^>]*tabindex="0"/i.test(html.replace(/tabIndex/g, 'tabindex')) && /md:col-span-2 md:row-span-2/.test(tags.length && html) && /md:hidden/.test(html), 'desktop: first large + 2; phones: swipe row (keyboard-scrollable)');
    // negative controls: a foreign path / an unknown people basis never render
    assert(R2.galleryPhotoFrom({ ...row(1), path: 'orgs/x.webp' }) === null && R2.galleryPhotoFrom(row(1, 'MAYBE')) === null && !/<img/.test(renderToStaticMarkup(React.createElement(S.LandingTrust, {}))), 'text-only fallback / path + basis checks');
    const panel = read('components/admin/settings/library-gallery-panel.tsx');
    assert(/accept=\{PHOTO_ACCEPT\}/.test(panel) && /fd\.set\("peopleBasis", basis\)/.test(panel) && /disabled=\{!prepared \|\| !basis \|\| alt\.trim\(\)\.length < 3/.test(panel) && /type="radio"/.test(panel), 'panel requirements (alt + people basis)');
    const calls = ['addGalleryPhotoAction(fd)', 'removeGalleryPhotoAction(', 'moveGalleryPhotoAction(', 'updateGalleryPhotoAction('];
    assert(/await guarded\(\(\) => addGalleryPhotoAction\(fd\)\)/.test(panel) && /await guarded\(call as/.test(panel) && calls.slice(1).every((c) => new RegExp(`run\\(\\(\\) => ${c.replace('(', '\\(')}`).test(panel)), 'panel: every call wrapped');
    const act = read('app/(site)/admin/system/photo-actions.ts');
    const fns = [...act.matchAll(/export async function (\w+)\([^)]*\)[^\n]*\{\n\s*const auth = await guardAdminAction\(\);/g)].map((x) => x[1]);
    assert(fns.join() === 'addGalleryPhotoAction,updateGalleryPhotoAction,moveGalleryPhotoAction,removeGalleryPhotoAction' && !/allowStaff/.test(act), `actions admin-only (${fns})`);
    const order = ['processHomePhoto(', 'storage.from(BUCKET).upload(', 'rpc("fn_site_gallery_add"'].map((x) => act.indexOf(x));
    const rm = act.slice(act.indexOf('export async function removeGalleryPhotoAction'));
    assert(order.every((x, i) => x > 0 && (i === 0 || x > order[i - 1])) && rm.indexOf('rpc("fn_site_gallery_remove"') < rm.indexOf('remove(withCopies(oldPath))') && /isPeopleBasis\(basis\)/.test(act), `action order ${order}`);
    return '1280/768/390 + 4 refusals + gallery render';
  });

  await test('H-9 owner UI review (as amended by the expert UX pass; tiles restored 2026-11-02): official logo, icons, category tiles without orphans, stats + checklist, FAQ chevron, legal labels, CTA note, section rhythm', () => {
    const s = read(SECTIONS);
    const wm = read('components/brand/wordmark.tsx');
    assert(/DEFAULT_MARK\.src/.test(wm) && !/data-brand-monogram|>\s*CL\s*</.test(wm), 'the official logo, no monogram');
    const icon = read('components/exams/category-icon.tsx');
    assert(/rounded-full bg-primary-50 text-primary-700/.test(icon) && /size-\[58%\]/.test(icon) && (s.match(/<CategoryIcon category=\{c\} px=\{48\} \/>/g) || []).length === 2, 'category icons: 28 px in a 48 px tint circle');
    assert(/className="col-span-full flex lg:col-span-1"/.test(s) && /const lastOdd = soonCount % 2 === 1 && c\.slug === lastSoon;/.test(s) && /"col-span-2 md:col-span-1"/.test(s) && !/data-category-soon-line/.test(s), 'category tiles (owner 2026-11-02: tiles restored): live row + no orphan; no coming-soon text line');
    assert(/data-live-stats=""/.test(s) && /data-features-list=""/.test(s) && /\.filter\(\(x\) => x\.n > 0\)/.test(s) && /const stats = data\.ok/.test(s), 'stats (real, > 0, only when the read worked) + checklist');
    const faq = s.slice(s.indexOf('export function LandingFaq'), s.indexOf('export function faqJsonLd'));
    assert(/<ChevronDown aria-hidden="true" data-faq-chevron="" className="[^"]*group-open:rotate-180/.test(faq) && !/ArrowRight/.test(faq) && /<details key=\{f\.q\}/.test(faq), 'FAQ chevron');
    const pp = require(path.join(ROOT, 'content/public-pages.ts'));
    const legal = JSON.stringify(pp.FOOTER_ABOUT.legal);
    assert(/"label":"Privacy"/.test(legal) && /"label":"Terms"/.test(legal) && !/draft/i.test(legal), 'footer legal labels');
    // LEGAL-PAGES-1: the drafts are replaced by the owner-approved text (content/legal), so no draft title remains
    assert(!/\(draft\)/i.test(read('content/public-pages.ts')) && /title: "Privacy Policy"/.test(read('content/legal/index.ts')) && /title: "Terms of Service"/.test(read('content/legal/index.ts')), 'legal pages carry their approved titles');
    const C = require(path.join(ROOT, CONTENT));
    assert(C.LANDING_FINAL_CTA.note === 'Free during early access.' && /\{LANDING_FINAL_CTA\.note\}/.test(s), 'final CTA note');
    const order = ['categories', 'loop', 'features', 'trust', 'plans', 'faq'].map((id) => {
      const m = s.match(new RegExp(`<Section aria-labelledby="${id}-title"[^>]*className="[^"]*\\b(bg-surface|bg-canvas)\\b`));
      return m && m[1];
    });
    assert(order.join() === 'bg-surface,bg-canvas,bg-surface,bg-canvas,bg-surface,bg-canvas', `section rhythm ${order}`);
    assert(/function SectionHeading[\s\S]{0,200}<AccentBar \/>/.test(s) && /<AccentBar \/>\s*<h2 id="trust-title"/.test(s) && /bg-accent-500/.test(s), 'one heading style (accent bar)');
    const grads = (s.match(/hero-gradient|brand-gradient|GradientHero aria/g) || []).length;
    assert(grads === 2 && !/amber|yellow/.test(s), `gradient only on the hero + final CTA (${grads})`);
  });

  // ---- HOME-1 design upgrade (owner, 2026-11-01): solid header, navy footer, connected loop, honest images ----
  await test('H-10 header: ONE solid sticky white header (no glass pill), hairline border, shadow only after scroll (box-shadow: no layout shift), 64 px, 48 px actions', () => {
    // NAV-1 (owner-approved spec, 23 Nov 2026; re-pointed, rules kept): THE visitor header and THE student top bar replace
    // the HOME-1 header. Both: ONE full-width sticky bar with a hairline border, no floating glass pill, no shadow that
    // moves anything (none at all), 48 px menu buttons. The visitor header's 92 % white + blur is the spec (as on the
    // landing since LANDING-1), solid in lite mode and with reduced transparency; the student top bar is solid white.
    const vh = read('components/nav/visitor-header.tsx');
    const ss = read('components/nav/student-shell.tsx');
    const css = read('app/nav.css') + read('app/nav-student.css');
    assert((vh.match(/<header /g) || []).length === 1 && /<header className="cl-vh"/.test(vh) && (ss.match(/<header /g) || []).length === 1 && /<header className="cl-ss__top"/.test(ss), 'one header each');
    assert(/\.cl-vh \{\s+position: sticky;\s+top: 0;/.test(css) && /border-bottom: 1px solid var\(--color-cl-line\);/.test(css) && /\.cl-ss__top \{\s+position: sticky;\s+top: 0;[\s\S]*?background: var\(--color-cl-white\);\s+border-bottom: 1px solid var\(--color-cl-line\);/.test(css), 'sticky bars with a hairline border; the student bar solid white');
    assert(/html\.lite \.cl-vh \{[\s\S]*?background: var\(--color-cl-white\);/.test(css) && /prefers-reduced-transparency: reduce/.test(css), 'the visitor blur is solid in lite mode / reduced transparency');
    const h = vh + ss;
    assert(!/GlassNav|glass-light|rounded-full pl-4/.test(h) && !/GlassNav/.test(read('components/ui/glass.tsx')), 'no floating glass pill');
    assert(!/box-shadow[^;]*;[^}]*\}[^{]*\[data-scrolled\]|addEventListener\("scroll"/.test(h), 'no scroll-dependent shadow / layout change');
    assert(/\.cl-vh__burger \{[^}]*width: 48px;\s+height: 48px;/.test(css) && /\.cl-ss__av \{[^}]*width: 48px;\s+height: 48px;/.test(css), '48 px menu buttons (visitor menu, student avatar)');
    assert(!/-mt-\[76px\]/.test(read('components/ui/gradient-hero.tsx')), 'hero no longer pulled up under a floating nav');
    // negative control: the detector flags a glass header
    assert(/GlassNav|glass-light/.test(h.replace('<header className="cl-vh"', '<header className="glass-light"')), 'negative control');
  });

  await test('H-11 footer: deep navy, white headings, light-slate links (≥ 4.5:1, computed from tokens), cyan top line, on-dark focus ring; accordions keep native <details>', () => {
    const f = read('components/shell/site-footer.tsx');
    const css = read('app/globals.css');
    const hex = (name) => { const m = css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-f]{6})`, 'i')); return m && m[1]; };
    const lum = (h) => { const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
    const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
    const navy = hex('ink-900');
    assert(navy && navy.toLowerCase() === '#0b1b4d', `ink-900 ${navy}`);
    const linkR = ratio(hex('ink-300'), navy);
    const headR = ratio('#ffffff', navy);
    assert(linkR >= 4.5 && headR >= 4.5, `contrast links ${linkR.toFixed(2)} / headings ${headR.toFixed(2)}`);
    assert(ratio(hex('ink-500'), navy) < 4.5, 'negative control: ink-500 on navy would fail');
    assert(/<footer className="border-t-2 border-accent-400 bg-ink-900 text-ink-300" data-footer-navy="">/.test(f) && /focus-ring-on-dark inline-flex min-h-12 min-w-12[^"]*text-ink-300/.test(f), 'navy footer, cyan line, light links, on-dark focus');
    assert(!/text-fg-secondary|text-fg"|bg-surface|divide-line|border-line/.test(f), 'no light-theme text / surface classes left on navy');
    assert(/<details key=\{g\.heading\} className="group">/.test(f) && /<summary className="focus-ring-on-dark[^"]*text-fg-inverse/.test(f) && /ChevronDown aria-hidden="true" className="size-5 text-ink-300/.test(f), 'accordions on navy: chevron + focus ring visible');
    const pairs = JSON.parse(read('components/ui/contrast-pairs.json')).pairs;
    assert(pairs.some((p) => p.fg === 'ink-300' && p.bg === 'ink-900' && p.kind === 'text') && pairs.some((p) => p.fg === 'fg-inverse' && p.bg === 'ink-900'), 'pairs registered (R-5)');
    return `links ${linkR.toFixed(2)}:1, headings ${headR.toFixed(2)}:1`;
  });

  await test('H-12 How it works = the connected loop: 5 steps, 4 arrows + 4 timeline lines, a return to step 1 (desktop line + phone row), each step a real screenshot; depth only in hero + final CTA', () => {
    const { renderToStaticMarkup } = require('react-dom/server');
    const S = require(path.join(ROOT, SECTIONS));
    const html = renderToStaticMarkup(React.createElement(S.LandingLoop));
    const count = (re) => (html.match(re) || []).length;
    assert(count(/data-loop-step="\d"/g) === 5 && count(/data-loop-arrow=""/g) === 4 && count(/data-loop-line=""/g) === 4 && count(/data-loop-return=""/g) === 1 && count(/data-loop-back=""/g) === 1, `loop structure ${count(/data-loop-step="\d"/g)}/${count(/data-loop-arrow=""/g)}/${count(/data-loop-line=""/g)}`);
    const ret = (html.match(/<div[^>]*data-loop-return=""[^>]*>/) || [''])[0];
    assert(/rounded-b-3xl border-x-2 border-b-2/.test(ret) && /aria-hidden="true"/.test(ret), 'the return line curves back (rounded corners), decorative');
    assert(count(/<img[^>]*data-marketing-shot=""/g) === 5, `step screenshots ${count(/<img[^>]*data-marketing-shot=""/g)}`);
    const css = read('app/globals.css');
    const users = [...walkSrc()].filter((f) => /\bhero-depth\b/.test(fs.readFileSync(f, 'utf8'))).map((f) => path.relative(ROOT, f).split(path.sep).join('/')).sort();
    assert(users.join() === 'app/globals.css,components/landing/landing-sections.tsx,components/ui/gradient-hero.tsx' && (read(SECTIONS).match(/hero-depth/g) || []).length === 1 && /\.hero-depth::before[\s\S]{0,400}mask-image/.test(css) && !/hero-depth[^}]*url\(/.test(css), `depth only on hero + final CTA, CSS only (${users})`);
  });

  await test('H-13 every image on home has width + height + alt + loading="lazy" (hero mockup: also fetchpriority="low"); first-view image bytes ≤ 120 KB on phones', () => {
    const { renderToStaticMarkup } = require('react-dom/server');
    const S = require(path.join(ROOT, SECTIONS));
    const R2 = require(path.join(ROOT, 'lib/media/photo-rules.ts'));
    const photo = R2.galleryPhotoFrom({ id: '00000000-0000-4000-8000-000000000001', position: 1, path: `site/gallery/${'a'.repeat(64)}.webp`, alt: 'Reading room', width: 1280, height: 720, people_basis: 'NO_RECOGNISABLE_PERSON' });
    const html = [S.LandingHero, S.LandingLoop].map((c) => renderToStaticMarkup(React.createElement(c))).join('') + renderToStaticMarkup(React.createElement(S.LandingTrust, { photos: [photo] }));
    const tags = html.match(/<img[^>]*>/g) || [];
    const bad = tags.filter((t) => !/ width="\d+"/.test(t) || !/ height="\d+"/.test(t) || !/ alt="[^"]{8,}"/.test(t) || !/loading="lazy"/.test(t));
    assert(tags.length === 7 && bad.length === 0, `${tags.length} images, ${bad.length} without width / height / alt / lazy`);
    assert(/data-hero-mockup=""[\s\S]*?fetchPriority="low"/i.test(html.replace(/fetchpriority/gi, 'fetchPriority')), 'hero mockup fetchpriority low');
    // negative control: an <img> without alt is caught
    assert(['<img src="x" width="1" height="1" loading="lazy">'].filter((t) => !/ alt="[^"]{8,}"/.test(t)).length === 1, 'negative control');
    // phones: the hero copy + the five 390 step copies (lazy images near the viewport may load at once) ≤ 120 KB
    const M = JSON.parse(read('content/marketing-shots.json'));
    // UX-IMP-1: the readable hero crop (220 px frame) takes the 480 px copy on 2x phones — count THAT file
    const phone = M.hero.files['1280'].bytes + ['learn', 'practice', 'mock', 'analyze', 'revise'].reduce((t, k) => t + M[k].files['390'].bytes, 0);
    assert(phone <= 120 * 1024, `first-view images on phones ${(phone / 1024).toFixed(1)} KB > 120 KB`);
    return `${tags.length} images; phone image bytes ≤ ${(phone / 1024).toFixed(1)} KB`;
  });

  await test('H-14 honest images: public/marketing = the manifest (real WebP, sizes, ≤ 40 / 60 KB, no EXIF / XMP / IPTC), alt text + README; no personal data patterns; negative controls', async () => {
    const sharp = require('sharp');
    const M = JSON.parse(read('content/marketing-shots.json'));
    const DIR = path.join(ROOT, 'public/marketing');
    const PII = [/@/, /qa[\s_-]?student/i, /\bQA\b/, /courage-library\.test/i, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i, /\b\d{10,}\b/];
    const keys = ['learn', 'practice', 'mock', 'analyze', 'revise', 'hero'];
    assert(keys.every((k) => M[k]) && Object.keys(M).sort().join() === [...keys].sort().join(), `manifest keys ${Object.keys(M)}`);
    const listed = new Set();
    for (const k of keys) {
      const r = M[k];
      assert(r.alt && r.alt.length >= 20 && !PII.some((re) => re.test(r.alt)), `${k}: alt`);
      const max = k === 'hero' ? 60 * 1024 : 40 * 1024;
      const labels = Object.keys(r.files).sort((a, b) => a - b).join();
      assert(labels === (k === 'hero' ? '390,1280' : '390,768,1280'), `${k}: variants ${labels}`);
      for (const [label, f] of Object.entries(r.files)) {
        listed.add(f.file);
        const buf = fs.readFileSync(path.join(DIR, f.file));
        const meta = await sharp(buf).metadata();
        assert(meta.format === 'webp' && meta.width === f.width && buf.length === f.bytes && buf.length <= max, `${f.file}: ${meta.format} ${meta.width}px ${buf.length} B`);
        assert(!meta.exif && !meta.xmp && !meta.iptc, `${f.file}: metadata chunks`);
        assert(Math.abs(meta.height / meta.width - r.height / r.width) < 0.01, `${f.file}: aspect`);
        assert(f.file === `${k}-${label}.webp`, `${f.file}: name`);
      }
    }
    const onDisk = fs.readdirSync(DIR).filter((f) => f.endsWith('.webp'));
    assert(onDisk.length === listed.size && onDisk.every((f) => listed.has(f)), `files not in the manifest: ${onDisk.filter((f) => !listed.has(f))}`);
    assert(/QA identity only/.test(read('public/marketing/README.md')) && /--readonly/.test(read('scripts/content/capture-marketing.cjs')) && /\[data-watermark\] \{ display: none !important; \}|\[data-watermark\] \{/.test(read('scripts/content/capture-marketing.cjs')), 'README + capture script (watermark hidden)');
    // negative controls: a planted EXIF block and a planted e-mail in alt text are both caught
    const planted = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#fff' } }).withMetadata({ exif: { IFD0: { Artist: 'someone' } } }).webp().toBuffer();
    assert((await sharp(planted).metadata()).exif, 'negative control: planted EXIF not detected');
    assert(PII.some((re) => re.test(['student', 'example.org'].join('@'))), 'negative control: planted e-mail not detected');
    return `${listed.size} files, all in budget, no metadata`;
  });

  // ---- HOME-1 expert UX pass + brand settings (owner, 2026-11-01; decision #86) ----
  await test('H-15 brand: the OFFICIAL logo is the default everywhere (header, menu, footer plate, icons), never the monogram; an upload replaces it; sized, not lazy', async () => {
    const sharp = require('sharp');
    const wm = read('components/brand/wordmark.tsx');
    const R = require(path.join(ROOT, 'lib/brand/brand-rules.ts'));
    assert(R.DEFAULT_MARK.src === '/brand/mark-32.webp' && /mark-64\.webp 2x/.test(R.DEFAULT_MARK.srcSet) && R.DEFAULT_MARK.width === 34 && R.DEFAULT_MARK.height === 32, 'default mark');
    const src = await sharp(path.join(ROOT, 'public/images/logo.png')).metadata();
    for (const [f, w, h] of [['mark-32.webp', 34, 32], ['mark-64.webp', 68, 64], ['mark-96.webp', 103, 96], ['icon-32.png', 32, 32], ['icon-180.png', 180, 180], ['icon-192.png', 192, 192], ['icon-512.png', 512, 512]]) {
      const m = await sharp(path.join(ROOT, 'public/brand', f)).metadata();
      assert(m.width === w && m.height === h, `${f} ${m.width}x${m.height}`);
    }
    assert(src.width === 245 && src.height === 229, 'the official logo file is unchanged (245 × 229)');
    // the default mark is the logo's own pixels (resized only): its centre colour matches the source's
    const px = async (file, x, y) => { const { data, info } = await sharp(path.join(ROOT, file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); const i = (Math.round(y * info.height) * info.width + Math.round(x * info.width)) * 4; return [...data.slice(i, i + 3)]; };
    const [a, b] = [await px('public/images/logo.png', 0.4, 0.5), await px('public/brand/mark-96.webp', 0.4, 0.5)];
    assert(a.every((v, i) => Math.abs(v - b[i]) <= 24), `not recoloured (${a} vs ${b})`);
    assert(/loading=/.test(wm) === false && !/data-brand-monogram/.test(wm) && /width=\{DEFAULT_MARK\.width\} height=\{DEFAULT_MARK\.height\}/.test(wm) && /tone === "white" && "rounded-control bg-surface p-1"/.test(wm) && /logo \? \(/.test(wm), 'lockup: sized, not lazy, white plate on navy, upload replaces');
    // NAV-1 (owner spec: "final logo suite — never recolour or redraw"): the visitor header and the student shell show the
    // static logo-suite SVGs (never the monogram, sized → no shift); the admin logo upload still drives the footer below
    // (backlog: the upload no longer affects the headers)
    const vhs = read('components/nav/visitor-header.tsx') + read('components/nav/student-shell.tsx');
    assert(/"\/brand\/courage-library-logo-suite\/svg\/logo-horizontal\.svg"/.test(vhs) && /\/brand\/courage-library-logo-suite\/svg\/mark\.svg/.test(vhs) && !/data-brand-monogram/.test(vhs) && /width=\{Math\.round\(LOGO_RATIO \* 30\)\} height=\{30\}/.test(vhs), 'headers use the final logo suite, sized');
    assert(/<BrandWordmark size="sm" tone="white" logo=\{logo\} \/>/.test(read('components/shell/site-footer.tsx')), 'footer');
    const shell = read('components/shell/app-shell.tsx');
    // NAV-1: the same Promise.all also reads the forwarded path (after the brand read) — the rule is unchanged
    assert(/Promise\.all\(\[[\s\S]*?loadBrandAssets\(\),[\s\S]*?\]\)/.test(shell) && /const \[session, brand, pathname\] = await Promise\.all\(\[/.test(shell) && /logo=\{brand\.footerLogo\}/.test(shell), 'shell: brand read alongside the session, never alone (NAV-1: it drives the footer; the headers show the final logo suite)');
    const meta = read('lib/seo/metadata.ts');
    // SEO-1 (owner, 2026-11-22): the site icons moved to the final logo suite (static files, lib/seo/brand-icons.ts; sizes and
    // files gated in scripts/test_seo1.cjs S1-3). The /brand/icon/[size] route stays for old links; the header / footer
    // logo upload rules below are unchanged.
    assert(/icons: \{ icon: SITE_ICONS\.icon\.map/.test(meta) && /apple: \{ \.\.\.SITE_ICONS\.apple \}/.test(meta) && /icons: MANIFEST_ICONS\.map/.test(read('app/manifest.ts')) && /source: "\/favicon\.ico", destination: `\$\{BRAND_SUITE\}\/favicon\/favicon\.ico`/.test(read('next.config.ts')) && fs.existsSync(path.join(ROOT, 'app/brand/icon/[size]/route.ts')), 'icons → the logo suite (SEO-1); the brand icon route still answers');
    // negative controls on the pure rules: a foreign path / wrong extension never becomes a brand image
    assert(R.brandLogoFrom('brand_header_logo', { path: `site/brand_header_logo/${'a'.repeat(64)}.png`, alt: 'x', width: 400, height: 100 }) === null && R.squareMarkUrl({ path: `site/brand_square_mark/${'a'.repeat(64)}.webp` }, 32) === null, 'path checks');
    assert(R.squareMarkUrl({ path: `site/brand_square_mark/${'a'.repeat(64)}.png` }, 180) === `/media/logos/site/brand_square_mark/${'a'.repeat(64)}-180.png` && R.defaultIconUrl(32) === '/brand/icon-32.png', 'icon urls');
    const L = R.brandLogoFrom('brand_header_logo', { path: `site/brand_header_logo/${'b'.repeat(64)}.webp`, alt: 'Courage Library', width: 512, height: 128 });
    assert(L && L.height === 32 && L.width === 128 && /-64\.webp 2x/.test(L.srcSet), 'uploaded logo sizing');
    return 'default = official logo; upload replaces';
  });

  await test('H-16 brand pipeline (131): sniffed, shape-checked, re-encoded (metadata dropped), sized copies; admin-only actions, stored before the switch; panel wraps every call', async () => {
    const sharp = require('sharp');
    const B = require(path.join(ROOT, 'lib/brand/brand-image.ts'));
    const mk = (w, h, fmt = 'png') => sharp({ create: { width: w, height: h, channels: 4, background: { r: 20, g: 120, b: 220, alpha: 1 } } }).withMetadata({ exif: { IFD0: { Artist: 'SECRET' } } })[fmt]().toBuffer();
    const logo = await B.processBrandImage('brand_header_logo', await mk(800, 200));
    assert(logo.ok && logo.ext === 'webp' && logo.height === 128 && logo.files.length === 2 && !logo.files[0].buf.includes(Buffer.from('SECRET')), 'header logo');
    const small = await sharp(logo.files[1].buf).metadata();
    assert(small.height === 64 && small.format === 'webp', 'the 64 px copy');
    const mark = await B.processBrandImage('brand_square_mark', await mk(600, 600));
    assert(mark.ok && mark.ext === 'png' && mark.files.map((f) => f.suffix).join() === '.png,-32.png,-180.png,-192.png', 'square mark copies');
    const bad = await Promise.all([
      B.processBrandImage('brand_header_logo', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="200"/>')),
      B.processBrandImage('brand_header_logo', await mk(300, 300)),
      B.processBrandImage('brand_square_mark', await mk(600, 400)),
      B.processBrandImage('brand_square_mark', await mk(300, 300)),
      B.processBrandImage('brand_footer_logo', Buffer.alloc(1024 * 1024 + 1)),
    ]);
    assert(bad.every((r) => !r.ok) && /SVG/.test(bad[0].message) && /landscape/.test(bad[1].message) && /square/.test(bad[2].message) && /512/.test(bad[3].message) && /1 MB/.test(bad[4].message), 'negative controls: SVG / square logo / non-square mark / small mark / too large');
    const act = read('app/(site)/admin/system/brand-actions.ts');
    const fns = [...act.matchAll(/export async function (\w+)\([^)]*\)[^\n]*\{\n\s*const auth = await guardAdminAction\(\);/g)].map((x) => x[1]);
    assert(fns.join() === 'uploadBrandAssetAction,removeBrandAssetAction' && !/allowStaff/.test(act), `actions admin-only (${fns})`);
    const order = ['processBrandImage(', 'storage.from(BUCKET).upload(', 'rpc("fn_site_media_set"', 'remove(filesOf(oldPath))'].map((x) => act.indexOf(x));
    assert(order.every((x, i) => x > 0 && (i === 0 || x > order[i - 1])) && /revalidateTag\(BRAND_CACHE_TAG\)/.test(act), `order ${order}`);
    const panel = read('components/admin/settings/brand-panel.tsx');
    assert(/await guarded\(\(\) => uploadBrandAssetAction\(fd\)\)/.test(panel) && /await guarded\(\(\) => removeBrandAssetAction\(\{ key: slot \}\)\)/.test(panel) && /sniffLogoFormat/.test(panel) && /accept=\{BRAND_ACCEPT\}/.test(panel), 'panel');
    assert(/createPublicServerSupabaseClient\(\)\.from\("site_media"\)/.test(read('lib/brand/brand-assets.ts')) && /readBrandAssets\(\)\.catch\(\(\) => null\)/.test(read('lib/brand/brand-assets.ts')), 'brand read: public client, cached, bounded, never rejects');
    return '2 + 4 copies; 5 refusals';
  });

  // H-17 (hero H1 from live category names, slogan eyebrow, category tiles) — RETIRED for the landing page (owner
  // round 3, 2026-11-21); successor: scripts/test_landing1.cjs LD-3 / LD-8 (data-driven cards, chips, FAQ 1).

  await test('H-18 share images: 1200 × 630 OG + Twitter for home and category / exam pages; brand mark = upload or official logo; default ogImage', () => {
    for (const f of ['app/opengraph-image.tsx', 'app/twitter-image.tsx', 'app/(site)/exams/[slug]/opengraph-image.tsx', 'app/(site)/exams/[slug]/twitter-image.tsx']) {
      const s = read(f);
      assert(/export const dynamic = "force-dynamic";/.test(s) && (/size = OG_SIZE/.test(s) || /export \{ default, alt, size, contentType \} from "\.\/opengraph-image"/.test(s)), f);
    }
    const og = read('lib/og/og-card.tsx');
    assert(/OG_SIZE = \{ width: 1200, height: 630 \}/.test(og) && /public\/images\/logo\.png/.test(og) && /squareMarkUrl/.test(og) && !/#[0-9a-f]{6}/i.test(og), 'card: size, official logo fallback, colours from the brand mirror');
    assert(/ogImage: "\/opengraph-image"/.test(read('config/site.ts')) && /card: "summary_large_image"/.test(read('lib/seo/metadata.ts')), 'every page shares the branded image; twitter large card');
    const ex = read('app/(site)/exams/[slug]/opengraph-image.tsx');
    assert(/createPublicServerSupabaseClient/.test(ex) && /eq\("is_active", true\)/.test(ex) && /CATEGORY_SLUG_RE\.test\(slug\)/.test(ex), 'category / exam card: public rows only, slug checked');
  });

  // H-19 (phone explore bar + reveal on scroll) — RETIRED for the landing page (owner round 3, 2026-11-21): the new
  // page has no explore bar or reveal; successor: scripts/test_landing1.cjs LD-4 / LD-6.

  await test('H-20 Hindi claims are true (owner, pre-release; re-pointed to LANDING-1, round 3): the Hindi lines show only while published Hindi content exists; otherwise the owner\'s "Hindi on the way" lines', () => {
    const { LANDING_EN } = require(path.join(ROOT, 'content/landing-page/en.ts'));
    const { LANDING_HI } = require(path.join(ROOT, 'content/landing-page/hi.ts'));
    const { resolveLandingCopy } = require(path.join(ROOT, 'lib/landing/landing-copy.ts'));
    const HINDI_CLAIM = /Hindi (&|and) English|in Hindi and English|Learn in the language you think in|Can I study in Hindi|हिंदी और English में|जिस भाषा में सोचते हैं|क्या हिंदी में पढ़ाई हो सकती है/;
    for (const base of [LANDING_EN, LANDING_HI]) {
      const off = resolveLandingCopy(base, { liveExamNames: ['SSC CGL'], hindiLive: false, signupOpen: true }).t;
      const on = resolveLandingCopy(base, { liveExamNames: ['SSC CGL'], hindiLive: true, signupOpen: true }).t;
      const shown = (t) => JSON.stringify([t.hero.badge, t.hero.sub, t.faq.items[2], t.promises.items[3]]);
      assert(!HINDI_CLAIM.test(shown(off)), `${base.lang}: a Hindi claim without published Hindi content: ${shown(off).slice(0, 200)}`);
      assert(off.hero.badge === base.hindiPending.badge && off.hero.sub === base.hindiPending.sub && off.faq.items[2].q === base.hindiPending.faq.q && off.promises.items[3].title === base.hindiPending.promise.title, `${base.lang}: the pending lines`);
      assert(on.hero.badge === base.hero.badge && on.hero.sub === base.hero.sub && on.faq.items[2].q === base.faq.items[2].q && on.promises.items[3].title === base.promises.items[3].title, `${base.lang}: the Hindi-live lines`);
      assert(HINDI_CLAIM.test(shown(on)), `${base.lang}: negative control — the Hindi-live lines must carry the claim`);
      assert(!HINDI_CLAIM.test(base.meta.description), `${base.lang}: the (static) meta description makes no Hindi claim`);
    }
    // the condition: published Hindi content > 0, read with the PUBLIC client (a failed read = no claim)
    const d = code(read('lib/landing/landing-page-data.ts'));
    assert(/const hindiLive = !!hindi && hindi\.questions \+ hindi\.lessons \+ hindi\.currentAffairs > 0;/.test(d) && /loadHindiAvailability\(\)/.test(d), 'hindiLive = published Hindi content > 0 (null → false)');
    const r = read('lib/landing/hindi-content.ts');
    assert(/createPublicServerSupabaseClient\(\)/.test(r) && !/createAdminServerSupabaseClient|SERVICE_ROLE/.test(r), 'public client only');
    const f145 = read('supabase/migrations/20261116000145_pay1_b2b_public_reads.sql').match(/CREATE OR REPLACE FUNCTION public\.fn_public_hindi_question_count\(\)[\s\S]*?\$\$;/);
    assert(/sb\.rpc\("fn_public_hindi_question_count"\)/.test(r) && f145 && /qv\.language = 'hi'[\s\S]*?qv\.lifecycle_status = 'PUBLISHED'[\s\S]*?qv\.is_current = true[\s\S]*?q\.status = 'published'/.test(f145[0]) && /RETURNS integer/.test(f145[0]), 'questions query (145: fn_public_hindi_question_count, filters inside, integer only)');
    assert(/\.from\("document_versions"\)[\s\S]*?\.eq\("language", "hi"\)[\s\S]*?\.eq\("is_published", true\)[\s\S]*?\.eq\("is_current", true\)[\s\S]*?\.eq\("learning_documents\.status", "PUBLISHED"\)[\s\S]*?\.eq\("learning_documents\.is_test_content", false\)/.test(r), 'lessons query');
    assert(/if \(q\.error \|\| l\.error \|\| q\.count === null \|\| l\.count === null\) throw/.test(r), 'a failed read is not cached and makes no claim');
    return '2 languages × 2 Hindi states';
  });

  console.log(`\nHOME-1 offline: ${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
})();
