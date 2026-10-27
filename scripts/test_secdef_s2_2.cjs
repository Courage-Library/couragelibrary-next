#!/usr/bin/env node
/**
 * SECDEF-S2-2 gate (migration 090): unused client EXECUTE revoked on 33 SECURITY DEFINER functions.
 *   S-0  minimum coverage: 33 targets (14 C-class, 12 no-caller service, 7 trigger), 25 callable, 7 trigger tables
 *   S-1  catalogue: no anon / authenticated / PUBLIC EXECUTE on any target; ACL is exactly owner + service_role
 *   S-2  PostgREST as anon: every callable target → 401 / 42501 (named args; a 404 PGRST202 passes only for a function
 *        S-2b proved denied, and is named in the output)
 *   S-3  PostgREST as authenticated (qa-student): every callable target → 403 / 42501
 *   S-2b SQL probes as anon / authenticated (rolled back) → 42501. SAFETY: S-2 / S-3 run only when S-1 shows no client
 *        EXECUTE — a PostgREST call is committed, so probing an unrevoked function would execute its body
 *   S-4  service_role still allowed: every callable target executes as service_role (rolled back — no side effects)
 *   S-5  triggers still fire without any EXECUTE grant: per trigger table one rolled-back DML with EXECUTE revoked even
 *        from the owner (postgres is not a superuser) hits that trigger's own exception
 *   S-6  allow-list matches: scripts/secdef/allowlist.json records client [] for all 33
 * DB access: verified TLS, transactions always rolled back. PostgREST: anon key / qa-student session. Prints names only.
 */
const { safeBegin } = require('./db/live-safety.cjs'); // LIVE-LOCK-SWEEP: the one safe BEGIN (timeouts + rollback on stop)
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const { dbTarget, readEnv } = require('./db/_db-env.cjs');
if (typeof globalThis.WebSocket === 'undefined') globalThis.WebSocket = class DummyWebSocket {};
const { createClient } = require('@supabase/supabase-js');

const ROOT = path.resolve(__dirname, '..');
const allow = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/secdef/allowlist.json'), 'utf8'));
const MIGRATION = '20261020000090_secdef_s2_2_revoke_unused_client_execute.sql';
// the 33 SECDEF-S2-2 targets (SECDEF-AUDIT Stage 1 rulings), by name
const C_CLASS = ['fn_clear_user_search_history', 'fn_complete_diagnostic_assessment', 'fn_create_custom_flashcard_deck', 'fn_edit_discussion_message',
  'fn_generate_custom_practice_session', 'fn_generate_daily_recommendations', 'fn_get_due_flashcards', 'fn_mark_notification_as_read',
  'fn_moderate_flagged_content', 'fn_override_mistake_cognitive_type', 'fn_reconcile_search_indexes', 'fn_start_custom_practice_session',
  'fn_update_daily_recommendation_status', 'fn_verify_faculty_answer'];
const NO_CALLER = ['fn_claim_reward_item', 'fn_log_user_search', 'fn_process_payment_webhook', 'fn_publish_exam_announcement', 'fn_record_mistake_occurrence',
  'fn_resolve_errata_report', 'fn_reverse_reward_claim', 'fn_revoke_mistakes_by_errata', 'fn_universal_search', 'fn_update_spaced_repetition_review',
  'fn_verify_and_fulfill_payment', 'rls_auto_enable'];
const TRIGGERS = ['fn_enforce_errata_state_machine', 'fn_enforce_practice_session_lifecycle', 'fn_protect_user_notification_fields', 'fn_sanitize_attempt_answer',
  'fn_validate_bookmark_folder_ownership', 'fn_validate_exam_announcement_cycle', 'fn_validate_payment_order_transition'];
