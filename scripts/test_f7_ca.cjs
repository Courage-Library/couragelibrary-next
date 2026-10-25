#!/usr/bin/env node
/**
 * F7 — Current Affairs candidate polish + Daily 10Q in the design system (R4, R8, R10, R12). Offline gate:
 *   CA-01 quiz card: only a PUBLISHED quiz mock; figures only from the mock itself (no hard-coded "10 questions /
 *         20 marks / +2 −0.5 / instant"); ONE primary; light, no gradient / glow / amber
 *   CA-02 dailyQuizShape: published mocks only; bad id / missing / non-positive values → null (no guessed figures)
 *   CA-03 candidate CA pages: no 9–11 px text, no pulse, no amber, no prediction claims ("High Probability",
 *         "HIGH YIELD"); day strip / filter pills / archive links ≥ 48 px
 *   CA-04 published-only + wrong answers → Mistake Vault: the card links to the standard mock player, whose one submit
 *         path records every wrong answer through MistakeService (Memory Lock picks them up via the vault — F5)
 * Run: node scripts/test_f7_ca.cjs
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
let row = null;
const MOCKS = {
  'server-only': {},
  'next/link': { __esModule: true, default: ({ href, children, ...rest }) => h('a', { href, ...rest }, children) },
  '@/lib/supabase/server': {
    createPublicServerSupabaseClient: () => {
      const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: row }) };
      return { from: () => q };
    },
  },
};
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (Object.prototype.hasOwnProperty.call(MOCKS, request)) return MOCKS[request];
  return origLoad.call(this, request, parent, isMain);
};
const MOCK_ID = '11111111-2222-4333-8444-555555555555';
const quiz = (status, mockTestId = MOCK_ID) => ({ status, totalEligibleCount: 10, requiredCount: 10, shortageCount: 0, mockTestSlug: 'daily', mockTestId });
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

(async () => {
  await test('CA-01 quiz card: published only, real figures only, one primary, light', () => {
    const { CurrentAffairsDailyQuizCard } = require(path.join(ROOT, 'components/current-affairs/current-affairs-daily-quiz-card.tsx'));
    for (const st of ['READY', 'DRAFT_EXISTS', 'INSUFFICIENT']) assert(renderToStaticMarkup(h(CurrentAffairsDailyQuizCard, { dateStr: '2026-10-25', dailyQuiz: quiz(st) })) === '', `${st} renders nothing`);
    assert(renderToStaticMarkup(h(CurrentAffairsDailyQuizCard, { dateStr: '2026-10-25', dailyQuiz: quiz('ALREADY_PUBLISHED', null) })) === '', 'no mock id → nothing');
    const withShape = renderToStaticMarkup(h(CurrentAffairsDailyQuizCard, { dateStr: '2026-10-25', dailyQuiz: quiz('ALREADY_PUBLISHED'), shape: { totalQuestions: 12, durationMinutes: 15, totalMarks: 24 } }));
    assert(text(withShape).includes('12 questions · 15 min · 24 marks') && withShape.includes(`href="/mock-tests/${MOCK_ID}"`), 'figures from the mock');
    const noShape = renderToStaticMarkup(h(CurrentAffairsDailyQuizCard, { dateStr: '2026-10-25', dailyQuiz: quiz('ALREADY_PUBLISHED'), shape: null }));
    assert(!/data-daily-quiz-facts/.test(noShape) && !/\d+\s*(questions|min|marks)/i.test(text(noShape).replace(/\d{1,2} \w{3} \d{4}/, '')), 'no shape → no figures');
    const src = code(read('components/current-affairs/current-affairs-daily-quiz-card.tsx'));
    assert(!/10 Questions|10 Minutes|20 Marks|\+2 \/ -0\.5|Instant Result|EVALUATION/i.test(src), 'no hard-coded quiz facts / claims');
    assert(!/bg-gradient|blur-3xl|amber-|accent-|animate-|hover:scale/.test(src), 'light, calm card');
    assert((withShape.match(/<a /g) || []).length === 1 && /min-h-12/.test(withShape), 'ONE primary link, ≥ 48 px');
    assert(/const isAvailable = dailyQuiz\.status === 'ALREADY_PUBLISHED' && Boolean\(dailyQuiz\.mockTestId\);\s*if \(!isAvailable\) return null;/.test(src), 'UX-2b.H guard kept');
  });

  await test('CA-02 dailyQuizShape: published mocks only; no guessed figures', async () => {
    const { dailyQuizShape } = require(path.join(ROOT, 'lib/current-affairs/daily-quiz.ts'));
    row = { total_questions: 10, duration_minutes: 10, total_marks: 20, status: 'published' };
    assert(JSON.stringify(await dailyQuizShape(MOCK_ID)) === JSON.stringify({ totalQuestions: 10, durationMinutes: 10, totalMarks: 20 }), 'published');
    row = { ...row, status: 'draft' };
    assert((await dailyQuizShape(MOCK_ID)) === null, 'draft → null');
    row = { total_questions: 0, duration_minutes: 10, total_marks: 20, status: 'published' };
    assert((await dailyQuizShape(MOCK_ID)) === null, 'zero value → null');
    assert((await dailyQuizShape('x')) === null && (await dailyQuizShape(null)) === null, 'bad id → null');
    assert(/const quizShape = dailyQuiz\.status === 'ALREADY_PUBLISHED' \? await dailyQuizShape\(dailyQuiz\.mockTestId\) : null;/.test(read('app/current-affairs/page.tsx')) && /shape=\{quizShape\}/.test(read('app/current-affairs/page.tsx')), 'hub passes the real shape');
  });

  await test('CA-03 candidate CA pages: no tiny text, pulse, amber or prediction claims; 48 px targets', () => {
    const files = ['app/current-affairs/page.tsx', 'app/current-affairs/[slug]/page.tsx', 'app/current-affairs/date/[date]/page.tsx', 'app/current-affairs/month/[month]/page.tsx', ...fs.readdirSync(path.join(ROOT, 'components/current-affairs')).map((f) => `components/current-affairs/${f}`)];
    const bad = [];
    for (const f of files) {
      const s = code(read(f));
      for (const [re, why] of [[/text-\[(9|10|11)px\]/, 'tiny text'], [/animate-pulse/, 'pulse'], [/\b(bg|text|border)-(amber|accent)-/, 'amber'], [/High Probability|HIGH YIELD|high-yield/i, 'prediction claim'], [/\bpy-1\.5\b[^"]*rounded/, 'small target']]) if (re.test(s)) bad.push(`${f}: ${why}`);
    }
    assert(bad.length === 0, bad.join('; '));
    const hub = code(read('app/current-affairs/page.tsx'));
    assert(/aria-current=\{isToday \? 'page' : undefined\}/.test(hub) && /focus-ring inline-flex min-h-12 shrink-0 items-center/.test(hub), 'day strip: current day marked, 48 px');
    return `${files.length} files`;
  });

  await test('CA-04 quiz runs in the standard player; wrong answers reach the Mistake Vault through the one submit path', () => {
    const card = code(read('components/current-affairs/current-affairs-daily-quiz-card.tsx'));
    assert(/const quizTargetHref = `\/mock-tests\/\$\{dailyQuiz\.mockTestId \|\| dailyQuiz\.mockTestSlug\}`;/.test(card), 'standard mock route');
    const svc = code(read('services/assessment.service.ts'));
    const submit = svc.slice(svc.indexOf('static async submitTestAttempt('), svc.indexOf('static maskCandidateName('));
    assert(/wrongAnswersForVault\.push\(/.test(submit) && /MistakeService\.recordExamMistakes\(/.test(submit), 'wrong answers → Mistake Vault on submit');
  });

  console.log(`\nF7 current affairs: ${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
})();
