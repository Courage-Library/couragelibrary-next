#!/usr/bin/env node
/**
 * Q6 PLAYER-RESUME-SERVER (part A — no schema change). The server is the source of truth for time and answers:
 *   PR-01 a save after the server deadline (+ SAVE_GRACE_SECONDS for answers in flight) is refused as "closed", whatever
 *         the device clock says; inside the grace it is written; a closed / missing attempt is "closed"
 *   PR-02 a submit that arrives after the server deadline is stamped AT the deadline (never later)
 *   PR-03 the countdown runs on a monotonic clock anchored once to the server's remaining time (device clock ignored)
 *   PR-04 a reload restores answers from the database (session.savedAnswer seeds the player) and the remaining time from
 *         the server start time; an expired attempt goes down the submit / finalize path and the page redirects to the
 *         result — never back into the test
 *   PR-05 localStorage is a cache only: it never decides time or answers; its position is used only when the server
 *         has none
 *   PR-06 (part B, 099) position input is validated (orders 1..1000, ≤ 1000 visited, de-duplicated) and a reload
 *         starts at the server's question order
 *   PR-07 (part B) the position is written to test_attempts through the student's own client (099 column grants +
 *         RLS: own in-progress attempt only), returned by startOrResumeAttempt, and the player prefers it over the
 *         device copy
 * Run: node scripts/test_player_resume.cjs
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
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
    console.log(`  FAIL  ${name}\n        ${String(e && e.message ? e.message : e).slice(0, 800)}`);
  }
}
const assert = (c, m) => {
  if (!c) throw new Error(m || 'assertion failed');
};

const ts = require('typescript');
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request.startsWith('@/')) return origResolve.call(this, path.resolve(ROOT, request.slice(2)), parent, isMain, options);
  return origResolve.call(this, request, parent, isMain, options);
};
const transpile = (module, filename) => {
  const out = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } });
  module._compile(out.outputText, filename);
};
require.extensions['.ts'] = transpile;

let attempt = null;
const upserts = [];
const fakeClient = {
  from: (t) => {
    const q = {
      select: () => q,
      eq: () => q,
      maybeSingle: async () => ({ data: t === 'test_attempts' ? attempt : null, error: null }),
      upsert: async (row) => (upserts.push(row), { error: null }),
    };
    return q;
  },
};
const stub = new Proxy({}, { get: () => ({}) });
const MOCKS = {
  'server-only': {},
  'next/cache': { revalidatePath: () => undefined },
  '@/lib/supabase/server': { createServerSupabaseClient: async () => fakeClient, createAdminServerSupabaseClient: () => fakeClient, createPublicServerSupabaseClient: () => fakeClient },
  '@/services/gamification.service': { GamificationService: stub },
  '@/services/mistake.service': { MistakeService: stub },
  '@/services/premium-entitlement.service': { PremiumEntitlementService: stub },
  '@/services/content.service': { ContentService: stub },
};
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (Object.prototype.hasOwnProperty.call(MOCKS, request)) return MOCKS[request];
  return origLoad.call(this, request, parent, isMain);
};
const { AssessmentService } = require(path.join(ROOT, 'services/assessment.service.ts'));
const { SAVE_GRACE_SECONDS } = require(path.join(ROOT, 'lib/assessment/finalize.ts'));

(async () => {
  await test('PR-01 saves after the server deadline are refused (grace for answers in flight only)', async () => {
    const minsAgo = (m) => new Date(Date.now() - m * 60_000).toISOString();
    const save = () => AssessmentService.saveAnswer('att', 'mq', 'A', false, 5);
    attempt = { status: 'in_progress', started_at: minsAgo(10), mock_tests: { duration_minutes: 60 } };
    assert((await save()) === 'ok' && upserts.length === 1, 'inside the time → written');
    attempt = { status: 'in_progress', started_at: new Date(Date.now() - 60 * 60_000 - (SAVE_GRACE_SECONDS - 10) * 1000).toISOString(), mock_tests: { duration_minutes: 60 } };
    assert((await save()) === 'ok' && upserts.length === 2, 'inside the grace → written');
    attempt = { status: 'in_progress', started_at: new Date(Date.now() - 60 * 60_000 - (SAVE_GRACE_SECONDS + 5) * 1000).toISOString(), mock_tests: { duration_minutes: 60 } };
    assert((await save()) === 'closed' && upserts.length === 2, 'after deadline + grace → closed, nothing written');
    attempt = { status: 'submitted', started_at: minsAgo(1), mock_tests: { duration_minutes: 60 } };
    assert((await save()) === 'closed' && upserts.length === 2, 'submitted → closed');
    attempt = null;
    assert((await save()) === 'closed', 'not found / not own → closed');
    return `grace ${SAVE_GRACE_SECONDS} s`;
  });

  await test('PR-02 a late submit is stamped at the server deadline', () => {
    const svc = code(read('services/assessment.service.ts'));
    const fn = svc.slice(svc.indexOf('static async submitTestAttempt('), svc.indexOf('static maskCandidateName('));
    assert(/const serverDeadline = attemptDeadline\(attempt\.started_at, Number\(testData\.duration_minutes\) \|\| 0\);/.test(fn) && /opts\?\.submittedAt \?\? \(Date\.now\(\) > serverDeadline\.getTime\(\) \? serverDeadline\.toISOString\(\) : new Date\(\)\.toISOString\(\)\)/.test(fn), 'submitted_at = min(now, deadline)');
    assert(/select\("id, total_questions, total_marks, duration_minutes,/.test(fn), 'duration read from the mock (server)');
  });

  await test('PR-03 countdown: monotonic clock anchored once to the server remaining time', () => {
    const T = require(path.join(ROOT, 'lib/assessment/timer.ts'));
    const realNow = Date.now;
    const a = T.monotonicNowMs();
    Date.now = () => realNow() - 7_200_000; // device clock set two hours back
    const b = T.monotonicNowMs();
    Date.now = realNow;
    assert(b >= a && b - a < 1000, 'device clock change ignored');
    const timer = code(read('components/assessment/assessment-timer.tsx'));
    assert(/deadlineRef\.current = monotonicNowMs\(\) \+ Math\.max\(0, initialRemainingSeconds\) \* 1000/.test(timer) && !/Date\.now\(\)/.test(timer), 'anchored on the monotonic clock');
    assert(/<AssessmentTimer initialRemainingSeconds=\{session\.remainingSeconds\}/.test(read('app/mock-tests/[id]/take/player-client.tsx')), 'seeded by the server value');
  });

  await test('PR-04 reload: answers + time from the server; expired → submit / finalize, then the result page', () => {
    const svc = code(read('services/assessment.service.ts'));
    const fn = svc.slice(svc.indexOf('static async startOrResumeAttempt('), svc.indexOf('static async saveAnswer('));
    assert(/savedAnswer: savedAnswersMap\.get\(mq\.id\)/.test(fn) && /const elapsedSeconds = Math\.floor\(\(nowMs - startTimeMs\) \/ 1000\);/.test(fn), 'answers + remaining time computed on the server');
    assert(/if \(remainingSeconds <= 0\) \{[\s\S]{0,400}submitTestAttempt\(attempt\.id, attempt\.user_id, \{ submittedAt: new Date\(startTimeMs \+ totalAllowedSeconds \* 1000\)\.toISOString\(\) \}\);\s*return null;/.test(fn), 'expired → scored at the deadline, no session');
    const page = code(read('app/mock-tests/[id]/take/page.tsx'));
    assert(/redirect\(`\/mock-tests\/\$\{directAttempt\.id\}\/result`\)/.test(page), 'expired → result page');
    const P = code(read('app/mock-tests/[id]/take/player-client.tsx'));
    assert(/if \(q\.savedAnswer\) \{\s*initial\[q\.mockQuestionId\] = q\.savedAnswer;/.test(P), 'the player starts from the saved answers');
  });

  await test('PR-05 localStorage never decides time or answers', () => {
    const P = code(read('app/mock-tests/[id]/take/player-client.tsx'));
    assert(!/localStorage\.[gs]etItem\([^)]*(remaining|deadline|timer|answer)/i.test(P), 'no time / answers from localStorage');
    assert(/mergePending\(prev, pending, known\)/.test(P) && /pending\.forEach\(\(p\) => getSync\(\)\.save\(p\.mockQuestionId/.test(P), 'unsent device answers are only RE-SENT to the server (which refuses them after the deadline)');
  });

  await test('PR-06 position input validated; reload starts at the server question order', () => {
    const { sanitizePosition, resumeIndex, MAX_POSITION_ORDERS } = require(path.join(ROOT, 'lib/assessment/position.ts'));
    const p = sanitizePosition(3, [1, 2, 2, 5]);
    assert(p && p.order === 3 && JSON.stringify(p.visited) === '[1,2,3,5]', 'de-duplicated, sorted, includes the current order');
    const bad = [[0, []], [1.5, []], ['2', []], [2, 'x'], [2, [0]], [2, [-1]], [MAX_POSITION_ORDERS + 1, []], [2, Array.from({ length: MAX_POSITION_ORDERS + 1 }, () => 1)]];
    assert(bad.every(([o, v]) => sanitizePosition(o, v) === null), 'invalid positions refused');
    assert(resumeIndex([1, 2, 3, 4], 3) === 2 && resumeIndex([1, 2, 3], null) === 0 && resumeIndex([1, 2, 3], 9) === 0, 'server order → index; none / unknown → question 1');
  });

  await test('PR-07 position kept on the server; the player prefers it over the device copy', () => {
    const svc = code(read('services/assessment.service.ts'));
    const fn = svc.slice(svc.indexOf('static async saveAttemptPosition('), svc.indexOf('static async saveAnswer('));
    assert(/const supabase = await createServerSupabaseClient\(\);/.test(fn) && !/adminSb|createAdminServerSupabaseClient/.test(fn), "written with the student's own client (RLS + 099 column grants), never the service role");
    assert(/\.update\(\{ last_question_order: position\.order, visited_orders: position\.visited, last_activity_at: new Date\(\)\.toISOString\(\) \}\)/.test(fn) && /\.eq\("status", "in_progress"\)/.test(fn), 'only the 099 position columns; in-progress only');
    const resume = svc.slice(svc.indexOf('static async startOrResumeAttempt('), svc.indexOf('static async saveAttemptPosition('));
    assert(/resumeOrder: positionRes\.data\?\.last_question_order \?\? null/.test(resume) && /visitedOrders: positionRes\.data\?\.visited_orders \?\? \[\]/.test(resume), 'returned on resume');
    const route = code(read('app/api/assessment/position/route.ts'));
    assert(/sanitizePosition\(body\.order, body\.visited\)/.test(route) && /ATTEMPT_CLOSED/.test(route) && !/error\.message/.test(route), 'route validates; fixed codes only');
    const P = code(read('app/mock-tests/[id]/take/player-client.tsx'));
    assert(/if \(fixedSession\.resumeOrder != null\) \{\s*setCurrentIndex\(resumeIndex\(orders, fixedSession\.resumeOrder\)\);[\s\S]{0,400}\} else \{\s*try \{\s*const saved = JSON\.parse\(localStorage\.getItem\(progressKey\)/.test(P), 'server position first; device copy only when the server has none');
    assert(/fetch\("\/api\/assessment\/position"/.test(P) && /POSITION_SAVE_DEBOUNCE_MS/.test(P), 'position sent to the server (debounced)');
    const mig = read('supabase/migrations/20261025000099_attempt_integrity_and_position.sql');
    assert(/GRANT UPDATE \(last_activity_at, last_question_order, visited_orders\) ON public\.test_attempts TO authenticated;/.test(mig), '099 grants exactly the position columns');
  });

  console.log(`\nPLAYER-RESUME: ${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
})();
