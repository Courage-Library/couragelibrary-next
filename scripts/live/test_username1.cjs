#!/usr/bin/env node
require('../db/safe-net.cjs'); // SAFE-NET: masks IPs / hosts / e-mails / keys in all output (scripts/db/safe-net.cjs)
/**
 * USERNAME-1 (migration 134) — AS THE REAL ROLES, every write inside a rolled-back transaction (withLiveTransaction →
 * safeBegin; one connection per chunk; a dropped connection re-runs the chunk once). Nothing is persisted.
 *   --pre   134 is NOT applied: each chunk first runs the migration inside its own transaction (then rolls back)
 *   (none)  after apply: refuses unless 134 is APPLIED
 *   R-1 resolver (owner conditions): fn_public_identities is SECURITY DEFINER with search_path ''; anon and authenticated
 *       get 42501 (NEGATIVE CONTROL: granting authenticated EXECUTE inside the transaction makes the same probe succeed);
 *       service_role gets id + label + is_team only; > 100 ids → 22023; a student → its username; the QA staff / admin
 *       → "Courage Library Team" + is_team (never their username); a real-name marker on the student never appears
 *   R-2 every profile has a username; every auth user has a profile; automatic names are "aspirant_" + 6–7 digits; a
 *       re-inserted profile gets an automatic name (trigger) with username_changed_at NULL and an AUTO history row
 *   R-3 rules as the real student (fn_set_username): "a.b_c" and upper case accepted (stored lower); another user's name
 *       in another case → TAKEN; reserved (incl. "courage.library", "ssc"), phone-like, e-mail-like → NOT_ALLOWED; a
 *       second change within 30 days → TOO_SOON; a name another user released < 90 days ago → TAKEN, ≥ 90 days → SET
 *   R-4 username_history and the real names stay private: anon / student cannot read username_history (42501) and the
 *       student reads no other profile (0 rows)
 * Run: node scripts/live/test_username1.cjs [--pre]
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const { pgClient } = require(path.join(ROOT, 'scripts/db/safe-net.cjs'));
const { withLiveTransaction } = require(path.join(ROOT, 'scripts/db/live-safety.cjs'));

const PRE = process.argv.includes('--pre');
const FILE = '20261102000134_username_1.sql';
const MIGRATION_SQL = fs.readFileSync(path.join(ROOT, 'supabase/migrations', FILE), 'utf8');

let ok = true;
let pending = [];
const chk = (n, cond, info) => { pending.push({ cond, line: `${cond ? 'PASS' : 'FAIL'} ${n}${cond ? '' : ' — ' + String(info ?? '').slice(0, 500)}` }); };
const flush = () => { for (const r of pending) { if (!r.cond) ok = false; console.log(r.line); } pending = []; };
const isConnectionError = (e) => !!e && (['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EPIPE', 'ECONNREFUSED', 'EAI_AGAIN'].includes(e.code) || /Connection terminated|connection error|not queryable/i.test(String(e.message)));

(async () => {
  let c = pgClient(); await c.connect();
  const q = async (s, p) => (await c.query(s, p)).rows;
  try {
    const [led] = await q(`select count(*)::int n from public.schema_migration_ledger where filename = $1 and status = 'APPLIED'`, [FILE]);
    if (PRE && led.n > 0) throw new Error(`--pre refused: ${FILE} is already APPLIED`);
    if (!PRE && led.n === 0) throw new Error(`${FILE} is not applied (use --pre for the pre-apply smoke)`);
    const ids = {};
    for (const [k, email] of [['student', 'qa-student@courage-library.test'], ['staff', 'qa-staff@courage-library.test'], ['admin', 'qa-admin@courage-library.test']]) {
      const [u] = await q(`select id from auth.users where email = $1`, [email]);
      if (!u) throw new Error(`QA ${k} missing`);
      ids[k] = u.id;
    }
    const lit = (o) => `'${JSON.stringify(o).replace(/'/g, "''")}'`;
    const as = async (role, cl, sql, p) => {
      await c.query('savepoint s'); await c.query(`set local role ${role}`); await c.query(`select set_config('request.jwt.claims', ${lit(cl)}, true)`);
      try { const r = (await c.query(sql, p)).rows; await c.query('reset role'); await c.query('release savepoint s'); return { ok: true, rows: r }; }
      catch (e) { await c.query('rollback to savepoint s'); return { ok: false, code: e.code }; }
    };
    const STUDENT = { sub: ids.student, role: 'authenticated', app_metadata: {} };
    const svc = (sql, p) => as('service_role', { role: 'service_role' }, sql, p);
    const setName = (claims, name) => as('authenticated', claims, `select public.fn_set_username($1) r`, [name]).then((x) => (x.ok ? x.rows[0].r.code : `ERR ${x.code}`));
    const chunk = async (fn) => {
      for (let attempt = 1; ; attempt++) {
        pending = [];
        try {
          await c.end().catch(() => {});
          c = pgClient(); await c.connect();
          await withLiveTransaction(c, async () => { if (PRE) await c.query(MIGRATION_SQL); await fn(); });
          flush();
          return;
        } catch (e) {
          if (attempt === 1 && isConnectionError(e)) { console.log(`RETRY chunk after a dropped connection (${e.code || 'terminated'})`); continue; }
          throw e;
        }
      }
    };

    // ---------------- R-1 resolver
    await chunk(async () => {
      const [fn] = await q(`select p.prosecdef d, p.proconfig cfg from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname = 'fn_public_identities'`);
      const call = (role, cl) => as(role, cl, `select * from public.fn_public_identities($1::uuid[])`, [[ids.student]]);
      const anon = await call('anon', { role: 'anon' });
      const student = await call('authenticated', STUDENT);
      await q(`update public.user_profiles set full_name = 'zz-u1-real-name' where id = $1`, [ids.student]);
      const service = await svc(`select * from public.fn_public_identities($1::uuid[])`, [[ids.student, ids.staff, ids.admin]]);
      const many = await svc(`select * from public.fn_public_identities($1::uuid[])`, [Array.from({ length: 101 }, () => ids.student)]);
      const [prof] = await q(`select username from public.user_profiles where id = $1`, [ids.student]);
      const [staffProf] = await q(`select username from public.user_profiles where id = $1`, [ids.staff]);
      const row = (id) => (service.rows || []).find((r) => r.id === id);
      // negative control: with EXECUTE granted to authenticated the same student probe succeeds
      await q('savepoint ctl');
      await q(`grant execute on function public.fn_public_identities(uuid[]) to authenticated`);
      const leaky = await call('authenticated', STUDENT);
      await q('rollback to savepoint ctl');
      chk('R-1a fn_public_identities: SECURITY DEFINER, search_path ""; anon and authenticated → 42501; negative control (EXECUTE granted) → readable',
        fn && fn.d && JSON.stringify(fn.cfg) === '["search_path=\\"\\""]' && anon.code === '42501' && student.code === '42501' && leaky.ok,
        JSON.stringify({ fn, anon: anon.code, student: student.code, control: leaky.ok }));
      const cols = service.ok && service.rows.length ? Object.keys(service.rows[0]).sort().join() : '';
      chk('R-1b service_role: id + label + is_team only; > 100 ids → 22023; student → its username; staff / admin → "Courage Library Team" (never their username); no real name',
        service.ok && cols === 'id,is_team,label' && many.code === '22023' && row(ids.student) && row(ids.student).label === prof.username && row(ids.student).is_team === false
          && ['staff', 'admin'].every((k) => row(ids[k]) && row(ids[k]).label === 'Courage Library Team' && row(ids[k]).is_team === true) && row(ids.staff).label !== staffProf.username
          && !JSON.stringify(service.rows).includes('zz-u1-real-name'),
        JSON.stringify({ cols, many: many.code, rows: (service.rows || []).map((r) => [r.id === ids.student ? 'student' : r.id === ids.staff ? 'staff' : 'admin', r.label === prof.username ? '<own username>' : r.label, r.is_team]) }));
    });

    // ---------------- R-2 automatic usernames
    await chunk(async () => {
      const [cov] = await q(`select (select count(*) from public.user_profiles where username is null)::int no_name,
                                     (select count(*) from auth.users u where not exists (select 1 from public.user_profiles p where p.id = u.id))::int no_profile`);
      const [shape] = await q(`select count(*) filter (where username !~ '^aspirant_[0-9]{6,7}$')::int odd, count(*)::int n from public.user_profiles where username like 'aspirant\\_%'`);
      // the trigger: re-insert the student's profile (rolled back) without a username
      await q(`delete from public.username_history where user_id = $1`, [ids.student]);
      await q(`delete from public.user_profiles where id = $1`, [ids.student]);
      await q(`insert into public.user_profiles (id) values ($1)`, [ids.student]);
      const [p] = await q(`select username, username_changed_at from public.user_profiles where id = $1`, [ids.student]);
      const [h] = await q(`select count(*)::int n from public.username_history where user_id = $1 and kind = 'AUTO' and released_at is null and username = $2`, [ids.student, p.username]);
      chk('R-2 every profile named; every account has a profile; automatic names "aspirant_" + digits; the trigger names a new profile (changed_at NULL, AUTO history row)',
        cov.no_name === 0 && cov.no_profile === 0 && shape.odd === 0 && /^aspirant_\d{6,7}$/.test(p.username) && p.username_changed_at === null && h.n === 1,
        JSON.stringify({ cov, shape, newName: /^aspirant_\d{6,7}$/.test(p.username), changedAt: p.username_changed_at, history: h.n }));
    });

    // ---------------- R-3 rules as the real student
    await chunk(async () => {
      const r = {};
      r.dot = await setName(STUDENT, 'Zz.U1_Test');
      const [stored] = await q(`select username from public.user_profiles where id = $1`, [ids.student]);
      await q(`update public.user_profiles set username_changed_at = now() - interval '31 days' where id = $1`, [ids.student]);
      const [other] = await q(`select username from public.user_profiles where id <> $1 and username is not null order by created_at limit 1`, [ids.student]);
      r.taken = await setName(STUDENT, other.username.toUpperCase());
      r.reserved = await setName(STUDENT, 'courage.library');
      r.ssc = await setName(STUDENT, 'ssc');
      r.phone = await setName(STUDENT, 'a9876543210');
      r.mail = await setName(STUDENT, 'zzu1.gmail');
      r.domain = await setName(STUDENT, 'zzu1test.com');
      r.again = await setName(STUDENT, 'zz.u1.second');
      r.tooSoon = await setName(STUDENT, 'zz.u1.third');
      // 90-day hold: the staff account "released" a name 10 days ago → not available; 91 days ago → available
      await q(`update public.user_profiles set username_changed_at = now() - interval '31 days' where id = $1`, [ids.student]);
      await q(`insert into public.username_history (user_id, username, kind, set_at, released_at) values ($1, 'zz.u1.held', 'USER', now() - interval '40 days', now() - interval '10 days')`, [ids.staff]);
      r.held = await setName(STUDENT, 'zz.u1.held');
      await q(`update public.username_history set released_at = now() - interval '91 days' where user_id = $1 and username = 'zz.u1.held'`, [ids.staff]);
      r.afterHold = await setName(STUDENT, 'zz.u1.held');
      const [hist] = await q(`select count(*) filter (where released_at is null)::int open, count(*)::int n from public.username_history where user_id = $1 and kind = 'USER'`, [ids.student]);
      chk('R-3 rules: dot + upper case accepted (stored lower); other user in another case TAKEN; reserved / phone / e-mail NOT_ALLOWED; 30-day TOO_SOON; 90-day hold TAKEN then SET; history one open row',
        r.dot === 'SET' && stored.username === 'zz.u1_test' && r.taken === 'TAKEN' && r.reserved === 'NOT_ALLOWED' && r.ssc === 'NOT_ALLOWED' && r.phone === 'NOT_ALLOWED'
          && r.mail === 'NOT_ALLOWED' && r.domain === 'NOT_ALLOWED' && r.again === 'SET' && r.tooSoon === 'TOO_SOON' && r.held === 'TAKEN' && r.afterHold === 'SET' && hist.open === 1,
        JSON.stringify({ ...r, stored: stored.username, hist }));
    });

    // ---------------- R-4 privacy
    await chunk(async () => {
      const anonHist = await as('anon', { role: 'anon' }, `select count(*) from public.username_history`);
      const stuHist = await as('authenticated', STUDENT, `select count(*) from public.username_history`);
      const others = await as('authenticated', STUDENT, `select count(*)::int n from public.user_profiles where id <> $1`, [ids.student]);
      chk('R-4 username_history unreadable for anon / student (42501); the student reads no other profile',
        anonHist.code === '42501' && stuHist.code === '42501' && others.ok && others.rows[0].n === 0,
        JSON.stringify({ anon: anonHist.code, student: stuHist.code, others: others.ok ? others.rows[0].n : others.code }));
    });
  } catch (e) {
    flush();
    console.log('ERROR', String(e.message).slice(0, 300));
    ok = false;
  } finally {
    await c.end().catch(() => {});
  }
  console.log(ok ? `USERNAME-1 live${PRE ? ' (--pre, rolled back)' : ''}: ALL PASS` : `USERNAME-1 live${PRE ? ' (--pre)' : ''}: FAILURES`);
  process.exit(ok ? 0 : 1);
})();
