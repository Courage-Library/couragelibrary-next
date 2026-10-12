/**
 * Deletes everything the E2E test student created, in one DB transaction, then the auth user.
 * Refuses (rolls back) if any public row still references the student afterwards, or if a battle room
 * it created has other participants.
 * Usage: node scripts/e2e/cleanup-student.cjs
 */
const { Client } = require('pg');
const { admin, findUser, pgConfig } = require('./_e2e-env.cjs');

(async () => {
  const u = await findUser();
  if (!u) {
    console.log('student not found (already cleaned)');
    return;
  }
  const uid = u.id;
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
    await c.query('BEGIN READ WRITE');
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
    await del('user_mistake_occurrences', `DELETE FROM public.user_mistake_occurrences WHERE user_id = $1`);
    await del('user_mistake_vault', `DELETE FROM public.user_mistake_vault WHERE user_id = $1`);
    await del('attempt_answers', `DELETE FROM public.attempt_answers WHERE attempt_id IN (SELECT id FROM public.test_attempts WHERE user_id = $1)`);
    await del('section_results', `DELETE FROM public.section_results WHERE test_result_id IN (SELECT id FROM public.test_results WHERE user_id = $1)`);
    await del('test_results', `DELETE FROM public.test_results WHERE user_id = $1`);
    await del('test_attempts', `DELETE FROM public.test_attempts WHERE user_id = $1`);
    await del('coin_ledger', `DELETE FROM public.coin_ledger WHERE user_id = $1`);
    await del('coin_wallets', `DELETE FROM public.coin_wallets WHERE user_id = $1`);
    await del('gamification_events', `DELETE FROM public.gamification_events WHERE user_id = $1`);
    await del('streak_activity_logs', `DELETE FROM public.streak_activity_logs WHERE user_id = $1`);
    await del('user_streaks', `DELETE FROM public.user_streaks WHERE user_id = $1`);
    await del('user_profiles', `DELETE FROM public.user_profiles WHERE id = $1`);

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
    for (const r of cols) {
      const n = Number((await c.query(`SELECT count(*) c FROM public."${r.tbl}" WHERE "${r.col}" = $1`, [uid])).rows[0].c);
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
  const { error } = await admin.auth.admin.deleteUser(uid);
  counts['auth.users'] = error ? `ERROR ${error.message}` : 1;
  console.log('deleted:', JSON.stringify(counts));
  if (error) process.exit(1);
})().catch((e) => {
  console.log('ERR', String(e.message).slice(0, 200));
  process.exit(1);
});
