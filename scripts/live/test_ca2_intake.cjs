#!/usr/bin/env node
/**
 * CA2-INTAKE (CA-2, migration 116) — syllabus intake + M2 AS THE REAL ROLES, every write inside a rolled-back
 * transaction (LIVE-LOCK-SAFETY via withLiveTransaction; one connection per chunk; a dropped connection re-runs the whole
 * chunk once, assertions are never retried). service_role for the intake / taxonomy RPCs (the app's path); the QA admin
 * (aal2) for the existing JWT-checked publish; anon, the QA student and the QA staff for reads and denials. Uses the
 * QA exam qa-syllabus-test and QA tiers; QA nodes carry metadata.source = CA2_SMOKE / SYLLABUS_INTAKE and never survive.
 *   --pre   116 is NOT applied: each chunk first runs the migration inside its own transaction (then everything rolls
 *           back); chunk A also proves the readers unchanged (read model + validation before vs after, same txn).
 *   (none)  the live gate after apply: refuses unless 116 is APPLIED.
 * Chunks: A grants / RLS / structure / readers · B intake end to end (contract + matcher from the TS sources) ·
 *         C tiers + merge into a re-pointed DRAFT + move / merge roll-up guards · Z nothing left.
 * Run: node scripts/live/test_ca2_intake.cjs [--pre]
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');
const ROOT = path.resolve(__dirname, '..', '..');
const { Client } = require('pg');
const { dbTarget, redactor } = require(path.join(ROOT, 'scripts/db/_db-env.cjs'));
const { withLiveTransaction } = require(path.join(ROOT, 'scripts/db/live-safety.cjs'));

const PRE = process.argv.includes('--pre');
const FILE = '20261027000116_ca2_syllabus_intake.sql';
const MIGRATION_SQL = fs.readFileSync(path.join(ROOT, 'supabase/migrations', FILE), 'utf8');

// the TS contract + matcher (pure modules; @/ alias)
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
const isConnectionError = (e) => !!e && (['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EPIPE', 'ECONNREFUSED'].includes(e.code)
  || /Connection terminated|connection error|not queryable/i.test(String(e.message)));
const ZERO = '00000000-0000-0000-0000-000000000000';
const ACTOR_EMAIL = 'ca2-smoke@courage-library.test';
// a read model / report without the keys CA-2 adds (node_id / node_type / node_name / tier)
const stripNew = (v) => JSON.parse(JSON.stringify(v, (k, x) => (['node_id', 'node_type', 'node_name', 'tier'].includes(k) ? undefined : x)));

(async () => {
  const target = dbTarget();
  const red = redactor(target);
  let c = new Client(target.pg); c.on('error', () => {}); await c.connect();
  const q = async (s, p) => (await c.query(s, p)).rows;
  try {
    const [led] = await q(`select count(*)::int n from public.schema_migration_ledger where filename = $1 and status = 'APPLIED'`, [FILE]);
    if (PRE && led.n > 0) throw new Error(`--pre refused: ${FILE} is already APPLIED`);
    if (!PRE && led.n === 0) throw new Error(`${FILE} is not applied (use --pre for the pre-apply smoke)`);
    const ids = {};
    for (const [k, e] of [['admin', 'qa-admin@courage-library.test'], ['staff', 'qa-staff@courage-library.test'], ['student', 'qa-student@courage-library.test']]) ids[k] = (await q(`select id from auth.users where email = $1`, [e]))[0]?.id;
    if (!ids.admin || !ids.staff || !ids.student) throw new Error('QA users missing');
    const [qaExam] = await q(`select id, slug from public.exams where slug = 'qa-syllabus-test'`);
    if (!qaExam) throw new Error('QA exam qa-syllabus-test missing');

    const lit = (o) => `'${JSON.stringify(o).replace(/'/g, "''")}'`;
    const as = async (role, cl, sql, p) => {
      await c.query('savepoint s'); await c.query(`set local role ${role}`); await c.query(`select set_config('request.jwt.claims', ${lit(cl)}, true)`);
      try { const r = (await c.query(sql, p)).rows; await c.query('reset role'); await c.query('release savepoint s'); return { ok: true, rows: r }; }
      catch (e) { await c.query('rollback to savepoint s'); return { ok: false, code: e.code, msg: String(e.message).slice(0, 200) }; }
    };
    const SVC = { role: 'service_role' };
    const STU = { sub: ids.student, role: 'authenticated', aal: 'aal1', app_metadata: {} };
    const STAFF = { sub: ids.staff, role: 'authenticated', aal: 'aal2', app_metadata: { role: 'staff' } };
    const ADMIN = { sub: ids.admin, role: 'authenticated', aal: 'aal2', app_metadata: { role: 'admin' } };
    const svc = (sql, p) => as('service_role', SVC, sql, p);
    const rule = (r, re) => !r.ok && (re ? re.test(r.msg) : /SYLLABUS_INTAKE|TAXONOMY_RULE/.test(r.msg));
    const mkNode = async (parent, type, name, slug) => {
      const r = await svc(`insert into public.canonical_taxonomy_nodes (parent_id, node_type, name, slug, metadata) values ($1, $2, $3, $4, '{"source":"CA2_SMOKE"}') returning id`, [parent, type, name, slug]);
      if (!r.ok) throw new Error(`mkNode ${name}: ${r.msg}`);
      return r.rows[0].id;
    };
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
          if (attempt === 1 && isConnectionError(e)) { console.log(`RETRY chunk after a dropped connection (${e.code || 'terminated'}) — partial results discarded`); continue; }
          throw e;
        }
      }
    };
    const migrate = async () => { if (PRE) await c.query(MIGRATION_SQL); };

    // ---------------- A: readers unchanged, structure, grants, RLS
    await chunk(async () => {
      const [cgl] = await q(`select v.exam_id, v.exam_cycle_id from public.exam_syllabus_versions v join public.exams e on e.id = v.exam_id where e.slug = 'ssc-cgl' and v.status = 'PUBLISHED'`);
      const [draft] = await q(`select id from public.exam_syllabus_versions where status = 'DRAFT' order by created_at limit 1`);
      const before = PRE ? {
        rm: (await q(`select public.fn_exam_syllabus_read_model($1, $2) r`, [cgl.exam_id, cgl.exam_cycle_id]))[0].r,
        val: draft ? (await q(`select public.fn_syllabus__validate($1) r`, [draft.id]))[0].r : null,
      } : null;
      await migrate();
      // GATE-SCOPE-SWEEP: the readers-unchanged proof is a --pre (migration 116) check only; after apply nothing here
      // depends on the real published CGL syllabus
      const after = PRE ? {
        rm: (await q(`select public.fn_exam_syllabus_read_model($1, $2) r`, [cgl.exam_id, cgl.exam_cycle_id]))[0].r,
        val: draft ? (await q(`select public.fn_syllabus__validate($1) r`, [draft.id]))[0].r : null,
      } : null;
      if (PRE) {
        const same = JSON.stringify(stripNew(before.rm)) === JSON.stringify(stripNew(after.rm)) && JSON.stringify(before.val) === JSON.stringify(after.val);
        chk(`A-0 readers unchanged by 116: the published SSC CGL read model (${after.rm.nodes.length} nodes, ${after.rm.totals.topics} topics) and the open DRAFT's validation report are identical before / after (only the new keys added)`,
          same && after.rm.state === 'AVAILABLE', JSON.stringify({ rmSame: JSON.stringify(stripNew(before.rm)) === JSON.stringify(stripNew(after.rm)), valSame: JSON.stringify(before.val) === JSON.stringify(after.val) }));
      }
      // GATE-SCOPE (2026-10-29): mappings below topic level exist now (the owner's intake maps subtopics), so the
      // invariant is checked for every row as "topic_id = the node's own rolled-up TOPIC" (a TOPIC: itself, rollup NULL)
      const [m] = await q(`select count(*)::int n, count(*) filter (where
                               (canonical_node_type = 'TOPIC' and rollup_topic_id is null and topic_id = canonical_node_id)
                               or (canonical_node_type <> 'TOPIC' and rollup_topic_id = public.fn_taxonomy_topic_of(canonical_node_id) and topic_id = rollup_topic_id))::int same
                             from public.exam_syllabus_canonical_mappings where canonical_node_id is not null`);
      const [s] = await q(`select
          (select attgenerated from pg_attribute where attrelid = 'public.exam_syllabus_canonical_mappings'::regclass and attname = 'canonical_node_type') gen_type,
          (select attgenerated from pg_attribute where attrelid = 'public.exam_syllabus_canonical_mappings'::regclass and attname = 'topic_id') gen_topic,
          (select indexdef from pg_indexes where indexname = 'uq_exam_syllabus_one_published') one_pub,
          (select count(*)::int from pg_class where relname in ('syllabus_intake_sessions','syllabus_intake_items') and relrowsecurity) rls`);
      chk(`A-1 M2 structure: node type is a plain column (TOPIC / SUBTOPIC / CONCEPT), topic_id generated; every existing mapping (${m.n}) reads topic_id = its node's rolled-up topic; one PUBLISHED per (exam, cycle, tier); intake tables RLS on`,
        m.n > 0 && m.same === m.n && s.gen_type === '' && s.gen_topic === 's' && /COALESCE\(tier, ''::text\)/.test(s.one_pub) && s.rls === 2, JSON.stringify({ m, s }));

      const calls = [
        `select public.fn_syllabus_intake_create('${ZERO}', null, null, 'https://x.test', '2026-01-01', '{}'::jsonb, '[]'::jsonb, null, 'x@example.test')`,
        `select public.fn_syllabus_intake_decide('${ZERO}', 'IGNORE', null, null, 'x@example.test')`,
        `select public.fn_syllabus_intake_import('${ZERO}', null, null, 'x@example.test')`,
        `select public.fn_syllabus_intake_discard('${ZERO}', null, 'x@example.test')`,
        `select public.fn_taxonomy_topic_of('${ZERO}')`,
        `select public.fn_syllabus__repointed_draft('${ZERO}', '${ZERO}', '${ZERO}', null)`,
        `select public.fn_syllabus__create_version('${ZERO}', null, null, 'MANUAL', null, null, '{}'::jsonb)`,
      ];
      const denials = [];
      for (const [role, cl] of [['anon', { role: 'anon' }], ['authenticated', STU], ['authenticated', STAFF], ['authenticated', ADMIN]]) {
        for (const sql of calls) { const r = await as(role, cl, sql); if (r.ok || r.code !== '42501') denials.push(`${cl.app_metadata?.role || role}: ${sql.slice(14, 48)} → ${r.ok ? 'ALLOWED' : r.code}`); }
      }
      chk('A-2 anon / student / staff / admin sessions: no EXECUTE on the intake RPCs, the roll-up helper, the re-point helper or the internal version helper (42501); service_role only', denials.length === 0, denials.join(' | '));

      const [f] = await q(`select count(*) filter (where prosecdef)::int secdef, count(*)::int n, count(*) filter (where proconfig::text like '%search_path=%')::int pinned
        from pg_proc where pronamespace = 'public'::regnamespace and proname in ('fn_taxonomy_topic_of','fn_syllabus_mapping_node_fields','fn_syllabus__repointed_draft',
          'fn_syllabus_intake_audit','fn_syllabus_intake_create','fn_syllabus_intake_decide','fn_syllabus_intake_import','fn_syllabus_intake_discard')`);
      chk('A-3 the 8 new functions: none SECURITY DEFINER (SECDEF ratchet unchanged), all pin search_path', f.n === 8 && f.secdef === 0 && f.pinned === 8, JSON.stringify(f));

      const [sess] = (await svc(`insert into public.syllabus_intake_sessions (exam_id, source_url, as_of_date, payload, payload_sha256, created_by_email)
                                 values ($1, 'https://example.test/notice', '2026-01-01', '{"contract_version":2}', repeat('a', 64), $2) returning id`, [qaExam.id, ACTOR_EMAIL])).rows;
      const anonSel = await as('anon', { role: 'anon' }, `select count(*)::int n from public.syllabus_intake_sessions`);
      const stuSel = await as('authenticated', STU, `select count(*)::int n from public.syllabus_intake_sessions`);
      const staffSel = await as('authenticated', STAFF, `select count(*)::int n from public.syllabus_intake_sessions where id = $1`, [sess.id]);
      const staffIns = await as('authenticated', STAFF, `insert into public.syllabus_intake_items (session_id, item_key, level, position, raw_name, match_status) values ($1, 'p0', 'PAPER', 0, 'x', 'NOT_APPLICABLE')`, [sess.id]);
      chk('A-4 intake tables: anon no read (42501); student 0 rows (RLS); staff reads; no client writes (42501)',
        anonSel.code === '42501' && stuSel.ok && stuSel.rows[0].n === 0 && staffSel.ok && staffSel.rows[0].n === 1 && staffIns.code === '42501', JSON.stringify({ anonSel, stuSel, staffSel, staffIns: staffIns.code }));
    });

    // ---------------- B: intake end to end
    await chunk(async () => {
      await migrate();
      // GATE-SCOPE-SWEEP (2026-10-29): the smoke's OWN subject + two topics (EXACT; words that appear nowhere else in the
      // payload, so the matcher's word rule cannot turn another item into a near-miss), made in this rolled-back chunk — a real
      // subject "first by name with ≥ 2 topics" changes as the owner adds subjects / renames topics; plus a QA alias target,
      // a near-miss (CLOSE) and new material (NEW)
      const subjId = await mkNode(null, 'SUBJECT', 'Ledger Fixture Domain', 'ca2-ledger-fixture-domain');
      const subj = { id: subjId, name: 'Ledger Fixture Domain' };
      const topics = [];
      for (const [name, slug] of [['Ledger Fixture Alpha', 'ca2-ledger-fixture-alpha'], ['Ledger Fixture Beta', 'ca2-ledger-fixture-beta']]) topics.push({ id: await mkNode(subj.id, 'TOPIC', name, slug), name });
      const aliasTopic = await mkNode(subj.id, 'TOPIC', 'CA2 Smoke Alias Target', 'ca2-smoke-alias-target');
      const closeTopic = await mkNode(subj.id, 'TOPIC', 'CA2 Smoke Boat and Stream', 'ca2-smoke-boat-and-stream');
      const payload = {
        contract_version: 2, exam: qaExam.slug, cycle_year: null, tier: 'ca2-smoke', source_url: 'https://example.test/notice.pdf', as_of: '2026-10-01',
        papers: [{ name: 'Paper I', marks: 200, questions: 100, subjects: [
          { name: subj.name, questions: 25, weightage_tier: 'CORE', topics: [
            { name: topics[0].name },
            { name: 'CA2 Smoke Renamed Item', aliases: ['CA2 Smoke Alias Target'] },
            { name: 'CA2 Smoke Boats and Streams' },
            { name: 'CA2 Smoke Brand New Topic', uncertain: true, uncertain_reason: 'Printed only in the annexure.',
              subtopics: [{ name: 'CA2 Smoke New Subtopic', concepts: [{ name: 'CA2 Smoke New Concept', headings: ['Deeper heading'] }] }] },
          ] },
          { name: 'CA2 Smoke Unknown Subject', topics: [{ name: 'CA2 Smoke Orphan Topic' }] },
        ] }],
      };
      const v = validateIntakePayload(JSON.stringify(payload), { examSlug: qaExam.slug, cycleYear: null, tier: 'ca2-smoke' });
      const nodes = await q(`select id, parent_id "parentId", node_type "nodeType", name, name_hi "nameHi", is_active "isActive" from public.canonical_taxonomy_nodes`);
      const aliases = await q(`select node_id "nodeId", normalized_alias normalized from public.taxonomy_node_aliases`);
      const matched = v.ok ? matchIntake(v.items, nodes, aliases) : [];
      const st = Object.fromEntries(matched.map((x) => [x.name, x.match_status]));
      chk('B-1 contract v2 + matcher (TS sources): EXACT subject + topic, ALIAS via the item alias, CLOSE near-miss with suggestions, NEW topic / subtopic / concept, unknown subject = NEW branch',
        v.ok && st[subj.name] === 'EXACT' && st[topics[0].name] === 'EXACT' && st['CA2 Smoke Renamed Item'] === 'ALIAS' && st['CA2 Smoke Boats and Streams'] === 'CLOSE'
        && st['CA2 Smoke Brand New Topic'] === 'NEW' && st['CA2 Smoke New Concept'] === 'NEW' && st['CA2 Smoke Unknown Subject'] === 'NEW'
        && matched.find((x) => x.name === 'CA2 Smoke Boats and Streams').candidates[0]?.node_id === closeTopic, JSON.stringify({ v: v.ok ? v.stats : v.errors, st }));

      const forged = matched.map((x) => (x.name === 'CA2 Smoke Orphan Topic' ? { ...x, match_status: 'EXACT', matched_node_id: topics[1].id } : x));
      const bad = await svc(`select public.fn_syllabus_intake_create($1, null, 'ca2-smoke', $2, $3, $4, $5, null, $6) id`, [qaExam.id, payload.source_url, payload.as_of, payload, JSON.stringify(forged), ACTOR_EMAIL]);
      const markup = matched.map((x) => (x.name === 'CA2 Smoke Orphan Topic' ? { ...x, name: '<b>bold</b>' } : x));
      const bad2 = await svc(`select public.fn_syllabus_intake_create($1, null, 'ca2-smoke', $2, $3, $4, $5, null, $6) id`, [qaExam.id, payload.source_url, payload.as_of, payload, JSON.stringify(markup), ACTOR_EMAIL]);
      const created = await svc(`select public.fn_syllabus_intake_create($1, null, 'ca2-smoke', $2, $3, $4, $5, null, $6) id`, [qaExam.id, payload.source_url, payload.as_of, payload, JSON.stringify(matched), ACTOR_EMAIL]);
      const session = created.ok ? created.rows[0].id : null;
      const items = session ? await q(`select id, raw_name, level, match_status, matched_node_id from public.syllabus_intake_items where session_id = $1`, [session]) : [];
      const it = (n) => items.find((x) => x.raw_name === n);
      chk(`B-2 staging: a forged EXACT claim (a node not under the matched parent) and markup are refused; the honest intake stores ${matched.length} items, nothing in the tree or a syllabus yet`,
        rule(bad, /not an active TOPIC under its matched parent/) && rule(bad2, /markup/) && created.ok && items.length === matched.length, JSON.stringify({ bad, bad2, created }));

      const dec = async (name, d, node) => svc(`select public.fn_syllabus_intake_decide($1, $2, $3, null, $4) r`, [it(name).id, d, node, ACTOR_EMAIL]);
      const early = await dec(topics[0].name, 'LINK', topics[0].id);
      const importEarly = await svc(`select public.fn_syllabus_intake_import($1, null, null, $2)`, [session, ACTOR_EMAIL]);
      const d1 = await dec(subj.name, 'LINK', subj.id);
      const wrongScope = await dec(topics[0].name, 'LINK', topics[0].id === aliasTopic ? closeTopic : (await q(`select id from public.canonical_taxonomy_nodes where node_type = 'TOPIC' and parent_id <> $1 and is_active limit 1`, [subj.id]))[0].id);
      const d2 = await dec(topics[0].name, 'LINK', topics[0].id);
      const d3 = await dec('CA2 Smoke Renamed Item', 'ALIAS', aliasTopic);
      const d4 = await dec('CA2 Smoke Boats and Streams', 'LINK', closeTopic);
      const d5 = await dec('CA2 Smoke Brand New Topic', 'APPROVE_NEW', null);
      const d6 = await dec('CA2 Smoke New Subtopic', 'APPROVE_NEW', null);
      const d7 = await dec('CA2 Smoke New Concept', 'APPROVE_NEW', null);
      const d8 = await dec('CA2 Smoke Unknown Subject', 'IGNORE', null);
      const redo = await dec('CA2 Smoke Renamed Item', 'LINK', aliasTopic);
      const [aliasRow] = await q(`select count(*)::int n from public.taxonomy_node_aliases where node_id = $1 and alias = 'CA2 Smoke Renamed Item' and source = 'INTAKE'`, [aliasTopic]);
      // GATE-SCOPE: only the nodes THIS smoke's intake created (the owner's intakes created real nodes too)
      const created3 = await q(`select n.node_type, n.name, p.name parent from public.canonical_taxonomy_nodes n left join public.canonical_taxonomy_nodes p on p.id = n.parent_id
          where n.metadata->>'source' = 'SYLLABUS_INTAKE' and (n.metadata->>'intake_item_id')::uuid in (select id from public.syllabus_intake_items where session_id = $1) order by n.node_depth`, [session]);
      const [orphan] = await q(`select decision from public.syllabus_intake_items where session_id = $1 and raw_name = 'CA2 Smoke Orphan Topic'`, [session]);
      const [aud] = await q(`select count(*) filter (where action_type = 'SYLLABUS_INTAKE_DECISION')::int dec, count(*) filter (where action_type = 'TAXONOMY_NODE_CREATE')::int cre,
                               count(*) filter (where action_type = 'TAXONOMY_ALIAS_ADD')::int ali from public.admin_audit_logs where actor_email = $1`, [ACTOR_EMAIL]);
      chk('B-3 decisions: the parent first; LINK only inside the parent\'s scope; ALIAS adds the item name as an INTAKE alias; APPROVE_NEW creates topic → subtopic → concept (audited); IGNORE covers the whole branch; a tree-changing decision is final; import waits for every item',
        rule(early, /decide the parent/) && rule(importEarly, /not decided/) && d1.ok && rule(wrongScope, /link/) && d2.ok && d3.ok && d4.ok && d5.ok && d6.ok && d7.ok && d8.ok && rule(redo, /cannot be re-decided/)
        && aliasRow.n === 1 && created3.map((x) => x.node_type).join(',') === 'TOPIC,SUBTOPIC,CONCEPT' && created3[0].parent === subj.name && orphan.decision === 'IGNORE'
        && aud.dec === 8 && aud.cre === 3 && aud.ali === 1,
        JSON.stringify({ early, importEarly, d1, wrongScope, d5, d6, d7, redo, aliasRow, created3, orphan, aud }));

      const imp = await svc(`select public.fn_syllabus_intake_import($1, 'ca2-smoke-v1', null, $2) r`, [session, ACTOR_EMAIL]);
      const r = imp.ok ? imp.rows[0].r : {};
      const [ver] = imp.ok ? await q(`select status, tier, source_kind, version_tag, metadata->'intake'->>'source_url' src from public.exam_syllabus_versions where id = $1`, [r.version_id]) : [{}];
      const maps = imp.ok ? await q(`select u.raw_title unit, m.canonical_node_type t, m.topic_id = (select id from public.canonical_taxonomy_nodes where name = 'CA2 Smoke Brand New Topic') rolls_up, m.match_status s
                                       from public.exam_syllabus_canonical_mappings m join public.exam_syllabus_nodes u on u.id = m.syllabus_node_id where u.syllabus_version_id = $1 order by u.display_order`, [r.version_id]) : [];
      const [unit] = imp.ok ? await q(`select metadata from public.exam_syllabus_nodes where syllabus_version_id = $1 and raw_title = 'CA2 Smoke Brand New Topic'`, [r.version_id]) : [{}];
      const report = imp.ok ? (await q(`select public.fn_syllabus__validate($1) r`, [r.version_id]))[0].r : {};
      const again = await svc(`select public.fn_syllabus_intake_import($1, null, null, $2)`, [session, ACTOR_EMAIL]);
      const conceptMap = maps.find((x) => x.unit === 'CA2 Smoke Brand New Topic');
      chk('B-4 import: one DRAFT (tier ca2-smoke, IMPORT, source link kept): PAPER → SECTION → 4 UNITs (the ignored branch left out); the new topic\'s unit maps its CONCEPT, which rolls up to the topic; ALIAS kept as ALIAS_MATCH; uncertain + headings kept and reported; validation passes; a second import is refused',
        imp.ok && r.papers === 1 && r.sections === 1 && r.units === 4 && ver.status === 'DRAFT' && ver.tier === 'ca2-smoke' && ver.source_kind === 'IMPORT' && ver.src === payload.source_url
        && conceptMap && conceptMap.t === 'CONCEPT' && conceptMap.rolls_up === true && maps.some((x) => x.s === 'ALIAS_MATCH')
        && unit.metadata.uncertain === true && JSON.stringify(unit.metadata.headings) === '["Deeper heading"]'
        && report.ok === true && report.warnings.some((w) => w.code === 'UNCERTAIN_ITEM') && rule(again, /IMPORTED/),
        JSON.stringify({ imp, ver, maps, unit, report: { ok: report.ok, errors: report.errors }, again }));

      const sub = (await q(`select id from public.canonical_taxonomy_nodes where name = 'CA2 Smoke New Subtopic'`))[0];
      const mv = await svc(`select public.fn_taxonomy_move_node($1, $2, null, $3)`, [sub.id, closeTopic, ACTOR_EMAIL]);
      chk('B-5 roll-up guard: a SUBTOPIC whose branch a syllabus maps below topic level cannot move to another topic', rule(mv, /re-map them first/), JSON.stringify(mv));
    });

    // ---------------- C: tiers, merge into a re-pointed DRAFT, merge roll-up guard
    await chunk(async () => {
      await migrate();
      const [subj] = await q(`select id from public.canonical_taxonomy_nodes where node_type = 'SUBJECT' and is_active order by name limit 1`);
      const X = await mkNode(subj.id, 'TOPIC', 'CA2 Smoke Merge Source', 'ca2-smoke-merge-source');
      const Y = await mkNode(subj.id, 'TOPIC', 'CA2 Smoke Merge Target', 'ca2-smoke-merge-target');
      // two published versions of the QA exam, different tiers (built as the owner, published through the JWT-checked RPC)
      const build = async (tier, node = X) => {
        const [v] = await q(`select (public.fn_syllabus__create_version($1, null, $2, 'MANUAL', null, null, '{}'::jsonb)).id`, [qaExam.id, `ca2-${tier}`]);
        await q(`update public.exam_syllabus_versions set tier = $2 where id = $1`, [v.id, tier]);
        const sec = (await q(`select public.fn_syllabus__insert_node($1, null, 'SECTION', 'Section', null, 1, null, null, null, null, true) id`, [v.id]))[0].id;
        const unit = (await q(`select public.fn_syllabus__insert_node($1, $2, 'UNIT', 'Unit', null, 1, null, null, null, null, true) id`, [v.id, sec]))[0].id;
        await q(`insert into public.exam_syllabus_canonical_mappings (syllabus_node_id, canonical_node_id, match_status, match_confidence, match_method) values ($1, $2, 'MANUALLY_MAPPED', 1, 'MANUAL')`, [unit, node]);
        const pub = await as('authenticated', ADMIN, `select public.fn_syllabus_publish($1) r`, [v.id]);
        return { id: v.id, pub };
      };
      const t1 = await build('ca2-tier-a');
      const t2 = await build('ca2-tier-b');
      const [both] = await q(`select count(*) filter (where status = 'PUBLISHED')::int pub from public.exam_syllabus_versions where id in ($1, $2)`, [t1.id, t2.id]);
      chk('C-1 tiers: two PUBLISHED versions of one exam + cycle live side by side when their tiers differ (publish archives only the same tier)',
        t1.pub.ok && t1.pub.rows[0].r.success === true && t2.pub.ok && t2.pub.rows[0].r.success === true && both.pub === 2, JSON.stringify({ t1: t1.pub, t2: t2.pub, both }));

      const mg = await svc(`select public.fn_taxonomy_merge_nodes($1, $2, null, $3, 'CA-2 smoke merge') r`, [X, Y, ACTOR_EMAIL]);
      const res = mg.ok ? mg.rows[0].r : {};
      const drafts = res.syllabus_drafts || [];
      const pubRows = await q(`select count(*)::int n from public.exam_syllabus_canonical_mappings m join public.exam_syllabus_nodes n on n.id = m.syllabus_node_id
                                where n.syllabus_version_id in ($1, $2) and m.canonical_node_id = $3`, [t1.id, t2.id, X]);
      const draftRows = drafts.length ? await q(`select v.tier, v.status, m.canonical_node_id = $2 to_target from public.exam_syllabus_versions v join public.exam_syllabus_nodes n on n.syllabus_version_id = v.id
                                                   join public.exam_syllabus_canonical_mappings m on m.syllabus_node_id = n.id where v.id = any($1::uuid[]) order by v.tier`, [drafts.map((d) => d.draft_version_id), Y]) : [];
      const [xa] = await q(`select is_active from public.canonical_taxonomy_nodes where id = $1`, [X]);
      chk('C-2 merge of a node in PUBLISHED syllabi: each published version (both tiers) gets a re-pointed DRAFT copy (same tier, maps the target); the published rows stay as they were; the source is deactivated',
        mg.ok && drafts.length === 2 && pubRows[0].n === 2 && draftRows.length === 2 && draftRows.every((d) => d.status === 'DRAFT' && d.to_target) && draftRows.map((d) => d.tier).join(',') === 'ca2-tier-a,ca2-tier-b' && xa.is_active === false,
        JSON.stringify({ mg, pubRows, draftRows }));

      const Z = await mkNode(subj.id, 'TOPIC', 'CA2 Smoke Merge Third', 'ca2-smoke-merge-third');
      const W = await mkNode(subj.id, 'TOPIC', 'CA2 Smoke Merge Fourth', 'ca2-smoke-merge-fourth');
      // a published version (tier c) maps Z while a DRAFT of the same exam / cycle / tier is open → blocked, nothing changed
      const t3 = await build('ca2-tier-c', Z);
      const [v3] = await q(`select (public.fn_syllabus__create_version($1, null, 'ca2-open', 'MANUAL', null, null, '{}'::jsonb)).id`, [qaExam.id]);
      await q(`update public.exam_syllabus_versions set tier = 'ca2-tier-c' where id = $1`, [v3.id]);
      const blocked = await svc(`select public.fn_taxonomy_merge_nodes($1, $2, null, $3, 'CA-2 smoke blocked')`, [Z, Y, ACTOR_EMAIL]);
      const [ya] = await q(`select is_active from public.canonical_taxonomy_nodes where id = $1`, [Z]);
      // the roll-up guard: a SUBTOPIC below the source mapped by a syllabus
      const S1 = await mkNode(W, 'SUBTOPIC', 'CA2 Smoke Mapped Subtopic', 'ca2-smoke-mapped-subtopic');
      const sec = (await q(`select public.fn_syllabus__insert_node($1, null, 'SECTION', 'S', null, 1, null, null, null, null, true) id`, [v3.id]))[0].id;
      const unit = (await q(`select public.fn_syllabus__insert_node($1, $2, 'UNIT', 'U', null, 1, null, null, null, null, true) id`, [v3.id, sec]))[0].id;
      await q(`insert into public.exam_syllabus_canonical_mappings (syllabus_node_id, canonical_node_id, match_status, match_confidence, match_method) values ($1, $2, 'MANUALLY_MAPPED', 1, 'MANUAL')`, [unit, S1]);
      const [rm] = await q(`select canonical_node_type t, topic_id = $2 rolls from public.exam_syllabus_canonical_mappings where syllabus_node_id = $1`, [unit, W]);
      const guard = await svc(`select public.fn_taxonomy_merge_nodes($1, $2, null, $3, 'CA-2 smoke roll-up')`, [W, Z, ACTOR_EMAIL]);
      chk('C-3 fail-closed: an open DRAFT for that exam / cycle / tier blocks the merge (source still active); a SUBTOPIC mapping rolls up to its topic, and a merge that would move it under another topic is refused',
        t3.pub.ok && t3.pub.rows[0].r.success === true && rule(blocked, /DRAFT syllabus is already open/) && ya.is_active === true && rm.t === 'SUBTOPIC' && rm.rolls === true && rule(guard, /re-map them first/),
        JSON.stringify({ blocked, ya, rm, guard }));
    });

    // ---------------- Z: nothing left behind
    // GATE-SCOPE: smoke nodes = CA2_SMOKE nodes + intake nodes whose intake item no longer exists (a rolled-back or
    // deleted smoke session); the owner's real intake nodes keep their items and are not counted
    const [z] = await q(`select (select count(*)::int from public.canonical_taxonomy_nodes n where n.metadata->>'source' = 'CA2_SMOKE'
            or (n.metadata->>'source' = 'SYLLABUS_INTAKE' and ${PRE ? 'true' : `not exists (select 1 from public.syllabus_intake_items i where i.id::text = n.metadata->>'intake_item_id')`})) nodes,
        (select count(*)::int from public.admin_audit_logs where actor_email = $1) audit,
        (select count(*)::int from public.exam_syllabus_versions where version_tag like 'ca2-%') versions,
        to_regclass('public.syllabus_intake_sessions') is not null intake_table`, [ACTOR_EMAIL]);
    chk(`Z-1 nothing persisted: 0 smoke nodes, versions and audit rows${PRE ? '; the migration itself rolled back (no intake tables)' : ''}`,
      z.nodes === 0 && z.audit === 0 && z.versions === 0 && z.intake_table === !PRE, JSON.stringify(z));
    flush();
  } catch (e) {
    ok = false;
    flush();
    console.log(`FAIL CA2 smoke aborted — ${red(String(e.message)).slice(0, 300)}`);
  } finally {
    await c.end().catch(() => {});
  }
  console.log(ok ? 'CA2-INTAKE: ALL PASS' : 'CA2-INTAKE: FAILURES');
  process.exit(ok ? 0 : 1);
})();
