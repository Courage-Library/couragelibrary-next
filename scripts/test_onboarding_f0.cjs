#!/usr/bin/env node
/**
 * F0 onboarding (decision #76) — offline gate (no network, no DB; Supabase is mocked).
 *   O-01 step validation: ≤ 3 distinct exams from the pickable list, date not in the past (India) / ≤ 5 years ahead,
 *        enums (language, attempt, daily minutes); every answer optional
 *   O-02 wizard: Back never loses answers; a 4th exam is ignored; "skip this question" clears only that step
 *   O-03 skip path: flag off → disabled (no RPC); signed in → RPC p_action 'skip' only → safe `next` (hostile → /dashboard)
 *   O-04 save action: flag off / signed out → no RPC; invalid input → no RPC; valid → exact RPC args; RPC
 *        INVALID_INPUT → fixed code; database error text never returned
 *   O-05 redirect only once: flag off → no read, no redirect; first eligible sign-in → /onboarding (?next=) + cookie;
 *        then never again; completed / skipped / unknown state (RPC missing) → no redirect
 *   O-06 deterministic plan (no AI): set size by minutes; first chosen exam; first top-level syllabus section; the
 *        primary action is the exam page while exam-wise practice does not exist; no exam → /exams
 *   O-07 UX-LANG-1 (R9, #82): every onboarding label is plain English; no Hindi UI; the language step sets content language
 *   O-08 migration 091 (static): RLS on, own read + admin read, no client write policy / grant, SECURITY DEFINER RPC
 *        with search_path '' and auth.uid() only, input validation, no exam_cycles insert; read RPC SECURITY INVOKER
 *   O-09 SECDEF allow-list entry (class A, authenticated) + max raised by exactly 1; typed RPC entries present
 *   O-10 trigger wiring: email + Google sign-in and confirm (signup / email only) go through postLoginTarget after
 *        sanitizing; recovery / invite untouched
 *   O-11 design rules (static): one primary button per step (R4), progress "Step n of 4" (R5), 48 px targets (R10),
 *        no urgency / shame words (R11), no role / user_metadata read in onboarding code (#60)
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
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

// ---------- harness: TS transpile + @/ alias + mocks ----------
const ts = require('typescript');
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request.startsWith('@/')) return origResolve.call(this, path.resolve(ROOT, request.slice(2)), parent, isMain, options);
  return origResolve.call(this, request, parent, isMain, options);
};
const transpile = (m, filename) => m._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename);
require.extensions['.ts'] = transpile;
require.extensions['.tsx'] = transpile;

const jar = new Map();
const setCookies = [];
const spy = { rpc: [], logs: [] };
let rpcImpl = async () => ({ data: { success: true, code: 'SAVED' }, error: null });
let sessionUser = { id: 'u-f0' };
class RedirectSignal extends Error {
  constructor(url) {
    super(`NEXT_REDIRECT ${url}`);
    this.url = url;
  }
}
const EXAM_A = '11111111-1111-4111-8111-111111111111';
const EXAM_B = '22222222-2222-4222-8222-222222222222';
const EXAM_C = '33333333-3333-4333-8333-333333333333';
const EXAM_D = '44444444-4444-4444-8444-444444444444';
const fakeClient = () => ({
  auth: { getUser: async () => (sessionUser ? { data: { user: sessionUser }, error: null } : { data: { user: null }, error: { name: 'AuthSessionMissingError', status: 400 } }) },
  rpc: async (fn, args) => {
    spy.rpc.push({ fn, args });
    return rpcImpl(fn, args);
  },
  from: (table) => ({
    select: () => {
      const q = {
        eq: () => q,
        order: async () => ({ data: table === 'exams' ? [{ id: EXAM_A, title: 'SSC CGL', slug: 'ssc-cgl' }, { id: EXAM_B, title: 'SSC CHSL', slug: 'ssc-chsl' }, { id: EXAM_C, title: 'SSC MTS', slug: 'ssc-mts' }, { id: EXAM_D, title: 'No Cycle', slug: 'no-cycle' }] : [], error: null }),
        then: (res) => res({ data: table === 'exam_cycles' ? [{ exam_id: EXAM_A }, { exam_id: EXAM_B }, { exam_id: EXAM_C }] : [], error: null }),
      };
      return q;
    },
  }),
});
const MOCKS = {
  'server-only': {},
  'next/headers': {
    cookies: async () => ({
      get: (n) => (jar.has(n) ? { name: n, value: jar.get(n) } : undefined),
      set: (n, v, o) => (jar.set(n, v), setCookies.push({ n, v, o })),
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    }),
  },
  'next/navigation': {
    redirect: (url) => {
      throw new RedirectSignal(String(url));
    },
  },
  '@/lib/supabase/server': { createServerSupabaseClient: async () => fakeClient() },
};
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (Object.prototype.hasOwnProperty.call(MOCKS, request)) return MOCKS[request];
  return origLoad.call(this, request, parent, isMain);
};
const origError = console.error;
console.error = (...a) => spy.logs.push(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '));

const S = require(path.join(ROOT, 'lib/onboarding/schema.ts'));
const SRV = require(path.join(ROOT, 'lib/onboarding/server.ts'));
const ACT = require(path.join(ROOT, 'app/onboarding/actions.ts'));
const { ONBOARDING_COPY } = require(path.join(ROOT, 'content/onboarding.ts'));
const flag = (on) => (on ? (process.env.ONBOARDING_ENABLED = 'true') : delete process.env.ONBOARDING_ENABLED);
const run = async (fn) => {
  try {
    return { result: await fn() };
  } catch (e) {
    if (e instanceof RedirectSignal) return { redirect: e.url };
    throw e;
  }
};

(async () => {
  console.log('F0 onboarding (decision #76)');
  const TODAY = '2026-10-25';

  await test('O-01 step validation: ≤ 3 distinct pickable exams, date ≥ today (India) and ≤ 5 years, enums; all optional', () => {
    const v = (x, allowed = [EXAM_A, EXAM_B, EXAM_C, EXAM_D]) => S.validateAnswers(x, { today: TODAY, allowedExamIds: allowed });
    assert(v({}).ok, 'empty answers must be valid (every step skippable)');
    const good = v({ language: 'hinglish', examIds: [EXAM_A, EXAM_B, EXAM_A], examDate: TODAY, attempt: 'third_plus', dailyMinutes: 90 });
    assert(good.ok && good.value.examIds.length === 2, 'duplicates must collapse');
    const bad = [
      [{ examIds: [EXAM_A, EXAM_B, EXAM_C, EXAM_D] }, 'examIds'],
      [{ examIds: ['not-a-uuid'] }, 'examIds'],
      [{ examIds: 'x' }, 'examIds'],
      [{ examIds: [EXAM_D] }, 'examIds', [EXAM_A]],
      [{ examDate: '2026-10-24' }, 'examDate'],
      [{ examDate: '2031-12-31' }, 'examDate'],
      [{ examDate: '25-10-2026' }, 'examDate'],
      [{ language: 'fr' }, 'language'],
      [{ attempt: 'fourth' }, 'attempt'],
      [{ dailyMinutes: 45 }, 'dailyMinutes'],
      [{ dailyMinutes: '30' }, 'dailyMinutes'],
    ];
    for (const [input, field, allowed] of bad) {
      const r = v(input, allowed);
      assert(!r.ok && r.field === field, `${JSON.stringify(input)} → ${JSON.stringify(r)}`);
    }
    assert(S.todayInIndia(new Date('2026-10-24T19:00:00Z')) === '2026-10-25', 'India date must be used (UTC+5:30)');
    return `${bad.length} invalid inputs rejected`;
  });

  await test('O-02 wizard: Back keeps answers; 4th exam ignored; skip clears only the current step', () => {
    let s = S.initWizard();
    s = S.wizardReducer(s, { type: 'set', patch: { language: 'hi' } });
    s = S.wizardReducer(s, { type: 'next' });
    for (const id of [EXAM_A, EXAM_B, EXAM_C, EXAM_D]) s = S.wizardReducer(s, { type: 'toggleExam', examId: id });
    assert(s.answers.examIds.length === 3 && !s.answers.examIds.includes(EXAM_D), '4th exam accepted');
    s = S.wizardReducer(s, { type: 'next' });
    s = S.wizardReducer(s, { type: 'set', patch: { examDate: '2027-01-10', attempt: 'second' } });
    s = S.wizardReducer(s, { type: 'back' });
    s = S.wizardReducer(s, { type: 'back' });
    assert(s.step === 1 && s.answers.language === 'hi' && s.answers.examIds.length === 3 && s.answers.attempt === 'second', `answers lost on Back: ${JSON.stringify(s)}`);
    s = S.wizardReducer(s, { type: 'back' });
    assert(s.step === 1, 'Back below step 1');
    s = S.wizardReducer({ ...s, step: 3 }, { type: 'skipStep' });
    assert(s.step === 4 && s.answers.examDate === null && s.answers.attempt === null && s.answers.examIds.length === 3 && s.answers.language === 'hi', 'skip cleared more than its step');
    return 'answers survive Back; skip is local';
  });

  await test("O-03 skip path: flag off → disabled; RPC p_action 'skip' only → safe next (hostile → /dashboard)", async () => {
    flag(false);
    spy.rpc.length = 0;
    const off = await run(() => ACT.skipOnboardingAction('/performance'));
    assert(off.result && off.result.code === 'disabled' && spy.rpc.length === 0, JSON.stringify(off));
    flag(true);
    rpcImpl = async () => ({ data: { success: true, code: 'SKIPPED' }, error: null });
    const cases = [['/performance', '/performance'], ['https://evil.example', '/dashboard'], ['//evil.example', '/dashboard'], [undefined, '/dashboard']];
    for (const [next, want] of cases) {
      spy.rpc.length = 0;
      const r = await run(() => ACT.skipOnboardingAction(next));
      assert(r.redirect === want, `${next} → ${JSON.stringify(r)}`);
      assert(spy.rpc.length === 1 && spy.rpc[0].fn === 'fn_save_onboarding' && JSON.stringify(spy.rpc[0].args) === '{"p_action":"skip"}', JSON.stringify(spy.rpc));
    }
    return `${cases.length} next values`;
  });

  await test('O-04 save action: no RPC when off / signed out / invalid; exact RPC args; fixed codes only', async () => {
    flag(false);
    spy.rpc.length = 0;
    assert((await ACT.saveOnboardingAction({})).code === 'disabled' && spy.rpc.length === 0, 'flag off');
    flag(true);
    sessionUser = null;
    assert((await ACT.saveOnboardingAction({})).code === 'auth' && spy.rpc.length === 0, 'signed out');
    sessionUser = { id: 'u-f0' };
    const saves = () => spy.rpc.filter((c) => c.fn === 'fn_save_onboarding');
    const inv = await ACT.saveOnboardingAction({ examIds: [EXAM_D] }); // exam without a cycle → not pickable
    assert(inv.code === 'invalid' && inv.field === 'examIds' && saves().length === 0, JSON.stringify(inv));
    rpcImpl = async (fn) => (fn === 'fn_save_onboarding' ? { data: { success: true, code: 'SAVED', removed: [] }, error: null } : { data: { exam_ids: [] }, error: null });
    const ok = await ACT.saveOnboardingAction({ language: 'hi', examIds: [EXAM_B, EXAM_A], examDate: null, attempt: 'first', dailyMinutes: 30 });
    assert(ok.ok, JSON.stringify(ok));
    const args = saves()[0].args;
    assert(saves()[0].fn === 'fn_save_onboarding' && args.p_action === 'complete' && args.p_language === 'hi' && JSON.stringify(args.p_exam_ids) === JSON.stringify([EXAM_B, EXAM_A]) && args.p_exam_date === undefined && args.p_attempt === 'first' && args.p_daily_minutes === 30, JSON.stringify(args));
    assert(!('p_user_id' in args), 'the user must never be an argument');
    spy.rpc.length = 0;
    await ACT.saveOnboardingAction({});
    assert(saves()[0].args.p_exam_ids === undefined && saves()[0].args.p_remove_exam_ids === undefined, 'a skipped exam step must not touch goals');
    rpcImpl = async () => ({ data: { success: false, code: 'INVALID_INPUT', field: 'exam_date' }, error: null });
    const r1 = await ACT.saveOnboardingAction({});
    assert(r1.code === 'invalid', JSON.stringify(r1));
    rpcImpl = async () => ({ data: null, error: { code: '42883', message: 'function public.fn_save_onboarding does not exist SECRET-DETAIL' } });
    const r2 = await ACT.saveOnboardingAction({});
    assert(r2.code === 'failed' && !JSON.stringify(r2).includes('SECRET-DETAIL') && !spy.logs.join('').includes('SECRET-DETAIL'), 'database error text leaked');
    return 'args exact; fixed codes';
  });

  await test('O-05 redirect only once; flag off → no read; completed / skipped / unknown → no redirect', async () => {
    const reset = () => {
      jar.clear();
      setCookies.length = 0;
      spy.rpc.length = 0;
    };
    flag(false);
    reset();
    assert((await SRV.postLoginTarget(fakeClient(), '/dashboard')) === '/dashboard' && spy.rpc.length === 0, 'flag off must not read');
    flag(true);
    reset();
    rpcImpl = async () => ({ data: { completed_at: null, skipped_at: null, exam_ids: [] }, error: null });
    assert((await SRV.postLoginTarget(fakeClient(), '/dashboard')) === '/onboarding', 'first eligible sign-in');
    assert(setCookies.length === 1 && setCookies[0].n === SRV.ONBOARDING_PROMPTED_COOKIE && setCookies[0].o.httpOnly && setCookies[0].o.path === '/', 'prompted cookie');
    spy.rpc.length = 0;
    assert((await SRV.postLoginTarget(fakeClient(), '/dashboard')) === '/dashboard' && spy.rpc.length === 0, 'second sign-in redirected again');
    reset();
    assert((await SRV.postLoginTarget(fakeClient(), '/performance')) === '/onboarding?next=%2Fperformance', 'next must be kept');
    for (const [label, impl] of [
      ['completed', async () => ({ data: { completed_at: '2026-10-25T00:00:00Z', skipped_at: null }, error: null })],
      ['skipped', async () => ({ data: { completed_at: null, skipped_at: '2026-10-25T00:00:00Z' }, error: null })],
      ['RPC missing', async () => ({ data: null, error: { code: '42883' } })],
      ['RPC throws', async () => { throw new Error('network'); }],
    ]) {
      reset();
      rpcImpl = impl;
      assert((await SRV.postLoginTarget(fakeClient(), '/dashboard')) === '/dashboard' && setCookies.length === 0, `${label}: redirected`);
    }
    reset();
    rpcImpl = async () => ({ data: { completed_at: null, skipped_at: null }, error: null });
    assert((await SRV.postLoginTarget(fakeClient(), '/admin')) === '/admin', 'admin targets must not be intercepted');
    return 'once per device; fail-open';
  });

  await test('O-06 deterministic plan: set size by minutes, first exam + first top-level section, honest primary action', () => {
    assert([[15, 5], [30, 10], [60, 20], [90, 30], [null, 10]].every(([m, n]) => S.practiceSetSize(m) === n), 'set sizes');
    const exams = [{ id: EXAM_A, title: 'SSC CGL', slug: 'ssc-cgl', firstSection: 'Tier 1', practiceHref: null }];
    const p = S.buildPlan({ ...S.EMPTY_ANSWERS, examIds: [EXAM_A], dailyMinutes: 60 }, exams);
    assert(p.setSize === 20 && p.exam.id === EXAM_A && p.primary.kind === 'exam' && p.primary.href === '/exams/ssc-cgl', JSON.stringify(p));
    const q = S.buildPlan({ ...S.EMPTY_ANSWERS, examIds: [EXAM_A] }, [{ ...exams[0], practiceHref: '/practice/x' }]);
    assert(q.primary.kind === 'practice' && q.primary.href === '/practice/x', 'existing practice must be the primary action');
    assert(S.buildPlan(S.EMPTY_ANSWERS, exams).primary.href === '/exams', 'no exam → /exams');
    const rm = { state: 'AVAILABLE', nodes: [{ parent_id: null, order: 2, title: 'Tier 2' }, { parent_id: 'x', order: 0, title: 'Child' }, { parent_id: null, order: 1, title: 'Tier 1' }] };
    assert(S.firstSyllabusSection(rm) === 'Tier 1' && S.firstSyllabusSection({ state: 'NO_SYLLABUS', nodes: [] }) === null && S.firstSyllabusSection(null) === null, 'first section');
    const src = read('lib/onboarding/schema.ts') + read('app/onboarding/page.tsx');
    assert(!/openai|anthropic|gemini|llm|\bai\b/i.test(src.replace(/no AI/gi, '')), 'plan must not call an AI');
    return 'deterministic';
  });

  await test('O-07 UX-LANG-1 (R9, #82): every onboarding label is plain English; no Hindi UI anywhere in onboarding', () => {
    const DEV = /[ऀ-ॿ]/;
    const bad = [];
    let n = 0;
    const walk = (o, at) => {
      if (typeof o === 'string') {
        n++;
        if (!o.trim() || DEV.test(o)) bad.push(at);
        return;
      }
      if (typeof o === 'function') return walk(o(2, 4, 'X'), `${at}()`);
      if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) walk(v, `${at}.${k}`);
    };
    walk(ONBOARDING_COPY, 'copy');
    for (const step of ['language', 'exams', 'timing', 'time']) assert(ONBOARDING_COPY.steps[step], `step ${step} has no copy`);
    assert(n >= 40 && bad.length === 0, `${n} labels; not plain English: ${bad.join(', ')}`);
    for (const f of ['app/onboarding/onboarding-wizard.tsx', 'components/onboarding/onboarding-card.tsx', 'components/shell/account-links.tsx', 'app/onboarding/page.tsx', 'content/onboarding.ts']) {
      const src = read(f);
      assert(!/lang="hi"/.test(src) && !DEV.test(src), `${f}: Hindi UI`);
    }
    // the language step sets the CONTENT language, not the UI
    assert(/questions and guides/i.test(ONBOARDING_COPY.steps.language.title) && /website itself is in English/.test(ONBOARDING_COPY.steps.language.note), 'language step must say it sets the content language');
    return `${n} English labels; 0 Hindi UI`;
  });

  const mig = read('supabase/migrations/20261025000091_f0_onboarding.sql');
  const code = mig.replace(/--.*$/gm, '');
  await test('O-08 migration 091 (static): RLS, own + admin read, no client write, SECDEF RPC hardened + validating', () => {
    const must = [
      [/ALTER TABLE public\.user_onboarding ENABLE ROW LEVEL SECURITY;/, 'RLS enabled'],
      [/REVOKE ALL ON public\.user_onboarding FROM PUBLIC, anon, authenticated;/, 'client DML revoked'],
      [/GRANT SELECT ON public\.user_onboarding TO authenticated;/, 'select only'],
      [/FOR SELECT TO authenticated USING \(user_id = auth\.uid\(\)\)/, 'own-row read policy'],
      [/FOR SELECT TO authenticated USING \(public\.fn_jwt_is_admin\(\)\)/, 'admin read policy'],
      [/CREATE FUNCTION public\.fn_save_onboarding\([\s\S]*?SECURITY DEFINER\s+SET search_path TO ''/, 'SECDEF + search_path'],
      [/v_user_id uuid := auth\.uid\(\);/, 'caller = auth.uid()'],
      [/IF v_user_id IS NULL THEN\s+RETURN jsonb_build_object\('success', false, 'code', 'AUTH_REQUIRED'\);/, 'auth required'],
      [/cardinality\(v_ids\) > 3/, 'max 3 exams'],
      [/p_language NOT IN \('en', 'hi', 'hinglish'\)/, 'language enum'],
      [/p_attempt NOT IN \('first', 'second', 'third_plus'\)/, 'attempt enum'],
      [/p_daily_minutes NOT IN \(15, 30, 60, 90\)/, 'minutes enum'],
      [/p_exam_date < v_today OR p_exam_date > v_today \+ 1830/, 'date bounds'],
      [/\(now\(\) AT TIME ZONE 'Asia\/Kolkata'\)::date/, 'India date'],
      [/e\.is_active/, 'active exams only'],
      [/REVOKE ALL ON FUNCTION public\.fn_save_onboarding\(text, text, uuid\[\], date, text, integer, uuid\[\]\) FROM PUBLIC, anon, service_role;/, 'EXECUTE revoked'],
      [/GRANT EXECUTE ON FUNCTION public\.fn_save_onboarding\(text, text, uuid\[\], date, text, integer, uuid\[\]\) TO authenticated;/, 'EXECUTE authenticated'],
      // F0-a: non-destructive — the ONLY goal deactivation is the caller's own explicitly unticked active goals
      [/UPDATE public\.user_exam_goals SET is_active = false, updated_at = now\(\)\s+WHERE user_id = v_user_id AND is_active AND exam_id = ANY \(v_remove\)/, 'deactivate only explicit unticks'],
      [/v_remove && v_ids/, 'untick ∩ selected rejected'],
      [/cardinality\(v_remove\) > 10/, 'bounded untick list'],
      [/'removed', to_jsonb\(v_removed\)/, 'removed list returned'],
      [/ON CONFLICT \(user_id, exam_id, exam_cycle_id\) DO UPDATE/, 'idempotent upsert'],
      [/CREATE FUNCTION public\.fn_get_my_onboarding\(\)[\s\S]*?SECURITY INVOKER\s+SET search_path TO ''/, 'read RPC is INVOKER'],
      [/CHECK \(language_preference IN \('en', 'hi', 'hinglish'\)\)/, 'language CHECK widened'],
    ];
    const missing = must.filter(([rx]) => !rx.test(code)).map(([, label]) => label);
    assert(missing.length === 0, `missing: ${missing.join(', ')}`);
    const forbidden = [
      [/CREATE POLICY[^;]*user_onboarding[^;]*FOR (INSERT|UPDATE|DELETE|ALL)/i, 'client write policy'],
      [/INSERT INTO public\.exam_cycles/i, 'creates exam cycles'],
      [/p_user_id/i, 'user id as an argument'],
      [/app_metadata|raw_user_meta_data|role\s*=/i, 'role handling'],
      [/<>\s*ALL/i, 'deactivates every goal not selected (destructive)'],
      [/GRANT[^;]*\bTO\b[^;]*\b(anon|PUBLIC)\b[^;]*;/, 'grant to anon / PUBLIC'],
    ];
    const hits = forbidden.filter(([rx]) => rx.test(code)).map(([, l]) => l);
    assert(hits.length === 0, hits.join(', '));
    assert(fs.existsSync(path.join(ROOT, 'docs/database/rollback/091_rollback.sql')), 'rollback file missing');
    return `${must.length} required clauses, 0 forbidden`;
  });

  await test('O-09 SECDEF allow-list entry (class A, authenticated) + max raised by exactly 1; typed RPC entries', () => {
    const a = JSON.parse(read('scripts/secdef/allowlist.json'));
    const sig = 'fn_save_onboarding(p_action text, p_language text, p_exam_ids uuid[], p_exam_date date, p_attempt text, p_daily_minutes integer, p_remove_exam_ids uuid[])';
    const e = a.functions[sig];
    assert(e && e.class === 'A' && JSON.stringify(e.client) === '["authenticated"]' && e.search_path === '""', JSON.stringify(e));
    // F0 set 96 / 38 / 38; later phases may only add documented, exactly-sized raises (F2 #79: +2 client entrypoints)
    // later reviewed raises are each documented in the rules (F2 +2, PROCTOR-LOG-1 +1, ...): F0's own +1 stays exact
    const sumOf = (re) => a.rules
      .filter((r) => !/^F0 /.test(r))
      .map((r) => (r.match(re) || [])[1])
      .filter(Boolean)
      .reduce((sum, x) => sum + Number(x), 0);
    const later = sumOf(/max total \/ client_executable_callable \/ A raised by exactly (\d+)/);
    // F9-B: service-role-only functions raise total alone; a revoked client grant lowers client / A — both exact
    const serviceOnly = sumOf(/max total raised by exactly (\d+)/);
    const lowered = sumOf(/client_executable_callable and A lowered by (\d+)/);
    assert(a.max.total === 96 + later + serviceOnly && a.max.client_executable_callable === 38 + later - lowered && a.max.A === 38 + later - lowered && a.max.anon_or_public === 1, JSON.stringify(a.max));
    assert(!a.functions['fn_get_my_onboarding()'], 'the read RPC is INVOKER — it must not be in the SECDEF allow-list');
    const t = read('types/database.ts');
    assert(/fn_get_my_onboarding: \{ Args: never; Returns: Json \}/.test(t) && /fn_save_onboarding: \{\s+Args: \{\s+p_action: string[\s\S]*?p_remove_exam_ids\?: string\[\]/.test(t), 'types/database.ts entries');
    return 'allow-list 96 / 38 / 38';
  });

  await test('O-10 trigger wiring: login + Google + confirm (signup / email only) use postLoginTarget after sanitizing', () => {
    const login = read('app/auth/actions.ts');
    assert(/const target = typeof next === "string" && next !== "" \? sanitizeRedirectPath\(next\) : "\/dashboard";\s+\/\/[^\n]*\n\s+redirect\(await postLoginTarget\(supabase, target\)\);/.test(login), 'email login');
    const g = read('app/auth/google-actions.ts');
    assert(/const target = [^\n]*sanitizeRedirectPath\(next, "\/dashboard"\)[^\n]*\n\s+\/\/[^\n]*\n\s+redirect\(await postLoginTarget\(supabase, target\)\);/.test(g), 'Google sign-in');
    const c = read('app/auth/confirm/route.ts');
    assert(/if \(type === "signup" \|\| type === "email"\) \{\s+const path = await postLoginTarget\(supabase, `\$\{target\.pathname\}\$\{target\.search\}`\);/.test(c), 'confirm route');
    assert((c.match(/postLoginTarget\(/g) || []).length === 1, 'recovery / invite / code branch must not be intercepted');
    assert(/export function isOnboardingEnabled[\s\S]*env\.ONBOARDING_ENABLED === "true"/.test(read('lib/onboarding/flag.ts')), 'flag');
    return '3 entry points';
  });

  await test('O-11 design rules (static): one primary per step, progress shown, 48 px targets, no urgency / shame, no role reads', () => {
    const w = read('app/onboarding/onboarding-wizard.tsx');
    const primaries = (w.match(/<Button size="lg"(?![^>]*variant=)/g) || []).length;
    assert(primaries === 1, `primary buttons on a step: ${primaries}`);
    assert(/<ProgressBar label=\{progress\}/.test(w) && /Step \$\{n\} of \$\{total\}/.test(read('content/onboarding.ts')), 'progress');
    assert((w.match(/min-h-12/g) || []).length >= 6 && /size-12/.test(read('components/onboarding/onboarding-card.tsx')), '48 px targets');
    const copy = read('content/onboarding.ts');
    assert(!/hurry|last chance|only today|limited time|don.t miss|falling behind|lazy|failure|जल्दी करें|आखिरी मौका/i.test(copy), 'urgency / shame wording');
    const files = ['lib/onboarding/schema.ts', 'lib/onboarding/server.ts', 'lib/onboarding/flag.ts', 'app/onboarding/actions.ts', 'app/onboarding/page.tsx', 'app/onboarding/onboarding-wizard.tsx', 'components/onboarding/onboarding-card.tsx'];
    const roles = files.filter((f) => /app_metadata|user_metadata|\.role\b/.test(read(f)));
    assert(roles.length === 0, `role reads in ${roles.join(', ')}`);
    assert(!/insert|upsert/i.test(read('lib/onboarding/server.ts').replace(/insert-only/g, '')), 'server helper must not write tables');
    return 'R4 R5 R10 R11 #60';
  });

  await test('O-12 (F0-a) non-destructive goals: unshown goals untouched, explicit untick removes only that one, idempotent, other users untouched', async () => {
    // pure rules
    assert(JSON.stringify(S.shownGoals([EXAM_D, EXAM_A, EXAM_B, EXAM_C], [EXAM_A, EXAM_B, EXAM_C])) === JSON.stringify([EXAM_A, EXAM_B, EXAM_C]), 'shown = pickable active goals in priority order');
    assert(S.shownGoals([EXAM_A, EXAM_B, EXAM_C, EXAM_D], [EXAM_A, EXAM_B, EXAM_C, EXAM_D]).length === 3, 'at most 3 shown');
    assert(JSON.stringify(S.goalChanges([EXAM_A, EXAM_B], [EXAM_A, EXAM_C]).remove) === JSON.stringify([EXAM_B]), 'untick B → remove only B');
    assert(S.goalChanges([EXAM_A, EXAM_B], [EXAM_B, EXAM_A]).remove.length === 0, 'nothing unticked → nothing removed');
    assert(S.goalChanges([], [EXAM_A]).remove.length === 0, 'no existing goals → nothing removed');

    // action level: the server computes the unticks from the user's OWN goals (never from the client)
    flag(true);
    sessionUser = { id: 'u-f0' };
    const saves = () => spy.rpc.filter((c) => c.fn === 'fn_save_onboarding');
    const withGoals = (ids) => async (fn) => (fn === 'fn_save_onboarding' ? { data: { success: true, code: 'SAVED', removed: [] }, error: null } : { data: { exam_ids: ids, completed_at: null }, error: null });
    rpcImpl = withGoals([EXAM_A, EXAM_B, EXAM_D]); // D: active goal that is NOT pickable → never shown → never removed
    spy.rpc.length = 0;
    await ACT.saveOnboardingAction({ examIds: [EXAM_A] });
    assert(JSON.stringify(saves()[0].args.p_remove_exam_ids) === JSON.stringify([EXAM_B]), `untick B: ${JSON.stringify(saves()[0].args)}`);
    spy.rpc.length = 0;
    await ACT.saveOnboardingAction({ examIds: [EXAM_A, EXAM_B, EXAM_C] });
    assert(saves()[0].args.p_remove_exam_ids === undefined, 'everything kept → nothing removed');
    spy.rpc.length = 0;
    await ACT.saveOnboardingAction({ examIds: [EXAM_C], removeExamIds: [EXAM_D] }); // a client-sent removal list is ignored
    assert(JSON.stringify(saves()[0].args.p_remove_exam_ids) === JSON.stringify([EXAM_A, EXAM_B]), `client list must be ignored: ${JSON.stringify(saves()[0].args)}`);

    // reference model of the RPC's goal writes (statically tied to the SQL in O-08)
    const apply = (rows, uid, selected, remove, minutes) => {
      const out = rows.map((r) => ({ ...r }));
      for (const r of out) if (r.user_id === uid && r.is_active && remove.includes(r.exam_id)) r.is_active = false;
      selected.forEach((exam, i) => {
        const hit = out.find((r) => r.user_id === uid && r.exam_id === exam);
        if (hit) Object.assign(hit, { is_active: true, priority_rank: i + 1, daily_study_minutes: minutes ?? hit.daily_study_minutes });
        else out.push({ user_id: uid, exam_id: exam, is_active: true, priority_rank: i + 1, daily_study_minutes: minutes ?? 120 });
      });
      return out;
    };
    const start = [
      { user_id: 'me', exam_id: EXAM_A, is_active: true, priority_rank: 1, daily_study_minutes: 120 },
      { user_id: 'me', exam_id: EXAM_B, is_active: true, priority_rank: 2, daily_study_minutes: 120 },
      { user_id: 'me', exam_id: EXAM_D, is_active: true, priority_rank: 3, daily_study_minutes: 120 },
      { user_id: 'other', exam_id: EXAM_B, is_active: true, priority_rank: 1, daily_study_minutes: 60 },
    ];
    const once = apply(start, 'me', [EXAM_C, EXAM_A], [EXAM_B], 30);
    const twice = apply(once, 'me', [EXAM_C, EXAM_A], [EXAM_B], 30);
    assert(JSON.stringify(once) === JSON.stringify(twice), 'not idempotent');
    assert(once.find((r) => r.user_id === 'me' && r.exam_id === EXAM_D).is_active, 'an unshown goal was touched');
    assert(!once.find((r) => r.user_id === 'me' && r.exam_id === EXAM_B).is_active, 'the explicit untick was not applied');
    assert(JSON.stringify(once.find((r) => r.user_id === 'other')) === JSON.stringify(start[3]), "another user's row changed");
    // every goal write in the SQL is keyed on the caller
    const goalWrites = code.match(/(UPDATE public\.user_exam_goals[\s\S]*?;|INSERT INTO public\.user_exam_goals[\s\S]*?;)/g) || [];
    assert(goalWrites.length === 2 && goalWrites.every((w) => /v_user_id/.test(w)), `goal writes: ${goalWrites.length}`);
    return 'unticks only; idempotent; caller-scoped';
  });

  console.error = origError;
  console.log(`\nF0 onboarding: ${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
})();
