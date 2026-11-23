#!/usr/bin/env node
/**
 * RESULT-UX-1 gate (owner spec docs/design/RESULT_UX_V1_SPEC.md, 23 Nov 2026) — offline, no network, no DB, fixtures
 * only (no real personal data). Pure rules (lib/assessment/result-ux.ts) + the page rendered with the real components.
 *   R-1 delta: first attempt → hidden; up / down / same; "vs your last <Exam> <kind> mock (x)"
 *   R-2 trend grouping: same exam + mock kind + max score only (different max marks / kinds never mixed; a daily series
 *       is its own series); abandoned excluded; a later attempt is never "previous"; % normalised; Last 5 / All; < 2 → hidden
 *   R-3 weak topics: ≥ 2 attempted, ≤ 4, lowest accuracy first, skipped / unscored excluded, empty state
 *   R-4 pace: section time ÷ section questions vs the ideal (section time limit when defined, else mock duration ÷
 *       questions); "on pace" / "too slow" (> 20 % over); time + pace hidden when no section time is recorded
 *   R-5 next steps: Learn only with a learning link; Practice only for a practicable topic (else practice home; none when
 *       practice is off); Mistakes only with wrong answers ("Saved to Mistake Vault" = the real auto-save); fewer valid
 *       → fewer shown
 *   R-6 formatting: "−0.5 / 200" with the proper minus, no space after it; delta "+11.0" / "−4.0"; clock; no
 *       "% of maximum" anywhere
 *   R-7 review filters: All / Wrong / Skipped / Correct with counts; opens on Wrong when wrong > 0; URL query parsed
 *       safely; Next wrong
 *   R-8 verdict: deterministic rule set (no AI)
 *   R-9 page (real render, fixtures): order + one h1; "Your answer" / "Correct answer" / "Not answered" as text; ONE
 *       "Explanation" label, no "Here's why"; Learn → the existing learning target; icon buttons with aria-labels;
 *       Mistake Vault icon on wrong answers only; Practice hidden for topics that cannot be practised (UXFIX1 X-10 spelling); filters written to
 *       the URL; past attempts collapsed (aria-expanded=false, hidden list); chart text alternative; rank note vs real
 *       standing; Re-attempt absent; no emoji in the rendered DOM
 *   R-10 phone: bottom bar stacked above the student nav (68 px + safe area — the nav's own height), only with wrong
 *       answers; review mode hides the student nav (CSS scoped to <html data-result-review>, < 1024 px) and shows
 *       Prev · n / N · Next wrong
 *   R-11 negative controls: each broken variant is caught
 * Run: node scripts/test_result_ux1.cjs
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
let passed = 0;
let failed = 0;
const results = [];
async function test(name, fn) {
  try {
    const info = await fn();
    passed++;
    results.push(`  PASS  ${name}${info ? ' — ' + info : ''}`);
  } catch (e) {
    failed++;
    results.push(`  FAIL  ${name}\n        ${String(e && e.message ? e.message : e).slice(0, 1400)}`);
  }
}
const assert = (c, m) => {
  if (!c) throw new Error(m || 'assertion failed');
};
const eq = (a, b, m) => assert(JSON.stringify(a) === JSON.stringify(b), `${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);

// ---------------------------------------------------------------- module loading (TS + stubs)
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request.startsWith('@/')) return origResolve.call(this, path.resolve(ROOT, request.slice(2)), parent, isMain, options);
  return origResolve.call(this, request, parent, isMain, options);
};
const OVERRIDE = new Map(); // absolute file → source (negative controls)
const transpile = (module, filename) => {
  const src = OVERRIDE.has(filename) ? OVERRIDE.get(filename) : fs.readFileSync(filename, 'utf8');
  const out = ts.transpileModule(src, { fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } });
  module._compile(out.outputText, filename);
};
require.extensions['.ts'] = transpile;
require.extensions['.tsx'] = transpile;
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const h = React.createElement;
let SEARCH = new URLSearchParams();
const MOCKS = {
  'server-only': {},
  'next/link': { __esModule: true, default: ({ href, children, prefetch: _p, ...rest }) => h('a', { href, ...rest }, children) },
  'next/navigation': { useSearchParams: () => SEARCH, useRouter: () => ({ push() {}, replace() {}, refresh() {} }), usePathname: () => '/mock-tests/att/result' },
  '@/lib/coins/flag-context': { useCoinsEnabled: () => false },
  '@/components/result/result-ux.css': {},
  '@/app/(site)/practice/actions': { reportQuestionAction: async () => 'REPORTED' },
  '@/app/(site)/memory-lock/actions': { addToMemoryLockAction: async () => 'ADDED' },
};
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (Object.prototype.hasOwnProperty.call(MOCKS, request)) return MOCKS[request];
  return origLoad.call(this, request, parent, isMain);
};
const freshRequire = (rel) => {
  const abs = path.join(ROOT, rel);
  for (const k of Object.keys(require.cache)) if (k.startsWith(path.join(ROOT, 'components')) || k.startsWith(path.join(ROOT, 'lib', 'assessment'))) delete require.cache[k];
  return require(abs);
};

const UX_REL = 'lib/assessment/result-ux.ts';
const VIEW_REL = 'components/assessment/result-view-client.tsx';
const CARD_REL = 'components/assessment/question-review-card.tsx';
const SRC = { ux: read(UX_REL), view: read(VIEW_REL), card: read(CARD_REL), css: read('components/result/result-ux.css'), nav: read('app/nav-student.css') };
const withOverride = (map, fn) => {
  for (const [rel, src] of Object.entries(map)) OVERRIDE.set(path.join(ROOT, rel), src);
  try {
    return fn();
  } finally {
    for (const rel of Object.keys(map)) OVERRIDE.delete(path.join(ROOT, rel));
  }
};
const UX = () => freshRequire(UX_REL);

// ---------------------------------------------------------------- fixtures (synthetic; no real people)
const TOPIC = { ns: 'aaaaaaaa-0000-4000-8000-0000000000a1', avg: 'aaaaaaaa-0000-4000-8000-0000000000a2', syl: 'aaaaaaaa-0000-4000-8000-0000000000a3', gk: 'aaaaaaaa-0000-4000-8000-0000000000a4', one: 'aaaaaaaa-0000-4000-8000-0000000000a5' };
let n = 0;
const q = (o) => {
  n++;
  return {
    mockQuestionId: `mq${n}`,
    questionId: `qq${n}`,
    questionVersionId: `qv${n}`,
    questionOrder: n,
    sectionName: 'Quant',
    topicId: null,
    topicName: null,
    topicSlug: null,
    marks: 2,
    isMarked: false,
    questionText: `Fixture question ${n}`,
    options: ['A', 'B', 'C', 'D'].map((k) => ({ key: k, text: `Option ${k}` })),
    selectedOption: 'A',
    correctOption: 'A',
    isCorrect: true,
    marksAwarded: 2,
    explanation: `Worked solution ${n}.`,
    timeSpentSeconds: 40,
    learningSlug: null,
    learningDocTitle: null,
    hasPublishedLearning: false,
    correction: null,
    ...o,
  };
};
const wrong = (o) => q({ selectedOption: 'B', isCorrect: false, marksAwarded: -0.5, ...o });
const skip = (o) => q({ selectedOption: null, isCorrect: false, marksAwarded: 0, ...o });
function paper() {
  n = 0;
  return [
    // Number System: 2 / 6 correct, slow, has a lesson, practicable
    ...[0, 1].map(() => q({ topicId: TOPIC.ns, topicName: 'Number System', learningSlug: 'number-system', hasPublishedLearning: true, timeSpentSeconds: 130 })),
    ...[0, 1, 2, 3].map(() => wrong({ topicId: TOPIC.ns, topicName: 'Number System', learningSlug: 'number-system', hasPublishedLearning: true, timeSpentSeconds: 130 })),
    // Average: 1 / 4 correct, practicable, no lesson
    q({ topicId: TOPIC.avg, topicName: 'Average' }),
    ...[0, 1, 2].map(() => wrong({ topicId: TOPIC.avg, topicName: 'Average' })),
    // Syllogism (Reasoning): 2 / 5
    ...[0, 1].map(() => q({ sectionName: 'Reasoning', topicId: TOPIC.syl, topicName: 'Syllogism' })),
    ...[0, 1, 2].map(() => wrong({ sectionName: 'Reasoning', topicId: TOPIC.syl, topicName: 'Syllogism' })),
    // GK: all correct (never weak)
    ...[0, 1, 2].map(() => q({ sectionName: 'GA', topicId: TOPIC.gk, topicName: 'Modern History' })),
    // one attempted only (below the minimum)
    wrong({ sectionName: 'GA', topicId: TOPIC.one, topicName: 'Polity' }),
    // skipped + unscored
    skip({ sectionName: 'GA', topicId: TOPIC.gk, topicName: 'Modern History' }),
    skip({ sectionName: 'Reasoning' }),
    q({ sectionName: 'Reasoning', correctOption: null, isCorrect: false, marksAwarded: 0 }),
  ];
}
const tsrc = (o) => ({ attemptId: 'a', status: 'submitted', examId: 'ssc-cgl', examTitle: 'SSC CGL', mockTestId: 'm1', mockTitle: 'Full Mock 1', mockKind: 'full_mock', submittedAt: '2026-11-01', score: 100, maxScore: 200, accuracy: 60, ...o });
function data(o = {}) {
  const review = paper();
  const u = UX();
  const rows = [tsrc({ attemptId: 'p1', submittedAt: '2026-10-01', score: 50 }), tsrc({ attemptId: 'p2', submittedAt: '2026-10-15', score: 71.5 }), tsrc({ attemptId: 'att', submittedAt: '2026-11-01', score: 82.5 })];
  return {
    result: { id: 'r', attemptId: 'att', totalQuestions: review.length, attemptedCount: 22, correctCount: 9, incorrectCount: 11, unansweredCount: 2, totalScore: 82.5, maxScore: 200, accuracyPercentage: 45, timeSpentSeconds: 3490, rank: null, percentile: null },
    test: { id: 'mock1', title: 'SSC CGL Tier 1 · Full Mock 3', durationMinutes: 60, totalQuestions: 100, totalMarks: 200 },
    standing: null,
    security: { candidateId: 'u', maskedId: 'CL••••ABCD', attemptIdShort: 'ATT123', examTitle: 'SSC CGL', timestamp: '23 Nov 2026, 7:42 pm' },
    rewards: null,
    insights: { strongestSection: null, weakestSection: null, accuracyLevel: '', speedSecondsPerQuestion: 0, reviewCount: 11 },
    analysis: { negativeMarksLost: 5.5, takeaways: [], trend: null, examSlug: 'ssc-cgl', memoryLockEnabled: true, trendGroup: u.trendGroup(rows, 'att'), practiceTopicIds: [TOPIC.ns, TOPIC.avg], practiceEnabled: true },
    sections: [
      { id: 's1', sectionName: 'Quant', totalQuestions: 10, attemptedCount: 10, correctCount: 3, incorrectCount: 7, unansweredCount: 0, sectionScore: 2.5, maxScore: 20, accuracyPercentage: 30, timeSpentSeconds: 1300, durationMinutes: null },
      { id: 's2', sectionName: 'Reasoning', totalQuestions: 7, attemptedCount: 6, correctCount: 2, incorrectCount: 3, unansweredCount: 1, sectionScore: 2.5, maxScore: 14, accuracyPercentage: 40, timeSpentSeconds: 200, durationMinutes: null },
      { id: 's3', sectionName: 'GA', totalQuestions: 5, attemptedCount: 4, correctCount: 3, incorrectCount: 1, unansweredCount: 1, sectionScore: 5.5, maxScore: 10, accuracyPercentage: 75, timeSpentSeconds: 150, durationMinutes: null },
    ],
    reviewQuestions: review,
    ...o,
  };
}
const render = (d, query = '') => {
  SEARCH = new URLSearchParams(query);
  const { ResultViewClient } = freshRequire(VIEW_REL);
  return renderToStaticMarkup(h(ResultViewClient, { data: d }));
};
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#x27;|&apos;/g, "'").replace(/\s+/g, ' ');

// ---------------------------------------------------------------- checks
function checkDelta() {
  const u = UX();
  const g1 = u.trendGroup([tsrc({ attemptId: 'att' })], 'att');
  eq(u.scoreDelta(g1), null, 'first attempt → no delta');
  const up = u.scoreDelta(u.trendGroup([tsrc({ attemptId: 'a1', submittedAt: '2026-10-01', score: 71.5 }), tsrc({ attemptId: 'att', score: 82.5 })], 'att'));
  eq(up, { delta: 11, previous: 71.5, label: 'vs your last SSC CGL full mock' }, 'up');
  eq(u.fmtDelta(up.delta), '+11.0', 'up format');
  const down = u.scoreDelta(u.trendGroup([tsrc({ attemptId: 'a1', submittedAt: '2026-10-01', score: 86.5 }), tsrc({ attemptId: 'att', score: 82.5 })], 'att'));
  eq([down.delta, u.fmtDelta(down.delta)], [-4, '−4.0'], 'down');
  eq(u.scoreDelta(null), null, 'no group');
  return '+11.0 · −4.0 · first → hidden';
}

function checkGrouping() {
  const u = UX();
  const rows = [
    tsrc({ attemptId: 'f1', submittedAt: '2026-09-01', score: 100 }),
    tsrc({ attemptId: 'f50', submittedAt: '2026-09-02', score: 40, maxScore: 50 }), // same exam + kind, other max → never mixed
    tsrc({ attemptId: 'sec', submittedAt: '2026-09-03', score: 30, mockKind: 'sectional' }), // other kind
    tsrc({ attemptId: 'd1', submittedAt: '2026-09-04', score: 20, maxScore: 50, mockKind: 'daily' }), // daily series
    tsrc({ attemptId: 'd2', submittedAt: '2026-09-05', score: 30, maxScore: 50, mockKind: 'daily' }),
    tsrc({ attemptId: 'ab', submittedAt: '2026-09-06', score: 199, status: 'abandoned' }),
    tsrc({ attemptId: 'other-exam', submittedAt: '2026-09-07', score: 150, examId: 'ssc-chsl' }),
    tsrc({ attemptId: 'f2', submittedAt: '2026-09-08', score: 120 }),
    tsrc({ attemptId: 'f3', submittedAt: '2026-09-09', score: 130 }), // later than the viewed attempt
  ];
  const g = u.trendGroup(rows, 'f2');
  eq(g.points.map((p) => p.attemptId), ['f1', 'f2'], 'full 200 series up to the viewed attempt (no 50-mark, sectional, daily, abandoned, other exam, later)');
  eq(g.points.map((p) => p.pct), [50, 60], '% normalised');
  const d = u.trendGroup(rows, 'd2');
  eq(d.points.map((p) => p.attemptId), ['d1', 'd2'], 'daily series separate');
  eq(d.kindLabel, 'daily', 'kind label');
  eq(u.trendGroup(rows, 'f50').points.map((p) => p.attemptId), ['f50'], '50-mark full mock alone');
  eq(u.trendPoints(u.trendGroup(rows, 'f50'), 'last5'), null, '< 2 points → hidden');
  const many = Array.from({ length: 8 }, (_, i) => tsrc({ attemptId: `x${i}`, submittedAt: `2026-08-0${i + 1}`, score: 10 * i }));
  const gm = u.trendGroup(many, 'x7');
  eq(u.trendPoints(gm, 'last5').map((p) => p.attemptId), ['x3', 'x4', 'x5', 'x6', 'x7'], 'last 5');
  eq(u.trendPoints(gm, 'all').length, 8, 'all');
  assert(u.trendKey(tsrc({ maxScore: 200 })) !== u.trendKey(tsrc({ maxScore: 50 })) && u.trendKey(tsrc({ mockKind: 'daily' })) !== u.trendKey(tsrc({ mockKind: 'daily_sectional' })), 'keys differ by max and kind');
  return 'exam + kind + max · daily separate · % · last 5 / all';
}

function checkWeak() {
  const u = UX();
  const w = u.weakTopics(paper());
  eq(w.map((t) => [t.topicName, t.correct, t.attempted]), [['Average', 1, 4], ['Number System', 2, 6], ['Syllogism', 2, 5]], 'weak topics: lowest accuracy, ≥ 2 attempted, all-correct and 1-attempt topics left out');
  eq(w[1].learningSlug, 'number-system', 'learning slug carried');
  const many = [];
  n = 0;
  for (let t = 0; t < 6; t++) for (let i = 0; i < 2; i++) many.push(i === 0 ? wrong({ topicId: `t${t}`, topicName: `T${t}` }) : q({ topicId: `t${t}`, topicName: `T${t}` }));
  eq(u.weakTopics(many).length, 4, 'at most 4');
  eq(u.weakTopics([q({ topicId: 'z', topicName: 'Z' }), skip({ topicId: 'z', topicName: 'Z' }), wrong({ topicId: 'z', topicName: 'Z', correctOption: null })]), [], 'skipped + unscored never count → empty state');
  return 'min 2 · max 4 · empty';
}

function checkPace() {
  const u = UX();
  const s = (o) => ({ sectionName: 'S', totalQuestions: 25, attemptedCount: 25, sectionScore: 0, maxScore: 50, accuracyPercentage: 50, timeSpentSeconds: 800, durationMinutes: null, ...o });
  const r = u.sectionPace([s({ sectionName: 'Reasoning' }), s({ sectionName: 'Quant', timeSpentSeconds: 1650 }), s({ sectionName: 'Timed', timeSpentSeconds: 1650, durationMinutes: 30 })], { durationMinutes: 60, totalQuestions: 100 });
  eq(r.rows.map((x) => [x.sectionName, x.secondsPerQuestion, x.idealSeconds, x.pace]), [['Reasoning', 32, 36, 'on pace'], ['Quant', 66, 36, 'too slow'], ['Timed', 66, 72, 'on pace']], 'pace labels (section time limit wins when defined)');
  eq(r.showTime, true, 'time shown');
  const none = u.sectionPace([s({ timeSpentSeconds: undefined })], { durationMinutes: 60, totalQuestions: 100 });
  eq([none.showTime, none.rows[0].pace], [false, null], 'no recorded time → time + pace hidden');
  return '32s on pace · 66s too slow · section limit';
}

function checkSteps() {
  const u = UX();
  const w = u.weakTopics(paper());
  const all = u.nextSteps({ weak: w, wrongCount: 11, practiceEnabled: true, practiceTopicIds: new Set([TOPIC.ns, TOPIC.avg]), examSlug: 'ssc-cgl', idealSeconds: 36 });
  eq(all.map((s) => s.kind), ['learn', 'practice', 'mistakes'], '3 steps');
  eq(all[0].href, '/articles/number-system', 'learn → the existing learning target');
  assert(all[1].href.includes(`topic=${TOPIC.ns}`) && /You took 2m 10s per question here \(ideal ~36s\)/.test(all[1].detail), `practice the slowest practicable topic: ${all[1].href} ${all[1].detail}`);
  eq(all[2], { kind: 'mistakes', title: 'Revise your 11 mistakes', detail: 'Saved to Mistake Vault. Revise them before the next mock.', href: '/mistakes', cta: 'Open Mistake Vault' }, 'mistakes step');
  const noLearnNoPractice = u.nextSteps({ weak: w.map((t) => ({ ...t, learningSlug: null })), wrongCount: 3, practiceEnabled: false, practiceTopicIds: new Set(), examSlug: null, idealSeconds: 36 });
  eq(noLearnNoPractice.map((s) => s.kind), ['mistakes'], 'fewer valid → fewer shown');
  const home = u.nextSteps({ weak: w, wrongCount: 0, practiceEnabled: true, practiceTopicIds: new Set(), examSlug: null, idealSeconds: null });
  eq(home.map((s) => [s.kind, s.href]), [['learn', '/articles/number-system'], ['practice', '/practice']], 'no practicable topic → practice home; no wrong → no mistakes step');
  eq(u.nextSteps({ weak: [], wrongCount: 0, practiceEnabled: true, practiceTopicIds: new Set(), examSlug: null, idealSeconds: null }), [], 'nothing valid → none');
  return 'learn · practice (slowest / home) · mistakes · fewer when invalid';
}

function checkFormat(viewSrc) {
  const u = UX();
  eq([u.fmtScore(-0.5, 200), u.fmtNum(82.5), u.fmtNum(-13.5), u.fmtSigned(2), u.fmtSigned(-0.5), u.fmtSigned(0)], ['−0.5 / 200', '82.5', '−13.5', '+2', '−0.5', '0'], 'marks');
  assert(!/- \d|− \d/.test(u.fmtScore(-0.5, 200)), 'a space after the minus');
  eq([u.fmtClock(3490), u.fmtClock(3725), u.fmtShort(108), u.fmtShort(42), u.fmtPct(60), u.fmtPct(41.666)], ['58:10', '1:02:05', '1m 48s', '42s', '60%', '41.7%'], 'time / %');
  assert(!/of the maximum|% of maximum/.test(viewSrc), '"% of maximum" is back');
  return '−0.5 / 200 · 58:10 · 1m 48s';
}

function checkFilters() {
  const u = UX();
  const qs = paper();
  const c = u.uxCounts(qs);
  eq(c, { all: 22, wrong: 11, skipped: 2, correct: 8 }, 'counts (unscored is in All only)');
  eq(u.defaultFilter(c), 'wrong', 'opens on Wrong');
  eq(u.defaultFilter({ ...c, wrong: 0 }), 'all', 'no wrong → All');
  const p = (s) => u.parseReviewQuery(new URLSearchParams(s), c, ['Quant', 'Reasoning']);
  eq([p(''), p('filter=skipped&section=Quant'), p('filter=evil&section=%3Cscript%3E')], [{ filter: 'wrong', section: null }, { filter: 'skipped', section: 'Quant' }, { filter: 'wrong', section: null }], 'URL parsing');
  eq(u.uxFilter(qs, 'wrong', 'Reasoning').length, 3, 'section filter');
  const w = u.uxFilter(qs, 'all', null);
  eq([u.nextWrong(w, 3).questionOrder, u.nextWrong(w, 22).questionOrder], [4, 3], 'next wrong (wraps)');
  eq(u.UX_FILTERS.map((f) => f.label), ['All', 'Wrong', 'Skipped', 'Correct'], 'labels');
  return 'All / Wrong / Skipped / Correct · default Wrong · URL safe';
}

function checkVerdict() {
  const u = UX();
  const pace = u.sectionPace([{ sectionName: 'Quant', totalQuestions: 25, attemptedCount: 25, sectionScore: 0, maxScore: 50, accuracyPercentage: 48, timeSpentSeconds: 1650 }, { sectionName: 'Reasoning', totalQuestions: 25, attemptedCount: 25, sectionScore: 0, maxScore: 50, accuracyPercentage: 68, timeSpentSeconds: 800 }], { durationMinutes: 60, totalQuestions: 100 }).rows;
  eq(u.verdict({ delta: 11, accuracy: 60, attempted: 68, pace }), 'Good progress. Accuracy is fine; speed in Quant is holding you back.', 'reference verdict');
  const calm = pace.map((r) => ({ ...r, pace: 'on pace' }));
  eq(u.verdict({ delta: null, accuracy: 55, attempted: 50, pace: calm }), 'Reasoning is your strongest section; Quant needs the most work.', 'section gap');
  eq(u.verdict({ delta: -4, accuracy: 85, attempted: 50, pace: calm.map((r) => ({ ...r, accuracyPercentage: 85 })) }), 'Lower than your last attempt. Accurate attempt. Keep the same care and attempt more questions.', 'accurate');
  eq(u.verdict({ delta: null, accuracy: 0, attempted: 0, pace: [] }), 'You did not answer any question in this attempt.', 'nothing answered');
  return 'rules, same input → same sentence';
}

function checkPage() {
  const d = data();
  const html = render(d);
  const t = text(html);
  // order + headings
  eq([...html.matchAll(/data-result-section="([\w-]+)"/g)].map((m) => m[1]), ['summary', 'next-steps', 'weak-topics', 'sections', 'review', 'past-attempts'], 'page order');
  eq((html.match(/<h1\b/g) || []).length, 1, 'one h1');
  assert(/data-jump-bar=""/.test(html) && ['Summary', 'Next steps', 'Weak topics', 'Sections', 'Question review', 'Past attempts'].every((l) => html.includes(`>${l}</a>`)), 'jump bar chips');
  assert(!/Re-attempt/i.test(t), 'Re-attempt shown (hidden in this phase: RESULT-REATTEMPT-1)');
  // summary
  assert(/82\.5 <span[^>]*>\/ 200<\/span>/.test(html), 'score "82.5 / 200"');
  assert(t.includes('▲ +11.0 vs your last SSC CGL full mock (71.5)') && /data-delta="up"/.test(html), 'delta chip vs the same group');
  for (const s of ['Correct', 'Wrong · −5.5', 'Skipped · 0 marks', 'Accuracy', 'Time used', '58:10', '45%']) assert(t.includes(s), `tiles miss "${s}"`);
  assert(!/of the maximum/.test(t), '"% of maximum" is back');
  assert(t.includes('Rank & percentile appear once enough students take this mock') && !/data-standing/.test(html), 'rank note without standing');
  assert(/<caption>Your score in percent, oldest first<\/caption>/.test(html) && /<svg[^>]*aria-hidden="true"/.test(html), 'chart text alternative');
  // steps / weak / sections
  eq([...html.matchAll(/data-step="(\w+)"/g)].map((m) => m[1]), ['learn', 'practice', 'mistakes'], 'next steps');
  assert(t.includes('Saved to Mistake Vault.'), 'mistake vault wording matches the auto-save');
  assert(/aria-label="Learn Number System"[^>]*>|href="\/articles\/number-system"[^>]*aria-label="Learn Number System"/.test(html), 'weak topic Learn');
  assert(/aria-label="Practice Number System"/.test(html) && /aria-label="Practice Average"/.test(html) && !/aria-label="Practice Syllogism"/.test(html), 'Practise only for practicable topics');
  assert(!/aria-label="Learn Average"/.test(html), 'Learn hidden without a learning link');
  assert(t.includes('Pace / question') && t.includes('2m 10s · too slow') && /data-pace="on pace"/.test(html), 'pace labels as text');
  // review (opens on Wrong; the first wrong is expanded)
  assert(/data-filter="wrong"[^>]*aria-pressed="true"|aria-pressed="true"[^>]*data-filter="wrong"/.test(html), 'opens on Wrong');
  for (const [f, nn] of [['all', 22], ['wrong', 11], ['skipped', 2], ['correct', 8]]) assert(new RegExp(`data-filter-count="${f}">${nn}<`).test(html), `filter count ${f}`);
  eq((html.match(/data-review-card=/g) || []).length, 1, 'one expanded card, the rest collapsed rows');
  assert((html.match(/data-review-row="wrong"[^>]*>|aria-expanded="false"[^>]*data-review-row/g) || []).length >= 10, 'collapsed rows');
  assert(/<button[^>]*aria-expanded="false"[^>]*data-review-row/.test(html) && /aria-label="Collapse question 3"[^>]*>|aria-expanded="true" aria-label="Collapse question 3"/.test(html), 'expanders carry aria-expanded');
  assert(t.includes('✕ Your answer') && t.includes('✓ Correct answer'), 'labels as text');
  eq((html.match(/>Explanation</g) || []).length, 1, 'one Explanation label');
  assert(!/Here.s why|Here&#x27;s why|heres-why/i.test(html), '"Here\'s why" is back');
  assert(/href="\/articles\/number-system"[^>]*data-learn-button=""/.test(html) && t.includes('Learn: Number System'), 'Learn button → the existing learning target');
  assert(/aria-label="Saved in Mistake Vault"/.test(html) && /aria-label="Report this question"|data-report-question="" aria-label|aria-label="[^"]*[Rr]eport[^"]*"/.test(html) && /aria-label="Add to Memory Lock"|aria-label="[^"]*Memory Lock[^"]*"/.test(html), 'icon buttons have aria-labels');
  assert(/data-next-wrong=""/.test(html) && t.includes('Next wrong'), 'Next wrong on desktop');
  // skipped view: "Not answered" + only the correct label; correct view: no Mistake Vault icon
  const sk = render(d, 'filter=skipped');
  assert(/data-not-answered=""/.test(sk) && text(sk).includes('Not answered') && !/data-label="your-answer"/.test(sk) && /data-label="correct-answer"/.test(sk), 'skipped: "Not answered" + the correct label only');
  const ok = render(d, 'filter=correct');
  assert(!/data-mistake-vault/.test(ok) && /data-review-card="correct"/.test(ok), 'Mistake Vault icon only on wrong answers');
  // past attempts collapsed
  assert(/aria-expanded="false" aria-controls="past-list"/.test(html) && /<ol id="past-list" hidden=""/.test(html), 'past attempts collapsed by default');
  // filters in the URL
  assert(/window\.history\[push \? "pushState" : "replaceState"\]/.test(SRC.view) && /onFilter=\{\(f\) => setQuery\(\{ filter: f \}\)\}/.test(SRC.view) && /onClick=\{\(\) => setQuery\(\{ section: s \}\)\}/.test(SRC.view) && /parseReviewQuery\(params, counts, sectionNames\)/.test(SRC.view), 'filters not kept in the URL');
  // standing kept when real
  const st = render(data({ standing: { rank: 3, percentile: 88, n: 40 } }));
  assert(/data-standing=""/.test(st) && text(st).includes('Rank 3 of 40') && !/data-rank-note/.test(st), 'real standing kept');
  // first attempt: no delta, trend + past attempts hidden
  const first = render(data({ analysis: { ...data().analysis, trendGroup: UX().trendGroup([tsrc({ attemptId: 'att' })], 'att') } }));
  assert(!/data-delta/.test(first) && /data-trend-empty=""/.test(first) && text(first).includes('Take this mock again to see your trend') && !/data-result-section="past-attempts"/.test(first), 'first attempt: no delta / trend / past attempts');
  // no wrong answers: no bottom bar; empty weak topics state
  return 'order · labels · explanation · actions · URL · collapsed';
}

function checkNoEmoji(htmls) {
  const { EMOJI_RX } = UX();
  for (const [name, html] of htmls) {
    const m = html.match(new RegExp(EMOJI_RX.source, 'gu'));
    assert(!m, `${name}: emoji in the rendered DOM: ${m && m.slice(0, 5).join(' ')}`);
  }
  assert('▲▼✓✕›'.split('').every((c) => !EMOJI_RX.test(c)), 'allowed symbols must not count as emoji');
  return `${htmls.length} renders clean`;
}

function checkPhone(viewSrc, cssSrc, navSrc) {
  const navH = (navSrc.match(/\.cl-ss__bar \{[^}]*height: calc\((\d+)px \+ env\(safe-area-inset-bottom, 0px\)\);/) || [])[1];
  assert(navH && new RegExp(`bottom-\\[calc\\(${navH}px\\+env\\(safe-area-inset-bottom,0px\\)\\)\\][^"]*lg:hidden" data-result-bar="summary"`).test(viewSrc), `summary bar not stacked exactly above the ${navH} px student nav`);
  assert(/\{!reviewMode && counts\.wrong > 0 && \(/.test(viewSrc) && /Review \{counts\.wrong\} \{counts\.wrong === 1 \? "mistake" : "mistakes"\}/.test(viewSrc), 'bar only with wrong answers, "Review N mistakes"');
  // the nav's raised centre button pokes up to 32 px above the nav: the bar sits one layer BELOW the nav (z 29 < 30) with a
  // 36 px bottom zone, so the button is never under it (found by the page check at 360 px)
  const navZ = Number((navSrc.match(/\.cl-ss__bar \{[^}]*z-index: (\d+);/) || [])[1]);
  const barCls = (viewSrc.match(/className="([^"]*)" data-result-bar="summary"/) || [])[1] || '';
  const barZ = Number((barCls.match(/\bz-\[?(\d+)\]?/) || [])[1]);
  assert(navZ > 0 && barZ > 0 && barZ < navZ && /\bpb-9\b/.test(barCls), `summary bar z ${barZ} vs nav ${navZ}, bottom zone (pb-9 = 36 px ≥ the 32 px raised button): "${barCls}"`);
  assert(/className="min-h-\[calc\(100dvh-4rem\)\] bg-cl-cloud pb-\[112px\] lg:pb-16"/.test(viewSrc), 'content not padded for the bar (112 px ≥ 8 + 48 + 36 px bar + gap)');
  assert(/@media \(max-width: 1023\.98px\) \{\s*html\[data-result-review\] \.cl-ss__bar \{\s*display: none;\s*\}\s*html\[data-result-review\] \.cl-ss__col \{\s*padding-bottom: 0;/.test(cssSrc), 'review mode does not hide the student nav (scoped, < 1024 px)');
  assert(/if \(reviewMode\) el\.setAttribute\("data-result-review", ""\);\s*else el\.removeAttribute\("data-result-review"\);\s*return \(\) => el\.removeAttribute\("data-result-review"\);/.test(viewSrc), 'the review flag is not cleaned up');
  const d = data();
  const rm = render(d, 'review=1&filter=wrong&q=4');
  assert(/data-review-mode=""/.test(rm) && /data-result-bar="review"/.test(rm) && !/data-result-bar="summary"/.test(rm), 'review mode bar');
  assert(/data-review-counter="">2 \/ 11</.test(rm) && /data-review-prev=""/.test(rm) && text(rm).includes('Next wrong'), 'Prev · 2 / 11 · Next wrong');
  // the review-mode view itself (the summary view stays in the DOM, hidden below 1024 px)
  const view = rm.slice(rm.indexOf('data-review-mode=""'), rm.indexOf('data-result-bar="review"'));
  assert((view.match(/data-review-card=/g) || []).length === 1 && /data-learn-button=""/.test(view) && /data-explanation=""/.test(view), 'one question with explanation + Learn');
  assert(/class="mx-auto flex max-w-\[1320px\][^"]*max-lg:hidden/.test(rm),'the summary view is not hidden on phones in review mode');
  const none = render(data({ reviewQuestions: paper().map((x) => (x.isCorrect || x.selectedOption === null || x.correctOption === null ? x : { ...x, selectedOption: 'A', isCorrect: true, marksAwarded: 2 })), result: { ...d.result, incorrectCount: 0 } }));
  assert(!/data-result-bar="summary"/.test(none), 'bar shown with 0 wrong');
  return `stacked above the ${navH} px nav · review mode hides the nav`;
}

const FX_PAGE_REL = 'app/(result-fixture)/dev/result-fixture/page.fixture.tsx';
const FX_LAYOUT_REL = 'app/(result-fixture)/layout.fixture.tsx';
function checkFixture(page, layout, cfg) {
  const files = (function walk(d) {
    return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  })(path.join(ROOT, 'app/(result-fixture)'));
  assert(files.every((f) => /\.fixture\.tsx$/.test(f)), `fixture files that are routes in every build: ${files.filter((f) => !/\.fixture\.tsx$/.test(f)).join(', ')}`);
  assert(/pageExtensions: \["tsx", "ts", "jsx", "js", \.\.\.\(process\.env\.EXAM_UX_FIXTURE === "1" \? \["fixture\.tsx"\] : \[\]\)\]/.test(cfg), 'the fixture extension is not flag-only');
  assert(/if \(process\.env\.VERCEL_ENV === "production" \|\| process\.env\.EXAM_UX_FIXTURE !== "1"\) notFound\(\);/.test(page), 'the fixture page lacks the production / flag 404');
  assert(!/createClient|supabase|getServerSession|getSession|getUser|AssessmentService\.|from "@\/services\/(?!assessment\.service")/.test(page.replace(/import type[^\n]*\n/g, '')), 'the fixture reads data (it must be synthetic only)');
  assert(/robots: \{ index: false, follow: false \}/.test(layout), 'the fixture is indexable');
  return `${files.length} files · flag-only · production 404 · noindex · synthetic`;
}

(async () => {
  console.log('RESULT-UX-1 result page (pure rules + real render, fixtures only)');
  await test('R-12 the result fixture never exists in a deployed build and reads no data', () => checkFixture(read(FX_PAGE_REL), read(FX_LAYOUT_REL), read('next.config.ts')));
  await test('R-1 delta vs the previous attempt of the same group', () => checkDelta());
  await test('R-2 trend grouping: same exam + kind + max only; % normalised; Last 5 / All', () => checkGrouping());
  await test('R-3 weak topics: ≥ 2 attempted, ≤ 4, empty state', () => checkWeak());
  await test('R-4 pace: on pace / too slow; hidden without section time', () => checkPace());
  await test('R-5 next steps: valid targets only, fewer when invalid', () => checkSteps());
  await test('R-6 formatting: proper minus, no "% of maximum"', () => checkFormat(SRC.view));
  await test('R-7 review filters: counts, default Wrong, URL parsing, Next wrong', () => checkFilters());
  await test('R-8 verdict: deterministic rules', () => checkVerdict());
  await test('R-9 page: order, labels, one Explanation, Learn, icon actions, URL filters, collapsed past attempts', () => checkPage());
  await test('R-9b no emoji in the rendered result DOM', () => checkNoEmoji([['desktop', render(data())], ['skipped', render(data(), 'filter=skipped')], ['correct', render(data(), 'filter=correct')], ['review mode', render(data(), 'review=1&filter=all&q=1')], ['standing', render(data({ standing: { rank: 1, percentile: 99, n: 50 } }))]]));
  await test('R-10 phone: bar above the student nav; review mode hides the nav; Prev · n / N · Next wrong', () => checkPhone(SRC.view, SRC.css, SRC.nav));

  await test('R-11 negative controls: each broken variant is caught', () => {
    const mut = (s, a, b) => {
      if (!s.includes(a)) throw new Error(`mutation anchor missing: ${a.slice(0, 80)}`);
      return s.split(a).join(b);
    };
    const ux = (src, fn) => () => withOverride({ [UX_REL]: src }, fn);
    const view = (src, fn) => () => withOverride({ [VIEW_REL]: src }, fn);
    const cardM = (src, fn) => () => withOverride({ [CARD_REL]: src }, fn);
    const muts = [
      ['delta shown on the first attempt', ux(mut(SRC.ux, 'if (!g || g.points.length < 2) return null;\n  const cur', 'if (!g) return null;\n  if (g.points.length < 2) return { delta: 0, previous: 0, label: "" };\n  const cur'), checkDelta)],
      ['trend mixes max marks', ux(mut(SRC.ux, 'return `${r.examId}|${r.mockKind}|${Number(Number(r.maxScore).toFixed(2))}`;', 'return `${r.examId}|${r.mockKind}`;'), checkGrouping)],
      ['trend mixes kinds (daily with full)', ux(mut(SRC.ux, 'return `${r.examId}|${r.mockKind}|${Number(Number(r.maxScore).toFixed(2))}`;', 'return `${r.examId}|${Number(Number(r.maxScore).toFixed(2))}`;'), checkGrouping)],
      ['trend in raw score, not %', ux(mut(SRC.ux, 'pct: Number(((Number(r.score) / Number(r.maxScore)) * 100).toFixed(1)),', 'pct: Number(r.score),'), checkGrouping)],
      ['weak topics from one question', ux(mut(SRC.ux, 'export const WEAK_MIN_ATTEMPTED = 2;', 'export const WEAK_MIN_ATTEMPTED = 1;'), checkWeak)],
      ['more than 4 weak topics', ux(mut(SRC.ux, 'export const WEAK_MAX = 4;', 'export const WEAK_MAX = 6;'), checkWeak)],
      ['pace never "too slow"', ux(mut(SRC.ux, 'per > ideal * PACE_TOLERANCE ? "too slow" : "on pace"', '"on pace"'), checkPace)],
      ['Practice for a topic that cannot be practised', ux(mut(SRC.ux, 'const can = input.weak.filter((t) => input.practiceTopicIds.has(t.topicId));', 'const can = input.weak;'), checkSteps)],
      ['always 3 steps (filler)', ux(mut(SRC.ux, '  return out.slice(0, 3);\n}', '  while (out.length < 3) out.push({ kind: "mistakes", title: "Keep going", detail: "", href: "/", cta: "Open" });\n  return out.slice(0, 3);\n}'), checkSteps)],
      ['hyphen instead of the proper minus', ux(mut(SRC.ux, 'export const MINUS = "−";', 'export const MINUS = "-";'), checkFormat.bind(null, SRC.view))],
      ['"% of maximum" back', () => checkFormat(SRC.view + '\n// {formatPercent(scorePct)} of the maximum\n')],
      ['filter opens on All with wrong answers', ux(mut(SRC.ux, 'return counts.wrong > 0 ? "wrong" : "all";', 'return "all";'), checkFilters)],
      ['URL filter trusted as-is', ux(mut(SRC.ux, 'const filter = UX_FILTERS.some((x) => x.value === f) ? (f as UxFilter) : defaultFilter(counts);', 'const filter = (f || defaultFilter(counts)) as UxFilter;'), checkFilters)],
      ['"Here\'s why" back in the card', cardM(mut(SRC.card, '>Explanation</h4>', '>{state === "wrong" ? "Here\'s why" : "Explanation"}</h4>'), checkPage)],
      ['labels only by colour (no "Your answer" text)', cardM(mut(SRC.card, '{wrongMine ? "✕ " : right ? "✓ " : ""}Your answer', '{""}'), checkPage)],
      ['skipped without "Not answered"', cardM(mut(SRC.card, '            Not answered\n', '\n'), checkPage)],
      ['Mistake Vault icon on every question', cardM(mut(SRC.card, '{state === "wrong" && (\n          <Tooltip content="Saved in Mistake Vault"', '{true && (\n          <Tooltip content="Saved in Mistake Vault"'), checkPage)],
      ['icon button without aria-label', cardM(mut(SRC.card, 'aria-label="Saved in Mistake Vault" ', ''), checkPage)],
      ['past attempts open by default', view(mut(SRC.view, 'const [open, setOpen] = useState(false);\n  return (\n    <section id="past-attempts"', 'const [open, setOpen] = useState(true);\n  return (\n    <section id="past-attempts"'), checkPage)],
      ['Re-attempt shown', view(mut(SRC.view, '<JumpBar items={jump} />', '<JumpBar items={jump} />\n        <a href={`/mock-tests/${test.id}`}>Re-attempt</a>'), checkPage)],
      ['a second h1', view(mut(SRC.view, '<h2 id="summary-title" className="sr-only">', '<h1 className="sr-only">x</h1>\n          <h2 id="summary-title" className="sr-only">'), checkPage)],
      ['emoji in the UI', view(mut(SRC.view, 'Rank &amp; percentile appear once enough students take this mock', 'Rank &amp; percentile appear once enough students take this mock \u{1F3C6}'), () => checkNoEmoji([['desktop', render(data())]]))],
      ['bar covers the student nav', () => checkPhone(mut(SRC.view, 'bottom-[calc(68px+env(safe-area-inset-bottom,0px))]', 'bottom-0'), SRC.css, SRC.nav)],
      ['review mode keeps the student nav', () => checkPhone(SRC.view, mut(SRC.css, '    display: none;', '    display: flex;'), SRC.nav)],
      ['bar above the nav layer (its raised button hidden / blocking)', () => checkPhone(mut(SRC.view, 'z-[29] border-t border-cl-line bg-cl-white px-4 pt-2 pb-9', 'z-30 border-t border-cl-line bg-cl-white px-4 py-2'), SRC.css, SRC.nav)],
      ['result fixture without the production 404', () => checkFixture(mut(read(FX_PAGE_REL), 'process.env.VERCEL_ENV === "production" || ', ''), read(FX_LAYOUT_REL), read('next.config.ts'))],
      ['result fixture reads the session', () => checkFixture('import { getServerSession } from "@/lib/auth/session";\n' + read(FX_PAGE_REL), read(FX_LAYOUT_REL), read('next.config.ts'))],
      ['result fixture indexable', () => checkFixture(read(FX_PAGE_REL), mut(read(FX_LAYOUT_REL), 'robots: { index: false, follow: false }', 'robots: { index: true }'), read('next.config.ts'))],
    ];
    const missed = [];
    for (const [name, run] of muts) {
      try {
        run();
        missed.push(name);
      } catch (e) {
        if (/mutation anchor missing/.test(String(e && e.message))) missed.push(`${name} (${e.message})`);
      }
    }
    assert(missed.length === 0, `not caught: ${missed.join('; ')}`);
    return `${muts.length}/${muts.length} broken variants caught`;
  });

  console.log(results.join('\n'));
  console.log(`\nRESULT-UX-1: ${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
})();
