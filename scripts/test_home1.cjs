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
    const order = ['<LandingHero', '<CategoriesSection', '<LandingLoop', '<FeaturesSection', '<LandingTrust', '<LandingPlans', '<LandingFaq', '<LandingFinalCta'].map((x) => page.indexOf(x));
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

  console.log(`\nHOME-1 offline: ${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
})();
