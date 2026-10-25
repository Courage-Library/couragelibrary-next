#!/usr/bin/env node
/**
 * LEADERBOARD-GATE-1 (R12). Offline gate (TS transpile + static render; no DB, no server):
 *   LB-01 ranks only from ≥ RANK_MIN_COHORT real students' first attempts (test accounts, retakes excluded)
 *   LB-02 public rows only for opted-in students; the viewer's own rank is private; rank = 1 + higher scores (same rule
 *         as the result page's standing)
 *   LB-03 page: "not_enough" shows no rank, number, podium or average; "ranked" states n; opt-in default off, own choice
 *   LB-05 architect ruling: auth user_metadata never affects the leaderboard (#60)
 *   LB-04 service: fails closed (accounts unreadable → not_enough); no average / topper / podium / unthresholded rank
 * Run: node scripts/test_leaderboard_gate1.cjs
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
    console.log(`  FAIL  ${name}\n        ${String(e && e.message ? e.message : e).slice(0, 1200)}`);
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
  const out = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } });
  module._compile(out.outputText, filename);
};
require.extensions['.ts'] = transpile;
require.extensions['.tsx'] = transpile;
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const h = React.createElement;
const MOCKS = {
  'next/link': { __esModule: true, default: ({ href, children, prefetch: _p, ...rest }) => h('a', { href, ...rest }, children) },
};
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (Object.prototype.hasOwnProperty.call(MOCKS, request)) return MOCKS[request];
  return origLoad.call(this, request, parent, isMain);
};

const LB = require(path.join(ROOT, 'lib/assessment/leaderboard.ts'));
const RA = require(path.join(ROOT, 'lib/assessment/result-analysis.ts'));
const row = (i, score, o = {}) => ({ userId: `u${i}`, score, accuracy: 50, timeSeconds: 600, createdAt: `2026-10-01T00:${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}Z`, isTestAccount: false, optedIn: i % 3 === 0, ...o });

(async () => {
  await test('LB-01 ranks only from ≥ 30 real first attempts', () => {
    assert(LB.leaderboardView(Array.from({ length: 29 }, (_, i) => row(i, i)), 'u1').state === 'not_enough', '29 → not_enough');
    const padded = [...Array.from({ length: 28 }, (_, i) => row(i, i)), row(90, 5, { isTestAccount: true }), row(91, 6, { isTestAccount: true }), { ...row(2, 99), createdAt: '2026-12-01T00:00:00Z' }];
    assert(LB.leaderboardView(padded, null).state === 'not_enough', 'test accounts + a retake do not reach 30');
    const v = LB.leaderboardView(Array.from({ length: 30 }, (_, i) => row(i, i)), null);
    assert(v.state === 'ranked' && v.n === 30, 'n = 30');
  });

  await test('LB-02 opted-in rows only; viewer rank private; same rank rule as the result page', () => {
    const rows = Array.from({ length: 30 }, (_, i) => row(i, i));
    const v = LB.leaderboardView(rows, 'u10');
    assert(v.entries.every((e) => Number(e.userId.slice(1)) % 3 === 0) && v.entries.length === 10, 'only opted-in listed');
    assert(v.viewer && v.viewer.rank === 20 && v.viewer.optedIn === false && !v.entries.some((e) => e.userId === 'u10'), 'viewer sees own rank, not listed');
    const st = RA.cohortStanding(rows.map((r) => ({ userId: r.userId, score: r.score, createdAt: r.createdAt, isTestAccount: false })), 'u10', 10);
    assert(st.rank === v.viewer.rank && st.n === v.n, 'same rank / n as the result page');
    assert(v.entries[0].userId === 'u27' && v.entries[0].rank === 3 && v.entries.at(-1).rank === 30, `listed by real rank (u27 is 3rd: u28, u29 are not opted in): ${v.entries[0].userId}#${v.entries[0].rank}`);
  });

  await test('LB-03 page: not_enough has no numbers / ranks; ranked states n; opt-in toggle default off', () => {
    const { LeaderboardViewClient } = require(path.join(ROOT, 'components/assessment/leaderboard-view-client.tsx'));
    const test = { id: 'm1', title: 'SSC Mock', durationMinutes: 60, totalMarks: 50, totalQuestions: 25 };
    const ne = renderToStaticMarkup(h(LeaderboardViewClient, { data: { test, view: { state: 'not_enough' }, viewerOptedIn: false } }));
    const t = ne.replace(/<[^>]+>/g, ' ');
    assert(/Not enough students yet/.test(t) && !/\b(rank|#\d|average|topper|podium|participants?)\b/i.test(t.replace('Ranks appear', '')) && !/\d/.test(t.replace(/SSC Mock/, '')), 'not_enough shows no ranks / numbers');
    assert(!/data-leaderboard-optin/.test(ne), 'no opt-in toggle until migration 096 (fn_set_leaderboard_opt_in)');
    const ranked = renderToStaticMarkup(h(LeaderboardViewClient, { data: { test, view: { state: 'ranked', n: 31, entries: [{ rank: 1, displayName: 'R*** S****', score: 40, maxScore: 50, accuracyPercentage: 80, timeSpentSeconds: 1800, isCurrentUser: false }], viewer: { rank: 7, displayName: 'You', score: 30, maxScore: 50, accuracyPercentage: 60, timeSpentSeconds: 1700, isCurrentUser: true, optedIn: false } }, viewerOptedIn: false } }));
    const rt = ranked.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    assert(rt.includes('Ranks among 31 students') && rt.includes('Your rank: 7 of 31') && rt.includes('(only you can see this)'), 'n stated; private viewer rank');
    const signedOut = renderToStaticMarkup(h(LeaderboardViewClient, { data: { test, view: { state: 'not_enough' }, viewerOptedIn: null } }));
  });

  await test('LB-04 service fails closed; no average / topper / podium / unthresholded rank', () => {
    const svc = code(read('services/assessment.service.ts'));
    const fn = svc.slice(svc.indexOf('static async getTestLeaderboard('), svc.indexOf('\n  }\n', svc.indexOf('static async getTestLeaderboard(')));
    assert(/if \(new Set\(results\.map\(\(r\) => r\.user_id\)\)\.size < RANK_MIN_COHORT\) return notEnough;/.test(fn) && /if \(!flags\) return notEnough;/.test(fn), 'threshold + fail closed');
    assert(/leaderboardView\(/.test(fn) && !/averageScore|topScore|podium|totalParticipants/.test(fn), 'only the gated view');
    assert(/const optIns = await AssessmentService\.leaderboardOptIns\(\);/.test(fn) && /optedIn: optIns\.has\(r\.user_id\)/.test(fn), 'opt-in from the profile column source only');
  });

  await test('LB-05 architect ruling: auth user_metadata never affects the leaderboard (#60)', () => {
    const files = ['lib/assessment/leaderboard.ts', 'app/mock-tests/[id]/leaderboard/page.tsx', 'components/assessment/leaderboard-view-client.tsx'];
    for (const f of files) assert(!/user_metadata|updateUser/.test(code(read(f))), `${f} touches user_metadata`);
    assert(!fs.existsSync(path.join(ROOT, 'app/mock-tests/[id]/leaderboard/actions.ts')), 'metadata opt-in action removed');
    const svc = code(read('services/assessment.service.ts'));
    const flags = svc.slice(svc.indexOf('private static async accountFlags('), svc.indexOf('private static async leaderboardOptIns('));
    assert(/out\.set\(u\.id, \{ isTest: isTestAccountEmail\(u\.email\) \}\);/.test(flags) && !/user_metadata/.test(flags), 'account flags read the e-mail domain only, never user_metadata');
    // a student with user_metadata.leaderboard_opt_in = true is still not listed: the view only knows optedIn from the column source
    const rows = Array.from({ length: 30 }, (_, i) => ({ userId: `u${i}`, score: i, accuracy: 50, timeSeconds: 1, createdAt: `2026-10-01T00:00:${String(i).padStart(2, '0')}Z`, isTestAccount: false, optedIn: false, user_metadata: { leaderboard_opt_in: true } }));
    const v = LB.leaderboardView(rows, null);
    assert(v.state === 'ranked' && v.entries.length === 0, 'metadata opt-in ignored');
  });

  console.log(`\nLEADERBOARD-GATE-1: ${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
})();
