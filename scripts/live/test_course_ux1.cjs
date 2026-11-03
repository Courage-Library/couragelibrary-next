#!/usr/bin/env node
require('../db/safe-net.cjs'); // SAFE-NET: masks IPs / hosts / e-mails / keys in all output (scripts/db/safe-net.cjs)
/**
 * COURSE-UX-1 (migrations 135 / 136 / 137) — AS THE REAL ROLES, every write inside a rolled-back transaction
 * (withLiveTransaction → safeBegin; one connection per chunk; a dropped connection re-runs the chunk once). Nothing is
 * persisted. --pre: each chunk first runs the NOT-yet-applied migrations of 135 → 137 inside its transaction (their
 * preflight ledger checks are skipped for a predecessor that is itself only applied in the same transaction).
 *   P-1 135 one progress record per lesson: two language rows (READING en + COMPLETED hi) merge into ONE row — COMPLETED,
 *       earliest start, last block + language of the newest; key (user_id, document_id); the RPC keeps its grants
 *   E-1 evidence: open → session (server start); "complete" at once → END + QUICK_CHECKS + TIME missing, nothing
 *       written; the student cannot write the evidence tables (42501) nor backdate the start; a fake / middle block does
 *       not count as the end, the LAST block does; fn_lesson_progress_save('COMPLETED') without evidence stays READING;
 *       reading minutes SQL = lib/lessons/reading-time.ts on the real lesson; the helper is not client-callable
 *   E-2 quick checks: the server decides correctness; the FIRST attempt is recorded and a later right answer does not
 *       change it; unknown block / option → P0002; anon → 42501; the browser-side key never needed
 *   E-3 completion: with end + every check + time (start moved back by the postgres role = time passing) → COMPLETED
 *       once; a replay / second tab → "already"; anon → 42501; another user cannot read the student's evidence
 *   C-1 coins switch OFF (as shipped): completion awards 0 (EARN_OFF), no event, no ledger row; the award helper is not
 *       callable by authenticated / service_role (42501); the generic award stays frozen
 *   C-2 coins switch ON (inside the transaction only): +15 (all first attempts right) through the canonical ledger
 *       (event REWARDED + ledger CREDIT + wallet); replay → no second credit; daily cap 100 (India day) → partial
 *       award "DAILY_CAP"; yesterday's coins do not count; a locked wallet earns 0; NEGATIVE CONTROL: with the cap
 *       raised the same call pays in full
 * Run: node scripts/live/test_course_ux1.cjs [--pre]
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const { pgClient } = require(path.join(ROOT, 'scripts/db/safe-net.cjs'));
const { withLiveTransaction } = require(path.join(ROOT, 'scripts/db/live-safety.cjs'));

const PRE = process.argv.includes('--pre');
const FILES = ['20261103000135_course_progress_per_lesson.sql', '20261103000136_lesson_completion_evidence.sql', '20261103000137_lesson_coins_earn.sql'];
const SQL = Object.fromEntries(FILES.map((f) => [f, fs.readFileSync(path.join(ROOT, 'supabase/migrations', f), 'utf8')]));
const stripPreflight = (s) => s.replace(/DO \$pre\$[\s\S]*?\$pre\$;/, '');

function loadTs(rel) {
  const ts = require('typescript');
  const out = ts.transpileModule(fs.readFileSync(path.join(ROOT, rel), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', out)((id) => (id.startsWith('@/') ? {} : require(id)), mod, mod.exports);
  return mod.exports;
}
const RT = loadTs('lib/lessons/reading-time.ts');

let ok = true;
let pending = [];
const chk = (n, cond, info) => { pending.push({ cond, line: `${cond ? 'PASS' : 'FAIL'} ${n}${cond ? '' : ' — ' + String(info ?? '').slice(0, 600)}` }); };
const flush = () => { for (const r of pending) { if (!r.cond) ok = false; console.log(r.line); } pending = []; };
const isConnectionError = (e) => !!e && (['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EPIPE', 'ECONNREFUSED', 'EAI_AGAIN'].includes(e.code) || /Connection terminated|connection error|not queryable/i.test(String(e.message)));

(async () => {
  let c = pgClient(); await c.connect();
  const q = async (s, p) => (await c.query(s, p)).rows;
  try {
    const applied = {};
    for (const f of FILES) {
      const [led] = await q(`select count(*)::int n from public.schema_migration_ledger where filename = $1 and status = 'APPLIED'`, [f]);
      applied[f] = led.n > 0;
    }
    const missing = FILES.filter((f) => !applied[f]);
    if (PRE && missing.length === 0) throw new Error('--pre refused: 135, 136 and 137 are already APPLIED');
    if (!PRE && missing.length) throw new Error(`${missing.join(', ')} not applied (use --pre for the pre-apply smoke)`);
    const runMissing = async () => {
      for (const f of FILES) if (!applied[f]) await c.query(FILES.indexOf(f) > 0 && !applied[FILES[FILES.indexOf(f) - 1]] ? stripPreflight(SQL[f]) : SQL[f]);
    };

    const ids = {};
    for (const [k, email] of [['student', 'qa-student@courage-library.test'], ['staff', 'qa-staff@courage-library.test']]) {
      const [u] = await q(`select id from auth.users where email = $1`, [email]);
      if (!u) throw new Error(`QA ${k} missing`);
      ids[k] = u.id;
    }
    // the fixture: a published lesson (English version) with at least two quick checks — read only; all writes roll back
    const [fx] = await q(`select d.id, dv.blocks from public.learning_documents d
        join public.document_versions dv on dv.document_id = d.id and dv.language = 'en' and dv.is_current and dv.is_published and dv.review_status = 'PUBLISHED' and dv.content_format = 'BLOCKS'
       where d.status = 'PUBLISHED' and d.document_type = 'NODE_LESSON'
         and jsonb_array_length(jsonb_path_query_array(dv.blocks, '$[*] ? (@.type == "quick_check")')) >= 2
       order by d.created_at limit 1`);
    if (!fx) throw new Error('no published lesson with two quick checks');
    const DOC = fx.id;
    const blocks = fx.blocks;
    const checks = blocks.filter((b) => b.type === 'quick_check');
    const lastId = blocks[blocks.length - 1].id;
    const middleId = blocks[Math.floor(blocks.length / 2)].id;

    const lit = (o) => `'${JSON.stringify(o).replace(/'/g, "''")}'`;
    const as = async (role, cl, sql, p) => {
      await c.query('savepoint s'); await c.query(`set local role ${role}`); await c.query(`select set_config('request.jwt.claims', ${lit(cl)}, true)`);
      try { const r = (await c.query(sql, p)).rows; await c.query('reset role'); await c.query('release savepoint s'); return { ok: true, rows: r }; }
      catch (e) { await c.query('rollback to savepoint s'); return { ok: false, code: e.code }; }
    };
    const STU = { sub: ids.student, role: 'authenticated', app_metadata: {} };
    const STAFF = { sub: ids.staff, role: 'authenticated', app_metadata: { role: 'staff' } };
    const ANON = { role: 'anon' };
    const r1 = (x) => (x.ok ? x.rows[0].r : `ERR ${x.code}`);
    const save = (cl, block = null, status = 'READING') => as('authenticated', cl, `select public.fn_lesson_progress_save($1, 'en', $2, $3) r`, [DOC, status, block]).then(r1);
    const answer = (cl, block, option) => as(cl === ANON ? 'anon' : 'authenticated', cl, `select public.fn_lesson_quick_check_answer($1, 'en', $2, $3) r`, [DOC, block, option]).then(r1);
    const complete = (cl) => as(cl === ANON ? 'anon' : 'authenticated', cl, `select public.fn_lesson_complete($1, 'en') r`, [DOC]).then(r1);
    const wrongOf = (b) => b.options.find((o) => !o.correct).id;
    const rightOf = (b) => b.options.find((o) => o.correct).id;
    const clean = async () => {
      // a clean slate for the student on the fixture (inside the transaction)
      await q(`delete from public.user_lesson_progress where user_id = $1 and document_id = $2`, [ids.student, DOC]);
      await q(`delete from public.lesson_reading_sessions where user_id = $1 and document_id = $2`, [ids.student, DOC]);
      await q(`delete from public.lesson_quick_check_attempts where user_id = $1 and document_id = $2`, [ids.student, DOC]);
    };
    const minutes = RT.readingMinutes(blocks);
    const required = RT.requiredReadingSeconds(minutes);
    const evidence = async (correctAll) => {
      await save(STU);
      for (const b of checks) await answer(STU, b.id, correctAll ? rightOf(b) : wrongOf(b));
      await save(STU, lastId);
      await q(`update public.lesson_reading_sessions set started_at = now() - make_interval(secs => $3) where user_id = $1 and document_id = $2`, [ids.student, DOC, required + 1]);
    };

    const chunk = async (fn, before) => {
      for (let attempt = 1; ; attempt++) {
        pending = [];
        try {
          await c.end().catch(() => {});
          c = pgClient(); await c.connect();
          await withLiveTransaction(c, async () => { if (PRE && before) await before(); if (PRE) await runMissing(); await fn(); });
          flush();
          return;
        } catch (e) {
          if (attempt === 1 && isConnectionError(e)) { console.log(`RETRY chunk after a dropped connection (${e.code || 'terminated'})`); continue; }
          throw e;
        }
      }
    };

    // ---------------- P-1 one progress record per lesson
    await chunk(async () => {
      const [key] = await q(`select pg_get_constraintdef(oid) d from pg_constraint where conname = 'user_lesson_progress_pkey'`);
      const rows = await q(`select status, language, last_block_id, started_at, completed_at is not null done from public.user_lesson_progress where user_id = $1 and document_id = $2`, [ids.student, DOC]);
      const [dupes] = await q(`select count(*)::int n from (select 1 from public.user_lesson_progress group by user_id, document_id having count(*) > 1) x`);
      const [fn] = await q(`select prosecdef s, has_function_privilege('anon', oid, 'EXECUTE') anon, has_function_privilege('authenticated', oid, 'EXECUTE') auth from pg_proc where oid = 'public.fn_lesson_progress_save(uuid, text, text, text)'::regprocedure`);
      const merged = PRE ? rows.length === 1 && rows[0].status === 'COMPLETED' && rows[0].done && rows[0].language === 'hi' && rows[0].last_block_id === 'zz-hi-block' && new Date(rows[0].started_at).getTime() === Date.UTC(2026, 0, 1) : true;
      chk(`P-1 one record per lesson: key (user_id, document_id); no duplicates${PRE ? '; en READING + hi COMPLETED merged → ONE COMPLETED row (newest language + block, earliest start)' : ''}; progress RPC SECURITY DEFINER, authenticated only`,
        key.d === 'PRIMARY KEY (user_id, document_id)' && dupes.n === 0 && merged && fn.s && !fn.anon && fn.auth,
        JSON.stringify({ key: key.d, dupes: dupes.n, rows, fn }));
    }, async () => {
      // before 135 (old key): two language rows for one lesson
      await q(`delete from public.user_lesson_progress where user_id = $1 and document_id = $2`, [ids.student, DOC]);
      await q(`insert into public.user_lesson_progress (user_id, document_id, language, status, last_block_id, started_at, updated_at) values ($1, $2, 'en', 'READING', 'zz-en-block', '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z')`, [ids.student, DOC]);
      await q(`insert into public.user_lesson_progress (user_id, document_id, language, status, last_block_id, started_at, completed_at, updated_at) values ($1, $2, 'hi', 'COMPLETED', 'zz-hi-block', '2026-01-03T00:00:00Z', '2026-01-03T00:00:00Z', '2026-01-04T00:00:00Z')`, [ids.student, DOC]);
    });

    // ---------------- E-1 evidence
    await chunk(async () => {
      await clean();
      const opened = await save(STU);
      const [s1] = await q(`select started_at is not null started, end_reached_at from public.lesson_reading_sessions where user_id = $1 and document_id = $2`, [ids.student, DOC]);
      const early = await complete(STU);
      const [p1] = await q(`select status from public.user_lesson_progress where user_id = $1 and document_id = $2`, [ids.student, DOC]);
      const w1 = await as('authenticated', STU, `insert into public.lesson_reading_sessions (user_id, document_id, end_reached_at) values ($1, $2, now())`, [ids.student, DOC]);
      const w2 = await as('authenticated', STU, `update public.lesson_reading_sessions set started_at = now() - interval '1 day'`);
      const w3 = await as('authenticated', STU, `insert into public.lesson_quick_check_attempts (user_id, document_id, language, block_id, option_id, is_correct) values ($1, $2, 'en', 'a', 'b', true)`, [ids.student, DOC]);
      const w4 = await as('authenticated', STU, `update public.user_lesson_progress set status = 'COMPLETED', completed_at = now()`);
      await save(STU, 'zz-not-a-block');
      await save(STU, middleId);
      const [s2] = await q(`select end_reached_at is not null ended, last_block_id from public.lesson_reading_sessions where user_id = $1 and document_id = $2`, [ids.student, DOC]);
      await save(STU, lastId);
      const [s3] = await q(`select end_reached_at is not null ended from public.lesson_reading_sessions where user_id = $1 and document_id = $2`, [ids.student, DOC]);
      const bare = await save(STU, null, 'COMPLETED');
      const [sqlMin] = await q(`select public.fn_lesson__reading_minutes($1::jsonb) m`, [JSON.stringify(blocks)]);
      const helper = await as('authenticated', STU, `select public.fn_lesson__reading_minutes('[]'::jsonb)`);
      chk('E-1 open → server start; immediate "complete" → END + QUICK_CHECKS + TIME missing, still READING; the student cannot write evidence / backdate / complete directly (42501); fake + middle block ≠ end, LAST block = end; a bare COMPLETED save stays READING',
        opened && opened.status === 'READING' && s1.started && s1.end_reached_at === null && early && early.completed === false
          && ['END', 'QUICK_CHECKS', 'TIME'].every((m) => early.missing.includes(m)) && p1.status === 'READING'
          && [w1, w2, w3, w4].every((w) => !w.ok && w.code === '42501') && !s2.ended && s2.last_block_id === middleId && s3.ended
          && bare && bare.status === 'READING' && bare.complete && bare.complete.completed === false,
        JSON.stringify({ opened, s1, early, p1, writes: [w1, w2, w3, w4].map((w) => w.code || 'ok'), s2, s3, bare }));
      chk(`E-1b reading minutes: SQL ${sqlMin.m} = lib/lessons/reading-time.ts ${minutes} (required ${required} s); the helper is not client-callable (42501)`,
        sqlMin.m === minutes && helper.code === '42501', JSON.stringify({ sql: sqlMin.m, ts: minutes, helper: helper.code }));
    });

    // ---------------- E-2 quick checks
    await chunk(async () => {
      await clean();
      await save(STU);
      const [a, b] = checks;
      const wrong = await answer(STU, a.id, wrongOf(a));
      const thenRight = await answer(STU, a.id, rightOf(a));
      const right = await answer(STU, b.id, rightOf(b));
      const rec = await q(`select block_id, option_id, is_correct from public.lesson_quick_check_attempts where user_id = $1 and document_id = $2 order by block_id`, [ids.student, DOC]);
      const recA = rec.find((r) => r.block_id === a.id);
      const recB = rec.find((r) => r.block_id === b.id);
      const badBlock = await answer(STU, 'zz-no-block', 'a');
      const badOption = await answer(STU, a.id, 'zz-no-option');
      const anon = await answer(ANON, a.id, rightOf(a));
      chk('E-2 the server decides: wrong → correct=false + the right option id; FIRST attempt recorded (a later right answer does not change it); unknown block / option → P0002; anon → 42501',
        wrong && wrong.correct === false && wrong.correct_option_id === rightOf(a) && wrong.first_attempt === true && thenRight.correct === true && thenRight.first_attempt === false
          && right.correct === true && recA && recA.is_correct === false && recA.option_id === wrongOf(a) && recB && recB.is_correct === true
          && badBlock === 'ERR P0002' && badOption === 'ERR P0002' && anon === 'ERR 42501',
        JSON.stringify({ wrong, thenRight, right, rec, badBlock, badOption, anon }));
    });

    // ---------------- E-3 completion
    await chunk(async () => {
      await clean();
      await evidence(false);
      const done = await complete(STU);
      const again = await complete(STU);
      const [p] = await q(`select status, completed_at is not null done from public.user_lesson_progress where user_id = $1 and document_id = $2`, [ids.student, DOC]);
      const anon = await complete(ANON);
      const staffSees = await as('authenticated', STAFF, `select (select count(*) from public.lesson_reading_sessions where user_id = $1)::int s, (select count(*) from public.lesson_quick_check_attempts where user_id = $1)::int a, (select count(*) from public.user_lesson_progress where user_id = $1)::int p`, [ids.student]);
      chk('E-3 end + every check + time → COMPLETED (all_correct false after a wrong first attempt); replay → already; anon → 42501; another user reads none of the evidence',
        done && done.completed === true && done.already === false && done.all_correct === false && again && again.already === true && p.status === 'COMPLETED' && p.done
          && anon === 'ERR 42501' && staffSees.ok && staffSees.rows[0].s === 0 && staffSees.rows[0].a === 0 && staffSees.rows[0].p === 0,
        JSON.stringify({ done, again, p, anon, staff: staffSees.ok ? staffSees.rows[0] : staffSees.code }));
    });

    // ---------------- C-1 coins OFF (as shipped)
    await chunk(async () => {
      await clean();
      const [sw] = await q(`select count(*)::int n from public.premium_system_configs where config_key = 'COINS_LESSON_EARN'`);
      const [l0] = await q(`select count(*)::int n from public.coin_ledger where user_id = $1`, [ids.student]);
      await evidence(true);
      const done = await complete(STU);
      const [l1] = await q(`select count(*)::int n from public.coin_ledger where user_id = $1`, [ids.student]);
      const [ev] = await q(`select count(*)::int n from public.gamification_events where idempotency_key = $1`, [`lesson_completed:${ids.student}:${DOC}`]);
      const helperAuth = await as('authenticated', STU, `select public.fn_lesson__award_coins($1, $2, true)`, [ids.student, DOC]);
      const helperSvc = await as('service_role', { role: 'service_role' }, `select public.fn_lesson__award_coins($1, $2, true)`, [ids.student, DOC]);
      const frozen = await as('service_role', { role: 'service_role' }, `select public.fn_award_gamification_reward($1, 'LESSON_COMPLETED', 'LESSON', $2, 'zz-c1-generic', 10) r`, [ids.student, DOC]);
      chk('C-1 switch OFF as shipped: completion pays 0 (EARN_OFF), no event, no ledger row; the award helper → 42501 for authenticated AND service_role; the generic award stays frozen',
        sw.n === 0 && done && done.completed === true && done.coins_awarded === 0 && done.coins_reason === 'EARN_OFF' && l1.n === l0.n && ev.n === 0
          && helperAuth.code === '42501' && helperSvc.code === '42501' && frozen.ok && frozen.rows[0].r.frozen === true,
        JSON.stringify({ sw: sw.n, done, ledgerDelta: l1.n - l0.n, ev: ev.n, helperAuth: helperAuth.code, helperSvc: helperSvc.code, frozen: frozen.ok ? frozen.rows[0].r : frozen.code }));
    });

    // ---------------- C-2 coins ON (inside the transaction only)
    await chunk(async () => {
      await clean();
      await q(`insert into public.premium_system_configs (config_domain, config_key, is_enabled, config_value) values ('GLOBAL', 'COINS_LESSON_EARN', true, '{"value": true}')`);
      // today's lesson coins start at 0 for the student (inside the transaction)
      await q(`delete from public.gamification_events where user_id = $1 and event_type = 'LESSON_COMPLETED'`, [ids.student]);
      await q(`update public.coin_wallets set is_locked = false where user_id = $1`, [ids.student]);
      const [w0] = await q(`select coalesce((select current_balance from public.coin_wallets where user_id = $1), 0) b`, [ids.student]);
      await evidence(true);
      const done = await complete(STU);
      const [w1] = await q(`select current_balance b, lifetime_earned e from public.coin_wallets where user_id = $1`, [ids.student]);
      const led = await q(`select amount, direction, balance_after, source_type, idempotency_key from public.coin_ledger where user_id = $1 and source_id = $2`, [ids.student, DOC]);
      const [ev] = await q(`select reward_status, actual_coins_awarded a, reason_code from public.gamification_events where idempotency_key = $1`, [`lesson_completed:${ids.student}:${DOC}`]);
      const replay = await complete(STU);
      const [direct] = await q(`select public.fn_lesson__award_coins($1, $2, true) r`, [ids.student, DOC]);
      const [ledN] = await q(`select count(*)::int n from public.coin_ledger where user_id = $1 and source_id = $2`, [ids.student, DOC]);
      // daily cap: 95 coins already today → the next lesson pays 5; yesterday's coins (India day) do not count
      await q(`insert into public.gamification_events (user_id, event_type, source_type, idempotency_key, reward_status, actual_coins_awarded, occurred_at)
               values ($1, 'LESSON_COMPLETED', 'LESSON', 'zz-c2-yesterday', 'REWARDED', 100, (date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata') - interval '1 second'),
                      ($1, 'LESSON_COMPLETED', 'LESSON', 'zz-c2-today', 'REWARDED', 80, now())`, [ids.student]);
      const doc2 = '00000000-0000-4000-8000-0000000c0002';
      const [cap] = await q(`select public.fn_lesson__award_coins($1, $2::uuid, true) r`, [ids.student, doc2]);
      const doc3 = '00000000-0000-4000-8000-0000000c0003';
      const [full] = await q(`select public.fn_lesson__award_coins($1, $2::uuid, true) r`, [ids.student, doc3]);
      // negative control: the cap raised → the same call pays in full
      await q(`update public.reward_policies set eligibility_rules = eligibility_rules || '{"daily_coin_cap": 1000}' where policy_code = 'LESSON_COMPLETED'`);
      const doc4 = '00000000-0000-4000-8000-0000000c0004';
      const [ctl] = await q(`select public.fn_lesson__award_coins($1, $2::uuid, true) r`, [ids.student, doc4]);
      await q(`update public.coin_wallets set is_locked = true where user_id = $1`, [ids.student]);
      const doc5 = '00000000-0000-4000-8000-0000000c0005';
      const [locked] = await q(`select public.fn_lesson__award_coins($1, $2::uuid, true) r`, [ids.student, doc5]);
      const [lockedLedger] = await q(`select count(*)::int n from public.coin_ledger where user_id = $1 and source_id = $2::uuid`, [ids.student, doc5]);
      chk('C-2a switch ON: +15 (10 + 5, all first attempts right) via the canonical ledger — event REWARDED, one CREDIT (balance_after = wallet), wallet + lifetime updated',
        done && done.completed && done.coins_awarded === 15 && w1.b === Number(w0.b) + 15 && led.length === 1 && led[0].amount === 15 && led[0].direction === 'CREDIT'
          && led[0].balance_after === w1.b && led[0].source_type === 'LESSON' && led[0].idempotency_key === `ledger_lesson_completed:${ids.student}:${DOC}` && ev.reward_status === 'REWARDED' && ev.a === 15,
        JSON.stringify({ done, w0: w0.b, w1, led: led.map((x) => ({ ...x, idempotency_key: x.idempotency_key.startsWith('ledger_lesson_completed:') })), ev }));
      chk('C-2b replay: completion "already" pays 0; a direct second award → ALREADY_AWARDED; still exactly one ledger row',
        replay && replay.already === true && replay.coins_awarded === 0 && direct.r.reason === 'ALREADY_AWARDED' && ledN.n === 1,
        JSON.stringify({ replay, direct: direct.r, ledger: ledN.n }));
      chk('C-2c daily cap 100 (India day): 15 + 80 today → next pays 5 (DAILY_CAP), then 0; yesterday\'s 100 not counted; NEGATIVE CONTROL cap 1000 → 15; locked wallet → 0 (WALLET_LOCKED), no ledger row',
        cap.r.coins_awarded === 5 && cap.r.reason === 'DAILY_CAP' && full.r.coins_awarded === 0 && full.r.reason === 'DAILY_CAP' && ctl.r.coins_awarded === 15 && ctl.r.reason === 'STANDARD'
          && locked.r.coins_awarded === 0 && locked.r.reason === 'WALLET_LOCKED' && lockedLedger.n === 0,
        JSON.stringify({ cap: cap.r, full: full.r, control: ctl.r, locked: locked.r, lockedLedger: lockedLedger.n }));
    });
  } catch (e) {
    flush();
    console.log('ERROR', String(e.message).slice(0, 300));
    ok = false;
  } finally {
    await c.end().catch(() => {});
  }
  console.log(ok ? `COURSE-UX-1 live${PRE ? ' (--pre, rolled back)' : ''}: ALL PASS` : `COURSE-UX-1 live${PRE ? ' (--pre)' : ''}: FAILURES`);
  process.exit(ok ? 0 : 1);
})();
