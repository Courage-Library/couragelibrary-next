/**
 * SEC-HOTFIX-4 — admin/staff-only RLS on the content-authoring tables of migration 076 (10 since GAP2-4c retired
 *   taxonomy_aliases to schema retired, migration 084).
 *
 * DB suite, couragelibrary-next only (ref guard + verified TLS via scripts/db/_db-env.cjs). Every scenario runs inside
 * BEGIN … ROLLBACK; nothing is persisted. To test the POLICY (not the grants), each table temporarily GRANTs
 * INSERT/UPDATE/DELETE to authenticated inside the rolled-back transaction.
 *
 *   P-1 static: no FOR ALL policy; every INSERT/UPDATE/DELETE policy and every authenticated SELECT policy on the 10
 *       tables is gated by fn_jwt_is_admin_or_staff(); the public read policies are unchanged
 *   P-2 student session (authenticated, no role): reads only what anon reads; UPDATE/DELETE affect 0 rows;
 *       INSERT is rejected by row-level security
 *   P-3 staff session (app_metadata.role = staff): reads every row; UPDATE reaches every row (policy path intact)
 *   P-4 grants unchanged: authenticated holds SELECT only (writes stay service-role only)
 *   P-6 PERMANENT RULE (whole public schema): no policy may give authenticated (or PUBLIC) blanket access, i.e.
 *       USING (true) / WITH CHECK (true), on non-public data. Blanket write policies always fail; blanket read
 *       policies are allowed only on the explicit PUBLIC_REFERENCE allow-list (or PENDING_RULING, reported loudly)
 *   P-6b (SEC-SITE-MEDIA-1, owner ruling 2026-11-02): every PUBLIC_REFERENCE table (blanket public read by design) has
 *       NO personal column (e-mail / phone / names / user or actor ids / *_by / owner / author / IP / address / birth
 *       date) — an allow-listed table can never publish personal data; negative control on a fixture
 *   P-6c (SEC-PII-SWEEP-2, owner ruling 2026-11-02) REAL ROLE: anon reads NO user id anywhere in public — every column
 *       named like a user / actor id (user_id, *_user_id, author_id, created_by, reviewed_by, published_by, …) returns
 *       no non-null value to SET ROLE anon (a missing grant counts as safe); the legacy mock_tests policy is gone;
 *       negative control: a fixture table with an anon-granted author_id, created inside the rolled-back transaction, fires
 *   P-6d (owner ruling 2026-11-02, PUBLIC IDENTITY = USERNAME) REAL ROLE: the QA student cannot read ANOTHER user's
 *       name / e-mail / phone — a marker set on another user's profile (rolled back) is invisible; every other
 *       name / e-mail / phone column in public returns no non-null value to the student except on its own rows
 *       (user_profiles.id = self); negative controls: a leaky policy on user_profiles and a granted fixture e-mail column fire
 *   P-7 SEC-HOTFIX-5 (077): leaderboard_weekly_snapshots / user_battle_stats are own-rows-only for students,
 *       anon cannot read the leaderboard; behaviour probed with two real users inside a rolled-back transaction
 *   P-8 GAP2-4a syllabus: no direct writes for students / staff (grants), anon cannot EXECUTE write RPCs, students are
 *       denied (42501), staff create / edit DRAFTs but cannot publish / archive, admin publishes, PUBLISHED rows are
 *       immutable on the owner path except PUBLISHED → ARCHIVED (rolled back; QA staff / admin ids as JWT subjects)
 *   P-9 PERMANENT RULE (SEC-HOTFIX-6, 082): no SECURITY DEFINER function in public is EXECUTE-able by anon or PUBLIC
 *       and every one pins search_path — unless it is on the reviewed SECDEF_PUBLIC_OK allow-list (one-line
 *       justification each; trigger functions are not callable through PostgREST) or on SECDEF_PENDING_RULING
 *       (MUST be empty since SEC-HOTFIX-7, 083). The service-role-only set (082 + 083) and the authenticated-only set
 *       (083 rulings 2 + 3) are asserted; the INC-3 lockdown set stays
 *       service-role only. Behaviour (rolled back): anon / student calls of the locked functions → 42501; the service
 *       role deletes a throwaway exam created inside the transaction through fn_delete_exam_controlled
 *
 * Run: node scripts/test_sec_hotfix4_rls.cjs
 */
require('./db/safe-net.cjs'); // SAFE-NET: masks IPs / hosts / e-mails / keys in all output (scripts/db/safe-net.cjs)
const { safeBegin } = require('./db/live-safety.cjs'); // LIVE-LOCK-SWEEP: the one safe BEGIN (timeouts + rollback on stop)
const crypto = require('crypto');
const { Client } = require('pg');
const { dbTarget } = require('./db/_db-env.cjs');

