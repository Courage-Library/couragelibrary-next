#!/usr/bin/env node
/**
 * SEO-TOPIC-CANON-1 (owner GO 2026-11-11) — offline gate. A TOPIC flagged metadata.lesson_at_topic = true serves its
 * subtopic's lesson at the topic URL; the subtopic URL 308s there. Explicit flag only, never auto-detection.
 *   S-1 flagged topic + one subtopic with a lesson → topic path ↔ subtopic path; canonical path + 308 target
 *   S-2 negative controls: flag off, a non-boolean flag ("true"), the topic's own lesson, a subtopic without a lesson, an
 *       internal / inactive subtopic, an inactive topic → no mapping, no redirect
 *   S-3 a second subtopic is added: still governed by the flag only — flag on → the first subtopic (display order)
 *       moves to the topic URL, the second keeps its own URL; flag off → nothing moves, even for an obvious rename
 *   S-4 withLessonAtTopic sets / removes only its own key (other metadata kept)
 *   S-5 sitemap: with the canonical paths, the topic URL is listed (learn + exam-topic) and the subtopic URL is not;
 *       an unflagged lesson keeps its own URL
 *   S-6 wiring: /learn, /hi/learn and /exams/<exam>/… call redirectToTopicCanon in generateMetadata AND the page;
 *       permanentRedirect (308); the lesson page serves the subtopic's lesson (progress stays per document); exam notes;
 *       sitemap + course links use the canonical path (course tree matching keeps the node's own); caches bumped
 *   S-7 the flag changes only through the audited admin action (admin only, TOPIC only, TAXONOMY_NODE_LESSON_AT_TOPIC,
 *       revalidates "learn"); the admin UI shows the toggle
 *   S-8 the seed script writes the same key + the same audit row, has --dry-run, refuses a real run before production
 *       runs the code (DEPLOY-BEFORE-ACTIVATE), SAFE-NET first; negative control: a planted different audit type fails
 * Run: node scripts/test_seo_topic_canon1.cjs
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request.startsWith('@/')) return origResolve.call(this, path.resolve(ROOT, request.slice(2)), parent, isMain, options);
  return origResolve.call(this, request, parent, isMain, options);
};
require.extensions['.ts'] = (module, filename) => {
  const out = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } });
  module._compile(out.outputText, filename);
};

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    const info = fn();
    passed++;
    console.log(`  PASS  ${name}${info ? ' — ' + info : ''}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL  ${name}\n        ${String(e && e.message ? e.message : e).slice(0, 700)}`);
  }
}
const assert = (c, m) => {
  if (!c) throw new Error(m || 'assertion failed');
};

const TC = require(path.join(ROOT, 'lib/learn/topic-canon.ts'));
const SM = require(path.join(ROOT, 'lib/learn/sitemap.ts'));
const P = require(path.join(ROOT, 'lib/learn/paths.ts'));

const TOPIC = 'english-comprehension.antonyms';
const SUB = 'english-comprehension.antonyms.opposite-word-meaning';
const node = (id, parentId, nodeType, hierarchyPath, extra = {}) => ({ id, parentId, nodeType, hierarchyPath, displayOrder: 0, name: hierarchyPath.split('.').pop(), isActive: true, isInternal: false, metadata: {}, ...extra });
const flagged = (extra = {}) => node('t', 's0', 'TOPIC', TOPIC, { metadata: { lesson_at_topic: true, source: 'TAXONOMY_ADMIN' }, ...extra });
const sub = (extra = {}) => node('u', 't', 'SUBTOPIC', SUB, extra);
const none = (canon) => Object.keys(canon.subToTopic).length === 0 && Object.keys(canon.topicToSub).length === 0;

test('S-1 flagged topic + one subtopic with a lesson: topic URL is canonical, subtopic URL → 308 topic URL', () => {
  const canon = TC.buildTopicCanon([flagged(), sub()], ['u']);
  assert(canon.topicToSub[TOPIC] === SUB && canon.subToTopic[SUB] === TOPIC, JSON.stringify(canon));
  assert(TC.canonicalLessonPath(SUB, canon) === TOPIC && TC.canonicalLessonPath(TOPIC, canon) === TOPIC, 'canonical path');
  assert(TC.topicCanonRedirect(SUB, canon) === TOPIC && TC.topicCanonRedirect(TOPIC, canon) === null && TC.topicCanonRedirect(null, canon) === null, 'redirect target');
  assert(P.learnHref(TC.topicCanonRedirect(SUB, canon)) === '/learn/english-comprehension/antonyms' && P.examTopicHref('ssc-cgl', TC.topicCanonRedirect(SUB, canon)) === '/exams/ssc-cgl/english-comprehension/antonyms', 'hrefs');
});

test('S-2 negative controls: flag off / non-boolean / own topic lesson / no subtopic lesson / internal or inactive subtopic / inactive topic → no redirect', () => {
  const cases = {
    'flag off': [[node('t', 's0', 'TOPIC', TOPIC), sub()], ['u']],
    'flag "true" (string)': [[flagged({ metadata: { lesson_at_topic: 'true' } }), sub()], ['u']],
    'topic has its own lesson': [[flagged(), sub()], ['t', 'u']],
    'subtopic has no lesson': [[flagged(), sub()], []],
    'internal subtopic': [[flagged(), sub({ isInternal: true })], ['u']],
    'inactive subtopic': [[flagged(), sub({ isActive: false })], ['u']],
    'inactive topic': [[flagged({ isActive: false }), sub()], ['u']],
    'flag on a SUBTOPIC': [[node('t', 's0', 'TOPIC', TOPIC), sub({ metadata: { lesson_at_topic: true } })], ['u']],
  };
  for (const [name, [nodes, servable]] of Object.entries(cases)) {
    const canon = TC.buildTopicCanon(nodes, servable);
    assert(none(canon) && TC.topicCanonRedirect(SUB, canon) === null && TC.canonicalLessonPath(SUB, canon) === SUB, `${name}: ${JSON.stringify(canon)}`);
  }
  return `${Object.keys(cases).length} controls`;
});

test('S-3 a second subtopic is added: the flag alone decides (no auto-detection either way)', () => {
  const second = node('v', 't', 'SUBTOPIC', `${TOPIC}.prefix-antonyms`, { displayOrder: 2 });
  const on = TC.buildTopicCanon([flagged(), sub({ displayOrder: 1 }), second], ['u', 'v']);
  assert(on.subToTopic[SUB] === TOPIC && !on.subToTopic[second.hierarchyPath] && TC.canonicalLessonPath(second.hierarchyPath, on) === second.hierarchyPath, `flag on: ${JSON.stringify(on)}`);
  const reordered = TC.buildTopicCanon([flagged(), sub({ displayOrder: 3 }), second], ['u', 'v']);
  assert(reordered.subToTopic[second.hierarchyPath] === TOPIC && !reordered.subToTopic[SUB], 'the FIRST subtopic by display order is served');
  const off = TC.buildTopicCanon([node('t', 's0', 'TOPIC', TOPIC), sub({ displayOrder: 1 }), second], ['u', 'v']);
  assert(none(off), 'flag off: nothing moves, even though "Opposite Word Meaning" renames "Antonyms"');
});

test('S-4 withLessonAtTopic sets / removes only its key; isLessonAtTopic is strict', () => {
  const on = TC.withLessonAtTopic({ source: 'TAXONOMY_ADMIN', content_source: 'X' }, true);
  assert(on.lesson_at_topic === true && on.source === 'TAXONOMY_ADMIN' && on.content_source === 'X', JSON.stringify(on));
  const off = TC.withLessonAtTopic(on, false);
  assert(!('lesson_at_topic' in off) && off.source === 'TAXONOMY_ADMIN', JSON.stringify(off));
  assert(TC.isLessonAtTopic({ lesson_at_topic: true }) && !TC.isLessonAtTopic({ lesson_at_topic: 'true' }) && !TC.isLessonAtTopic(null) && !TC.isLessonAtTopic([]), 'strict boolean');
  assert(JSON.stringify(TC.withLessonAtTopic(null, true)) === '{"lesson_at_topic":true}', 'null metadata');
});

test('S-5 sitemap: the topic URL is listed (learn + exam-topic), the subtopic URL is not; an unflagged lesson keeps its URL', () => {
  const canon = TC.buildTopicCanon([flagged(), sub()], ['u', 'w']);
  const own = { u: SUB, w: 'english-comprehension.synonyms.similar-word-meaning' };
  const paths = Object.fromEntries(Object.entries(own).map(([id, p]) => [id, TC.canonicalLessonPath(p, canon)]));
  const urls = SM.learnSitemapEntries('https://x', [{ nodeId: 'u', hiCurrent: false, publishedAt: null }, { nodeId: 'w', hiCurrent: false, publishedAt: null }], paths, [{ slug: 'ssc-cgl', nodeIds: ['u', 'w'], live: true }]).map((e) => e.url);
  for (const u of ['https://x/learn/english-comprehension/antonyms', 'https://x/exams/ssc-cgl/english-comprehension/antonyms', 'https://x/learn/english-comprehension/synonyms/similar-word-meaning'])
    assert(urls.includes(u), `missing ${u}: ${urls.join(' ')}`);
  assert(!urls.some((u) => u.includes('opposite-word-meaning')), `subtopic URL listed: ${urls.join(' ')}`);
});

test('S-6 wiring: redirects (metadata + page, 308), lesson served at the topic, exam notes, sitemap + course links, caches', () => {
  for (const [rel, href] of [['app/(site)/learn/[...path]/page.tsx', 'learnHref\\(p, "en"\\)'], ['app/(site)/hi/learn/[...path]/page.tsx', 'learnHref\\(p, "hi"\\)'], ['app/(site)/exams/[slug]/[moduleSlug]/[...rest]/page.tsx', 'examTopicHref\\(slug, p\\)']]) {
    const s = read(rel);
    const calls = s.match(new RegExp(`await redirectToTopicCanon\\([^;]*${href}`, 'g')) || [];
    assert(calls.length === 2, `${rel}: redirect in generateMetadata AND the page (${calls.length})`);
    assert(s.indexOf('await redirectToTopicCanon') < s.indexOf('export default'), `${rel}: metadata redirect first`);
  }
  const svc = read('services/learning/topic-canon.service.ts');
  assert(/permanentRedirect\(`\$\{href\(to\)\}\$\{query\}`\)/.test(svc) && /loadTopicCanon\(\)\.catch\(\(\) => null\)/.test(svc) && /tags: \[LEARN_CACHE_TAG\]/.test(svc), 'service: 308, fail-open read, learn tag');
  assert(/courseQuery\(sp\.course\)/.test(read('app/(site)/learn/[...path]/page.tsx')), '?course= kept on the redirect');
  const m = read('services/learning/master-lesson.service.ts');
  assert(/buildTopicCanon\(/.test(m) && /const own = lessons\.get\(servedSub \? servedSub\.id : node\.id\)/.test(m) && /k\.id !== servedSub\?\.id/.test(m) && /lessonNodeId: servedSub\?\.id \?\? node\.id/.test(m), 'master: the topic serves the subtopic lesson (same document → same progress), child list drops it');
  assert(/"learn-master", "v4"/.test(m) && /"exam-topic", "v3"/.test(read('services/learning/exam-topic.service.ts')) && /"course-ux-1", "v4"/.test(read('services/learning/course.service.ts')), 'cache keys bumped');
  const page = read('app/(site)/exams/[slug]/[moduleSlug]/[...rest]/page.tsx');
  assert(/title: examTopicTitle\(d\.node\.name, d\.exam\.title\)/.test(page) && /getPublishedExamNote\(d\.exam\.id, d\.node\.lessonNodeId, "en"\)/.test(page), 'exam-topic title = the topic name; exam note fallback');
  const sitemap = read('app/sitemap.ts');
  assert(/canonicalLessonPath\(n\.hierarchy_path, canon\)/.test(sitemap), 'sitemap paths');
  const course = read('services/learning/course.service.ts');
  assert(/learnHref\(canonicalLessonPath\(pathOf\[l\.nodeId\], canon\)\)/.test(course) && /paths: pathOf,/.test(course), 'course: canonical links; tree matching keeps the own paths');
});

test('S-7 the flag changes only through the audited admin action; the UI shows the toggle', () => {
  const svc = read('services/taxonomy/taxonomy.service.ts');
  const m = svc.match(/static async setLessonAtTopic[\s\S]*?\n  \}\n/);
  assert(m, 'setLessonAtTopic');
  const body = m[0];
  assert(/await this\.requireAdmin\(\)/.test(body) && !/allowStaff/.test(body), 'admin only (no staff)');
  assert(/node_type !== 'TOPIC'/.test(body) && /withLessonAtTopic\(row\.metadata, on\)/.test(body), 'TOPIC only, other keys kept');
  assert(/this\.audit\(ctx, 'TAXONOMY_NODE_LESSON_AT_TOPIC', id, \{ lesson_at_topic: before \}, \{ lesson_at_topic: on \}\)/.test(body), 'audited');
  const act = read('app/(site)/admin/taxonomy/actions.ts').match(/export async function setTaxonomyLessonAtTopicAction[\s\S]*?\n\}\n/);
  assert(act && /guardAdminAction\(\)/.test(act[0]) && /revalidateTag\(LEARN_CACHE_TAG\)/.test(act[0]), 'action: guard + revalidate');
  assert(/setTaxonomyLessonAtTopicAction\(node\.id, !node\.lessonAtTopic\)/.test(read('app/(site)/admin/master-tree/taxonomy-manager.tsx')), 'admin UI toggle');
  // no other writer of the key
  const writers = ['app', 'components', 'lib', 'services'].flatMap((d) => walk(path.join(ROOT, d))).filter((f) =>
    /lesson_at_topic/.test(
      fs.readFileSync(f, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1')
        .replace(/this\.audit\(ctx, 'TAXONOMY_NODE_LESSON_AT_TOPIC'.*$/gm, ''), // the audit payload names the key
    ));
  assert(writers.every((f) => /lib[\\/]learn[\\/]topic-canon\.ts$/.test(f)), `the key is only spelled in lib/learn/topic-canon.ts (+ the audit payload): ${writers.map((f) => path.relative(ROOT, f)).join(', ')}`);
});

test('S-8 seed script: same key + audit row as the action, --dry-run, DEPLOY-BEFORE-ACTIVATE, SAFE-NET first (+ negative control)', () => {
  const s = read('scripts/content/seo-topic-canon-1-seed.cjs');
  const check = (src) => {
    assert(/^#!.*\n\/\*\*[\s\S]*?\*\/\nrequire\('\.\.\/db\/safe-net\.cjs'\);/.test(src), 'safe-net first');
    assert(/'TAXONOMY_NODE_LESSON_AT_TOPIC', 'canonical_taxonomy_node'/.test(src) && /'\{"lesson_at_topic": true\}'::jsonb/.test(src), 'same audit type / target / key as the action');
    assert(/DRY \? 'ROLLBACK' : 'COMMIT'/.test(src) && /if \(!DRY\) \{[\s\S]*productionRunsTheCode\(\)[\s\S]*REFUSED \(DEPLOY-BEFORE-ACTIVATE\)/.test(src) && /lib\/learn\/topic-canon\.ts/.test(src), 'dry-run + deploy check');
    assert((src.match(/'english-comprehension\.[a-z-]+'/g) || []).length === 9, 'the 9 reported topics');
  };
  check(s);
  let caught = false;
  try {
    check(s.replace("'TAXONOMY_NODE_LESSON_AT_TOPIC', 'canonical_taxonomy_node'", "'TAXONOMY_NODE_OTHER', 'canonical_taxonomy_node'"));
  } catch {
    caught = true;
  }
  assert(caught, 'a planted different audit type must fail');
});

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

console.log(`\nSEO-TOPIC-CANON-1: ${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
