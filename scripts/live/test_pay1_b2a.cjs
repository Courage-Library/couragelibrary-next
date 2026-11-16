#!/usr/bin/env node
/**
 * PAY-1 B2a — live gate for migration 141 (the admin-controlled access policy). ONE transaction, always rolled back
 * (withLiveTransaction); the free QA student / anon / staff via SET LOCAL ROLE + JWT claims. Counts / booleans only.
 *   A-1 seed: the D1 defaults + PREMIUM_CA (10 rows) and an explicit FREE row for every mock that is free today
 *   A-2 switch OFF (default): everything allowed for the free student and for anon (today's behaviour)
 *   A-3 fail-closed: an unknown kind / an unknown feature / an item with no row and no default → PRO
 *   A-4 switch ON: the free student is refused PRO items (Mistake Vault, Memory Lock, analytics, PREMIUM_CA, a
 *       non-free mock) and allowed FREE ones (flashcards, any lesson / course / topic, a free mock); anon likewise
 *   A-5 the admin flips Mistake Vault PRO → FREE → the student is allowed at once; back to PRO → refused at once;
 *       each change audited (ACCESS_POLICY_SET, old → new); clearing an override falls back to the parent / default
 *   A-6 a Pro user (an active PRO_SUBSCRIPTION, inserted inside the transaction) is allowed PRO items
 *   A-7 a non-admin cannot change policy: student / staff / anon get 42501 on the set / clear / switch functions, on
 *       direct writes and on reading access_policies; anon cannot call fn_has_pro_self
 *   A-8 a mock test inherits its series' explicit tier; its own explicit row wins over the series
 *   A-9 (142) access_settings is private: student / anon get 42501; no policy on it; fn_access_allowed is SECURITY
 *       DEFINER and still answers for anon / student
 * Run: node scripts/live/test_pay1_b2a.cjs --local=54329 --pre   (local)
 *      node scripts/live/test_pay1_b2a.cjs [--pre]               (project DB)
 */
require('../db/safe-net.cjs'); // SAFE-NET
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const { Client } = require('pg');
const { pgClient } = require(path.join(ROOT, 'scripts/db/safe-net.cjs'));
const { withLiveTransaction } = require(path.join(ROOT, 'scripts/db/live-safety.cjs'));

const PRE = process.argv.includes('--pre');
const LOCAL = (process.argv.find((a) => a.startsWith('--local=')) || '').slice('--local='.length);
const SQL = fs.readFileSync(path.join(ROOT, 'supabase/migrations/20261116000141_pay1_b2a_access_policy.sql'), 'utf8');
const SQL142 = fs.readFileSync(path.join(ROOT, 'supabase/migrations/20261116000142_pay1_b2a_access_settings_private.sql'), 'utf8');
const ACTOR = 'pay1-b2a@courage-library.test';
const RANDOM_UUID = '00000000-0000-4000-8000-00000000b2a1';

let ok = true;
const chk = (n, cond, info) => {
  if (!cond) ok = false;
  console.log(`${cond ? 'PASS' : 'FAIL'} ${n}${cond ? '' : ' — ' + String(info ?? '').slice(0, 600)}`);
};
function client() {
  if (!LOCAL) return pgClient();
  if (!/^\d{4,5}$/.test(LOCAL)) throw new Error('--local=<port>');
  const c = new Client({ host: '127.0.0.1', port: Number(LOCAL), user: 'postgres', database: 'postgres' });
  c.on('error', () => {});
  return c;
}