const TABLES = [
  'canonical_taxonomy_nodes',
  'exam_syllabus_versions', 'exam_syllabus_nodes', 'exam_syllabus_canonical_mappings',
  'exam_knowledge_documents', 'exam_doc_versions', 'exam_posts', 'exam_sources', 'exam_claims', 'exam_claim_sources',
];
// public read policies that must stay exactly as they were (name → USING expression), captured before 076
const PUBLIC_READ = {
  canonical_taxonomy_nodes: ['Public candidates can view active canonical taxonomy nodes', '(is_active = true)'],
  exam_syllabus_versions: ['Public candidates can view published exam syllabus versions', "((status = 'PUBLISHED'::text) AND (is_active = true))"],
  exam_knowledge_documents: ['Public candidates can view published exam knowledge documents', "((status = 'PUBLISHED'::text) AND (current_published_version_id IS NOT NULL))"],
  exam_doc_versions: ['Public candidates can view published exam doc versions', "((is_published = true) AND (review_status = 'PUBLISHED'::text))"],
  exam_posts: ['Public candidates can view active exam posts', '(is_active = true)'],
  exam_sources: ['Public candidates can view verified exam sources', "(verification_status = 'SOURCE_VERIFIED'::text)"],
  exam_claims: ['Public candidates can view verified exam claims', "(verification_status = 'VERIFIED'::text)"],
  exam_claim_sources: ['Public candidates can view claim sources', 'true'],
};
// P-6: tables whose rows are public by design (reference content, no user data). Additions need an architect ruling.
const PUBLIC_REFERENCE = new Set([
  'pattern_sections', 'exam_claim_sources', 'learning_unit_asset_bindings', // exam_topics, taxonomy_aliases: retired (GAP2-4c)
  'mistake_cognitive_types', 'exam_cutoff_benchmarks',
  // SEC-SITE-MEDIA-1 (owner ruling 2026-11-02): public images (brand assets 131, library photos 130), allowed ONLY together
  // with P-6b — after 132 they have image fields only (updated_by_email dropped; the actor is in admin_audit_logs)
  'site_media', 'site_gallery',
]);
// P-6b: column names that would make a public table publish personal data (entity names such as "name" of a topic are
// not personal; this rule applies to the blanket-read allow-list, where no such column may exist at all)
const PERSONAL_COLUMN = /(e_?mail|phone|mobile|whatsapp|full_?name|first_?name|last_?name|display_?name|user_?name|user_id|student_id|profile_id|actor|_by$|_by_|owner|author_id|reviewer|approver|ip_?addr|^ip$|address|birth|dob$|guardian)/i;
function personalColumns(cols) {
  return cols.filter((r) => PUBLIC_REFERENCE.has(r.t) && PERSONAL_COLUMN.test(r.c)).map((r) => `${r.t}.${r.c}`);
}
// P-6c: user / actor id columns (a person's id) — never readable by anon (SEC-PII-SWEEP-2)
const USER_ID_COLUMN = /^(user_id|student_id|profile_id|owner_id|author_id|actor_id|created_for_user_id|.*_user_id|.*_by|.*_by_id)$/i;
// P-6d: a person's name / e-mail / phone; OWN_COLUMN = how a table names its owner (own rows may be read)
const PERSON_COLUMN = /(full_?name|first_?name|last_?name|display_?name|e_?mail|phone|mobile|whatsapp)/i;
const OWN_COLUMN = { user_profiles: 'id' };
// P-6: per-user rows behind a blanket read policy, tolerated only until an architect ruling. Empty since
// SEC-HOTFIX-5 (077): leaderboard_weekly_snapshots and user_battle_stats are own-rows-only.
const PENDING_RULING = new Set([]);
// P-7 (SEC-HOTFIX-5): per-user stats tables, own rows only, never readable by anon
const OWN_ROWS = {
  leaderboard_weekly_snapshots: (u) => [`INSERT INTO public.leaderboard_weekly_snapshots (user_id, leaderboard_type, rank, week_start_date) VALUES ($1, 'WEEKLY_EFFORT', 1, current_date)`, [u]],
  user_battle_stats: (u) => [`INSERT INTO public.user_battle_stats (user_id) VALUES ($1)`, [u]],
};
const isTrue = (s) => /^\(*\s*true\s*\)*$/i.test(String(s || '').trim());
function blanketViolations(policies) {
  const bad = [];
  const pending = [];
  for (const p of policies) {
    if (!/authenticated|\{public\}/.test(p.roles)) continue;
    const readBlanket = p.cmd !== 'INSERT' && isTrue(p.qual);
    const writeBlanket = p.cmd !== 'SELECT' && (readBlanket || (p.cmd !== 'DELETE' && isTrue(p.wc)));
    if (writeBlanket) bad.push(`${p.t}: blanket ${p.cmd} policy "${p.policyname}"`);
    else if (readBlanket && PENDING_RULING.has(p.t)) pending.push(p.t);
    else if (readBlanket && !PUBLIC_REFERENCE.has(p.t)) bad.push(`${p.t}: blanket read on non-allow-listed table "${p.policyname}"`);
  }
  return { bad, pending };
}
// P-9 (SEC-HOTFIX-6): SECURITY DEFINER functions intentionally executable by anon / PUBLIC (reviewed)
const SECDEF_PUBLIC_OK = {
  fn_exam_syllabus_read_model: 'student syllabus read model: PUBLISHED rows only, read-only, search_path ""',
};
// P-9: SECURITY DEFINER functions awaiting an architect ruling — MUST stay empty (SEC-HOTFIX-7 ruled on all 14
// items of SEC_HOTFIX6_REPORT §2.3; a new exposure needs a ruling + a fix, never an entry here)
const SECDEF_PENDING_RULING = {};
// P-9: service_role only — INC-3 set (082) + SEC-HOTFIX-7 ruling 1 (083)
const SECDEF_LOCKED = ['fn_delete_exam_controlled', 'fn_authorize_and_start_test_attempt', 'fn_create_dynamic_mock_instance_atomic', 'fn_record_qualifying_streak_activity',
  'fn_award_gamification_reward', 'fn_claim_reward_item', 'fn_reverse_reward_claim', 'fn_check_premium_access_and_quota'];
// P-9: SEC-HOTFIX-7 rulings 2 + 3 (083) — authenticated + service_role, never anon / PUBLIC (internal auth checks /
// RLS predicates whose policies are all TO authenticated)
const SECDEF_AUTHENTICATED = ['fn_create_batch_assignment', 'fn_enroll_batch_student', 'fn_evaluate_descriptive_submission', 'fn_submit_descriptive_answer',
  'fn_get_batch_assignment_progress', 'fn_can_evaluate_submission', 'fn_has_batch_faculty_access', 'fn_is_batch_member', 'fn_is_institute_member'];
const STUDENT = { sub: '00000000-0000-4000-8000-0000000000a1', role: 'authenticated', app_metadata: {} };
const STAFF = { sub: '00000000-0000-4000-8000-0000000000b2', role: 'authenticated', app_metadata: { role: 'staff' } };

let passed = 0;
let failed = 0;
// QB-KEY-1: errors from the driver / network print their CODE only (a connect error message carries the pooler's IP /
// host). Assertion failures (our own messages, no code) print as before.
const errText = (e) => (e && e.code ? `error code ${e.code}` : String(e && e.message ? e.message : e));
async function test(name, fn) {
  try { const info = await fn(); passed++; console.log(`  PASS  ${name}${info ? ' — ' + info : ''}`); } catch (e) { failed++; console.log(`  FAIL  ${name}\n        ${errText(e).slice(0, 2500)}`); }
}
const assert = (c, m) => { if (!c) throw new Error(m || 'assertion failed'); };

