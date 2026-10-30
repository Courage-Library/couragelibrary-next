#!/usr/bin/env node
/**
 * INTAKE-ASSIST-1 + INTAKE-CONCEPTS-AS-OUTLINE (migration 124) — AS THE REAL ROLES, every write inside a rolled-back
 * transaction (withLiveTransaction → safeBegin: LIVE-LOCK-SAFETY; one connection per chunk; a dropped connection re-runs
 * the chunk once). Fixtures live on the QA test exam (qa-syllabus-test), never on a real intake.
 *   --pre   124 is NOT applied: each chunk first runs the migration inside its own transaction (then rolls back)
 *   (none)  after apply: refuses unless 124 is APPLIED; + chunk S (concurrency, see below)
 * Chunks:
 *   A  catalog + C1: SECURITY INVOKER, EXECUTE service_role only; anon / authenticated (even with admin claims) → 42501;
 *      the batches table is not readable by clients
 *   B  bulk: LINK_EXACT with one non-EXACT item → the WHOLE batch refused, nothing kept; LINK_EXACT parents-first in one
 *      batch, ONE SYLLABUS_INTAKE_BULK audit row with the item ids; APPROVE_CHILDREN writes the same per-node
 *      TAXONOMY_NODE_CREATE rows as a single approve (C2 parity); C4 (topics refused, > 1000 refused); child of an
 *      undecided / ignored parent refused; KEEP_OUTLINE creates no node; OUTLINE on a non-concept refused (single + bulk);
 *      a concept kept as outline can be promoted to a node
 *   C  undo: newest batch only, in order, nodes + aliases removed and audited; nothing left to undo → refused
 *   D  undo refused (and nothing changed): an item changed afterwards; an item below decided afterwards; a created node
 *      referenced from another table (an owner alias) — no partial undo (C5)
 *   E  import: outlines on the topic unit {subtopic node: lines in order}; subtopics are the mapping targets (no NULL);
 *      outline lines never become nodes; UNVERIFIABLE marks the paper uncertain + is recorded; a bad source check refused
 *   S  (after apply only) concurrency: two connections on one committed QA fixture session — the second bulk waits on
 *      the session row lock and fails at its lock timeout (serialised, C3); the fixture is removed (no RPC, no audit)
 *   Z  nothing left behind (no batch, no audit row by the smoke actor, no IA1 node)
 * Run: node scripts/live/test_intake_assist1.cjs [--pre]
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');
const ROOT = path.resolve(__dirname, '..', '..');
const { Client } = require('pg');
const { dbTarget, redactor } = require(path.join(ROOT, 'scripts/db/_db-env.cjs'));
const { withLiveTransaction, safeBegin } = require(path.join(ROOT, 'scripts/db/live-safety.cjs'));

const PRE = process.argv.includes('--pre');
const FILE = '20261028000124_intake_assist_1.sql';
const MIGRATION_SQL = fs.readFileSync(path.join(ROOT, 'supabase/migrations', FILE), 'utf8');
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request.startsWith('@/')) return origResolve.call(this, path.resolve(ROOT, request.slice(2)), parent, isMain, options);
  return origResolve.call(this, request, parent, isMain, options);
};
require.extensions['.ts'] = (module, filename) => {
  const out = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } });
  module._compile(out.outputText, filename);
};
const { validateIntakePayload } = require(path.join(ROOT, 'lib/syllabus/intake-contract.ts'));
const { matchIntake } = require(path.join(ROOT, 'lib/syllabus/tree-matcher.ts'));

let ok = true;
let pending = [];
const chk = (n, cond, info) => { pending.push({ cond, line: `${cond ? 'PASS' : 'FAIL'} ${n}${cond ? '' : ' — ' + (info ?? '')}` }); };
const flush = () => { for (const r of pending) { if (!r.cond) ok = false; console.log(r.line); } pending = []; };
const isConnectionError = (e) => !!e && (['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EPIPE', 'ECONNREFUSED'].includes(e.code) || /Connection terminated|connection error|not queryable/i.test(String(e.message)));
const ACTOR = 'intake-assist1-smoke@courage-library.test';
const TIER = 'ia1-smoke';
const ZERO = '00000000-0000-0000-0000-000000000000';

// GATE-SCOPE-SWEEP (2026-10-29): the EXACT subject / topic are the smoke's OWN nodes, made inside each chunk's rolled-back
// transaction by fixture() — never the real "Quantitative Aptitude" / "Percentage" (the owner may rename or extend them)
const SUBJ = 'IA1 Smoke Subject';
const TOP = 'IA1 Smoke Percentage';
const PAYLOAD = (slug) => ({
  contract_version: 3, exam: slug, cycle_year: null, tier: TIER, based_on: 'IA1 smoke: QA notification 2026 + PYQs 2016-2025',
  papers: [{ name: 'IA1 Smoke Paper', questions: 100, duration_minutes: 60,
    subjects: [{ name: SUBJ, questions: 25, topics: [
      { name: TOP, origin: 'OFFICIAL', avg_questions: 3, subtopics: [
        { name: 'IA1 Fixture Sub One', origin: 'EXPANDED', outline: ['IA1 Line A', 'IA1 Line B'] },
        { name: 'IA1 Fixture Sub Two', origin: 'PYQ_TREND', outline: ['IA1 Line C'] },
        { name: 'IA1 Fixture Sub Three', origin: 'EXPANDED' },
      ] },
      { name: 'IA1 Fixture New Topic', origin: 'PYQ_TREND', avg_questions: 2, subtopics: [{ name: 'IA1 Fixture Sub Under New', origin: 'EXPANDED', outline: ['IA1 Line D'] }] },
      { name: 'IA1 Fixture Ignored Topic', origin: 'EXPANDED', subtopics: [{ name: 'IA1 Fixture Sub Under Ignored', origin: 'EXPANDED', outline: ['IA1 Line E'] }] },
    ] }] }],
});

(async () => {
  const target = dbTarget();
  const red = redactor(target);
  let c = new Client(target.pg); c.on('error', () => {}); await c.connect();
  const q = async (s, p) => (await c.query(s, p)).rows;
  try {
    const [led] = await q(`select count(*)::int n from public.schema_migration_ledger where filename = $1 and status = 'APPLIED'`, [FILE]);
    if (PRE && led.n > 0) throw new Error(`--pre refused: ${FILE} is already APPLIED`);
    if (!PRE && led.n === 0) throw new Error(`${FILE} is not applied (use --pre for the pre-apply smoke)`);
    const [qa] = await q(`select id, slug from public.exams where slug = 'qa-syllabus-test'`);
    const [adm] = await q(`select id from auth.users where email = 'qa-admin@courage-library.test'`);
    if (!qa || !adm) throw new Error('QA exam / QA admin missing');
    const ADMIN = { sub: adm.id, role: 'authenticated', app_metadata: { role: 'admin' } };
    const lit = (o) => `'${JSON.stringify(o).replace(/'/g, "''")}'`;
    const as = async (role, cl, sql, p) => {
      await c.query('savepoint s'); await c.query(`set local role ${role}`); await c.query(`select set_config('request.jwt.claims', ${lit(cl)}, true)`);
      try { const r = (await c.query(sql, p)).rows; await c.query('reset role'); await c.query('release savepoint s'); return { ok: true, rows: r }; }
      catch (e) { await c.query('rollback to savepoint s'); return { ok: false, code: e.code, msg: String(e.message).slice(0, 240) }; }
    };
    const svc = (sql, p) => as('service_role', { role: 'service_role' }, sql, p);
    const chunk = async (fn) => {
      for (let attempt = 1; ; attempt++) {
        pending = [];
        try {
          await c.end().catch(() => {});
          c = new Client(target.pg); c.on('error', () => {}); await c.connect();
          await withLiveTransaction(c, async () => { await fn(); });
          flush();
          return;
        } catch (e) {
          if (attempt === 1 && isConnectionError(e)) { console.log(`RETRY chunk after a dropped connection (${e.code || 'terminated'})`); continue; }
          throw e;
        }
      }
    };
    const migrate = async () => { if (PRE) await c.query(MIGRATION_SQL); };

    /** a QA intake from the 3.2 payload (outline lines → concept items), matched against the live tree like the service */
    const fixture = async () => {
      const [fs1] = await q(`insert into public.canonical_taxonomy_nodes (parent_id, node_type, name, slug, metadata) values (null, 'SUBJECT', $1, 'ia1-smoke-subject', '{"source":"IA1_SMOKE"}') returning id`, [SUBJ]);
      await q(`insert into public.canonical_taxonomy_nodes (parent_id, node_type, name, slug, metadata) values ($1, 'TOPIC', $2, 'ia1-smoke-percentage', '{"source":"IA1_SMOKE"}')`, [fs1.id, TOP]);
      const v = validateIntakePayload(JSON.stringify(PAYLOAD(qa.slug)), { examSlug: qa.slug, cycleYear: null, tier: TIER });
      if (!v.ok) throw new Error(`fixture payload invalid: ${JSON.stringify(v.errors)}`);
      const nodes = await q(`select id, parent_id, node_type, name, name_hi, is_active from public.canonical_taxonomy_nodes where node_type in ('SUBJECT','TOPIC','SUBTOPIC','CONCEPT')`);
      const aliases = await q(`select node_id, normalized_alias from public.taxonomy_node_aliases`);
      const matched = matchIntake(v.items, nodes.map((n) => ({ id: n.id, parentId: n.parent_id, nodeType: n.node_type, name: n.name, nameHi: n.name_hi, isActive: n.is_active })),
        aliases.map((a) => ({ nodeId: a.node_id, normalized: a.normalized_alias })));
      const r = await svc(`select public.fn_syllabus_intake_create($1, null, $2, null, null, $3, $4, null, $5) id`, [qa.id, TIER, v.payload, JSON.stringify(matched), ACTOR]);
      if (!r.ok) throw new Error(`fixture create: ${r.msg}`);
      const sid = r.rows[0].id;
      const rows = await q(`select id, raw_name, level, match_status from public.syllabus_intake_items where session_id = $1`, [sid]);
      const it = (name) => { const x = rows.find((y) => y.raw_name === name); if (!x) throw new Error(`no fixture item ${name}`); return x.id; };
      return { sid, it, rows, warnings: v.warnings };
    };
    const bulk = (sid, action, ids) => svc(`select public.fn_syllabus_intake_bulk($1, $2, $3::uuid[], null, $4) r`, [sid, action, ids, ACTOR]);
    const undo = (sid) => svc(`select public.fn_syllabus_intake_bulk_undo($1, null, $2) r`, [sid, ACTOR]);
    const decide = (id, d, node) => svc(`select public.fn_syllabus_intake_decide($1, $2, $3, null, $4) r`, [id, d, node, ACTOR]);
    const state = async (sid) => Object.fromEntries((await q(`select raw_name, decision, decision_node_id, decided_in_batch from public.syllabus_intake_items where session_id = $1`, [sid])).map((r) => [r.raw_name, r]));
    const auditN = async (action) => (await q(`select count(*)::int n from public.admin_audit_logs where actor_email = $1 and action_type = $2`, [ACTOR, action]))[0].n;
    // GATE-SCOPE-SWEEP: only the nodes made in THIS transaction (created_at = now() = the transaction's start); other
    // sessions (the owner's intake approvals) may add nodes while the chunk runs
    const nodeN = async () => (await q(`select count(*)::int n from public.canonical_taxonomy_nodes where created_at = now()`))[0].n;

    // ---------------- A: catalog + C1 (real roles)
    await chunk(async () => {
      await migrate();
      const fns = ['fn_syllabus_intake__approve_node', 'fn_syllabus_intake_decide', 'fn_syllabus_intake_bulk', 'fn_syllabus_intake_bulk_undo', 'fn_syllabus_intake_import'];
      const cat = await q(`select p.proname, p.prosecdef, pg_get_function_identity_arguments(p.oid) a,
            has_function_privilege('anon', p.oid, 'EXECUTE') anon, has_function_privilege('authenticated', p.oid, 'EXECUTE') auth,
            has_function_privilege('service_role', p.oid, 'EXECUTE') svc
          from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = any($1)`, [fns]);
      const [tbl] = await q(`select c.relrowsecurity rls, has_table_privilege('anon', c.oid, 'SELECT') anon, has_table_privilege('authenticated', c.oid, 'SELECT') auth
          from pg_class c where c.oid = 'public.syllabus_intake_batches'::regclass`);
      chk('A-1 catalog: 5 intake functions (one import, 5 arguments), all SECURITY INVOKER, EXECUTE for service_role only; batches table RLS on, no client SELECT',
        cat.length === 5 && cat.every((f) => !f.prosecdef && !f.anon && !f.auth && f.svc) && cat.find((f) => f.proname === 'fn_syllabus_intake_import').a.split(',').length === 5
        && tbl.rls && !tbl.anon && !tbl.auth, JSON.stringify({ cat, tbl }));
      const calls = [
        `select public.fn_syllabus_intake_bulk('${ZERO}', 'LINK_EXACT', array['${ZERO}']::uuid[], null, 'x@example.test')`,
        `select public.fn_syllabus_intake_bulk_undo('${ZERO}', null, 'x@example.test')`,
        `select public.fn_syllabus_intake_import('${ZERO}', null, null, 'x@example.test', 'VERIFIED')`,
        `select count(*) from public.syllabus_intake_batches`,
      ];
      const res = [];
      for (const sql of calls) for (const [role, cl] of [['anon', { role: 'anon' }], ['authenticated', ADMIN]]) res.push({ role, sql: sql.slice(14, 50), ...(await as(role, cl, sql)) });
      chk('A-2 C1 real roles: anon and authenticated (even with admin claims) are refused (42501) on bulk, undo, import and the batches table — the actor only ever comes from the server',
        res.every((r) => !r.ok && r.code === '42501'), JSON.stringify(res.filter((r) => r.ok || r.code !== '42501')));
    });

    // ---------------- B: bulk rules, atomicity, audit, parity, outline
    await chunk(async () => {
      await migrate();
      const f = await fixture();
      const nodes0 = await nodeN();
      const bad = await bulk(f.sid, 'LINK_EXACT', [f.it(SUBJ), f.it(TOP), f.it('IA1 Fixture New Topic')]);
      const after = await state(f.sid);
      const [b0] = await q(`select count(*)::int n from public.syllabus_intake_batches where session_id = $1`, [f.sid]);
      chk('B-1 LINK_EXACT with one non-EXACT item → the WHOLE batch is refused: no item decided, no batch row, no audit row',
        !bad.ok && /only exact matches/.test(bad.msg) && !after[SUBJ].decision && !after[TOP].decision && b0.n === 0 && (await auditN('SYLLABUS_INTAKE_BULK')) === 0, JSON.stringify({ bad, b0 }));
      const link = await bulk(f.sid, 'LINK_EXACT', [f.it(TOP), f.it(SUBJ)]);
      const s1 = await state(f.sid);
      const [aud] = await q(`select new_value v, target_entity, target_id from public.admin_audit_logs where actor_email = $1 and action_type = 'SYLLABUS_INTAKE_BULK'`, [ACTOR]);
      chk('B-2 LINK_EXACT: subject + topic in one batch, parents first (topic listed first), both LINK to their matched nodes with decided_in_batch; exactly ONE SYLLABUS_INTAKE_BULK audit row with both item ids',
        link.ok && s1[SUBJ].decision === 'LINK' && s1[TOP].decision === 'LINK' && s1[TOP].decided_in_batch === link.rows[0].r.batch_id
        && (await auditN('SYLLABUS_INTAKE_BULK')) === 1 && aud.v.item_ids.length === 2 && aud.v.item_ids.includes(f.it(SUBJ)) && aud.v.action === 'LINK_EXACT' && aud.target_id === f.sid,
        JSON.stringify({ link, aud }));
      // C4 + parents first
      const topic = await bulk(f.sid, 'APPROVE_CHILDREN', [f.it('IA1 Fixture New Topic')]);
      const orphan = await bulk(f.sid, 'APPROVE_CHILDREN', [f.it('IA1 Fixture Sub Under New')]);
      const many = await bulk(f.sid, 'APPROVE_CHILDREN', Array.from({ length: 1001 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`));
      const twice = await bulk(f.sid, 'LINK_EXACT', [f.it(SUBJ)]);
      chk('B-3 refused: bulk approve of a TOPIC (C4), a subtopic whose topic is undecided (parents first), 1001 items (C4), an item already decided',
        !topic.ok && /subtopics only/.test(topic.msg) && !orphan.ok && /decide the parent/.test(orphan.msg) && !many.ok && /at most 1000/.test(many.msg) && !twice.ok && /already decided/.test(twice.msg),
        JSON.stringify({ topic: topic.msg, orphan: orphan.msg, many: many.msg, twice: twice.msg }));
      // ignored parent: IGNORE the topic (cascade) → its subtopic and outline line can no longer be bulk-decided
      const ign = await decide(f.it('IA1 Fixture Ignored Topic'), 'IGNORE', null);
      const ignSub = await bulk(f.sid, 'APPROVE_CHILDREN', [f.it('IA1 Fixture Sub Under Ignored')]);
      const ignLine = await bulk(f.sid, 'KEEP_OUTLINE', [f.it('IA1 Line E')]);
      chk('B-4 a child of an IGNORED parent is refused in bulk (the subtree is ignored with its parent)',
        ign.ok && !ignSub.ok && !ignLine.ok, JSON.stringify({ ign: ign.ok, ignSub: ignSub.msg, ignLine: ignLine.msg }));
      // C2 parity: bulk approve vs single approve write the same node + taxonomy audit rows
      const single = await decide(f.it('IA1 Fixture Sub Three'), 'APPROVE_NEW', null);
      const appr = await bulk(f.sid, 'APPROVE_CHILDREN', [f.it('IA1 Fixture Sub One'), f.it('IA1 Fixture Sub Two')]);
      const creates = await q(`select new_value v, reason, target_entity from public.admin_audit_logs where actor_email = $1 and action_type = 'TAXONOMY_NODE_CREATE' order by created_at, id`, [ACTOR]);
      const keys = (r) => Object.keys(r.v).sort().join(',');
      const s2 = await state(f.sid);
      const made = await q(`select name, node_type, parent_id, metadata->>'source' src from public.canonical_taxonomy_nodes where id = any($1)`,
        [[s2['IA1 Fixture Sub One'].decision_node_id, s2['IA1 Fixture Sub Two'].decision_node_id, s2['IA1 Fixture Sub Three'].decision_node_id]]);
      chk('B-5 C2 parity: bulk APPROVE_CHILDREN writes one TAXONOMY_NODE_CREATE row per node with the same fields + reason as the single approve; nodes are SUBTOPICs under the linked topic, source SYLLABUS_INTAKE',
        single.ok && appr.ok && appr.rows[0].r.created === 2 && creates.length === 3 && creates.every((r) => keys(r) === keys(creates[0]) && r.reason === creates[0].reason && r.target_entity === 'canonical_taxonomy_node')
        && made.length === 3 && made.every((n) => n.node_type === 'SUBTOPIC' && n.parent_id === s2[TOP].decision_node_id && n.src === 'SYLLABUS_INTAKE') && (await nodeN()) === nodes0 + 3,
        JSON.stringify({ single, appr, creates: creates.map((r) => [keys(r), r.reason]), made }));
      // outline: no node; OUTLINE on a non-concept refused (single + bulk); promote one concept
      const n1 = await nodeN();
      const keep = await bulk(f.sid, 'KEEP_OUTLINE', [f.it('IA1 Line A'), f.it('IA1 Line B'), f.it('IA1 Line C')]);
      const s3 = await state(f.sid);
      const notConcept = await bulk(f.sid, 'KEEP_OUTLINE', [f.it('IA1 Fixture New Topic')]);
      const notConcept1 = await decide(f.it('IA1 Fixture New Topic'), 'OUTLINE', null);
      chk('B-6 KEEP_OUTLINE: 3 concepts kept as outline with NO node created; OUTLINE on a topic refused in bulk and as a single decision',
        keep.ok && ['IA1 Line A', 'IA1 Line B', 'IA1 Line C'].every((n) => s3[n].decision === 'OUTLINE' && s3[n].decision_node_id === null) && (await nodeN()) === n1
        && !notConcept.ok && /only a concept/.test(notConcept.msg) && !notConcept1.ok && /only a concept/.test(notConcept1.msg),
        JSON.stringify({ keep, notConcept: notConcept.msg, notConcept1: notConcept1.msg }));
      const promote = await decide(f.it('IA1 Line A'), 'APPROVE_NEW', null);
      const s4 = await state(f.sid);
      const [pn] = await q(`select node_type, parent_id from public.canonical_taxonomy_nodes where id = $1`, [s4['IA1 Line A'].decision_node_id || ZERO]);
      chk('B-7 promote: a concept kept as outline can still be approved as its own CONCEPT node (under its subtopic); the single decision clears decided_in_batch',
        promote.ok && s4['IA1 Line A'].decision === 'APPROVE_NEW' && pn && pn.node_type === 'CONCEPT' && pn.parent_id === s4['IA1 Fixture Sub One'].decision_node_id && s4['IA1 Line A'].decided_in_batch === null,
        JSON.stringify({ promote, pn }));
    });

    // ---------------- C: undo (newest first, all of it)
    await chunk(async () => {
      await migrate();
      const f = await fixture();
      const nodes0 = await nodeN();
      const none = await undo(f.sid);
      const b1 = await bulk(f.sid, 'LINK_EXACT', [f.it(SUBJ), f.it(TOP)]);
      const b2 = await bulk(f.sid, 'APPROVE_CHILDREN', [f.it('IA1 Fixture Sub One'), f.it('IA1 Fixture Sub Two')]);
      const made = Object.values(await state(f.sid)).filter((r) => r.decision === 'APPROVE_NEW').map((r) => r.decision_node_id);
      const u1 = await undo(f.sid);
      const s1 = await state(f.sid);
      const gone = await q(`select count(*)::int n from public.canonical_taxonomy_nodes where id = any($1)`, [made]);
      const [bt] = await q(`select (select undone_at is not null from public.syllabus_intake_batches where id = $1) b2_undone, (select undone_at is null from public.syllabus_intake_batches where id = $2) b1_kept`,
        [b2.ok ? b2.rows[0].r.batch_id : ZERO, b1.ok ? b1.rows[0].r.batch_id : ZERO]);
      chk('C-1 undo reverts ONLY the newest batch: the 2 approved subtopics undecided again, their 2 nodes deleted (TAXONOMY_NODE_DELETE ×2), the earlier LINK batch untouched; one SYLLABUS_INTAKE_BULK_UNDO row',
        !none.ok && /no bulk action/.test(none.msg) && b1.ok && b2.ok && made.length === 2 && u1.ok && u1.rows[0].r.deleted === 2 && gone[0].n === 0 && (await nodeN()) === nodes0
        && !s1['IA1 Fixture Sub One'].decision && s1[TOP].decision === 'LINK' && bt.b2_undone && bt.b1_kept
        && (await auditN('TAXONOMY_NODE_DELETE')) === 2 && (await auditN('SYLLABUS_INTAKE_BULK_UNDO')) === 1, JSON.stringify({ none: none.msg, u1, gone, bt }));
      const u2 = await undo(f.sid);
      const u3 = await undo(f.sid);
      const s2 = await state(f.sid);
      chk('C-2 undo again → the LINK batch (subject + topic undecided); then nothing is left to undo',
        u2.ok && u2.rows[0].r.action === 'LINK_EXACT' && !s2[SUBJ].decision && !s2[TOP].decision && !u3.ok && /no bulk action/.test(u3.msg), JSON.stringify({ u2, u3: u3.msg }));
    });

    // ---------------- D: undo refused — nothing changes (C5: never partial)
    await chunk(async () => {
      await migrate();
      const f = await fixture();
      await bulk(f.sid, 'LINK_EXACT', [f.it(SUBJ), f.it(TOP)]);
      const b2 = await bulk(f.sid, 'APPROVE_CHILDREN', [f.it('IA1 Fixture Sub One'), f.it('IA1 Fixture Sub Two')]);
      const node = (await state(f.sid))['IA1 Fixture Sub One'].decision_node_id;
      // (1) a reference from another table: an owner alias on a node the batch created
      const al = await svc(`select public.fn_taxonomy_add_alias($1, 'IA1 owner alias', 'en', 'OWNER', null, $2)`, [node, ACTOR]);
      const before = JSON.stringify(await state(f.sid));
      const nodes1 = await nodeN();
      const ref = await undo(f.sid);
      const [bt] = await q(`select undone_at is null kept from public.syllabus_intake_batches where id = $1`, [b2.rows[0].r.batch_id]);
      chk('D-1 a node the batch created is referenced (an owner alias) → the WHOLE undo is refused: items, nodes and the batch unchanged',
        al.ok && !ref.ok && /now in use/.test(ref.msg) && JSON.stringify(await state(f.sid)) === before && (await nodeN()) === nodes1 && bt.kept, JSON.stringify({ al, ref: ref.msg, bt }));
      await svc(`select public.fn_taxonomy_remove_alias((select id from public.taxonomy_node_aliases where node_id = $1 and source = 'OWNER'), null, $2)`, [node, ACTOR]);
      // (2) an item below decided afterwards
      const below = await decide(f.it('IA1 Line A'), 'OUTLINE', null);
      const r2 = await undo(f.sid);
      chk('D-2 an item below the batch decided afterwards → undo refused', below.ok && !r2.ok && /below the last bulk action/.test(r2.msg), JSON.stringify({ below, r2: r2.msg }));
      // (3) an item of the batch changed afterwards
      await decide(f.it('IA1 Line A'), 'IGNORE', null);
      const b3 = await bulk(f.sid, 'KEEP_OUTLINE', [f.it('IA1 Line B'), f.it('IA1 Line C')]);
      const changed = await decide(f.it('IA1 Line B'), 'IGNORE', null);
      const before3 = JSON.stringify(await state(f.sid));
      const r3 = await undo(f.sid);
      chk('D-3 an item of the batch changed afterwards → undo refused and nothing changes', b3.ok && changed.ok && !r3.ok && /changed afterwards/.test(r3.msg) && JSON.stringify(await state(f.sid)) === before3,
        JSON.stringify({ b3: b3.ok, changed: changed.ok, r3: r3.msg }));
    });

    // ---------------- E: import with outlines + the source check
    await chunk(async () => {
      await migrate();
      const f = await fixture();
      const step = async (p) => { const r = await p; if (!r.ok) throw new Error(r.msg); return r; };
      await step(bulk(f.sid, 'LINK_EXACT', [f.it(SUBJ), f.it(TOP)]));
      await step(bulk(f.sid, 'APPROVE_CHILDREN', [f.it('IA1 Fixture Sub One'), f.it('IA1 Fixture Sub Two')]));
      await step(decide(f.it('IA1 Fixture Sub Three'), 'APPROVE_NEW', null));
      await step(decide(f.it('IA1 Fixture New Topic'), 'APPROVE_NEW', null));
      await step(bulk(f.sid, 'APPROVE_CHILDREN', [f.it('IA1 Fixture Sub Under New')]));
      await step(bulk(f.sid, 'KEEP_OUTLINE', [f.it('IA1 Line A'), f.it('IA1 Line B'), f.it('IA1 Line C'), f.it('IA1 Line D')]));
      await step(decide(f.it('IA1 Fixture Ignored Topic'), 'IGNORE', null));
      const s = await state(f.sid);
      const badCheck = await svc(`select public.fn_syllabus_intake_import($1, null, null, $2, 'MAYBE')`, [f.sid, ACTOR]);
      const imp = await svc(`select public.fn_syllabus_intake_import($1, null, null, $2, 'UNVERIFIABLE') r`, [f.sid, ACTOR]);
      const vid = imp.ok ? imp.rows[0].r.version_id : ZERO;
      const units = await q(`select n.raw_title, n.metadata, array(select m.canonical_node_id::text from public.exam_syllabus_canonical_mappings m where m.syllabus_node_id = n.id order by 1) maps
          from public.exam_syllabus_nodes n where n.syllabus_version_id = $1 and n.node_kind = 'UNIT'`, [vid]);
      const pct = units.find((u) => u.raw_title === TOP) || { metadata: {}, maps: [] };
      const one = s['IA1 Fixture Sub One'].decision_node_id;
      const two = s['IA1 Fixture Sub Two'].decision_node_id;
      const three = s['IA1 Fixture Sub Three'].decision_node_id;
      const [paper] = await q(`select metadata from public.exam_syllabus_nodes where syllabus_version_id = $1 and node_kind = 'PAPER'`, [vid]);
      const [ver] = await q(`select metadata->'intake'->>'source_check' sc from public.exam_syllabus_versions where id = $1`, [vid]);
      const [lines] = await q(`select count(*)::int n from public.canonical_taxonomy_nodes where name like 'IA1 Line%'`);
      chk('E-1 a source check other than VERIFIED / UNVERIFIABLE is refused', !badCheck.ok && /source check/.test(badCheck.msg), badCheck.msg);
      chk('E-2 import: the topic unit maps the 3 SUBTOPIC nodes (no NULL target); metadata.outlines = {Sub One: [Line A, Line B], Sub Two: [Line C]} in order; no outline line became a node',
        imp.ok && imp.rows[0].r.outline_items === 4 && JSON.stringify(pct.maps) === JSON.stringify([one, two, three].sort()) && pct.metadata.outlines
        && pct.metadata.outlines[one].subtopic === 'IA1 Fixture Sub One' && JSON.stringify(pct.metadata.outlines[one].items) === JSON.stringify(['IA1 Line A', 'IA1 Line B'])
        && JSON.stringify(pct.metadata.outlines[two].items) === JSON.stringify(['IA1 Line C']) && !pct.metadata.outlines[three] && lines.n === 0,
        JSON.stringify({ imp, pct, lines }));
      chk('E-3 UNVERIFIABLE: the paper is marked uncertain with the reason; the version records source_check',
        paper && paper.metadata.uncertain === true && /could not be verified/.test(paper.metadata.uncertain_reason || '') && ver.sc === 'UNVERIFIABLE', JSON.stringify({ paper, ver }));
    });

    // ---------------- S: concurrency (after apply only; committed QA fixture, removed again)
    if (!PRE) {
      pending = [];
      // the committed concurrency fixture only needs SOME active subject as the matched node (an FK): the QA lesson's subject
      const [subject] = await q(`select n.root_subject_id id from public.learning_documents d join public.learning_units u on u.id = d.learning_unit_id
          join public.canonical_taxonomy_nodes n on n.id = u.topic_id where d.canonical_slug = 'qa-number-system-concept-lesson'`);
      let sid = null;
      const c1 = new Client(target.pg); c1.on('error', () => {});
      const c2 = new Client(target.pg); c2.on('error', () => {});
      try {
        await safeBegin(c);
        sid = (await c.query(`insert into public.syllabus_intake_sessions (exam_id, tier, contract_version, based_on, payload, payload_sha256, created_by_email)
            values ($1, 'ia1-conc', 3, 'IA1 concurrency fixture', '{}'::jsonb, repeat('0', 64), $2) returning id`, [qa.id, ACTOR])).rows[0].id;
        const item = (await c.query(`insert into public.syllabus_intake_items (session_id, item_key, level, position, raw_name, match_status, matched_node_id)
            values ($1, 's0', 'SUBJECT', 0, $2, 'EXACT', $3) returning id`, [sid, 'IA1 concurrency subject', subject.id])).rows[0].id;
        await c.query(`commit`);
        await c1.connect(); await c2.connect();
        await safeBegin(c1);
        await c1.query(`set local role service_role`);
        await c1.query(`select public.fn_syllabus_intake_bulk($1, 'LINK_EXACT', array[$2]::uuid[], null, $3)`, [sid, item, ACTOR]);
        await safeBegin(c2); // the shared 3 s lock timeout
        await c2.query(`set local role service_role`);
        let second = null;
        const t0 = Date.now();
        try { await c2.query(`select public.fn_syllabus_intake_bulk($1, 'LINK_EXACT', array[$2]::uuid[], null, $3)`, [sid, item, ACTOR]); second = { ok: true }; }
        catch (e) { second = { ok: false, code: e.code }; }
        const waited = Date.now() - t0;
        await c2.query('rollback').catch(() => {});
        await c1.query('rollback').catch(() => {});
        chk('S-1 concurrency: while one bulk holds the intake, a second bulk on the same intake waits on the session row lock and fails at its lock timeout (55P03) — serialised, never interleaved',
          !second.ok && second.code === '55P03' && waited >= 2500, JSON.stringify({ second, waited }));
      } finally {
        await c1.end().catch(() => {}); await c2.end().catch(() => {});
        await c.query('rollback').catch(() => {});
        if (sid) await c.query(`delete from public.syllabus_intake_sessions where id = $1`, [sid]);
      }
      flush();
    }

    // ---------------- Z: nothing left
    const [z] = await q(`select (select count(*)::int from public.syllabus_intake_sessions s join public.exams e on e.id = s.exam_id where e.slug = 'qa-syllabus-test' and s.tier in ($2, 'ia1-conc')) sessions,
        (select count(*)::int from public.admin_audit_logs where actor_email = $1) audits,
        (select count(*)::int from public.canonical_taxonomy_nodes where name like 'IA1 %') nodes,
        ${PRE ? '0' : `(select count(*)::int from public.syllabus_intake_batches b join public.syllabus_intake_sessions s on s.id = b.session_id join public.exams e on e.id = s.exam_id where e.slug = 'qa-syllabus-test')`} batches`, [ACTOR, TIER]);
    pending = [];
    chk('Z nothing left behind (no QA fixture session, no audit row by the smoke actor, no IA1 node, no QA batch)', z.sessions === 0 && z.audits === 0 && z.nodes === 0 && z.batches === 0, JSON.stringify(z));
    flush();
  } catch (e) {
    ok = false;
    console.log(`FAIL suite error — ${red(String(e && e.message ? e.message : e)).slice(0, 400)}`);
  } finally {
    await c.end().catch(() => {});
  }
  console.log(ok ? 'INTAKE-ASSIST-1 live: all checks passed' : 'INTAKE-ASSIST-1 live: FAILED');
  process.exit(ok ? 0 : 1);
})();
