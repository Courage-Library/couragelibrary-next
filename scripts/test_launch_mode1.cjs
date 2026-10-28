#!/usr/bin/env node
/**
 * LAUNCH-MODE-1 — offline gate (no network, no DB; source + the pure helpers).
 *   M-01 the rule: FREE_N needs payments on (PAYMENTS_ENABLED) AND an active Pro plan; the reason is plain; FREE_ALL is
 *        always allowed; default FREE_ALL
 *   S-01 the server refuses FREE_N with the reason before the database (which refuses it too without an active plan); a
 *        failed plan read blocks FREE_N (fail closed); payments off → nothing is gated even if a FREE_N course is LIVE
 *   U-01 the screen: the mode is chosen in the confirmation; FREE_N is disabled with its reason; the primary stays one;
 *        no browser dialogs
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

test('M-01 the rule: FREE_N needs payments on AND an active Pro plan (plain reasons); FREE_ALL always; default FREE_ALL', () => {
  const C = require(path.join(ROOT, 'lib/learning/coverage.ts'));
  assert(C.freeNBlock(false, 4) === 'PAYMENTS_OFF' && C.freeNBlock(true, 0) === 'NO_ACTIVE_PLAN' && C.freeNBlock(false, 0) === 'PAYMENTS_OFF' && C.freeNBlock(true, 1) === null, 'freeNBlock');
  assert(JSON.stringify(C.ACCESS_MODES) === '["FREE_ALL","FREE_N"]', 'two modes');
  for (const m of Object.values(C.FREE_N_BLOCK_MESSAGE)) assert(/no one could buy the Pro lessons\. Launch with every lesson free instead\.$/.test(m), `plain reason: ${m}`);
  assert(/access_mode text NOT NULL DEFAULT 'FREE_ALL' CHECK \(access_mode IN \('FREE_ALL', 'FREE_N'\)\)/.test(MIG), 'default FREE_ALL in the database');
  return 'ok';
});

test('S-01 server: FREE_N refused with the reason before the database; a failed plan read blocks it; payments off → nothing gated; the action validates the mode', () => {
  const svc = read('services/learning/coverage.service.ts');
  assert(/if \(!isPaymentsEnabled\(\)\) return "PAYMENTS_OFF";/.test(svc) && /\.from\("pro_plan_versions"\)\.select\("id", \{ count: "exact", head: true \}\)\.eq\("active", true\);\s*return freeNBlock\(true, error \? 0 : \(count \?\? 0\)\);/.test(svc), 'payments flag + active plan, fail closed');
  assert(/if \(status === "LIVE" && accessMode === "FREE_N" && view\.data\.freeNBlock\) return fail\("FREE_N_BLOCKED", FREE_N_BLOCK_MESSAGE\[view\.data\.freeNBlock\]\);/.test(svc), 'refused before the RPC');
  assert(svc.indexOf('FREE_N_BLOCKED') < svc.indexOf('rpc("fn_exam_course_launch_set"'), 'the refusal comes first');
  const act = read('app/admin/lessons/actions.ts');
  assert(/if \(accessMode !== "FREE_ALL" && accessMode !== "FREE_N"\) return \{ success: false, code: "VALIDATION", error: "Choose an access mode\." \};/.test(act), 'action validates the mode');
  const st = read('lib/learning/lesson-access-settings.ts');
  assert(/if \(!isPaymentsEnabled\(\)\) return NO_PAYWALL;/.test(st) && /db\.rpc\("fn_gated_course_document_ids"\)/.test(st) && !/fn_live_course_document_ids/.test(st), 'gating reads LIVE FREE_N lessons only; payments off → none');
  return 'ok';
});

test('U-01 screen: the mode is chosen in the confirmation; FREE_N disabled with its reason; one primary; no browser dialogs', () => {
  const ui = read('components/admin/lessons/coverage-matrix.tsx');
  assert(/<legend className="text-\[13px\] font-semibold text-fg">Lesson access<\/legend>/.test(ui) && /type="radio" name="access-mode"/.test(ui), 'a labelled radio group');
  assert(/disabled=\{m === "FREE_N" && Boolean\(block\)\}/.test(ui) && /\{m === "FREE_N" && block && <span className="block">\{FREE_N_BLOCK_MESSAGE\[block\]\}<\/span>\}/.test(ui), 'FREE_N disabled with the reason shown');
  assert(/useState<AccessMode>\(view\?\.exam\.launch\?\.accessMode \?\? "FREE_ALL"\)/.test(ui), 'default FREE_ALL');
  assert((ui.match(/className=\{studioPrimaryAction\}/g) || []).length === 1 && !/window\.confirm|alert\(/.test(ui), 'one primary, in-page confirmation');
  return 'ok';
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