(async () => {
  console.log('SEC-HOTFIX-4 staff-only RLS');
  const c = new Client({ ...dbTarget().pg, port: 6543 });
  c.on('error', () => {});
  await c.connect();
  const q = (sql, p) => c.query(sql, p);
  const as = async (claims, role = 'authenticated') => {
    await q(`SET LOCAL ROLE ${role}`);
    await q(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims || {})]);
  };
  // P-6c / P-6d: read every candidate column AS THE ROLE in ONE query (few round trips — the 30 s idle-in-transaction
  // guard of safeBegin must never end the session on a slow link). Columns the role holds no SELECT on are safe and
  // skipped (has_column_privilege); a batch error falls back to one probe per column. → { 'table.column': count | 'error' }
  const probeBatch = async (cols, roleName, setRole, ownFilter) => {
    const granted = (await q(`SELECT x.t, x.col FROM unnest($1::text[], $2::text[]) AS x(t, col)
                               WHERE has_column_privilege($3, format('public.%I', x.t), x.col, 'SELECT')`, [cols.map((r) => r.t), cols.map((r) => r.col), roleName])).rows;
    const one = ({ t, col }) => `SELECT '${t}.${col}' k, (SELECT count(*) FROM (SELECT 1 FROM public."${t}" WHERE "${col}" IS NOT NULL${ownFilter(t)} LIMIT 1) x)::int n`;
    const out = {};
    if (!granted.length) return out;
    await q('SAVEPOINT pb');
    try {
      await setRole();
      for (const r of (await q(granted.map(one).join(' UNION ALL '))).rows) out[r.k] = r.n;
      return out;
    } catch {
      await q('ROLLBACK TO SAVEPOINT pb');
      await q('RESET ROLE');
      for (const g of granted) {
        await q('SAVEPOINT pb1');
        try { await setRole(); out[`${g.t}.${g.col}`] = (await q(one(g))).rows[0].n; } catch (e) { out[`${g.t}.${g.col}`] = e.code === '42501' ? 0 : 'error'; }
        await q('ROLLBACK TO SAVEPOINT pb1');
        await q('RESET ROLE');
      }
      return out;
    } finally {
      await q('ROLLBACK TO SAVEPOINT pb').catch(() => {});
      await q('RESET ROLE').catch(() => {});
    }
  };
  try {
    await test('P-1 static: no FOR ALL policy; all authenticated policies gated by fn_jwt_is_admin_or_staff(); public reads unchanged', async () => {
      const { rows } = await q(`SELECT tablename t, policyname, cmd, roles::text roles, coalesce(qual,'') qual, coalesce(with_check,'') wc
                                FROM pg_policies WHERE schemaname='public' AND tablename = ANY($1)`, [TABLES]);
      const bad = [];
      for (const t of TABLES) {
        const ps = rows.filter((r) => r.t === t);
        if (ps.some((p) => p.cmd === 'ALL')) bad.push(`${t}: FOR ALL policy present`);
        for (const p of ps) {
          const authn = /authenticated/.test(p.roles);
          const write = ['INSERT', 'UPDATE', 'DELETE', 'ALL'].includes(p.cmd);
          const gated = (s) => /fn_jwt_is_admin_or_staff\(\)/.test(s);
          if (write && /\{public\}|anon/.test(p.roles)) bad.push(`${t}: write policy for public/anon "${p.policyname}"`);
          if (write && p.cmd !== 'INSERT' && !gated(p.qual)) bad.push(`${t}: ${p.cmd} USING not gated "${p.policyname}"`);
          if (write && p.cmd !== 'DELETE' && !gated(p.wc)) bad.push(`${t}: ${p.cmd} WITH CHECK not gated "${p.policyname}"`);
          if (p.cmd === 'SELECT' && authn && !gated(p.qual)) bad.push(`${t}: authenticated SELECT not gated "${p.policyname}"`);
        }
        for (const cmd of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) if (!ps.some((p) => p.cmd === cmd && /authenticated/.test(p.roles))) bad.push(`${t}: no admin/staff ${cmd} policy`);
        const pub = PUBLIC_READ[t];
        if (pub && !ps.some((p) => p.policyname === pub[0] && p.cmd === 'SELECT' && /\{public\}/.test(p.roles) && p.qual === pub[1])) bad.push(`${t}: public read policy changed or missing`);
      }
      assert(bad.length === 0, bad.join('\n        '));
      return `${rows.length} policies on ${TABLES.length} tables`;
    });

    const results = [];
    for (const t of TABLES) {
      await safeBegin(c);
      try {
        await q(`GRANT INSERT, UPDATE, DELETE ON public.${t} TO authenticated`); // test the POLICY; rolled back below
        const total = Number((await q(`SELECT count(*) n FROM public.${t}`)).rows[0].n);
        const col = (await q(`SELECT column_name c FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position LIMIT 1`, [t])).rows[0].c; // no-op update column
        const sample = (await q(`SELECT to_jsonb(x) j FROM public.${t} x LIMIT 1`)).rows[0];
        await q('SAVEPOINT s');
        await as({}, 'anon');
        const anonCount = Number((await q(`SELECT count(*) n FROM public.${t}`)).rows[0].n);
        await q('ROLLBACK TO SAVEPOINT s');
        await as(STUDENT);
        const stCount = Number((await q(`SELECT count(*) n FROM public.${t}`)).rows[0].n);
        // a write that RLS lets through either affects rows or fails on a constraint/trigger: both mean the row was reachable
        const probe = async (sql) => { await q('SAVEPOINT w'); try { const n = (await q(sql)).rowCount; await q('RELEASE SAVEPOINT w'); return n; } catch (e) { await q('ROLLBACK TO SAVEPOINT w'); return `REACHED(${e.code})`; } };
        const stUpd = await probe(`UPDATE public.${t} SET "${col}" = "${col}"`);
        const stDel = await probe(`DELETE FROM public.${t}`);
        await q('ROLLBACK TO SAVEPOINT s');
        // INSERT attempt as student (RLS WITH CHECK runs before constraint checks)
        let insert = 'n/a';
        await as(STUDENT);
        try {
          if (sample) {
            const row = { ...sample.j, id: crypto.randomUUID() };
            // only writable columns (generated / identity columns cannot be inserted — that would fail before RLS)
            const cols = (await q(`SELECT column_name c FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND is_generated='NEVER' AND identity_generation IS NULL ORDER BY ordinal_position`, [t])).rows.map((r) => `"${r.c}"`).join(', ');
            await q(`INSERT INTO public.${t} (${cols}) SELECT ${cols} FROM jsonb_populate_record(NULL::public.${t}, $1::jsonb)`, [JSON.stringify(row)]);
          } else {
            await q(`INSERT INTO public.${t} DEFAULT VALUES`);
          }
          insert = 'ALLOWED';
        } catch (e) {
          // BEFORE INSERT triggers run before RLS: a trigger error (P0001) is inconclusive and covered by P-1 + P-5
          insert = e.code === '42501' && /row-level security/i.test(e.message) ? 'DENIED_BY_RLS' : e.code === 'P0001' ? 'TRIGGER_FIRST' : `OTHER_ERROR ${e.code}`;
        }
        await q('ROLLBACK TO SAVEPOINT s');
        await as(STAFF);
        const sfCount = Number((await q(`SELECT count(*) n FROM public.${t}`)).rows[0].n);
        const sfUpd = await (async () => { await q('SAVEPOINT w'); try { const n = (await q(`UPDATE public.${t} SET "${col}" = "${col}"`)).rowCount; await q('RELEASE SAVEPOINT w'); return n; } catch (e) { await q('ROLLBACK TO SAVEPOINT w'); return `ERROR(${e.code})`; } })();
        await q('ROLLBACK TO SAVEPOINT s');
        results.push({ t, total, anonCount, stCount, stUpd, stDel, insert, sfCount, sfUpd });
      } finally {
        await q('ROLLBACK');
      }
    }

    await test('P-2 student session: reads only what anon reads; UPDATE/DELETE 0 rows; INSERT denied by RLS', async () => {
      const bad = results.filter((r) => r.stCount !== r.anonCount || r.stUpd !== 0 || r.stDel !== 0 || !['DENIED_BY_RLS', 'TRIGGER_FIRST'].includes(r.insert));
      assert(bad.length === 0, bad.map((r) => `${r.t}: read ${r.stCount}/${r.total} (anon ${r.anonCount}), update ${r.stUpd}, delete ${r.stDel}, insert ${r.insert}`).join('\n        '));
      const hidden = results.reduce((a, r) => a + (r.total - r.stCount), 0);
      const trig = results.filter((r) => r.insert === 'TRIGGER_FIRST').map((r) => r.t);
      // GATE-HYGIENE-1: an empty table proves nothing about UPDATE / DELETE reach — say so loudly
      const empty = results.filter((r) => r.total === 0).map((r) => r.t);
      if (empty.length) console.log(`  WARN  VACUOUS (0 rows): P-2 / P-3 row-reach not proven for ${empty.join(', ')}`);
      assert(results.length >= 1 && results.some((r) => r.total > 0), 'every RLS table is empty: P-2 / P-3 would be vacuous');
      return `${results.length} tables; ${hidden} non-public rows hidden from students; insert denied by RLS on ${results.length - trig.length}${trig.length ? `, trigger-first on ${trig.join(', ')} (see P-5)` : ''}`;
    });

    await test('P-3 staff session: reads every row and UPDATE reaches every row', async () => {
      // staff UPDATE must reach every row: affected = total, or a trigger/constraint error (anything but RLS 42501)
      const reached = (r) => r.sfUpd === r.total || (typeof r.sfUpd === 'string' && !/42501/.test(r.sfUpd));
      const bad = results.filter((r) => r.sfCount !== r.total || !reached(r));
      assert(bad.length === 0, bad.map((r) => `${r.t}: staff read ${r.sfCount}/${r.total}, update ${r.sfUpd}`).join('\n        '));
    });

    await test('P-5 policy predicate: fn_jwt_is_admin_or_staff() false for a student, true for staff / admin; not executable by anon (policies are TO authenticated)', async () => {
      const out = {};
      out.anonCanExecute = (await q("SELECT has_function_privilege('anon', 'public.fn_jwt_is_admin_or_staff()', 'EXECUTE') v")).rows[0].v;
      for (const [k, claims, role] of [['student', STUDENT, 'authenticated'], ['staff', STAFF, 'authenticated'], ['admin', { ...STAFF, app_metadata: { role: 'admin' } }, 'authenticated']]) {
        await safeBegin(c, { readOnly: true });
        try { await as(claims, role); out[k] = (await q('SELECT public.fn_jwt_is_admin_or_staff() v')).rows[0].v; } finally { await q('ROLLBACK'); }
      }
      assert(out.student === false && out.staff === true && out.admin === true && out.anonCanExecute === false, JSON.stringify(out));
      return JSON.stringify(out);
    });

    await test('P-4 grants unchanged: authenticated holds SELECT only on the 10 tables', async () => {
      const { rows } = await q(`SELECT table_name t, string_agg(privilege_type, ',' ORDER BY privilege_type) p FROM information_schema.role_table_grants
                                WHERE table_schema='public' AND grantee='authenticated' AND table_name = ANY($1) GROUP BY 1`, [TABLES]);
      const bad = TABLES.filter((t) => (rows.find((r) => r.t === t) || {}).p !== 'SELECT');
      assert(bad.length === 0, bad.map((t) => `${t}: ${(rows.find((r) => r.t === t) || {}).p}`).join(', '));
    });

    await test('P-6 permanent rule: no blanket (USING/WITH CHECK true) policy for authenticated/PUBLIC on non-public data (whole schema)', async () => {
      // self-test: the pre-076 policy shape and a blanket read on user data must both be caught
      const fixture = blanketViolations([
        { t: 'exam_sources', policyname: 'fixture', cmd: 'ALL', roles: '{authenticated}', qual: 'true', wc: 'true' },
        { t: 'user_profiles', policyname: 'fixture-read', cmd: 'SELECT', roles: '{authenticated}', qual: '(true)', wc: '' },
      ]);
      assert(fixture.bad.length === 2, 'self-test: classifier missed the pre-076 pattern');
      const { rows } = await q(`SELECT tablename t, policyname, cmd, roles::text roles, coalesce(qual,'') qual, coalesce(with_check,'') wc
                                FROM pg_policies WHERE schemaname='public'`);
      const { bad, pending } = blanketViolations(rows);
      assert(bad.length === 0, bad.join('\n        '));
      const pend = [...new Set(pending)];
      return `${rows.length} policies scanned; ${PUBLIC_REFERENCE.size} allow-listed public tables` +
        (pend.length ? `; PENDING RULING (per-user data under a blanket read): ${pend.join(', ')}` : '');
    });

    await test('P-6b allow-listed public tables have no personal column (e-mail / phone / names / user or actor ids / *_by)', async () => {
      // negative controls: the 131 shape (site_media.updated_by_email) and a phone column on a public table are caught;
      // an ordinary entity column is not
      const fixture = personalColumns([{ t: 'site_media', c: 'updated_by_email' }, { t: 'exam_cutoff_benchmarks', c: 'contact_phone' }, { t: 'pattern_sections', c: 'section_name' }]);
      assert(fixture.join() === 'site_media.updated_by_email,exam_cutoff_benchmarks.contact_phone', `self-test: ${fixture.join()}`);
      const { rows } = await q(`SELECT table_name t, column_name c FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ANY($1)`, [[...PUBLIC_REFERENCE]]);
      const present = new Set(rows.map((r) => r.t));
      const bad = personalColumns(rows);
      assert(bad.length === 0, `personal columns on allow-listed public tables: ${bad.join(', ')}`);
      return `${present.size} allow-listed tables, ${rows.length} columns, none personal`;
    });

    await test('P-6c REAL ROLE: anon reads no user / actor id in public (non-null values); legacy mock_tests policy gone; negative control', async () => {
      const exposed = [];
      let control = null;
      await safeBegin(c);
      try {
        // negative control first: a table that DOES expose a person's id to anon must be caught by the same probe
        await q(`CREATE TABLE public.zz_p6c_fixture (id int, author_id uuid)`);
        await q(`INSERT INTO public.zz_p6c_fixture VALUES (1, gen_random_uuid())`);
        await q(`GRANT SELECT ON public.zz_p6c_fixture TO anon`);
        // new tables get RLS enabled automatically here — the leak shape is an open policy
        await q(`ALTER TABLE public.zz_p6c_fixture ENABLE ROW LEVEL SECURITY`);
        await q(`CREATE POLICY zz_p6c_open ON public.zz_p6c_fixture FOR SELECT USING (true)`);
        const cols = (await q(`SELECT c.table_name t, c.column_name col FROM information_schema.columns c
                                 JOIN pg_class k ON k.relname = c.table_name JOIN pg_namespace n ON n.oid = k.relnamespace AND n.nspname = 'public'
                                WHERE c.table_schema = 'public' AND k.relkind IN ('r', 'v', 'm', 'p') ORDER BY 1, 2`)).rows
          .filter((r) => USER_ID_COLUMN.test(r.col));
        assert(cols.some((r) => r.t === 'zz_p6c_fixture'), 'fixture not scanned');
        const hits = await probeBatch(cols, 'anon', () => as({}, 'anon'), () => '');
        for (const [k, n] of Object.entries(hits)) {
          if (k === 'zz_p6c_fixture.author_id') control = n; else if (n !== 0) exposed.push(n === 'error' ? `${k}: probe error` : k);
        }
        const legacy = (await q(`SELECT count(*)::int n FROM pg_policies WHERE schemaname = 'public' AND tablename = 'mock_tests' AND policyname = 'Public read published mock_tests'`)).rows[0].n;
        if (legacy) exposed.push('mock_tests: legacy policy "Public read published mock_tests" present');
        assert(control === 1, `negative control not caught (fixture count ${control})`);
        assert(exposed.length === 0, `anon reads user ids: ${exposed.join(', ')}`);
        return `${cols.length - 1} user-id columns probed as anon: none readable; negative control caught`;
      } finally {
        await q('ROLLBACK');
      }
    });

    await test('P-6d REAL ROLE: a student cannot read another user\'s name / e-mail / phone (marker on another profile); negative controls', async () => {
      const leaks = [];
      const ctl = {};
      await safeBegin(c);
      try {
        const [me] = (await q(`SELECT id FROM auth.users WHERE email = 'qa-student@courage-library.test'`)).rows;
        const [other] = (await q(`SELECT p.id FROM public.user_profiles p WHERE p.id <> $1 ORDER BY p.created_at LIMIT 1`, [me.id])).rows;
        assert(me && other, 'need the QA student and one other profile');
        // markers built at runtime (the no-personal-data gate scans literals)
        const MARK_PHONE = '+91' + '0'.repeat(9) + '6';
        const MARK_MAIL = ['zz', 'p6d.invalid'].join('@');
        await q(`UPDATE public.user_profiles SET full_name = 'zz-p6d-marker', phone = $2 WHERE id = $1`, [other.id, MARK_PHONE]);
        await q(`CREATE TABLE public.zz_p6d_fixture (id int, contact_email text)`);
        await q(`INSERT INTO public.zz_p6d_fixture VALUES (1, $1)`, [MARK_MAIL]);
        await q(`GRANT SELECT ON public.zz_p6d_fixture TO authenticated`);
        await q(`ALTER TABLE public.zz_p6d_fixture ENABLE ROW LEVEL SECURITY`);
        await q(`CREATE POLICY zz_p6d_open ON public.zz_p6d_fixture FOR SELECT USING (true)`);
        const student = async () => { await as({ sub: me.id, role: 'authenticated', app_metadata: {} }); };
        const markerSeen = async () => {
          await q('SAVEPOINT m'); await student();
          const n = Number((await q(`SELECT count(*) n FROM public.user_profiles WHERE full_name = 'zz-p6d-marker' OR phone = $1`, [MARK_PHONE])).rows[0].n);
          await q('ROLLBACK TO SAVEPOINT m'); await q('RESET ROLE'); return n;
        };
        if (await markerSeen()) leaks.push('user_profiles: another user\'s name / phone readable');
        const cols = (await q(`SELECT c.table_name t, c.column_name col FROM information_schema.columns c
                                 JOIN pg_class k ON k.relname = c.table_name JOIN pg_namespace n ON n.oid = k.relnamespace AND n.nspname = 'public'
                                WHERE c.table_schema = 'public' AND k.relkind IN ('r', 'v', 'm', 'p') ORDER BY 1, 2`)).rows.filter((r) => PERSON_COLUMN.test(r.col));
        const hits = await probeBatch(cols, 'authenticated', student, (t) => (OWN_COLUMN[t] ? ` AND "${OWN_COLUMN[t]}" <> '${me.id}'` : ''));
        for (const [k, n] of Object.entries(hits)) {
          if (k === 'zz_p6d_fixture.contact_email') ctl.fixture = n; else if (n !== 0) leaks.push(n === 'error' ? `${k}: probe error` : k);
        }
        // negative control 2: a leaky policy makes the marker visible
        await q('SAVEPOINT leak');
        await q(`CREATE POLICY zz_p6d_leak ON public.user_profiles FOR SELECT TO authenticated USING (true)`);
        ctl.policy = await markerSeen();
        await q('ROLLBACK TO SAVEPOINT leak');
        assert(ctl.fixture === 1 && ctl.policy === 1, `negative controls not caught: ${JSON.stringify(ctl)}`);
        assert(leaks.length === 0, `student reads other people's data: ${leaks.join(', ')}`);
        return `${cols.length - 1} name / e-mail / phone columns probed as the student: none of another user readable; controls caught`;
      } finally {
        await q('ROLLBACK');
      }
    });

    await test('P-7 per-user stats (SEC-HOTFIX-5): own rows only for students, no anon read, no blanket policy', async () => {
      const tables = Object.keys(OWN_ROWS);
      const { rows: pol } = await q(`SELECT tablename t, policyname, cmd, roles::text roles, coalesce(qual,'') qual FROM pg_policies
                                     WHERE schemaname='public' AND tablename = ANY($1)`, [tables]);
      const bad = [];
      for (const t of tables) {
        const reads = pol.filter((p) => p.t === t && (p.cmd === 'SELECT' || p.cmd === 'ALL'));
        if (reads.some((p) => isTrue(p.qual))) bad.push(`${t}: blanket read policy still present`);
        if (!reads.some((p) => p.cmd === 'SELECT' && /authenticated/.test(p.roles) && /user_id = auth\.uid\(\)/.test(p.qual))) bad.push(`${t}: no own-rows read policy`);
      }
      const g = await q(`SELECT has_table_privilege('anon','public.leaderboard_weekly_snapshots','SELECT') a`);
      if (g.rows[0].a) bad.push('anon still holds SELECT on leaderboard_weekly_snapshots');
      assert(bad.length === 0, bad.join('\n        '));

      // behaviour, inside a rolled-back transaction: one row for each of two real users (ids never printed)
      const seen = {};
      await safeBegin(c);
      try {
        const users = (await q('SELECT id FROM auth.users ORDER BY created_at LIMIT 2')).rows.map((r) => r.id);
        assert(users.length === 2, 'need two auth users for the own-rows probe');
        for (const t of tables) for (const u of users) await q(...OWN_ROWS[t](u));
        // test the POLICY, not the grant: user_battle_stats has no SELECT grant today
        await q('GRANT SELECT ON public.user_battle_stats TO authenticated');
        await q('SAVEPOINT anon_probe');
        await as({}, 'anon');
        try {
          await q('SELECT count(*) FROM public.leaderboard_weekly_snapshots');
          seen.anonLeaderboard = 'READABLE';
        } catch (e) {
          seen.anonLeaderboard = e.code === '42501' ? 'DENIED' : `ERR ${e.code}`;
        }
        await q('ROLLBACK TO SAVEPOINT anon_probe');
        await q('RESET ROLE');
        await as({ sub: users[0], role: 'authenticated', app_metadata: {} });
        for (const t of tables) {
          const r = (await q(`SELECT count(*)::int n, count(*) FILTER (WHERE user_id <> $1)::int other FROM public.${t}`, [users[0]])).rows[0];
          seen[t] = r;
        }
        await q('RESET ROLE');
        await as({ sub: '00000000-0000-4000-8000-0000000000c3', role: 'authenticated', app_metadata: {} });
        seen.strangerLeaderboard = (await q('SELECT count(*)::int n FROM public.leaderboard_weekly_snapshots')).rows[0].n;
      } finally {
        await q('ROLLBACK');
      }
      assert(seen.anonLeaderboard === 'DENIED', `anon leaderboard read: ${seen.anonLeaderboard}`);
      for (const t of tables) assert(seen[t].n === 1 && seen[t].other === 0, `${t}: student saw ${JSON.stringify(seen[t])} (expected own row only)`);
      assert(seen.strangerLeaderboard === 0, `a user with no rows saw ${seen.strangerLeaderboard} leaderboard rows`);
      return 'anon denied; student sees exactly own row in both tables; other users see none';
    });

    await test('P-8 syllabus (GAP2-4a): no direct writes; student / anon cannot call write RPCs; staff edits DRAFT only; admin publishes; PUBLISHED immutable', async () => {
      const rows = (await q(`SELECT email, id FROM auth.users WHERE email IN ('qa-staff@courage-library.test','qa-admin@courage-library.test')`)).rows;
      const uid = Object.fromEntries(rows.map((r) => [r.email, r.id]));
      const staff = { sub: uid['qa-staff@courage-library.test'], role: 'authenticated', app_metadata: { role: 'staff' } };
      const admin = { sub: uid['qa-admin@courage-library.test'], role: 'authenticated', app_metadata: { role: 'admin' } };
      // GATE-SCOPE-SWEEP (2026-10-29): the QA test exam, not real SSC GD — once the owner publishes GD with content, a
      // publish there needs the 125 typed confirmation (CONFIRM_REQUIRED); the QA exam never has a PUBLISHED version
      const exam = (await q(`SELECT id FROM public.exams WHERE slug = 'qa-syllabus-test'`)).rows[0].id;
      const topic = (await q(`SELECT id FROM public.canonical_taxonomy_nodes WHERE node_type = 'TOPIC' AND is_active ORDER BY name LIMIT 1`)).rows[0].id;
      const out = {};
      const call = async (key, claims, role, sql, params) => {
        await q('SAVEPOINT p8');
        try {
          if (role) await as(claims, role);
          const r = (await q(sql, params)).rows[0];
          out[key] = 'OK';
          await q('RESET ROLE');
          await q('RELEASE SAVEPOINT p8');
          return r && r.r;
        } catch (e) {
          out[key] = e.code === '42501' ? 'DENIED' : `ERR ${e.code} ${String(e.message).slice(0, 60)}`; // a DB exception message (no host): P-8 matches SYLLABUS_IMMUTABLE in it
          await q('ROLLBACK TO SAVEPOINT p8');
          await q('RESET ROLE');
          return null;
        }
      };
      await safeBegin(c);
      try {
        await call('anonCreate', {}, 'anon', `SELECT public.fn_syllabus_create_draft($1) r`, [exam]);
        await call('studentCreate', STUDENT, 'authenticated', `SELECT public.fn_syllabus_create_draft($1) r`, [exam]);
        await call('studentDirectInsert', STUDENT, 'authenticated', `INSERT INTO public.exam_syllabus_versions (exam_id, version_tag, version_number) VALUES ($1, 'p8', 999)`, [exam]);
        await call('staffDirectInsert', staff, 'authenticated', `INSERT INTO public.exam_syllabus_versions (exam_id, version_tag, version_number) VALUES ($1, 'p8', 999)`, [exam]);
        const d = await call('staffCreate', staff, 'authenticated', `SELECT public.fn_syllabus_create_draft($1) r`, [exam]);
        const sec = await call('staffSection', staff, 'authenticated', `SELECT public.fn_syllabus_upsert_node($1, $2) r`, [d && d.version_id, { kind: 'SECTION', title: 'P8 section' }]);
        const unit = await call('staffUnit', staff, 'authenticated', `SELECT public.fn_syllabus_upsert_node($1, $2) r`, [d && d.version_id, { kind: 'UNIT', title: 'P8 unit', parent_id: sec && sec.node_id }]);
        await call('staffMap', staff, 'authenticated', `SELECT public.fn_syllabus_set_unit_mappings($1, $2) r`, [unit && unit.node_id, [topic]]);
        await call('studentEditDraft', STUDENT, 'authenticated', `SELECT public.fn_syllabus_upsert_node($1, $2) r`, [d && d.version_id, { kind: 'UNIT', title: 'x', parent_id: sec && sec.node_id }]);
        await call('staffPublish', staff, 'authenticated', `SELECT public.fn_syllabus_publish($1) r`, [d && d.version_id]);
        await call('staffArchive', staff, 'authenticated', `SELECT public.fn_syllabus_archive_version($1) r`, [d && d.version_id]);
        const pub = await call('adminPublish', admin, 'authenticated', `SELECT public.fn_syllabus_publish($1) r`, [d && d.version_id]);
        await call('studentReadsPublished', STUDENT, 'authenticated', `SELECT count(*)::int r FROM public.exam_syllabus_nodes WHERE syllabus_version_id = $1`, [d && d.version_id]);
        // owner / service-role path on the PUBLISHED version
        await call('ownerEditPublished', null, null, `UPDATE public.exam_syllabus_nodes SET raw_title = 'x' WHERE id = $1`, [unit && unit.node_id]);
        await call('ownerArchive', null, null, `UPDATE public.exam_syllabus_versions SET status = 'ARCHIVED', is_active = false, archived_at = now() WHERE id = $1`, [d && d.version_id]);
        out.adminPublishSuccess = Boolean(pub && pub.success);
      } finally {
        await q('ROLLBACK');
      }
      const want = {
        anonCreate: 'DENIED', studentCreate: 'DENIED', studentDirectInsert: 'DENIED', staffDirectInsert: 'DENIED', staffCreate: 'OK', staffSection: 'OK',
        staffUnit: 'OK', staffMap: 'OK', studentEditDraft: 'DENIED', staffPublish: 'DENIED', staffArchive: 'DENIED', adminPublish: 'OK',
        studentReadsPublished: 'OK', ownerArchive: 'OK', adminPublishSuccess: true,
      };
      const bad = Object.entries(want).filter(([k, v]) => out[k] !== v).map(([k, v]) => `${k}: ${out[k]} (expected ${v})`);
      if (!/^ERR P0001 SYLLABUS_IMMUTABLE/.test(out.ownerEditPublished || '')) bad.push(`ownerEditPublished: ${out.ownerEditPublished} (expected SYLLABUS_IMMUTABLE)`);
      assert(bad.length === 0, bad.join('\n        '));
      return 'anon/student denied; direct inserts denied; staff drafts; admin publishes; published immutable, archivable';
    });

    await test('P-9 permanent rule: SECURITY DEFINER functions not EXECUTE-able by anon / PUBLIC and pin search_path (allow-list / pending ruling); INC-3 set locked', async () => {
      const { rows } = await q(`SELECT p.proname n, p.oid::regprocedure::text sig, pg_get_function_result(p.oid) ret,
          has_function_privilege('anon', p.oid, 'EXECUTE') anon_x, has_function_privilege('authenticated', p.oid, 'EXECUTE') auth_x,
          has_function_privilege('service_role', p.oid, 'EXECUTE') svc_x,
          EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE') public_x,
          EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) cfg WHERE cfg LIKE 'search_path=%') sp
        FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef`);
      const bad = [];
      const pending = new Set();
      for (const f of rows) {
        const callable = f.ret !== 'trigger'; // trigger functions cannot be called through PostgREST / SELECT
        const exposed = callable && (f.anon_x || f.public_x);
        if (SECDEF_PENDING_RULING[f.n]) { if (exposed || !f.sp) pending.add(f.n); continue; }
        if (exposed && !SECDEF_PUBLIC_OK[f.n]) bad.push(`${f.sig}: EXECUTE-able by ${f.public_x ? 'PUBLIC' : 'anon'}`);
        if (!f.sp) bad.push(`${f.sig}: no pinned search_path`);
      }
      const stale = Object.keys(SECDEF_PENDING_RULING).filter((n) => !pending.has(n));
      if (stale.length) bad.push(`SECDEF_PENDING_RULING entries no longer violate (remove them): ${stale.join(', ')}`);
      // GAP2-4c (084) re-pointed two functions with CREATE OR REPLACE: ACL and config must be what 080 / 082 set
      const fx = (await q(`SELECT p.proname n, has_function_privilege('anon', p.oid, 'EXECUTE') a, has_function_privilege('authenticated', p.oid, 'EXECUTE') u,
          has_function_privilege('service_role', p.oid, 'EXECUTE') s, coalesce(p.proconfig, '{}') @> ARRAY['search_path=""'] sp_empty
        FROM pg_proc p WHERE p.oid IN ('public.fn_syllabus_seed_legacy_gd_draft()'::regprocedure, 'public.fn_delete_exam_controlled(uuid,text,uuid,text,text)'::regprocedure)`)).rows;
      const seedFn = fx.find((r) => r.n === 'fn_syllabus_seed_legacy_gd_draft');
      const delFn = fx.find((r) => r.n === 'fn_delete_exam_controlled');
      if (!seedFn || seedFn.a || seedFn.u || seedFn.s || !seedFn.sp_empty) bad.push(`fn_syllabus_seed_legacy_gd_draft must stay owner-only with search_path '': ${JSON.stringify(seedFn)}`);
      if (!delFn || !delFn.sp_empty) bad.push(`fn_delete_exam_controlled must keep search_path '': ${JSON.stringify(delFn)}`);
      // SEC-HOTFIX-7 ruling 5: nothing may wait for a ruling any more
      if (Object.keys(SECDEF_PENDING_RULING).length) bad.push(`SECDEF_PENDING_RULING must be empty (SEC-HOTFIX-7): ${Object.keys(SECDEF_PENDING_RULING).join(', ')}`);
      for (const n of SECDEF_AUTHENTICATED) {
        const f = rows.find((r) => r.n === n);
        if (!f) bad.push(`${n} missing`);
        else if (f.anon_x || f.public_x || !f.auth_x || !f.svc_x || !f.sp) bad.push(`${n} not authenticated-only: ${JSON.stringify({ anon: f.anon_x, auth: f.auth_x, public: f.public_x, service: f.svc_x, sp: f.sp })}`);
      }
      for (const n of SECDEF_LOCKED) {
        const f = rows.find((r) => r.n === n);
        if (!f) bad.push(`${n} missing`);
        else if (f.anon_x || f.auth_x || f.public_x || !f.svc_x || !f.sp) bad.push(`${n} not locked: ${JSON.stringify({ anon: f.anon_x, auth: f.auth_x, public: f.public_x, service: f.svc_x, sp: f.sp })}`);
      }
      // behaviour (rolled back): anon / student denied before any execution; service role deletes a throwaway exam
      const out = {};
      await safeBegin(c);
      try {
        const call = {
          fn_delete_exam_controlled: `SELECT public.fn_delete_exam_controlled(gen_random_uuid(), 'sec-hotfix6-probe')`,
          fn_authorize_and_start_test_attempt: `SELECT public.fn_authorize_and_start_test_attempt(gen_random_uuid(), gen_random_uuid())`,
          fn_create_dynamic_mock_instance_atomic: `SELECT public.fn_create_dynamic_mock_instance_atomic(gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 'x', 'x', 'x', 'x', 1, 1, 0, '{}'::jsonb, '[]'::jsonb, 1)`,
          fn_record_qualifying_streak_activity: `SELECT public.fn_record_qualifying_streak_activity(gen_random_uuid(), 'x', gen_random_uuid(), 0, 'UTC')`,
          // SEC-HOTFIX-7 ruling 1 (083)
          fn_award_gamification_reward: `SELECT public.fn_award_gamification_reward(gen_random_uuid(), 'x', 'x', gen_random_uuid(), 'sec-hotfix7-probe', 0, 'x', '{}'::jsonb)`,
          fn_claim_reward_item: `SELECT public.fn_claim_reward_item(gen_random_uuid(), gen_random_uuid(), 'x', 'x', 'x', 'x', 'x', 'x', 'sec-hotfix7-probe')`,
          fn_reverse_reward_claim: `SELECT public.fn_reverse_reward_claim(gen_random_uuid(), gen_random_uuid(), 'x')`,
          fn_check_premium_access_and_quota: `SELECT public.fn_check_premium_access_and_quota(gen_random_uuid(), gen_random_uuid(), 'x')`,
        };
        const run = async (key, role, claims, sql) => {
          await q('SAVEPOINT p9');
          try { await as(claims, role); await q(sql); out[key] = 'ALLOWED'; } catch (e) { out[key] = e.code; }
          await q('ROLLBACK TO SAVEPOINT p9');
          await q('RESET ROLE');
        };
        for (const [n, sql] of Object.entries(call)) {
          for (const [who, role, claims] of [['anon', 'anon', {}], ['student', 'authenticated', STUDENT]]) await run(`${n}:${who}`, role, claims, sql);
          // the service role still reaches the function (any outcome but a privilege error)
          await run(`svc:${n}`, 'service_role', {}, sql);
        }
        // rulings 2 + 3: anon denied; a student session still reaches the function (its own checks decide)
        const authCall = {
          fn_create_batch_assignment: `SELECT public.fn_create_batch_assignment(gen_random_uuid(), 'x', 'x', gen_random_uuid(), now(), 'x')`,
          fn_enroll_batch_student: `SELECT public.fn_enroll_batch_student(gen_random_uuid(), gen_random_uuid(), 'x')`,
          fn_evaluate_descriptive_submission: `SELECT public.fn_evaluate_descriptive_submission(gen_random_uuid(), '{}'::jsonb, 0, 'x', 'x', 'x', 'x', 'x')`,
          fn_submit_descriptive_answer: `SELECT public.fn_submit_descriptive_answer(gen_random_uuid(), 'x', 'x', 'x', gen_random_uuid(), gen_random_uuid())`,
          fn_get_batch_assignment_progress: `SELECT public.fn_get_batch_assignment_progress(gen_random_uuid())`,
          fn_can_evaluate_submission: `SELECT public.fn_can_evaluate_submission(gen_random_uuid(), gen_random_uuid())`,
          fn_has_batch_faculty_access: `SELECT public.fn_has_batch_faculty_access(gen_random_uuid(), gen_random_uuid())`,
          fn_is_batch_member: `SELECT public.fn_is_batch_member(gen_random_uuid(), gen_random_uuid(), ARRAY['STUDENT'])`,
          fn_is_institute_member: `SELECT public.fn_is_institute_member(gen_random_uuid(), gen_random_uuid(), ARRAY['STUDENT'])`,
        };
        for (const [n, sql] of Object.entries(authCall)) {
          await run(`${n}:anon`, 'anon', {}, sql);
          await run(`auth:${n}:student`, 'authenticated', STUDENT, sql);
        }
        const org = (await q(`SELECT org_id FROM public.exams WHERE slug = 'qa-syllabus-test'`)).rows[0];
        assert(org, 'QA test exam (081) missing');
        const tmp = (await q(`INSERT INTO public.exams (org_id, title, slug, category, is_active) VALUES ($1, 'SEC-HOTFIX-6 probe (rolled back)', 'sec-hotfix6-probe', 'TEST', false) RETURNING id`, [org.org_id])).rows[0].id;
        await q(`SET LOCAL ROLE service_role`);
        const r = (await q(`SELECT public.fn_delete_exam_controlled($1, 'sec-hotfix6-probe') r`, [tmp])).rows[0].r;
        await q('RESET ROLE');
        out.serviceDelete = r && r.success === true && (await q(`SELECT count(*)::int n FROM public.exams WHERE id = $1`, [tmp])).rows[0].n === 0;
      } finally {
        await q('ROLLBACK');
      }
      for (const [k, v] of Object.entries(out)) {
        if (k === 'serviceDelete') continue;
        if (k.startsWith('svc:') || k.startsWith('auth:')) { if (v === '42501') bad.push(`${k}: 42501 (must still reach the function)`); continue; }
        if (v !== '42501') bad.push(`${k}: ${v} (expected 42501)`);
      }
      if (out.serviceDelete !== true) bad.push('service role could not delete the throwaway exam through fn_delete_exam_controlled');
      assert(bad.length === 0, bad.join('\n        '));
      return `${rows.length} SECURITY DEFINER functions; service-role only ${SECDEF_LOCKED.length} (anon/student 42501, service role reaches them); authenticated-only ${SECDEF_AUTHENTICATED.length} (anon 42501, student reaches them); pending ruling 0`;
    });
  } finally {
    await c.end();
  }
  console.log(`\nSEC-HOTFIX-4 RLS: ${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  // codes only (QB-KEY-1): a connect error's message names the pooler's IP / host. AggregateError → nested codes.
  const codes = [e && e.code, ...((e && e.errors) || []).map((x) => x && x.code)].filter(Boolean);
  console.error('SUITE ERROR', codes.length ? codes.join(' | ') : 'no error code (see the failing step above)');
  process.exit(1);
});
