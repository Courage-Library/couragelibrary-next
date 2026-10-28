#!/usr/bin/env node
/**
 * CA-7 — offline gate (no network, no DB; source + the pure helpers).
 *   SH-01 SEO-HYGIENE-1: one canonical base for everything search engines read (never the deployment URL); only the
 *         production host is indexable (X-Robots-Tag noindex for every other host — the same regex Next applies —,
 *         robots Disallow); QA test content: noindex, no JSON-LD, not in the sitemap (fail closed); LESSON-PERF reads its
 *         QA route from the DB
 *   LA-01 per-exam launch: gating only inside a LIVE course; the course page / link / sitemap entry only while LIVE; the
 *         launch is admin-only through the audited RPC with a server-computed snapshot
 *   CV-01 coverage matrix: INTERNAL nodes (and their subtree) never count; % EN / HI; "build next" by weightage
 *   NS-01 dashboard next step + STUDENT-DASH-1: continue (live course first) / first steps from real state / nothing
 *   EN-01 exam notes: the paste contract (lesson validator, size cap, tolerant extraction); rendered on the exam-topic
 *         page (never the lesson body); admin screen follows the GEN-CHECK-1 check and #85
 *   IN-01 INTERNAL nodes: out of the generator, /learn + exam-topic pages, servable lessons (SQL), notes; the audited
 *         toggle; the master tree shows the subject-type chip ("Type not set") and a lesson-status dot with a label
 *   MG-01 migration 122: no BEGIN / COMMIT; new functions INVOKER (the one SECDEF stays fn_lesson_progress_save, auth.uid());
 *         client writes revoked; rollback restores the exact 120 bodies; cleanup-student removes the new per-user rows
 * Run: node scripts/test_ca7.cjs
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
const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const MIG = read('supabase/migrations/20261028000122_ca7_launch_notes_internal.sql');

test('SH-01 SEO-HYGIENE-1: canonical base fixed; non-production hosts noindex + Disallow (Next\'s own host matching); test content never indexed (fail closed); LESSON-PERF route from the DB', () => {
  const site = require(path.join(ROOT, 'config/site.ts'));
  assert(site.CANONICAL_SITE_URL === 'https://couragelibrary.in' && site.siteConfig.url === site.CANONICAL_SITE_URL && !/NEXT_PUBLIC_SITE_URL/.test(read('config/site.ts').split('export const siteConfig')[1]), 'siteConfig.url = the canonical base, never the deployment URL');
  // the matcher Next applies to a `missing` host item: new RegExp("^" + value + "$") on the lowercased, port-less host
  const nextHost = (h) => new RegExp('^' + site.CANONICAL_HOST_PATTERN + '$').test(String(h).split(':', 1)[0].toLowerCase());
  const cases = { 'couragelibrary.in': true, 'www.couragelibrary.in': true, 'COURAGELIBRARY.IN:443': true, 'couragelibrary-next.vercel.app': false, 'preview-abc.vercel.app': false, localhost: false, 'couragelibraryxin': false, 'evil.couragelibrary.in': false, 'couragelibrary.in.evil.test': false };
  for (const [h, want] of Object.entries(cases)) assert(nextHost(h) === want && site.isCanonicalHost(h) === want, `host ${h}: next=${nextHost(h)} app=${site.isCanonicalHost(h)} want ${want}`);
  const nc = read('next.config.ts');
  assert(/missing: \[\{ type: "host", value: CANONICAL_HOST_PATTERN \}\],\s*headers: \[\{ key: "X-Robots-Tag", value: "noindex, nofollow" \}\]/.test(nc) && /source: "\/\(\.\*\)"/.test(nc), 'X-Robots-Tag for every non-canonical host');
  const robots = read('app/robots.ts');
  assert(/if \(!isCanonicalHost\(h\.get\("x-forwarded-host"\) \?\? h\.get\("host"\)\)\) \{\s*return \{ rules: \[\{ userAgent: "\*", disallow: "\/" \}\] \};/.test(robots) && /sitemap: `\$\{CANONICAL_SITE_URL\}\/sitemap\.xml`/.test(robots), 'robots: Disallow off-production; sitemap on the canonical base');
  for (const f of ['lib/seo/metadata.ts', 'lib/seo/jsonld.ts', 'lib/learn/seo.ts', 'app/sitemap.ts', 'app/robots.ts']) assert(!/NEXT_PUBLIC_SITE_URL|getAppEnv\(\)\.siteUrl|VERCEL_URL/.test(read(f)), `${f}: no deployment URL`);
  const sm = read('app/sitemap.ts');
  assert(/const indexable = new Set\(flagsError \? \[\] : \(flags \|\| \[\]\)\.filter\(\(f\) => f\.is_test_content === false\)/.test(sm), 'sitemap: only lessons whose flag reads false (an unreadable flag = test content)');
  const mlp = read('components/learning/master-lesson-page.tsx');
  assert(/noIndex: alt\.noIndex \|\| Boolean\(data\.lesson\?\.isTestContent\)/.test(mlp) && /\.\.\.\(version && !data\.lesson\?\.isTestContent/.test(mlp), 'lesson page: noindex + no LearningResource for test content');
  assert(/isTestContent: doc\?\.is_test_content !== false/.test(read('services/learning/master-lesson.service.ts')), 'an unknown flag counts as test content');
  const b2 = read('scripts/test_brand2.cjs');
  assert(/route = await qaLessonRouteFromDb\(\)/.test(b2) && /order by d\.is_test_content desc/.test(b2) && /safeBegin\(c, \{ readOnly: true \}\)/.test(b2), 'LESSON-PERF: the QA route from the DB, read-only');
  return `${Object.keys(cases).length} hosts`;
});

test('LA-01 per-exam launch: gating only inside a LIVE course (stand-in gone); course page / exam-page link / sitemap course URL only while LIVE; admin-only audited launch with a server snapshot', () => {
  assert(!/LESSON_GATING_ENABLED/.test(read('lib/learning/chapter-access.ts').replace(/\(CA-7 replaced[^)]*\)/, '')) && !/LESSON_GATING_ENABLED|gatingEnabled/.test(read('lib/learning/lesson-access-settings.ts')), 'the CA-5 stand-in is gone');
  const cs = read('services/learning/course.service.ts');
  assert(/from\("exam_course_launches"\)\.select\("status"\)\.eq\("exam_id", exam\.id\)\.eq\("status", "LIVE"\)\.limit\(1\);\s*if \(launchError \|\| !launch\?\.length\) return null;/.test(cs), 'course page only while LIVE (a failed read → no course)');
  assert(/&& \(await isCourseLive\(exam\.id\)\) \? `\/exams\/\$\{exam\.slug\}\/course`/.test(read('app/exams/[slug]/page.tsx')), 'the exam page links the course only while LIVE');
  const M = require(path.join(ROOT, 'lib/learn/sitemap.ts'));
  const urls = M.learnSitemapEntries('https://x.test', [{ nodeId: U(1), hiCurrent: false, publishedAt: null }], { [U(1)]: 'q.p' }, [{ slug: 'a', nodeIds: [U(1)], live: true }, { slug: 'b', nodeIds: [U(1)], live: false }]).map((e) => new URL(e.url).pathname);
  assert(JSON.stringify(urls) === JSON.stringify(['/learn/q/p', '/exams/a/course', '/exams/a/q/p', '/exams/b/q/p']), JSON.stringify(urls));
  const act = read('app/admin/lessons/actions.ts');
  assert(/export async function setCourseLaunchAction[\s\S]{0,260}guardAdminAction\(\) \/\* CA-7: admin only \*\//.test(act), 'launch action: admin guard first');
  const svc = read('services/learning/coverage.service.ts');
  assert(/const c = await ctx\(true\);\s*if \(!c\) return fail\("UNAUTHORIZED", "Only an admin can launch or pause a course\."\);/.test(svc) && /p_coverage: \{ \.\.\.coverageSnapshot\(view\.data\.coverage\), cycle_year: view\.data\.cycleYear \}/.test(svc), 'the snapshot is recomputed on the server at the click');
  const ui = read('components/admin/lessons/coverage-matrix.tsx');
  assert(/role="alertdialog"/.test(ui) && /Confirm launch/.test(ui) && /Confirm pause/.test(ui) && !/window\.confirm|alert\(/.test(ui), 'launch / pause behind an in-page confirmation');
  return 'ok';
});

test('CV-01 coverage matrix: INTERNAL nodes and their subtree never count; % EN / HI; build next by weightage then master order', () => {
  const C = require(path.join(ROOT, 'lib/learning/coverage.ts'));
  const n = (id, path, w, extra = {}) => ({ id: U(id), name: `N${id}`, path, nodeType: 'TOPIC', isInternal: false, underInternal: false, weightageTier: w, ...extra });
  const nodes = [n(1, 'a.b', 'CORE'), n(2, 'a.c', 'HIGH_YIELD'), n(3, 'a.d', null), n(4, 'a.general', 'CORE', { isInternal: true }), n(5, 'a.general.x', 'CORE', { underInternal: true }), n(1, 'a.b', 'CORE')];
  const cov = C.computeCoverage(nodes, [{ nodeId: U(1), documentId: U(11), hiCurrent: true }, { nodeId: U(4), documentId: U(14), hiCurrent: false }]);
  assert(cov.total === 3 && cov.en === 1 && cov.hi === 1 && cov.enPercent === 33.3 && cov.excludedInternal === 2, JSON.stringify(cov));
  assert(cov.missing.map((r) => r.name).join() === 'N2,N3', 'build next: HIGH_YIELD first, then master order');
  assert(JSON.stringify(C.coverageSnapshot(cov)) === JSON.stringify({ total: 3, en: 1, hi: 1, en_percent: 33.3, hi_percent: 33.3, excluded_internal: 2 }), 'snapshot = counts only');
  assert(C.computeCoverage([], []).enPercent === 0, 'empty → 0 %');
  return '3 counted, 2 internal excluded';
});

test('NS-01 dashboard next step + STUDENT-DASH-1: continue (live course first), else first steps for a new student from real state, else nothing; one primary', () => {
  const N = require(path.join(ROOT, 'lib/learning/next-step.ts'));
  const p = (id, at, live, status = 'READING') => ({ documentId: U(id), title: `L${id}`, href: `/learn/x/${id}`, status, updatedAt: at, inLiveCourse: live });
  const base = { progress: [], pickedExam: false, submittedMock: false, mistakes: 0 };
  const c1 = N.decideNextStep({ ...base, progress: [p(1, '2026-10-28T10:00:00Z', false), p(2, '2026-10-27T10:00:00Z', true), p(3, '2026-10-28T11:00:00Z', false, 'COMPLETED')] });
  assert(c1.kind === 'continue' && c1.title === 'L2' && c1.inLiveCourse, 'the live-course lesson wins');
  assert(N.decideNextStep({ ...base, progress: [p(1, '2026-10-26T10:00:00Z', false), p(4, '2026-10-28T10:00:00Z', false)] }).title === 'L4', 'else the newest READING');
  const g = N.decideNextStep(base);
  assert(g.kind === 'guide' && g.steps.map((s) => s.done).join() === 'false,false,false' && g.primary.key === 'exam', 'a new student: pick an exam first');
  const g2 = N.decideNextStep({ ...base, pickedExam: true });
  assert(g2.primary.key === 'mock' && g2.primary.href === '/mock-tests', 'then the first free mock');
  assert(N.decideNextStep({ ...base, submittedMock: true }) === null, 'after a mock and nothing to continue: no card');
  const card = read('components/learning/next-step-card.tsx');
  assert((card.match(/buttonClasses\(\{ variant: "primary"/g) || []).length === 2 && /sr-only">\{s\.done \? " \(done\)" : " \(to do\)"\}/.test(card), 'one primary per state; done / to do announced');
  const dash = read('app/dashboard/page.tsx');
  assert((dash.match(/variant="primary"|bg-brand\b/g) || []).length === 0 && /<NextStepCard step=\{nextStep\} \/>/.test(dash), 'the dashboard has no other primary');
  const svc = read('services/learning/next-step.service.ts');
  assert(/if \(progressRes\.error \|\| attemptsRes\.error\) return null;/.test(svc) && /catch \{\s*return null;/.test(svc), 'a failed read → no card, never a guessed state');
  return 'continue / guide / none';
});

test('EN-01 exam notes: paste contract (lesson validator, ≤ 40 blocks, tolerant extraction); exam-topic page renders the note, never the lesson; admin screen = GEN-CHECK-1 check + #85', () => {
  const E = require(path.join(ROOT, 'lib/lessons/exam-note.ts'));
  const ex = E.examNoteExample('SSC CGL', 'Number System');
  assert(E.parseExamNotePaste(JSON.stringify(ex)).ok, 'the example is valid');
  const fenced = E.parseExamNotePaste('Here:\n```json\n' + JSON.stringify(ex) + '\n```');
  assert(fenced.ok && /removed/.test(fenced.notice), 'fences removed with a notice');
  assert(!E.parseExamNotePaste(JSON.stringify({ ...ex, contract: 'LESSON_BLOCKS v2' })).ok && !E.parseExamNotePaste(JSON.stringify({ ...ex, extra: 1 })).ok, 'contract + strict keys');
  const big = { ...ex, blocks: Array.from({ length: 41 }, (_, i) => ({ id: `p-${i}`, type: 'paragraph', text: 'x' })) };
  assert(/at most 40 blocks/.test(E.parseExamNotePaste(JSON.stringify(big)).errors[0].message), 'size cap');
  const bad = E.parseExamNotePaste(JSON.stringify({ ...ex, blocks: [{ id: 'a', type: 'nope' }] }));
  assert(!bad.ok && /^block 1 \(id "a"\)/.test(bad.errors[0].path), 'errors by block number + id');
  const page = read('app/exams/[slug]/[moduleSlug]/[...rest]/page.tsx');
  assert(/getPublishedExamNote\(d\.exam\.id, d\.node\.id, "en"\)/.test(page) && /<ExamNoteBlocks blocks=\{note\.blocks\} \/>/.test(page) && !/LessonBlocksRenderer/.test(page) && /\|\| hasNote;/.test(page), 'exam-topic page: the note (indexable), never the lesson body');
  assert(/const v = validateLesson\(row\.meta, row\.blocks\);\s*return v\.ok \?/.test(read('services/learning/exam-note.service.ts')), 'a stored note is re-validated before rendering');
  const ui = read('components/admin/lessons/exam-notes-editor.tsx');
  assert((ui.match(/usePasteCheck\(onException\)/g) || []).length === 2 && /<CheckButton busy=\{en\.busy\}/.test(ui) && /<CheckButton busy=\{hi\.busy\}/.test(ui) && /<CheckRegion regionRef=\{en\.regionRef\}>/.test(ui) && /<CheckRegion regionRef=\{hi\.regionRef\}>/.test(ui),
    'the shared check on both paste fields');
  assert(!/[ऀ-ॿ]/.test(ui) && /id="note-paste-hi"\s+lang="hi"\s+data-content-field="exam-note-json"/.test(ui) && !/<option[^>]*value="hi"/.test(ui) && /\{enPublished \? \(/.test(ui),
    '#85: no language switch; the HI paste is a separate marked content field, open once EN is published');
  const ids = [...ui.matchAll(/<(?:select|input|textarea)\s+id="([^"]+)"/g)].map((m) => m[1]);
  for (const id of ids) assert(ui.includes(`htmlFor="${id}"`), `label for #${id}`);
  return 'contract + screens';
});

test('IN-01 INTERNAL nodes: out of the generator, /learn + exam-topic pages, servable lessons (SQL), notes (SQL); audited admin toggle; master tree chip + lesson dot', () => {
  const gen = read('services/lessons/lesson-authoring.service.ts');
  assert(/select\("id, parent_id, node_type, name, subject_type, root_subject_id, display_order, is_internal"\)/.test(gen) && /if \(cur\.is_internal\) return true;/.test(gen) && /\.filter\(\(n\) => !internal\(n\.id\)\)/.test(gen), 'generator tree drops internal subtrees');
  const ml = read('services/learning/master-lesson.service.ts');
  assert(/\|\| node\.is_internal\) return null;/.test(ml) && /if \(ancestors\.some\(\(a\) => a\.is_internal\)\) return null;/.test(ml) && /\.eq\("is_internal", false\)\.order\("display_order"\)/.test(ml), '/learn + exam-topic: no page for an internal node (or under one); children skip internal');
  assert((MIG.match(/AND NOT n\.is_internal/g) || []).length === 1 && (MIG.match(/AND NOT c\.is_internal/g) || []).length === 1, 'fn_servable_node_lessons: internal subtree excluded');
  assert(/node_type IN \('TOPIC', 'SUBTOPIC', 'CONCEPT'\)\) THEN\s*RAISE EXCEPTION 'EXAM_NOTE: a note belongs to an active topic, subtopic or concept \(not an internal node\)'/.test(MIG) && /AND NOT is_internal AND node_type IN/.test(MIG), 'notes refuse internal nodes');
  const tsvc = read('services/taxonomy/taxonomy.service.ts');
  assert(/static async setInternal[\s\S]{0,300}const ctx = await this\.requireAdmin\(\);/.test(tsvc) && /'TAXONOMY_NODE_INTERNAL'/.test(tsvc) && /A subject cannot be internal/.test(tsvc), 'admin-only, audited, never a subject');
  assert(/export async function setTaxonomyNodeInternalAction[\s\S]{0,200}guardAdminAction\(\) \/\* CA-7: admin only \*\//.test(read('app/admin/taxonomy/actions.ts')), 'action guarded first');
  const tm = read('app/admin/taxonomy/taxonomy-manager.tsx');
  assert(/Confirm: mark internal/.test(tm) && /setInternalConfirm\(true\)/.test(tm), 'two-step toggle');
  assert(/node\.nodeType === "SUBJECT" &&[\s\S]{0,400}SUBJECT_TYPE_LABELS\[node\.subjectType\][\s\S]{0,300}Type not set/.test(tm) && /border-warning-200 bg-warning-50[^"]*text-warning-800">Type not set/.test(tm), 'subject-type chip / "Type not set" in warning orange');
  assert(/function LessonDot[\s\S]{0,400}"Lesson published" : status === "DRAFT" \? "Lesson draft" : "No lesson"/.test(tm) && /<LessonDot status=\{lessonStatus\[node\.id\] \?\? null\} \/>/.test(tm), 'lesson dot with a text label (never colour alone)');
  assert(/onClick=\{\(\) => setSelectedId\(node\.id\)\}/.test(tm) && /<select id="node-subject-type"/.test(tm), 'clicking the row name opens the drawer where the type is set');
  return 'ok';
});

test('MG-01 migration 122: no BEGIN / COMMIT; new functions INVOKER (fn_lesson_progress_save stays the one SECDEF); client writes revoked; rollback restores the exact 120 bodies; cleanup-student removes the new per-user rows', () => {
  assert(!/^\s*(BEGIN|COMMIT)\s*;/m.test(MIG), 'no BEGIN / COMMIT');
  const fns = [...MIG.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\([\s\S]*?\$fn\$;/g)];
  const secdef = fns.filter((m) => /SECURITY DEFINER/.test(m[0])).map((m) => m[1]);
  assert(JSON.stringify(secdef) === '["fn_lesson_progress_save"]' && /v_user  uuid := auth\.uid\(\);/.test(MIG), `SECURITY DEFINER only on the existing progress RPC (auth.uid()): ${secdef}`);
  assert(fns.every((m) => /SET search_path = /.test(m[0])), 'every function pins search_path');
  for (const f of ['fn_exam_course_launch_set(uuid, uuid, text, jsonb, uuid, text)', 'fn_exam_note_save_draft(uuid, uuid, text, jsonb, jsonb, uuid, text)', 'fn_exam_note_publish(uuid, uuid, text)']) {
    assert(MIG.includes(`REVOKE ALL ON FUNCTION public.${f} FROM PUBLIC, anon, authenticated;`) && MIG.includes(`GRANT EXECUTE ON FUNCTION public.${f} TO service_role;`), `${f}: service role only`);
  }
  assert(/REVOKE ALL ON TABLE public\.exam_course_launches FROM PUBLIC, anon, authenticated;/.test(MIG) && /REVOKE ALL ON TABLE public\.exam_node_notes FROM PUBLIC, anon, authenticated;/.test(MIG)
    && /GRANT SELECT \(exam_id, exam_cycle_id, status\) ON public\.exam_course_launches TO anon, authenticated;/.test(MIG), 'tables: no client writes; public reads limited to non-admin columns');
  const m120 = read('supabase/migrations/20261028000120_ca5_courses_progress.sql');
  const rb = read('docs/database/rollback/122_rollback.sql');
  const body = (src, name) => src.slice(src.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`), src.indexOf('$fn$;', src.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`)) + 5);
  for (const f of ['fn_servable_node_lessons', 'fn_lesson_progress_save']) assert(rb.includes(body(m120, f)), `rollback restores the exact 120 ${f}`);
  assert(/^BEGIN;/m.test(rb) && /^COMMIT;/m.test(rb) && /DROP COLUMN is_internal/.test(rb), 'rollback is one transaction and drops what 122 added');
  const cl = read('scripts/e2e/cleanup-student.cjs');
  assert(/await del\('user_lesson_progress', `DELETE FROM public\.user_lesson_progress WHERE user_id = \$1`\);/.test(cl) && /await del\('learning_activity_events', `DELETE FROM public\.learning_activity_events WHERE user_id = \$1`\);/.test(cl), 'cleanup removes lesson progress + activity events (CA-5 gap that failed live-journeys)');
  return `${fns.length} function definitions`;
});

console.log(`\nCA7 offline: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
