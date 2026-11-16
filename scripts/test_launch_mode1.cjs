#!/usr/bin/env node
/**
 * LAUNCH-MODE-1 — offline gate (no network, no DB; source + the pure helpers).
 *   PAY-1 B3 (owner decision 2, 2026-11-15): FREE_N is RETIRED — which lessons are Free / Pro is the LESSON policy in
 *   "Free & Pro" (the central check), not a launch mode.
 *   B3-01 the launch action refuses FREE_N before anything else; FREE_ALL launches
 *   B3-02 the screen: no access-mode radio, no FREE_N warning, no "Change access"; it points to Free & Pro; one primary;
 *         no browser dialogs
 *   B3-03 lesson access: only the central check (see A-01 in test_ca5_courses.cjs)
 *   D-01 migration 123: the 122 signature dropped; FREE_N needs an active plan; mode changes audited (EXAM_COURSE_MODE);
 *        gating reads fn_gated_course_document_ids (LIVE FREE_N only); no BEGIN / COMMIT; INVOKER; rollback = the exact
 *        122 function and refuses while a FREE_N course is LIVE
 * Run: node scripts/test_launch_mode1.cjs
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
const MIG = read('supabase/migrations/20261028000123_launch_mode_1.sql');


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

test('B3-01 the launch action refuses FREE_N first (retired); FREE_ALL still launches', () => {
  const act = read('app/(site)/admin/lessons/actions.ts');
  assert(/if \(accessMode === "FREE_N"\) return \{ success: false, code: "VALIDATION", error: "The per-chapter Pro mode is retired\. Set lesson access in Free & Pro\." \};/.test(act), 'FREE_N refused with the reason');
  const fn = act.slice(act.indexOf('export async function setCourseLaunchAction'));
  assert(fn.indexOf('accessMode === "FREE_N"') < fn.indexOf('CoverageService'), 'the refusal comes before the service / database');
});
test('B3-02 the launch screen: no mode radio / FREE_N warning / "Change access"; points to Free & Pro; one primary; no browser dialogs', () => {
  const ui = read('components/admin/lessons/coverage-matrix.tsx');
  assert(!/name="access-mode"|data-free-n-warning|FREE_N|Change access|MODE_LABEL/.test(ui), 'the FREE_N UI is gone');
  assert(/setCourseLaunchAction\(view\.exam\.id, confirm, "FREE_ALL"\)/.test(ui) && /href="\/admin\/access"/.test(ui), 'launches FREE_ALL; Free & Pro decides lesson access');
  assert((ui.match(/className=\{studioPrimaryAction\}/g) || []).length === 1 && !/window\.(confirm|alert|prompt)\(/.test(ui), 'one primary; no browser dialogs');
});
test('B3-03 lesson access: only the central check (FREE_N / env switch / own entitlement read retired)', () => {
  b3LessonAccess();
});

test('D-01 migration 123: old signature dropped; FREE_N needs an active plan; EXAM_COURSE_MODE audited; gated = LIVE FREE_N; INVOKER; rollback = exact 122 function, refused while FREE_N is LIVE', () => {
  assert(!/^\s*(BEGIN|COMMIT)\s*;/m.test(MIG) && !/SECURITY DEFINER/.test(MIG), 'no BEGIN / COMMIT; no SECDEF');
  assert(/DROP FUNCTION public\.fn_exam_course_launch_set\(uuid, uuid, text, jsonb, uuid, text\);/.test(MIG), 'the 122 signature is dropped');
  assert(/IF p_access_mode = 'FREE_N' AND NOT EXISTS \(SELECT 1 FROM public\.pro_plan_versions WHERE active\) THEN/.test(MIG), 'FREE_N needs an active plan');
  assert(/WHEN v_old\.id IS NOT NULL AND v_old\.status = 'LIVE' THEN 'EXAM_COURSE_MODE'/.test(MIG), 'mode change audited');
  assert(/WHERE x\.status = 'LIVE' AND x\.access_mode = 'FREE_N'/.test(MIG), 'gated = LIVE FREE_N');
  assert(/REVOKE ALL ON FUNCTION public\.fn_exam_course_launch_set\(uuid, uuid, text, text, jsonb, uuid, text\) FROM PUBLIC, anon, authenticated;/.test(MIG) && /GRANT EXECUTE ON FUNCTION public\.fn_exam_course_launch_set\(uuid, uuid, text, text, jsonb, uuid, text\) TO service_role;/.test(MIG), 'service role only');
  const m122 = read('supabase/migrations/20261028000122_ca7_launch_notes_internal.sql');
  const start = m122.indexOf('CREATE OR REPLACE FUNCTION public.fn_exam_course_launch_set(');
  const body122 = m122.slice(start, m122.indexOf('$fn$;', start) + 5);
  const rb = read('docs/database/rollback/123_rollback.sql');
  assert(rb.includes(body122) && /a LIVE course is in FREE_N; pause it or switch it to FREE_ALL first/.test(rb) && /^BEGIN;/m.test(rb) && /^COMMIT;/m.test(rb), 'rollback restores the exact 122 function; refuses while FREE_N is LIVE');
  return 'ok';
});

console.log(`\nLAUNCH-MODE-1 offline: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
