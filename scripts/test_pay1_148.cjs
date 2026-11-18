#!/usr/bin/env node
/**
 * PAY-1 148 cleanup — offline gate (static; no network) for migration 148, its rollback and the app / gate cleanup that
 * ships with it (owner GO 2026-11-18; PAY_1_DESIGN.md §11 "148").
 *   C-01 migration: refuses unless 147 is APPLIED and every launch is FREE_ALL; drops exactly the five legacy premium /
 *        flashcard functions, fn_gated_course_document_ids, the 7-argument fn_exam_course_launch_set and
 *        exam_course_launches.access_mode; no BEGIN / COMMIT; no SECURITY DEFINER; a proof block
 *   C-02 the new fn_exam_course_launch_set: 6 arguments, INVOKER, EXECUTE service_role only; no access mode anywhere; the
 *        126 rules kept (actor, status, exam, cycle, coverage, published syllabus, logo, "already", pause only when LIVE,
 *        advisory lock, audit row)
 *   C-03 rollback: chain line; the column (NOT NULL DEFAULT FREE_ALL, CHECK, comment, anon / authenticated read) and every
 *        dropped function back with its grants; the 7-argument launch body = the 126 body; proof block
 *   C-04 app: the dead premium hub / generator / entitlement code and the three uncalled mock-list functions are gone;
 *        nothing in app / lib / services / components names a dropped function, the column or the gating function
 *   C-05 allow-lists lowered: SECDEF allow-list has none of the five (max total 129, B-service 37) and a 148 rule line;
 *        the P4-07 static-gate allow-list names no deleted file and no longer excuses assessment.service.ts
 *   C-06 generated types match the post-148 schema (no dropped function / column; the launch Args without p_access_mode)
 *   C-07 negative controls: each mutation is caught
 * Run: node scripts/test_pay1_148.cjs
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

const MIG = read('supabase/migrations/20261118000148_pay1_cleanup.sql');
const RB = read('docs/database/rollback/148_rollback.sql');
const M126 = read('supabase/migrations/20261030000126_exam_logo_1.sql');
const DROPPED = {
  fn_authorize_and_start_test_attempt: 'uuid, uuid',
  fn_check_premium_access_and_quota: 'uuid, uuid, text',
  fn_create_dynamic_mock_instance_atomic: 'uuid, uuid, uuid, text, text, text, text, integer, numeric, numeric, jsonb, jsonb, integer',
  fn_get_due_flashcards: 'uuid, integer',
  fn_create_custom_flashcard_deck: 'text, text, uuid, jsonb',
};
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const launchBody = (sql) => {
  const i = sql.indexOf('FUNCTION public.fn_exam_course_launch_set(p_exam_id uuid, p_exam_cycle_id uuid, p_status text, p_coverage jsonb');
  if (i < 0) return '';
  return sql.slice(i, sql.indexOf('$function$;', i));
};
const bodyOf = (sql, startRx) => {
  const m = sql.match(startRx);
  if (!m) return '';
  const from = sql.indexOf('AS $function$', m.index);
  return from < 0 ? '' : sql.slice(from, sql.indexOf('$function$;', from + 13));
};

// ---- the checks, as functions of the texts (so the negative controls can mutate them) -------------------------------
function migrationCheck(sql) {
  const why = [];
  if (!/IF NOT EXISTS \(SELECT 1 FROM public\.schema_migration_ledger WHERE filename = '20261116000147_pay1_b3_central_checks\.sql' AND status = 'APPLIED'\) THEN/.test(sql)) why.push('no 147 preflight');
  if (!/IF EXISTS \(SELECT 1 FROM public\.exam_course_launches WHERE access_mode <> 'FREE_ALL'\) THEN\s*RAISE EXCEPTION/.test(sql)) why.push('no FREE_ALL-only preflight');
  for (const [fn, args] of Object.entries(DROPPED)) if (!new RegExp(`^DROP FUNCTION public\\.${fn}\\(${esc(args)}\\);$`, 'm').test(sql)) why.push(`${fn} not dropped (exact signature)`);
  if (!/^DROP FUNCTION public\.fn_gated_course_document_ids\(\);$/m.test(sql)) why.push('fn_gated_course_document_ids not dropped');
  if (!/^DROP FUNCTION public\.fn_exam_course_launch_set\(uuid, uuid, text, text, jsonb, uuid, text\);$/m.test(sql)) why.push('the 7-argument launch function not dropped');
  if (!/^ALTER TABLE public\.exam_course_launches DROP COLUMN access_mode;$/m.test(sql)) why.push('access_mode not dropped');
  if (/^\s*(BEGIN|COMMIT|ROLLBACK)\s*;/m.test(sql)) why.push('transaction control in the file');
  if (/SECURITY DEFINER/i.test(sql.replace(/^--.*$/gm, ''))) why.push('a SECURITY DEFINER function');
  if (/IF EXISTS|CASCADE/.test(sql.replace(/^--.*$/gm, '').replace(/IF EXISTS \(SELECT/g, ''))) why.push('a soft drop (IF EXISTS / CASCADE)');
  if (!/DO \$proof\$[\s\S]*PAY1_148_PROOF[\s\S]*\$proof\$;/.test(sql)) why.push('no proof block');
  return why;
}
function launchCheck(sql) {
  const why = [];
  const b = launchBody(sql);
  if (!b) return ['the 6-argument fn_exam_course_launch_set is missing'];
  if (/access_mode|FREE_N|FREE_ALL|EXAM_COURSE_MODE/.test(b)) why.push('the launch function still knows an access mode');
  if (/SECURITY DEFINER/.test(b) || !/SET search_path TO 'public', 'pg_temp'/.test(b)) why.push('not INVOKER with the recorded search_path');
  for (const [n, rx] of [
    ['actor', /IF p_actor_email IS NULL OR btrim\(p_actor_email\) = '' THEN RAISE EXCEPTION 'LAUNCH: an actor is required'/],
    ['status', /IF p_status IS NULL OR p_status NOT IN \('LIVE', 'PAUSED'\) THEN/],
    ['exam', /'LAUNCH: exam not found'/],
    ['cycle', /'LAUNCH: the cycle does not belong to this exam'/],
    ['lock', /PERFORM pg_advisory_xact_lock\(hashtextextended\('exam_course_launch:' \|\| p_exam_id::text, 0\)\);/],
    ['coverage', /'LAUNCH: a coverage snapshot is required to launch'/],
    ['syllabus', /'LAUNCH: the exam has no published syllabus'/],
    ['logo', /e\.logo_override_sha256 IS NOT NULL OR o\.logo_sha256 IS NOT NULL/],
    ['pause only LIVE', /'LAUNCH: only a LIVE course can be paused'/],
    ['already', /IF v_old\.id IS NOT NULL AND v_old\.status = p_status THEN\s*RAISE EXCEPTION 'LAUNCH: the course is already %'/],
    ['audit', /INSERT INTO public\.admin_audit_logs \(actor_id, actor_email, action_type, target_entity, target_id, old_value, new_value, reason\)/],
    ['actions', /v_action := CASE WHEN p_status = 'PAUSED' THEN 'EXAM_COURSE_PAUSE' ELSE 'EXAM_COURSE_LAUNCH' END;/],
  ]) if (!rx.test(b)) why.push(`the 126 rule "${n}" is missing`);
  if (!/^REVOKE ALL ON FUNCTION public\.fn_exam_course_launch_set\(uuid, uuid, text, jsonb, uuid, text\) FROM PUBLIC, anon, authenticated;$/m.test(sql)
    || !/^GRANT EXECUTE ON FUNCTION public\.fn_exam_course_launch_set\(uuid, uuid, text, jsonb, uuid, text\) TO service_role;$/m.test(sql)) why.push('not service_role only');
  if (/GRANT [^;]*fn_exam_course_launch_set[^;]* TO [^;]*(anon|authenticated|PUBLIC)/.test(sql)) why.push('a client grant on the launch function');
  return why;
}
function rollbackCheck(rb) {
  const why = [];
  if (!/^-- ROLLBACK-CHAIN: run first: none$/m.test(rb)) why.push('no chain line');
  if (/^\s*(BEGIN|COMMIT)\s*;/m.test(rb)) why.push('transaction control in the rollback');
  if (!/^ALTER TABLE public\.exam_course_launches ADD COLUMN access_mode text NOT NULL DEFAULT 'FREE_ALL';$/m.test(rb)
    || !/ADD CONSTRAINT exam_course_launches_access_mode_check CHECK \(\(access_mode = ANY \(ARRAY\['FREE_ALL'::text, 'FREE_N'::text\]\)\)\);/.test(rb)
    || !/^GRANT SELECT \(access_mode\) ON public\.exam_course_launches TO anon, authenticated;$/m.test(rb)
    || !/^COMMENT ON COLUMN public\.exam_course_launches\.access_mode IS /m.test(rb)) why.push('the column is not restored as it was');
  if (!/^DROP FUNCTION public\.fn_exam_course_launch_set\(uuid, uuid, text, jsonb, uuid, text\);$/m.test(rb)) why.push('the 6-argument launch function is not dropped');
  const b126 = bodyOf(M126, /CREATE OR REPLACE FUNCTION public\.fn_exam_course_launch_set\(p_exam_id uuid, p_exam_cycle_id uuid, p_status text, p_access_mode text/);
  const bRb = bodyOf(rb, /CREATE OR REPLACE FUNCTION public\.fn_exam_course_launch_set\(p_exam_id uuid, p_exam_cycle_id uuid, p_status text, p_access_mode text/);
  if (!b126 || b126 !== bRb) why.push('the 7-argument launch body is not the 126 body');
  if (!/^REVOKE ALL ON FUNCTION public\.fn_exam_course_launch_set\(uuid, uuid, text, text, jsonb, uuid, text\) FROM PUBLIC, anon, authenticated;$/m.test(rb)) why.push('the 7-argument launch grants');
  if (!/CREATE OR REPLACE FUNCTION public\.fn_gated_course_document_ids\(\)/.test(rb)
    || !/^GRANT EXECUTE ON FUNCTION public\.fn_gated_course_document_ids\(\) TO anon, authenticated, service_role;$/m.test(rb)) why.push('fn_gated_course_document_ids not restored with its grants');
  for (const [fn, args] of Object.entries(DROPPED)) {
    const body = bodyOf(rb, new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}\\(`));
    if (!body) why.push(`${fn} not restored`);
    if (!new RegExp(`^REVOKE ALL ON FUNCTION public\\.${fn}\\(${esc(args)}\\) FROM PUBLIC, anon, authenticated;\\nGRANT EXECUTE ON FUNCTION public\\.${fn}\\(${esc(args)}\\) TO service_role;$`, 'm').test(rb)) why.push(`${fn}: not service_role only`);
  }
  if ((rb.match(/^ SECURITY DEFINER$/gm) || []).length !== 5) why.push('the five functions must come back SECURITY DEFINER (exactly five)');
  if (!/ROLLBACK_148_PROOF/.test(rb)) why.push('no proof block');
  return why;
}
const DEAD_FILES = ['services/premium-hub.service.ts', 'services/premium-generator.service.ts', 'services/premium-entitlement.service.ts', 'app/(site)/premium/actions.ts', 'components/premium/premium-hub-view.tsx'];
const APP_RULE = new RegExp(`\\b(${[...Object.keys(DROPPED), 'fn_gated_course_document_ids', 'access_mode', 'p_access_mode', 'PremiumEntitlementService', 'PremiumHubService', 'PremiumGeneratorService', 'getExamDetail', 'getDailyMockHubData', 'getMockTestsDirectory'].join('|')})\\b|premium-(?:hub|generator|entitlement)\\.service|components/premium/|\\(site\\)/premium/actions`);
const walk = (d) => (fs.existsSync(path.join(ROOT, d)) ? fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${d}/${e.name}`) : /\.(ts|tsx)$/.test(e.name) ? [`${d}/${e.name}`] : [])) : []);
const APP = ['app', 'lib', 'services', 'components'].flatMap(walk).map((rel) => [rel, read(rel)]);
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:"'`])\/\/[^\n]*/g, '$1');
function appCheck(files, exists) {
  const why = DEAD_FILES.filter(exists).map((f) => `${f} still exists`);
  for (const [rel, src] of files) code(src).split('\n').forEach((l, i) => { if (APP_RULE.test(l)) why.push(`${rel}:${i + 1}`); });
  return why;
}
function allowCheck(allow, b3) {
  const why = [];
  for (const sig of Object.keys(allow.functions)) if (Object.keys(DROPPED).some((fn) => sig.startsWith(`${fn}(`))) why.push(`SECDEF allow-list still lists ${sig}`);
  if (allow.max.total !== 129 || allow.max['B-service'] !== 37) why.push(`SECDEF max not lowered (total ${allow.max.total}, B-service ${allow.max['B-service']})`);
  if (!allow.rules.some((r) => /^PAY-1 148 .*max total and B-service lowered by exactly 3 /.test(r))
    || !allow.rules.some((r) => /^PAY-1 148 .*max total lowered by exactly 2 /.test(r))) why.push('no 148 rule lines (both lowered by 3; the total alone by 2)');
  const a = b3.slice(b3.indexOf('const B3_ALLOW = {'), b3.indexOf('};', b3.indexOf('const B3_ALLOW = {')));
  for (const f of [...DEAD_FILES, 'services/assessment.service.ts']) if (a.includes(`'${f}'`)) why.push(`P4-07 allow-list still excuses ${f}`);
  return why;
}
function typesCheck(t) {
  const why = [];
  for (const n of [...Object.keys(DROPPED), 'fn_gated_course_document_ids']) if (new RegExp(`^      ${n}: `, 'm').test(t)) why.push(`types still list ${n}`);
  const ecl = t.slice(t.indexOf('      exam_course_launches: {'), t.indexOf('Relationships', t.indexOf('      exam_course_launches: {')));
  if (/access_mode/.test(ecl)) why.push('types: exam_course_launches.access_mode');
  const ls = t.slice(t.indexOf('      fn_exam_course_launch_set: {'), t.indexOf('      }', t.indexOf('      fn_exam_course_launch_set: {')));
  if (!ls || /p_access_mode/.test(ls) || !/p_coverage: Json/.test(ls)) why.push('types: fn_exam_course_launch_set Args');
  return why;
}

