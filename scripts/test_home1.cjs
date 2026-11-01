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
 *       chevron turns on open (no arrow); legal links without "(draft)" while the pages keep the notice; the final CTA
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
const PAGE = 'app/page.tsx';
const CONTENT = 'content/landing.ts';
const EXAM_WORDS = /SSC CGL|SSC CHSL|SSC MTS|SSC GD|\/exams\/ssc-|Explore SSC/;
const BANNED = /guarantee|guaranteed|100%|topper|rank ?1|AIR \d|testimonial|rating|\b\d[\d,]* (students|aspirants|users)\b|selection (is )?(sure|assured)/i;
const PRICE = /₹|\bRs\.?\s?\d|\bINR\b|\/month|per month|\bprices?\b/;

(async () => {
  await test('H-1 structure + one hero action; closed-sign-up primary = "Explore exams" → /#categories; 5 loop steps', () => {
    const page = code(read(PAGE));
    const order = ['<LandingHero', '<CategoriesSection', '<LandingLoop', '<FeaturesSection', '<TrustSection', '<LandingPlans', '<LandingFaq', '<LandingFinalCta'].map((x) => page.indexOf(x));
    assert(order.every((x, i) => x > 0 && (i === 0 || x > order[i - 1])), `section order ${order}`);
    const s = read(SECTIONS);
    const hero = s.slice(s.indexOf('export function LandingHero'), s.indexOf('export function LandingCategories'));
    assert((hero.match(/<LandingCta /g) || []).length === 1 && !/<ul\b|GlassCard|HERO_STEPS/.test(hero), 'hero: one action, no list / step card');
    const C = require(path.join(ROOT, CONTENT));
    assert(C.LANDING_HERO.secondaryCta.label === 'Explore exams' && C.LANDING_HERO.secondaryCta.href === '/#categories' && C.LANDING_LOOP.steps.length === 5, 'CTA / steps');
    assert(/id="categories"/.test(s) && /scroll-mt-24/.test(s), '#categories anchor');
  });

  await test('H-2 no exam-specific content or action on home (copy + sections + page); negative control', () => {
    const C = require(path.join(ROOT, CONTENT));
    const homeCopy = JSON.stringify([C.LANDING_HERO, C.LANDING_LOOP, C.LANDING_FEATURES, C.LANDING_TRUST, C.LANDING_PLANS, C.LANDING_FAQ, C.LANDING_FINAL_CTA, C.LANDING_CATEGORIES]);
    const hits = [homeCopy, code(read(SECTIONS)), code(read(PAGE))].map((x) => (x.match(EXAM_WORDS) || [])[0]).filter(Boolean);
    assert(hits.length === 0, `exam-specific on home: ${hits.join(', ')}`);
    assert(!/LANDING_EXAMS|<Card variant="interactive"|ExamLogoBadge/.test(code(read(SECTIONS))), 'exam cards on home');
    assert(EXAM_WORDS.test(homeCopy.replace('Explore exams', 'Explore SSC CGL')), 'negative control: a planted exam name was not caught');
  });

  await test('H-3 honest copy: no promises / toppers / testimonials / counts / prices; live features only; FAQ JSON-LD = visible FAQ; negative control', () => {
    const C = require(path.join(ROOT, CONTENT));
    const all = JSON.stringify([C.LANDING_HERO, C.LANDING_LOOP, C.LANDING_FEATURES, C.LANDING_TRUST, C.LANDING_PLANS, C.LANDING_FAQ, C.LANDING_FINAL_CTA, C.LANDING_CATEGORIES]);
    const b = all.match(BANNED);
    assert(!b, `banned: ${b && b[0]}`);
    assert(!PRICE.test(all), 'a price');
    assert(/Pricing at launch/.test(C.LANDING_PLANS.pro.note), 'Pro: "Pricing at launch"');
    assert(BANNED.test(all + ' guaranteed selection') && PRICE.test(all + ' ₹499'), 'negative control');
    const s = read(SECTIONS);
    assert(/const live = landingFeatures\(data\)\.filter\(\(r\) => r\.live\);/.test(s) && !/comingSoonLabel/.test(code(s.slice(s.indexOf('export function LandingFeatures(')))), 'what you get: live only');
    const S = require(path.join(ROOT, SECTIONS));
    const ld = S.faqJsonLd();
    assert(ld['@type'] === 'FAQPage' && ld.mainEntity.length === C.LANDING_FAQ.items.length && ld.mainEntity.every((q, i) => q.name === C.LANDING_FAQ.items[i].q && q.acceptedAnswer.text === C.LANDING_FAQ.items[i].a), 'FAQ JSON-LD');
    return `${C.LANDING_FAQ.items.length} FAQ items`;
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
    const h = read('components/shell/header-bar.tsx');
    assert(/href=\{LANDING_HERO\.secondaryCta\.href\} size="lg"/.test(h) && /href="\/auth\/login" variant="secondary" size="lg"/.test(h), 'mobile menu actions');
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
    const act = read('app/admin/system/photo-actions.ts');
    const fns = [...act.matchAll(/export async function (\w+)\([^)]*\)[^\n]*\{\n\s*const auth = await guardAdminAction\(\);/g)].map((x) => x[1]);
    assert(fns.join() === 'addGalleryPhotoAction,updateGalleryPhotoAction,moveGalleryPhotoAction,removeGalleryPhotoAction' && !/allowStaff/.test(act), `actions admin-only (${fns})`);
    const order = ['processHomePhoto(', 'storage.from(BUCKET).upload(', 'rpc("fn_site_gallery_add"'].map((x) => act.indexOf(x));
    const rm = act.slice(act.indexOf('export async function removeGalleryPhotoAction'));
    assert(order.every((x, i) => x > 0 && (i === 0 || x > order[i - 1])) && rm.indexOf('rpc("fn_site_gallery_remove"') < rm.indexOf('remove(withCopies(oldPath))') && /isPeopleBasis\(basis\)/.test(act), `action order ${order}`);
    return '1280/768/390 + 4 refusals + gallery render';
  });

  await test('H-9 owner UI review: monogram, icons, tiles without orphans, feature rows, FAQ chevron, legal labels, CTA note, section rhythm', () => {
    const s = read(SECTIONS);
    const wm = read('components/brand/wordmark.tsx');
    assert(/data-brand-monogram=""/.test(wm) && />\s*CL\s*</.test(wm) && /aria-hidden="true"/.test(wm) && !/brand-gradient size-2\.5/.test(wm), 'monogram tile');
    const icon = read('components/exams/category-icon.tsx');
    assert(/rounded-full bg-primary-50 text-primary-700/.test(icon) && /size-\[58%\]/.test(icon) && (s.match(/<CategoryIcon category=\{c\} px=\{48\} \/>/g) || []).length === 2, 'category icons: 28 px in a 48 px tint circle');
    assert(/className="col-span-full flex lg:col-span-1"/.test(s) && /const lastOdd = soonCount % 2 === 1 && c\.slug === lastSoon;/.test(s) && /"col-span-2 md:col-span-1"/.test(s), 'category tiles: live row + no orphan');
    // feature grid: every live count 1–6 fills its rows on tablets and desktop (5 on tablets: the last spans the row)
    const cols = Object.fromEntries([...s.matchAll(/^\s+(\d): "([^"]+)",$/gm)].map((m) => [m[1], m[2]]));
    for (let n = 1; n <= 6; n++) {
      const md = +((cols[n] || '').match(/md:grid-cols-(\d)/) || [])[1];
      const lg = +((cols[n] || '').match(/lg:grid-cols-(\d)/) || [])[1] || md;
      assert(md && (n % md === 0 || (n === 5 && md === 2 && /live\.length === 5 && i === 4 \? "md:col-span-2 lg:col-span-1"/.test(s))) && n % lg === 0, `features: ${n} live → md ${md} / lg ${lg} leaves an orphan`);
    }
    assert(/data-features-list=""/.test(s) && /flex flex-col divide-y divide-line rounded-card/.test(s.slice(s.indexOf('data-features-list') - 400)), 'features: one column of rows on phones');
    const faq = s.slice(s.indexOf('export function LandingFaq'), s.indexOf('export function faqJsonLd'));
    assert(/<ChevronDown aria-hidden="true" data-faq-chevron="" className="[^"]*group-open:rotate-180/.test(faq) && !/ArrowRight/.test(faq) && /<details key=\{f\.q\}/.test(faq), 'FAQ chevron');
    const pp = require(path.join(ROOT, 'content/public-pages.ts'));
    const legal = JSON.stringify(pp.FOOTER_ABOUT.legal);
    assert(/"label":"Privacy"/.test(legal) && /"label":"Terms"/.test(legal) && !/draft/i.test(legal), 'footer legal labels');
    assert(/Privacy policy \(draft\)/.test(read('content/public-pages.ts')) && /Terms of use \(draft\)/.test(read('content/public-pages.ts')), 'legal pages keep their draft title');
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
    const h = read('components/shell/header-bar.tsx');
    const tag = (h.match(/<header [^>]*>/) || [''])[0];
    assert((h.match(/<header /g) || []).length === 1 && /sticky top-0/.test(tag) && /border-b border-line bg-surface/.test(tag) && /scrolled \? "shadow-e2" : "shadow-none"/.test(tag) && /data-header-solid=""/.test(tag), 'one solid header');
    assert(!/GlassNav|glass-light|rounded-full pl-4/.test(h) && !/GlassNav/.test(read('components/ui/glass.tsx')), 'no floating glass pill');
    assert(/window\.addEventListener\("scroll", onScroll, \{ passive: true \}\)/.test(h) && /removeEventListener\("scroll", onScroll\)/.test(h), 'passive scroll listener, cleaned up');
    assert(/flex h-16 w-full max-w-\[1200px\]/.test(h) && /className="size-12 rounded-full lg:hidden"/.test(h), '64 px bar, 48 px menu button');
    assert(!/-mt-\[76px\]/.test(read('components/ui/gradient-hero.tsx')), 'hero no longer pulled up under a floating nav');
    // negative control: the detector flags a glass header
    assert(/GlassNav|glass-light/.test(h.replace('data-header-solid=""', 'className="glass-light"')), 'negative control');
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
    const phone = ['hero', 'learn', 'practice', 'mock', 'analyze', 'revise'].reduce((t, k) => t + M[k].files['390'].bytes, 0);
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

  console.log(`\nHOME-1 offline: ${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
})();
