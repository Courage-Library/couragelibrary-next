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
    assert(C.LANDING_LOOP.steps.every((x) => x.short && x.short.length <= 32) && /md:hidden">\{step\.short\}/.test(s) && /flex-row flex-wrap items-baseline/.test(s), 'loop: one line per step');
    const T = C.LANDING_PLANS.table;
    assert(/<table className="w-full border-collapse/.test(s) && /<caption className="sr-only">/.test(s) && /scope="col"/.test(s) && /scope="row"/.test(s) && /sr-only">\{pro \? "Included in Pro" : "Included free"\}/.test(s) && /Not included/.test(s), 'table semantics');
    assert(T.rows.length >= 4 && !PRICE.test(JSON.stringify(T)) && /Pricing at launch/.test(T.proNote), 'table copy');
    assert(/<details key=\{f\.q\}/.test(s) && /<summary className="focus-ring flex min-h-12/.test(s), 'accordion FAQ');
    assert(C.LANDING_TRUST.short.length <= 160 && /\{LANDING_TRUST\.short\}/.test(s), `story ${C.LANDING_TRUST.short.length} chars`);
  });

  await test('H-8 home page photo: real pipeline (1280 / 768 / 390 WebP, aspect kept, metadata dropped), negative controls; lazy + sized render; panel + actions safe', async () => {
    const sharp = require('sharp');
    const P = require(path.join(ROOT, 'lib/media/photo-image.ts'));
    const img = (w, h, fmt = 'jpeg') => sharp({ create: { width: w, height: h, channels: 3, background: { r: 120, g: 140, b: 160 } } }).withMetadata({ exif: { IFD0: { Artist: 'SECRET-PERSON' } } })[fmt]().toBuffer();
    const r = await P.processHomePhoto(await img(1600, 900));
    assert(r.ok, `pipeline: ${r.message}`);
    const m = await sharp(r.main).metadata();
    assert(m.format === 'webp' && m.width === 1280 && m.height === 720 && !m.exif && !r.main.includes(Buffer.from('SECRET-PERSON')), `main ${m.width}x${m.height}`);
    for (const w of [768, 390]) { const v = await sharp(r.variants[w]).metadata(); assert(v.width === w && v.format === 'webp' && Math.abs(v.height - Math.round((w * 9) / 16)) <= 1, `copy ${w}`); }
    assert(r.width === 1280 && r.height === 720 && /^[0-9a-f]{64}$/.test(r.sha256), 'size / hash');
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
    const photo = R2.homePhotoFrom({ path: `site/home_photo/${'b'.repeat(64)}.webp`, alt: 'Reading room of the library', width: 1280, height: 720 });
    const withPhoto = renderToStaticMarkup(React.createElement(S.LandingTrust, { photo }));
    assert(/<img[^>]+srcSet="\/media\/logos\/site\/home_photo\/b{64}-390\.webp 390w, \/media\/logos\/site\/home_photo\/b{64}-768\.webp 768w, \/media\/logos\/site\/home_photo\/b{64}\.webp 1280w"/.test(withPhoto) && /width="1280"/.test(withPhoto) && /height="720"/.test(withPhoto) && /loading="lazy"/.test(withPhoto) && /alt="Reading room of the library"/.test(withPhoto) && !/supabase/.test(withPhoto), 'photo render');
    assert(!/<img/.test(renderToStaticMarkup(React.createElement(S.LandingTrust, {}))) && R2.homePhotoFrom({ path: 'orgs/x.webp', alt: 'x', width: 1, height: 1 }) === null, 'text-only fallback / path check');
    const panel = read('components/admin/settings/home-photo-panel.tsx');
    assert(/accept=\{PHOTO_ACCEPT\}/.test(panel) && /fd\.set\("noFaces", "yes"\)/.test(panel) && /disabled=\{!prepared \|\| !noFaces \|\| alt\.trim\(\)\.length < 3/.test(panel), 'panel requirements');
    assert(/await guarded\(\(\) => uploadHomePhotoAction\(fd\)\)/.test(panel) && /await guarded\(\(\) => removeHomePhotoAction\(\)\)/.test(panel), 'panel: every call wrapped');
    const act = read('app/admin/system/photo-actions.ts');
    const fns = [...act.matchAll(/export async function (\w+)\([^)]*\)[^\n]*\{\n\s*const auth = await guardAdminAction\(\);/g)].map((x) => x[1]);
    assert(fns.join() === 'uploadHomePhotoAction,removeHomePhotoAction' && !/allowStaff/.test(act), 'actions admin-only');
    const order = ['processHomePhoto(', 'storage.from(BUCKET).upload(', 'rpc("fn_site_media_set"', 'remove(withCopies(oldPath))'].map((x) => act.indexOf(x));
    assert(order.every((x, i) => x > 0 && (i === 0 || x > order[i - 1])) && /formData\.get\("noFaces"\) !== "yes"/.test(act), `action order ${order}`);
    // a failed exam read on a category page is said honestly and never de-indexes the page
    const cp = read('components/exams/category-page.tsx');
    assert(/examsFailed \? \(/.test(cp) && /could not be loaded right now/.test(cp) && /noIndex: !cat\.examsFailed && cat\.category\.activeExams === 0/.test(read('app/exams/[slug]/page.tsx')), 'category page: failed read handling');
    return '1280/768/390 + 4 refusals + render';
  });

  console.log(`\nHOME-1 offline: ${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
})();
