#!/usr/bin/env node
/**
 * EXAM-FINALIZE-1 — offline gate. Runs the REAL AssessmentService.submitTestAttempt / finalizeExpiredAttempts against
 * an in-memory service-role mock (UNIQUE test_results.attempt_id enforced; async steps interleave) — no network, no DB.
 *   E-01 pure rules: deadline = started_at + duration; abandon only when a SUBMITTED attempt of the same mock started
 *        LATER; finalize otherwise; nothing before the deadline
 *   E-02 finalize: submitted_at = the server deadline (not now); scores equal a normal submit of the same answers
 *   E-03 idempotent: a second finalize finds nothing; exactly one result row
 *   E-04 concurrency: two finalizes at once → one test_results row, one set of section rows, the same result id
 *   E-05 superseded → "abandoned": never scored (no result row), not shown as done / resumable (status rules)
 *   E-06 wiring: finalize-on-read in player / result / mock list / exam page / instructions; ONE scoring path; the
 *        daily cron route fails closed without CRON_SECRET and returns counts only; vercel.json daily schedule
 *   E-08 expired with ZERO saved answers → abandoned (architect rule); ≥ 1 saved answer → finalized
 *   E-07 flag OFF (EXAM_FINALIZE_ENABLED unset, the default): finalize-on-read and the sweep change nothing
 * Run: node scripts/test_exam_finalize1.cjs
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
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

// ---------------------------------------------------------------- in-memory service-role DB
const tick = () => new Promise((r) => setImmediate(r));
let DB;
let seq = 0;
const newId = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;
function makeDb() {
  const t = { test_attempts: [], mock_tests: [], mock_sections: [], mock_questions: [], attempt_answers: [], test_results: [], section_results: [] };
  const builder = (table) => {
    const f = [];
    let op = 'select';
    let payload = null;
    let single = false;
    let maybe = false;
    let lim = null;
    let countOnly = false;
    const rows = () => t[table].filter((r) => f.every((p) => p(r)));
    const exec = async () => {
      await tick();
      if (op === 'insert') {
        const list = Array.isArray(payload) ? payload : [payload];
        // like Postgres, the UNIQUE check and the insert are ONE atomic step (no await between them)
        if (table === 'test_results' && list.some((p) => t.test_results.some((r) => r.attempt_id === p.attempt_id))) return { data: null, error: { code: '23505', message: 'duplicate key' } };
        const made = list.map((p) => ({ id: newId(), ...p }));
        t[table].push(...made);
        await tick();
        return { data: single || maybe ? made[0] : made, error: null };
      }
      if (op === 'update') {
        const hit = rows();
        hit.forEach((r) => Object.assign(r, payload));
        return { data: hit, error: null };
      }
      let out = rows();
      if (countOnly) return { data: null, count: out.length, error: null };
      if (lim !== null) out = out.slice(0, lim);
      if (single) return out.length === 1 ? { data: out[0], error: null } : { data: null, error: { message: 'single' } };
      if (maybe) return { data: out[0] ?? null, error: null };
      return { data: out, error: null };
    };
    const b = {
      select(_c, o) { if (o && o.count) countOnly = true; return b; },
      not(k, op, v) { f.push((r) => (op === 'is' ? (r[k] ?? null) !== v : true)); return b; },
      insert(p) { op = 'insert'; payload = p; return b; },
      update(p) { op = 'update'; payload = p; return b; },
      eq(k, v) { f.push((r) => r[k] === v); return b; },
      is(k, v) { f.push((r) => (r[k] ?? null) === v); return b; },
      in(k, v) { f.push((r) => v.includes(r[k])); return b; },
      order() { return b; },
      limit(n) { lim = n; return b; },
      single() { single = true; return b; },
      maybeSingle() { maybe = true; return b; },
      then(res, rej) { return exec().then(res, rej); },
    };
    return b;
  };
  return { t, from: (table) => builder(table) };
}

// ---------------------------------------------------------------- module loading (real service, stubbed side systems)
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
const sideEffects = { mistakes: 0, rewards: 0 };
const MOCKS = {
  'server-only': {},
  'next/cache': { revalidatePath() {} },
  '@/lib/supabase/server': { createAdminServerSupabaseClient: () => DB, createServerSupabaseClient: async () => { throw new Error('no request scope'); } },
  '@/services/gamification.service': { GamificationService: { awardMockCompletionReward: async () => { sideEffects.rewards++; } } },
  '@/services/mistake.service': { MistakeService: { recordExamMistakes: async () => { sideEffects.mistakes++; return { success: true }; } } },
  '@/services/premium-entitlement.service': { PremiumEntitlementService: {} },
  '@/services/content.service': { ContentService: {} },
};
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (Object.prototype.hasOwnProperty.call(MOCKS, request)) return MOCKS[request];
  return origLoad.call(this, request, parent, isMain);
};
const { AssessmentService } = require(path.join(ROOT, 'services/assessment.service.ts'));
const F = require(path.join(ROOT, 'lib/assessment/finalize.ts'));

// a 2-section mock: 4 questions, +2 / −0.5; answers: Q1 correct, Q2 wrong, Q3 correct, Q4 unanswered
const DURATION = 60;
function seedMock() {
  const mockId = newId();
  const secA = newId();
  const secB = newId();
  DB.t.mock_tests.push({ id: mockId, total_questions: 4, total_marks: 8, duration_minutes: DURATION, mock_templates: { id: 't', title: 'T', test_type: 'full_length' } });
  DB.t.mock_sections.push({ id: secA, mock_test_id: mockId, marks_per_question: 2, negative_mark: 0.5 }, { id: secB, mock_test_id: mockId, marks_per_question: 2, negative_mark: 0.5 });
  const qs = [secA, secA, secB, secB].map((sec, i) => {
    const id = newId();
    const opts = ['A', 'B', 'C', 'D'].map((k) => ({ id: `${id}-${k}`, option_key: k }));
    DB.t.mock_questions.push({ id, mock_test_id: mockId, mock_section_id: sec, question_version_id: `v${i}`, marks: 2, negative_mark: 0.5, question_versions: { id: `v${i}`, question_id: `q${i}`, question_answers: [{ correct_option_key: 'B' }], question_options: opts } });
    return id;
  });
  return { mockId, qs, sections: [secA, secB] };
}
function seedAttempt(m, { userId = 'u1', startedAt, status = 'in_progress', submittedAt = null, answers = ['B', 'C', 'B', null] }) {
  const id = newId();
  DB.t.test_attempts.push({ id, user_id: userId, mock_test_id: m.mockId, status, started_at: startedAt, submitted_at: submittedAt, time_taken_seconds: 0, mock_tests: { duration_minutes: DURATION } });
  answers.forEach((k, i) => DB.t.attempt_answers.push({ id: newId(), attempt_id: id, mock_question_id: m.qs[i], selected_option_key: k, time_spent_seconds: 30 }));
  return id;
}
const hoursAgo = (h) => new Date(Date.now() - h * 3600e3).toISOString();
const SCORE_FIELDS = ['total_questions', 'attempted_count', 'correct_count', 'incorrect_count', 'unanswered_count', 'total_score', 'max_score', 'accuracy_percentage'];

(async () => {
  console.log('EXAM-FINALIZE-1');
  process.env.EXAM_FINALIZE_ENABLED = 'true';

  await test('E-01 pure rules: deadline, past-deadline, abandon only when a submitted attempt started later', () => {
    const s = '2026-10-01T10:00:00.000Z';
    assert(F.attemptDeadline(s, 60).toISOString() === '2026-10-01T11:00:00.000Z', 'deadline');
    assert(!F.isPastDeadline(s, 60, new Date('2026-10-01T11:00:00.000Z')) && F.isPastDeadline(s, 60, new Date('2026-10-01T11:00:01.000Z')), 'strictly after the deadline');
    const a = { id: 'a', userId: 'u', mockTestId: 'm', status: 'in_progress', startedAt: s, submittedAt: null };
    const now = new Date('2026-10-02T00:00:00Z');
    const later = { id: 'b', userId: 'u', mockTestId: 'm', status: 'submitted', startedAt: '2026-10-01T12:00:00Z', submittedAt: '2026-10-01T13:00:00Z' };
    const earlier = { ...later, id: 'c', startedAt: '2026-10-01T08:00:00Z' };
    assert(F.staleOutcome(a, 60, [later], now) === 'abandon', 'superseded by a later submitted attempt');
    assert(F.staleOutcome(a, 60, [earlier], now) === 'finalize', 'an EARLIER submitted attempt does not supersede');
    assert(F.staleOutcome(a, 60, [{ ...later, userId: 'other' }], now) === 'finalize' && F.staleOutcome(a, 60, [{ ...later, mockTestId: 'x' }], now) === 'finalize', 'other user / other mock never supersede');
    assert(F.staleOutcome(a, 60, [], new Date('2026-10-01T10:30:00Z')) === 'active', 'before the deadline: untouched');
    assert(F.staleOutcome({ ...a, status: 'submitted' }, 60, [], now) === 'none', 'only in-progress attempts');
    assert(F.staleOutcome(a, 60, [], now, 0) === 'abandon' && F.staleOutcome(a, 60, [], now, 1) === 'finalize', 'zero saved answers → abandon; ≥ 1 → finalize');
    return 'deadline + supersede rule';
  });

  await test('E-02 finalize: submitted_at = deadline (not now); scores equal a normal submit of the same answers', async () => {
    DB = makeDb();
    const m = seedMock();
    const live = seedAttempt(m, { startedAt: new Date(Date.now() - 10 * 60e3).toISOString() });
    const stale = seedAttempt(m, { userId: 'u2', startedAt: hoursAgo(30) });
    const normal = await AssessmentService.submitTestAttempt(live, 'u1');
    assert(normal.success, `normal submit: ${normal.error}`);
    const counts = await AssessmentService.finalizeExpiredAttempts({ limit: 50 });
    assert(counts.finalized === 1 && counts.abandoned === 0 && counts.failed === 0, JSON.stringify(counts));
    const rN = DB.t.test_results.find((r) => r.attempt_id === live);
    const rF = DB.t.test_results.find((r) => r.attempt_id === stale);
    for (const k of SCORE_FIELDS) assert(rN[k] === rF[k], `${k}: normal ${rN[k]} vs finalized ${rF[k]}`);
    assert(rF.total_score === 3.5 && rF.correct_count === 2 && rF.incorrect_count === 1 && rF.unanswered_count === 1, `score ${rF.total_score}`);
    const a = DB.t.test_attempts.find((x) => x.id === stale);
    const deadline = F.attemptDeadline(a.started_at, DURATION).toISOString();
    assert(a.status === 'submitted' && a.submitted_at === deadline, `submitted_at ${a.submitted_at} vs deadline ${deadline}`);
    assert(a.time_taken_seconds === DURATION * 60, `time ${a.time_taken_seconds}`);
    return `score 3.5 both · submitted_at = deadline`;
  });

  await test('E-03 idempotent: a second finalize finds nothing; exactly one result row', async () => {
    const before = DB.t.test_results.length;
    const again = await AssessmentService.finalizeExpiredAttempts({ limit: 50 });
    assert(again.finalized === 0 && again.abandoned === 0 && again.failed === 0, JSON.stringify(again));
    assert(DB.t.test_results.length === before, 'a second result row');
    const resubmit = await AssessmentService.submitTestAttempt(DB.t.test_results[1].attempt_id, 'u2');
    assert(resubmit.success && resubmit.resultId === DB.t.test_results[1].id, 'resubmit returns the existing result');
    return 'no-op on repeat';
  });

  await test('E-04 concurrency: two finalizes at once → one result, one set of section rows, the same id', async () => {
    DB = makeDb();
    const m = seedMock();
    const stale = seedAttempt(m, { startedAt: hoursAgo(5) });
    const deadline = F.attemptDeadline(DB.t.test_attempts[0].started_at, DURATION).toISOString();
    const [a, b] = await Promise.all([AssessmentService.submitTestAttempt(stale, 'u1', { submittedAt: deadline }), AssessmentService.submitTestAttempt(stale, 'u1', { submittedAt: deadline })]);
    assert(a.success && b.success && a.resultId === b.resultId, `${JSON.stringify(a)} / ${JSON.stringify(b)}`);
    assert(DB.t.test_results.filter((r) => r.attempt_id === stale).length === 1, 'two result rows');
    assert(DB.t.section_results.length === m.sections.length, `section rows ${DB.t.section_results.length}`);
    const [c, d] = await Promise.all([AssessmentService.finalizeExpiredAttempts({}), AssessmentService.finalizeExpiredAttempts({})]);
    assert(c.finalized + d.finalized === 0, 'already finalized');
    return 'UNIQUE(attempt_id) race → one result';
  });

  await test('E-05 superseded → abandoned: never scored, not shown as done or resumable', async () => {
    DB = makeDb();
    const m = seedMock();
    const old = seedAttempt(m, { startedAt: hoursAgo(48) });
    const newer = seedAttempt(m, { startedAt: hoursAgo(24), status: 'submitted', submittedAt: hoursAgo(23) });
    const counts = await AssessmentService.finalizeExpiredAttempts({ userId: 'u1' });
    assert(counts.abandoned === 1 && counts.finalized === 0, JSON.stringify(counts));
    assert(DB.t.test_attempts.find((x) => x.id === old).status === 'abandoned' && !DB.t.test_results.some((r) => r.attempt_id === old), 'abandoned without a result');
    assert(sideEffects.rewards >= 0, '');
    // shown nowhere as done / in progress (F1 exam page status rules; mock dashboard counts submitted / completed / evaluated only)
    const { mockStatuses } = require(path.join(ROOT, 'lib/exams/exam-page.ts'));
    const st = mockStatuses([{ id: m.mockId, title: 'M', testType: null, questions: 4, minutes: 60, totalMarks: 8, isFree: true }], [{ id: old, mockTestId: m.mockId, status: 'abandoned', submittedAt: null, startedAt: hoursAgo(48), score: null, maxScore: null }]);
    assert(st.get(m.mockId).state === 'not-started', `abandoned shown as ${st.get(m.mockId).state}`);
    const svc = code(read('services/assessment.service.ts'));
    assert(!/status === "abandoned"[^\n]*completed|"abandoned"\]\.includes/.test(svc), 'an analytics path counts abandoned attempts');
    void newer;
    return 'abandoned · unscored · hidden';
  });

  await test('E-06 wiring: finalize-on-read everywhere, one scoring path, fail-closed daily cron, counts only', async () => {
    const svc = code(read('services/assessment.service.ts'));
    assert((svc.match(/\.from\("test_results"\)\s*\.insert\(/g) || []).length === 1, 'exactly one scoring / result insert path');
    assert(/remainingSeconds <= 0\) \{\s*if \(isFinalizeEnabled\(\)\) await AssessmentService\.finalizeExpiredAttempts\(\{ userId: attempt\.user_id, limit: 20 \}\);\s*else await AssessmentService\.submitTestAttempt\(attempt\.id, attempt\.user_id, \{ submittedAt: new Date\(startTimeMs \+ totalAllowedSeconds \* 1000\)\.toISOString\(\) \}\);/.test(svc), 'player (startOrResumeAttempt): flag on → finalizer; off → the opened attempt only, at its deadline');
    assert(/if \(user\?\.id\) await AssessmentService\.finalizeExpiredAttempts\(\{ userId: user\.id, limit: 20 \}\);/.test(svc), 'result page (getTestResult)');
    assert(/if \(resolvedUserId\) await AssessmentService\.finalizeExpiredAttempts\(\{ userId: resolvedUserId, limit: 20 \}\);/.test(svc), 'mock list (dashboard data)');
    assert(/await AssessmentService\.finalizeExpiredAttempts\(\{ userId: uid, limit: 20 \}\);/.test(read('lib/exams/exam-page-server.ts')), 'exam page status');
    assert(/if \(user\) await AssessmentService\.finalizeExpiredAttempts\(\{ userId: user\.id, limit: 20 \}\);/.test(read('app/mock-tests/[id]/page.tsx')), 'instructions page');
    assert(/submitTestAttempt\(r\.id, r\.user_id, \{ submittedAt: attemptDeadline\(r\.started_at, duration\)\.toISOString\(\) \}\)/.test(svc), 'finalize = the submit path with submittedAt = deadline');
    // cron route
    const route = require(path.join(ROOT, 'app/api/cron/finalize-attempts/route.ts'));
    const req = (auth) => ({ headers: { get: (k) => (k === 'authorization' ? auth : null) } });
    let calls = 0;
    const orig = AssessmentService.finalizeExpiredAttempts;
    AssessmentService.finalizeExpiredAttempts = async (o) => { calls++; assert(o.limit === 200 && !o.userId, JSON.stringify(o)); return { finalized: 2, abandoned: 1, failed: 0 }; };
    try {
      delete process.env.CRON_SECRET;
      assert((await route.GET(req('Bearer x'))).status === 401, 'no secret → 401');
      process.env.CRON_SECRET = 'short';
      assert((await route.GET(req('Bearer short'))).status === 401, 'weak secret → 401');
      process.env.CRON_SECRET = 'a-very-long-test-secret-0123';
      assert((await route.GET(req('Bearer wrong-secret-of-same-len-'))).status === 401 && calls === 0, 'wrong secret → 401, no work');
      const ok = await route.GET(req('Bearer a-very-long-test-secret-0123'));
      const body = await ok.json();
      assert(ok.status === 200 && calls === 1 && JSON.stringify(Object.keys(body).sort()) === JSON.stringify(['abandoned', 'failed', 'finalized', 'ok']), JSON.stringify(body));
    } finally {
      AssessmentService.finalizeExpiredAttempts = orig;
      delete process.env.CRON_SECRET;
    }
    const v = JSON.parse(read('vercel.json'));
    assert(v.crons && v.crons.length === 1 && v.crons[0].path === '/api/cron/finalize-attempts' && /^\d+ \d+ \* \* \*$/.test(v.crons[0].schedule) && !v.regions, 'vercel.json: one daily cron, no region pin');
    return '5 read paths · 1 scoring path · cron 401 ×3 / 200';
  });

  await test('E-08 expired with ZERO saved answers → abandoned (no result row, not shown); marked-only rows are not answers', async () => {
    DB = makeDb();
    const m = seedMock();
    const empty = seedAttempt(m, { startedAt: hoursAgo(30), answers: [null, null, null, null] });
    const one = seedAttempt(m, { userId: 'u3', startedAt: hoursAgo(30), answers: [null, 'B', null, null] });
    const counts = await AssessmentService.finalizeExpiredAttempts({ limit: 50 });
    assert(counts.abandoned === 1 && counts.finalized === 1 && counts.failed === 0, JSON.stringify(counts));
    const a = DB.t.test_attempts.find((x) => x.id === empty);
    assert(a.status === 'abandoned' && a.submitted_at === null && !DB.t.test_results.some((r) => r.attempt_id === empty), 'zero-answer attempt was scored');
    const r1 = DB.t.test_results.find((r) => r.attempt_id === one);
    assert(r1 && r1.attempted_count === 1 && r1.total_score === 2, `one-answer attempt: ${JSON.stringify(r1)}`);
    return '0 answers → abandoned · 1 answer → finalized (score 2)';
  });

  await test('E-07 flag OFF (default): finalize-on-read and the sweep change nothing', async () => {
    delete process.env.EXAM_FINALIZE_ENABLED;
    DB = makeDb();
    const m = seedMock();
    const stale = seedAttempt(m, { startedAt: hoursAgo(30) });
    const counts = await AssessmentService.finalizeExpiredAttempts({ limit: 50 });
    assert(counts.finalized === 0 && counts.abandoned === 0 && counts.failed === 0, JSON.stringify(counts));
    assert(DB.t.test_attempts.find((x) => x.id === stale).status === 'in_progress' && DB.t.test_results.length === 0, 'a write happened with the flag off');
    process.env.EXAM_FINALIZE_ENABLED = 'true';
    return 'no-op until EXAM_FINALIZE_ENABLED=true';
  });

  console.log(`\nEXAM-FINALIZE-1: ${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
})();
