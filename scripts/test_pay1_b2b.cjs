#!/usr/bin/env node
/**
 * PAY-1 B2b part 1 — offline gate (static; no network) for migration 143 and the app changes.
 *   P3-01 the three lesson functions call fn_access_allowed('LESSON', document id) right after "lesson not found" and
 *         refuse with 42501; the three answer functions call fn_answer_blocked and return its code before any answer
 *   P3-02 fn_answer_blocked: DEFINER, search_path '', IN_OPEN_ATTEMPT (own in_progress attempt, any version of the
 *         question) before RESERVED_FOR_MOCK (a mock whose tier is PRO — fn_access_tier, NOT the switch-dependent check);
 *         no EXECUTE for anyone
 *   P3-03 trigger: AFTER INSERT on mock_tests, FREE row only for is_free, ON CONFLICT DO NOTHING; no EXECUTE for anyone
 *   P3-04 grants of the six replaced functions restated exactly as before (rollback 143 = the same grants); rollback
 *         restores the six bodies without the guards and drops the trigger + both new functions; chain line
 *   P3-05 app: the mock player gets no internal ids (questionVersionId "" / questionId null) and reports by
 *         mockQuestionId, resolved on the server; a NEW attempt only after canAccess('MOCK_TEST', …); the
 *         instructions page no longer writes; the visitor quick check asks canAccess('LESSON', …) first
 *   P3-06 negative controls: a guard removed / moved after the answer, the switch-dependent check used for
 *         RESERVED_FOR_MOCK, a client grant on the helper, ids sent to the player again, the visitor check removed
 * Run: node scripts/test_pay1_b2b.cjs
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    const info = fn();
    passed++;
    console.log(`  PASS  ${name}${info ? ' — ' + info : ''}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL  ${name}\n        ${String(e && e.message ? e.message : e).slice(0, 800)}`);
  }
}
const assert = (c, m) => {
  if (!c) throw new Error(m || 'assertion failed');
};
const MIG = 'supabase/migrations/20261116000143_pay1_b2b_answer_and_lesson_guards.sql';
const RB = 'docs/database/rollback/143_rollback.sql';
const fnBody = (sql, name) => {
  const i = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  if (i < 0) return '';
  const tag = sql.slice(i).match(/AS (\$[a-z_]*\$)/)[1];
  const a = sql.indexOf(tag, i);
  return sql.slice(i, sql.indexOf(tag, a + tag.length) + tag.length);
};

function guardsCheck(sql) {
  for (const [fn, p] of [['fn_lesson_quick_check_answer', 'QUICK_CHECK'], ['fn_lesson_progress_save', 'PROGRESS'], ['fn_lesson_complete', 'COMPLETE']]) {
    const b = fnBody(sql, fn);
    if (!new RegExp(`IF NOT FOUND THEN RAISE EXCEPTION '${p}: lesson not found' USING ERRCODE = 'P0002'; END IF;\\n    -- PAY-1 B2b[^\\n]*\\n    IF NOT public\\.fn_access_allowed\\('LESSON', p_document_id::text\\) THEN RAISE EXCEPTION '${p}: this lesson needs Pro' USING ERRCODE = '42501'; END IF;`).test(b)) return `${fn}: lesson access guard right after "lesson not found"`;
  }
  for (const [fn, arg, answer] of [['fn_check_practice_answer', 'v_qid', 'INSERT INTO public.practice_answers'], ['fn_memory_lock_answer', 'v_qid', 'correct_option_key'], ['fn_memory_lock_add', 'p_question_id', 'INSERT INTO public.user_mistake_vault']]) {
    const b = fnBody(sql, fn);
    const g = b.indexOf(`v_block := public.fn_answer_blocked(v_uid, ${arg});`);
    if (g < 0 || !/\n    v_block text;   -- PAY-1 B2b\n/.test(b)) return `${fn}: answer guard`;
    if (!/IF v_block IS NOT NULL THEN\n        RETURN jsonb_build_object\('success', false, 'code', v_block\);/.test(b.slice(g))) return `${fn}: returns the guard code`;
    const ans = b.indexOf(answer);
    if (ans >= 0 && ans < g) return `${fn}: the guard must come BEFORE any answer / write`;
  }
  return null;
}
function helperCheck(sql) {
  const b = fnBody(sql, 'fn_answer_blocked');
  if (!/LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''/.test(b)) return 'helper: DEFINER, search_path ""';
  const iOpen = b.indexOf("'IN_OPEN_ATTEMPT'");
  const iRes = b.indexOf("'RESERVED_FOR_MOCK'");
  if (iOpen < 0 || iRes < 0 || iOpen > iRes) return 'helper: IN_OPEN_ATTEMPT first, then RESERVED_FOR_MOCK';
  if (!/ta\.user_id = p_uid AND ta\.status = 'in_progress' AND qv\.question_id = p_question_id/.test(b)) return 'helper: own in-progress attempt, any version of the question';
  if (!/public\.fn_access_tier\('MOCK_TEST', mq\.mock_test_id::text\) = 'PRO'/.test(b) || /fn_access_allowed/.test(b)) return 'helper: the TIER (not the switch-dependent check) decides RESERVED_FOR_MOCK';
  if (!/REVOKE ALL ON FUNCTION public\.fn_answer_blocked\(uuid, uuid\) FROM PUBLIC, anon, authenticated, service_role;/.test(sql) || /GRANT [^;]*fn_answer_blocked/.test(sql)) return 'helper: no EXECUTE for anyone';
  const t = fnBody(sql, 'fn_mock_tests_default_access');
  if (!/IF NEW\.is_free IS TRUE THEN\s+INSERT INTO public\.access_policies \(item_kind, item_key, tier\) VALUES \('MOCK_TEST', NEW\.id::text, 'FREE'\)\s+ON CONFLICT \(item_kind, item_key\) DO NOTHING;/.test(t)) return 'trigger: FREE row only for is_free, never overwrites';
  if (!/CREATE TRIGGER trg_mock_tests_default_access AFTER INSERT ON public\.mock_tests FOR EACH ROW EXECUTE FUNCTION public\.fn_mock_tests_default_access\(\);/.test(sql)) return 'trigger wiring';
  if (/GRANT [^;]*fn_mock_tests_default_access/.test(sql)) return 'trigger function: no EXECUTE';
  return null;
}
function appCheck(svc, player, report, learn) {
  if (!/questionVersionId: "",\n\s+questionId: null,/.test(svc)) return 'player gets no internal ids';
  // the PLAYER delivery mapping only (scoring and the result review after submit may use the ids)
  const del = svc.slice(svc.indexOf('        mockQuestionId: mq.id,'), svc.indexOf('        mockQuestionId: mq.id,') + 900);
  if (/qv\?\.id|qv\?\.question_id/.test(del)) return 'version id still sent to the player';
  if (!/mockQuestionId=\{currentQ\.mockQuestionId \|\| null\}/.test(player)) return 'the player reports by mockQuestionId';
  // the action resolves the per-attempt id through lib/practice/report.ts (server, service role) — never in the client
  if (!/if \(typeof input\.mockQuestionId === "string" && input\.mockQuestionId\) \{\n\s+const r = await resolveMockQuestion\(input\.mockQuestionId\);/.test(report)) return 'mockQuestionId resolved on the server (action)';
  if (!/export async function resolveMockQuestion[\s\S]{0,400}createAdminServerSupabaseClient\(\)\s+\.from\("mock_questions"\)/.test(read('lib/practice/report.ts'))) return 'mockQuestionId resolved on the server (lib/practice/report.ts)';
  if (!/if \(!attempt\) \{\n\s+\/\/ PAY-1 B2b[^\n]*\n\s+if \(!\(await canAccess\("MOCK_TEST", targetMockTestId\)\)\) return null;/.test(svc)) return 'a NEW attempt only after canAccess';
  const instr = svc.slice(svc.indexOf('static async getMockTestInstructions'), svc.indexOf('static async getMockTestInstructions') + 400);
  if (/ensureMockTestQuestions/.test(instr.replace(/\/\/[^\n]*/g, ''))) return 'the instructions page must not write';
  const visitor = learn.slice(learn.indexOf('if (session.state !== "none") return { ok: false, code: "FAILED" };'));
  if (!/^[^\n]*\n\s+\/\/ PAY-1 B2b[^\n]*\n\s+if \(!\(await canAccess\("LESSON", input\.documentId\)\)\) return \{ ok: false, code: "LOCKED" \};\n\s+const block = await publishedQuickCheck\(/.test(visitor)) return 'visitor quick check: canAccess before reading the key';
  return null;
}

