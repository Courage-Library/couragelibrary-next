#!/usr/bin/env node
/**
 * PERF-HOME-1 — offline gate: the cached public pages ("/", "/exams", the category pages) change AT ONCE after every
 * admin write that changes what they show.
 *   W-1 every listed admin write calls revalidatePublicPages() on its success path — directly, or through the file's own
 *       helper that calls it (done / refresh / revalidateLogoPages / revalidateCategoryPages / toggleQuestionStatusAction)
 *   W-2 the helper drops every cache tag the public pages read through (each unstable_cache tag in their loaders) and
 *       revalidates "/", "/exams" and the cached category route
 *   W-3 the cached pages are ISR (export const revalidate, no force-dynamic, no cookies()/headers()); the exam hub stays
 *       dynamic: it lives in the session-shell group app/(site) (never app/(public)) — the live gate checks its headers
 *   W-4 the public layout reads no session (no cookies(), headers(), getUser, getSession, AppShell) and ships no Supabase
 *       client (the signed-in nav reads the local session cookie — lib/ui/local-session.ts)
 *   W-6 that reader (display only): base64 / chunked / plain-JSON cookies → the user; missing / garbage → null
 *   W-5 the helper, run against a recording next/cache: drops the 3 tags, revalidates "/", "/exams" and the
 *       /category/[slug] page; outside a request (next/cache throws) it is a silent no-op
 * --self-test: NEGATIVE CONTROLS — a write with its call removed, a helper missing a tag, a force-dynamic page and a
 * public layout that reads the session must each fail.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

// [file, function, how] — how: 'direct' (the call is in its body) or the name of the helper in the same file it calls
const WRITES = [
  ['app/(site)/admin/exams/logo-actions.ts', 'revalidateLogoPages', 'direct'],
  ['app/(site)/admin/exams/logo-actions.ts', 'revalidateCategoryPages', 'direct'],
  ['app/(site)/admin/exams/logo-actions.ts', 'uploadCategoryIconAction', 'revalidateCategoryPages'],
  ['app/(site)/admin/exams/logo-actions.ts', 'removeCategoryIconAction', 'revalidateCategoryPages'],
  ['app/(site)/admin/exams/logo-actions.ts', 'saveCategoryAction', 'revalidateCategoryPages'],
  ['app/(site)/admin/exams/logo-actions.ts', 'setLogo', 'revalidateLogoPages'],
  ['app/(site)/admin/exams/logo-actions.ts', 'removeLogo', 'revalidateLogoPages'],
  ['app/(site)/admin/system/brand-actions.ts', 'done', 'direct'],
  ['app/(site)/admin/system/brand-actions.ts', 'uploadBrandAssetAction', 'done'],
  ['app/(site)/admin/system/brand-actions.ts', 'removeBrandAssetAction', 'done'],
  ['app/(site)/admin/system/photo-actions.ts', 'done', 'direct'],
  ['app/(site)/admin/system/photo-actions.ts', 'addGalleryPhotoAction', 'done'],
  ['app/(site)/admin/system/photo-actions.ts', 'updateGalleryPhotoAction', 'done'],
  ['app/(site)/admin/system/photo-actions.ts', 'moveGalleryPhotoAction', 'done'],
  ['app/(site)/admin/system/photo-actions.ts', 'removeGalleryPhotoAction', 'done'],
  ['app/(site)/admin/actions.ts', 'createMockTestAction', 'direct'],
  ['app/(site)/admin/actions.ts', 'updateMockTestAction', 'direct'],
  ['app/(site)/admin/actions.ts', 'toggleMockTestPublishAction', 'direct'],
  ['app/(site)/admin/actions.ts', 'toggleQuestionStatusAction', 'direct'],
  ['app/(site)/admin/actions.ts', 'toggleQuestionPublishAction', 'toggleQuestionStatusAction'],
  ['app/(site)/admin/actions.ts', 'deleteQuestionAction', 'direct'],
  ['app/(site)/admin/exams/actions.ts', 'createExamDraftAction', 'direct'],
  ['app/(site)/admin/exams/actions.ts', 'updateExamIdentityAction', 'direct'],
  ['app/(site)/admin/exams/actions.ts', 'publishExamAction', 'direct'],
  ['app/(site)/admin/exams/actions.ts', 'archiveExamAction', 'direct'],
  ['app/(site)/admin/exams/actions.ts', 'deleteExamDraftAction', 'direct'],
  ['app/(site)/admin/lessons/actions.ts', 'publishLessonAction', 'direct'],
  ['app/(site)/admin/syllabus/actions.ts', 'publishSyllabusVersionAction', 'direct'],
  ['app/(site)/admin/syllabus/actions.ts', 'archiveSyllabusVersionAction', 'direct'],
  ['actions/admin-exam-knowledge.actions.ts', 'publishExamDocVersionAction', 'direct'],
  ['actions/question-factory.actions.ts', 'qfPublishAction', 'direct'],
  ['app/api/admin/current-affairs/articles/[id]/publish/route.ts', 'POST', 'direct'],
  ['app/api/admin/current-affairs/articles/[id]/archive/route.ts', 'POST', 'direct'],
];
// the bulk importer (mock tests) is checked by the call next to BulkImportEngine.processImport
const BULK = ['app/(site)/admin/actions.ts', 'BulkImportEngine.processImport('];
const HELPER = 'lib/cache/revalidate-public.ts';
const CACHED_PAGES = ['app/(public)/page.tsx', 'app/(public)/exams/page.tsx', 'app/(public)/category/[slug]/page.tsx'];
const HUB = 'app/(site)/exams/[slug]/page.tsx';
const HUB_PUBLIC = 'app/(public)/exams/[slug]/page.tsx';
const PUBLIC_LAYOUT = ['app/(public)/layout.tsx', 'components/shell/public-shell.tsx', 'components/shell/public-student-nav.tsx', 'lib/ui/local-session.ts', 'components/landing/landing-cta.tsx', 'app/layout.tsx'];
// the cached reads the public pages use (each unstable_cache tag there must be dropped by the helper)
const LOADERS = ['lib/exams/category-data.ts', 'lib/brand/brand-assets.ts', 'lib/landing/hindi-content.ts', 'lib/landing/home-facts.ts', 'lib/media/site-media.ts'];

/** the body of `name` (function declaration, const arrow, or exported route handler) — by brace matching */
function bodyOf(src, name) {
  const re = new RegExp(`(?:^|\\n)(?:export )?(?:async )?function ${name.replace(/[$]/g, '\\$')}\\b|(?:^|\\n)(?:export )?const ${name} = `);
  const m = re.exec(src);
  if (!m) return null;
  // the body's "{": the first "{" that ends a line after the parameter list
  const open = /\)\s*(?::[^{=\n]*(?:\{[^}\n]*\}[^{=\n]*)*)?(?:=>\s*)?\{\s*\n/g;
  open.lastIndex = m.index;
  const o = open.exec(src);
  if (!o) return null;
  let i = o.index + o[0].lastIndexOf('{');
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}' && --depth === 0) return src.slice(i, j + 1);
  }
  return null;
}