const exists = (f) => fs.existsSync(path.join(ROOT, f));
const ALLOW = JSON.parse(read('scripts/secdef/allowlist.json'));
const B3 = read('scripts/test_pay1_b3.cjs');
const TYPES = read('types/database.ts');

test('C-01 migration: 147 + FREE_ALL-only preflight; exact drops (5 legacy functions, the gating function, the 7-argument launch, the column); no BEGIN / COMMIT, no SECDEF, no soft drop; proof block', () => {
  const why = migrationCheck(MIG);
  assert(why.length === 0, why.join('; '));
});
test('C-02 the new fn_exam_course_launch_set: 6 arguments, INVOKER, service_role only, no access mode; every 126 rule kept', () => {
  const why = launchCheck(MIG);
  assert(why.length === 0, why.join('; '));
});
test('C-03 rollback: chain line; column + CHECK + comment + anon / authenticated read; the 126 launch body; the gating function and the five functions with their grants; proof', () => {
  const why = rollbackCheck(RB);
  assert(why.length === 0, why.join('; '));
});
test('C-04 app: dead premium hub / generator / entitlement code and the three uncalled mock-list functions gone; nothing names a dropped function, the column or the gating function', () => {
  const why = appCheck(APP, exists);
  assert(why.length === 0, why.join(', '));
  return `${APP.length} files scanned; ${DEAD_FILES.length} files deleted`;
});
test('C-05 allow-lists lowered: SECDEF allow-list (none of the five; max total 129, B-service 37; 148 rule) and the P4-07 allow-list (no deleted file, assessment.service.ts no longer excused)', () => {
  const why = allowCheck(ALLOW, B3);
  assert(why.length === 0, why.join('; '));
});
test('C-06 generated types match the post-148 schema', () => {
  const why = typesCheck(TYPES);
  assert(why.length === 0, why.join('; '));
});
test('C-07 negative controls: each mutation is caught', () => {
  const muts = [
    ['C-01 no FREE_ALL preflight', () => migrationCheck(MIG.replace("WHERE access_mode <> 'FREE_ALL'", "WHERE false AND access_mode <> 'FREE_ALL'"))],
    ['C-01 a soft drop', () => migrationCheck(MIG.replace('DROP FUNCTION public.fn_get_due_flashcards(uuid, integer);', 'DROP FUNCTION IF EXISTS public.fn_get_due_flashcards(uuid, integer);'))],
    ['C-01 one function kept', () => migrationCheck(MIG.replace(/^DROP FUNCTION public\.fn_check_premium_access_and_quota\(uuid, uuid, text\);\n/m, ''))],
    ['C-01 column kept', () => migrationCheck(MIG.replace('ALTER TABLE public.exam_course_launches DROP COLUMN access_mode;', ''))],
    ['C-01 COMMIT', () => migrationCheck(MIG + '\nCOMMIT;\n')],
    ['C-02 DEFINER', () => launchCheck(MIG.replace(" LANGUAGE plpgsql\n SET search_path TO 'public', 'pg_temp'", " LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public', 'pg_temp'"))],
    ['C-02 logo rule lost', () => launchCheck(MIG.replace('e.logo_override_sha256 IS NOT NULL OR o.logo_sha256 IS NOT NULL', 'true'))],
    ['C-02 client grant', () => launchCheck(MIG + '\nGRANT EXECUTE ON FUNCTION public.fn_exam_course_launch_set(uuid, uuid, text, jsonb, uuid, text) TO authenticated;\n')],
    ['C-02 mode kept', () => launchCheck(MIG.replace("jsonb_build_object('id', v_new.id, 'status', v_new.status)", "jsonb_build_object('id', v_new.id, 'status', v_new.status, 'access_mode', 'FREE_ALL')"))],
    ['C-03 launch body changed', () => rollbackCheck(RB.replace("RAISE EXCEPTION 'LAUNCH: the exam has no published syllabus'", "RAISE EXCEPTION 'LAUNCH: no syllabus'"))],
    ['C-03 column grant lost', () => rollbackCheck(RB.replace('GRANT SELECT (access_mode) ON public.exam_course_launches TO anon, authenticated;', ''))],
    ['C-03 a function given to authenticated', () => rollbackCheck(RB.replace('REVOKE ALL ON FUNCTION public.fn_get_due_flashcards(uuid, integer) FROM PUBLIC, anon, authenticated;', 'REVOKE ALL ON FUNCTION public.fn_get_due_flashcards(uuid, integer) FROM PUBLIC, anon;'))],
    ['C-04 a dead file back', () => appCheck(APP, (f) => f === 'services/premium-hub.service.ts' || exists(f))],
    ['C-04 a call to a dropped function', () => appCheck([...APP, ['services/x.ts', 'await db.rpc("fn_get_due_flashcards", {});']], exists)],
    ['C-04 the column read', () => appCheck([...APP, ['services/y.ts', 'db.from("exam_course_launches").select("status, access_mode")']], exists)],
    ['C-05 an allow-list entry back', () => allowCheck({ ...ALLOW, functions: { ...ALLOW.functions, 'fn_get_due_flashcards(p_deck_id uuid, p_limit integer)': {} } }, B3)],
    ['C-05 max not lowered', () => allowCheck({ ...ALLOW, max: { ...ALLOW.max, total: 134 } }, B3)],
    ['C-05 P4-07 still excuses assessment.service', () => allowCheck(ALLOW, B3.replace('const B3_ALLOW = {', "const B3_ALLOW = {\n  'services/assessment.service.ts': 'x',"))],
    ['C-06 types keep p_access_mode', () => typesCheck(TYPES.replace('      fn_exam_course_launch_set: {\n        Args: {\n', '      fn_exam_course_launch_set: {\n        Args: {\n          p_access_mode: string\n'))],
  ];
  const missed = muts.filter(([, f]) => f().length === 0).map(([n]) => n);
  assert(missed.length === 0, `not caught: ${missed.join(', ')}`);
  return `${muts.length} mutations caught`;
});

console.log(`\nPAY-1 148: ${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
