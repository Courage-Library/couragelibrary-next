/**
 * DRILL-1 — server-authoritative mistake drills (fn_generate_mistake_drill / fn_submit_mistake_drill, migration 085).
 *
 * Live suite (couragelibrary-next, verified TLS; permanent QA identities only — qa-student owns the vault, qa-staff is
 * "student B" with an empty vault; no account is created). PostgREST is called with real user sessions; pg (owner)
 * is used read-only for canonical answers and before/after snapshots.
 *   D1  qa-student generates a drill from its own vault → success, IN_PROGRESS row owned by the student
 *   D2  neither the response nor the stored drill carries a correct key / explanation / is_correct / solution field
 *   D3  submit: the server grades the DRILL's questions against the compiled versions' answer keys; client-sent
 *       is_correct / score fields, an extra (non-drill) question and a duplicated answer are ignored; unanswered =
 *       incorrect; explanations appear only after submission
 *   D4  a second submit is idempotent: same result, no further vault / occurrence / drill change
 *   D5  another user cannot use qa-student's drill: a simulated second student (JWT claims, rolled back) reads 0 rows,
 *       gets NOT_FOUND on submit and FORBIDDEN on generate; real qa-staff gets NOT_FOUND / FORBIDDEN from the RPCs
 *       (staff may READ drills by design — support policy p_umd_select)
 *   D6  anon cannot execute either RPC (401 / 42501)
 *   D7  qa-student has no INSERT / UPDATE / DELETE on user_mistake_drills (direct PostgREST writes → 42501)
 *   D8  coins_awarded = 0; no coin_ledger / gamification_events row for the student during the suite
 *   D9  service level (no network): an RPC error / a failed RPC result is surfaced, never swallowed; the drill path
 *       has no direct table write and no service-role client
 *   D10 empty vault (qa-staff): generate → typed NOTHING_TO_DRILL, no row; service level: no candidates → typed
 *       error and the RPC is not called
 *
 * Needs mistakes in qa-student's vault: run scripts/e2e/student-journey.cjs first; afterwards run
 * cleanup-student with E2E_KEEP_USER=1 (it removes the drills too).
 * Run: node scripts/test_drill1.cjs [--offline]
 */
const { safeBegin } = require('./db/live-safety.cjs'); // LIVE-LOCK-SWEEP: the one safe BEGIN (timeouts + rollback on stop)
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
const OFFLINE = process.argv.includes('--offline');
let passed = 0;
let failed = 0;
async function test(name, fn) {
  try { const info = await fn(); passed++; console.log(`  PASS  ${name}${info ? ' — ' + info : ''}`); } catch (e) { failed++; console.log(`  FAIL  ${name}\n        ${String(e && e.message ? e.message : e).slice(0, 1500)}`); }
}
const assert = (c, m) => { if (!c) throw new Error(m || 'assertion failed'); };
const FORBIDDEN_KEYS = /^(correct_option_key|correct_option|correct_answer|answer|answers|answer_key|explanation|explanation_md|is_correct|solution|solution_text)$/;
const leakedKeys = (v, out = []) => {
  if (Array.isArray(v)) v.forEach((x) => leakedKeys(x, out));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { if (FORBIDDEN_KEYS.test(k)) out.push(k); leakedKeys(x, out); }
  return out;
};