const SQL = read(MIG);
const APP = ['services/assessment.service.ts', 'app/(site)/mock-tests/[id]/take/player-client.tsx', 'app/(site)/practice/actions.ts', 'app/(site)/learn/actions.tsx'].map(read);

test('P3-01 guards: lesson access check after "lesson not found" (42501); answer guard before any answer / write', () => {
  const why = guardsCheck(SQL);
  assert(why === null, why);
});
test('P3-02/03 helper: own open attempt → IN_OPEN_ATTEMPT, PRO-tier mock → RESERVED_FOR_MOCK, no EXECUTE; trigger FREE rows for free mocks', () => {
  const why = helperCheck(SQL);
  assert(why === null, why);
});
test('P3-04 grants restated; rollback 143 restores the six bodies (no guards) + drops the trigger and both functions', () => {
  const rb = read(RB);
  assert(/^-- ROLLBACK-CHAIN: run first: /m.test(rb), 'chain line');
  for (const fn of ['fn_lesson_quick_check_answer', 'fn_lesson_progress_save', 'fn_lesson_complete', 'fn_check_practice_answer', 'fn_memory_lock_add', 'fn_memory_lock_answer']) {
    assert(rb.includes(`CREATE OR REPLACE FUNCTION public.${fn}(`), `rollback recreates ${fn}`);
    const grantsM = [...SQL.matchAll(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\([^)]*\\) TO (\\w+);`, 'g'))].map((m) => m[1]).sort().join(',');
    const grantsR = [...rb.matchAll(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\([^)]*\\) TO (\\w+);`, 'g'))].map((m) => m[1]).sort().join(',');
    assert(grantsM && grantsM === grantsR && !/anon/.test(grantsM), `${fn}: grants ${grantsM} vs rollback ${grantsR}`);
  }
  assert(!/fn_answer_blocked\(v_uid|fn_access_allowed\('LESSON'/.test(rb), 'rollback bodies carry no guards');
  assert(/DROP TRIGGER IF EXISTS trg_mock_tests_default_access ON public\.mock_tests;/.test(rb) && /DROP FUNCTION IF EXISTS public\.fn_answer_blocked\(uuid, uuid\);/.test(rb) && /DROP FUNCTION IF EXISTS public\.fn_mock_tests_default_access\(\);/.test(rb), 'rollback drops');
  const a = JSON.parse(read('scripts/secdef/allowlist.json'));
  assert(a.functions['fn_answer_blocked(p_uid uuid, p_question_id uuid)']?.class === 'B-internal' && a.functions['fn_mock_tests_default_access()']?.class === 'B-trigger', 'allow-list');
});
test('P3-05 app: player without internal ids (reports by mockQuestionId); attempt start behind canAccess; no write on the instructions page; visitor quick check behind canAccess', () => {
  const why = appCheck(...APP);
  assert(why === null, why);
});
test('P3-06 negative controls: each mutation is caught', () => {
  const [svc, player, report, learn] = APP;
  const muts = [
    ['lesson guard removed', guardsCheck(SQL.replace(/    IF NOT public\.fn_access_allowed\('LESSON', p_document_id::text\) THEN RAISE EXCEPTION 'COMPLETE: this lesson needs Pro' USING ERRCODE = '42501'; END IF;\n/, ''))],
    ['answer guard removed', guardsCheck(SQL.replace(/(CREATE OR REPLACE FUNCTION public\.fn_memory_lock_add[\s\S]*?)    v_block := public\.fn_answer_blocked\(v_uid, p_question_id\);/, '$1    v_block := NULL;'))],
    ['switch-dependent check for RESERVED_FOR_MOCK', helperCheck(SQL.replace("public.fn_access_tier('MOCK_TEST', mq.mock_test_id::text) = 'PRO'", "NOT public.fn_access_allowed('MOCK_TEST', mq.mock_test_id::text)"))],
    ['helper granted to authenticated', helperCheck(SQL + '\nGRANT EXECUTE ON FUNCTION public.fn_answer_blocked(uuid, uuid) TO authenticated;\n')],
    ['trigger marks every mock FREE', helperCheck(SQL.replace('    IF NEW.is_free IS TRUE THEN\n', '    IF true THEN\n'))],
    ['ids sent to the player again', appCheck(svc.replace('questionVersionId: "",\n        questionId: null,', 'questionVersionId: qv?.id || "",\n        questionId: qv?.question_id ?? null,'), player, report, learn)],
    ['attempt without the access check', appCheck(svc.replace(/        if \(!\(await canAccess\("MOCK_TEST", targetMockTestId\)\)\) return null;\n/, ''), player, report, learn)],
    ['visitor key without the check', appCheck(svc, player, report, learn.replace(/  if \(!\(await canAccess\("LESSON", input\.documentId\)\)\) return \{ ok: false, code: "LOCKED" \};\n/, ''))],
  ];
  const missed = muts.filter(([, w]) => w === null).map(([k]) => k);
  assert(missed.length === 0, `not caught: ${missed.join(', ')}`);
  return `${muts.length} mutations caught`;
});

console.log(`\nPAY-1 B2b: ${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
