#!/usr/bin/env node
/**
 * ADMIN-UX-1 Q2 (architect 2026-10-26) — live check of the two admin fixes, AS THE REAL ROLES. Every write is inside a
 * rolled-back transaction (LIVE-LOCK-SAFETY); synthetic rows only; no e-mail or id is printed.
 *   D1-L1 service_role (the role the guarded admin action uses) moves a PENDING flag to RESOLVED_REMOVED +
 *         CONTENT_REMOVED (canonical CHECK values) and soft-deletes the flagged message; moderated_by / at are set
 *   D1-L2 a second decision on the same flag changes nothing (PENDING-only update → 0 rows); DISMISSED maps to
 *         RESOLVED_DISMISSED and leaves the content alone; resolving a THREAD flag locks the thread
 *   D1-L3 clients cannot moderate: authenticated (the QA student) updates 0 rows / is refused; anon is refused; the
 *         legacy table community_moderation_flags does not exist
 *   D2-L1 the service-role directory pages beyond 50 (listUsers page / perPage honoured; total = auth.users count)
 *   D2-L2 the old path is broken by design: auth.admin.listUsers with the anon (cookie) key is refused
 * Run: node scripts/live/test_admin_d1_d2.cjs
 */
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
if (typeof globalThis.WebSocket === 'undefined') globalThis.WebSocket = class DummyWebSocket {};
const { Client } = require('pg');
const { createClient } = require('@supabase/supabase-js');
const { readEnv, dbTarget } = require(path.join(ROOT, 'scripts/db/_db-env.cjs'));
const { withLiveTransaction } = require(path.join(ROOT, 'scripts/db/live-safety.cjs'));