// ---------------------------------------------------------------- service-level harness (D9 / D10b)
function loadMistakeService(mockClient) {
  const resolve = Module._resolveFilename;
  Module._resolveFilename = function (request, parent, isMain, options) {
    if (request.startsWith('@/')) return resolve.call(this, path.resolve(ROOT, request.slice(2)), parent, isMain, options);
    return resolve.call(this, request, parent, isMain, options);
  };
  const transpile = (m, filename) => m._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename);
  require.extensions['.ts'] = transpile;
  require.extensions['.tsx'] = transpile;
  const load = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === 'server-only') return {};
    if (request === '@/lib/supabase/server') return { createServerSupabaseClient: async () => mockClient.current, createAdminServerSupabaseClient: () => { throw new Error('the drill path must not use the service role'); } };
    return load.call(this, request, parent, isMain);
  };
  return require(path.join(ROOT, 'services/mistake.service.ts')).MistakeService;
}
/** chainable query mock: every builder call returns itself; awaiting yields results[table] */
function mock({ results = {}, rpc }) {
  const calls = [];
  return {
    calls,
    auth: { getUser: async () => ({ data: { user: { id: '00000000-0000-4000-8000-0000000000a1' } } }) },
    from(table) {
      const res = results[table] || { data: [], error: null };
      const b = new Proxy({}, { get(_, prop) { return prop === 'then' ? (ok, ko) => Promise.resolve(res).then(ok, ko) : (...a) => { calls.push([table, prop, a]); return b; }; } });
      return b;
    },
    rpc: async (name, args) => { calls.push(['rpc', name, args]); return rpc(name, args); },
  };
}

