/**
 * QB-KEY-1 Stage 2 — question validity guard (087), retired CA-4 fixtures (088), no fabricated answer keys.
 *
 * Offline:
 *   K-0  helper lib/questions/answer-key.ts: valid / NO_ANSWER / OPTION_COUNT / OPTION_KEYS / KEY_NOT_IN_OPTIONS /
 *        MULTIPLE_ANSWERS / KEY_INVALID; display mode (no options) checks the key only
 *   K-7s static: 087 = functions + one DEFERRABLE INITIALLY DEFERRED constraint trigger, owner-only grants, LF;
 *        rollback drops / restores; 088 = exactly the 8 fixture ids + audited reason; CA-4 suite archived, refuses
 *        to run, referenced by no gate
 *   K-11 grading (offline harness, stubbed DB): a keyless question is excluded from score AND max score, never marked
 *        incorrect, never negatively marked, never sent to the Mistake Vault; logged as a data error
 *   K-12 UI: no fabricated "A" / default key anywhere (app, services, components, lib); QuestionReviewCard renders
 *        "Answer key unavailable" + "Not scored" and marks no option when the key is missing; every fixed view
 *        handles a null key (static)
 *   K-13 admin archive action writes an audit row on archive / unarchive; an audit failure reverts the status
 * Live (couragelibrary-next, verified TLS; every write inside a rolled-back transaction; needs 087 + 088 applied):
 *   K-1  valid 4-option version → fn_publish_question_version succeeds; publishing v2 supersedes v1
 *   K-2/3/4/8  publish attempts via the publish RPC AND direct SQL (QF flag, commit-time check): 3 options, 5 options,
 *        no key, two keys, key not in options → all blocked; valid → allowed
 *   K-5  fn_transition_question_version → APPROVED with a full checklist is refused for a keyless version
 *   K-6  existing data: 111 published versions servable; superseding / archiving not blocked
 *   K-7  live grants: the 4 new functions owner-only; the 7 replaced functions keep their ACLs; P-9 shape
 *   K-9  the pre-087 question_versions / question_options / question_answers (the 113 versions created up to
 *        2026-10-12T11:24:49Z) byte-identical to the baseline; later, separately gated content is out of scope
 *   K-10 the 8 fixtures archived with 8 audit rows; not served by practice (service_role with student claims — the
 *        practice RPC is not client-callable since SECDEF-S2-2 / 090), battles' pool, drills (predicate) or mock assembly (guard)
 *   K-14 decision #54 invoker safety: as qa-student (role authenticated + JWT claims): the helpers are not callable
 *        directly (42501) and, since 090, neither is the practice RPC (42501); practice (manual + 5 modes, run as
 *        service_role with qa-student's claims; 2 with a pre-existing 42703), drill generate, battle room and the assembled
 *        mocks serve only valid-key published questions and do not error (each probe rolled back)
 *
 * Run: node scripts/test_qb_key1.cjs [--offline]
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
const OFFLINE = process.argv.includes('--offline');
let passed = 0;
let failed = 0;
async function test(name, fn) {
  try { const info = await fn(); passed++; console.log(`  PASS  ${name}${info ? ' — ' + info : ''}`); } catch (e) { failed++; console.log(`  FAIL  ${name}\n        ${String(e && e.message ? e.message : e).slice(0, 1500)}`); }
}
const assert = (c, m) => { if (!c) throw new Error(m || 'assertion failed'); };
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'`])\/\/[^\n]*/g, '$1');

const M87 = 'supabase/migrations/20261017000087_qb_key1_question_validity_guard.sql';
const M88 = 'supabase/migrations/20261017000088_qb_key1_retire_ca4_fixtures.sql';
const RB87 = 'docs/database/rollback/087_rollback.sql';
const RB88 = 'docs/database/rollback/088_rollback.sql';
const FIXTURES = ['c6cbfdbf-def4-45a5-9ef6-4d0a24ab61cc', '234486ee-4485-49fe-8e7d-e2cab11b250b', '597c1c98-9a54-4662-95d1-430b18b8dc61', '1fdd3747-a113-4f63-8cef-49aa63ce1c32',
  'd00219c2-13be-47c7-8584-bf00bc187fd4', '3735364e-5993-4378-9d89-3b3347fe3bfe', '78bd0707-d8eb-4ef7-8c80-ef707df6e1cd', '94b30583-2969-493a-80bd-85e179fe1ab4'];
const BAD_VERSION = 'bc0b7703-22a0-4234-933e-9db0029e59b8';
// pre-087 baseline (QB-KEY-1 Stage 2 report §5): content tables must stay byte-identical
const BASELINE = { question_versions: 'b2bb76546c3b', question_options: 'ac7af53d81e7', question_answers: '06afec0c4af2' };
// the baseline set: every version created up to the last pre-087 row (2026-10-12); 113 versions
const BASELINE_BEFORE = '2026-10-12T11:24:49Z'; // strictly before (the last baseline row is 11:24:48.123xxx; the next version is from 2026-10-27)
const BASELINE_VERSIONS = 113;

// ---------------------------------------------------------------- TS loader with stubs
function loadTs(rel, stubs = {}) {
  const file = path.join(ROOT, rel);
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const m = new Module(file);
  m.filename = file;
  m.paths = Module._nodeModulePaths(path.dirname(file));
  const req = (id) => {
    if (stubs[id]) return stubs[id];
    if (id.startsWith('./') || id.startsWith('../') || id.startsWith('@/')) {
      const t = id.startsWith('@/') ? id.slice(2) : path.relative(ROOT, path.resolve(path.dirname(file), id)).split(path.sep).join('/');
      const cand = [`${t}.ts`, `${t}.tsx`, `${t}/index.ts`].find((c) => fs.existsSync(path.join(ROOT, c)));
      if (cand) return loadTs(cand, stubs);
      if (id.startsWith('@/')) return new Proxy({}, { get: () => new Proxy(function () {}, { get: () => () => ({}), apply: () => ({}) }) });
    }
    return m.require(id);
  };
  new Function('module', 'exports', 'require', 'process', js)(m, m.exports, req, process);
  return m.exports;
}
const React = require('react');

