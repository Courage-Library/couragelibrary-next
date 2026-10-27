/**
 * Deletes everything the E2E test student created, in one DB transaction, then the auth user.
 * Refuses (rolls back) if any public row still references the student afterwards, or if a battle room
 * it created has other participants.
 * Usage: node scripts/e2e/cleanup-student.cjs
 *
 * HOTFIX-1: a permanent QA identity (docs/testing/QA_IDENTITIES.md) is NEVER deleted. For such an identity the
 * script refuses to run unless E2E_KEEP_USER=1 (data-only cleanup), before it connects to anything, and the
 * auth deletion itself goes through guardedDeleteUser (re-checks the e-mail by id).
 *
 * SMOKE-FIXTURE-1: E2E_KEEP_FIXTURE=1 (requires E2E_KEEP_USER=1) keeps the student-mistake smoke fixture — the
 * student's LATEST completed attempt that has at least one wrong answer, with its answers, result (+ section
 * results), the mistake occurrences of those answers and the vault rows they point to. Everything else is deleted
 * as before, and the "nothing left" check then allows exactly those fixture rows. Default behaviour is unchanged.
 */
const { safeBegin } = require('../db/live-safety.cjs'); // LIVE-LOCK-SWEEP: the one safe BEGIN (timeouts + rollback on stop)
const { Client } = require('pg');
const { assertDeletable, isPermanentIdentity, guardedDeleteUser } = require('../qa/qa-identity-guard.cjs');
const { admin, findUser, pgConfig, EMAIL } = require('./_e2e-env.cjs');

const KEEP_USER = process.env.E2E_KEEP_USER === '1';
const KEEP_FIXTURE = process.env.E2E_KEEP_FIXTURE === '1';
if (KEEP_FIXTURE && !KEEP_USER) {
  console.log('REFUSED: E2E_KEEP_FIXTURE=1 requires E2E_KEEP_USER=1 (the fixture belongs to a kept identity).');
  process.exit(1);
}

if (!KEEP_USER && isPermanentIdentity(EMAIL)) {
  console.log('REFUSED: E2E_STUDENT_EMAIL is a permanent QA identity. Re-run with E2E_KEEP_USER=1 (data-only cleanup).');
  process.exit(1);
}