(async () => {
  const c = client();
  await c.connect();
  const q = async (s, p) => (await c.query(s, p)).rows;
  const one = async (s, p) => (await q(s, p))[0];
  const errCode = async (s, p) => {
    await c.query('SAVEPOINT t');
    try {
      await c.query(s, p);
      await c.query('RELEASE SAVEPOINT t');
      return null;
    } catch (e) {
      await c.query('ROLLBACK TO SAVEPOINT t');
      return e.code || 'ERR';
    }
  };
  /** run fn as a role with JWT claims (sub = null for anon) */
  const as = async (role, sub, fn) => {
    await c.query(`SET LOCAL ROLE ${role}`);
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(sub ? { sub, role } : { role })]);
    try {
      return await fn();
    } finally {
      await c.query('RESET ROLE');
      await c.query(`select set_config('request.jwt.claims', '', true)`);
    }
  };
  const allowed = (role, sub, kind, key) => as(role, sub, async () => (await one(`select public.fn_access_allowed($1, $2) a`, [kind, key])).a);
  try {
    await withLiveTransaction(c, async () => {
      // --pre: 141 only if it is not there yet (re-running it would re-grant the client read 142 removes), then 142
      if (PRE) {
        if (!(await one(`select to_regclass('public.access_policies') is not null e`)).e) await c.query(SQL);
        await c.query(SQL142);
      }
      const ids = {};
      for (const [k, e] of [['student', 'qa-student@courage-library.test'], ['staff', 'qa-staff@courage-library.test']]) {
        let r = await one(`select id from auth.users where email = $1`, [e]);
        // LOCAL copy only: no user rows are restored (personal data stays out) — a synthetic stand-in, rolled back
        if (!r && LOCAL) r = await one(`insert into auth.users (id, email, aud, role) values (gen_random_uuid(), $1, 'authenticated', 'authenticated') returning id`, [e]);
        ids[k] = r && r.id;
      }
      if (!ids.student) throw new Error('qa-student missing');
      const freeMock = await one(`select id::text id from public.mock_tests where is_free = true order by created_at limit 1`);
      const proMockKey = RANDOM_UUID; // no row → MOCK_TEST default

      // A-1 — the seed as it stands: 141's D1 defaults; once 147 is applied (owner decision 9, 2026-11-15) MISTAKE_VAULT is
      // FREE (viewing) and MISTAKE_DRILLS PRO is added
      const b3 = (await one(`select to_regprocedure('public.fn_access_allowed_many(text, text[])') is not null b3`)).b3;
      const vault = b3 ? `('FEATURE','MISTAKE_VAULT','FREE'),('FEATURE','MISTAKE_DRILLS','PRO')` : `('FEATURE','MISTAKE_VAULT','PRO')`;
      const want = b3 ? 11 : 10;
      const seed = await one(`select count(*) filter (where (item_kind, item_key, tier) in (
            ('FEATURE','ADVANCED_ANALYTICS','PRO'),${vault},('FEATURE','MEMORY_LOCK','PRO'),('FEATURE','PREMIUM_CA','PRO'),
            ('FEATURE','FLASHCARDS','FREE'),('MOCK_TEST','*','PRO'),('MOCK_SERIES','*','PRO'),('LESSON','*','FREE'),('COURSE','*','FREE'),('TOPIC','*','FREE')))::int defaults,
          (select count(*) from public.mock_tests where is_free)::int free_mocks,
          count(*) filter (where item_kind = 'MOCK_TEST' and item_key <> '*' and tier = 'FREE' and item_key in (select id::text from public.mock_tests where is_free))::int free_rows,
          (select paywall_enabled from public.access_settings where id) switch_on
        from public.access_policies`);
      chk(`A-1 seed: ${want} defaults (D1${b3 ? ' + B3 decision 9' : ''}) + an explicit FREE row per free mock; switch off`, seed.defaults === want && seed.free_rows === seed.free_mocks && seed.switch_on === false, JSON.stringify(seed));

      // A-2 switch off
      const off = [];
      for (const [kind, key] of [['FEATURE', 'ADVANCED_ANALYTICS'], ['FEATURE', 'NO_SUCH_FEATURE'], ['MOCK_TEST', proMockKey]]) {
        off.push(await allowed('authenticated', ids.student, kind, key), await allowed('anon', null, kind, key));
      }
      chk('A-2 switch OFF → everything allowed (student + anon)', off.every((x) => x === true), JSON.stringify(off));

      // A-3 fail-closed tiers
      const t = await one(`select public.fn_access_tier('BOGUS','x') a, public.fn_access_tier('FEATURE','NO_SUCH_FEATURE') b, public.fn_access_tier(null,'x') c, public.fn_access_tier('MOCK_TEST', $1) d`, [proMockKey]);
      chk('A-3 unknown kind / unknown feature / null / item without row → PRO', Object.values(t).every((v) => v === 'PRO'), JSON.stringify(t));

      // switch ON (service role path = owner here, audited)
      await q(`select public.fn_paywall_set(true, null, $1)`, [ACTOR]);
      // A-4
      const pro = [['FEATURE', 'MEMORY_LOCK'], ['FEATURE', 'ADVANCED_ANALYTICS'], ['FEATURE', 'PREMIUM_CA'], ['MOCK_TEST', proMockKey]];
      const free = [['FEATURE', 'FLASHCARDS'], ['LESSON', RANDOM_UUID], ['COURSE', RANDOM_UUID], ['TOPIC', RANDOM_UUID], ...(freeMock ? [['MOCK_TEST', freeMock.id]] : [])];
      const res = { proStudent: [], freeStudent: [], proAnon: [], freeAnon: [] };
      for (const [k, v] of pro) res.proStudent.push(await allowed('authenticated', ids.student, k, v)), res.proAnon.push(await allowed('anon', null, k, v));
      for (const [k, v] of free) res.freeStudent.push(await allowed('authenticated', ids.student, k, v)), res.freeAnon.push(await allowed('anon', null, k, v));
      chk('A-4 switch ON: free student + anon refused every PRO item, allowed every FREE item',
        [...res.proStudent, ...res.proAnon].every((x) => x === false) && [...res.freeStudent, ...res.freeAnon].every((x) => x === true), JSON.stringify(res));

      // A-5 admin flips
      const audits = async () => (await one(`select count(*)::int n from public.admin_audit_logs where actor_email = $1 and action_type in ('ACCESS_POLICY_SET','ACCESS_POLICY_CLEAR','PAYWALL_SET')`, [ACTOR])).n;
      const a0 = await audits();
      const r1 = await one(`select public.fn_access_policy_set('FEATURE','ADVANCED_ANALYTICS','FREE', null, $1) r`, [ACTOR]);
      const afterFree = await allowed('authenticated', ids.student, 'FEATURE', 'ADVANCED_ANALYTICS');
      const r2 = await one(`select public.fn_access_policy_set('FEATURE','ADVANCED_ANALYTICS','PRO', null, $1) r`, [ACTOR]);
      const afterPro = await allowed('authenticated', ids.student, 'FEATURE', 'ADVANCED_ANALYTICS');
      // rows written in one transaction share created_at, so check the two transitions directly (not "the latest")
      const trans = await one(`select count(*) filter (where old_value->>'tier' = 'PRO' and new_value->>'tier' = 'FREE')::int pro_free,
          count(*) filter (where old_value->>'tier' = 'FREE' and new_value->>'tier' = 'PRO')::int free_pro,
          bool_and(target_id = 'FEATURE:ADVANCED_ANALYTICS') target_ok
        from public.admin_audit_logs where actor_email = $1 and action_type = 'ACCESS_POLICY_SET' and target_id = 'FEATURE:ADVANCED_ANALYTICS'`, [ACTOR]);
      const last = { old_value: { tier: trans.free_pro === 1 ? 'FREE' : '?' }, new_value: { tier: trans.pro_free === 1 ? 'PRO' : '?' }, target_id: trans.target_ok ? 'FEATURE:ADVANCED_ANALYTICS' : '?' };
      // clear: a free mock's explicit FREE row removed → falls back to the MOCK_TEST default (PRO) → refused
      let clearOk = true;
      if (freeMock) {
        await q(`select public.fn_access_policy_clear('MOCK_TEST', $1, null, $2)`, [freeMock.id, ACTOR]);
        clearOk = (await allowed('authenticated', ids.student, 'MOCK_TEST', freeMock.id)) === false;
      }
      const a1 = await audits();
      chk('A-5 admin flip PRO→FREE→PRO takes effect immediately; audited old → new; clear falls back to the default',
        afterFree === true && afterPro === false && r1.r.old_tier === 'PRO' && r2.r.old_tier === 'FREE' && last.old_value.tier === 'FREE' && last.new_value.tier === 'PRO' && last.target_id === 'FEATURE:ADVANCED_ANALYTICS' && clearOk && a1 - a0 === (freeMock ? 3 : 2),
        JSON.stringify({ afterFree, afterPro, r1: r1.r, r2: r2.r, last, clearOk, audits: a1 - a0 }));

      // A-6 a Pro user
      const entErr = await errCode(`insert into public.user_entitlements (user_id, entitlement_type, starts_at, expires_at, is_active, source)
               values ($1, 'PRO_SUBSCRIPTION', now() - interval '1 day', now() + interval '30 days', true, 'PROMO')`, [ids.student]);
      if (entErr) throw new Error(`A-6 setup: entitlement insert failed (${entErr})`);
      const proUser = [];
      for (const [k, v] of pro) proUser.push(await allowed('authenticated', ids.student, k, v));
      chk('A-6 a Pro user (active PRO_SUBSCRIPTION, rolled back) is allowed every PRO item', proUser.every((x) => x === true), JSON.stringify(proUser));

      // A-7 non-admins
      const denials = [];
      for (const [role, sub] of [['authenticated', ids.student], ...(ids.staff ? [['authenticated', ids.staff]] : []), ['anon', null]]) {
        for (const s of [`select public.fn_access_policy_set('FEATURE','MISTAKE_VAULT','FREE', null, 'x@y.z')`, `select public.fn_access_policy_clear('FEATURE','MISTAKE_VAULT', null, 'x@y.z')`,
          `select public.fn_paywall_set(false, null, 'x@y.z')`, `insert into public.access_policies (item_kind, item_key, tier) values ('FEATURE','X','FREE')`,
          `update public.access_settings set paywall_enabled = false`, `select * from public.access_policies`]) {
          const code = await as(role, sub, () => errCode(s));
          if (code !== '42501') denials.push(`${role}${sub === ids.staff ? '(staff)' : ''}: ${s.slice(0, 48)} → ${code || 'ALLOWED'}`);
        }
      }
      const anonSelf = await as('anon', null, () => errCode(`select public.fn_has_pro_self()`));
      chk('A-7 student / staff / anon cannot change or read the policy (42501); anon cannot call fn_has_pro_self', denials.length === 0 && anonSelf === '42501', `${denials.join(' | ')} | anonSelf ${anonSelf}`);

      // A-8 series inheritance (a temporary series, rolled back)
      const mock = await one(`select id from public.mock_tests order by created_at limit 1`);
      let inh = 'no mock';
      if (mock) {
        await c.query('SAVEPOINT ts');
        let s = null;
        try {
          s = await one(`insert into public.test_series (exam_id, title, series_type, is_active) values ((select id from public.exams order by created_at limit 1), 'B2a gate series', 'FULL_LENGTH', true) returning id`);
          await c.query('RELEASE SAVEPOINT ts');
        } catch {
          await c.query('ROLLBACK TO SAVEPOINT ts');
        }
        if (s) {
          await q(`update public.mock_tests set series_id = $1 where id = $2`, [s.id, mock.id]);
          await q(`select public.fn_access_policy_clear('MOCK_TEST', $1, null, $2)`, [mock.id, ACTOR]);
          await q(`select public.fn_access_policy_set('MOCK_SERIES', $1, 'FREE', null, $2)`, [s.id, ACTOR]);
          const viaSeries = await one(`select public.fn_access_tier('MOCK_TEST', $1) t`, [mock.id]);
          await q(`select public.fn_access_policy_set('MOCK_TEST', $1, 'PRO', null, $2)`, [mock.id, ACTOR]);
          const own = await one(`select public.fn_access_tier('MOCK_TEST', $1) t`, [mock.id]);
          inh = viaSeries.t === 'FREE' && own.t === 'PRO' ? 'ok' : JSON.stringify({ viaSeries: viaSeries.t, own: own.t });
        } else inh = 'could not create a test series (schema differs)';
      }
      if (inh === 'no mock' && LOCAL) console.log('SKIP A-8 a mock inherits its series tier — this local copy has no mock_tests rows (runs on the project database)');
      else chk('A-8 a mock inherits its series tier; its own row wins', inh === 'ok', inh);

      // A-9 (142)
      const readS = await as('authenticated', ids.student, () => errCode(`select paywall_enabled from public.access_settings`));
      const readA = await as('anon', null, () => errCode(`select paywall_enabled from public.access_settings`));
      const meta = await one(`select (select prosecdef from pg_proc where oid = 'public.fn_access_allowed(text,text)'::regprocedure) secdef,
          (select count(*) from pg_policies where schemaname = 'public' and tablename = 'access_settings')::int policies`);
      const stillWorks = (await allowed('anon', null, 'FEATURE', 'FLASHCARDS')) === true && (await allowed('authenticated', ids.student, 'FEATURE', 'FLASHCARDS')) === true;
      chk('A-9 access_settings private (42501 for student / anon, no policy); fn_access_allowed DEFINER and still answers', readS === '42501' && readA === '42501' && meta.secdef === true && meta.policies === 0 && stillWorks,
        JSON.stringify({ readS, readA, meta, stillWorks }));
    });
  } catch (e) {
    ok = false;
    console.log(`FAIL — ${String(e && e.message ? e.message : e).slice(0, 300)}`);
  } finally {
    await c.end().catch(() => {});
  }
  console.log(`PAY-1 B2a live${LOCAL ? ' [LOCAL]' : ''}: ${ok ? 'ALL PASS' : 'FAILURES'}`);
  process.exitCode = ok ? 0 : 1;
})();
