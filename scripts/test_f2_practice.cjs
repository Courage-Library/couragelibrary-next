#!/usr/bin/env node
/**
 * F2 (#79) topic practice + "Report this question" — offline gate (TS transpile + module mocks + a fake PostgREST
 * builder; no network, no DB).
 *   T-01 no answer key / explanation in the question payload (unit: extra row fields are dropped; static: the read
 *        module never selects question_answers / keys; the client never imports a service-role client)
 *   T-02 check-answer: ONE question per call, only that version's key + explanation, after the answer is recorded;
 *        the action passes through only correctness / key / explanation (no other question's data)
 *   T-03 rate limits: answers 30 / minute + 1500 / day (RPC), reports 20 / day + one per user per question
 *   T-04 Mistake Vault reuse: wrong / skipped answers go through the canonical writer fn_record_mistake_occurrence in
 *        the same transaction (CUSTOM_PRACTICE / DIAGNOSTIC_ASSESSMENT); no second mistake store, no service role
 *   T-05 report validation (4 reasons, note ≤ 500) + duplicate rejection (RPC + pre-093 path) + fixed copy only
 *   T-06 content language: preferred-language version when it exists, else English; EN/HI toggle only when the other
 *        version exists; UI strings English only (R9)
 *   T-07 set selection: never-seen first, then least recently answered; set sizes 5 / 10 / 20; the diagnostic mixes
 *        the exam's sections (round-robin, no duplicates, 10)
 *   T-08 topics with 0 servable questions are hidden (examSections with a fake PostgREST)
 *   T-09 one amber primary per screen (question, result, end of set, chooser); touch targets ≥ 48 px
 *   T-10 end-of-set takeaways: 2–3 task-focused lines, nothing about the person (R3)
 *   T-11 flag OFF: /practice is the Mistake-drills hub, /practice/session is 404, reports use the pre-093 path
 *   T-12 migration 093 static: practice_answers owner-only read + no client writes; SECDEF search_path ''; errata
 *        client INSERT / SELECT revoked; allow-list entries; report button on practice, mock review and drills
 * Run: node scripts/test_f2_practice.cjs
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
class NotFoundSignal extends Error {}
let checkCalls = [];
let reportCalls = [];
const MOCKS = {
  'server-only': {},
  'next/navigation': { useRouter: () => ({ refresh() {} }), notFound: () => { throw new NotFoundSignal('NEXT_NOT_FOUND'); }, redirect: () => { throw new Error('redirect'); } },
  '@/app/practice/actions': {
    checkPracticeAnswerAction: async (i) => { checkCalls.push(i); return { ok: true, isCorrect: false, correctKey: 'B', explanation: 'x', savedToMistakes: true }; },
    reportQuestionAction: async (i) => { reportCalls.push(i); return 'REPORTED'; },
  },
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

/** A fake PostgREST: from(table) → chainable filters; the result is whatever `data[table]` returns for the filters. */
function fakeSupabase(data) {
  return {
    from(table) {
      const f = { table, eq: {}, in: {} };
      const b = {
        select() { return b; },
        eq(k, v) { f.eq[k] = v; return b; },
        in(k, v) { f.in[k] = v; return b; },
        order() { return b; },
        limit() { return b; },
        neq() { return b; },
        gte() { return b; },
        maybeSingle() { return Promise.resolve({ data: (data[table] ? data[table](f) : [])[0] ?? null, error: null }); },
        then(res, rej) { return Promise.resolve({ data: data[table] ? data[table](f) : [], error: null }).then(res, rej); },
      };
      return b;
    },
    rpc: async () => ({ data: null, error: { message: 'no rpc offline' } }),
  };
}

