#!/usr/bin/env node
/**
 * CA6-SEO (live; through scripts/live/with-server.cjs only) — the lesson SEO surfaces of a local production build against
 * the DB's PUBLISHED set (read-only: BEGIN READ ONLY via safeBegin; nothing is written).
 *   S-01 master page /learn/<path>: 200, self-canonical, indexable, OG + Twitter tags, JSON-LD parses (BreadcrumbList +
 *        LearningResource with url / inLanguage / isAccessibleForFree), the lesson body is on the page
 *   S-02 /hi/learn/<path> without a published Hindi version: noindex + canonical → the English page (never indexed twice)
 *   S-03 exam-topic page: 200, self-canonical, JSON-LD parses, links the master lesson, and NONE of the lesson's body
 *        sentences (paragraphs, list items, solved-example questions / steps) appear on it — no duplicated full text
 *   S-04 /articles/<node-lesson slug> → permanent redirect to its /learn page
 *   S-05 sitemap: every /learn, /hi/learn and exam-topic URL belongs to a PUBLISHED lesson (and its exam's published
 *        syllabus); every published lesson is listed; no /articles URL for a node lesson; hreflang only with Hindi
 *   S-06 the exam course page carries Course JSON-LD whose parts link /learn pages
 *   S-07 the legacy /learn/topics/<id> entry still answers (not taken over by the master route); unknown / malformed
 *        /learn paths are 404; a node whose lesson is NOT published is never served as a lesson
 * Run: node scripts/live/with-server.cjs -- "node scripts/live/test_ca6_seo.cjs --base=http://localhost:3100"
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
// GATE-SCOPE-SWEEP (2026-10-29): the sitemap is prerendered at BUILD time (app/sitemap.ts, revalidate 3600); a lesson the
// owner publishes / unpublishes after the build legitimately differs — only documents unchanged since the build are compared
const BUILD_AT = fs.statSync(path.join(ROOT, '.next', 'BUILD_ID')).mtime;
const { Client } = require('pg');
const { dbTarget, redactor } = require(path.join(ROOT, 'scripts/db/_db-env.cjs'));
const { safeBegin } = require(path.join(ROOT, 'scripts/db/live-safety.cjs'));

const BASE = (process.argv.find((a) => a.startsWith('--base=')) || '--base=' + (process.env.BASE_URL || 'http://localhost:3100')).slice(7).replace(/\/$/, '');
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(BASE)) throw new Error('--base must be the local server');

let passed = 0;
let failed = 0;
const check = (name, ok, info) => { if (ok) passed++; else failed++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ` — ${String(info ?? '').slice(0, 600)}`}`); };
const get = async (p, opts = {}) => {
  for (let i = 1; i <= 3; i++) {
    try { return await fetch(BASE + p, { redirect: 'manual', ...opts }); } catch (e) { if (i === 3) throw e; }
  }
};
const attr = (html, re) => (html.match(re) || [])[1] || null;
const canonicalOf = (html) => attr(html, /<link rel="canonical" href="([^"]+)"/);
const robotsOf = (html) => attr(html, /<meta name="robots" content="([^"]+)"/);
const jsonLd = (html) => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
const graphTypes = (docs) => docs.flatMap((d) => (d['@graph'] || [d]).map((x) => x['@type']));
const texts = (blocks) => blocks.flatMap((b) => {
  if (b.type === 'paragraph') return [b.text];
  if (b.type === 'list') return b.items;
  if (b.type === 'solved_example') return [b.question, ...b.steps.map((s) => s.text)];
  if (b.type === 'trap') return [b.text, b.why];
  return [];
}).map((t) => t.replace(/\*\*|\*|`|\$/g, '').trim()).filter((t) => t.length >= 25).map((t) => t.replace(/\s+/g, ''));
const decode = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/<!-- -->/g, '').replace(/\s+/g, '');

(async () => {
  const target = dbTarget();
  const red = redactor(target);
  const c = new Client(target.pg);
  c.on('error', () => {});
  await c.connect();
  let site = null;
  try {
    await safeBegin(c, { readOnly: true });
    const q = async (s, p) => (await c.query(s, p)).rows;
    // CA-7: QA test content is served but never indexed; an exam course page exists only while the course is LIVE
    const lessons = await q(`select s.document_id, s.canonical_slug, s.node_id, s.hi_current, n.hierarchy_path, d.is_test_content test, d.updated_at > $1 changed
        from public.fn_servable_node_lessons() s join public.canonical_taxonomy_nodes n on n.id = s.node_id
        join public.learning_documents d on d.id = s.document_id where n.is_active order by n.hierarchy_path`, [BUILD_AT]);
    const live = new Set((await q(`select exam_id from public.exam_course_launches where status = 'LIVE'`)).map((r) => r.exam_id));
    const drafts = await q(`select n.hierarchy_path, d.updated_at > $1 changed from public.learning_documents d join public.canonical_taxonomy_nodes n on n.id = d.node_id
        where d.document_type = 'NODE_LESSON' and d.status <> 'PUBLISHED' and n.is_active`, [BUILD_AT]);
    const exams = await q(`select id, slug from public.exams where is_active order by slug`);
    const courses = [];
    for (const e of exams) {
      const [o] = await q(`select public.fn_exam_course_outline($1) r`, [e.id]);
      courses.push({ slug: e.slug, live: live.has(e.id), nodeIds: (o.r.chapters || []).flatMap((ch) => ch.lessons.map((l) => l.node_id)) });
    }
    // GATE-SCOPE-SWEEP: the page checks run on THE QA test lesson (scripts/content/ca6-qa-lesson.cjs), never on whichever
    // real lesson sorts first (the owner publishes lessons; their bodies are not this gate's fixture)
    // the QA node lesson lives on the topic of the legacy QA document qa-number-system-concept-lesson (ca6-qa-lesson.cjs)
    const [qaTopic] = await q(`select u.topic_id from public.learning_documents d join public.learning_units u on u.id = d.learning_unit_id where d.canonical_slug = 'qa-number-system-concept-lesson'`);
    const L = qaTopic ? lessons.find((l) => l.node_id === qaTopic.topic_id && l.test) : null;
    if (!L) throw new Error('the QA test node lesson (on the topic of qa-number-system-concept-lesson) is not servable — run scripts/content/ca6-qa-lesson.cjs');
    const [ver] = await q(`select blocks from public.document_versions where document_id = $1 and language = 'en' and is_current and is_published`, [L.document_id]);
    await c.query('ROLLBACK');
    const p = L.hierarchy_path.split('.').join('/');
    const course = courses.find((x) => x.nodeIds.includes(L.node_id));

    // S-01 master page
    const m = await get(`/learn/${p}`);
    const mh = m.status === 200 ? await m.text() : '';
    site = (canonicalOf(mh) || '').replace(/\/learn\/.*$/, '');
    const ld = mh ? jsonLd(mh) : [];
    const lr = ld.flatMap((d) => d['@graph'] || [d]).find((x) => x['@type'] === 'LearningResource');
    const body = texts(ver.blocks);
    const plain = decode(mh);
    // CA-7: a QA test lesson renders the same but is noindex and carries no LearningResource
    check(`S-01 /learn/${p}: 200, self-canonical, ${L.test ? 'TEST CONTENT → noindex, no LearningResource' : 'indexable, LearningResource'}, OG / Twitter, BreadcrumbList, the lesson body on the page`,
      m.status === 200 && canonicalOf(mh) === `${site}/learn/${p}` && /<meta property="og:title"/.test(mh) && /<meta property="og:url" content="[^"]*\/learn\//.test(mh)
      && /<meta name="twitter:card"/.test(mh) && graphTypes(ld).includes('BreadcrumbList')
      && (L.test ? /noindex/.test(robotsOf(mh) || '') && !lr : !/noindex/.test(robotsOf(mh) || '') && lr && lr.url === `${site}/learn/${p}` && lr.inLanguage === 'en' && typeof lr.isAccessibleForFree === 'boolean')
      && body.slice(0, 5).every((t) => plain.includes(t)),
      JSON.stringify({ status: m.status, canonical: canonicalOf(mh), robots: robotsOf(mh), types: graphTypes(ld), lr: lr && { url: lr.url, free: lr.isAccessibleForFree }, missing: body.slice(0, 5).filter((t) => !plain.includes(t)).slice(0, 2) }));

    // S-02 Hindi URL without a Hindi version
    const h = await get(`/hi/learn/${p}`);
    const hh = h.status === 200 ? await h.text() : '';
    check(`S-02 /hi/learn/${p}: ${L.hi_current ? 'self-canonical Hindi page' : 'noindex + canonical → the English page'}`,
      h.status === 200 && (L.hi_current ? canonicalOf(hh) === `${site}/hi/learn/${p}` && /hreflang="hi"/.test(hh) : /noindex/.test(robotsOf(hh) || '') && canonicalOf(hh) === `${site}/learn/${p}`),
      JSON.stringify({ status: h.status, canonical: canonicalOf(hh), robots: robotsOf(hh) }));

    // S-03 exam-topic page
    if (course) {
      const e = await get(`/exams/${course.slug}/${p}`);
      const eh = e.status === 200 ? await e.text() : '';
      const ep = decode(eh);
      const dup = body.filter((t) => ep.includes(t));
      const eld = eh ? jsonLd(eh) : [];
      check(`S-03 /exams/${course.slug}/${p}: 200, self-canonical, JSON-LD, links the master lesson, NO lesson body sentence (${body.length} checked)`,
        e.status === 200 && canonicalOf(eh) === `${site}/exams/${course.slug}/${p}` && graphTypes(eld).includes('BreadcrumbList') && eh.includes(`href="/learn/${p}"`) && dup.length === 0,
        JSON.stringify({ status: e.status, canonical: canonicalOf(eh), types: graphTypes(eld), dup: dup.slice(0, 3) }));
    } else check('S-03 exam-topic page — VACUOUS WARN: no exam course lists the lesson', true);

    // S-04 /articles redirect
    const a = await get(`/articles/${L.canonical_slug}`);
    check(`S-04 /articles/${L.canonical_slug} → permanent redirect to /learn/${p}`, [301, 308].includes(a.status) && (a.headers.get('location') || '').endsWith(`/learn/${p}`), `${a.status} ${a.headers.get('location')}`);

    // S-05 sitemap = published only
    const sm = await get('/sitemap.xml');
    const xml = sm.status === 200 ? await sm.text() : '';
    const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((x) => new URL(x[1]).pathname);
    const changed = new Set([...lessons, ...drafts].filter((l) => l.changed).map((l) => l.hierarchy_path.split('.').join('/')));
    const pub = new Set(lessons.filter((l) => !l.test).map((l) => l.hierarchy_path.split('.').join('/')));
    const pubHi = new Set(lessons.filter((l) => l.hi_current && !l.test).map((l) => l.hierarchy_path.split('.').join('/')));
    const testPaths = new Set(lessons.filter((l) => l.test).map((l) => l.hierarchy_path.split('.').join('/')));
    const bad = [];
    for (const u of urls) {
      let mm;
      if ((mm = u.match(/^\/(?:hi\/)?learn\/(.+)$/)) && changed.has(mm[1])) continue; // changed after the build
      if ((mm = u.match(/^\/learn\/(.+)$/)) && !mm[1].startsWith('topics/') && !pub.has(mm[1])) bad.push(testPaths.has(mm[1]) ? `test content listed ${u}` : `unpublished ${u}`);
      if ((mm = u.match(/^\/exams\/([a-z0-9-]+)\/course$/)) && !courses.some((x) => x.slug === mm[1] && x.live)) bad.push(`course listed before launch ${u}`);
      if ((mm = u.match(/^\/hi\/learn\/(.+)$/)) && !pubHi.has(mm[1])) bad.push(`hindi not published ${u}`);
      if ((mm = u.match(/^\/exams\/([a-z0-9-]+)\/(.+\/.+)$/)) && !mm[2].startsWith('cycle/')) {
        const c2 = courses.find((x) => x.slug === mm[1]);
        const node = lessons.find((l) => !l.test && l.hierarchy_path.split('.').join('/') === mm[2]);
        if (!c2 || !node || !c2.nodeIds.includes(node.node_id)) bad.push(`exam-topic not in a published course ${u}`);
      }
      if ((mm = u.match(/^\/articles\/(.+)$/)) && lessons.some((l) => l.canonical_slug === mm[1])) bad.push(`node lesson under /articles ${u}`);
    }
    for (const x of drafts) if (!x.changed && urls.includes(`/learn/${x.hierarchy_path.split('.').join('/')}`) && !pub.has(x.hierarchy_path.split('.').join('/'))) bad.push(`draft listed ${x.hierarchy_path}`);
    const missing = [...pub].filter((x) => !changed.has(x) && !urls.includes(`/learn/${x}`));
    const hreflangOk = pubHi.size > 0 ? /hreflang="hi"/.test(xml) : !/hreflang="hi"/.test(xml);
    check(`S-05 sitemap: ${urls.length} URLs — every lesson URL is published and not test content (${pub.size} indexable lesson(s), ${testPaths.size} test, ${pubHi.size} in Hindi), each indexable lesson listed, no course before launch, no node lesson under /articles, hreflang only with Hindi`,
      sm.status === 200 && bad.length === 0 && missing.length === 0 && hreflangOk, JSON.stringify({ status: sm.status, bad: bad.slice(0, 5), missing, hreflangOk }));

    // S-06 course JSON-LD
    if (course) {
      const cr = await get(`/exams/${course.slug}/course`);
      const ch = cr.status === 200 ? await cr.text() : '';
      const co = jsonLd(ch).flatMap((d) => d['@graph'] || [d]).find((x) => x['@type'] === 'Course');
      check(course.live ? `S-06 /exams/${course.slug}/course (LIVE): Course JSON-LD (name, provider, parts link /learn pages)` : `S-06 /exams/${course.slug}/course: not launched → 404 (CA-7: the course exists only while LIVE)`,
        course.live ? cr.status === 200 && co && co.name && co.provider && Array.isArray(co.hasPart) && co.hasPart.some((x) => x.url === `${site}/learn/${p}`) : cr.status === 404,
        JSON.stringify({ status: cr.status, live: course.live, course: co && { name: co.name, parts: (co.hasPart || []).length } }));
    }

    // S-07 the legacy entry, 404s, drafts never served as lessons
    const legacy = await get(`/learn/topics/00000000-0000-0000-0000-000000000000`);
    const unknown = await get(`/learn/no-such-subject/no-such-topic`);
    const malformed = await get(`/learn/Bad%20Path/x`);
    const one = await get(`/learn/only-one-segment`);
    const draftServed = [];
    for (const d of drafts) {
      const r = await get(`/learn/${d.hierarchy_path.split('.').join('/')}`);
      const t = r.status === 200 ? await r.text() : '';
      if (r.status === 200 && !/being written/.test(t)) draftServed.push(d.hierarchy_path);
    }
    check(`S-07 /learn/topics/<id> stays the legacy entry (404 for an unknown id, not the master route); unknown / malformed / one-segment /learn paths 404; ${drafts.length} unpublished node lesson(s) never served`,
      legacy.status === 404 && unknown.status === 404 && malformed.status === 404 && one.status === 404 && draftServed.length === 0,
      JSON.stringify({ legacy: legacy.status, unknown: unknown.status, malformed: malformed.status, one: one.status, draftServed }));
  } catch (e) {
    failed++;
    console.log(`  FAIL  CA6-SEO aborted — ${red(String(e.message)).slice(0, 300)}`);
    await c.query('ROLLBACK').catch(() => {});
  } finally {
    await c.end().catch(() => {});
  }
  console.log(`\nCA6-SEO: ${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
})();
