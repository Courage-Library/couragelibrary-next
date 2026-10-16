/**
 * TYPES-1 batch B1 — covering test for the unambiguous Class B fixes (student core).
 *
 * Static (always): the fixed query shapes are in the code and the broken ones are gone.
 * Live (READ-ONLY PostgREST GETs, ref-locked to couragelibrary-next; skipped with --offline): every
 * pre-fix select fails with 42703 against the live schema (before), every fixed select succeeds (after),
 * and the one-to-one embeds come back as objects (never arrays).
 *
 *   B1-1 mistake detail / drill compile / drill grading: question_options(option_text, order_index),
 *        question_answers(explanation_md) one-to-one; grading reads the drill's compiled versions
 *   B1-2 test_attempts → test_results is one-to-one (resume "answered" count)
 *   B1-3 today-mock template embed selects mock_tests.title (it is read)
 *   B1-4 getExamDetail: subjects has no code column
 *   B1-5 drill reward: a PostgREST builder has no .catch — awaited inside try/catch
 *   B1-6 drill coins_awarded records only coins actually credited by the reward RPC (architect interim ruling)
 *   B1-7 question_answers (RLS: students denied) is read server-side with the admin client after ownership checks
 *
 * Run: node scripts/test_types1_b1.cjs [--offline]
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OFFLINE = process.argv.includes('--offline');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
let passed = 0;
let failed = 0;
async function test(name, fn) {
  try { const info = await fn(); passed++; console.log(`  PASS  ${name}${info ? ' — ' + info : ''}`); } catch (e) { failed++; console.log(`  FAIL  ${name}\n        ${String(e && e.message ? e.message : e).slice(0, 1500)}`); }
}
const assert = (c, m) => { if (!c) throw new Error(m || 'assertion failed'); };

const MISTAKE = read('services/mistake.service.ts');
// DRILL-1 (085): drill compile, grading and every drill write moved into fn_generate / fn_submit_mistake_drill
const DRILL_SQL = read('supabase/migrations/20261016000085_drill1_server_authoritative_drills.sql');
const SUBMIT_SQL = DRILL_SQL.slice(DRILL_SQL.indexOf('CREATE OR REPLACE FUNCTION public.fn_submit_mistake_drill'), DRILL_SQL.indexOf('-- EXECUTE: authenticated only'));
const ASSESS = read('services/assessment.service.ts');

const OLD = {
  detail: 'id, question_versions(id, question_text, question_options(id, option_key, content_text, option_order), question_answers(correct_option_key, solution_explanation_md))',
  drillCompile: 'id, question_versions!inner(id, question_text, is_current, lifecycle_status, question_options(id, option_key, content_text, option_order))',
  drillGrade: 'question_id, question_text, question_answers(correct_option_key, solution_explanation_md)',
  subjects: 'id, name, code',
};
const NEW = {
  detail: 'id, question_versions(id, question_text, question_options(id, option_key, option_text, order_index), question_answers(correct_option_key, explanation_md))',
  drillCompile: 'id, question_versions!inner(id, question_text, is_current, lifecycle_status, question_options(id, option_key, option_text, order_index))',
  drillGrade: 'question_id, question_text, question_answers(correct_option_key, explanation_md)',
  subjects: 'id, name, slug',
};

(async () => {
  console.log('TYPES-1 B1 covering test');

  await test('B1-1 static: mistake detail / drill selects use the live columns; one-to-one question_answers', async () => {
    assert(MISTAKE.includes(NEW.detail), 'fixed select missing: detail');
    // drill compile + grade (DRILL-1): the RPCs read the live columns of the COMPILED version
    assert(/'option_key', o\.option_key, 'content_text', o\.option_text,\s*'option_text', o\.option_text, 'option_order', coalesce\(o\.order_index, 0\)/.test(DRILL_SQL), 'drill compile: live option columns');
    assert(/SELECT a\.correct_option_key, a\.explanation_md INTO v_correct, v_expl\s+FROM public\.question_answers a WHERE a\.question_version_id = v_version_id;/.test(SUBMIT_SQL), 'drill grade: answers of the compiled version');
    for (const bad of ['content_text, option_order', 'solution_explanation_md)', 'question_answers?.[0]', '.option_order ||', 'opt.content_text']) assert(!MISTAKE.includes(bad), `pre-fix form still present: ${bad}`);
    assert(!/ANSWER_SELECT|answerSb/.test(MISTAKE), 'drill grading must not run in the app any more (DRILL-1)');
  });

  await test('B1-2/3/4 static: assessment one-to-one test_results, mock title selected, no subjects.code', async () => {
    assert(!ASSESS.includes('test_results?.[0]'), 'test_results indexed as an array');
    assert((ASSESS.match(/oneToOne\((?:inProgressAttempt|matchedAttempt)\.test_results\)/g) || []).length === 2, 'oneToOne(test_results) at both resume sites');
    assert(ASSESS.includes('mock_tests(id, title, slug, duration_minutes, total_questions, total_marks, status)'), 'today-mock embed must select title');
    assert(!ASSESS.includes('select("id, name, code")'), 'subjects.code is selected');
  });

  await test('B1-5 static (DRILL-1): no drill reward call anywhere in the drill path (app or RPC); the failed-builder bug cannot recur', async () => {
    const sub = MISTAKE.slice(MISTAKE.indexOf('static async submitMistakeDrill('), MISTAKE.indexOf('Dynamically loads available subjects'));
    assert(!/fn_award_gamification_reward/.test(sub) && !/fn_award_gamification_reward/.test(SUBMIT_SQL), 'reward call in the drill path');
    assert(/await supabase\.rpc\("fn_submit_mistake_drill"/.test(sub) && !/\}\)\.catch\(/.test(sub), 'submit must await the RPC (no .catch on a builder)');
    assert(/TYPES-1:B-DRILL-REWARD-ARGS/.test(sub), 'tracked reward tag missing');
  });

  await test('B1-6 static (DRILL-1): coins_awarded is recorded honestly as 0 — nothing is credited (honest data, #15)', async () => {
    assert(/coins_awarded = 0,/.test(SUBMIT_SQL) && /'coins_awarded', 0\)/.test(SUBMIT_SQL), 'the RPC must store and return coins_awarded = 0');
    assert(!/v_coins_awarded|:= 5|coins_awarded = 5/.test(SUBMIT_SQL), 'a non-zero coin value in the submit RPC');
    const sub = MISTAKE.slice(MISTAKE.indexOf('static async submitMistakeDrill('), MISTAKE.indexOf('Dynamically loads available subjects'));
    assert(!/coinsAwarded|DRILL_REWARD_COINS/.test(sub), 'the app must not compute coins');
  });

  await test('B1-7 static: question_answers is read server-side (admin client) only after ownership is proven', async () => {
    // students cannot read question_answers (RLS, E2E-07) — the session-client embed returned nothing
    const d = MISTAKE.indexOf('static async getMistakeDetail(');
    const dBody = MISTAKE.slice(d, MISTAKE.indexOf('static async', d + 30));
    const own = dBody.indexOf('.eq("user_id", user.id)');
    const adm = dBody.indexOf('const adminSb = createAdminServerSupabaseClient();');
    assert(own > 0 && adm > own, 'detail: admin read must come after the ownership-scoped vault read');
    assert(/adminSb\.from\("questions"\)\.select\("id, question_versions\(id, question_text, question_options\(id, option_key, option_text, order_index\), question_answers\(correct_option_key, explanation_md\)\)"\)\.eq\("id", v\.question_id\)/.test(dBody), 'detail: question + answer must be read with adminSb by the vault question_id');
    // DRILL-1 (085): grading reads question_answers inside the SECURITY DEFINER submit RPC, after the drill row was
    // locked for auth.uid(); the app neither reads answers nor uses the service role for the drill
    const gOwn = SUBMIT_SQL.indexOf('WHERE d.id = p_drill_id AND d.user_id = v_user_id');
    const gAns = SUBMIT_SQL.indexOf('FROM public.question_answers a');
    assert(gOwn > 0 && gAns > gOwn, 'grading: answers must be read after the ownership-scoped drill lock');
    const sub = MISTAKE.slice(MISTAKE.indexOf('static async submitMistakeDrill('), MISTAKE.indexOf('Dynamically loads available subjects'));
    assert(!/createAdminServerSupabaseClient|question_answers/.test(sub.replace(/\/\/[^\n]*/g, '')), 'grading: the app must not read answers or use the service role');
  });

  if (OFFLINE) {
    console.log('  SKIP  live checks (--offline)');
  } else {
    const { readEnv } = require('./db/_db-env.cjs');
    const { refFromEnv, assertProjectRef } = require('./db/gen-types.cjs');
    const env = readEnv();
    assertProjectRef(refFromEnv(env)); // couragelibrary-next only
    const { PostgrestClient } = require('@supabase/postgrest-js');
    const key = env('SUPABASE_SERVICE_ROLE_KEY');
    const db = new PostgrestClient(`${env('NEXT_PUBLIC_SUPABASE_URL')}/rest/v1`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    const get = async (fn) => { let r; for (let i = 1; i <= 3; i++) { r = await fn(); if (!r.error || r.error.code) break; } return r; };
    const shape = (v) => (v === null || v === undefined ? 'null' : Array.isArray(v) ? 'array' : typeof v);

    await test('B1-1 live: pre-fix selects fail with 42703 (before); fixed selects succeed (after)', async () => {
      const out = [];
      for (const [k, table] of [['detail', 'questions'], ['drillCompile', 'questions'], ['drillGrade', 'question_versions'], ['subjects', 'subjects']]) {
        const before = await get(() => db.from(table).select(OLD[k]).limit(1));
        const after = await get(() => db.from(table).select(NEW[k]).limit(3));
        assert(before.error && before.error.code === '42703', `${k}: pre-fix select did not fail with 42703 (${before.error ? before.error.code : 'no error'})`);
        assert(!after.error, `${k}: fixed select failed: ${after.error && after.error.message}`);
        out.push(`${k} 42703→ok`);
      }
      return out.join(', ');
    });

    await test('B1-1/B1-2 live: one-to-one embeds are objects, never arrays', async () => {
      const q = await get(() => db.from('question_versions').select('id, question_answers(correct_option_key, explanation_md)').limit(25));
      assert(!q.error, q.error && q.error.message);
      const qa = new Set((q.data || []).map((r) => shape(r.question_answers)));
      assert(!qa.has('array'), 'question_answers came back as an array');
      const t = await get(() => db.from('test_attempts').select('id, test_results(id, attempted_count)').limit(25));
      assert(!t.error, t.error && t.error.message);
      const tr = new Set((t.data || []).map((r) => shape(r.test_results)));
      assert(!tr.has('array'), 'test_results came back as an array');
      return `question_answers {${[...qa]}}, test_results {${[...tr]}}`;
    });

    await test('B1-5 live: a PostgREST RPC builder has no .catch (not executed)', async () => {
      const b = db.rpc('fn_award_gamification_reward', {}); // never awaited → no request is sent
      assert(typeof b.then === 'function' && typeof b.catch !== 'function', 'builder unexpectedly has .catch');
    });
  }

  console.log(`\nTYPES-1 B1: ${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
})();
