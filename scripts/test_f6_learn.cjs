#!/usr/bin/env node
/**
 * F6 — Learn: questions → topic article → "Practice this topic" (R1, R4, R10). Offline gate (TS transpile + mocks):
 *   LN-01 topicPracticeHref: only with practice on AND ≥ 1 servable question; the F2 session link (never /practice?topic=)
 *   LN-02 loadTopicLearning: canonical TOPIC nodes only (inactive / non-topic / bad id → null); documents from the ONE
 *         resolver path (primary first); /learn/topics/<id> redirects to the primary article, else a plain fallback
 *   LN-03 article page: ONE primary ("Practice this topic", only when practicable); related topics → article or the
 *         canonical topic entry; SEO + locked panel kept; no dead /practice?topic= link anywhere in the app
 *   LN-04 admin linking: canonical-topic validation (not the legacy topics table); move a unit = audited UPDATE of
 *         learning_units.topic_id (no copy, no new store); ADMIN-IA-1: the screens are retired, read-only legacy tab; no migration
 * Run: node scripts/test_f6_learn.cjs
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
let passed = 0;
let failed = 0;
async function test(name, fn) {
  try {
    const info = await fn();
    passed++;
    console.log(`  PASS  ${name}${info ? ' — ' + info : ''}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL  ${name}\n        ${String(e && e.message ? e.message : e).slice(0, 1200)}`);
  }
}
const assert = (c, m) => {
  if (!c) throw new Error(m || 'assertion failed');
};

const ts = require('typescript');
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request.startsWith('@/')) return origResolve.call(this, path.resolve(ROOT, request.slice(2)), parent, isMain, options);
  return origResolve.call(this, request, parent, isMain, options);
};
const transpile = (module, filename) => {
  const out = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } });
  module._compile(out.outputText, filename);
};
require.extensions['.ts'] = transpile;
let servable = new Map();
let docs = [];
const MOCKS = {
  'server-only': {},
  '@/lib/practice/server': { servableTopicCounts: async (_s, ids) => new Map(ids.map((i) => [i, servable.get(i) ?? 0])) },
  '@/services/learning/learning-resolver.service': { LearningResolverService: { resolveForTopic: async () => docs } },
};
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (Object.prototype.hasOwnProperty.call(MOCKS, request)) return MOCKS[request];
  return origLoad.call(this, request, parent, isMain);
};
const T = '11111111-2222-4333-8444-555555555555';
const nodes = {
  [T]: { id: T, name: 'Time and Distance', node_type: 'TOPIC', is_active: true, parent_id: 'p1' },
  p1: { name: 'Quantitative Aptitude' },
  sub: { id: 'aaaaaaaa-2222-4333-8444-555555555555', name: 'Quant', node_type: 'SUBJECT', is_active: true, parent_id: null },
};
const supabase = {
  from: () => {
    let id;
    const q = { select: () => q, eq: (_c, v) => ((id = v), q), maybeSingle: async () => ({ data: nodes[id] ?? null }) };
    return q;
  },
};

(async () => {
  const L = require(path.join(ROOT, 'lib/learn/topic.ts'));

  await test('LN-01 practice link only with practice on and servable questions', async () => {
    delete process.env.PRACTICE_ENABLED;
    servable = new Map([[T, 12]]);
    assert((await L.topicPracticeHref(supabase, T)) === null, 'practice off → null');
    process.env.PRACTICE_ENABLED = 'true';
    assert((await L.topicPracticeHref(supabase, T)) === `/practice/session?topic=${T}&n=10`, 'F2 session link');
    servable = new Map();
    assert((await L.topicPracticeHref(supabase, T)) === null, 'no servable question → null');
    assert((await L.topicPracticeHref(supabase, 'not-a-uuid')) === null && (await L.topicPracticeHref(supabase, null)) === null, 'bad id → null');
  });

  await test('LN-02 canonical topics only; documents from the one resolver; route redirects to the primary article', async () => {
    docs = [{ href: '/articles/t-and-d-lesson', canonical_slug: 't-and-d-lesson' }, { href: '/articles/t-and-d-summary' }];
    servable = new Map([[T, 3]]);
    const t = await L.loadTopicLearning(supabase, T);
    assert(t && t.topic.name === 'Time and Distance' && t.topic.sectionName === 'Quantitative Aptitude' && t.documents[0].href === '/articles/t-and-d-lesson' && t.practiceHref, JSON.stringify(t));
    assert((await L.loadTopicLearning(supabase, nodes.sub.id)) === null, 'a SUBJECT node is not a topic');
    assert((await L.loadTopicLearning(supabase, 'x')) === null, 'bad id');
    const page = code(read('app/learn/topics/[topicId]/page.tsx'));
    assert(/const primary = t\.documents\[0\];\s*if \(primary\) redirect\(primary\.href\);/.test(page) && /if \(!t\) notFound\(\);/.test(page), 'redirect to the primary article; 404 for non-topics');
    assert(/t\.practiceHref \? <ButtonLink href=\{t\.practiceHref\}>Practice this topic<\/ButtonLink> : <ButtonLink href="\/articles" variant="secondary">/.test(page), 'fallback: ONE action');
    assert(L.topicLearnHref(T) === `/learn/topics/${T}`, 'canonical href');
    delete process.env.PRACTICE_ENABLED;
  });

  await test('LN-03 article page: one primary, practicable only; related → article / topic entry; SEO kept; no dead links', () => {
    const a = code(read('app/articles/[slug]/page.tsx'));
    const primaries = (a.match(/<ButtonLink\b(?![^>]*variant=)/g) || []).length;
    assert(primaries === 1 && /\{practiceHref \? \(/.test(a) && /<ButtonLink href=\{practiceHref\}[\s\S]{0,300}?data-practice-topic=""/.test(a), `one primary ButtonLink (Practice this topic), got ${primaries}`);
    assert(/topicPracticeHref\(supabase, topicId\)/.test(a) && /rel\.learningSlug \? `\/articles\/\$\{rel\.learningSlug\}` : topicLearnHref\(rel\.topicId\)/.test(a), 'practice via the F2 helper; related links');
    assert(/export async function generateMetadata/.test(a) && /generateArticleSchema/.test(a) && /generateBreadcrumbSchema/.test(a) && /data-testid="learning-locked-panel"/.test(a) && /LessonBlocksRenderer/.test(a), 'SEO + locked panel + renderer kept (CA-3: DB lesson blocks)');
    assert(!/amber-|accent-|bg-gradient|from-teal|text-\[1[01]px\]/.test(a), 'light page, no amber, no 10–11 px text');
    const walk = (d) => fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${d}/${e.name}`) : /\.(tsx?)$/.test(e.name) ? [`${d}/${e.name}`] : []));
    const dead = ['app', 'components', 'lib', 'services'].flatMap(walk).filter((f) => /\/practice\?topic=/.test(read(f)));
    assert(dead.length === 0, `dead /practice?topic= links: ${dead.join(', ')}`);
  });

  await test('LN-04 admin linking: canonical validation, audited move, guarded action, no new store', () => {
    const svc = code(read('services/admin-content-studio.service.ts'));
    const create = svc.slice(svc.indexOf('static async createLearningUnit('), svc.indexOf('private static async isActiveCanonicalTopic('));
    assert(!/from\('topics'\)/.test(create) && /this\.isActiveCanonicalTopic\(supabase, params\.topicId\)/.test(create), 'unit creation validates canonical topics');
    assert(/from\('canonical_taxonomy_nodes'\)\.select\('id'\)\.eq\('id', topicId\)\.eq\('node_type', 'TOPIC'\)\.eq\('is_active', true\)/.test(svc), 'canonical TOPIC check');
    const relink = svc.slice(svc.indexOf('static async relinkLearningUnitTopic('), svc.indexOf('static async setDocumentAccessLevel('));
    assert(/requireAdminAuth\('relinkLearningUnitTopic'\)/.test(relink) && /from\('learning_units'\)\.update\(\{ topic_id: topicId/.test(relink) && /'LEARNING_UNIT_RELINK'/.test(relink) && /'23505'/.test(relink), 'admin-only, audited UPDATE, slug clash handled');
    assert(!/insert\(|learning_documents|document_versions/.test(relink), 'moving never copies content');
    // ADMIN-IA-1 (owner ruling Q-L, 2026-10-29): the Content Studio + Topic links screens are retired; the legacy units
    // are shown READ ONLY under Lessons (no relink action is reachable any more; the service method stays, unused)
    assert(!fs.existsSync(path.join(ROOT, 'app/admin/content')), 'the retired Content Studio routes are gone');
    const legacy = code(read('app/admin/lessons/legacy/page.tsx'));
    assert(/requireAdminPage\(\{ path: "\/admin\/lessons\/legacy" \}\)/.test(legacy) && !/\.update\(|\.insert\(|\.rpc\(/.test(legacy), 'legacy tab: admin guard, read only');
    assert(!fs.readdirSync(path.join(ROOT, 'supabase/migrations')).some((f) => /f6/i.test(f)), 'no migration for F6');
  });

  console.log(`\nF6 learn: ${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
})();
