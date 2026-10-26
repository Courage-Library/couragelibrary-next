#!/usr/bin/env node
/**
 * VAULT-HEALTH (SILENT-FAIL-1, architect 2026-10-26) — READ ONLY. Every wrong answer of the last N submitted attempts
 * (since migration 110 restored mistake recording, 2026-10-26 05:26 UTC) must have a user_mistake_vault row for that
 * user + question. Catches a silently failing mistake-recording path (the 095 regression went unnoticed for ~15 h).
 *   VH-1 recent submitted attempts with wrong answers: every wrong answer has its vault row (counts only — no ids / PII)
 *   VH-2 the recording path is reachable: service_role holds EXECUTE on the Memory Lock trigger helpers (110)
 *   VH-3 COINS-FREEZE: no REWARDED gamification event and no coin_ledger CREDIT since 112 (the nightly completes a mock)
 * LIVE-LOCK-SAFETY: one READ ONLY transaction with lock / statement / idle timeouts (scripts/db/live-safety.cjs).
 * Run: node scripts/live/test_vault_health.cjs [--n=25]
 */
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const { Client } = require('pg');
const { dbTarget } = require(path.join(ROOT, 'scripts/db/_db-env.cjs'));
const { withLiveTransaction } = require(path.join(ROOT, 'scripts/db/live-safety.cjs'));

const N = Math.max(1, Math.min(200, Number((process.argv.find((a) => a.startsWith('--n=')) || '--n=25').slice(4)) || 25));
const SINCE = '2026-10-26T05:26:00Z'; // 110 applied — earlier attempts are the known 095 window (QA only)
const COINS_FROZEN_AT = '2026-10-26T06:29:00Z'; // 112 applied
let passed = 0;
let failed = 0;
const result = (ok, name, info) => {
  if (ok) passed++; else failed++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${info ? ' — ' + info : ''}`);
};

(async () => {
  const c = new Client(dbTarget().pg);
  c.on('error', () => {});
  await c.connect();
  try {
    await withLiveTransaction(c, async () => {
      const [r] = (await c.query(
        `WITH recent AS (
           SELECT ta.id, ta.user_id FROM public.test_attempts ta
            WHERE ta.status IN ('submitted', 'auto_submitted') AND ta.submitted_at >= $2::timestamptz
            ORDER BY ta.submitted_at DESC LIMIT $1),
         wrong AS (
           SELECT r.id attempt_id, r.user_id, qv.question_id
             FROM recent r JOIN public.attempt_answers aa ON aa.attempt_id = r.id
             JOIN public.question_versions qv ON qv.id = aa.question_version_id
            WHERE aa.is_correct = false)
         SELECT (SELECT count(*)::int FROM recent) attempts,
                count(DISTINCT w.attempt_id)::int attempts_with_wrong,
                count(*)::int wrong_answers,
                count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM public.user_mistake_vault v WHERE v.user_id = w.user_id AND v.question_id = w.question_id))::int missing
           FROM wrong w`, [N, SINCE])).rows;
      result(r.missing === 0, 'VH-1 every wrong answer of the recent submitted attempts has its Memory Lock / vault row',
        `${r.attempts} attempt(s) checked, ${r.attempts_with_wrong} with wrong answers, ${r.wrong_answers} wrong answer(s), ${r.missing} missing`);
      const [g] = (await c.query(`SELECT has_function_privilege('service_role','public.fn_ml_ist_today()','EXECUTE') a,
                                         has_function_privilege('service_role','public.fn_ml_day_start(date)','EXECUTE') b`)).rows;
      result(g.a && g.b, 'VH-2 service_role can run the vault trigger helpers (110)', JSON.stringify(g));
      // COINS-FREEZE (112, 2026-10-26 06:29 UTC): the nightly fixture completes a real mock as the QA student — no coin
      // award may appear anywhere after the freeze (no REWARDED event, no ledger CREDIT)
      const [cz] = (await c.query(`SELECT (SELECT count(*)::int FROM public.gamification_events WHERE reward_status = 'REWARDED' AND occurred_at >= $1::timestamptz) rewarded,
                                          (SELECT count(*)::int FROM public.coin_ledger WHERE direction = 'CREDIT' AND created_at >= $1::timestamptz) credits`, [COINS_FROZEN_AT])).rows;
      result(cz.rewarded === 0 && cz.credits === 0, 'VH-3 COINS-FREEZE: zero new coin awards since 112 (mock completions included)', `${cz.rewarded} REWARDED event(s), ${cz.credits} ledger credit(s)`);
    }, { readOnly: true });
  } catch (e) {
    failed++;
    console.log(`  FAIL  VH-0 query failed — ${e.code || ''}`);
  } finally {
    await c.end().catch(() => {});
  }
  console.log(`\nVAULT-HEALTH: ${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
})();
