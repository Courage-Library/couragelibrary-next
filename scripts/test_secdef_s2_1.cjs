/**
 * SECDEF-S2-1 (SECDEF-AUDIT F-1) — fn_finalize_battle_room verifies its caller (migration 089).
 *
 * Live (couragelibrary-next, verified TLS; every write inside a transaction that is rolled back; JWT claims of the
 * permanent QA identities, no account creation):
 *   S-1 static: the live body equals the audited definition plus ONLY the caller guard (byte-for-byte); ACL unchanged
 *       (authenticated + service_role EXECUTE, no anon / PUBLIC); SECURITY DEFINER; search_path pinned
 *   S-2 non-participant (qa-staff) → 42501 BATTLE_FINALIZE_FORBIDDEN; room / participants / ELO stats / coins unchanged
 *   S-3 participant (qa-student) → finalizes exactly as the audited definition does: same result and the same rows
 *       (both definitions run on the same fixture in savepoints; volatile timestamps / generated ids excluded)
 *   S-4 service role → allowed (finalizes)
 *   S-5 anon → no EXECUTE: SQL 42501 and PostgREST 401 / 42501
 *   S-6 already-finalized room: participant → same result as before (ALREADY_COMPLETED); non-participant → 42501
 *   S-7 the other battle RPCs granted to authenticated already check participation (or are join / create by design)
 *
 * Run: node scripts/test_secdef_s2_1.cjs
 */
const { safeBegin } = require('./db/live-safety.cjs'); // LIVE-LOCK-SWEEP: the one safe BEGIN (timeouts + rollback on stop)
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const { ROOT, dbTarget, readEnv } = require('./db/_db-env.cjs');

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try { const info = await fn(); passed++; console.log(`  PASS  ${name}${info ? ' — ' + info : ''}`); } catch (e) { failed++; console.log(`  FAIL  ${name}\n        ${String(e && e.message ? e.message : e).slice(0, 1200)}`); }
}
const assert = (c, m) => { if (!c) throw new Error(m || 'assertion failed'); };
const FN = 'public.fn_finalize_battle_room(uuid)';
const ROOM = '33333333-3333-4333-8333-0000000000b1';

