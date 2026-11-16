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

const V = require(path.join(ROOT, 'lib/learning/course-view.ts'));
const MIG = read('supabase/migrations/20261028000120_ca5_courses_progress.sql');
const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;


// PAY-1 B3 (owner decision 2, 2026-11-15): lesson Free / Pro comes ONLY from the central check (accessMany → 147's
// fn_access_allowed_many: the admin's LESSON policy + the paywall switch + the viewer's own Pro); the per-chapter FREE_N
// rule (chapter-access.ts), its env switch (lesson-access-settings.ts / PAYMENTS_ENABLED) and the resolver's own
// entitlement read are retired. Documents are built fail-closed (PRO, locked) until the central check answers.
const b3LessonAccess = () => {
  for (const gone of ['lib/learning/chapter-access.ts', 'lib/learning/lesson-access-settings.ts']) assert(!fs.existsSync(path.join(ROOT, gone)), `${gone} must be retired`);
  const r = read('services/learning/learning-resolver.service.ts');
  assert(/async function applyLessonAccess/.test(r) && /accessMany\('LESSON', list\.map\(\(d\) => d\.id\)\)/.test(r) && /d\.is_locked = !\(a\?\.allowed === true\);/.test(r), 'resolver: tier + lock from accessMany(LESSON)');
  assert((r.match(/is_locked: true,/g) || []).length === 2 && (r.match(/access_level: 'PRO', \/\/ fail-closed/g) || []).length === 2, 'resolver: documents built fail-closed');
  assert(!/user_entitlements|hasPro|getViewerAccess|lessonAccessLevel|getLessonAccessSettings|isPaymentsEnabled|nodeLessonPositions/.test(r), 'resolver: no own Pro read / position rule / env switch');
  assert(/await applyLessonAccess\(\[doc\]\);\s*if \(!doc\.is_locked && ver\?\.id\)/.test(r), 'article body only after the central check');
  for (const f of ['services/learning/master-lesson.service.ts', 'services/learning/course.service.ts']) {
    const s = read(f);
    assert(/accessMany\("LESSON", /.test(s) && !/hasPro|isLessonLocked|lessonAccessLevel|getLessonAccessSettings/.test(s), `${f}: the central check only`);
  }
};

test('A-01 (PAY-1 B3) lesson access: only the central check (LESSON policy + paywall switch + own Pro), fail-closed; FREE_N / env switch / own entitlement read retired', () => {
  b3LessonAccess();
  return 'accessMany(LESSON) decides; documents fail-closed until it answers';
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
  assert(al.functions[key] && al.functions[key].class === 'A' && JSON.stringify(al.functions[key].client) === '["authenticated"]' && al.max.total >= 116 && al.max.A === 49 + 2 /* later phases raise the total by documented, exact rules (O-09 sums them); COURSE-UX-1 +2 (fn_lesson_quick_check_answer, fn_lesson_complete) */
      + al.rules.filter((r) => /^PAY-1 /.test(r)).map((r) => Number((r.match(/client_executable_callable \/ A raised by exactly (\d+)/) || [])[1] || 0)).reduce((x, y) => x + y, 0) /* PAY-1 B2a +2 and later */
    && al.rules.some((r) => /^CA-5 .*raised by exactly 1 for fn_lesson_progress_save/.test(r)), 'allow-list: exactly +1, reviewed entry + rule');
  const rb = read('docs/database/rollback/120_rollback.sql');
  assert(rb.includes(fn(m116, 'fn_exam_syllabus_read_model')) && rb.includes(fn(m116, 'fn_syllabus__validate')) && /DROP TABLE IF EXISTS public\.user_lesson_progress;/.test(rb), 'rollback restores the 116 bodies and drops the progress table');
  return 'INVOKER ×2 · DEFINER ×1 (+1 reviewed)';
});

test('R-01 reader / course / progress: central-check access (PAY-1 B3), no user id from callers, session-client progress, one primary', () => {
  const r = read('services/learning/learning-resolver.service.ts');
  assert(/function toResolvedNode\(row: NodeLessonRow, topic: NodeRef \| undefined\)/.test(r) && !/function toResolvedNode[\s\S]{0,400}row\.access_level/.test(r), 'node lessons: no access column; the central check decides (PAY-1 B3)');
  const c = read('services/learning/course.service.ts');
  assert(/static async getCourse\(examSlug: string\)/.test(c) && !/userId|user_id\s*:/.test(c) && /rpc\("fn_exam_course_outline"/.test(c), 'course: no user id accepted');
  const act = read('app/(site)/articles/actions.ts');
  assert(/createServerSupabaseClient/.test(act) && !/createAdminServerSupabaseClient|service/i.test(act.replace(/no service role/g, '')) && /rpc\("fn_lesson_progress_save"/.test(act), 'progress action: the session client only');
  const page = read('app/(site)/articles/[slug]/page.tsx');
  assert(/session\.state === "user" && article\.lesson && !article\.isLocked/.test(page) && /<LessonProgress /.test(page), 'progress only for a signed-in student on an unlocked lesson');
  const comp = read('components/learning/lesson-progress.tsx');
  // PERF-LESSON-1: a server component <form action> (no "use client", no client libraries on the lesson page)
  assert(!/^"use client"/m.test(comp) && /<form action=\{completeLessonFormAction\}>/.test(comp) && /variant: "secondary"/.test(comp) && !/variant: "primary"/.test(comp), 'the progress control is a server-rendered form, not a second primary action');
  const course = read('app/(site)/exams/[slug]/course/page.tsx');
  // COURSE-UX-1: the lesson rows moved to components/learning/course-ui.tsx (a locked lesson shows the lock icon + "Pro lesson, locked")
  const courseUi = read('components/learning/course-ui.tsx');
  assert((course.match(/variant="primary"/g) || []).length === 1 && !/[ऀ-ॿ]/.test(course + courseUi) && /if \(locked\) return <Lock/.test(courseUi) && /lesson\.locked \? "Pro lesson, locked"/.test(courseUi), 'course page: one primary, English, locked lessons marked');
  const home = read('components/exams/exam-home.tsx');
  assert(/courseHref && \(/.test(home) && /C\.syllabus\.course/.test(home), 'exam home links the course');
  return 'reader · course · progress';
});

console.log(`\nCA5-COURSES offline: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
