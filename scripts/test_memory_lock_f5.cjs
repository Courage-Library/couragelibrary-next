#!/usr/bin/env node
/**
 * F5 Memory Lock (decision #77). Offline gate (TS transpile + module mocks; no DB, no server). The SQL side applies the
 * SAME rules — proven before commit by a rolled-back behaviour smoke that drives this table through the real RPC.
 *   ML-01 scheduler table: every transition (added from a mistake / manually, correct along the ladder 1 → 3 → 7 → 14 →
 *         30, one step per IST day, wrong from every state → 1 day + lapse, locked rule)
 *   ML-02 exam-date cap (future / today / past exam) and the IST day boundary (18:29:59Z vs 18:30Z)
 *   ML-03 daily queue: due only, most overdue then most lapses, cap = daily minutes clamped 5..50 (unset 15), by topic
 *   ML-04 migration 095: EXTENDS the canonical vault (no new item / schedule table, the dormant SM-2 table untouched);
 *         one atomic SECDEF RPC (auth.uid(), key safety, idempotent per session × version BEFORE any write, rate limit,
 *         one step per day, exam cap, locked rule) + manual add; wrong answers from every source via ONE trigger;
 *         grants / allow-list; rollback; no BEGIN / COMMIT
 *   ML-05 actions: flag off → nothing; validated input; fixed codes; "Back in N days" from the server's due day
 *   ML-06 key never in the client payload (session loads text + options only); flag off → 404 / plain card / no button
 *   ML-07 Mistake Vault stays mistakes-only (manual items with 0 mistakes filtered out of lists, summaries, drills)
 * Run: node scripts/test_memory_lock_f5.cjs
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const sqlCode = (s) => s.replace(/--.*$/gm, '');
let passed = 0;
let failed = 0;
async function test(name, fn) {
  try {
    const info = await fn();
    passed++;
    console.log(`  PASS  ${name}${info ? ' — ' + info : ''}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL  ${name}\n        ${String(e && e.message ? e.message : e).slice(0, 1500)}`);
  }
}
const assert = (c, m) => {
  if (!c) throw new Error(m || 'assertion failed');
};
const eq = (a, b, m) => assert(JSON.stringify(a) === JSON.stringify(b), `${m || 'not equal'}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`);

const ts = require('typescript');
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request.startsWith('@/')) return origResolve.call(this, path.resolve(ROOT, request.slice(2)), parent, isMain, options);
  return origResolve.call(this, request, parent, isMain, options);
};
const transpile = (module, filename) => {
  const out = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } });
  module._compile(out.outputText, filename);
};
require.extensions['.ts'] = transpile;
require.extensions['.tsx'] = transpile;
let rpcReply = null;
const rpcCalls = [];
const MOCKS = {
  'server-only': {},
  '@/lib/supabase/server': { createServerSupabaseClient: async () => ({ rpc: async (fn, args) => (rpcCalls.push([fn, args]), rpcReply) }) },
  '@/lib/auth/session-state': { getSessionState: async () => ({ state: 'user', user: { id: 'u1' } }) },
};
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (Object.prototype.hasOwnProperty.call(MOCKS, request)) return MOCKS[request];
  return origLoad.call(this, request, parent, isMain);
};

const S = require(path.join(ROOT, 'lib/memory-lock/scheduler.ts'));
const D = '2026-10-25';
const day = (n) => S.addDays(D, n);
const MIG = 'supabase/migrations/20261025000095_f5_memory_lock.sql';

(async () => {
  await test('ML-01 scheduler transition table', () => {
    eq(S.addedFromMistake(D), { state: 'learning', intervalDays: 1, consecutiveCorrectDays: 0, lapses: 0, lastResult: 'wrong', lastAdvanceOn: null, dueOn: day(1) }, 'added from a mistake');
    eq(S.addedManually(D), { state: 'new', intervalDays: 0, consecutiveCorrectDays: 0, lapses: 0, lastResult: null, lastAdvanceOn: null, dueOn: D }, 'added manually');
    // ladder: one correct answer per day
    let it = S.addedFromMistake(D);
    const rows = [];
    for (let k = 1; k <= 6; k++) {
      it = S.applyCorrect(it, day(k));
      rows.push([it.intervalDays, it.state, it.consecutiveCorrectDays, it.dueOn === day(k + it.intervalDays)]);
    }
    eq(rows, [[3, 'review', 1, true], [7, 'locked', 2, true], [14, 'locked', 3, true], [30, 'locked', 4, true], [30, 'locked', 5, true], [30, 'locked', 6, true]], 'learning(1) → 3 → 7 (locked: 2 days, ≥ 7) → 14 → 30 → 30');
    let n = S.applyCorrect(S.addedManually(D), D);
    eq([n.intervalDays, n.state, n.dueOn], [1, 'review', day(1)], 'new → 1 day');
    // one step per IST calendar day
    const again = S.applyCorrect(n, D);
    eq([again.intervalDays, again.consecutiveCorrectDays, again.dueOn], [1, 1, day(1)], 'second correct the same day: no advance');
    // locked needs BOTH ≥ 2 days and interval ≥ 7
    eq(S.applyCorrect({ ...S.addedManually(D), intervalDays: 3, consecutiveCorrectDays: 1 }, D, day(4)).state, 'review', '2 days but capped interval 2 → not locked');
    // wrong from every state
    for (const st of ['new', 'learning', 'review', 'locked']) {
      const w = S.applyWrong({ state: st, intervalDays: 14, consecutiveCorrectDays: 3, lapses: 2, lastResult: 'correct', lastAdvanceOn: day(-1), dueOn: day(13) }, D);
      eq([w.state, w.intervalDays, w.consecutiveCorrectDays, w.lapses, w.lastResult, w.dueOn], ['learning', 1, 0, 3, 'wrong', day(1)], `wrong from ${st}`);
    }
    eq([S.nextLadderStep(0), S.nextLadderStep(1), S.nextLadderStep(2), S.nextLadderStep(3), S.nextLadderStep(7), S.nextLadderStep(14), S.nextLadderStep(30)], [1, 3, 3, 7, 14, 30, 30], 'ladder steps (= SQL fn_ml_next_step)');
    return '6-step ladder · same-day · wrong ×4 states';
  });

  await test('ML-02 exam-date cap and IST day boundary', () => {
    eq([S.examCap(D, day(10)), S.examCap(D, day(5)), S.examCap(D, day(1)), S.examCap(D, D), S.examCap(D, day(-1)), S.examCap(D, null)], [5, 2, 1, 1, null, null], 'cap = max(1, floor(days/2)); past / unset → none');
    const capped = S.applyCorrect({ ...S.addedManually(D), intervalDays: 7, consecutiveCorrectDays: 2 }, D, day(9));
    eq([capped.intervalDays, capped.dueOn, capped.state], [4, day(4), 'review'], '14 capped to 4 (exam in 9 days); not locked (< 7)');
    eq([S.istDay('2026-10-25T18:29:59Z'), S.istDay('2026-10-25T18:30:00Z'), S.istDay('2026-10-24T18:30:00Z')], ['2026-10-25', '2026-10-26', '2026-10-25'], 'IST midnight = 18:30 UTC');
    eq(S.istDayStart('2026-10-26').toISOString(), '2026-10-25T18:30:00.000Z', 'due_at = IST midnight');
    eq([S.backInLabel(D, D), S.backInLabel(D, day(1)), S.backInLabel(D, day(3))], ['Back today', 'Back tomorrow', 'Back in 3 days'], 'after-answer label');
  });

  await test('ML-03 daily queue: due only, overdue then lapses, capped, grouped by topic', () => {
    eq([S.queueCap(null), S.queueCap(3), S.queueCap(20), S.queueCap(80), S.queueCap(0)], [15, 5, 20, 50, 15], 'cap from daily minutes, clamped 5..50');
    const it = (id, t, due, lapses) => ({ questionId: id, topicId: t, topicName: t ? `Topic ${t}` : null, dueOn: due, lapses });
    const items = [it('q1', 'a', day(-1), 0), it('q2', 'b', day(-3), 0), it('q3', 'a', day(-1), 2), it('q4', 'b', day(1), 9), it('q5', null, D, 0), it('q6', 'a', day(-3), 1)];
    const r = S.buildQueue(items, D, 4);
    eq(r.groups.map((g) => [g.topicId, g.items.map((x) => x.questionId)]), [['a', ['q6', 'q3', 'q1']], ['b', ['q2']]], 'order: overdue 3 (lapses 1 > 0), then overdue 1 (lapses 2 > 0); cap 4; grouped');
    eq([r.total, r.dueTotal], [4, 5], 'q4 not due; q5 due but beyond the cap');
    eq(S.lockMeter(['locked', 'review', 'locked', 'new']), { locked: 2, total: 4, pct: 50 }, 'lock meter');
    eq(S.upcoming7([day(1), day(1), day(7), day(8), D], D).map((x) => x.count), [2, 0, 0, 0, 0, 0, 1], 'next 7 days (today excluded)');
  });

  await test('ML-04 migration 095: extends the canonical vault; atomic RPC; one trigger; grants; rollback', () => {
    const m = sqlCode(read(MIG));
    assert(!/^\s*(BEGIN|COMMIT)\s*;/im.test(m), 'top-level BEGIN / COMMIT');
    assert(/ALTER TABLE public\.user_mistake_vault\s+ADD COLUMN IF NOT EXISTS ml_source/.test(m) && !/CREATE TABLE/i.test(m) && !/spaced_repetition_schedules/.test(m), 'no new item / schedule store; dormant SM-2 table untouched');
    const fn = m.slice(m.indexOf('CREATE OR REPLACE FUNCTION public.fn_memory_lock_answer'), m.indexOf('REVOKE ALL ON FUNCTION public.fn_memory_lock_answer'));
    assert(/SECURITY DEFINER\s+SET search_path = ''/.test(fn) && /v_uid\s+uuid := auth\.uid\(\);/.test(fn) && !/p_user_id/.test(fn), "SECDEF '' + auth.uid() only");
    assert(/fn_qf_version_is_servable\(p_question_version_id\)/.test(fn) && /lifecycle_status = 'PUBLISHED' AND v\.is_current AND q\.status = 'published'/.test(fn), 'key safety: published, current, servable');
    const idem = fn.indexOf("'idempotent', true");
    const firstWrite = Math.min(...['INSERT INTO public.practice_answers', 'UPDATE public.user_mistake_vault', 'fn_record_mistake_occurrence('].map((s) => fn.indexOf(s)).filter((i) => i > 0));
    assert(idem > 0 && idem < firstWrite && /pg_advisory_xact_lock/.test(fn.slice(0, idem)), 'idempotent replay returns BEFORE any write, under the user lock (no double advance)');
    assert(/>= 30/.test(fn) && />= 1500/.test(fn), 'shares the practice rate limit');
    assert(/IF v_item\.ml_last_advance_on IS DISTINCT FROM v_today THEN/.test(fn) && /GREATEST\(1, \(v_exam - v_today\) \/ 2\)/.test(fn) && /WHEN v_days >= 2 AND v_interval >= 7 THEN 'locked'/.test(fn), 'one step per day · exam cap · locked rule');
    assert(/'NOT_IN_MEMORY_LOCK'/.test(fn) && fn.indexOf("'NOT_IN_MEMORY_LOCK'") < fn.indexOf('SELECT a.correct_option_key'), 'no key for questions outside the caller’s Memory Lock');
    const trg = m.slice(m.indexOf('CREATE OR REPLACE FUNCTION public.fn_ml_vault_schedule'), m.indexOf('CREATE TRIGGER trg_umv_ml_schedule'));
    assert(!/SECURITY DEFINER/.test(trg) && /NEW\.total_mistakes_count > OLD\.total_mistakes_count/.test(trg) && /NEW\.consecutive_correct_in_remediation = 0/.test(trg) && /NEW\.ml_lapses := OLD\.ml_lapses \+ 1/.test(trg), 'one trigger moves the schedule on any wrong answer (canonical writer, mock service path, drills)');
    for (const f of ['fn_memory_lock_answer(uuid, text, integer, uuid)', 'fn_memory_lock_add(uuid)']) assert(m.includes(`REVOKE ALL ON FUNCTION public.${f} FROM PUBLIC, anon;`) && m.includes(`GRANT EXECUTE ON FUNCTION public.${f} TO authenticated;`), `grants ${f}`);
    for (const f of ['fn_ml_vault_schedule()', 'fn_ml_ist_today()', 'fn_ml_next_step(integer)']) assert(m.includes(`REVOKE ALL ON FUNCTION public.${f} FROM PUBLIC, anon, authenticated;`), `helper not client-executable: ${f}`);
    const allow = JSON.parse(read('scripts/secdef/allowlist.json')).functions;
    assert(allow['fn_memory_lock_answer(p_question_version_id uuid, p_selected_option_key text, p_time_taken_ms integer, p_session_id uuid)']?.class === 'A' && allow['fn_memory_lock_add(p_question_id uuid)']?.class === 'A', 'allow-list');
    const rb = read('docs/database/rollback/095_rollback.sql');
    assert(/DROP COLUMN IF EXISTS ml_due_at/.test(rb) && /DROP TRIGGER IF EXISTS trg_umv_ml_schedule/.test(rb) && /total_mistakes_count >= 1\)/.test(rb), 'rollback');
  });

  await test('ML-05 actions: flag off → nothing; validated; fixed codes; "Back in N days"', async () => {
    const A = require(path.join(ROOT, 'app/memory-lock/actions.ts'));
    const ok = { versionId: '11111111-2222-4333-8444-555555555555', selected: 'B', timeMs: 4000, sessionId: '11111111-2222-4333-8444-666666666666' };
    delete process.env.MEMORY_LOCK_ENABLED;
    eq(await A.checkMemoryLockAnswerAction(ok), { ok: false, code: 'FAILED' }, 'flag off');
    eq(await A.addToMemoryLockAction({ questionId: ok.versionId }), 'FAILED', 'flag off add');
    assert(rpcCalls.length === 0, 'no RPC while off');
    process.env.MEMORY_LOCK_ENABLED = 'true';
    eq(await A.checkMemoryLockAnswerAction({ ...ok, selected: 'E' }), { ok: false, code: 'FAILED' }, 'bad option');
    eq(await A.checkMemoryLockAnswerAction({ ...ok, sessionId: 'x' }), { ok: false, code: 'FAILED' }, 'bad session id');
    const { istDay, addDays } = S;
    rpcReply = { data: { success: true, code: 'CHECKED', is_correct: true, correct_option_key: 'B', explanation_md: ' ', due_on: addDays(istDay(new Date()), 3), interval_days: 3, state: 'review' }, error: null };
    const r = await A.checkMemoryLockAnswerAction(ok);
    eq(r, { ok: true, isCorrect: true, correctKey: 'B', explanation: null, savedToMistakes: false, backIn: 'Back in 3 days' }, 'mapped result');
    eq(rpcCalls.at(-1), ['fn_memory_lock_answer', { p_question_version_id: ok.versionId, p_selected_option_key: 'B', p_time_taken_ms: 4000, p_session_id: ok.sessionId }], 'RPC args');
    rpcReply = { data: { success: false, code: 'NOT_IN_MEMORY_LOCK' }, error: null };
    eq(await A.checkMemoryLockAnswerAction(ok), { ok: false, code: 'NOT_IN_MEMORY_LOCK' }, 'fixed code');
    rpcReply = { data: { success: false, code: 'SQL said something' }, error: null };
    eq(await A.checkMemoryLockAnswerAction(ok), { ok: false, code: 'FAILED' }, 'unknown → FAILED (no DB text)');
    rpcReply = { data: { success: true, code: 'ADDED' }, error: null };
    eq(await A.addToMemoryLockAction({ questionId: ok.versionId }), 'ADDED', 'add');
    delete process.env.MEMORY_LOCK_ENABLED;
  });

  await test('ML-06 key never in the payload; flag off → 404 / plain card / no button', () => {
    const sess = code(read('app/memory-lock/session/page.tsx'));
    assert(/loadPracticeQuestions\(supabase, ids, language\)/.test(sess) && !/question_answers|correct_option_key|explanation/.test(sess), 'session sends text + options only');
    const ps = code(read('lib/practice/server.ts'));
    const load = ps.slice(ps.indexOf('export async function loadPracticeQuestions'), ps.indexOf('export async function topicArticles'));
    assert(!/question_answers|correct_option_key|explanation/.test(load), 'loader never selects keys / explanations');
    for (const f of ['app/memory-lock/page.tsx', 'app/memory-lock/session/page.tsx']) assert(/if \(!isMemoryLockEnabled\(\)\) notFound\(\);/.test(code(read(f))), `${f}: flag off → 404`);
    const page = code(read('app/memory-lock/page.tsx'));
    assert((page.match(/variant="accent-on-light"/g) || []).length === 1 && /data-memory-lock-start=""/.test(page), 'overview: ONE primary ("Start")');
    assert(!/streak|hurry|don['’]t lose|miss out/i.test(code(read('content/memory-lock.ts'))), 'no streak shaming / fake urgency (R11)');
    assert(/canAddToMemoryLock=\{isMemoryLockEnabled\(\)\}/.test(code(read('app/practice/session/page.tsx'))) && /memoryLockEnabled: isMemoryLockEnabled\(\)/.test(code(read('services/assessment.service.ts'))), 'add button only with the flag');
    const runner = code(read('components/practice/practice-runner.tsx'));
    assert(/props\.canAddToMemoryLock && !props\.memoryLock && result && <AddToMemoryLockButton/.test(runner) && /data-memory-lock-back-in=""/.test(runner), 'runner: add after an answer (practice), "Back in N days" (Memory Lock)');
  });

  await test('ML-07 Mistake Vault stays mistakes-only', () => {
    const ms = code(read('services/mistake.service.ts'));
    assert((ms.match(/\.gte\("total_mistakes_count", 1\)/g) || []).length >= 4, 'lists / summary / drills filter manual items');
    assert(/\.gte\("total_mistakes_count", 1\)/.test(code(read('lib/exams/exam-page-server.ts'))), 'exam page mistake count');
  });

  console.log(`\nF5 Memory Lock: ${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
})();