function check(files) {
  const fails = [];
  const get = (f) => (f in files ? files[f] : read(f));
  // W-1
  for (const [f, fn, how] of WRITES) {
    const src = get(f);
    const b = bodyOf(src, fn);
    if (!b) { fails.push(`W-1 ${f}: ${fn} not found`); continue; }
    const callee = how === 'direct' ? 'revalidatePublicPages' : how;
    if (!new RegExp(`\\b${callee}\\(`).test(b)) fails.push(`W-1 ${f}: ${fn} does not call ${callee}()`);
    if (how === 'direct' && !/import \{ revalidatePublicPages \} from "@\/lib\/cache\/revalidate-public";/.test(src)) fails.push(`W-1 ${f}: no import of revalidatePublicPages`);
  }
  {
    const src = get(BULK[0]);
    const k = src.indexOf(BULK[1]);
    if (k < 0 || !/revalidatePublicPages\(\)/.test(src.slice(k, k + 1500))) fails.push('W-1 bulk import: no revalidatePublicPages() after BulkImportEngine.processImport');
  }
  // W-2
  const helper = get(HELPER);
  const tags = new Set();
  for (const f of LOADERS) {
    if (!(f in files) && !fs.existsSync(path.join(ROOT, f))) continue;
    for (const m of get(f).matchAll(/tags:\s*\[([^\]]*)\]/g)) for (const t of m[1].matchAll(/["']([^"']+)["']/g)) tags.add(t[1]);
    for (const m of get(f).matchAll(/export const [A-Z_]*CACHE_TAG = ["']([^"']+)["']/g)) tags.add(m[1]);
  }
  const tagList = (/PUBLIC_PAGE_TAGS = \[([^\]]*)\]/.exec(helper) || [])[1] || '';
  const helperTags = new Set([...tagList.matchAll(/"([^"]+)"/g)].map((x) => x[1]));
  for (const t of tags) if (!helperTags.has(t) && !/^learn/.test(t)) fails.push(`W-2 helper does not drop the cache tag "${t}"`);
  if (!/PUBLIC_PAGE_PATHS = \["\/", "\/exams"\]/.test(helper) || !/revalidatePath\(PUBLIC_CATEGORY_ROUTE, "page"\)/.test(helper) || !/PUBLIC_CATEGORY_ROUTE = "\/category\/\[slug\]"/.test(helper)) fails.push('W-2 helper does not revalidate "/", "/exams" and /category/[slug]');
  if (tags.size < 3) fails.push(`W-2 found only ${tags.size} loader tags (expected categories, brand-assets, hindi-content)`);
  // W-3
  for (const f of CACHED_PAGES) {
    const s = get(f);
    if (!/export const revalidate = (60|[1-2]\d\d|300);/.test(s)) fails.push(`W-3 ${f}: no revalidate 60–300`);
    if (/force-dynamic|\bcookies\(\)|\bheaders\(\)/.test(s)) fails.push(`W-3 ${f}: dynamic (force-dynamic / cookies / headers)`);
  }
  const hubPublic = HUB_PUBLIC in files ? files[HUB_PUBLIC] !== null : fs.existsSync(path.join(ROOT, HUB_PUBLIC));
  if (!(HUB in files ? files[HUB] !== null : fs.existsSync(path.join(ROOT, HUB))) || hubPublic) fails.push('W-3 the exam hub is cached (moved out of the session shell; owner: stays dynamic for now)');
  // W-4
  for (const f of PUBLIC_LAYOUT) {
    const s = get(f).replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
    if (/\bcookies\(\)|\bheaders\(\)|getUser\(|getSession\(|<AppShell\b|createServerSupabaseClient\(/.test(s)) fails.push(`W-4 ${f}: reads the session / request`);
    // the public pages ship no Supabase client: its bundle carries the project address (anonymous smoke)
    if (/@\/lib\/supabase\/client|@supabase\/(ssr|supabase-js)/.test(s)) fails.push(`W-4 ${f}: imports a Supabase client into the public pages`);
  }
  return fails;
}

if (process.argv.includes('--self-test')) {
  const mutate = (f, from, to) => ({ [f]: read(f).replace(from, to) });
  const controls = [
    ['a write without its call', mutate('app/(site)/admin/exams/actions.ts', /\n[ \t]*revalidatePublicPages\(\);[^\n]*/, ''), /W-1 .*exams\/actions\.ts/],
    ['the CA publish route without its call', mutate('app/api/admin/current-affairs/articles/[id]/publish/route.ts', /\n[ \t]*revalidatePublicPages\(\);[^\n]*/, ''), /W-1 .*publish\/route/],
    ['a helper that skips a tag', mutate(HELPER, '"brand-assets", ', ''), /W-2 .*brand-assets/],
    ['a force-dynamic cached page', mutate('app/(public)/page.tsx', 'export const revalidate = 300;', 'export const dynamic = "force-dynamic";'), /W-3 app\/\(public\)\/page\.tsx/],
    ['a public shell that reads the session', mutate('components/shell/public-shell.tsx', /\n/, '\nconst __x = () => cookies();\n'), /W-4 components\/shell\/public-shell/],
    ['a public nav that imports the Supabase browser client', mutate('components/shell/public-student-nav.tsx', /\n/, '\nimport { createClient } from "@/lib/supabase/client";\n'), /W-4 components\/shell\/public-student-nav/],
    ['a cached exam hub (moved to the public group)', { [HUB]: null, [HUB_PUBLIC]: read(HUB) }, /W-3 the exam hub/],
  ];
  let bad = 0;
  for (const [n, files, want] of controls) {
    const f = check(files);
    const caught = f.some((x) => want.test(x));
    if (!caught) bad++;
    console.log(`${caught ? 'OK  ' : 'MISS'} negative control: ${n}${caught ? '' : ' — ' + JSON.stringify(f)}`);
  }
  if (check({}).length) { console.log('baseline not clean:', check({})); bad++; }
  console.log(bad ? 'PERF-HOME-1 wiring self-test: FAILED' : 'PERF-HOME-1 wiring self-test: all negative controls caught');
  process.exit(bad ? 1 : 0);
}

/** W-5: run the real helper (transpiled) against a recording next/cache */
function runHelper(throwing) {
  const ts = require('typescript');
  const out = ts.transpileModule(read(HELPER), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const calls = [];
  const cache = { revalidateTag: (t) => { if (throwing) throw new Error('outside a request'); calls.push(['tag', t]); }, revalidatePath: (p, k) => calls.push(['path', p, k || null]) };
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', out)((id) => (id === 'next/cache' ? cache : require(id)), mod, mod.exports);
  mod.exports.revalidatePublicPages();
  return calls;
}
function checkHelper() {
  const want = JSON.stringify([['tag', 'categories'], ['tag', 'brand-assets'], ['tag', 'hindi-content'], ['path', '/', null], ['path', '/exams', null], ['path', '/category/[slug]', 'page']]);
  const got = JSON.stringify(runHelper(false));
  const f = [];
  if (got !== want) f.push(`W-5 helper calls ${got}`);
  try { runHelper(true); } catch (e) { f.push(`W-5 helper throws outside a request: ${e.message}`); }
  return f;
}
/** W-6: the local session reader (display only) — base64 / chunked / plain JSON; anything unreadable → null */
function checkLocalSession() {
  const ts = require('typescript');
  const out = ts.transpileModule(read('lib/ui/local-session.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', out)(require, mod, mod.exports);
  const r = mod.exports.readLocalSessionUser;
  const json = JSON.stringify({ access_token: 'x', user: { email: 'fake@example.test', user_metadata: { full_name: ' Fake Name ' }, app_metadata: { role: 'student' } } });
  const b64 = 'base64-' + Buffer.from(json).toString('base64url');
  const want = JSON.stringify({ email: 'fake@example.test', fullName: 'Fake Name', role: 'student' });
  const f = [];
  const cases = [
    ['base64', `a=1; sb-fakeref-auth-token=${b64}`, want],
    ['chunked', `sb-fakeref-auth-token.0=${b64.slice(0, 40)}; x=2; sb-fakeref-auth-token.1=${b64.slice(40)}`, want],
    ['plain JSON', `sb-fakeref-auth-token=${encodeURIComponent(json)}`, want],
    ['no cookie', 'a=1', 'null'],
    ['garbage', 'sb-fakeref-auth-token=base64-%%%', 'null'],
    ['no user', `sb-fakeref-auth-token=base64-${Buffer.from('{}').toString('base64url')}`, 'null'],
  ];
  for (const [n, c, w] of cases) { const g = JSON.stringify(r(c)); if (g !== w) f.push(`W-6 local session (${n}): ${g}`); }
  return f;
}

const fails = [...check({}), ...checkHelper(), ...checkLocalSession()];
for (const f of fails) console.log('FAIL ' + f);
console.log(fails.length ? `PERF-HOME-1 wiring: ${fails.length} FAILURES` : `PERF-HOME-1 wiring: ALL PASS (${WRITES.length + 1} admin writes, helper tags + run, ${CACHED_PAGES.length} cached pages, public shell, local session reader)`);
process.exit(fails.length ? 1 : 0);