(async () => {
  console.log('DRILL-1 server-authoritative mistake drills');
  const holder = { current: null };
  const MistakeService = loadMistakeService(holder);

  await test('D9 service: RPC errors / failed results are surfaced (not swallowed); no direct drill writes, no service role in the drill path', async () => {
    const src = fs.readFileSync(path.join(ROOT, 'services/mistake.service.ts'), 'utf8');
    const gen = src.slice(src.indexOf('static async generateMistakeDrill('), src.indexOf('static async getMistakeDrill('));
    const sub = src.slice(src.indexOf('static async submitMistakeDrill('), src.indexOf('Dynamically loads available subjects'));
    assert(!/from\("user_mistake_drills"\)\s*\.(insert|update|upsert|delete)/.test(gen + sub), 'direct drill write in the drill path');
    assert(!/from\("user_mistake_(vault|occurrences)"\)\s*\.(insert|update|upsert|delete)/.test(sub), 'direct vault / occurrence write in submit');
    assert(!/createAdminServerSupabaseClient|fn_award_gamification_reward/.test(gen + sub), 'service role or reward call in the drill path');
    holder.current = mock({ rpc: async () => ({ data: null, error: { code: 'P0001', message: 'DRILL_WRITE_FAILED: drill completion affected 0 rows' } }) });
    const r1 = await MistakeService.submitMistakeDrill('11111111-1111-4111-8111-111111111111', []);
    assert(r1.success === false && /P0001/.test(r1.error) && /Nothing was saved/.test(r1.error), `rpc error not surfaced: ${JSON.stringify(r1)}`);
    holder.current = mock({ rpc: async () => ({ data: { success: false, code: 'NOT_OPEN', error: 'This drill session is no longer open.' }, error: null }) });
    const r2 = await MistakeService.submitMistakeDrill('11111111-1111-4111-8111-111111111111', []);
    assert(r2.success === false && /no longer open/.test(r2.error), `failed result not surfaced: ${JSON.stringify(r2)}`);
    holder.current = mock({ results: { user_mistake_vault: { data: [{ id: 'v1', question_id: 'q1', total_mistakes_count: 1, consecutive_correct_in_remediation: 0, lifecycle_status: 'UNRESOLVED', last_mistake_at: new Date().toISOString() }], error: null } },
      rpc: async () => ({ data: null, error: { code: '42501', message: 'permission denied' } }) });
    const r3 = await MistakeService.generateMistakeDrill({ limit: 5 });
    assert(r3.success === false && /42501/.test(r3.error), `generate rpc error not surfaced: ${JSON.stringify(r3)}`);
    return 'submit error + failed result + generate error all surfaced';
  });

  await test('D10b service: no candidate mistakes → typed error and the generate RPC is not called', async () => {
    const m = mock({ results: { user_mistake_vault: { data: [], error: null } }, rpc: async () => { throw new Error('rpc must not be called'); } });
    holder.current = m;
    const r = await MistakeService.generateMistakeDrill({ limit: 5 });
    assert(r.success === false && /No eligible/.test(r.error), JSON.stringify(r));
    assert(!m.calls.some((c) => c[0] === 'rpc'), 'rpc called with an empty vault');
  });

  if (OFFLINE) { console.log('  SKIP  D1–D8, D10 (--offline)'); return finish(); }

  // ---------------------------------------------------------------- live
  const { Client } = require('pg');
  const { dbTarget, readEnv } = require('./db/_db-env.cjs');
  const env = readEnv();
  const URL_ = env('NEXT_PUBLIC_SUPABASE_URL');
  const ANON = env('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  const c = new Client({ ...dbTarget().pg, port: 6543 });
  c.on('error', () => {});
  await c.connect();
  const ro = async (sql, p) => { await safeBegin(c, { readOnly: true }); try { return (await c.query(sql, p)).rows; } finally { await c.query('ROLLBACK'); } };
  // CI-FIX-1 (#74): CAPTCHA-safe QA session (scripts/live/qa-session.cjs); the second argument is kept for call sites
  const { qaAccessToken } = require('./live/qa-session.cjs');
  const token = async (email) => qaAccessToken(email).catch((e) => {
    throw new Error(`QA session failed (${email.split('@')[0]}: ${e.code || e.name})`);
  });
  const call = async (bearer, method, p, body) => {
    for (let i = 1; i <= 3; i++) {
      try {
        const r = await fetch(`${URL_}/rest/v1/${p}`, { method, headers: { apikey: ANON, Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: body === undefined ? undefined : JSON.stringify(body) });
        const json = await r.json().catch(() => null);
        return { status: r.status, body: json, code: json && !Array.isArray(json) ? json.code : null };
      } catch (e) { if (i === 3) throw e; }
    }
  };
  const rpc = (bearer, fn, args) => call(bearer, 'POST', `rpc/${fn}`, args);

  try {
    const ids = Object.fromEntries((await ro(`SELECT email, id FROM auth.users WHERE email IN ('qa-student@courage-library.test','qa-staff@courage-library.test')`)).map((r) => [r.email, r.id]));
    const STUDENT = ids['qa-student@courage-library.test'];
    const STAFF = ids['qa-staff@courage-library.test'];
    assert(STUDENT && STAFF, 'QA identities missing');
    const vault = await ro(`SELECT v.id, v.question_id FROM public.user_mistake_vault v WHERE v.user_id = $1 AND v.lifecycle_status IN ('UNRESOLVED','REVISITING') ORDER BY v.last_mistake_at DESC`, [STUDENT]);
    assert(vault.length > 0, 'qa-student has no open mistakes: run scripts/e2e/student-journey.cjs first');
    const studentTok = await token('qa-student@courage-library.test', 'QA_STUDENT_PASSWORD');
    const staffTok = await token('qa-staff@courage-library.test', 'QA_STAFF_PASSWORD');
    const sideEffects = async () => (await ro(`SELECT (SELECT count(*)::int FROM public.coin_ledger WHERE user_id = $1) ledger, (SELECT count(*)::int FROM public.gamification_events WHERE user_id = $1) events`, [STUDENT]))[0];
    const before = await sideEffects();
    const staffDrills0 = (await ro(`SELECT count(*)::int n FROM public.user_mistake_drills WHERE user_id = $1`, [STAFF]))[0].n;

    let drill = null;
    await test('D1 qa-student generates a drill from its own vault (server RPC)', async () => {
      const r = await rpc(studentTok, 'fn_generate_mistake_drill', { p_vault_ids: vault.map((v) => v.id) });
      assert(r.status === 200 && r.body && r.body.success === true && r.body.drill_id, `generate: ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`);
      assert(Array.isArray(r.body.questions) && r.body.questions.length >= 1, 'drill has 0 questions: D2 (no answers before submit) would pass vacuously'); // GATE-HYGIENE-1
      const row = (await ro(`SELECT user_id, status, total_questions, coins_awarded FROM public.user_mistake_drills WHERE id = $1`, [r.body.drill_id]))[0];
      assert(row && row.user_id === STUDENT && row.status === 'IN_PROGRESS' && row.total_questions === r.body.questions.length, `row ${JSON.stringify(row)}`);
      drill = r.body;
      return `${drill.total_questions} question(s)`;
    });

    await test('D2 pre-submit payload (response + stored row) has no answer / explanation fields', async () => {
      assert(drill, 'no drill');
      const leaked = leakedKeys(drill);
      const stored = (await ro(`SELECT questions_data FROM public.user_mistake_drills WHERE id = $1`, [drill.drill_id]))[0].questions_data;
      const leakedStored = leakedKeys(stored);
      assert(leaked.length === 0 && leakedStored.length === 0, `leaked: response ${leaked} stored ${leakedStored}`);
      assert(drill.questions.every((q) => q.question_version_id && Array.isArray(q.options) && q.options.length > 0), 'questions lack version / options');
    });

    let firstResult = null;
    let expected = null;
    let extraVault = null;
    await test('D3 server grades the drill against canonical answers; client score / is_correct / extra / duplicate answers ignored', async () => {
      assert(drill, 'no drill');
      const keys = await ro(`SELECT a.question_version_id::text v, a.correct_option_key k, a.explanation_md e FROM public.question_answers a WHERE a.question_version_id = ANY($1::uuid[])`, [drill.questions.map((q) => q.question_version_id)]);
      const keyOf = Object.fromEntries(keys.map((k) => [k.v, k.k]));
      const answers = [];
      expected = { correct: 0, wrongOrBlank: 0 };
      drill.questions.forEach((q, i) => {
        const correct = q.options.find((o) => o.option_key === keyOf[q.question_version_id]);
        const wrong = q.options.find((o) => o.option_key !== keyOf[q.question_version_id]);
        if (i % 3 === 0 && correct) { answers.push({ question_id: q.question_id, selected_option_id: correct.id, is_correct: false, score: 0 }); expected.correct++; }
        else if (i % 3 === 1 && wrong) { answers.push({ question_id: q.question_id, selected_option_id: wrong.id, is_correct: true, score: 100 }); expected.wrongOrBlank++; }
        else expected.wrongOrBlank++; // unanswered = incorrect
      });
      // a duplicated (correct) answer for the first question and an answer for a question outside the drill
      if (answers[0]) answers.push({ ...answers[0] });
      extraVault = (await ro(`SELECT v.id, v.question_id, v.consecutive_correct_in_remediation s, v.lifecycle_status l FROM public.user_mistake_vault v
                               WHERE v.user_id = $1 AND NOT (v.question_id = ANY($2::uuid[])) LIMIT 1`, [STUDENT, drill.questions.map((q) => q.question_id)]))[0] || null;
      if (extraVault) answers.push({ question_id: extraVault.question_id, selected_option_key: 'A', is_correct: true });
      answers.push({ score: 999, correct_count: 999 });
      const r = await rpc(studentTok, 'fn_submit_mistake_drill', { p_drill_id: drill.drill_id, p_answers: answers });
      assert(r.status === 200 && r.body && r.body.success === true, `submit: ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`);
      const s = r.body.summary;
      assert(s.total_questions === drill.questions.length && s.correct_count === expected.correct && s.unresolved_count === expected.wrongOrBlank,
        `summary ${JSON.stringify(s)} expected ${JSON.stringify(expected)}`);
      assert(r.body.evaluations.length === drill.questions.length, 'evaluations must cover exactly the drill questions');
      for (const ev of r.body.evaluations) {
        const q = drill.questions.find((x) => x.question_id === ev.question_id);
        assert(q && ev.correct_option_key === keyOf[q.question_version_id], `canonical key mismatch for ${ev.question_id}`);
        assert(ev.is_correct === (ev.selected_option_key !== null && ev.selected_option_key === ev.correct_option_key), 'is_correct not derived from the keys');
      }
      assert(r.body.evaluations.some((e) => 'explanation' in e), 'explanations must be returned after submission');
      if (extraVault) {
        const now = (await ro(`SELECT consecutive_correct_in_remediation s, lifecycle_status l FROM public.user_mistake_vault WHERE id = $1`, [extraVault.id]))[0];
        assert(now.s === extraVault.s && now.l === extraVault.l, 'a non-drill question was mutated');
      }
      firstResult = r.body;
      return `correct ${s.correct_count}/${s.total_questions} (expected ${expected.correct}); unresolved ${s.unresolved_count}`;
    });

    await test('D4 double submit: idempotent stored result, no second mutation', async () => {
      assert(firstResult, 'no first submission');
      const snap = async () => JSON.stringify(await ro(`SELECT (SELECT json_agg(v ORDER BY v.id) FROM public.user_mistake_vault v WHERE v.user_id = $1) vault,
          (SELECT count(*) FROM public.user_mistake_occurrences WHERE user_id = $1) occ,
          (SELECT row_to_json(d) FROM public.user_mistake_drills d WHERE d.id = $2) drill`, [STUDENT, drill.drill_id]));
      const s0 = await snap();
      const r = await rpc(studentTok, 'fn_submit_mistake_drill', { p_drill_id: drill.drill_id, p_answers: [] });
      assert(r.status === 200 && r.body.success === true && r.body.idempotent === true, `second submit: ${JSON.stringify(r.body).slice(0, 200)}`);
      assert(JSON.stringify(r.body.summary) === JSON.stringify(firstResult.summary), `summary differs: ${JSON.stringify(r.body.summary)} vs ${JSON.stringify(firstResult.summary)}`);
      assert(JSON.stringify(r.body.evaluations) === JSON.stringify(firstResult.evaluations), 'evaluations differ');
      assert(s0 === (await snap()), 'the second submit changed vault / occurrences / drill');
    });

    await test('D5 another user cannot read / submit / build from qa-student\'s drill or vault (simulated student B + real qa-staff)', async () => {
      assert(drill, 'no drill');
      // student B = a second plain student JWT (sub = random uuid, no app_metadata role) inside a rolled-back
      // transaction — no account is created. (qa-staff may READ all drills by design: p_umd_select grants
      // admin / staff support reads; the RPCs still refuse it below.)
      const sim = {};
      await safeBegin(c);
      try {
        await c.query(`SET LOCAL ROLE authenticated`);
        await c.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: '00000000-0000-4000-8000-00000000d1b2', role: 'authenticated', app_metadata: {} })]);
        sim.read = (await c.query(`SELECT count(*)::int n FROM public.user_mistake_drills WHERE id = $1`, [drill.drill_id])).rows[0].n;
        sim.submit = (await c.query(`SELECT public.fn_submit_mistake_drill($1, '[]'::jsonb) r`, [drill.drill_id])).rows[0].r.code;
        sim.generate = (await c.query(`SELECT public.fn_generate_mistake_drill($1::uuid[]) r`, [[vault[0].id]])).rows[0].r.code;
      } finally {
        await c.query('ROLLBACK');
      }
      assert(sim.read === 0 && sim.submit === 'NOT_FOUND' && sim.generate === 'FORBIDDEN', `student B: ${JSON.stringify(sim)}`);
      const sub = await rpc(staffTok, 'fn_submit_mistake_drill', { p_drill_id: drill.drill_id, p_answers: [] });
      assert(sub.status === 200 && sub.body.success === false && sub.body.code === 'NOT_FOUND', `staff submit: ${JSON.stringify(sub.body)}`);
      const gen = await rpc(staffTok, 'fn_generate_mistake_drill', { p_vault_ids: [vault[0].id] });
      assert(gen.status === 200 && gen.body.success === false && gen.body.code === 'FORBIDDEN', `staff generate: ${JSON.stringify(gen.body)}`);
      const n = (await ro(`SELECT count(*)::int n FROM public.user_mistake_drills WHERE user_id = $1`, [STAFF]))[0].n;
      assert(n === staffDrills0, 'a drill row was created for staff');
      return 'student B: 0 rows / NOT_FOUND / FORBIDDEN; qa-staff: NOT_FOUND / FORBIDDEN';
    });

    await test('D6 anon cannot execute fn_generate_mistake_drill / fn_submit_mistake_drill (401 / 42501)', async () => {
      const g = await rpc(ANON, 'fn_generate_mistake_drill', { p_vault_ids: [] });
      const s = await rpc(ANON, 'fn_submit_mistake_drill', { p_drill_id: '00000000-0000-0000-0000-000000000000', p_answers: [] });
      for (const [n, r] of [['generate', g], ['submit', s]]) assert((r.status === 401 || r.status === 403) && r.code === '42501', `${n}: ${r.status} ${r.code}`);
      return `${g.status}/${g.code} · ${s.status}/${s.code}`;
    });

    await test('D7 qa-student has no INSERT / UPDATE / DELETE on user_mistake_drills (direct PostgREST writes denied)', async () => {
      assert(drill, 'no drill');
      const rowBefore = JSON.stringify(await ro(`SELECT * FROM public.user_mistake_drills WHERE id = $1`, [drill.drill_id]));
      const ins = await call(studentTok, 'POST', 'user_mistake_drills', { user_id: STUDENT, total_questions: 1, questions_data: [], status: 'COMPLETED', correct_count: 1, coins_awarded: 5 });
      const upd = await call(studentTok, 'PATCH', `user_mistake_drills?id=eq.${drill.drill_id}`, { correct_count: 999, coins_awarded: 5 });
      const del = await call(studentTok, 'DELETE', `user_mistake_drills?id=eq.${drill.drill_id}`);
      for (const [n, r] of [['insert', ins], ['update', upd], ['delete', del]]) assert((r.status === 401 || r.status === 403) && r.code === '42501', `${n}: ${r.status} ${r.code}`);
      assert(rowBefore === JSON.stringify(await ro(`SELECT * FROM public.user_mistake_drills WHERE id = $1`, [drill.drill_id])), 'the drill row changed');
      const grants = (await ro(`SELECT has_table_privilege('authenticated','public.user_mistake_drills','INSERT') i, has_table_privilege('authenticated','public.user_mistake_drills','UPDATE') u, has_table_privilege('authenticated','public.user_mistake_drills','DELETE') d`))[0];
      assert(!grants.i && !grants.u && !grants.d, JSON.stringify(grants));
      return `insert ${ins.status}, update ${upd.status}, delete ${del.status} (42501)`;
    });

    await test('D8 coins_awarded = 0 and no coin_ledger / gamification_events row created', async () => {
      assert(drill, 'no drill');
      const row = (await ro(`SELECT coins_awarded FROM public.user_mistake_drills WHERE id = $1`, [drill.drill_id]))[0];
      const after = await sideEffects();
      assert(row.coins_awarded === 0 && firstResult.summary.coins_awarded === 0, `coins ${row.coins_awarded} / ${firstResult.summary.coins_awarded}`);
      assert(after.ledger === before.ledger && after.events === before.events, `ledger ${before.ledger}→${after.ledger}, events ${before.events}→${after.events}`);
    });

    await test('D10 empty vault (qa-staff): generate → typed NOTHING_TO_DRILL, no row created', async () => {
      const staffVault = (await ro(`SELECT count(*)::int n FROM public.user_mistake_vault WHERE user_id = $1`, [STAFF]))[0].n;
      assert(staffVault === 0, `qa-staff vault is not empty (${staffVault})`);
      const r = await rpc(staffTok, 'fn_generate_mistake_drill', { p_vault_ids: [] });
      assert(r.status === 200 && r.body.success === false && r.body.code === 'NOTHING_TO_DRILL', JSON.stringify(r.body));
      const n = (await ro(`SELECT count(*)::int n FROM public.user_mistake_drills WHERE user_id = $1`, [STAFF]))[0].n;
      assert(n === staffDrills0, 'a drill row was created');
    });
  } finally {
    await c.end().catch(() => {});
  }
  finish();
})().catch((e) => { console.error('SUITE ERROR', String(e && e.message ? e.message : e).slice(0, 400)); process.exit(1); });

function finish() {
  console.log(`\nDRILL-1: ${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
}