(async () => {
  const u = await findUser();
  if (!u) {
    console.log('student not found (already cleaned)');
    return;
  }
  const uid = u.id;
  if (!KEEP_USER) assertDeletable(u.email); // the user found must be deletable too (defence in depth)
  const c = new Client(pgConfig());
  c.on('error', () => {});
  await c.connect();
  const counts = {};
  const del = async (label, sql, params = [uid]) => {
    counts[label] = (await c.query(sql, params)).rowCount;
  };
  const fkColumnsTo = (regclass) => c.query(
    `SELECT DISTINCT cl.relname tbl, a.attname col FROM pg_constraint con
     JOIN pg_class cl ON cl.oid = con.conrelid
     JOIN pg_namespace n ON n.oid = cl.relnamespace
     JOIN LATERAL unnest(con.conkey) k(attnum) ON true
     JOIN pg_attribute a ON a.attrelid = cl.oid AND a.attnum = k.attnum
     WHERE con.contype = 'f' AND con.confrelid = $1::regclass AND n.nspname = 'public'`, [regclass]);
  try {
    await safeBegin(c);
    // SMOKE-FIXTURE-1: the fixture to keep (empty arrays when not keeping, or when there is none)
    let fx = { attempt: null, answers: [], results: [], occurrences: [], vault: [] };
    if (KEEP_FIXTURE) {
      const a = (await c.query(`SELECT t.id FROM public.test_attempts t WHERE t.user_id = $1 AND t.status IN ('submitted','completed')
          AND EXISTS (SELECT 1 FROM public.attempt_answers aa WHERE aa.attempt_id = t.id AND aa.is_correct = false)
          ORDER BY coalesce(t.submitted_at, t.started_at) DESC NULLS LAST LIMIT 1`, [uid])).rows[0];
      if (a) {
        const ids = (sql, params) => c.query(sql, params).then((r) => r.rows.map((x) => x.id));
        fx.attempt = a.id;
        fx.answers = await ids(`SELECT id FROM public.attempt_answers WHERE attempt_id = $1`, [a.id]);
        fx.results = await ids(`SELECT id FROM public.test_results WHERE attempt_id = $1`, [a.id]);
        fx.occurrences = await ids(`SELECT id FROM public.user_mistake_occurrences WHERE user_id = $1 AND attempt_answer_id = ANY($2)`, [uid, fx.answers]);
        fx.vault = await ids(`SELECT DISTINCT vault_id AS id FROM public.user_mistake_occurrences WHERE id = ANY($1)`, [fx.occurrences]);
      }
      console.log(`keeping fixture: attempt ${fx.attempt ? 1 : 0}, answers ${fx.answers.length}, results ${fx.results.length}, occurrences ${fx.occurrences.length}, vault ${fx.vault.length}`);
    }
    const NONE = '00000000-0000-0000-0000-000000000000';
    const keepAttempt = fx.attempt || NONE;
    const rooms = (await c.query(`SELECT id FROM public.quiz_battle_rooms WHERE created_by_user_id = $1`, [uid])).rows.map((r) => r.id);
    if (rooms.length) {
      const others = (await c.query(`SELECT count(*)::int n FROM public.quiz_battle_participants WHERE room_id = ANY($1) AND user_id <> $2`, [rooms, uid])).rows[0].n;
      if (others > 0) throw new Error('battle room has other participants — refusing to delete');
      for (const f of (await fkColumnsTo('public.quiz_battle_rooms')).rows) {
        await del(`${f.tbl} (battle room)`, `DELETE FROM public."${f.tbl}" WHERE "${f.col}" = ANY($1)`, [rooms]);
      }
      await del('quiz_battle_rooms', `DELETE FROM public.quiz_battle_rooms WHERE id = ANY($1) AND created_by_user_id = $2`, [rooms, uid]);
    }
    await del('user_battle_stats', `DELETE FROM public.user_battle_stats WHERE user_id = $1`);
    // SEC-HOTFIX-7: the drill check (scripts/e2e/student-drill.cjs) creates drill sessions for the QA student
    await del('user_mistake_drills', `DELETE FROM public.user_mistake_drills WHERE user_id = $1`);
    await del('user_mistake_occurrences', `DELETE FROM public.user_mistake_occurrences WHERE user_id = $1 AND NOT (id = ANY($2::uuid[]))`, [uid, fx.occurrences]);
    await del('user_mistake_vault', `DELETE FROM public.user_mistake_vault WHERE user_id = $1 AND NOT (id = ANY($2::uuid[]))`, [uid, fx.vault]);
    await del('attempt_answers', `DELETE FROM public.attempt_answers WHERE attempt_id IN (SELECT id FROM public.test_attempts WHERE user_id = $1) AND attempt_id <> $2`, [uid, keepAttempt]);
    await del('section_results', `DELETE FROM public.section_results WHERE test_result_id IN (SELECT id FROM public.test_results WHERE user_id = $1) AND NOT (test_result_id = ANY($2::uuid[]))`, [uid, fx.results]);
    await del('test_results', `DELETE FROM public.test_results WHERE user_id = $1 AND NOT (id = ANY($2::uuid[]))`, [uid, fx.results]);
    await del('test_attempts', `DELETE FROM public.test_attempts WHERE user_id = $1 AND id <> $2`, [uid, keepAttempt]);
    await del('coin_ledger', `DELETE FROM public.coin_ledger WHERE user_id = $1`);
    await del('coin_wallets', `DELETE FROM public.coin_wallets WHERE user_id = $1`);
    await del('gamification_events', `DELETE FROM public.gamification_events WHERE user_id = $1`);
    await del('streak_activity_logs', `DELETE FROM public.streak_activity_logs WHERE user_id = $1`);
    await del('user_streaks', `DELETE FROM public.user_streaks WHERE user_id = $1`);
    // SEC-1B: E2E_KEEP_USER=1 keeps a permanent QA identity (auth user + profile); only journey data goes.
    if (!KEEP_USER) await del('user_profiles', `DELETE FROM public.user_profiles WHERE id = $1`);

    // Nothing referencing the student may remain.
    const cols = (await c.query(
      `SELECT DISTINCT cl.relname tbl, a.attname col FROM pg_constraint con
       JOIN pg_class cl ON cl.oid = con.conrelid
       JOIN pg_namespace n ON n.oid = cl.relnamespace
       JOIN LATERAL unnest(con.conkey) k(attnum) ON true
       JOIN pg_attribute a ON a.attrelid = cl.oid AND a.attnum = k.attnum
       WHERE con.contype = 'f' AND con.confrelid = 'auth.users'::regclass AND n.nspname = 'public'
       UNION SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'user_id'`)).rows;
    const left = [];
    // SMOKE-FIXTURE-1: with E2E_KEEP_FIXTURE=1 exactly these rows may remain (by user_id)
    const allowed = KEEP_FIXTURE ? { test_attempts: fx.attempt ? 1 : 0, test_results: fx.results.length, user_mistake_occurrences: fx.occurrences.length, user_mistake_vault: fx.vault.length } : {};
    for (const r of cols) {
      if (KEEP_USER && r.tbl === "user_profiles") continue;
      const n = Number((await c.query(`SELECT count(*) c FROM public."${r.tbl}" WHERE "${r.col}" = $1`, [uid])).rows[0].c);
      if (r.col === 'user_id' && allowed[r.tbl] !== undefined) {
        if (n !== allowed[r.tbl]) left.push(`${r.tbl}.${r.col}=${n} (fixture expects ${allowed[r.tbl]})`);
        continue;
      }
      if (n) left.push(`${r.tbl}.${r.col}=${n}`);
    }
    if (left.length) throw new Error('rows still reference the student: ' + left.join(', '));
    await c.query('COMMIT');
  } catch (e) {
    await c.query('ROLLBACK').catch(() => undefined);
    await c.end();
    console.log('CLEANUP ROLLED BACK:', String(e.message).slice(0, 300));
    process.exit(1);
  }
  await c.end();
  if (KEEP_USER) {
    console.log(`deleted (permanent identity kept${KEEP_FIXTURE ? ', smoke fixture kept' : ''}):`, JSON.stringify(counts));
    return;
  }
  const { error } = await guardedDeleteUser(admin, uid);
  counts['auth.users'] = error ? `ERROR ${error.message}` : 1;
  console.log('deleted:', JSON.stringify(counts));
  if (error) process.exit(1);
})().catch((e) => {
  console.log('ERR', String(e.message).slice(0, 200));
  process.exit(1);
});
