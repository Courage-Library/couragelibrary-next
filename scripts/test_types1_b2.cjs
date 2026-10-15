/**
 * TYPES-1 batch B2 — covering test (community, descriptive, flashcards, gamification, institutes, premium hub)
 * plus the architect's drill pre-submit ruling and B1 carry-overs found by the live select audit.
 *
 *   B2-1 drill pre-submit payload: toPublicDrillQuestions keeps only whitelisted fields — injected answer data
 *        (correct_option_key, answer_key, is_correct, explanation, explanation_md, solution*) never survives
 *   B2-2 drill pre-submit paths (generate / resume) return toPublicDrillQuestions(...); compile never selects
 *        question_answers; answers appear only after submission (grading)
 *   B2-3 RPC helpers: rpcJsonObject (objects only) and sqlNullArg; DEFAULT-NULL arguments are omitted
 *   B2-4 Class B fixes in code: thread detail embed hinted via messages.thread_id; no test_results.score
 *        anywhere; user_streaks.is_frozen; B-DSH-READINESS tracked
 *   B2-6 no unbound supabase.rpc (premium access / attempt start / dynamic mock / payment order threw TypeError)
 *   B2-5 (live, read-only, ref-locked) every literal select in B2 + B1 carry-over files executes against
 *        couragelibrary-next, except the registered tracked legacy reads; before → after evidence for the fixes
 *
 * Run: node scripts/test_types1_b2.cjs [--offline]
 */
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const OFFLINE = process.argv.includes('--offline');
let passed = 0;
let failed = 0;
async function test(name, fn) {
  try { const info = await fn(); passed++; console.log(`  PASS  ${name}${info ? ' — ' + info : ''}`); } catch (e) { failed++; console.log(`  FAIL  ${name}\n        ${String(e && e.message ? e.message : e).slice(0, 1500)}`); }
}
const assert = (c, m) => { if (!c) throw new Error(m || 'assertion failed'); };
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const load = (f) => {
  const js = ts.transpileModule(read(f), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const m = { exports: {} };
  new Function('module', 'exports', 'require', js)(m, m.exports, require);
  return m.exports;
};

const FORBIDDEN = ['correct_option_key', 'answer_key', 'correct_answer', 'is_correct', 'explanation', 'explanation_md', 'solution_explanation_md', 'solution', 'question_answers'];

(async () => {
  console.log('TYPES-1 B2 covering test');

  await test('B2-1 toPublicDrillQuestions drops every non-whitelisted field (answers never survive)', async () => {
    const { toPublicDrillQuestions, toPublicDrillQuestion } = load('services/mistakes/drill-payload.ts');
    const poisoned = [{
      vault_id: 'v1', question_id: 'q1', question_version_id: 'qv1', question_text: 'What is 2+2?', primary_cognitive_type_id: 'UNCLASSIFIED', consecutive_correct: 1,
      correct_option_key: 'B', answer_key: 'B', is_correct: true, explanation: 'x', explanation_md: 'x', solution_explanation_md: 'x', question_answers: { correct_option_key: 'B' },
      options: [{ id: 'o1', option_key: 'A', content_text: '3', option_text: '3', option_order: 1, is_correct: false, correct: true }, { id: 'o2', option_key: 'B', content_text: '4', option_order: 2, is_correct: true }],
      context: { cognitive_type_name: 'Calc', total_mistakes_count: 2, user_custom_notes: null, correct_option_key: 'B' },
    }];
    const out = toPublicDrillQuestions(poisoned);
    const json = JSON.stringify(out);
    for (const k of FORBIDDEN) assert(!json.includes(`"${k}"`), `forbidden key survived: ${k}`);
    assert(!json.includes('"correct"'), 'option-level "correct" survived');
    assert(out[0].question_text === 'What is 2+2?' && out[0].options.length === 2 && out[0].options[1].option_key === 'B', 'payload content lost');
    assert(out[0].context.user_custom_notes === null && out[0].context.total_mistakes_count === 2, 'context lost');
    assert(Array.isArray(toPublicDrillQuestions(null)) && toPublicDrillQuestions(null).length === 0, 'non-array → []');
    assert(toPublicDrillQuestion('junk').options.length === 0, 'junk → empty question');
    return `${FORBIDDEN.length} forbidden keys checked`;
  });

  await test('B2-2 drill pre-submit paths project through the whitelist; compile never selects answers', async () => {
    const src = read('services/mistake.service.ts');
    assert(src.includes('import { toPublicDrillQuestions } from "@/services/mistakes/drill-payload";'), 'projection not imported');
    assert(/questions: toPublicDrillQuestions\(drillQuestions\),/.test(src), 'generate path not projected');
    assert(/questions: toPublicDrillQuestions\(d\.questions_data\),/.test(src), 'resume path not projected');
    const g = src.indexOf('static async generateMistakeDrill(');
    const gBody = src.slice(g, src.indexOf('static async', g + 30));
    assert(!/question_answers|correct_option_key|explanation/.test(gBody.replace(/\/\/[^\n]*/g, '')), 'drill compile references answer data');
    // the browser receives answers only from the post-submit result component
    const runner = read('components/mistakes/mistake-drill-runner.tsx');
    assert(!/correct_option_key|explanation/.test(runner), 'drill runner (pre-submit UI) references answer data');
  });

  await test('B2-3 rpcJsonObject / sqlNullArg; DEFAULT-NULL arguments omitted instead of null', async () => {
    const { rpcJsonObject, sqlNullArg } = load('lib/supabase/rpc.ts');
    assert(rpcJsonObject({ success: true }).success === true, 'object passes');
    for (const v of [null, undefined, 'x', 3, true, [1]]) assert(rpcJsonObject(v) === null, `non-object ${JSON.stringify(v)} → null`);
    assert(sqlNullArg(undefined) === null && sqlNullArg('a') === 'a', 'sqlNullArg');
    for (const f of ['services/community.service.ts', 'services/descriptive.service.ts', 'services/institute.service.ts']) {
      const src = read(f);
      assert(!/\bp_[a-z_]+: payload\.[A-Za-z]+ \|\| null,/.test(src), `${f}: an RPC argument is still passed as null`);
    }
    assert(/p_context_id: sqlNullArg\(payload\.contextId \|\| null\)/.test(read('services/community.service.ts')), 'no-default p_context_id must use sqlNullArg');
  });

  await test('B2-4 Class B fixes present; legacy readiness read tracked', async () => {
    assert(read('services/community.service.ts').includes('discussion_messages!discussion_messages_thread_id_fkey(*)'), 'thread detail embed not hinted');
    for (const f of ['services/premium-hub.service.ts', 'services/assessment.service.ts']) {
      assert(!/test_results\([^)]*\bscore\b/.test(read(f).replace(/total_score/g, 'TS')), `${f}: test_results(score) still selected`);
    }
    const dsh = read('services/dashboard.service.ts');
    assert(dsh.includes('select("current_streak, longest_streak, is_frozen")') && dsh.includes('freeze_active: streakData.is_frozen'), 'streak column not fixed');
    assert(dsh.includes('TYPES-1:B-DSH-READINESS'), 'readiness drift not tracked');
  });

  await test('B2-6 no unbound supabase.rpc anywhere (an unbound rpc loses `this` and throws on every call)', async () => {
    const hits = [];
    const walk = (dir) => {
      if (!fs.existsSync(dir)) return;
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { if (!['node_modules', '.next'].includes(e.name)) walk(p); continue; }
        if (!/\.(ts|tsx)$/.test(e.name)) continue;
        fs.readFileSync(p, 'utf8').split(/\r?\n/).forEach((l, i) => {
          if (/^\s*(\/\/|\*)/.test(l)) return;
          // `x.rpc as …` or `= x.rpc;` (method detached from its client) — `.rpc.bind(x)` and `x.rpc(` are fine
          if (/\.rpc\s+as\s/.test(l) || /=\s*[A-Za-z_.]+\.rpc\s*;/.test(l)) hits.push(`${path.relative(ROOT, p).replace(/\\/g, '/')}:${i + 1}`);
        });
      }
    };
    ['app', 'services', 'lib', 'actions', 'components'].forEach((d) => walk(path.join(ROOT, d)));
    assert(hits.length === 0, hits.join(', '));
    const pe = read('services/premium-entitlement.service.ts');
    assert((pe.match(/supabase\.rpc\.bind\(supabase\)/g) || []).length === 2, 'premium entitlement: both RPCs must be bound');
  });

  if (OFFLINE) {
    console.log('  SKIP  live select audit (--offline)');
  } else {
    await test('B2-5 live select audit: B2 + carry-over files clean except registered tracked legacy reads', async () => {
      const files = ['app/admin/rewards/actions.ts', 'services/community.service.ts', 'services/descriptive.service.ts', 'services/flashcard.service.ts', 'services/gamification.service.ts', 'services/institute.service.ts', 'services/premium-hub.service.ts', 'services/assessment.service.ts', 'services/dashboard.service.ts', 'services/mistake.service.ts'];
      const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts/types1-select-audit.cjs'), ...files], { cwd: ROOT, encoding: 'utf8', windowsHide: true });
      const fails = (r.stdout || '').split('\n').filter((l) => l.startsWith('FAIL'));
      // tracked (owner LOOP-1): dashboard mastery / recommendations / readiness legacy reads
      const TRACKED = [/dashboard\.service\.ts:\d+\s+user_topic_mastery\b/, /dashboard\.service\.ts:\d+\s+daily_study_recommendations\b/, /dashboard\.service\.ts:\d+\s+user_exam_readiness\b/];
      const untracked = fails.filter((l) => !TRACKED.some((re) => re.test(l)));
      assert(untracked.length === 0, untracked.join('\n        '));
      return ((r.stdout || '').trim().split('\n').pop() || '') + ` (${fails.length} tracked legacy)`;
    });
  }

  console.log(`\nTYPES-1 B2: ${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
})();