(async () => {
  console.log('SECDEF-S2-1 fn_finalize_battle_room caller check');
  const c = new Client({ ...dbTarget().pg });
  c.on('error', () => {});
  await c.connect();
  const q = async (s, p) => (await c.query(s, p)).rows;
  const ids = Object.fromEntries((await q(`SELECT email, id FROM auth.users WHERE email IN ('qa-student@courage-library.test','qa-staff@courage-library.test','qa-admin@courage-library.test')`)).map((r) => [r.email.split('@')[0], r.id]));
  assert(ids['qa-student'] && ids['qa-staff'] && ids['qa-admin'], 'QA identities missing');
  const STUDENT = ids['qa-student'];
  const ADMIN = ids['qa-admin'];
  const STAFF = ids['qa-staff'];
  const rollbackSql = fs.readFileSync(path.join(ROOT, 'docs/database/rollback/089_rollback.sql'), 'utf8');
  const audited = rollbackSql.slice(rollbackSql.indexOf('$function$') + 10, rollbackSql.lastIndexOf('$function$'));

  const tx = async (fn) => {
    await safeBegin(c);
    try { return await fn(); } finally { await c.query('ROLLBACK').catch(() => {}); }
  };
  const as = async (role, sub) => {
    await c.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify(sub ? { sub, role } : { role })]);
    await c.query(`SET LOCAL ROLE ${role}`);
  };
  /** an EXPIRED 1v1 room (skips the final-round check) with qa-student and qa-admin as participants; status optional */
  const fixture = async (status = 'EXPIRED') => {
    const qids = (await q(`SELECT id FROM public.questions WHERE status = 'published' ORDER BY id LIMIT 3`)).map((r) => r.id);
    assert(qids.length === 3, 'need 3 published questions for the room fixture');
    // total_rounds must be 3 … 20 (check constraint); EXPIRED skips the "final round complete" check
    await q(`INSERT INTO public.quiz_battle_rooms (id, room_code, battle_type, created_by_user_id, is_private, max_participants, total_rounds, time_per_question_seconds, question_ids, status, current_round, access_tier)
             VALUES ($1, 'S21T01', '1v1', $2, true, 2, 3, 15, $3::uuid[], $4, 1, 'FREE')`, [ROOM, STUDENT, qids, status]);
    await q(`INSERT INTO public.quiz_battle_participants (room_id, user_id, is_ready, final_score, total_time_ms) VALUES ($1, $2, true, 3, 9000), ($1, $3, true, 1, 12000)`, [ROOM, STUDENT, ADMIN]);
  };
  /** state the function writes, minus volatile columns */
  const snapshot = async () => JSON.stringify(await q(`SELECT
      (SELECT to_jsonb(r) - 'updated_at' - 'created_at' - 'round_started_at' - 'round_ends_at' FROM public.quiz_battle_rooms r WHERE r.id = $1) room,
      (SELECT jsonb_agg(to_jsonb(p) - 'id' - 'updated_at' - 'created_at' - 'joined_at' ORDER BY p.user_id) FROM public.quiz_battle_participants p WHERE p.room_id = $1) parts,
      (SELECT jsonb_agg(to_jsonb(s) - 'updated_at' - 'created_at' - 'last_battle_at' ORDER BY s.user_id) FROM public.user_battle_stats s WHERE s.user_id = ANY($2)) stats,
      (SELECT count(*)::int FROM public.coin_ledger WHERE user_id = ANY($2)) coins,
      (SELECT count(*)::int FROM public.gamification_events WHERE user_id = ANY($2)) gam,
      (SELECT count(*)::int FROM public.learning_activity_events WHERE user_id = ANY($2)) lae`, [ROOM, [STUDENT, ADMIN, STAFF]]));
  const call = async () => (await q(`SELECT ${FN.replace('(uuid)', '')}($1) r`, [ROOM]))[0].r;
  const attempt = async (fn) => { await c.query('SAVEPOINT a'); try { const r = await fn(); await c.query('RELEASE SAVEPOINT a'); return { r }; } catch (e) { await c.query('ROLLBACK TO SAVEPOINT a'); return { e }; } };

  try {
    await test('S-1 static: live body = audited definition + only the caller guard; ACL / DEFINER / search_path unchanged', async () => {
      const f = (await q(`SELECT p.prosrc, p.prosecdef, p.proconfig, has_function_privilege('authenticated', p.oid, 'EXECUTE') auth_x, has_function_privilege('service_role', p.oid, 'EXECUTE') svc_x,
          has_function_privilege('anon', p.oid, 'EXECUTE') anon_x, EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE') public_x
        FROM pg_proc p WHERE p.oid = $1::regprocedure`, [FN]))[0];
      const guardAt = f.prosrc.indexOf('    -- SECDEF-S2-1 (F-1)');
      const guardEnd = f.prosrc.indexOf('    END IF;\n\n', guardAt) + '    END IF;\n\n'.length;
      assert(guardAt > 0 && guardEnd > guardAt, 'caller guard not found in the live body');
      assert(f.prosrc.slice(0, guardAt) + f.prosrc.slice(guardEnd) === audited, 'live body differs from the audited definition outside the guard');
      assert(f.prosecdef && (f.proconfig || []).includes('search_path=public, pg_temp') && f.auth_x && f.svc_x && !f.anon_x && !f.public_x, JSON.stringify({ ...f, prosrc: undefined }));
      return `guard ${guardEnd - guardAt} chars; rest byte-identical (${audited.length} chars)`;
    });

    await test('S-2 non-participant (qa-staff) → 42501 BATTLE_FINALIZE_FORBIDDEN; nothing written', async () => tx(async () => {
      await fixture();
      const before = await snapshot();
      await as('authenticated', STAFF);
      const out = await attempt(call);
      await c.query('RESET ROLE');
      assert(out.e && out.e.code === '42501' && /BATTLE_FINALIZE_FORBIDDEN/.test(out.e.message), `expected 42501, got ${out.e ? out.e.code + ' ' + out.e.message : JSON.stringify(out.r)}`);
      assert((await snapshot()) === before, 'rows changed after a refused call');
      return '42501; room / participants / ELO / coins / events unchanged';
    }));

    await test('S-3 participant (qa-student) → finalizes exactly as the audited definition (result + rows)', async () => tx(async () => {
      await fixture();
      const run = async (restoreAudited) => {
        await c.query('SAVEPOINT run');
        if (restoreAudited) await c.query(rollbackSql.replace(/^--.*$/gm, ''));
        await as('authenticated', STUDENT);
        const r = await call();
        await c.query('RESET ROLE');
        const snap = await snapshot();
        await c.query('ROLLBACK TO SAVEPOINT run');
        return { r, snap };
      };
      const now = await run(false);
      const before = await run(true);
      assert(now.r && now.r.success === true, `finalize failed: ${JSON.stringify(now.r)}`);
      assert(JSON.stringify(now.r) === JSON.stringify(before.r), `result differs: ${JSON.stringify(now.r)} vs ${JSON.stringify(before.r)}`);
      assert(now.snap === before.snap, 'rows differ between the new and the audited definition');
      return `same result (${JSON.stringify(now.r).slice(0, 90)}…) and same rows`;
    }));

    await test('S-4 service role → allowed (finalizes)', async () => tx(async () => {
      await fixture();
      await as('service_role');
      const out = await attempt(call);
      await c.query('RESET ROLE');
      assert(out.r && out.r.success === true, `service role: ${out.e ? out.e.code + ' ' + out.e.message : JSON.stringify(out.r)}`);
      const room = (await q(`SELECT status FROM public.quiz_battle_rooms WHERE id = $1`, [ROOM]))[0];
      assert(room.status === 'COMPLETED', `room status ${room.status}`);
      return 'finalized; room COMPLETED';
    }));

    await test('S-5 anon → no EXECUTE (SQL 42501; PostgREST 401 / 42501)', async () => {
      const sql = await tx(async () => { await as('anon'); const out = await attempt(call); return out.e ? out.e.code : 'ALLOWED'; });
      assert(sql === '42501', `SQL as anon: ${sql}`);
      const env = readEnv();
      const key = env('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY') || env('NEXT_PUBLIC_SUPABASE_ANON_KEY');
      let r = null;
      for (let i = 1; i <= 3 && !r; i++) r = await fetch(`${env('NEXT_PUBLIC_SUPABASE_URL')}/rest/v1/rpc/fn_finalize_battle_room`, { method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_room_id: '00000000-0000-0000-0000-000000000000' }), signal: AbortSignal.timeout(20000) }).catch(() => null);
      const body = r ? await r.json().catch(() => ({})) : {};
      assert(r && (r.status === 401 || r.status === 403) && body.code === '42501', `PostgREST as anon: ${r ? r.status + ' ' + body.code : 'no response'}`);
      return `SQL 42501; REST ${r.status} ${body.code}`;
    });

    await test('S-6 already-finalized room: participant → same as before (ALREADY_COMPLETED); non-participant → 42501', async () => tx(async () => {
      await fixture('COMPLETED');
      const run = async (restoreAudited, who) => {
        await c.query('SAVEPOINT run');
        if (restoreAudited) await c.query(rollbackSql.replace(/^--.*$/gm, ''));
        await as('authenticated', who);
        const out = await attempt(call);
        await c.query('RESET ROLE');
        await c.query('ROLLBACK TO SAVEPOINT run');
        return out;
      };
      const now = await run(false, STUDENT);
      const before = await run(true, STUDENT);
      assert(now.r && JSON.stringify(now.r) === JSON.stringify(before.r) && now.r.status === 'ALREADY_COMPLETED', `participant: ${JSON.stringify(now.r)} vs ${JSON.stringify(before.r)}`);
      const outsider = await run(false, STAFF);
      assert(outsider.e && outsider.e.code === '42501', `non-participant: ${outsider.e ? outsider.e.code : JSON.stringify(outsider.r)}`);
      return 'participant ALREADY_COMPLETED (unchanged); non-participant 42501';
    }));

    await test('S-7 other battle RPCs granted to authenticated check participation (or are join / create by design)', async () => {
      const defs = Object.fromEntries((await q(`SELECT p.oid::regprocedure::text sig, p.prosrc FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef AND p.proname LIKE '%battle%' AND has_function_privilege('authenticated', p.oid, 'EXECUTE')`)).map((r) => [r.sig, r.prosrc]));
      const expect = {
        'fn_get_active_battle_round(uuid)': /fn_is_battle_participant\(p_room_id, v_user_id\)/,
        'fn_submit_battle_round_answer(uuid,integer,uuid)': /quiz_battle_participants WHERE room_id = p_room_id AND user_id = v_user_id/,
        'fn_join_battle_by_code(text)': /v_user_id UUID := auth\.uid\(\)/,
        'fn_find_or_create_battle_room(uuid,boolean,text)': /v_user_id UUID := auth\.uid\(\)/,
        'fn_is_battle_participant(uuid,uuid)': /quiz_battle_participants/,
        'fn_finalize_battle_room(uuid)': /BATTLE_FINALIZE_FORBIDDEN/,
      };
      const unknown = Object.keys(defs).filter((s) => !expect[s]);
      assert(unknown.length === 0, `unreviewed battle RPC granted to authenticated: ${unknown.join(', ')}`);
      const bad = Object.entries(expect).filter(([s, re]) => !defs[s] || !re.test(defs[s])).map(([s]) => s);
      assert(bad.length === 0, `check missing in: ${bad.join(', ')}`);
      return `${Object.keys(defs).length} battle RPCs reviewed`;
    });
  } finally {
    await c.end().catch(() => {});
  }
  console.log(`\nSECDEF-S2-1: ${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('SUITE ERROR', e && e.code ? `error code ${e.code}` : String(e && e.message).slice(0, 200)); process.exit(1); });
