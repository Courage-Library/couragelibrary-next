#!/usr/bin/env node
/**
 * F4 — result & analysis page (R1, R3, R4, R5, R10, R12). Offline gate: TS transpile + module mocks + static render.
 *   F4-01 takeaway rules are deterministic: biggest topic loss → pacing → penalty → 2nd topic; ≤ 3; exact marks
 *   F4-02 topic takeaway links to F2 topic practice only when the topic can be practised; else a review filter
 *   F4-03 pacing / penalty thresholds (end-of-paper skips, time ran out, negative marking share) and the fallbacks
 *   F4-04 percentile threshold: null below RANK_MIN_COHORT real students (test accounts / retakes excluded); exact rank
 *   F4-05 trend: abandoned attempts never shown; null below 2; a later retake is not "previous"
 *   F4-06 review filters All / Wrong / Skipped / Marked (keyless questions never "wrong")
 *   F4-07 page: section order, ONE primary action, at most one amber, standing omitted entirely when null, no
 *         fabricated numbers (score card shows the server values; no average / topper / estimated rank)
 *   F4-08 builder: standing from cohortStanding (fail closed), trend excludes abandoned, practice links behind the flag
 * Run: node scripts/test_f4_result.cjs
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
    console.log(`  FAIL  ${name}\n        ${String(e && e.message ? e.message : e).slice(0, 1500)}`);
  }
}
const assert = (c, m) => {
  if (!c) throw new Error(m || 'assertion failed');
};
const eq = (a, b, m) => assert(JSON.stringify(a) === JSON.stringify(b), `${m || 'not equal'}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`);

// ---------- TS loader + mocks ----------
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
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const h = React.createElement;
const MOCKS = {
  'server-only': {},
  'next/link': { __esModule: true, default: ({ href, children, prefetch: _p, ...rest }) => h('a', { href, ...rest }, children) },
  '@/components/practice/report-question-button': { ReportQuestionButton: () => h('button', { 'data-report-question': '' }, 'Report this question') },
};
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (Object.prototype.hasOwnProperty.call(MOCKS, request)) return MOCKS[request];
  return origLoad.call(this, request, parent, isMain);
};

const RA = require(path.join(ROOT, 'lib/assessment/result-analysis.ts'));
const { RANK_MIN_COHORT } = require(path.join(ROOT, 'lib/assessment/display-rules.ts'));

// ---------- fixtures ----------
const T = { td: 'aaaaaaaa-0000-4000-8000-000000000001', pct: 'aaaaaaaa-0000-4000-8000-000000000002', syn: 'aaaaaaaa-0000-4000-8000-000000000003' };
let order = 0;
const q = (o) => ({
  questionOrder: ++order,
  sectionName: 'Quantitative Aptitude',
  topicId: null,
  topicName: null,
  selectedOption: 'A',
  correctOption: 'A',
  isCorrect: true,
  isMarked: false,
  marks: 2,
  marksAwarded: 2,
  ...o,
});
const wrong = (o) => q({ selectedOption: 'B', isCorrect: false, marksAwarded: -0.5, ...o });
const skip = (o) => q({ selectedOption: null, isCorrect: false, marksAwarded: 0, ...o });
function paper() {
  order = 0;
  return [
    // Time & Distance: 5 of 9 wrong → lost 5 × (2 + 0.5) = 12.5
    ...[1, 2, 3, 4].map(() => q({ topicId: T.td, topicName: 'Time and Distance' })),
    ...[1, 2, 3, 4, 5].map(() => wrong({ topicId: T.td, topicName: 'Time and Distance' })),
    // Percentage: 2 of 3 wrong → lost 5
    q({ topicId: T.pct, topicName: 'Percentage' }),
    ...[1, 2].map(() => wrong({ topicId: T.pct, topicName: 'Percentage' })),
    // Synonyms: 1 wrong only (below topicMinWrong)
    wrong({ sectionName: 'English', topicId: T.syn, topicName: 'Synonyms' }),
    // keyless question answered: never "wrong"
    q({ correctOption: null, selectedOption: 'C', isCorrect: false, marksAwarded: 0, topicId: T.syn, topicName: 'Synonyms' }),
    ...Array.from({ length: 6 }, () => q({ sectionName: 'English' })),
    // end of the paper: 4 skipped in the last 5 (tail = max(5, ceil(25 × 0.2)) = 5)
    q({ sectionName: 'English', isMarked: true }),
    ...[1, 2, 3, 4].map(() => skip({ sectionName: 'English', isMarked: false })),
  ];
}
const input = (o = {}) => ({ questions: paper(), maxScore: 50, accuracyPercentage: 61.9, timeUsedSeconds: 1200, durationMinutes: 60, examSlug: 'ssc-cgl', practiceTopicIds: new Set([T.td]), ...o });

(async () => {
  await test('F4-01 takeaways are deterministic, ordered and exact', () => {
    const a = RA.buildTakeaways(input());
    const b = RA.buildTakeaways(input());
    eq(a, b, 'same attempt → same takeaways');
    eq(a.map((t) => t.kind), ['TOPIC', 'PACING', 'PENALTY'], 'order');
    assert(a.length <= 3, '≤ 3');
    assert(a[0].text === 'Time and Distance (Quantitative Aptitude) cost you 12.5 marks: 5 of 9 wrong.', a[0].text);
    assert(a[1].text.startsWith('You left 4 of the last 5 questions unanswered.'), a[1].text);
    // penalty: 8 wrong (keyless excluded) × 0.5 = 4 ≥ 5% of 50 (2.5)
    assert(a[2].text.startsWith('Negative marking cost you 4 marks on 8 wrong answers (accuracy 61.9%).'), a[2].text);
    eq(RA.negativeMarksLost(paper()), 4, 'negative marks lost from evaluated marks');
    const losses = RA.topicLosses(paper());
    eq(losses.map((t) => [t.topicName, t.wrong, t.total, t.lost]), [['Time and Distance', 5, 9, 12.5], ['Percentage', 2, 3, 5]], 'topic losses (Synonyms: 1 wrong, keyless excluded)');
    // tie-break: equal loss → more wrong → name
    const tie = RA.topicLosses([wrong({ topicId: 'b', topicName: 'Beta', marks: 3, marksAwarded: -1 }), wrong({ topicId: 'b', topicName: 'Beta', marks: 3, marksAwarded: -1 }), wrong({ topicId: 'a', topicName: 'Alpha', marks: 3, marksAwarded: -1 }), wrong({ topicId: 'a', topicName: 'Alpha', marks: 3, marksAwarded: -1 })]);
    eq(tie.map((t) => t.topicName), ['Alpha', 'Beta'], 'tie broken by name');
    return a.map((t) => t.kind).join(' → ');
  });

  await test('F4-02 practice link only when the topic can be practised; primary = top takeaway action', () => {
    const a = RA.buildTakeaways(input());
    eq(a[0].action, { kind: 'practice', href: '/practice/session?topic=aaaaaaaa-0000-4000-8000-000000000001&exam=ssc-cgl&n=10', label: 'Practise Time and Distance' }, 'practice action');
    eq(RA.primaryAction(a), a[0].action, 'primary = top takeaway action');
    const off = RA.buildTakeaways(input({ practiceTopicIds: new Set() }));
    eq(off[0].action, { kind: 'filter', filter: 'wrong', label: 'Review wrong answers' }, 'no practice → review filter, never a dead link');
    // 2nd topic fills the 3rd slot when pacing or penalty does not qualify
    const calm = RA.buildTakeaways(input({ questions: paper().map((x) => (x.selectedOption === null ? { ...x, selectedOption: 'A', isCorrect: true, marksAwarded: 2 } : x)), maxScore: 500 }));
    eq(calm.map((t) => t.kind), ['TOPIC', 'TOPIC'], 'no pacing / penalty → two topics');
    assert(calm[1].text.startsWith('Percentage (Quantitative Aptitude) cost you 5 marks: 2 of 3 wrong.'), calm[1].text);
  });

  await test('F4-03 pacing / penalty thresholds and fallbacks', () => {
    // time ran out (≥ 98%) with 3 skipped spread out (not end-heavy)
    order = 0;
    const spread = [skip(), ...Array.from({ length: 8 }, () => q()), skip(), ...Array.from({ length: 8 }, () => q()), skip(), ...Array.from({ length: 6 }, () => q())];
    const base = { questions: spread, maxScore: 50, accuracyPercentage: 100, durationMinutes: 60, examSlug: null, practiceTopicIds: new Set() };
    assert(RA.pacingTakeaway({ ...base, timeUsedSeconds: 3000 }) === null, 'not end-heavy, time left → no pacing');
    const ran = RA.pacingTakeaway({ ...base, timeUsedSeconds: 3600 * 0.98 });
    assert(ran && ran.text.startsWith('Time ran out with 3 questions unanswered.'), ran && ran.text);
    // penalty below 5% of max → none
    assert(RA.penaltyTakeaway(input({ maxScore: 200 })) === null, 'penalty under 5% of max');
    // fallbacks
    order = 0;
    eq(RA.buildTakeaways({ ...base, questions: [wrong(), q(), q()], timeUsedSeconds: 10 }).map((t) => [t.kind, t.text]), [['REVIEW', 'Read the explanation for each of your 1 wrong answer.']], 'review fallback');
    order = 0;
    eq(RA.buildTakeaways({ ...base, questions: [q(), q()], timeUsedSeconds: 10 }).map((t) => [t.kind, t.action]), [['CLEAN', null]], 'clean: no action');
  });

  await test('F4-04 percentile only from ≥ RANK_MIN_COHORT real students; exact rank', () => {
    assert(RANK_MIN_COHORT === 30, 'threshold 30');
    const row = (i, score, extra = {}) => ({ userId: `u${i}`, score, createdAt: `2026-10-${String(1 + (i % 28)).padStart(2, '0')}T00:00:${String(i % 60).padStart(2, '0')}Z`, isTestAccount: false, ...extra });
    const twentyNine = Array.from({ length: 29 }, (_, i) => row(i, i));
    assert(RA.cohortStanding(twentyNine, 'u5', 5) === null, '29 students → omitted');
    // 30 rows but one is a QA account and one student appears twice (retake) → 28 real students → omitted
    const padded = [...Array.from({ length: 28 }, (_, i) => row(i, i)), row(90, 50, { isTestAccount: true }), { ...row(3, 99), createdAt: '2026-11-30T00:00:00Z' }];
    assert(RA.cohortStanding(padded, 'u3', 3) === null, 'test accounts + retakes do not count toward n');
    const thirty = Array.from({ length: 30 }, (_, i) => row(i, i));
    eq(RA.cohortStanding(thirty, 'u10', 10), { rank: 20, percentile: 34, n: 30 }, '30 students: 19 higher, 10 of 29 others lower');
    eq(RA.cohortStanding(thirty, 'u29', 29), { rank: 1, percentile: 100, n: 30 }, 'top');
    assert(RA.isTestAccountEmail('qa-student@courage-library.test') && !RA.isTestAccountEmail('someone@example.com'), '.test domain = test account');
    return 'n<30 → null; n=30 exact';
  });

  await test('F4-05 trend: abandoned never shown, null below 2, later retakes excluded', () => {
    const r = (id, status, at, score) => ({ attemptId: id, status, mockTitle: `Mock ${id}`, submittedAt: at, score, maxScore: 100, accuracy: 50 });
    eq(RA.buildTrend([r('a', 'abandoned', '2026-10-01', 10), r('b', 'submitted', '2026-10-02', 20)], 'b'), null, 'one scored attempt (the other abandoned) → null');
    const t = RA.buildTrend([r('a', 'submitted', '2026-10-01', 10), r('x', 'abandoned', '2026-10-02', 99), r('b', 'submitted', '2026-10-03', 40), r('c', 'submitted', '2026-10-04', 70)], 'b');
    eq(t.map((p) => [p.attemptId, p.scorePct, p.isCurrent]), [['a', 10, false], ['b', 40, true]], 'abandoned excluded; later retake c not "previous"');
  });

  await test('F4-06 review filters', () => {
    const qs = paper();
    const c = RA.reviewCounts(qs);
    eq(c, { all: 25, wrong: 8, skipped: 4, marked: 1 }, 'counts');
    assert(RA.filterReview(qs, 'wrong').every((x) => x.correctOption !== null && x.selectedOption !== null && !x.isCorrect), 'wrong = answered, keyed, incorrect');
    assert(!RA.filterReview(qs, 'wrong').some((x) => x.correctOption === null), 'keyless never wrong');
    eq(RA.filterReview(qs, 'marked').length, 1, 'marked');
    eq(RA.REVIEW_FILTERS.map((f) => f.label), ['All', 'Wrong', 'Skipped', 'Marked'], 'filter labels');
  });

  // ---------- page render ----------
  const { ResultViewClient } = require(path.join(ROOT, 'components/assessment/result-view-client.tsx'));
  const review = paper().map((x, i) => ({ ...x, mockQuestionId: `mq${i}`, questionId: null, questionVersionId: null, questionText: `Question ${i + 1}`, options: [{ key: 'A', text: 'a' }, { key: 'B', text: 'b' }], explanation: null, topicSlug: null }));
  const fixture = (o = {}) => ({
    result: { id: 'r', attemptId: 'att', totalQuestions: 24, attemptedCount: 20, correctCount: 12, incorrectCount: 8, unansweredCount: 4, totalScore: 20, maxScore: 48, accuracyPercentage: 60, timeSpentSeconds: 2730, rank: null, percentile: null },
    test: { id: 'mock1', title: 'SSC CGL Mock 1', durationMinutes: 60, totalQuestions: 25, totalMarks: 50 },
    standing: null,
    security: { candidateId: 'u', maskedId: 'CL••••ABCD', attemptIdShort: 'ATT123', examTitle: 'SSC CGL Mock 1', timestamp: '25 Oct 2026, 4:30 pm' },
    rewards: null,
    insights: { strongestSection: null, weakestSection: null, accuracyLevel: '', speedSecondsPerQuestion: 0, reviewCount: 8 },
    analysis: { negativeMarksLost: 4, takeaways: RA.buildTakeaways(input()), trend: null, examSlug: 'ssc-cgl' },
    sections: [
      { id: 's1', sectionName: 'Quantitative Aptitude', totalQuestions: 12, attemptedCount: 12, correctCount: 5, incorrectCount: 7, unansweredCount: 0, sectionScore: 6.5, maxScore: 24, accuracyPercentage: 41.67, timeSpentSeconds: 1500 },
      { id: 's2', sectionName: 'English', totalQuestions: 12, attemptedCount: 8, correctCount: 7, incorrectCount: 1, unansweredCount: 4, sectionScore: 13.5, maxScore: 24, accuracyPercentage: 87.5, timeSpentSeconds: 1230 },
    ],
    reviewQuestions: review,
    ...o,
  });
  const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

  await test('F4-07 page: order, one primary, ≤ 1 amber, standing omitted when null, server numbers only', () => {
    const html = renderToStaticMarkup(h(ResultViewClient, { data: fixture() }));
    const order = [...html.matchAll(/data-result-section="(\w+)"/g)].map((m) => m[1]);
    eq(order, ['score', 'next', 'sections', 'review'], 'section order (no trend, no standing)');
    eq((html.match(/data-takeaway-action="primary"/g) || []).length, 1, 'exactly one primary action');
    assert(/data-takeaway-action="primary"[^>]*>|href="\/practice\/session\?topic=aaaaaaaa-0000-4000-8000-000000000001&amp;exam=ssc-cgl&amp;n=10"[^>]*data-takeaway-action="primary"/.test(html), 'primary = top takeaway practice link');
    const ambers = html.match(/\b(?:bg|text|border|border-l|from|to|via|ring)-(?:accent|amber|yellow|warning)-\d+/g) || [];
    assert(ambers.length <= 1, `ambers: ${ambers.join(', ')}`);
    const t = text(html);
    assert(!/\b(rank|percentile|leaderboard|average|topper|highest score|all india)\b/i.test(t), 'no standing / cohort numbers when standing is null');
    for (const s of ['20 / 48', '60%', '20 of 24', 'Negative marks lost −4', 'Time used 46 min of 1 h', 'Skipped 4', 'Wrong 8', 'Correct 12']) assert(t.includes(s), `score card misses "${s}"`);
    assert(t.includes('6.5 / 24') && t.includes('Accuracy 41.7%') && t.includes('25 min'), 'section numbers visible (not colour-only)');
    assert(t.includes('All (25)') && t.includes('Wrong (8)') && t.includes('Skipped (4)') && t.includes('Marked (1)'), 'filter counts');
    // trend + standing render only with data
    const withAll = renderToStaticMarkup(h(ResultViewClient, { data: fixture({ standing: { rank: 20, percentile: 34, n: 30 }, analysis: { ...fixture().analysis, trend: RA.buildTrend([{ attemptId: 'p', status: 'submitted', mockTitle: 'Mock 0', submittedAt: '2026-10-01T10:00:00Z', score: 10, maxScore: 48, accuracy: 40 }, { attemptId: 'att', status: 'submitted', mockTitle: 'SSC CGL Mock 1', submittedAt: '2026-10-25T10:00:00Z', score: 20, maxScore: 48, accuracy: 60 }], 'att') } }) }));
    eq([...withAll.matchAll(/data-result-section="(\w+)"/g)].map((m) => m[1]), ['score', 'next', 'sections', 'trend', 'review', 'standing'], 'full order');
    const tw = text(withAll);
    assert(tw.includes('20 of 30') && tw.includes('first attempts of 30 students'), 'standing states n');
    assert(tw.includes('(this attempt)') && tw.includes('10 / 48 (20.8%)'), 'trend rows with numbers');
    return `${order.join(' → ')}; ambers ${ambers.length}`;
  });

  await test('F4-08 builder wiring: cohort gate (fail closed), abandoned excluded, practice behind the flag', () => {
    const svc = code(read('services/assessment.service.ts'));
    const fn = svc.slice(svc.indexOf('static async getTestResult('), svc.indexOf('static async getTestLeaderboard('));
    assert(/const standing = await AssessmentService\.realCohortStanding\(adminSb, cohortRows, candidateUserId, Number\(r\.total_score\)\);/.test(fn), 'standing from the real cohort');
    assert(/if \(users\.size < RANK_MIN_COHORT\) return null;/.test(fn) && /if \(error\) return null;/.test(fn) && /catch \{\s*return null;\s*\}/.test(fn), 'cohort gate fails closed');
    assert(!/totalParticipants|averageScore|topScore|Math\.max\(1, rankedCandidates/.test(fn), 'old unthresholded standing removed');
    assert(/status: att\.get\(x\.attempt_id\)\?\.status \?\? "abandoned"/.test(fn) && /buildTrend\(/.test(fn), 'trend: unknown / abandoned attempts excluded');
    assert(/if \(isPracticeEnabled\(\) && wrongTopicIds\.length > 0\)/.test(fn) && /servableTopicCounts\(sb, wrongTopicIds\)/.test(fn), 'practice links only with practice on and servable questions');
    assert(/rank: standing\?\.rank \?\? null,\s*percentile: standing\?\.percentile \?\? null,/.test(fn), 'result.rank / percentile only from the standing');
    const card = code(read('components/assessment/question-review-card.tsx'));
    assert(!/\/practice\?topic=/.test(card) && /Learn more/.test(card) && /<ReportQuestionButton/.test(card), 'review card: report kept, "Learn more", no dead practice link');
  });

  console.log(`\nF4 result: ${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
})();