const ALL = [...C_CLASS, ...NO_CALLER, ...TRIGGERS];
const QA_STUDENT = 'qa-student@courage-library.test';

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try {
    const info = await fn();
    passed++;
    console.log(`  PASS  ${name}${info ? ' — ' + info : ''}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL  ${name}\n        ${String(e && e.message ? e.message : e).slice(0, 2500)}`);
  }
}
const assert = (c, m) => {
  if (!c) throw new Error(m || 'assertion failed');
};

(async () => {
  console.log('SECDEF-S2-2 (090): unused client EXECUTE revoked');
  const env = readEnv();
  const c = new Client({ ...dbTarget().pg, statement_timeout: 60000 });
  c.on('error', () => {});
  await c.connect();
  const q = async (s, p) => (await c.query(s, p)).rows;
  let fns;
  let studentId;
  try {
    await safeBegin(c, { readOnly: true });
    fns = await q(`SELECT p.oid, p.proname, p.oid::regprocedure::text rp, p.prorettype = 'trigger'::regtype trg, p.prorettype = 'event_trigger'::regtype evt,
        coalesce(p.proargnames, '{}') argnames, (SELECT array_agg(format_type(t, NULL) ORDER BY o) FROM unnest(p.proargtypes::oid[]) WITH ORDINALITY u(t, o)) argtypes,
        has_function_privilege('anon', p.oid, 'EXECUTE') anon, has_function_privilege('authenticated', p.oid, 'EXECUTE') auth,
        has_function_privilege('service_role', p.oid, 'EXECUTE') svc,
        EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a WHERE a.grantee = 0) pub,
        (SELECT array_agg(pg_get_userbyid(a.grantee)::text ORDER BY 1) FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a WHERE a.grantee <> 0 AND a.privilege_type = 'EXECUTE') holders
      FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef AND p.proname = ANY($1)`, [ALL]);
    studentId = (await q(`SELECT id FROM auth.users WHERE email = $1`, [QA_STUDENT]))[0]?.id;
    const ledger = await q(`SELECT status FROM public.schema_migration_ledger WHERE filename = $1`, [MIGRATION]).catch(() => []);
    console.log(`  info: ledger ${MIGRATION}: ${ledger.map((r) => r.status).join(',') || 'not recorded'}`);
    await c.query('ROLLBACK');
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  }
  const callable = fns.filter((f) => !f.trg && !f.evt);

  await test('S-0 minimum coverage: 33 targets live (14 C, 12 no-caller, 7 trigger), 25 callable', async () => {
    const names = new Set(fns.map((f) => f.proname));
    const missing = ALL.filter((n) => !names.has(n));
    assert(missing.length === 0 && fns.length === 33, `live ${fns.length}; missing ${missing.join(', ')}`);
    assert(callable.length === 25 && fns.filter((f) => f.trg).length === 7, `callable ${callable.length}, trigger ${fns.filter((f) => f.trg).length}`);
    assert(studentId, 'qa-student missing');
    return `${fns.length} targets, ${callable.length} callable, 7 trigger, 1 event-trigger`;
  });

  await test('S-1 catalogue: no anon / authenticated / PUBLIC EXECUTE; ACL is exactly owner + service_role', async () => {
    const bad = fns.filter((f) => f.anon || f.auth || f.pub || !f.svc || JSON.stringify(f.holders) !== JSON.stringify(['postgres', 'service_role']))
      .map((f) => `${f.proname}: ${JSON.stringify({ anon: f.anon, auth: f.auth, pub: f.pub, svc: f.svc, holders: f.holders })}`);
    assert(bad.length === 0, bad.join('\n        '));
    return `${fns.length}/33 owner + service_role only`;
  });

  // PostgREST probes with named args (all NULL); only 42501 counts as denied
  const URL_ = env('NEXT_PUBLIC_SUPABASE_URL');
  const ANON = env('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY') || env('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  const rpc = async (f, token) => {
    const body = {};
    f.argnames.forEach((n) => (body[n] = null));
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await fetch(`${URL_}/rest/v1/rpc/${f.proname}`, {
          method: 'POST',
          headers: { apikey: ANON, authorization: `Bearer ${token || ANON}`, 'content-type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(20000),
        });
        const j = await res.json().catch(() => ({}));
        return { status: res.status, code: j.code || null };
      } catch (e) {
        if (attempt === 3) return { status: 0, code: `NETWORK:${e.name}` };
      }
    }
  };
  // SAFETY: a PostgREST call is a real, committed call. Probe only when the catalogue shows NO client EXECUTE on any
  // target; otherwise the probe would execute function bodies against live data (it did once, before 090 — report §1.5).
  const catalogueClean = fns.every((f) => !f.anon && !f.auth && !f.pub);
  const sqlDenied = new Set(); // filled by S-2b
  // DB-side checks run in one transaction that is always rolled back
  const rw = async (fn) => {
    await safeBegin(c);
    try {
      return await fn();
    } finally {
      await c.query('ROLLBACK').catch(() => {});
    }
  };
  await test('S-2b SQL probes (rolled back): every callable target as anon and as authenticated (qa-student) → 42501', () => rw(async () => {
    const bad = [];
    for (const f of callable) {
      let both = true;
      for (const role of ['anon', 'authenticated']) {
        await c.query('SAVEPOINT s');
        await c.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify(role === 'anon' ? { role: 'anon' } : { sub: studentId, role: 'authenticated' })]);
        await c.query(`SET LOCAL ROLE ${role}`);
        let code = 'ALLOWED';
        try {
          await c.query(`SELECT public.${f.proname}(${(f.argtypes || []).map((t) => `NULL::${t}`).join(', ')})`);
        } catch (e) {
          code = e.code || 'ERR';
        }
        await c.query('ROLLBACK TO SAVEPOINT s');
        if (code !== '42501') {
          both = false;
          bad.push(`${role} ${f.proname}: ${code}`);
        }
      }
      if (both) sqlDenied.add(f.proname);
    }
    assert(bad.length === 0, bad.join('; '));
    return `${callable.length}/25 × anon / authenticated → 42501`;
  }));
  // a PostgREST 404 (function not resolved) is accepted ONLY for a function S-2b proved denied, and is named
  const judge = (res) => {
    const bad = [];
    const unresolved = [];
    for (const { f, r } of res) {
      if (r.code === '42501' && (r.status === 401 || r.status === 403)) continue;
      if (r.status === 404 && r.code === 'PGRST202' && sqlDenied.has(f.proname)) unresolved.push(f.proname);
      else bad.push(`${f.proname}: ${r.status} ${r.code}`);
    }
    return { bad, unresolved };
  };
  await test('S-2 PostgREST as anon: every callable target → 401 / 42501', async () => {
    assert(catalogueClean, 'not probed: the catalogue still grants client EXECUTE (a PostgREST probe would execute function bodies)');
    const res = await Promise.all(callable.map(async (f) => ({ f, r: await rpc(f, null) })));
    const { bad, unresolved } = judge(res);
    assert(bad.length === 0, bad.join('; '));
    return `${res.length - unresolved.length}/25 denied (42501)${unresolved.length ? `; not resolved by PostgREST (404, denied at SQL level in S-2b): ${unresolved.join(', ')}` : ''}`;
  });
  await test('S-3 PostgREST as authenticated (qa-student): every callable target → 403 / 42501', async () => {
    assert(catalogueClean, 'not probed: the catalogue still grants client EXECUTE (a PostgREST probe would execute function bodies)');
    // CI-FIX-1 (#74): CAPTCHA-safe QA session (scripts/live/qa-session.cjs)
    const sb = await require('./live/qa-session.cjs').qaUserClient(QA_STUDENT);
    const { data, error } = await sb.auth.getSession();
    assert(!error && data.session, `qa-student session failed (${error && (error.code || error.status)})`);
    const res = await Promise.all(callable.map(async (f) => ({ f, r: await rpc(f, data.session.access_token) })));
    // no sign-out: the QA session may be the live job's SHARED cached session (any scope revokes it on the server)
    const { bad, unresolved } = judge(res);
    assert(bad.length === 0, bad.join('; '));
    return `${res.length - unresolved.length}/25 denied (42501)${unresolved.length ? `; not resolved by PostgREST (404, denied at SQL level in S-2b): ${unresolved.join(', ')}` : ''}`;
  });

  await test('S-4 service_role still allowed: every callable target executes as service_role (rolled back)', () => rw(async () => {
    const denied = [];
    for (const f of callable) {
      await c.query('SAVEPOINT s');
      await c.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ role: 'service_role' })]);
      await c.query('SET LOCAL ROLE service_role');
      let code = 'OK';
      try {
        await c.query(`SELECT public.${f.proname}(${(f.argtypes || []).map((t) => `NULL::${t}`).join(', ')})`);
      } catch (e) {
        code = e.code || 'ERR';
      }
      await c.query('ROLLBACK TO SAVEPOINT s');
      if (code === '42501') denied.push(f.proname);
    }
    assert(denied.length === 0, `service_role denied: ${denied.join(', ')}`);
    return `${callable.length}/25 reachable by service_role (permission check passed; bodies rolled back)`;
  }));

  await test('S-5 triggers still fire with NO EXECUTE grant at all (owner revoked in-txn; one rolled-back DML per table)', () => rw(async () => {
    const su = (await q(`SELECT rolsuper FROM pg_roles WHERE rolname = current_user`))[0].rolsuper;
    assert(su === false, 'connection role is a superuser — EXECUTE would not be checked, the proof would be void');
    const student = studentId;
    const plan = (await q(`SELECT id FROM public.subscription_plans LIMIT 1`))[0]?.id || null;
    const qv = (await q(`SELECT id, question_id FROM public.question_versions LIMIT 1`))[0];
    const CASES = [
      { fn: 'fn_enforce_errata_state_machine', table: 'question_errata_reports', expect: /Terminal state violation/,
        setup: [`INSERT INTO public.question_errata_reports (reporter_user_id, question_id, question_version_id, issue_type, description, status) VALUES ($1, $2, $3, 'TYPO', 'secdef-s2-2 trigger probe', 'REJECTED') RETURNING id`, [student, qv.question_id, qv.id]],
        dml: (id) => [`UPDATE public.question_errata_reports SET status = 'OPEN' WHERE id = $1`, [id]] },
      { fn: 'fn_enforce_practice_session_lifecycle', table: 'custom_practice_sessions', expect: /Terminal state violation/,
        setup: [`INSERT INTO public.custom_practice_sessions (user_id, title, session_mode, total_questions, question_version_ids_json, status) VALUES ($1, 'secdef-s2-2 probe', 'PYQ', 1, '[]'::jsonb, 'SUBMITTED') RETURNING id`, [student]],
        dml: (id) => [`UPDATE public.custom_practice_sessions SET status = 'ACTIVE' WHERE id = $1`, [id]] },
      { fn: 'fn_protect_user_notification_fields', table: 'user_notifications', expect: /Tampering violation/,
        setup: [`INSERT INTO public.user_notifications (user_id, category, title, body) VALUES ($1, 'SYSTEM', 'secdef-s2-2 probe', 'probe') RETURNING id`, [student]],
        dml: (id) => [`UPDATE public.user_notifications SET title = 'tampered' WHERE id = $1`, [id]] },
      { fn: 'fn_sanitize_attempt_answer', table: 'attempt_answers', expect: /Invalid mock_question_id/,
        dml: () => [`INSERT INTO public.attempt_answers (attempt_id, mock_question_id, question_version_id) VALUES (gen_random_uuid(), gen_random_uuid(), gen_random_uuid())`, []] },
      { fn: 'fn_validate_bookmark_folder_ownership', table: 'user_question_bookmarks', expect: /Ownership violation/,
        dml: () => [`INSERT INTO public.user_question_bookmarks (user_id, question_id, question_version_id, folder_id) VALUES ($1, $2, $3, gen_random_uuid())`, [student, qv.question_id, qv.id]] },
      { fn: 'fn_validate_exam_announcement_cycle', table: 'exam_announcements', expect: /Integrity violation/,
        dml: () => [`INSERT INTO public.exam_announcements (exam_id, announcement_type, title, summary, exam_cycle_id) VALUES (gen_random_uuid(), 'ADMIT_CARD_RELEASED', 'secdef-s2-2 probe', 'probe', gen_random_uuid())`, []] },
      { fn: 'fn_validate_payment_order_transition', table: 'payment_orders', expect: /Illegal state transition/,
        setup: [`INSERT INTO public.payment_orders (user_id, order_type, plan_id, base_amount, taxable_amount, total_payable_amount, status) VALUES ($1, 'SUBSCRIPTION_PURCHASE', $2, 0, 0, 0, 'PAID') RETURNING id`, [student, plan]],
        dml: (id) => [`UPDATE public.payment_orders SET status = 'CREATED' WHERE id = $1`, [id]] },
    ];
    assert(qv && plan, `fixtures for the probes missing (question_versions ${!!qv}, subscription_plans ${!!plan})`);
    const out = [];
    for (const k of CASES) {
      await c.query('SAVEPOINT t');
      let result;
      try {
        const id = k.setup ? (await q(k.setup[0], k.setup[1]))[0].id : null;
        // the trigger is attached and enabled on the real table
        const attached = (await q(`SELECT count(*)::int n FROM pg_trigger tg JOIN pg_proc p ON p.oid = tg.tgfoid WHERE tg.tgrelid = ('public.' || $1)::regclass AND p.proname = $2 AND tg.tgenabled = 'O'`, [k.table, k.fn]))[0].n;
        if (attached !== 1) throw new Error(`trigger not attached / enabled (${attached})`);
        await c.query(`REVOKE EXECUTE ON FUNCTION public.${k.fn}() FROM PUBLIC, anon, authenticated, service_role, postgres`);
        const holders = (await q(`SELECT has_function_privilege(current_user, $1::regprocedure, 'EXECUTE') me, has_function_privilege('service_role', $1::regprocedure, 'EXECUTE') svc`, [`public.${k.fn}()`]))[0];
        if (holders.me || holders.svc) throw new Error('EXECUTE still held after the in-txn revoke');
        const [sql, params] = k.dml(id);
        await c.query(sql, params);
        result = 'NOT FIRED (DML succeeded)';
      } catch (e) {
        result = k.expect.test(e.message) ? 'FIRED' : `ERR ${e.code} ${String(e.message).slice(0, 90)}`;
      }
      await c.query('ROLLBACK TO SAVEPOINT t');
      out.push(`${k.table}: ${result}`);
    }
    const bad = out.filter((s) => !s.endsWith('FIRED') || s.includes('NOT FIRED'));
    assert(bad.length === 0, bad.join('; '));
    return `7/7 tables: trigger fired with no EXECUTE grant held by anyone (rolled back)`;
  }));

  await test('S-6 allow-list records the new state (client [] for all 33)', async () => {
    const bad = ALL.filter((n) => {
      const e = Object.entries(allow.functions).find(([sig]) => sig.replace(/\(.*/, '') === n);
      return !e || (e[1].client || []).length !== 0;
    });
    assert(bad.length === 0, `allow-list still lists client EXECUTE for: ${bad.join(', ')}`);
    return '33/33';
  });

  await c.end().catch(() => {});
  console.log(`\nSECDEF-S2-2: ${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(`SECDEF-S2-2 SUITE ERROR ${e && (e.code || e.message)}`);
  process.exit(2);
});