const E = require(path.join(ROOT, 'lib/practice/engine.ts'));
const COPY = require(path.join(ROOT, 'content/practice.ts')).PRACTICE_COPY;
const MIG = read('supabase/migrations/20261025000093_f2_practice_answers_and_reports.sql');
const MIGC = MIG.replace(/--.*$/gm, '');
const fnBody = (name) => (MIGC.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\$function\\$([\\s\\S]*?)\\$function\\$`)) || [])[1] || '';

const ROW = (qid, vid, lang = 'en', extra = {}) => ({
  id: vid, question_id: qid, language: lang, question_text: `Q ${qid} ${lang}`, question_image_url: null, options_type: 'text',
  options: ['D', 'B', 'A', 'C'].map((k, i) => ({ option_key: k, option_text: `${k} text`, option_image_url: null, order_index: 'ABCD'.indexOf(k) })),
  ...extra,
});

(async () => {
  console.log('F2 topic practice + reports');

  await test('T-01 no answer key / explanation in the question payload (unit + static)', () => {
    const q = E.toPracticeQuestion(ROW('q1', 'v1', 'en', { correct_option_key: 'B', explanation_md: 'secret', question_answers: [{ correct_option_key: 'B' }] }), [], 't1');
    const json = JSON.stringify(q);
    assert(!/correct|explanation|answer|secret/i.test(json), `leak: ${json}`);
    assert(JSON.stringify(Object.keys(q).sort()) === JSON.stringify(['alternates', 'imageUrl', 'language', 'options', 'questionId', 'text', 'topicId', 'versionId']), Object.keys(q).join(','));
    assert(q.options.map((o) => o.key).join('') === 'ABCD', 'options in key order');
    const srv = code(read('lib/practice/server.ts'));
    assert(!/question_answers|correct_option_key|explanation/.test(srv), 'the practice read module selects keys / explanations');
    const typeSrc = (read('lib/practice/engine.ts').match(/export type PracticeQuestion = \{[\s\S]*?\n\};/) || [''])[0];
    assert(typeSrc && !/correct|explanation|answer/i.test(typeSrc), 'PracticeQuestion type has a key field');
    for (const f of ['components/practice/practice-runner.tsx', 'components/practice/report-question-button.tsx', 'app/practice/session/page.tsx', 'app/practice/page.tsx']) {
      assert(!/createAdminServerSupabaseClient|service_role|SERVICE_ROLE/.test(code(read(f))), `${f}: service role`);
    }
    return 'payload = text + options only';
  });

  await test('T-02 check-answer: one question per call; only that version key + explanation, after recording', () => {
    const b = fnBody('fn_check_practice_answer');
    assert(b, 'function missing');
    assert(/FROM public\.question_answers a WHERE a\.question_version_id = p_question_version_id/.test(b), 'key read must be for the asked version only');
    assert(b.indexOf('INSERT INTO public.practice_answers') > 0 && b.indexOf('INSERT INTO public.practice_answers') < b.lastIndexOf("'correct_option_key', v_key"), 'the key is returned only after the answer row is written');
    assert(/AND v\.lifecycle_status = 'PUBLISHED'\s+AND v\.is_current\s+AND q\.status = 'published'/.test(b) && /fn_qf_version_is_servable\(p_question_version_id\)/.test(b), 'only servable, current, published questions');
    assert(/v_uid\s+uuid := auth\.uid\(\)/.test(b) && /NOT_SIGNED_IN/.test(b), 'caller from auth.uid()');
    assert(/'ALREADY_ANSWERED'/.test(b) && /UNIQUE \(user_id, set_id, question_version_id\)/.test(MIGC), 'idempotent per set');
    const act = code(read('app/practice/actions.ts'));
    assert(/rpc\("fn_check_practice_answer"/.test(act) && /isCorrect: r\.is_correct === true,\s*correctKey,\s*explanation:/.test(act), 'action returns only correctness / key / explanation');
    assert(!/\.from\(/.test(act), 'the action reads tables directly');
    return 'single-question RPC';
  });

  await test('T-03 rate limits: answers 30/min + 1500/day; reports 20/day + one per user per question', () => {
    const c = fnBody('fn_check_practice_answer');
    assert(/interval '1 minute'\) >= 30/.test(c) && /interval '1 day'\) >= 1500/.test(c) && /'RATE_LIMITED'/.test(c), 'answer rate limit');
    assert(/pg_advisory_xact_lock\(pg_catalog\.hashtextextended\('practice_answers:'/.test(c), 'serialised per user');
    const r = fnBody('fn_report_question');
    assert(/interval '1 day'\) >= 20/.test(r) && /'RATE_LIMITED'/.test(r), 'report daily cap');
    assert(/reporter_user_id = v_uid AND question_id = p_question_id\) THEN\s+RETURN jsonb_build_object\('success', false, 'code', 'ALREADY_REPORTED'\)/.test(r), 'one report per user per question');
    assert(/pg_advisory_xact_lock\(pg_catalog\.hashtextextended\('errata_reports:'/.test(r), 'serialised per user');
    return '30/min · 1500/day · 20 reports/day · 1 per question';
  });

  await test('T-04 Mistake Vault reuse: canonical writer in the same transaction, no second store, no service role', () => {
    const c = fnBody('fn_check_practice_answer');
    assert(/IF NOT v_correct THEN\s+v_mistake := public\.fn_record_mistake_occurrence\(/.test(c), 'wrong answers must use fn_record_mistake_occurrence');
    assert(/CASE p_mode WHEN 'DIAGNOSTIC' THEN 'DIAGNOSTIC_ASSESSMENT' ELSE 'CUSTOM_PRACTICE' END/.test(c) && /\n\s+v_id,\n/.test(c), 'source context + practice answer as lineage reference');
    assert(!/user_mistake_vault|user_mistake_occurrences/.test(MIGC.replace(/fn_record_mistake_occurrence/g, '')), 'the migration writes the vault directly');
    assert(!/CREATE TABLE[^;]*mistake/i.test(MIGC), 'a second mistake table');
    const act = code(read('app/practice/actions.ts'));
    assert(!/MistakeService|createAdminServerSupabaseClient|user_mistake/.test(act), 'the action writes mistakes itself');
    return 'fn_record_mistake_occurrence';
  });

  await test('T-05 report validation + duplicate rejection + fixed copy', () => {
    assert(E.validateReport('WRONG_ANSWER_KEY', '').ok && E.validateReport('OTHER', ' x ').note === 'x', 'valid');
    assert(E.validateReport('NOPE', '').code === 'INVALID_INPUT' && E.validateReport(undefined, '').code === 'INVALID_INPUT', 'reason');
    assert(E.validateReport('OTHER', 'x'.repeat(500)).ok && E.validateReport('OTHER', 'x'.repeat(501)).code === 'NOTE_TOO_LONG', 'note ≤ 500');
    assert(JSON.stringify(E.REPORT_REASONS) === JSON.stringify(['WRONG_ANSWER_KEY', 'TYPO_OR_UNCLEAR', 'TRANSLATION_ERROR', 'OTHER']), 'four reasons');
    const r = fnBody('fn_report_question');
    assert(/WHEN 'WRONG_ANSWER_KEY' THEN 'INCORRECT_ANSWER'/.test(r) && /WHEN 'TRANSLATION_ERROR' THEN 'TRANSLATION_ERROR'/.test(r) && /char_length\(v_note\) > 500/.test(r), 'RPC mirrors the rules');
    assert(/'TRANSLATION_ERROR'\]\)\);/.test(MIGC), 'issue_type gains TRANSLATION_ERROR');
    const rep = code(read('lib/practice/report.ts'));
    assert(/\.eq\("reporter_user_id", userId\)\.eq\("question_id", questionId\)\.limit\(1\)/.test(rep) && /return "ALREADY_REPORTED"/.test(rep), 'pre-093 path dedupes per question');
    for (const k of ['REPORTED', 'ALREADY_REPORTED', 'RATE_LIMITED', 'NOTE_TOO_LONG', 'NOT_SIGNED_IN', 'INVALID_INPUT', 'NOT_FOUND', 'FAILED']) assert(COPY.report.results[k], `copy for ${k}`);
    const route = code(read('app/api/assessment/report-question/route.ts'));
    assert(/submitQuestionReport\(/.test(route) && !/from\("question_errata_reports"\)/.test(route) && !/error: \w+\.message/.test(route), 'the route must use the one path, fixed copy');
    return '4 reasons · ≤ 500 · duplicates rejected';
  });

  await test('T-06 content language: preferred version, English fallback, toggle only when the other version exists; English UI', () => {
    const en = ROW('q1', 'v-en', 'en');
    const hi = ROW('q1', 'v-hi', 'hi');
    let c = E.chooseVersion([en, hi], 'hi');
    assert(c.primary === hi && c.alternates.length === 1 && c.alternates[0] === en, 'hi preferred');
    c = E.chooseVersion([en], 'hi');
    assert(c.primary === en && c.alternates.length === 0, 'English fallback, no toggle');
    c = E.chooseVersion([en, hi], 'en');
    assert(c.primary === en, 'en preferred');
    const q = E.toPracticeQuestion(hi, [en], 't1');
    assert(q.language === 'hi' && q.alternates.length === 1 && q.alternates[0].language === 'en' && !/correct|explanation/.test(JSON.stringify(q.alternates)), 'alternate payload');
    const { PracticeRunner } = require(path.join(ROOT, 'components/practice/practice-runner.tsx'));
    const props = (qs) => ({ setId: 's', mode: 'TOPIC', title: 'T', questions: qs, topicNames: { t1: 'Algebra' }, articles: {}, againHref: '/a', nextTopicHref: null, chooseHref: '/practice' });
    const withToggle = html(h(PracticeRunner, props([q])));
    const noToggle = html(h(PracticeRunner, props([E.toPracticeQuestion(en, [], 't1')])));
    assert(/aria-pressed/.test(withToggle) && /Hindi/.test(text(withToggle)) && !/aria-pressed/.test(noToggle), 'toggle only with an alternate');
    assert(/lang="hi"/.test(withToggle), 'Hindi content marked lang="hi"');
    const ui = ['content/practice.ts', 'components/practice/practice-runner.tsx', 'components/practice/report-question-button.tsx', 'app/practice/page.tsx', 'app/practice/session/page.tsx'].map((f) => code(read(f))).join('\n');
    assert(!/[ऀ-ॿ]/.test(ui), 'Hindi UI text');
    return 'hi → en fallback; toggle conditional';
  });

  await test('T-07 set selection: never-seen first, then oldest; sizes 5/10/20; diagnostic mixes sections', () => {
    const cands = [
      { questionId: 'old', lastAnsweredAt: '2026-01-01T00:00:00Z' },
      { questionId: 'new1', lastAnsweredAt: null },
      { questionId: 'recent', lastAnsweredAt: '2026-10-20T00:00:00Z' },
      { questionId: 'new2', lastAnsweredAt: null },
    ];
    for (let i = 0; i < 20; i++) {
      const s = E.pickSet(cands, 3);
      assert(s.length === 3 && new Set(s.slice(0, 2)).size === 2 && s.slice(0, 2).every((x) => x.startsWith('new')) && s[2] === 'old', JSON.stringify(s));
    }
    assert(E.pickSet(cands, 10).length === 4, 'never more than available');
    assert(E.parseSetSize('5') === 5 && E.parseSetSize('20') === 20 && E.parseSetSize('7') === 10 && E.parseSetSize(undefined) === 10, 'set sizes');
    const secs = ['A', 'B', 'C'].map((s) => ({ sectionId: s, candidates: Array.from({ length: 6 }, (_, i) => ({ questionId: `${s}${i}`, lastAnsweredAt: null })) }));
    const d = E.pickDiagnostic(secs, 10);
    const per = ['A', 'B', 'C'].map((s) => d.filter((x) => x.startsWith(s)).length);
    assert(d.length === 10 && new Set(d).size === 10 && Math.max(...per) - Math.min(...per) <= 1, `diagnostic ${JSON.stringify(per)}`);
    assert(E.pickDiagnostic([{ sectionId: 'A', candidates: [{ questionId: 'x', lastAnsweredAt: null }] }, { sectionId: 'B', candidates: [] }], 10).length === 1, 'small pools');
    return 'tiers + round-robin';
  });

  await test('T-08 topics with 0 servable questions are hidden', async () => {
    const S = require(path.join(ROOT, 'lib/practice/server.ts'));
    const sb = fakeSupabase({
      exam_patterns: () => [{ id: 'p', pattern_sections: [{ subject_id: 'sub-q', section_name: 'Quant', section_order: 2 }, { subject_id: 'sub-r', section_name: 'Reasoning', section_order: 1 }] }],
      canonical_taxonomy_nodes: () => [
        { id: 't-alg', name: 'Algebra', parent_id: 'sub-q', display_order: 1 },
        { id: 't-geo', name: 'Geometry', parent_id: 'sub-q', display_order: 2 },
        { id: 't-ser', name: 'Series', parent_id: 'sub-r', display_order: 1 },
      ],
      questions: () => [{ id: 'q1', canonical_topic_id: 't-alg' }, { id: 'q2', canonical_topic_id: 't-alg' }, { id: 'q3', canonical_topic_id: 't-ser' }],
    });
    const sections = await S.examSections(sb, 'exam');
    assert(sections.map((s) => s.name).join(',') === 'Reasoning,Quant', 'section order');
    const quant = sections.find((s) => s.name === 'Quant');
    assert(quant.topics.map((t) => `${t.name}:${t.count}`).join(',') === 'Algebra:2', `Geometry (0) must be hidden: ${JSON.stringify(quant.topics)}`);
    const pageSrc = code(read('lib/practice/server.ts'));
    assert(/\.eq\("status", "published"\)\s*\.eq\("question_versions\.is_current", true\)\s*\.eq\("question_versions\.lifecycle_status", "PUBLISHED"\)/.test(pageSrc), 'servable = published question + current published version');
    return 'Geometry (0) hidden';
  });

  await test('T-09 one amber primary per screen; touch targets ≥ 48 px', async () => {
    const { PracticeRunner } = require(path.join(ROOT, 'components/practice/practice-runner.tsx'));
    const q = E.toPracticeQuestion(ROW('q1', 'v1'), [], 't1');
    const runner = html(h(PracticeRunner, { setId: 's', mode: 'TOPIC', title: 'T', questions: [q], topicNames: {}, articles: {}, againHref: '/a', nextTopicHref: '/n', chooseHref: '/practice' }));
    assert(amber(runner) === 1, `question screen: ${amber(runner)} amber`);
    assert((runner.match(/<label class="[^"]*min-h-12/g) || []).length === 4, 'options ≥ 48 px');
    assert(/data-report-question=""[^>]*class="[^"]*min-h-12|class="[^"]*min-h-12[^"]*"[^>]*data-report-question/.test(runner), 'report button ≥ 48 px');
    const src = read('components/practice/practice-runner.tsx');
    assert((src.match(/variant="accent-on-light"/g) || []).length === 3 && /\{result \? \(\s*<PillButton variant="accent-on-light" onClick=\{next\}>[\s\S]*?\) : \(\s*<PillButton variant="accent-on-light" onClick=\{check\}/.test(src), 'result screen: Next replaces Check (still one amber); end: Practice again only');
    // chooser
    process.env.PRACTICE_ENABLED = 'true';
    MOCKS['@/lib/supabase/server'] = { createServerSupabaseClient: async () => ({}) };
    MOCKS['@/lib/auth/session-state'] = { getSessionState: async () => ({ state: 'user', user: { id: 'u1' } }) };
    MOCKS['@/lib/practice/server'] = {
      practiceExams: async () => [{ id: 'e1', slug: 'ssc-cgl', title: 'SSC CGL', mine: true }],
      examSections: async () => [{ id: 's1', name: 'Quant', topics: [{ id: 't1', name: 'Algebra', count: 12 }] }, { id: 's2', name: 'English', topics: [] }],
    };
    const page = require(path.join(ROOT, 'app/practice/page.tsx')).default;
    const chooser = html(await page({ searchParams: Promise.resolve({}) }));
    assert(/data-practice-chooser/.test(chooser) && amber(chooser) === 1, `chooser: ${amber(chooser)} amber`);
    assert(/Algebra/.test(text(chooser)) && /12 questions/.test(text(chooser)) && /Mistake drills/.test(text(chooser)) && /href="\/mistakes\/drill"/.test(chooser), 'topics + drills entry');
    const cards = chooser.split(/(?=<div class="[^"]*" data-(?:topic-card|drills-entry)="">)/).slice(1).map((c) => c.slice(0, c.indexOf('</li>') > 0 ? c.indexOf('</li>') : c.indexOf('</section>')));
    assert(cards.length === 2 && cards.every((c) => (c.match(/<a\b/g) || []).length === 1), 'single-link cards');
    assert((chooser.match(/class="[^"]*size-12[^"]*"[^>]*>(5|10|20)</g) || []).length === 3, 'set size controls ≥ 48 px');
    return 'question 1 · chooser 1 · end 1';
  });

  await test('T-10 takeaways: 2–3 task-focused lines, nothing about the person (R3)', () => {
    const rows = [
      { questionId: '1', topicName: 'Algebra', isCorrect: false, answered: true },
      { questionId: '2', topicName: 'Algebra', isCorrect: true, answered: true },
      { questionId: '3', topicName: 'Series', isCorrect: false, answered: false },
    ];
    const t = E.takeaways(rows);
    assert(t.length >= 2 && t.length <= 3, String(t.length));
    assert(/1 question to revisit/.test(t[0]) && /1 question was left unanswered/.test(t[1]), t.join(' | '));
    const all = [...t, ...E.takeaways([{ questionId: '1', topicName: 'A', isCorrect: true, answered: true }])].join(' ');
    assert(!/\byou are\b|\byou're\b|great job|well done|smart|weak student|lazy|careless|bad at|failed|fail\b/i.test(all), `person-directed: ${all}`);
    return t.join(' | ');
  });

  await test('T-11 flag OFF: drills hub, session 404, reports via the pre-093 path', async () => {
    delete process.env.PRACTICE_ENABLED;
    const hubSrc = read('app/practice/page.tsx');
    assert(/if \(!isPracticeEnabled\(\)\) return <MistakeDrillsHub \/>;/.test(hubSrc), 'flag-off hub');
    const page = require(path.join(ROOT, 'app/practice/page.tsx')).default;
    const hub = html(await page({ searchParams: Promise.resolve({}) }));
    assert(!/data-practice-chooser/.test(hub) && /Drill your mistakes/.test(text(hub)), 'hub rendered');
    const sess = require(path.join(ROOT, 'app/practice/session/page.tsx')).default;
    let nf = false;
    try { await sess({ searchParams: Promise.resolve({ topic: '00000000-0000-0000-0000-000000000000' }) }); } catch (e) { nf = e instanceof NotFoundSignal; }
    assert(nf, 'session must 404 with the flag off');
    const act = code(read('app/practice/actions.ts'));
    assert(/if \(!isPracticeEnabled\(\)\) return \{ ok: false, code: "FAILED" \};/.test(act), 'check action off');
    assert(/if \(isPracticeEnabled\(\)\) \{\s*const \{ data, error \} = await supabase\.rpc\("fn_report_question"/.test(code(read('lib/practice/report.ts'))), 'reports switch on the flag');
    const nav = read('components/shell/nav-config.ts');
    assert(/\{ href: "\/practice", label: "Practice", flag: "PRACTICE" \}/.test(nav) && /\{ href: "\/practice", label: "Mistake drills", unlessFlag: "PRACTICE" \}/.test(nav) && /\{ href: "\/mistakes\/drill", label: "Mistake drills", flag: "PRACTICE" \}/.test(nav), 'nav follows the flag');
    return 'hub · 404 · legacy reports';
  });

  await test('T-12 migration 093 static + allow-list + report button on practice, mock review and drills', () => {
    assert(/ALTER TABLE public\.practice_answers ENABLE ROW LEVEL SECURITY;/.test(MIGC) && /REVOKE ALL ON public\.practice_answers FROM PUBLIC, anon, authenticated;\s*GRANT SELECT ON public\.practice_answers TO authenticated;/.test(MIGC), 'owner-only read, no client write');
    assert(/FOR SELECT TO authenticated USING \(user_id = auth\.uid\(\)\)/.test(MIGC), 'own rows');
    for (const fn of ['fn_check_practice_answer', 'fn_report_question']) {
      assert(new RegExp(`FUNCTION public\\.${fn}\\([\\s\\S]*?SECURITY DEFINER\\s+SET search_path = ''`).test(MIGC), `${fn}: SECDEF + search_path ''`);
      assert(new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\([^)]*\\) FROM PUBLIC, anon;\\s*GRANT EXECUTE ON FUNCTION public\\.${fn}\\([^)]*\\) TO authenticated;`).test(MIGC), `${fn}: grants`);
    }
    assert(/DROP POLICY IF EXISTS "Users can create errata reports"/.test(MIGC) && /DROP POLICY IF EXISTS "Users can read own errata reports"/.test(MIGC) && /REVOKE INSERT, SELECT, UPDATE, DELETE, TRUNCATE ON public\.question_errata_reports FROM anon, authenticated;/.test(MIGC), 'errata admin-only');
    assert(!/^\s*(BEGIN|COMMIT|ROLLBACK)\s*;/m.test(MIGC), 'transaction control');
    assert(fs.existsSync(path.join(ROOT, 'docs/database/rollback/093_rollback.sql')), 'rollback file');
    const al = JSON.parse(read('scripts/secdef/allowlist.json'));
    for (const k of ['fn_check_practice_answer(p_question_version_id uuid, p_selected_option_key text, p_time_taken_ms integer, p_set_id uuid, p_mode text)', 'fn_report_question(p_question_id uuid, p_question_version_id uuid, p_reason text, p_note text)']) {
      const e = al.functions[k];
      assert(e && e.class === 'A' && JSON.stringify(e.client) === '["authenticated"]' && e.search_path === '""', `allow-list ${k}`);
    }
    assert(read('components/assessment/question-review-card.tsx').includes('<ReportQuestionButton questionId={questionId}') && read('components/assessment/result-view-client.tsx').includes('questionId={q.questionId}'), 'mock review');
    assert(read('components/mistakes/mistake-drill-result.tsx').includes('<ReportQuestionButton questionId={ev.question_id} questionVersionId={null} />'), 'drills');
    assert(read('components/practice/practice-runner.tsx').includes('<ReportQuestionButton questionId={q.questionId} questionVersionId={view.versionId} />'), 'practice');
    return 'RLS · SECDEF · grants · allow-list · 3 surfaces';
  });

  console.log(`\nF2 practice: ${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
})();
