#!/usr/bin/env node
/**
 * F1 (#75) exam home page /exams/[slug] — offline gate (TS transpile + module mocks; no network, no DB).
 *   F-01 CTA state machine, all 4 states (signed out: sign-up closed / open; signed in: not following / following) +
 *        the "Continue: …" priority (in-progress mock → next free mock → due mistake drills → syllabus)
 *   F-02 missing data renders "Not published yet" (no pattern at all, and single missing facts)
 *   F-03 no fabricated numbers: copy has no digits; every number rendered comes from the fixture; the old invented
 *        fallbacks ("Bachelor's Degree", "Citizen of India", "Prescribed in Rules", pay level 7) are not on the page
 *   F-04 exactly ONE amber (accent) primary on the page, in every state
 *   F-05 cards are single links (one <a> per mock / guide card) and ≥ 48 px; secondary links ≥ 48 px
 *   F-06 a coming-soon exam renders the same skeleton without errors: no digits, no amber, no start / sign-up action
 *   F-07 exam cycle: only recorded data; past dates never shown as "next"; no cycle → no section
 *   F-08 mock status per user (Not started / In progress / Done + best score); signed out → no status claimed
 *   F-09 English UI only (#82): no Hindi labels; content language: Hindi guide when published, else English
 *   F-10 wiring: user parts stream in Suspense with signed-out fallbacks; the user loader only reads (no writes, no
 *        service role); syllabus section kept; no rank / percentile / "verified" / "official" claims (CCPA, H2)
 * Run: node scripts/test_f1_exam_page.cjs
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
const MOCKS = {
  'server-only': {},
  'next/navigation': { useRouter: () => ({ refresh() {} }), notFound: () => { throw new Error('NEXT_NOT_FOUND'); } },
  '@/app/mock-tests/actions': { addUserExamGoalAction: async () => ({ success: true }) },
};
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (Object.prototype.hasOwnProperty.call(MOCKS, request)) return MOCKS[request];
  return origLoad.call(this, request, parent, isMain);
};
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const h = React.createElement;
const html = (el) => renderToStaticMarkup(el);
const text = (s) => s.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ').replace(/&#x27;|&apos;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const amber = (s) => (s.match(/class="[^"]*\bbg-accent-(?:400|500|600)\b/g) || []).length;

const L = require(path.join(ROOT, 'lib/exams/exam-page.ts'));
const V = require(path.join(ROOT, 'components/exams/exam-home.tsx'));
const { EXAM_PAGE, NOT_PUBLISHED } = require(path.join(ROOT, 'content/exam-page.ts'));

// ---------- fixtures (numbers chosen to be distinct so each rendered number can be traced) ----------
const PATTERN = {
  id: 'p1', name: 'Tier 1', tierName: 'Tier 1 (CBE)', durationMinutes: 61, totalQuestions: 103, totalMarks: 207, negativeMarkValue: 0.5,
  sections: [{ name: 'Reasoning', order: 1, questionCount: 25, marksPerQuestion: 2, negativeMark: 0.5 }, { name: 'English', order: 2, questionCount: 25, marksPerQuestion: 2, negativeMark: 0.5 }],
};
const MOCKS_LIST = [
  { id: 'm1', title: 'Full Mock A', testType: 'full_length', questions: 103, minutes: 61, totalMarks: 207, isFree: true },
  { id: 'm2', title: 'Full Mock B', testType: 'full_length', questions: 103, minutes: 61, totalMarks: 207, isFree: true },
  { id: 'm3', title: 'Sectional C', testType: 'sectional', questions: 26, minutes: 19, totalMarks: 52, isFree: false },
];
const MOD = (k, asOf) => ({ documentId: k, versionId: k, moduleKey: k, displayName: k, title: k, description: '', compiledMdx: 'x', faqs: [], officialSources: [], lastVerifiedDate: asOf, publishedAt: null });
const MODULES = { ELIGIBILITY: MOD('ELIGIBILITY', null), SALARY: MOD('SALARY', null), EXAM_PATTERN: MOD('EXAM_PATTERN', null), FAQ: { ...MOD('FAQ', null), compiledMdx: null } };
const SLUG = 'ssc-cgl';

function fullPage(cta, statuses) {
  return html(
    h('div', null,
      h(V.ExamHomeHeader, { title: 'SSC CGL', body: 'Staff Selection Commission' }, h(V.ExamCtaView, { cta, examId: 'e1' })),
      h(V.ExamGlance, { examTitle: 'SSC CGL', table: L.glanceRows([PATTERN]) }),
      h(V.ExamCycle, { info: L.cycleInfo({ id: 'c', cycleYear: 2026, cycleLabel: '', status: 'active', notificationDate: null, applicationStartDate: null, applicationEndDate: null, examStartDate: null, examEndDate: null, totalVacancies: null, isTentative: true }) }),
      h(V.ExamMocks, { mocks: MOCKS_LIST, statuses }),
      h(V.ExamSyllabusHome, { totals: { topics: 41, published_questions: 977 } }, h('div', { id: 'syllabus' })),
      h(V.ExamGuides, { groups: L.guideGroups(MODULES, SLUG, (k) => `Guide ${k.toLowerCase()}`), sources: [{ id: 's1', title: 'Notice', issuingAuthority: 'SSC', sourceUrl: 'https://ssc.gov.in/x' }] }),
    ),
  );
}

(async () => {
  console.log('F1 exam home page');

  const NEXT = { label: 'Full Mock A', href: '/mock-tests/m1' };
  const STATES = [
    ['signed out, sign-up closed', { signedIn: false, signupOpen: false }, 'sign-in', EXAM_PAGE.cta.signIn],
    ['signed out, sign-up open', { signedIn: false, signupOpen: true }, 'start', EXAM_PAGE.cta.startFree],
    ['signed in, not following', { signedIn: true, following: false }, 'add', EXAM_PAGE.cta.add],
    ['signed in, following', { signedIn: true, following: true, next: NEXT }, 'continue', 'Continue: Full Mock A'],
  ];

  await test('F-01 CTA state machine: 4 states + "Continue" priority', () => {
    for (const [label, st, kind, text1] of STATES) {
      const c = L.resolveExamCta(st, SLUG);
      assert(c.kind === kind && c.label === text1, `${label}: ${JSON.stringify(c)}`);
      const out = html(h(V.ExamCtaView, { cta: c, examId: 'e1' }));
      assert(out.includes(`data-exam-cta="${kind}"`) && text(out).includes(text1), `${label}: not rendered`);
    }
    const closed = L.resolveExamCta(STATES[0][1], SLUG);
    assert(closed.href === '/auth/login?next=%2Fexams%2Fssc-cgl' && closed.secondary.label === 'See the pattern' && closed.secondary.href === '#at-a-glance', 'sign-in target / secondary');
    assert(!JSON.stringify(closed).includes('/auth/signup'), 'sign-up closed must never link to /auth/signup');
    assert(L.resolveExamCta(STATES[1][1], SLUG).href === '/auth/signup', 'open → /auth/signup');
    assert(L.resolveExamCta(STATES[3][1], SLUG).href === '/mock-tests/m1', 'continue href');
    // Continue priority
    const st = (pairs) => new Map(pairs.map(([id, state]) => [id, { state, href: `/mock-tests/${id}`, score: null, maxScore: null }]));
    const all = (s) => MOCKS_LIST.map((m) => [m.id, s]);
    assert(L.continueTarget(MOCKS_LIST, st([['m1', 'done'], ['m2', 'not-started'], ['m3', 'in-progress']]), true).href === '/mock-tests/m3', 'in-progress first');
    assert(L.continueTarget(MOCKS_LIST, st([['m1', 'done'], ['m2', 'not-started'], ['m3', 'not-started']]), true).label === 'Full Mock B', 'next FREE not-started mock second');
    assert(L.continueTarget(MOCKS_LIST, st([['m1', 'done'], ['m2', 'done'], ['m3', 'not-started']]), true).href === '/practice', 'Pro mock is not "next"; due drills third');
    const fin = L.continueTarget(MOCKS_LIST, st(all('done')), false);
    assert(fin.href === '#syllabus' && fin.label === 'Syllabus', 'syllabus last');
    return '4 states; resume → next free → drills → syllabus';
  });

  await test('F-02 missing data → "Not published yet"', () => {
    const none = L.glanceRows([]);
    assert(none.rows.length === 5 && none.rows.every((r) => r.values.every((v) => v === NOT_PUBLISHED)) && none.stages[0] === NOT_PUBLISHED, 'no-pattern table');
    const out = text(html(h(V.ExamGlance, { examTitle: 'X', table: none })));
    assert((out.match(/Not published yet/g) || []).length === 6 && !/\d/.test(out), 'rendered empty table');
    const partial = L.glanceRows([{ ...PATTERN, durationMinutes: null, negativeMarkValue: null, totalMarks: null, sections: [] }]);
    const vals = Object.fromEntries(partial.rows.map((r) => [r.fact, r.values[0]]));
    assert(vals.Time === NOT_PUBLISHED && vals['Negative marking'] === NOT_PUBLISHED && vals.Marks === NOT_PUBLISHED && vals.Sections === NOT_PUBLISHED && vals.Questions === '103', JSON.stringify(vals));
    const zero = L.glanceRows([{ ...PATTERN, negativeMarkValue: 0 }]).rows.find((r) => r.fact === 'Negative marking').values[0];
    assert(zero === 'None', 'a recorded 0 is "None", not missing');
    return 'empty + partial';
  });

  await test('F-03 no fabricated numbers (copy, rendered page, old fallbacks gone)', () => {
    const copy = code(read('content/exam-page.ts'));
    const strings = [...copy.matchAll(/"([^"\\]*)"|`([^`]*)`/g)].map((m) => m[1] ?? m[2]);
    assert(strings.length >= 40, `strings ${strings.length}`);
    const withDigits = strings.filter((s) => /\d/.test(s));
    assert(withDigits.length === 0, `digits in copy: ${withDigits.join(' | ')}`);
    const allowed = new Set(['1', '2026', '61', '103', '207', '0.5', '26', '19', '41', '977', '50', '62']);
    const out = text(fullPage(L.resolveExamCta(STATES[0][1], SLUG), new Map([['m1', { state: 'done', href: '/x', score: 50, maxScore: 207 }], ['m2', { state: 'in-progress', href: '/y' }], ['m3', { state: 'not-started', href: '/z' }]])));
    const nums = (out.match(/\d+(?:\.\d+)?/g) || []).filter((d) => !allowed.has(d));
    assert(nums.length === 0, `numbers not from the fixture: ${[...new Set(nums)].join(', ')}`);
    const page = code(read('app/exams/[slug]/page.tsx')) + code(read('components/exams/exam-home.tsx'));
    for (const bad of [/Bachelor/i, /Citizen of India/i, /Prescribed in Rules/i, /payLevel/, /Recruitment Commission/]) assert(!bad.test(page), `invented fallback ${bad}`);
    assert(/exam\.conductingOrg\.id \? exam\.conductingOrg\.name : null/.test(page), 'conducting body only when recorded');
    return `${strings.length} copy strings, rendered numbers all from data`;
  });

  await test('F-04 exactly one amber primary on the page in every state', () => {
    const out = [];
    for (const [label, st] of STATES) {
      const n = amber(fullPage(L.resolveExamCta(st, SLUG), st.signedIn ? new Map() : null));
      assert(n === 1, `${label}: ${n} amber elements`);
      out.push(label.split(',')[1].trim());
    }
    return out.join(' / ');
  });

  await test('F-05 cards are single links ≥ 48 px; secondary links ≥ 48 px', () => {
    const page = fullPage(L.resolveExamCta(STATES[0][1], SLUG), null);
    const cards = page.split(/(?=<div class="[^"]*" data-(?:mock|guide)-card="">)/).slice(1).map((c) => c.slice(0, c.indexOf('</li>')));
    assert(cards.length === MOCKS_LIST.length + 3, `cards ${cards.length}`);
    for (const c of cards) {
      assert((c.match(/<a\b/g) || []).length === 1 && /data-card-link=""/.test(c), 'a card has ≠ 1 link');
      assert(/min-h-12/.test(c.slice(0, c.indexOf('>'))), 'card < 48 px');
    }
    assert(/<summary class="[^"]*min-h-12/.test(page), 'syllabus disclosure < 48 px');
    assert(/href="#at-a-glance"[^>]*class="[^"]*min-h-12|class="[^"]*min-h-12[^"]*"[^>]*href="#at-a-glance"/.test(page), 'secondary < 48 px');
    assert(/href="https:\/\/ssc\.gov\.in\/x" target="_blank" rel="noopener noreferrer" class="[^"]*min-h-12/.test(page), 'source link');
    return `${cards.length} cards`;
  });

  await test('F-06 coming-soon exam: same skeleton, no errors, no digits, no amber, no start action', () => {
    const { ComingSoonHub } = require(path.join(ROOT, 'components/public/coming-soon-hub.tsx'));
    const out = html(h(ComingSoonHub, { title: 'SSC MTS' }));
    const t = text(out);
    assert(/data-coming-soon-hub/.test(out) && /Coming soon/.test(t) && /At a glance/.test(t) && /Not published yet/.test(t), 'skeleton');
    assert(/Mock tests for this exam are coming soon/.test(t) && /syllabus for this exam is coming soon/.test(t) && /Exam guides for this exam are coming soon/.test(t), 'honest coming-soon sections');
    assert(!/\d/.test(t), 'digits rendered');
    assert(amber(out) === 0 && !/\/auth\/(signup|login)/.test(out) && !/notify/i.test(t), 'start / notify action present');
    return 'skeleton ok';
  });

  await test('F-07 exam cycle: recorded data only; past dates never "next"; no cycle → no section', () => {
    assert(L.cycleInfo(null) === null && html(h(V.ExamCycle, { info: null })) === '', 'no cycle must render nothing');
    const base = { id: 'c', cycleYear: 2026, cycleLabel: '', status: 'upcoming', notificationDate: null, applicationStartDate: null, applicationEndDate: null, examStartDate: null, examEndDate: null, totalVacancies: null, isTentative: true };
    const now = new Date('2026-10-25T06:00:00Z');
    const a = L.cycleInfo(base, now);
    assert(a.status === 'Cycle 2026 · Upcoming' && a.next === null, JSON.stringify(a));
    const b = L.cycleInfo({ ...base, notificationDate: '2026-09-30T18:30:00Z', applicationEndDate: '2026-11-14T18:30:00Z', examStartDate: '2027-01-09T18:30:00Z' }, now);
    assert(/^Next: last date to apply on 15 Nov 2026$/.test(b.next), `next: ${b.next}`);
    const c = L.cycleInfo({ ...base, notificationDate: '2026-01-01T00:00:00Z' }, now);
    assert(c.next === null, 'a past date was shown as next');
    assert(/No dates are published for this cycle yet/.test(text(html(h(V.ExamCycle, { info: a })))), 'honest no-dates line');
    return 'status + next future date only';
  });

  await test('F-08 mock status per user; signed out → none claimed', () => {
    const attempts = [
      { id: 'a1', mockTestId: 'm1', status: 'submitted', submittedAt: '2026-10-01', startedAt: '2026-10-01', score: 40, maxScore: 207 },
      { id: 'a2', mockTestId: 'm1', status: 'submitted', submittedAt: '2026-10-02', startedAt: '2026-10-02', score: 50, maxScore: 207 },
      { id: 'a3', mockTestId: 'm2', status: 'in_progress', submittedAt: null, startedAt: '2026-10-03', score: null, maxScore: null },
      { id: 'a4', mockTestId: 'm3', status: 'abandoned', submittedAt: null, startedAt: '2026-10-03', score: null, maxScore: null },
    ];
    const s = L.mockStatuses(MOCKS_LIST, attempts);
    assert(s.get('m1').state === 'done' && s.get('m1').score === 50 && s.get('m1').href === '/mock-tests/a2/result', 'done + best score');
    assert(s.get('m2').state === 'in-progress' && s.get('m2').href === '/mock-tests/m2', 'in progress resumes from the test page');
    assert(s.get('m3').state === 'not-started', 'abandoned → not started');
    // same precedence as /mock-tests/[id]: a submitted attempt dominates a stale open one
    const s2 = L.mockStatuses(MOCKS_LIST, [...attempts, { id: 'a5', mockTestId: 'm1', status: 'in_progress', submittedAt: null, startedAt: '2026-10-04', score: null, maxScore: null }]);
    assert(s2.get('m1').state === 'done', 'a stale open attempt must not hide a submitted one');
    const t = text(html(h(V.ExamMocks, { mocks: MOCKS_LIST, statuses: s })));
    assert(/Done · Score 50 \/ 207/.test(t) && /In progress/.test(t) && /Not started/.test(t), 'status badges');
    assert(/Free/.test(t) && /Pro/.test(t), 'free / pro badges');
    const anon = text(html(h(V.ExamMocks, { mocks: MOCKS_LIST, statuses: null })));
    assert(!/Not started|In progress|Done/.test(anon) && /Sign in to see your progress/.test(anon), 'signed out claims a status');
    assert(/No mock tests are published for this exam yet/.test(text(html(h(V.ExamMocks, { mocks: [], statuses: null })))), 'empty state');
    return 'Not started / In progress / Done + best score';
  });

  await test('F-09 English UI only (#82); content language: Hindi guide when published, else English', () => {
    const files = ['content/exam-page.ts', 'components/exams/exam-home.tsx', 'components/exams/add-exam-button.tsx', 'app/exams/[slug]/page.tsx', 'components/public/coming-soon-hub.tsx', 'lib/exams/exam-page.ts'];
    for (const f of files) {
      const s = code(read(f));
      assert(!/lang="hi"|[\u0900-\u097F]/.test(s), `${f}: Hindi UI label`);
    }
    assert(L.contentLanguage('hi') === 'hi' && L.contentLanguage('en') === 'en' && L.contentLanguage('hinglish') === 'en' && L.contentLanguage(null) === 'en', 'contentLanguage');
    const merged = L.preferModules({ SALARY: { v: 'hi' }, POSTS: null }, { SALARY: { v: 'en' }, POSTS: { v: 'en' } });
    assert(merged.SALARY.v === 'hi' && merged.POSTS.v === 'en', 'preferModules');
    const reader = code(read('app/exams/[slug]/[moduleSlug]/page.tsx'));
    assert(/userContentLanguage\(\)\) === "hi"/.test(reader) && /language: "hi"/.test(reader), 'guide reader ignores the content language');
    return `${files.length} files English-only; hi → en fallback`;
  });

  await test('F-10 wiring: streamed user parts, read-only loader, syllabus kept, no rank / verified / official claims', () => {
    const page = code(read('app/exams/[slug]/page.tsx'));
    assert(/<Suspense fallback=\{<ExamCtaView examId=\{exam\.id\} cta=\{signedOutCta\} \/>\}>/.test(page) && /resolveExamCta\(\{ signedIn: false, signupOpen: false \}, exam\.slug\)/.test(page), 'CTA fallback must be the signed-out, sign-up-closed view');
    assert(/<Suspense fallback=\{<ExamMocks mocks=\{mocks\} statuses=\{null\} \/>\}>/.test(page), 'mock statuses must stream');
    assert(/<ExamSyllabusSection\b/.test(page) && /id="syllabus"/.test(page), 'syllabus section');
    assert((page.match(/getSignupAvailability\(\)/g) || []).length === 1 && /async function HeaderCta/.test(page), 'sign-up read only inside the streamed CTA');
    const loader = code(read('lib/exams/exam-page-server.ts'));
    assert(/^import "server-only";/m.test(read('lib/exams/exam-page-server.ts')), 'server-only');
    assert(!/\.(insert|update|upsert|delete)\(|\.rpc\(|Admin|service_role|SERVICE_ROLE/.test(loader), 'loader writes or uses the service role');
    assert((loader.match(/\.eq\("user_id", uid\)/g) || []).length === 3, 'every user read keyed on the session user');
    const ui = ['components/exams/exam-home.tsx', 'content/exam-page.ts', 'app/exams/[slug]/page.tsx'].map((f) => code(read(f))).join('\n');
    for (const bad of [/\brank\b/i, /percentile/i, /\bverified\b/i, /\bofficial\b/i, /guarantee/i, /\btop(per)?\b/i, /glass-/]) assert(!bad.test(ui), `claim / glass: ${bad}`);
    return 'Suspense fallbacks + read-only loader';
  });

  console.log(`\nF1 exam home page: ${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
})();
