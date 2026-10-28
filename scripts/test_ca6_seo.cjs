#!/usr/bin/env node
/**
 * CA-6 SEO — offline gate (no network, no DB; source + the pure helpers).
 *   P-01 paths: /learn/<subject>/<topic>[/<subtopic>[/<concept>]] ↔ hierarchy_path (2–4 segments, slugs only); /hi
 *        prefix; exam-topic paths; the legacy /learn/topics static route is kept beside the catch-all
 *   J-01 JSON-LD: LearningResource (free / paywalled: isAccessibleForFree false + hasPart cssSelector = the gated
 *        section the page renders), Course, script text escapes "<"
 *   H-01 canonical + hreflang matrix: EN canonical; Hindi published → own URL + en / hi / x-default; Hindi missing →
 *        /hi noindex + canonical EN; a node without a lesson is noindex
 *   M-01 sitemap entries come only from the published inputs: /learn per lesson, /hi only with Hindi, hreflang only then,
 *        exam course + exam-topic URLs only for lessons in that exam's course
 *   S-01 source: the exam-topic page never renders the lesson body (no blocks renderer; summary + outline + link);
 *        node lessons under /articles redirect permanently; publishing revalidates the "learn" tag + the sitemap; the
 *        sitemap's /articles list excludes node lessons; a locked lesson strips the body before rendering; every
 *        lesson route stays in the First Load JS budget file
 * Run: node scripts/test_ca6_seo.cjs
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
    console.log(`  FAIL  ${name}\n        ${String(e && e.message ? e.message : e).slice(0, 900)}`);
  }
}
const assert = (c, m) => {
  if (!c) throw new Error(m || 'assertion failed');
};

const P = require(path.join(ROOT, 'lib/learn/paths.ts'));
const S = require(path.join(ROOT, 'lib/learn/seo.ts'));
const M = require(path.join(ROOT, 'lib/learn/sitemap.ts'));
const SITE = require(path.join(ROOT, 'config/site.ts')).siteConfig.url;

test('P-01 paths: 2–4 slug segments ↔ hierarchy_path; /hi prefix; exam-topic paths; legacy /learn/topics kept', () => {
  assert(P.segmentsToHierarchyPath(['quantitative-aptitude', 'percentage']) === 'quantitative-aptitude.percentage', 'two');
  assert(P.segmentsToHierarchyPath(['a', 'b', 'c', 'd']) === 'a.b.c.d' && P.segmentsToHierarchyPath(['a']) === null && P.segmentsToHierarchyPath(['a', 'b', 'c', 'd', 'e']) === null, 'counts');
  assert(P.segmentsToHierarchyPath(['a', 'B C']) === null && P.segmentsToHierarchyPath(['a', 'x.y']) === null && P.segmentsToHierarchyPath(['a', '..']) === null && P.segmentsToHierarchyPath(['A', 'b']) === 'a.b', 'slugs only');
  assert(P.learnHref('a.b.c') === '/learn/a/b/c' && P.learnHref('a.b', 'hi') === '/hi/learn/a/b' && P.examTopicHref('ssc-cgl', 'a.b') === '/exams/ssc-cgl/a/b', 'hrefs');
  assert(fs.existsSync(path.join(ROOT, 'app/learn/topics/[topicId]/page.tsx')) && fs.existsSync(path.join(ROOT, 'app/learn/[...path]/page.tsx')) && fs.existsSync(path.join(ROOT, 'app/hi/learn/[...path]/page.tsx'))
    && fs.existsSync(path.join(ROOT, 'app/exams/[slug]/[moduleSlug]/[...rest]/page.tsx')), 'routes');
  return 'ok';
});

test('J-01 JSON-LD: LearningResource free / paywalled (hasPart → the gated section), Course, "<" escaped', () => {
  const free = S.learningResourceSchema({ name: 'N', description: 'd', path: '/learn/a/b', language: 'en', isFree: true, datePublished: '2026-10-28', about: ['N'] });
  const pro = S.learningResourceSchema({ name: 'N', description: null, path: '/learn/a/b', language: 'hi', isFree: false, datePublished: null, about: [] });
  assert(free['@type'] === 'LearningResource' && free.url === `${SITE}/learn/a/b` && free.isAccessibleForFree === true && !free.hasPart && free.inLanguage === 'en', 'free');
  assert(pro.isAccessibleForFree === false && pro.hasPart && pro.hasPart.isAccessibleForFree === false && pro.hasPart.cssSelector === S.PAYWALL_SELECTOR && !('description' in pro), 'paywalled');
  const page = read('components/learning/master-lesson-page.tsx');
  assert(page.includes('className={`${PAYWALL_SELECTOR.slice(1)}') && S.PAYWALL_SELECTOR.startsWith('.'), 'the page renders the gated section with the selector class');
  const course = S.courseSchema({ name: 'C', description: 'd', path: '/exams/x/course', lessons: [{ name: 'L', path: '/learn/a/b' }] });
  assert(course['@type'] === 'Course' && course.provider && course.hasPart[0].url === `${SITE}/learn/a/b`, 'course');
  assert(S.jsonLdText({ t: '</script><script>x' }) === '{"t":"\\u003c/script>\\u003cscript>x"}', 'escaping');
  return 'LearningResource · paywall · Course';
});

test('H-01 canonical + hreflang: EN canonical; Hindi → own URL + alternates; missing Hindi → /hi noindex + canonical EN; no lesson → noindex', () => {
  const A = (language, hiPublished, hasLesson = true) => S.lessonAlternates({ enPath: '/learn/a/b', hiPath: '/hi/learn/a/b', language, hiPublished, hasLesson });
  const en = A('en', false);
  assert(en.canonical === '/learn/a/b' && !en.noIndex && en.languages === null, 'en without hi');
  const enHi = A('en', true);
  const hi = A('hi', true);
  assert(enHi.languages.hi === `${SITE}/hi/learn/a/b` && enHi.languages['x-default'] === `${SITE}/learn/a/b` && hi.canonical === '/hi/learn/a/b' && !hi.noIndex, 'with hi');
  const hiMissing = A('hi', false);
  assert(hiMissing.noIndex && hiMissing.canonical === '/learn/a/b' && hiMissing.languages === null, 'hi missing');
  assert(A('en', false, false).noIndex, 'no lesson');
  return 'matrix ok';
});

test('M-01 sitemap entries only from the published inputs; /hi + hreflang only with Hindi; exam URLs only for lessons in that course', () => {
  const N1 = 'n1', N2 = 'n2', N3 = 'n3';
  const out = M.learnSitemapEntries('https://x.test', [{ nodeId: N1, hiCurrent: true, publishedAt: '2026-10-28' }, { nodeId: N2, hiCurrent: false, publishedAt: null }, { nodeId: 'no-path', hiCurrent: false, publishedAt: null }],
    { [N1]: 'q.p', [N2]: 'q.n', [N3]: 'q.draft' }, [{ slug: 'ssc-cgl', nodeIds: [N2, N3], live: true }, { slug: 'empty', nodeIds: [N3], live: true }, { slug: 'not-launched', nodeIds: [N1], live: false }]);
  const urls = out.map((e) => e.url.replace('https://x.test', ''));
  assert(JSON.stringify(urls) === JSON.stringify(['/learn/q/p', '/hi/learn/q/p', '/learn/q/n', '/exams/ssc-cgl/course', '/exams/ssc-cgl/q/n', '/exams/not-launched/q/p']), JSON.stringify(urls));
  assert(out[0].alternates.languages.hi === 'https://x.test/hi/learn/q/p' && !out[2].alternates, 'hreflang only with Hindi');
  return `${urls.length} entries; the unpublished node never listed`;
});

test('S-01 source rules: no full text on exam-topic pages, /articles redirect, publish revalidation, sitemap excludes node lessons from /articles, locked body stripped, budgets', () => {
  const et = read('app/exams/[slug]/[moduleSlug]/[...rest]/page.tsx');
  // CA-7: the page may render the exam NOTE (unique per-exam content), never the lesson's blocks
  assert(!/LessonBlocksRenderer/.test(et) && (et.match(/\.blocks\b/g) || []).length === 1 && /<ExamNoteBlocks blocks=\{note\.blocks\} \/>/.test(et) && /Read the full lesson/.test(et) && /canonicalUrl: d\.path/.test(et), 'exam-topic page: summary + outline + link only (+ the exam note), self-canonical');
  const svc = read('services/learning/exam-topic.service.ts');
  assert(/outline: t\.outline\.slice\(0, 8\)/.test(svc) && !/blocks:/.test(svc.replace(/lessonTeaser\(v\)/, '')), 'exam-topic data carries no blocks');
  const art = read('app/articles/[slug]/page.tsx');
  assert(/article\.documentType === "NODE_LESSON" && article\.canonicalHref\.startsWith\("\/learn\/"\)\) permanentRedirect\(article\.canonicalHref\)/.test(art), '/articles redirect');
  const act = read('app/admin/lessons/actions.ts');
  assert(/revalidateTag\(LEARN_CACHE_TAG\)/.test(act) && /revalidatePath\("\/sitemap\.xml"\)/.test(act) && /revalidatePath\("\/hi\/learn", "layout"\)/.test(act), 'publish revalidates the lesson data + sitemap');
  const sm = read('app/sitemap.ts');
  assert(/\.neq\("document_type", "NODE_LESSON"\)/.test(sm) && /learnSitemapEntries\(baseUrl, lessons, paths, examCourses\)/.test(sm) && /rpc\("fn_servable_node_lessons"\)/.test(sm), 'sitemap from published reads');
  const ml = read('services/learning/master-lesson.service.ts');
  assert(/body: locked \? null : version, teaser: locked \? lessonTeaser\(version\) : null/.test(ml) && /\.eq\("is_published", true\)/.test(ml) && /\.eq\("review_status", "PUBLISHED"\)/.test(ml) && /tags: \[LEARN_CACHE_TAG\]/.test(ml), 'published-only cached data; locked body stripped');
  const b = JSON.parse(read('scripts/perf/route-budgets.json')).routes;
  assert(['/learn/[...path]', '/hi/learn/[...path]', '/exams/[slug]/[moduleSlug]/[...rest]'].every((r) => b[r] && b[r].max <= 110), 'lesson routes budgeted');
  return 'ok';
});

console.log(`\nCA6-SEO offline: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