/** chainable Supabase mock: records inserts / updates; resolves per table */
function supaMock(results) {
  const writes = [];
  const from = (table) => {
    let op = 'select';
    let payload = null;
    const b = new Proxy({}, {
      get(_, prop) {
        if (prop === 'then') {
          const res = op === 'insert' ? { data: { id: `new-${table}` }, error: (results.errors || {})[`${table}:insert`] || null }
            : op === 'update' ? { data: null, error: (results.errors || {})[`${table}:update`] || null }
            : results[table] || { data: [], error: null };
          return (ok, ko) => Promise.resolve(res).then(ok, ko);
        }
        return (...args) => {
          if (prop === 'insert' || prop === 'update') { op = prop; payload = args[0]; writes.push({ table, op, payload }); }
          return b;
        };
      },
    });
    return b;
  };
  return { writes, from, rpc: async () => ({ data: null, error: null }) };
}

(async () => {
  console.log('QB-KEY-1 Stage 2');

  await test('K-0 answer-key helper mirrors the DB rule (and never invents a key)', async () => {
    const H = loadTs('lib/questions/answer-key.ts');
    const opts = (keys) => keys.map((k) => ({ option_key: k }));
    const four = opts(['A', 'B', 'C', 'D']);
    assert(H.validAnswerKey({ correct_option_key: 'B' }, four) === 'B', 'valid');
    assert(H.validAnswerKey([{ correct_option_key: 'C' }], four) === 'C', 'embed array');
    const cases = [
      [null, four, 'NO_ANSWER'], [[], four, 'NO_ANSWER'], [[{ correct_option_key: 'A' }, { correct_option_key: 'B' }], four, 'MULTIPLE_ANSWERS'],
      [{ correct_option_key: 'E' }, four, 'KEY_INVALID'], [{ correct_option_key: 'B' }, opts(['A', 'B', 'C']), 'OPTION_COUNT'],
      [{ correct_option_key: 'B' }, opts(['A', 'B', 'C', 'D', 'A']), 'OPTION_COUNT'], [{ correct_option_key: 'B' }, opts(['A', 'B', 'B', 'D']), 'OPTION_KEYS'],
    ];
    for (const [a, o, want] of cases) assert(H.answerKeyProblem(a, o) === want, `${JSON.stringify(a)} → ${H.answerKeyProblem(a, o)} (want ${want})`);
    assert(H.validAnswerKey(null) === null && H.validAnswerKey({ correct_option_key: 'D' }) === 'D', 'display mode');
    assert(H.ANSWER_KEY_UNAVAILABLE === 'Answer key unavailable', 'notice text');
    return `${cases.length + 3} cases`;
  });

  await test('K-7s static: 087 functions + deferred constraint trigger, owner-only, LF; 088 fixed list + audit; rollbacks', async () => {
    const m87 = read(M87);
    for (const f of [M87, M88, RB87, RB88]) assert(!read(f).includes('\r'), `${f} has CR`);
    assert(/CREATE CONSTRAINT TRIGGER trg_qf_version_publishable\s+AFTER INSERT OR UPDATE OF lifecycle_status, is_current ON public\.question_versions\s+DEFERRABLE INITIALLY DEFERRED/.test(m87), 'deferred constraint trigger');
    assert(/WHEN \(NEW\.lifecycle_status = 'PUBLISHED' OR NEW\.is_current\)/.test(m87), 'trigger WHEN');
    for (const fn of ['fn_qf_version_key_problem(uuid)', 'fn_qf_version_is_servable(uuid)', 'fn_qf_assert_version_publishable(uuid)', 'fn_qf_version_publishable_trg()']) {
      assert(m87.includes(`REVOKE ALL ON FUNCTION public.${fn} FROM PUBLIC, anon, authenticated;`), `${fn} not owner-only`);
    }
    assert(!/GRANT EXECUTE/.test(m87), '087 grants EXECUTE');
    assert((m87.match(/AND public\.fn_qf_version_is_servable\(qv\.id\)/g) || []).length === 7, 'practice: 7 branches');
    assert((m87.match(/public\.fn_qf_version_is_servable\(sv\.id\)/g) || []).length === 4, 'battles: 4 pools');
    assert(/QF_INVALID_KEY_IN_TEST/.test(m87) && /QF_ARCHIVED_QUESTION_IN_TEST/.test(m87), 'mock assembly guard');
    assert((m87.match(/PERFORM public\.fn_qf_assert_version_publishable\(p_version_id\);/g) || []).length === 2, 'publish + approve asserts');
    assert(/QB_KEY1_PRECHECK_FAILED/.test(m87) && m87.includes(BAD_VERSION), '087 precondition');
    const rb87 = read(RB87);
    assert(/DROP TRIGGER trg_qf_version_publishable ON public\.question_versions;/.test(rb87) && (rb87.match(/CREATE OR REPLACE FUNCTION/g) || []).length === 7 && (rb87.match(/DROP FUNCTION/g) || []).length === 4, 'rollback 087');
    const m88 = read(M88);
    for (const id of FIXTURES) assert(m88.includes(`'${id}'`), `088 missing ${id}`);
    assert((m88.match(/'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'/g) || []).length === 8, '088: exactly 8 ids');
    assert(/QUESTION_ARCHIVE/.test(m88) && /QB-KEY-1: CA-4 test fixture retired/.test(m88) && /system:migration/.test(m88), '088 audit');
    assert(!/UPDATE public\.question_(versions|options|answers)|DELETE FROM/i.test(m88.replace(/--[^\n]*/g, '')), '088 touches versions / deletes');
    assert(/QUESTION_UNARCHIVE/.test(read(RB88)), 'rollback 088 audited');
    // CA-4 suite archived and never runnable from gates
    assert(!fs.existsSync(path.join(ROOT, 'scripts/test_ca4_forensic_suite.cjs')) && fs.existsSync(path.join(ROOT, 'scripts/archive/ca4/test_ca4_forensic_suite.cjs')), 'CA-4 suite not archived');
    assert(/^\/\/ ARCHIVED[\s\S]{0,400}process\.exit\(1\);/.test(read('scripts/archive/ca4/test_ca4_forensic_suite.cjs')), 'CA-4 suite has no refusal guard');
    assert(!/test_ca4_forensic_suite/.test(read('docs/testing/PERMANENT_GATES.md') + read('package.json')), 'CA-4 suite referenced by a gate');
    return 'static';
  });

  await test('K-11 grading: a keyless question is excluded from score + max, never incorrect / negative / vaulted', async () => {
    const vault = [];
    const awards = [];
    const mock = supaMock({
      test_attempts: { data: { id: 'att1', mock_test_id: 'mt1', user_id: 'u1', started_at: new Date(Date.now() - 600000).toISOString(), status: 'in_progress' }, error: null },
      mock_tests: { data: { id: 'mt1', total_questions: 3, total_marks: 6, mock_templates: { id: 't1', title: 'T', test_type: 'FULL_MOCK' } }, error: null },
      mock_sections: { data: [{ id: 's1', marks_per_question: 2, negative_mark: 0.5 }], error: null },
      mock_questions: { data: [
        { id: 'mq1', mock_section_id: 's1', question_version_id: 'v1', marks: 2, negative_mark: 0.5, question_versions: { id: 'v1', question_id: 'q1', question_answers: { correct_option_key: 'A' }, question_options: ['A', 'B', 'C', 'D'].map((k) => ({ id: `o1${k}`, option_key: k })) } },
        { id: 'mq2', mock_section_id: 's1', question_version_id: 'v2', marks: 2, negative_mark: 0.5, question_versions: { id: 'v2', question_id: 'q2', question_answers: { correct_option_key: 'C' }, question_options: ['A', 'B', 'C', 'D'].map((k) => ({ id: `o2${k}`, option_key: k })) } },
        { id: 'mq3', mock_section_id: 's1', question_version_id: 'v3', marks: 2, negative_mark: 0.5, question_versions: { id: 'v3', question_id: 'q3', question_answers: null, question_options: [] } },
      ], error: null },
      attempt_answers: { data: [
        { id: 'aa1', mock_question_id: 'mq1', selected_option_key: 'A', time_spent_seconds: 10 },
        { id: 'aa2', mock_question_id: 'mq2', selected_option_key: 'B', time_spent_seconds: 10 },
        { id: 'aa3', mock_question_id: 'mq3', selected_option_key: 'B', time_spent_seconds: 10 },
      ], error: null },
    });
    const stubs = {
      '@/lib/supabase/server': { createAdminServerSupabaseClient: () => mock, createServerSupabaseClient: async () => mock },
      'next/cache': { revalidatePath() {} },
      '@/services/mistake.service': { MistakeService: { recordExamMistakes: async (x) => { vault.push(...x.mistakes); return { success: true }; } } },
      '@/services/gamification.service': { GamificationService: new Proxy({}, { get: () => async (x) => { awards.push(x); return { success: true }; } }) },
      '@/services/premium-entitlement.service': { PremiumEntitlementService: new Proxy({}, { get: () => async () => ({}) }) },
      '@/services/content.service': { ContentService: new Proxy({}, { get: () => async () => new Map() }) },
    };
    const warn = console.warn;
    const warned = [];
    console.warn = (...a) => warned.push(a.join(' '));
    let r;
    try {
      const { AssessmentService } = loadTs('services/assessment.service.ts', stubs);
      r = await AssessmentService.submitTestAttempt('att1', 'u1');
    } finally { console.warn = warn; }
    assert(r && r.success, `submit failed: ${JSON.stringify(r)}`);
    const result = mock.writes.find((w) => w.table === 'test_results' && w.op === 'insert').payload;
    assert(result.max_score === 4 && result.total_questions === 2, `max ${result.max_score} / total ${result.total_questions} (want 4 / 2)`);
    assert(result.total_score === 1.5 && result.correct_count === 1 && result.incorrect_count === 1 && result.attempted_count === 2 && result.unanswered_count === 0, `score row ${JSON.stringify(result)}`);
    const graded = mock.writes.filter((w) => w.table === 'attempt_answers' && w.op === 'update').map((w) => w.payload);
    // 3 answers, only the 2 keyed questions are graded: the keyless answer gets no is_correct / evaluated_marks at all
    assert(graded.length === 2 && graded.filter((g) => g.is_correct === true && g.evaluated_marks === 2).length === 1 && graded.filter((g) => g.is_correct === false && g.evaluated_marks === -0.5).length === 1, `graded rows ${JSON.stringify(graded)}`);
    assert(vault.length === 1 && vault[0].questionId === 'q2', `vault ${JSON.stringify(vault)}`);
    const sec = mock.writes.find((w) => w.table === 'section_results').payload;
    assert(sec.total_questions === 2 && sec.max_section_score === 4, `section ${JSON.stringify(sec)}`);
    assert(warned.some((w) => /DATA_ERROR/.test(w) && /v3/.test(w) && !/@|u1/.test(w)), 'data error not logged (or contains user data)');
    return 'score 1.5 / max 4 (keyless excluded); vault 1; data error logged';
  });

  await test('K-12 UI: no fabricated default key anywhere; review card shows "Answer key unavailable"; all views null-safe', async () => {
    const hits = [];
    let scanned = 0;
    const walk = (dir) => {
      for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const rel = `${dir}/${e.name}`;
        if (e.isDirectory()) { if (!['node_modules', '.next', 'design-system'].includes(e.name)) walk(rel); continue; }
        if (!/\.(ts|tsx)$/.test(e.name)) continue;
        scanned++;
        const s = stripComments(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
        s.split('\n').forEach((l, i) => { if (/(\|\||\?\?)\s*["'][A-D]["']/.test(l)) hits.push(`${rel}:${i + 1}`); });
      }
    };
    ['app', 'services', 'components', 'lib'].forEach(walk);
    assert(scanned >= 300, `files scanned ${scanned} (min 300)`); // GATE-HYGIENE-1
    assert(hits.length === 0, `default key fallback: ${hits.join(', ')}`);
    for (const f of ['services/assessment.service.ts', 'services/live-test-result.service.ts', 'services/admin.service.ts', 'services/mistake.service.ts']) {
      assert(/validAnswerKey\(/.test(read(f)), `${f} does not use the shared helper`);
    }
    assert(/correctOption !== null && opt\.key === q\.correctOption/.test(read('components/live-test/live-test-result-client.tsx')) && /AnswerKeyUnavailableNotice/.test(read('components/live-test/live-test-result-client.tsx')), 'live-test view');
    assert(/correctOptionKey !== null && opt\.key === activeReport\.correctOptionKey/.test(read('components/admin/admin-question-reports-manager.tsx')) && /AnswerKeyUnavailableNotice/.test(read('components/admin/admin-question-reports-manager.tsx')), 'admin reports view');
    assert(/correctOptionKey !== null && opt\.key === mistake\.correctOptionKey/.test(read('app/mistakes/[id]/page.tsx')) && /AnswerKeyUnavailableNotice/.test(read('app/mistakes/[id]/page.tsx')), 'mistake view');
    assert(/setEditCorrectAnswer\(q\.correctOptionKey \?\? ""\)/.test(read('components/admin/admin-question-manager.tsx')), 'admin edit form default');
    assert(/useState\(detail\.correctKey \?\? ""\)/.test(read('components/admin/question-factory/review-queue-tab.tsx')), 'review form default');
    // render the mock review card
    const { renderToStaticMarkup } = require('react-dom/server');
    const stubs = {
      'next/link': { __esModule: true, default: ({ href, children, ...p }) => React.createElement('a', { href: String(href), ...p }, children) },
      // F2: the card's "Report this question" control (server action) is covered by scripts/test_f2_practice.cjs
      '@/components/practice/report-question-button': { ReportQuestionButton: () => null },
    };
    const { QuestionReviewCard } = loadTs('components/assessment/question-review-card.tsx', stubs);
    const base = { questionOrder: 1, sectionName: 'S', questionText: 'Q?', options: ['A', 'B', 'C', 'D'].map((k) => ({ key: k, text: `opt ${k}` })), selectedOption: 'B', isCorrect: false, marksAwarded: 0, explanation: null, topicName: null, topicSlug: null };
    const none = renderToStaticMarkup(React.createElement(QuestionReviewCard, { ...base, correctOption: null }));
    assert(none.includes('Answer key unavailable') && none.includes('Not scored'), 'notice / not-scored badge missing');
    assert(!/emerald/.test(none) && !/bg-red-50\/80/.test(none), 'an option is marked correct / wrong without a key');
    const keyed = renderToStaticMarkup(React.createElement(QuestionReviewCard, { ...base, correctOption: 'C' }));
    assert(!keyed.includes('Answer key unavailable') && /emerald/.test(keyed), 'valid key no longer marked');
    return 'no fallbacks; card + 5 views';
  });

  await test('K-13 admin archive action writes an audit row; an audit failure reverts the status', async () => {
    const run = async (auditError) => {
      const mock = supaMock({ errors: auditError ? { 'admin_audit_logs:insert': { code: 'XX000', message: 'audit down' } } : {} });
      const stubs = {
        '@/lib/supabase/server': { createAdminServerSupabaseClient: () => mock, createServerSupabaseClient: async () => mock },
        '@/lib/auth/require-admin': { guardAdminAction: async () => ({ ok: true, userId: 'admin-1', userEmail: 'qa-admin@courage-library.test', role: 'admin' }), dbFailure: (ctx) => ({ error: `db ${ctx}` }), sanitizeActionResult: (_, r) => r, actionFailure: (c, m) => ({ ok: false, error: c, message: m }) },
        'next/cache': { revalidatePath() {} },
      };
      const actions = loadTs('app/admin/actions.ts', stubs);
      const r = await actions.toggleQuestionStatusAction('q-1', 'published');
      return { r, writes: mock.writes };
    };
    const ok = await run(false);
    const audit = ok.writes.find((w) => w.table === 'admin_audit_logs');
    assert(ok.r.success && audit && audit.payload.action_type === 'QUESTION_ARCHIVE' && audit.payload.target_id === 'q-1' && audit.payload.actor_id === 'admin-1', `archive: ${JSON.stringify(ok)}`);
    assert(audit.payload.old_value.status === 'published' && audit.payload.new_value.status === 'archived', 'audit values');
    const bad = await run(true);
    const updates = bad.writes.filter((w) => w.table === 'questions' && w.op === 'update').map((w) => w.payload.status);
    assert(!bad.r.success && updates.join(',') === 'archived,published', `audit failure must revert: ${JSON.stringify(updates)}`);
    return 'audited; reverted on audit failure';
  });

  if (OFFLINE) { console.log('  SKIP  live K-1 … K-10, K-14 (--offline)'); return finish(); }

  // ---------------------------------------------------------------- live (rolled back)
  const { Client } = require('pg');
  const { dbTarget } = require('./db/_db-env.cjs');
  const c = new Client({ ...dbTarget().pg, port: 6543 });
  c.on('error', () => {});
  await c.connect();
  const q = async (s, p) => (await c.query(s, p)).rows;
  const ro = async (fn) => { await c.query('BEGIN READ ONLY'); try { return await fn(); } finally { await c.query('ROLLBACK'); } };
  const QID = '11111111-1111-4111-8111-00000000b087';
  const V1 = '22222222-2222-4222-8222-00000000b087';
  const V2 = '22222222-2222-4222-8222-00000000b088';
  let topic;
  let admin;
  try {
    ({ topic, admin } = await ro(async () => ({
      topic: (await q(`SELECT canonical_topic_id FROM public.questions WHERE status = 'published' AND id <> ALL($1) LIMIT 1`, [FIXTURES]))[0].canonical_topic_id,
      admin: (await q(`SELECT id FROM auth.users WHERE email = 'qa-admin@courage-library.test'`))[0].id,
    })));
    /** runs fn inside one transaction that is always rolled back; savepoint per probe */
    const rolledBack = async (fn) => {
      await c.query('BEGIN READ WRITE');
      try { await c.query(`SET LOCAL lock_timeout = '5s'`); await c.query(`SET LOCAL statement_timeout = '60s'`); return await fn(); } finally { await c.query('ROLLBACK'); }
    };
    const attempt = async (steps) => {
      await c.query('SAVEPOINT k');
      try { for (const s of steps) await c.query(s.sql || s, s.params || []); await c.query('SET CONSTRAINTS ALL IMMEDIATE'); await c.query('RELEASE SAVEPOINT k'); return null; }
      catch (e) { await c.query('ROLLBACK TO SAVEPOINT k'); return e; }
    };
    const draft = (vid, vn, opts, keys) => [
      ...(vn === 1 ? [{ sql: `INSERT INTO public.questions (id, canonical_topic_id, status) VALUES ($1, $2, 'draft')`, params: [QID, topic] }] : []),
      { sql: `INSERT INTO public.question_versions (id, question_id, version_number, question_text, difficulty, language, options_type, lifecycle_status, is_current) VALUES ($1, $2, $3, $4, 'easy', 'en', 'text', 'DRAFT', false)`, params: [vid, QID, vn, `QB-KEY-1 test stem v${vn}`] },
      ...opts.map((k, i) => ({ sql: `INSERT INTO public.question_options (question_version_id, option_key, option_text, order_index) VALUES ($1, $2, $3, $4)`, params: [vid, k, `test option ${k} ${i}`, i + 1] })),
      ...keys.map((k) => ({ sql: `INSERT INTO public.question_answers (question_version_id, correct_option_key, explanation_md) VALUES ($1, $2, 'test')`, params: [vid, k] })),
    ];
    const approve = (vid) => [`SELECT set_config('app.qf_lifecycle_write', 'on', true)`, { sql: `UPDATE public.question_versions SET lifecycle_status = 'APPROVED' WHERE id = $1`, params: [vid] }, `SELECT set_config('app.qf_lifecycle_write', 'off', true)`];
    const publishRpc = (vid) => [{ sql: `SELECT public.fn_publish_question_version($1, $2)`, params: [vid, admin] }];
    const publishSql = (vid) => [`SELECT set_config('app.qf_lifecycle_write', 'on', true)`, { sql: `UPDATE public.question_versions SET lifecycle_status = 'PUBLISHED', is_current = true, published_at = now() WHERE id = $1`, params: [vid] }];

    await test('K-1 valid 4-option version publishes through fn_publish_question_version; v2 supersedes v1', async () => rolledBack(async () => {
      let e = await attempt([...draft(V1, 1, ['A', 'B', 'C', 'D'], ['B']), ...approve(V1), ...publishRpc(V1)]);
      assert(!e, `v1 publish: ${e && e.message}`);
      e = await attempt([...draft(V2, 2, ['A', 'B', 'C', 'D'], ['D']), ...approve(V2), ...publishRpc(V2)]);
      assert(!e, `v2 publish: ${e && e.message}`);
      const v = await q(`SELECT id, lifecycle_status, is_current FROM public.question_versions WHERE question_id = $1 ORDER BY version_number`, [QID]);
      assert(v[0].lifecycle_status === 'SUPERSEDED' && !v[0].is_current && v[1].lifecycle_status === 'PUBLISHED' && v[1].is_current, JSON.stringify(v));
      return 'published; superseded';
    }));

    await test('K-2/3/4/8 invalid versions blocked via the publish RPC AND direct SQL (commit-time); valid allowed', async () => rolledBack(async () => {
      const matrix = [
        ['3 options', ['A', 'B', 'C'], ['B'], /QF_KEY_INVALID: OPTION_COUNT/],
        ['5 options', ['A', 'B', 'C', 'D', 'A'], ['B'], /uq_question_options_key|duplicate key|question_options_option_key_check/],
        ['no key', ['A', 'B', 'C', 'D'], [], /QF_KEY_INVALID: NO_ANSWER/],
        ['two keys', ['A', 'B', 'C', 'D'], ['A', 'B'], /question_answers_pkey|duplicate key/],
        ['key not in options', ['A', 'B', 'C'], ['D'], /QF_KEY_INVALID/],
      ];
      const out = [];
      for (const [name, opts, keys, re] of matrix) {
        for (const [pathName, publish] of [['publish RPC', (v) => [...approve(v), ...publishRpc(v)]], ['direct SQL', publishSql]]) {
          const e = await attempt([...draft(V1, 1, opts, keys), ...publish(V1)]);
          assert(e && re.test(e.message), `${name} via ${pathName}: ${e ? e.message.slice(0, 120) : 'ALLOWED'}`);
          out.push(`${name}/${pathName}`);
        }
      }
      for (const [pathName, publish] of [['publish RPC', (v) => [...approve(v), ...publishRpc(v)]], ['direct SQL', publishSql]]) {
        // an allowed publish is undone before the next path, so each path starts from the same empty state
        await c.query('SAVEPOINT valid');
        const e = await attempt([...draft(V1, 1, ['A', 'B', 'C', 'D'], ['C']), ...publish(V1)]);
        await c.query('ROLLBACK TO SAVEPOINT valid');
        assert(!e, `valid via ${pathName}: ${e && e.message}`);
      }
      // a direct INSERT that is already PUBLISHED / current with no children
      const e = await attempt([{ sql: `INSERT INTO public.questions (id, canonical_topic_id, status) VALUES ($1, $2, 'draft')`, params: [QID, topic] }, `SELECT set_config('app.qf_lifecycle_write', 'on', true)`,
        { sql: `INSERT INTO public.question_versions (id, question_id, version_number, question_text, difficulty, language, options_type, lifecycle_status, is_current, published_at) VALUES ($1, $2, 1, 'QB-KEY-1 direct insert', 'easy', 'en', 'text', 'PUBLISHED', true, now())`, params: [V1, QID] }]);
      assert(e && /QF_KEY_INVALID/.test(e.message), `direct published insert: ${e ? e.message : 'ALLOWED'}`);
      return `${out.length} blocked + direct insert blocked; valid allowed on both paths`;
    }));

    await test('K-5 approve (fn_transition_question_version → APPROVED, full checklist) refused without a valid key', async () => rolledBack(async () => {
      const checklist = { correct_key_verified: true, explanation_correct: true, no_ambiguity: true, topic_correct: true, difficulty_sensible: true, provenance_verified: true };
      const inReview = (v) => [`SELECT set_config('app.qf_lifecycle_write', 'on', true)`, { sql: `UPDATE public.question_versions SET lifecycle_status = 'IN_REVIEW' WHERE id = $1`, params: [v] }, `SELECT set_config('app.qf_lifecycle_write', 'off', true)`];
      const transition = (v) => [{ sql: `SELECT public.fn_transition_question_version($1, 'APPROVED', $2, NULL, $3::jsonb)`, params: [v, admin, JSON.stringify(checklist)] }];
      let e = await attempt([...draft(V1, 1, ['A', 'B', 'C', 'D'], []), ...inReview(V1), ...transition(V1)]);
      assert(e && /QF_KEY_INVALID: NO_ANSWER/.test(e.message), `keyless approve: ${e ? e.message : 'ALLOWED'}`);
      e = await attempt([...draft(V1, 1, ['A', 'B', 'C', 'D'], ['A']), ...inReview(V1), ...transition(V1)]);
      assert(!e, `valid approve: ${e && e.message}`);
      return 'keyless refused; valid approved';
    }));

    await test('K-6 existing data: 111 published versions servable; archiving / superseding not blocked', async () => rolledBack(async () => {
      const s = (await q(`SELECT count(*) FILTER (WHERE public.fn_qf_version_is_servable(id))::int ok, count(*)::int n FROM public.question_versions WHERE lifecycle_status = 'PUBLISHED'`))[0];
      assert(s.ok === 111 && s.n === 112, `servable ${s.ok}/${s.n}`);
      const e = await attempt([{ sql: `UPDATE public.questions SET status = 'archived' WHERE id = (SELECT q.id FROM public.questions q WHERE q.status = 'published' AND q.id <> ALL($1) LIMIT 1)`, params: [FIXTURES] }]);
      assert(!e, `archiving a valid question: ${e && e.message}`);
      return `${s.ok}/${s.n} servable (the 1 = the archived CA-4 fixture)`;
    }));

    await test('K-7 live grants: new functions owner-only; replaced functions keep their ACLs (P-9 shape)', async () => ro(async () => {
      const acl = Object.fromEntries((await q(`SELECT p.oid::regprocedure::text sig, coalesce(array_to_string(p.proacl, ','), 'NULL') acl, p.prosecdef s, p.proconfig::text cfg FROM pg_proc p
          WHERE p.pronamespace = 'public'::regnamespace AND p.proname IN ('fn_qf_version_key_problem','fn_qf_version_is_servable','fn_qf_assert_version_publishable','fn_qf_version_publishable_trg',
            'fn_publish_question_version','fn_transition_question_version','fn_qf_guard_mock_question_version','fn_generate_custom_practice_session','fn_generate_mistake_drill','fn_find_or_create_battle_room')`)).map((r) => [r.sig, r]));
      for (const n of ['fn_qf_version_key_problem(uuid)', 'fn_qf_version_is_servable(uuid)', 'fn_qf_assert_version_publishable(uuid)', 'fn_qf_version_publishable_trg()']) {
        const r = acl[n];
        assert(r && r.acl === 'postgres=X/postgres' && r.cfg === '{"search_path=\\"\\""}', `${n}: ${JSON.stringify(r)}`);
      }
      const want = {
        'fn_publish_question_version(uuid,uuid)': 'postgres=X/postgres,service_role=X/postgres',
        'fn_transition_question_version(uuid,text,uuid,text,jsonb)': 'postgres=X/postgres,service_role=X/postgres',
        'fn_qf_guard_mock_question_version()': 'postgres=X/postgres',
        // SECDEF-S2-2 (090): authenticated EXECUTE revoked (no app caller)
        'fn_generate_custom_practice_session(text,text,uuid[],integer,uuid[])': 'postgres=X/postgres,service_role=X/postgres',
        'fn_generate_mistake_drill(uuid[],uuid,text)': 'postgres=X/postgres,authenticated=X/postgres',
        'fn_find_or_create_battle_room(uuid,boolean)': 'postgres=X/postgres,service_role=X/postgres',
        'fn_find_or_create_battle_room(uuid,boolean,text)': 'postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres',
      };
      for (const [sig, a] of Object.entries(want)) assert(acl[sig] && acl[sig].acl === a, `${sig}: ${acl[sig] && acl[sig].acl} (want ${a})`);
      const anonExec = (await q(`SELECT count(*)::int n FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname LIKE 'fn_qf_%' AND has_function_privilege('anon', p.oid, 'EXECUTE')`))[0].n;
      assert(anonExec === 0, `${anonExec} fn_qf_* executable by anon`);
      const trg = (await q(`SELECT tgdeferrable d, tginitdeferred i FROM pg_trigger WHERE tgname = 'trg_qf_version_publishable'`))[0];
      assert(trg && trg.d && trg.i, 'constraint trigger not deferred');
      return '4 owner-only; 7 ACLs unchanged; deferred';
    }));

    // CONTENT-IMPORT-1 (2026-10-27): the baseline is the SET of versions that existed at 087 (the 113 created before
    // BASELINE_BEFORE), not "the whole table forever". Those rows (+ their options / answers) must stay byte-identical; a
    // new, separately-gated version is out of K-9's scope. Proven: the pre-import set hashes to the recorded baseline.
    await test('K-9 the pre-087 question_versions / options / answers (113 versions) are byte-identical to the baseline', async () => ro(async () => {
      const SET = `SELECT id FROM public.question_versions WHERE created_at < '${BASELINE_BEFORE}'`;
      const n = (await q(`SELECT count(*)::int n FROM public.question_versions WHERE created_at < '${BASELINE_BEFORE}'`))[0].n;
      const h = (await q(`SELECT
          left(md5(coalesce(string_agg(x::text, '|' ORDER BY x::text), '')), 12) v FROM public.question_versions x WHERE x.id IN (${SET})`))[0].v;
      const o = (await q(`SELECT left(md5(coalesce(string_agg(x::text, '|' ORDER BY x::text), '')), 12) v FROM public.question_options x WHERE x.question_version_id IN (${SET})`))[0].v;
      const a = (await q(`SELECT left(md5(coalesce(string_agg(x::text, '|' ORDER BY x::text), '')), 12) v FROM public.question_answers x WHERE x.question_version_id IN (${SET})`))[0].v;
      assert(n === BASELINE_VERSIONS, `${n} baseline versions (want ${BASELINE_VERSIONS})`);
      assert(h === BASELINE.question_versions && o === BASELINE.question_options && a === BASELINE.question_answers, `versions ${h} options ${o} answers ${a} vs ${JSON.stringify(BASELINE)}`);
      return `identical (${n} versions)`;
    }));

    await test('K-10 the 8 fixtures archived + 8 audit rows; not served by practice, battles, drills or mock assembly', async () => rolledBack(async () => {
      const st = (await q(`SELECT count(*) FILTER (WHERE status = 'archived')::int archived FROM public.questions WHERE id = ANY($1)`, [FIXTURES]))[0];
      assert(st.archived === 8, `${st.archived} archived`);
      const audit = (await q(`SELECT count(*)::int n FROM public.admin_audit_logs WHERE action_type = 'QUESTION_ARCHIVE' AND reason = 'QB-KEY-1: CA-4 test fixture retired' AND target_id = ANY($1::text[])`, [FIXTURES]))[0].n;
      assert(audit === 8, `${audit} audit rows`);
      // practice: manual selection of exactly the fixtures → nothing served. SECDEF-S2-2 (090): the RPC is no longer
      // client-callable (authenticated → 42501), so the selection is exercised as service_role with the same claims
      await c.query('SAVEPOINT pr');
      await c.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: '00000000-0000-4000-8000-0000000000a1', role: 'service_role', app_metadata: {} })]);
      await c.query('SET LOCAL ROLE service_role');
      const pr = (await q(`SELECT public.fn_generate_custom_practice_session('qb-key1', 'MANUAL_SELECTION', NULL, 10, $1::uuid[]) r`, [FIXTURES]))[0].r;
      await c.query('ROLLBACK TO SAVEPOINT pr');
      assert(!pr.success || !(pr.question_version_ids || []).length, `practice served fixtures: ${JSON.stringify(pr).slice(0, 200)}`);
      // battles' pool predicate (both overloads use it) and drills' predicate
      const pool = (await q(`SELECT count(*)::int n FROM public.questions WHERE id = ANY($1) AND status = 'published'
          AND EXISTS (SELECT 1 FROM public.question_versions sv WHERE sv.question_id = questions.id AND sv.is_current AND public.fn_qf_version_is_servable(sv.id))`, [FIXTURES]))[0].n;
      assert(pool === 0, `${pool} fixtures in the battle pool`);
      const drillDef = (await q(`SELECT prosrc FROM pg_proc WHERE oid = 'public.fn_generate_mistake_drill(uuid[],uuid,text)'::regprocedure`))[0].prosrc;
      assert(/q\.status = 'published'/.test(drillDef) && /fn_qf_version_is_servable\(qv\.id\)/.test(drillDef), 'drill predicate');
      // mock assembly: the keyless version and an archived valid-key fixture are both refused
      const e1 = await attempt([{ sql: `INSERT INTO public.mock_questions (mock_test_id, mock_section_id, question_version_id, question_order, marks, negative_mark) SELECT mq.mock_test_id, mq.mock_section_id, $1, 997, 1, 0 FROM public.mock_questions mq LIMIT 1`, params: [BAD_VERSION] }]);
      assert(e1 && /QF_INVALID_KEY_IN_TEST|QF_ARCHIVED_QUESTION_IN_TEST/.test(e1.message), `keyless into a mock: ${e1 ? e1.message : 'ALLOWED'}`);
      const e2 = await attempt([{ sql: `INSERT INTO public.mock_questions (mock_test_id, mock_section_id, question_version_id, question_order, marks, negative_mark) SELECT mq.mock_test_id, mq.mock_section_id, v.id, 996, 1, 0 FROM public.mock_questions mq, public.question_versions v WHERE v.question_id = $1 LIMIT 1`, params: [FIXTURES[0]] }]);
      assert(e2 && /QF_ARCHIVED_QUESTION_IN_TEST/.test(e2.message), `archived fixture into a mock: ${e2 ? e2.message : 'ALLOWED'}`);
      return '8 archived, 8 audit rows; practice 0, battle pool 0, drill predicate, mock guard ×2';
    }));

    // decision #54: the 4 helpers are SECURITY INVOKER with no client EXECUTE. Every client-role path reaches them only
    // through a SECURITY DEFINER caller, so they run as the owner and see all options / answers. Proven here as
    // qa-student (role authenticated + JWT claims, i.e. what PostgREST does), each probe in a rolled-back transaction.
    await test('K-14 #54 invoker safety: client-role paths as qa-student serve only valid-key questions and do not error', async () => {
      const student = (await ro(() => q(`SELECT id FROM auth.users WHERE email = 'qa-student@courage-library.test'`)))[0];
      assert(student, 'qa-student not found');
      const valid = (await ro(() => q(`SELECT q.id FROM public.questions q JOIN public.question_versions v ON v.question_id = q.id AND v.is_current
          WHERE q.status = 'published' AND public.fn_qf_version_is_servable(v.id) AND q.id <> ALL($1) ORDER BY q.id LIMIT 5`, [FIXTURES]))).map((r) => r.id);
      assert(valid.length >= 1, 'no servable published question to probe with'); // GATE-HYGIENE-1
      /** runs `call` as qa-student, then checks the served versions / questions as the owner; always rolled back */
      const asStudent = (call, served) => rolledBack(async () => {
        await c.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: student.id, role: 'authenticated' })]);
        await c.query('SET LOCAL ROLE authenticated');
        const out = (await c.query(call.sql, call.params || [])).rows[0].r;
        await c.query('RESET ROLE');
        return served ? { out, ...(await served(out)) } : { out };
      });
      const checkVersions = async (ids) => (await q(`SELECT count(*)::int n, count(*) FILTER (WHERE NOT public.fn_qf_version_is_servable(v.id) OR q.status <> 'published' OR q.id = ANY($2))::int bad
          FROM unnest($1::uuid[]) x(id) JOIN public.question_versions v ON v.id = x.id JOIN public.questions q ON q.id = v.question_id`, [ids, FIXTURES]))[0];
      const checkQuestions = async (ids) => (await q(`SELECT count(*)::int n, count(*) FILTER (WHERE q.status <> 'published' OR q.id = ANY($2) OR NOT EXISTS (SELECT 1 FROM public.question_versions v
          WHERE v.question_id = q.id AND v.is_current AND public.fn_qf_version_is_servable(v.id)))::int bad FROM unnest($1::uuid[]) x(id) JOIN public.questions q ON q.id = x.id`, [ids, FIXTURES]))[0];
      const out = [];
      // the helpers themselves are not callable by a client role (42501) — the definer path is the only way in
      const denied = await rolledBack(async () => {
        await c.query('SET LOCAL ROLE authenticated');
        try { await c.query('SELECT public.fn_qf_version_is_servable($1)', [BAD_VERSION]); return 'ALLOWED'; } catch (e) { return e.code; }
      });
      assert(denied === '42501', `direct helper call as authenticated: ${denied}`);
      out.push('helper direct 42501');
      // practice (SECDEF-S2-2, 090): the practice RPC is no longer client-callable — qa-student → 42501. The selection
      // logic (DEFINER RPC → INVOKER helper) is still exercised, as service_role with qa-student's claims.
      const practiceDenied = await rolledBack(async () => {
        await c.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: student.id, role: 'authenticated' })]);
        await c.query('SET LOCAL ROLE authenticated');
        try { await c.query(`SELECT public.fn_generate_custom_practice_session('QB-KEY-1 K-14', 'PYQ', '{}'::uuid[], 20, NULL)`); return 'ALLOWED'; } catch (e) { return e.code; }
      });
      assert(practiceDenied === '42501', `practice RPC as qa-student: ${practiceDenied} (want 42501 since 090)`);
      out.push('practice as qa-student 42501');
      const asPracticeService = (call, served) => rolledBack(async () => {
        await c.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: student.id, role: 'service_role' })]);
        await c.query('SET LOCAL ROLE service_role');
        const out = (await c.query(call.sql, call.params || [])).rows[0].r;
        await c.query('RESET ROLE');
        return served ? { out, ...(await served(out)) } : { out };
      });
      // practice: manual selection of 5 valid questions + all 8 fixtures → only the 5 valid ones are served.
      // p_topic_ids is '{}', not NULL: the RPC stores to_jsonb(p_topic_ids) in a NOT NULL column (pre-existing, unchanged by 087)
      const pr = await asPracticeService({ sql: `SELECT public.fn_generate_custom_practice_session('QB-KEY-1 K-14', 'MANUAL_SELECTION', '{}'::uuid[], 20, $1::uuid[]) r`, params: [[...valid, ...FIXTURES]] },
        async (r) => (r && r.success ? checkVersions(r.question_version_ids) : {}));
      assert(pr.out && pr.out.success && pr.n === valid.length && pr.bad === 0, `practice: ${JSON.stringify(pr).slice(0, 300)}`);
      out.push(`practice ${pr.n}/${valid.length} valid, 0 fixtures`);
      // practice: WEAK_TOPICS / FORGOTTEN_TOPICS fail with 42703 (columns confidence_level / last_evaluated_at do not exist).
      // Pre-existing and identical with 087 rolled back (QB-KEY-1 report §2a, backlog PRACTICE-RPC-DRIFT); asserted here
      // to stay exactly that — never a permission error, which would mean the invoker helper broke the path.
      for (const [mode, col] of [['WEAK_TOPICS', 'confidence_level'], ['FORGOTTEN_TOPICS', 'last_evaluated_at']]) {
        const err = await asPracticeService({ sql: `SELECT public.fn_generate_custom_practice_session('QB-KEY-1 K-14', $1, '{}'::uuid[], 20, NULL) r`, params: [mode] }).then(() => null, (e) => e);
        assert(err && err.code === '42703' && err.message.includes(col), `practice ${mode}: ${err ? err.code + ' ' + err.message.slice(0, 80) : 'no error (drift fixed? update K-14)'}`);
        out.push(`${mode} pre-existing 42703`);
      }
      // practice: the other modes must not error (a "no qualifying questions" business result is not an error)
      for (const mode of ['BOOKMARKED', 'PYQ', 'WRONG_QUESTIONS']) {
        const m = await asPracticeService({ sql: `SELECT public.fn_generate_custom_practice_session('QB-KEY-1 K-14', $1, '{}'::uuid[], 20, NULL) r`, params: [mode] },
          async (r) => (r && r.success ? checkVersions(r.question_version_ids) : { n: 0, bad: 0 }));
        assert(m.out && (m.out.success || /No qualifying/.test(m.out.error || '')) && m.bad === 0, `practice ${mode}: ${JSON.stringify(m).slice(0, 300)}`);
        if (!m.out.success) console.log(`  WARN  VACUOUS (0 items): K-14 practice ${mode} selected no question for qa-student`); // GATE-HYGIENE-1
        out.push(`${mode} ${m.out.success ? m.n : 'VACUOUS'}`);
      }
      // drill: generate from qa-student's own vault rows
      const vault = (await ro(() => q(`SELECT id FROM public.user_mistake_vault WHERE user_id = $1`, [student.id]))).map((r) => r.id);
      if (vault.length) {
        const d = await asStudent({ sql: `SELECT public.fn_generate_mistake_drill($1::uuid[], NULL, NULL) r`, params: [vault] },
          async (r) => (r && r.success ? checkVersions(r.questions.map((x) => x.question_version_id)) : {}));
        assert(d.out && (d.out.success ? d.bad === 0 && d.n === d.out.total_questions : d.out.code === 'NOTHING_TO_DRILL'), `drill: ${JSON.stringify(d).slice(0, 300)}`);
        out.push(`drill ${d.out.success ? d.n + ' valid' : d.out.code}`);
      } else { console.log('  WARN  VACUOUS (0 items): K-14 drill — qa-student has no vault rows (run ensure-student-fixture)'); out.push('drill VACUOUS'); } // GATE-HYGIENE-1
      // battle (feature flag off in the app; the RPC is still granted to authenticated): room questions all valid
      const b = await asStudent({ sql: `SELECT public.fn_find_or_create_battle_room(NULL, false, 'FREE') r` },
        async (r) => (r && r.success ? checkQuestions((await q(`SELECT question_ids FROM public.quiz_battle_rooms WHERE id = $1`, [r.room_id]))[0].question_ids) : {}));
      assert(b.out && b.out.success && b.n >= 3 && b.bad === 0, `battle: ${JSON.stringify(b).slice(0, 300)}`);
      out.push(`battle ${b.n} valid`);
      // mock start serves the mock's assembled questions: every assembled question is valid (the start itself: E2E journey)
      const mk = await ro(() => q(`SELECT count(*)::int n, count(*) FILTER (WHERE NOT public.fn_qf_version_is_servable(mq.question_version_id) OR q.status <> 'published')::int bad
          FROM public.mock_questions mq JOIN public.question_versions v ON v.id = mq.question_version_id JOIN public.questions q ON q.id = v.question_id`));
      assert(mk[0].n >= 1, 'no assembled mock question to check'); // GATE-HYGIENE-1
      assert(mk[0].bad === 0, `mock questions not servable: ${mk[0].bad}`);
      out.push(`mocks ${mk[0].n} assembled, 0 invalid`);
      return out.join('; ');
    });
  } finally {
    await c.end().catch(() => {});
  }
  finish();
})().catch((e) => { console.error('SUITE ERROR', String(e && e.message ? e.message : e).split('\n')[0].slice(0, 300)); process.exit(1); });

function finish() {
  console.log(`\nQB-KEY-1: ${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
}
