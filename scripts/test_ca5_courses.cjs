#!/usr/bin/env node
/**
 * CA-5 EXAM COURSES + MASTER-CHAPTER ACCESS + PROGRESS — offline gate (no network, no DB; source + pure TS modules).
 *   A-01 access: gating off → every lesson FREE; on → positions 1..N FREE, the rest PRO; locked = PRO without Pro;
 *        settings parsed defensively; a failed settings read is FAIL-CLOSED (gating on, default N)
 *   V-01 course view: the outline JSON is parsed defensively (bad ids / slugs / positions dropped), lessons sorted by
 *        master position, empty chapters dropped, hrefs are /articles/<slug>
 *   D-01 migration 120: no BEGIN / COMMIT; fn_servable_node_lessons + fn_exam_course_outline INVOKER (anon may run them),
 *        fn_lesson_progress_save SECURITY DEFINER with search_path '' + auth.uid() + authenticated only; progress table RLS
 *        own rows, no client writes; the read model / validate redefined from the exact 116 bodies + node lessons only;
 *        the SECDEF allow-list raised by exactly 1 with its entry; rollback restores the 116 bodies
 *   R-01 reader + course: node-lesson access from the master position (never the document column); the course service
 *        never takes a user id; the progress action uses the session client (no service role); the article page shows
 *        progress only to a signed-in student on an unlocked lesson; ONE primary action on the course page
 * Run: node scripts/test_ca5_courses.cjs
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

const A = require(path.join(ROOT, 'lib/learning/chapter-access.ts'));
const V = require(path.join(ROOT, 'lib/learning/course-view.ts'));
const MIG = read('supabase/migrations/20261028000120_ca5_courses_progress.sql');
const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

test('A-01 access by master-chapter position (CA-7: gating by per-exam launch): a lesson in no LIVE course → FREE; in a LIVE course → first N FREE, rest PRO; locked = PRO without Pro; defensive free count; fail-closed read', () => {
  const D = U(1);
  const off = A.DEFAULT_LESSON_ACCESS;
  assert(off.freePerChapter === 2 && off.liveCourseLessons instanceof Set && off.liveCourseLessons.size === 0 && [1, 2, 3, 99].every((p) => A.lessonAccessLevel(p, off, D) === 'FREE'), 'no live course → free');
  const on = { freePerChapter: 2, liveCourseLessons: new Set([D]) };
  assert(A.lessonAccessLevel(1, on, D) === 'FREE' && A.lessonAccessLevel(2, on, D) === 'FREE' && A.lessonAccessLevel(3, on, D) === 'PRO' && A.lessonAccessLevel(0, on, D) === 'PRO' && A.lessonAccessLevel(1.5, on, D) === 'PRO', 'first N');
  assert(A.lessonAccessLevel(3, on, U(2)) === 'FREE', 'a lesson outside the live courses stays free');
  const all = { freePerChapter: 2, liveCourseLessons: 'ALL' };
  assert(A.lessonAccessLevel(3, all, U(2)) === 'PRO' && A.inLiveCourse(U(9), all), '"ALL" (unknown) gates every lesson');
  assert(A.isLessonLocked(3, on, D, false) && !A.isLessonLocked(3, on, D, true) && !A.isLessonLocked(1, on, D, false), 'locked');
  const P = A.parseFreePerChapter;
  const row = (k, v, e = true) => ({ config_key: k, config_value: { value: v }, is_enabled: e });
  assert(P([]) === 2 && P([row('LESSON_FREE_PER_CHAPTER', 3)]) === 3, 'no rows → default; rows');
  assert(P([row('LESSON_FREE_PER_CHAPTER', -1)]) === 2 && P([row('LESSON_FREE_PER_CHAPTER', 2.5)]) === 2 && P([row('LESSON_FREE_PER_CHAPTER', 3, false)]) === 2, 'malformed / disabled rows → default');
  assert(!('gating' in A.LESSON_ACCESS_KEYS), 'the CA-5 stand-in LESSON_GATING_ENABLED is gone');
  const s = read('lib/learning/lesson-access-settings.ts');
  assert(/const FAIL_CLOSED: LessonAccessSettings = \{ freePerChapter: DEFAULT_FREE_LESSONS_PER_CHAPTER, liveCourseLessons: "ALL" \}/.test(s) && (s.match(/return FAIL_CLOSED;/g) || []).length === 2
    && /db\.rpc\("fn_live_course_document_ids"\)/.test(s), 'a failed read (settings or live courses) is fail-closed');
  return 'free 1..N, Pro after — only inside a LIVE course';
});

test('V-01 course view: defensive parse, master order, no empty chapters, /articles hrefs', () => {
  const outline = {
    state: 'AVAILABLE',
    totals: { mapped_nodes: 4, covered_nodes: 9 },
    chapters: [
      { topic_id: U(1), name: 'Percentage', subject_name: 'Quant', weightage_tier: 'HIGH_YIELD', expected_questions_max: 3, lessons: [
        { document_id: U(12), node_id: U(22), slug: 'lesson-successive', name: 'Successive change', node_type: 'SUBTOPIC', position: 2, hi_available: true },
        { document_id: U(11), node_id: U(21), slug: 'lesson-percentage', name: 'Percentage', node_type: 'TOPIC', position: 1 },
        { document_id: 'not-a-uuid', slug: 'x', position: 3 },
        { document_id: U(13), slug: 'Bad Slug', position: 4 },
        { document_id: U(14), slug: 'ok-slug', position: 0 },
      ] },
      { topic_id: U(2), name: 'Empty', lessons: [{ document_id: 'x' }] },
      { topic_id: 'bad', name: 'Bad', lessons: [] },
    ],
  };
  const v = V.courseFromOutline(outline, { slug: 'ssc-cgl', title: 'SSC CGL' }, 'en', { [U(21)]: 'quantitative-aptitude.percentage' });
  assert(v.state === 'AVAILABLE' && v.chapters.length === 1 && v.totals.lessons === 2 && v.totals.chapters === 1 && v.totals.mappedNodes === 4, JSON.stringify(v.totals));
  const l = v.chapters[0].lessons;
  assert(l[0].position === 1 && l[1].position === 2 && l[0].href === '/learn/quantitative-aptitude/percentage' && l[1].href === '/articles/lesson-successive' && l[1].hiAvailable === true && l.every((x) => x.status === 'NOT_STARTED' && !x.locked), JSON.stringify(l));
  assert(V.courseFromOutline(null, { slug: 'x', title: 'X' }, 'en').state === 'NO_SYLLABUS' && V.courseFromOutline({ state: 'NO_SYLLABUS', chapters: 'x' }, { slug: 'x', title: 'X' }, 'hi').chapters.length === 0, 'malformed outline');
  return `${v.totals.lessons} lessons kept of 5`;
});

test('D-01 migration 120: INVOKER outline + node lessons, SECDEF progress via auth.uid(), RLS own rows, read model from the exact 116 bodies, allow-list +1, rollback', () => {
  assert(!/^\s*(BEGIN|COMMIT)\s*;/im.test(MIG), 'BEGIN / COMMIT in the migration');
  const head = (name) => MIG.slice(MIG.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`), MIG.indexOf('AS $', MIG.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`)));
  for (const f of ['fn_servable_node_lessons', 'fn_exam_course_outline']) assert(!/SECURITY DEFINER/.test(head(f)) && /SET search_path = ''/.test(head(f)), `${f}: INVOKER + pinned`);
  const p = head('fn_lesson_progress_save');
  assert(/SECURITY DEFINER/.test(p) && /SET search_path = ''/.test(p), 'progress RPC: DEFINER + search_path ""');
  const body = MIG.slice(MIG.indexOf('CREATE OR REPLACE FUNCTION public.fn_lesson_progress_save('), MIG.indexOf('$fn$;', MIG.indexOf('CREATE OR REPLACE FUNCTION public.fn_lesson_progress_save(')));
  assert(/v_user uuid := auth\.uid\(\);/.test(body) && /IF v_user IS NULL THEN RAISE EXCEPTION/.test(body) && !/p_user/.test(body), 'the user comes only from auth.uid()');
  assert(/CASE WHEN p\.status = 'COMPLETED' THEN 'COMPLETED' ELSE EXCLUDED\.status END/.test(body), 'COMPLETED never downgraded');
  assert(/REVOKE ALL ON FUNCTION public\.fn_lesson_progress_save\(uuid, text, text, text\) FROM PUBLIC, anon, authenticated;/.test(MIG) && /GRANT EXECUTE ON FUNCTION public\.fn_lesson_progress_save\(uuid, text, text, text\) TO authenticated;/.test(MIG), 'progress RPC grants');
  assert(/GRANT EXECUTE ON FUNCTION public\.fn_exam_course_outline\(uuid, uuid, text\) TO anon, authenticated, service_role;/.test(MIG), 'outline grants');
  assert(/ALTER TABLE public\.user_lesson_progress ENABLE ROW LEVEL SECURITY;/.test(MIG) && /REVOKE ALL ON TABLE public\.user_lesson_progress FROM PUBLIC, anon, authenticated;/.test(MIG)
    && /GRANT SELECT ON TABLE public\.user_lesson_progress TO authenticated;/.test(MIG) && /FOR SELECT TO authenticated USING \(user_id = auth\.uid\(\)\)/.test(MIG)
    && !/GRANT (INSERT|UPDATE|DELETE|ALL)[^;]*user_lesson_progress TO (anon|authenticated)/.test(MIG), 'progress table: own rows, no client writes');
  // the read model + validate = the 116 bodies + ONLY the node-lesson additions
  const m116 = read('supabase/migrations/20261027000116_ca2_syllabus_intake.sql');
  const fn = (src, name) => { const a = src.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`); return src.slice(a, src.indexOf('$function$;', a) + 11); };
  for (const n of ['fn_exam_syllabus_read_model', 'fn_syllabus__validate']) {
    const strip = (s) => s.split('\n').filter((l) => !/^\s*--/.test(l)).filter((l) => !/fn_servable_node_lessons|CA-5|UNION ALL|^\s*SELECT u\.topic_id FROM public\.learning_documents d$|^\s*WHERE x\.topic_id IN|^\s*\) x$|node lessons \(fn_servable|counted under its master|a published node lesson/.test(l)).join('\n').replace(/\s+/g, ' ');
    const a = fn(m116, n);
    const b = fn(MIG, n);
    assert(b.length > a.length && b.includes('fn_servable_node_lessons()'), `${n}: no node-lesson counting`);
    const words = (s) => s.replace(/[^A-Za-z_]+/g, ' ').trim().split(' ');
    const wa = words(strip(a));
    const wb = new Set(words(strip(b)));
    const missing = wa.filter((w) => !wb.has(w));
    assert(missing.length === 0, `${n}: 116 parts dropped: ${[...new Set(missing)].slice(0, 10).join(',')}`);
  }
  const al = JSON.parse(read('scripts/secdef/allowlist.json'));
  const key = 'fn_lesson_progress_save(p_document_id uuid, p_language text, p_status text, p_last_block_id text)';
  assert(al.functions[key] && al.functions[key].class === 'A' && JSON.stringify(al.functions[key].client) === '["authenticated"]' && al.max.total === 116 && al.max.A === 49
    && al.rules.some((r) => /^CA-5 .*raised by exactly 1 for fn_lesson_progress_save/.test(r)), 'allow-list: exactly +1, reviewed entry + rule');
  const rb = read('docs/database/rollback/120_rollback.sql');
  assert(rb.includes(fn(m116, 'fn_exam_syllabus_read_model')) && rb.includes(fn(m116, 'fn_syllabus__validate')) && /DROP TABLE IF EXISTS public\.user_lesson_progress;/.test(rb), 'rollback restores the 116 bodies and drops the progress table');
  return 'INVOKER ×2 · DEFINER ×1 (+1 reviewed)';
});

test('R-01 reader / course / progress: master-position access, no user id from callers, session-client progress, one primary', () => {
  const r = read('services/learning/learning-resolver.service.ts');
  assert(/lessonAccessLevel\(gate\.positions\.get\(row\.id\) \?\? Number\.MAX_SAFE_INTEGER, gate\.settings, row\.id\)/.test(r) && !/function toResolvedNode[\s\S]{0,400}row\.access_level/.test(r), 'node lessons: access from the master position (unknown position = last, fail-closed)');
  const c = read('services/learning/course.service.ts');
  assert(/static async getCourse\(examSlug: string\)/.test(c) && !/userId|user_id\s*:/.test(c) && /rpc\("fn_exam_course_outline"/.test(c), 'course: no user id accepted');
  const act = read('app/articles/actions.ts');
  assert(/createServerSupabaseClient/.test(act) && !/createAdminServerSupabaseClient|service/i.test(act.replace(/no service role/g, '')) && /rpc\("fn_lesson_progress_save"/.test(act), 'progress action: the session client only');
  const page = read('app/articles/[slug]/page.tsx');
  assert(/session\.state === "user" && article\.lesson && !article\.isLocked/.test(page) && /<LessonProgress /.test(page), 'progress only for a signed-in student on an unlocked lesson');
  const comp = read('components/learning/lesson-progress.tsx');
  // PERF-LESSON-1: a server component <form action> (no "use client", no client libraries on the lesson page)
  assert(!/^"use client"/m.test(comp) && /<form action=\{completeLessonFormAction\}>/.test(comp) && /variant: "secondary"/.test(comp) && !/variant: "primary"/.test(comp), 'the progress control is a server-rendered form, not a second primary action');
  const course = read('app/exams/[slug]/course/page.tsx');
  assert((course.match(/variant="primary"/g) || []).length === 1 && !/[ऀ-ॿ]/.test(course) && /l\.locked \? <Lock/.test(course), 'course page: one primary, English, locked lessons marked');
  const home = read('components/exams/exam-home.tsx');
  assert(/courseHref && \(/.test(home) && /C\.syllabus\.course/.test(home), 'exam home links the course');
  return 'reader · course · progress';
});

console.log(`\nCA5-COURSES offline: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