let passed = 0;
let failed = 0;
const result = (ok, name, info) => {
  if (ok) passed++; else failed++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !info ? '' : ' — ' + info}`);
};

// the exact statements resolveCommunityFlagAction sends (PostgREST → SQL), run as service_role
const DECIDE = `update public.discussion_moderation_flags set status = $2, resolution_action = $3, moderated_by_user_id = $4, moderated_at = now()
                 where id = $1 and status = 'PENDING' returning id, target_type, target_id`;

(async () => {
  const env = readEnv();
  const c = new Client(dbTarget().pg);
  c.on('error', () => {});
  await c.connect();
  try {
    const q = async (s, p) => (await c.query(s, p)).rows;
    const ids = {};
    for (const [k, e] of [['admin', 'qa-admin@courage-library.test'], ['staff', 'qa-staff@courage-library.test'], ['student', 'qa-student@courage-library.test']]) ids[k] = (await q(`select id from auth.users where email = $1`, [e]))[0]?.id;
    const as = async (role, claims, sql, params) => {
      await c.query('savepoint s');
      await c.query(`set local role ${role}`);
      await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
      try {
        const r = await c.query(sql, params);
        await c.query('reset role');
        await c.query('release savepoint s');
        return { ok: true, rows: r.rows, n: r.rowCount };
      } catch (e) {
        await c.query('rollback to savepoint s');
        return { ok: false, code: e.code };
      }
    };

    await withLiveTransaction(c, async () => {
      const [qn] = await q(`select id from public.questions limit 1`);
      const [t] = await q(`insert into public.discussion_threads (context_type, question_id, author_id, title) values ('QUESTION', $1, $2, 'D-1 live check thread') returning id`, [qn.id, ids.student]);
      const [m] = await q(`insert into public.discussion_messages (thread_id, author_id, content_markdown) values ($1, $2, 'D-1 live check message') returning id`, [t.id, ids.student]);
      const [fm] = await q(`insert into public.discussion_moderation_flags (target_type, target_id, reported_by_user_id, reason) values ('MESSAGE', $1, $2, 'SPAM') returning id`, [m.id, ids.staff]);
      const [ft] = await q(`insert into public.discussion_moderation_flags (target_type, target_id, reported_by_user_id, reason) values ('THREAD', $1, $2, 'OTHER') returning id`, [t.id, ids.staff]);
      const [fd] = await q(`insert into public.discussion_moderation_flags (target_type, target_id, reported_by_user_id, reason) values ('MESSAGE', $1, $2, 'DUPLICATE') returning id`, [m.id, ids.admin]);
      const SVC = { role: 'service_role' };

      // D1-L1
      const r1 = await as('service_role', SVC, DECIDE, [fm.id, 'RESOLVED_REMOVED', 'CONTENT_REMOVED', ids.admin]);
      const rm = await as('service_role', SVC, `update public.discussion_messages set is_deleted = true, deleted_at = now() where id = $1`, [m.id]);
      const [after] = await q(`select f.status, f.resolution_action, f.moderated_by_user_id = $2 by_admin, f.moderated_at is not null at_set, m.is_deleted from public.discussion_moderation_flags f join public.discussion_messages m on m.id = f.target_id where f.id = $1`, [fm.id, ids.admin]);
      result(r1.ok && r1.n === 1 && rm.ok && after.status === 'RESOLVED_REMOVED' && after.resolution_action === 'CONTENT_REMOVED' && after.by_admin && after.at_set && after.is_deleted,
        'D1-L1 service_role resolves a PENDING flag on the canonical table (RESOLVED_REMOVED + CONTENT_REMOVED) and soft-deletes the message', JSON.stringify({ r1: r1.n, code: r1.code }));

      // D1-L2
      const again = await as('service_role', SVC, DECIDE, [fm.id, 'RESOLVED_DISMISSED', 'DISMISSED', ids.admin]);
      const dis = await as('service_role', SVC, DECIDE, [fd.id, 'RESOLVED_DISMISSED', 'DISMISSED', ids.admin]);
      const thr = await as('service_role', SVC, DECIDE, [ft.id, 'RESOLVED_REMOVED', 'CONTENT_REMOVED', ids.admin]);
      const lock = await as('service_role', SVC, `update public.discussion_threads set status = 'LOCKED', updated_at = now() where id = $1`, [t.id]);
      const [st] = await q(`select (select status from public.discussion_moderation_flags where id = $1) fm, (select status from public.discussion_moderation_flags where id = $2) fd, (select status from public.discussion_threads where id = $3) th`, [fm.id, fd.id, t.id]);
      result(again.ok && again.n === 0 && st.fm === 'RESOLVED_REMOVED' && dis.n === 1 && st.fd === 'RESOLVED_DISMISSED' && thr.n === 1 && lock.ok && st.th === 'LOCKED',
        'D1-L2 a second decision changes nothing (PENDING-only); DISMISSED → RESOLVED_DISMISSED; a THREAD flag locks the thread', JSON.stringify({ again: again.n, st }));

      // D1-L3
      const [fp] = await q(`insert into public.discussion_moderation_flags (target_type, target_id, reported_by_user_id, reason) values ('THREAD', $1, $2, 'SPAM') returning id`, [t.id, ids.admin]);
      const stu = await as('authenticated', { sub: ids.student, role: 'authenticated', aal: 'aal1' }, `update public.discussion_moderation_flags set status = 'RESOLVED_DISMISSED' where id = $1`, [fp.id]);
      const ano = await as('anon', { role: 'anon' }, `update public.discussion_moderation_flags set status = 'RESOLVED_DISMISSED' where id = $1`, [fp.id]);
      const [still] = await q(`select status, to_regclass('public.community_moderation_flags') is null legacy_gone from public.discussion_moderation_flags where id = $1`, [fp.id]);
      result(((!stu.ok && stu.code === '42501') || (stu.ok && stu.n === 0)) && !ano.ok && still.status === 'PENDING' && still.legacy_gone,
        'D1-L3 the QA student / anon cannot moderate; the legacy table does not exist', JSON.stringify({ stu, ano: ano.code, still }));
    });

    const [{ n: authCount }] = await q(`select count(*)::int n from auth.users`);
    const noSession = { auth: { persistSession: false, autoRefreshToken: false } };
    const URL_ = env('NEXT_PUBLIC_SUPABASE_URL');
    const svc = createClient(URL_, env('SUPABASE_SERVICE_ROLE_KEY'), noSession);
    const p1 = await svc.auth.admin.listUsers({ page: 1, perPage: 2 });
    const p2 = await svc.auth.admin.listUsers({ page: 2, perPage: 2 });
    const overlap = (p1.data?.users || []).some((u) => (p2.data?.users || []).some((v) => v.id === u.id));
    result(!p1.error && !p2.error && p1.data.total === authCount && p1.data.users.length === Math.min(2, authCount) && (authCount <= 2 || (p2.data.users.length > 0 && !overlap)),
      `D2-L1 service-role directory pages correctly (total = auth.users count; page 2 ≠ page 1; the old call had no paging)`, JSON.stringify({ e1: p1.error?.code, e2: p2.error?.code, total: p1.data?.total, authCount }));
    const anonKey = env('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY') || env('NEXT_PUBLIC_SUPABASE_ANON_KEY');
    const anon = createClient(URL_, anonKey, noSession);
    const bad = await anon.auth.admin.listUsers({ page: 1, perPage: 1 });
    result(!!bad.error && !(bad.data?.users || []).length, 'D2-L2 auth.admin.listUsers with the anon / cookie key is refused (why the old users page was empty)', JSON.stringify({ status: bad.error?.status }));
  } catch (e) {
    failed++;
    console.log('  FAIL  ERROR', e.code || '', String(e.message).slice(0, 200));
  } finally {
    await c.end().catch(() => {});
  }
  console.log(`\nADMIN D1/D2 live: ${passed}/${passed + failed} passed (rolled back)`);
  process.exit(failed ? 1 : 0);
})();
