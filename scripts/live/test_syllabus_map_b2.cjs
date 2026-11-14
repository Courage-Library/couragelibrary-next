#!/usr/bin/env node
/**
 * SYLLABUS-MAP-1 B2 (migration 139) — DB gate AS THE REAL ROLES; every block runs in a transaction that is ALWAYS rolled
 * back (withLiveTransaction). The files go through the SAME pure validators + matcher the server uses
 * (lib/syllabus/*-contract.ts, lib/syllabus/map-matcher.ts) and the samples data/syllabus-map/*.sample.json.
 *   --local=<port>  a throwaway LOCAL PostgreSQL (docs/database/LOCAL_PG_TEST.md); refuses any host but 127.0.0.1
 *   (default)       the project database — ONLY with the owner present
 *   --pre           139 is not applied yet: each block first runs the migration
 *   M-1 schema: two staging tables, RLS on, no client privilege; 9 functions — 0 SECURITY DEFINER, search_path "",
 *       service_role only; the v3 intake functions keep their exact definitions (--pre: md5 before = after)
 *   M-2 MASTER sample: 3 path refs linked at once; the proposed topic + 2 subtopics undecided; the same file again →
 *       the same session, 0 new rows (idempotent); a second open session with the same file → 23505 (unique index)
 *   M-3 order + creation: import refused while undecided; a subtopic before its proposed topic → refused; the topic →
 *       ONE master node + TAXONOMY_NODE_CREATE audit + its alias; import → outlines set through fn_taxonomy_outline_set,
 *       the alias added; re-import / the same file again → refused
 *   M-4 outline conflict: a different outline for a node that has one → import refused until REPLACE / KEEP; KEEP leaves
 *       the master outline as it was; REPLACE replaces it
 *   M-5 fuzzy NEVER auto-creates / links: "Mirror Images" → CLOSE, undecided, no node created by the create; APPROVE_NEW
 *       on a name / path item → 22023 BY the "only a proposed node" guard (message checked); a name item can never carry a
 *       parent (23514); the import refused until decided
 *   M-6 claims are RE-CHECKED: an alias of a real node → ALIAS linked; a forged ALIAS / EXACT_REF / EXACT claim → 22023
 *   M-7 EXAM sample → ONE DRAFT version: 1 paper, 5 sections (2 in the choice group), 16 units (one per master topic),
 *       21 mappings, the per-exam weightage on the units, 5 DRAFT selection stages; candidates see NONE of it (the
 *       read model as anon: NO_SYLLABUS; the stages as anon: 0 rows)
 *   M-8 guards: re-decide after a creation → refused; LINK to the wrong level / an internal node / outside the subject →
 *       22023; weightage on a master file → P0002; outline action without a conflict → 22023; after discard → refused
 *   M-9 unrelated data unchanged by create / decide-LINK / discard (master tree, aliases, syllabus versions / nodes /
 *       mappings, stages); --pre: across the apply too
 *   M-10 rollback 139 (in the transaction): every 139 object gone; the v3 intake functions still there
 * Run: node scripts/live/test_syllabus_map_b2.cjs --local=54329 [--pre]   |   node scripts/live/test_syllabus_map_b2.cjs [--pre]
 */
require('../db/safe-net.cjs'); // SAFE-NET: masks IPs / hosts / e-mails / keys in all output (scripts/db/safe-net.cjs)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Module = require('module');
const ROOT = path.resolve(__dirname, '..', '..');
const ts = require('typescript');
const { Client } = require('pg');
const { pgClient } = require(path.join(ROOT, 'scripts/db/safe-net.cjs'));
const { withLiveTransaction } = require(path.join(ROOT, 'scripts/db/live-safety.cjs'));

const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request.startsWith('@/')) return origResolve.call(this, path.resolve(ROOT, request.slice(2)), parent, isMain, options);
  return origResolve.call(this, request, parent, isMain, options);
};
require.extensions['.ts'] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText, filename);
};
const MI = require(path.join(ROOT, 'lib/syllabus/master-intake-contract.ts'));
const EM = require(path.join(ROOT, 'lib/syllabus/exam-map-contract.ts'));
const MM = require(path.join(ROOT, 'lib/syllabus/map-matcher.ts'));
const { QA_RUN_SLUG_LIKE } = require(path.join(ROOT, 'lib/qa/fixtures.ts'));

const PRE = process.argv.includes('--pre');
const LOCAL = (process.argv.find((a) => a.startsWith('--local=')) || '').slice('--local='.length);
const FILE = '20261115000139_syllabus_map_b2.sql';
const SQL = fs.readFileSync(path.join(ROOT, 'supabase/migrations', FILE), 'utf8');
const RB = fs.readFileSync(path.join(ROOT, 'docs/database/rollback/139_rollback.sql'), 'utf8');
const MASTER = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/syllabus-map/master-intake.sample.json'), 'utf8'));
const EXAM = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/syllabus-map/exam-map.sample.json'), 'utf8'));
const ACTOR = 'syllabus-map-b2@courage-library.test';
const FNS = ['fn_syllabus_map__audit', 'fn_syllabus_map__node_ok', 'fn_syllabus_map__outline_conflict', 'fn_syllabus_map_create', 'fn_syllabus_map_decide', 'fn_syllabus_map_set_outline_action', 'fn_syllabus_map_set_weightage', 'fn_syllabus_map_import', 'fn_syllabus_map_discard'];
const V3 = ['fn_syllabus_intake_create', 'fn_syllabus_intake_decide', 'fn_syllabus_intake_import', 'fn_syllabus_intake_bulk', 'fn_syllabus_intake_bulk_undo', 'fn_syllabus_intake_discard', 'fn_syllabus_intake__approve_node'];

let ok = true;
const chk = (n, cond, info) => {
  if (!cond) ok = false;
  console.log(`${cond ? 'PASS' : 'FAIL'} ${n}${cond ? '' : ' — ' + String(info ?? '').slice(0, 700)}`);
};
const clone = (o) => JSON.parse(JSON.stringify(o));

function client() {
  if (!LOCAL) return pgClient();
  if (!/^\d{4,5}$/.test(LOCAL)) throw new Error('--local=<port>');
  const c = new Client({ host: '127.0.0.1', port: Number(LOCAL), user: 'postgres', database: 'postgres' });
  c.on('error', () => {});
  return c;
}

(async () => {
  const c = client();
  await c.connect();
  const q = async (s, p) => (await c.query(s, p)).rows;
  const one = async (s, p) => (await q(s, p))[0];
  const errCode = async (s, p) => {
    await c.query('SAVEPOINT t');
    try {
      await c.query(s, p);
      await c.query('RELEASE SAVEPOINT t');
      return null;
    } catch (e) {
      await c.query('ROLLBACK TO SAVEPOINT t');
      return e.code || 'ERR';
    }
  };
  /** the error MESSAGE of a statement run under a savepoint (null = it succeeded) */
  const errMsg = async (s, p) => {
    await c.query('SAVEPOINT t');
    try {
      await c.query(s, p);
      await c.query('RELEASE SAVEPOINT t');
      return null;
    } catch (e) {
      await c.query('ROLLBACK TO SAVEPOINT t');
      return String(e.message || 'ERR');
    }
  };
  const as = async (role, fn) => {
    await c.query(`SET LOCAL ROLE ${role}`);
    try {
      return await fn();
    } finally {
      await c.query('RESET ROLE');
    }
  };
  const svc = (fn) => as('service_role', fn);

  // the server's create: validate → match against the tree → fn_syllabus_map_create (as service_role)
  async function prepare(raw) {
    const nodes = (await q(`select id, parent_id, node_type, name, name_hi, hierarchy_path, is_active, is_internal from public.canonical_taxonomy_nodes where slug not like $1`, [QA_RUN_SLUG_LIKE])).map((n) => ({ id: n.id, parentId: n.parent_id, nodeType: n.node_type, name: n.name, nameHi: n.name_hi, path: n.hierarchy_path, isActive: n.is_active, isInternal: n.is_internal === true }));
    const aliases = (await q(`select node_id, normalized_alias from public.taxonomy_node_aliases`)).map((a) => ({ nodeId: a.node_id, normalized: a.normalized_alias }));
    const sha = crypto.createHash('sha256').update(JSON.stringify(raw), 'utf8').digest('hex');
    if (raw.contract === 'MASTER_INTAKE') {
      const v = MI.validateMasterIntake(raw);
      if (!v.ok) throw new Error(`fixture invalid: ${JSON.stringify(v.errors)}`);
      const m = MM.matchMasterIntake(v.value, nodes, aliases);
      if (!m.ok) throw new Error(`match: ${JSON.stringify(m.errors)}`);
      return { args: ['MASTER_INTAKE', m.subjectNodeId, null, null, null], items: m.items, sha };
    }
    const v = EM.validateExamMap(raw);
    if (!v.ok) throw new Error(`fixture invalid: ${JSON.stringify(v.errors)}`);
    const exam = await one(`select id from public.exams where slug = $1`, [v.value.exam]);
    const m = MM.matchExamMap(v.value, nodes, aliases);
    if (!m.ok) throw new Error(`match: ${JSON.stringify(m.errors)}`);
    return { args: ['EXAM_MAP', null, exam.id, null, v.value.tier], items: m.items, sha };
  }
  const create = async (raw, mutate) => {
    const p = await prepare(raw);
    if (mutate) mutate(p.items);
    return svc(() => one(`select public.fn_syllabus_map_create($1, $2, $3, $4, $5, $6::jsonb, $7, $8::jsonb, null, $9) r`, [...p.args, JSON.stringify(raw), p.sha, JSON.stringify(p.items), ACTOR])).then((r) => r.r);
  };
  const createCode = async (raw, mutate) => {
    const p = await prepare(raw);
    if (mutate) mutate(p.items);
    return svc(() => errCode(`select public.fn_syllabus_map_create($1, $2, $3, $4, $5, $6::jsonb, $7, $8::jsonb, null, $9)`, [...p.args, JSON.stringify(raw), p.sha, JSON.stringify(p.items), ACTOR]));
  };
  const items = (sid) => q(`select * from public.syllabus_map_items where session_id = $1 order by position`, [sid]);
  const item = async (sid, key) => (await items(sid)).find((i) => i.item_key === key);
  const decide = (id, d, node) => svc(() => one(`select public.fn_syllabus_map_decide($1, $2, $3, null, $4) r`, [id, d, node, ACTOR])).then((r) => r.r);
  const decideCode = (id, d, node) => svc(() => errCode(`select public.fn_syllabus_map_decide($1, $2, $3, null, $4)`, [id, d, node, ACTOR]));
  const importS = (sid) => svc(() => one(`select public.fn_syllabus_map_import($1, null, null, $2) r`, [sid, ACTOR])).then((r) => r.r);
  const importCode = (sid) => svc(() => errCode(`select public.fn_syllabus_map_import($1, null, null, $2)`, [sid, ACTOR]));
  const nodeId = async (p) => (await one(`select id from public.canonical_taxonomy_nodes where hierarchy_path = $1`, [p])).id;
  const HASH = `select md5(coalesce(string_agg(r, '|' order by r), '')) h from (
      select concat_ws(',', id, name, name_hi, slug, parent_id, hierarchy_path, node_type, is_active, is_internal, metadata::text) r from public.canonical_taxonomy_nodes
      union all select concat_ws(',', 'a', node_id, normalized_alias, language) from public.taxonomy_node_aliases
      union all select concat_ws(',', 'n', id, syllabus_version_id, parent_node_id, raw_title, node_kind, weightage_tier, metadata::text) from public.exam_syllabus_nodes
      union all select concat_ws(',', 'm', id, syllabus_node_id, canonical_node_id, match_status) from public.exam_syllabus_canonical_mappings
      union all select concat_ws(',', 'v', id, exam_id, status, version_number) from public.exam_syllabus_versions
      union all select concat_ws(',', 'o', node_id, items::text) from public.taxonomy_node_outlines
      union all select concat_ws(',', 's', id, status) from public.exam_selection_stages) x`;
  const V3DEF = `select string_agg(p.proname || ':' || md5(pg_get_functiondef(p.oid)), ',' order by p.proname, md5(pg_get_functiondef(p.oid))) d from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = any($1)`;

  try {
    const led = await one(`select count(*)::int n from public.schema_migration_ledger where filename = $1 and status = 'APPLIED'`, [FILE]);
    if (PRE && led.n) throw new Error('--pre refused: 139 is already APPLIED');
    if (!PRE && !led.n) throw new Error('139 is not applied (use --pre)');
    const apply = async () => {
      if (PRE) await c.query(SQL);
    };

    // M-1 + M-9 (apply) ---------------------------------------------------------------------------------
    await withLiveTransaction(c, async () => {
      const before = (await one(HASH)).h;
      const v3Before = (await one(V3DEF, [V3])).d;
      await apply();
      const t = await q(`select c.relname, c.relrowsecurity rls, has_table_privilege('anon', c.oid, 'SELECT') a, has_table_privilege('authenticated', c.oid, 'SELECT') u
                           from pg_class c where c.oid in ('public.syllabus_map_sessions'::regclass, 'public.syllabus_map_items'::regclass)`);
      chk('M-1a two staging tables: RLS on, no client privilege', t.length === 2 && t.every((x) => x.rls && !x.a && !x.u), JSON.stringify(t));
      const f = await q(`select p.proname, p.prosecdef, array_to_string(p.proconfig, ',') cfg, has_function_privilege('anon', p.oid, 'EXECUTE') a,
                                has_function_privilege('authenticated', p.oid, 'EXECUTE') u, has_function_privilege('service_role', p.oid, 'EXECUTE') s
                           from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = any($1)`, [FNS]);
      chk('M-1b 9 functions: 0 SECURITY DEFINER, search_path "", service_role only', f.length === 9 && f.every((x) => !x.prosecdef && x.cfg === 'search_path=""' && !x.a && !x.u && x.s), JSON.stringify(f.filter((x) => x.prosecdef || x.cfg !== 'search_path=""' || x.a || x.u || !x.s)));
      const v3After = (await one(V3DEF, [V3])).d;
      chk(`M-1c the v3 intake functions keep their exact definitions${PRE ? ' across the apply' : ''} (${V3.length} names)`, v3Before === v3After && v3After.split(',').length >= V3.length, `${v3Before} ≠ ${v3After}`);
      chk(`M-9a unrelated data unchanged${PRE ? ' across the apply' : ''}`, before === (await one(HASH)).h);
    });

    // M-2 + M-3 MASTER sample ------------------------------------------------------------------------------
    await withLiveTransaction(c, async () => {
      await apply();
      const before = (await one(HASH)).h;
      const r1 = await create(MASTER);
      const its = await items(r1.session_id);
      const linked = its.filter((i) => i.decision === 'LINK');
      const open = its.filter((i) => i.decision === null);
      chk('M-2a MASTER: 3 path refs linked at once; the proposed topic + 2 subtopics wait', r1.created && its.length === 6 && linked.length === 3 && linked.every((i) => i.match_status === 'EXACT_REF') && open.length === 3 && open.every((i) => i.kind === 'NEW'), JSON.stringify(its.map((i) => [i.item_key, i.match_status, i.decision])));
      chk('M-9b create changed nothing outside the staging tables', before === (await one(HASH)).h);
      const rows = (await one(`select (select count(*) from public.syllabus_map_sessions)::int s, (select count(*) from public.syllabus_map_items)::int i`));
      const r2 = await create(MASTER);
      const rows2 = (await one(`select (select count(*) from public.syllabus_map_sessions)::int s, (select count(*) from public.syllabus_map_items)::int i`));
      const dup = await svc(() => errCode(`insert into public.syllabus_map_sessions (contract, contract_version, subject_node_id, payload, payload_sha256, created_by_email)
                                            select contract, 1, subject_node_id, payload, payload_sha256, 'x@y.z' from public.syllabus_map_sessions where id = $1`, [r1.session_id]));
      chk('M-2b the same file again → the SAME session, 0 new rows; a second open session with it → 23505', !r2.created && r2.session_id === r1.session_id && rows.s === rows2.s && rows.i === rows2.i && dup === '23505', JSON.stringify({ r2, rows, rows2, dup }));

      chk('M-3a import refused while 3 items are undecided (P0001)', (await importCode(r1.session_id)) === 'P0001');
      const top = await item(r1.session_id, 'n3');
      const sub = await item(r1.session_id, 'n3.s0');
      chk('M-3b a subtopic before its proposed topic → refused', (await decideCode(sub.id, 'APPROVE_NEW', null)) === 'P0001');
      const nodesBefore = (await one(`select count(*)::int n from public.canonical_taxonomy_nodes`)).n;
      const d = await decide(top.id, 'APPROVE_NEW', null);
      const created = await one(`select n.node_type, n.name, n.name_hi, p.hierarchy_path parent, (select count(*) from public.taxonomy_node_aliases a where a.node_id = n.id)::int aliases,
                                        (select count(*) from public.admin_audit_logs l where l.action_type = 'TAXONOMY_NODE_CREATE' and l.target_id = n.id::text)::int audits
                                   from public.canonical_taxonomy_nodes n join public.canonical_taxonomy_nodes p on p.id = n.parent_id where n.id = $1`, [d.node_id]);
      chk('M-3c APPROVE_NEW → ONE master node (TOPIC under the subject, Hindi name) + its audit row + its alias',
        (await one(`select count(*)::int n from public.canonical_taxonomy_nodes`)).n === nodesBefore + 1 && created.node_type === 'TOPIC' && created.parent === 'english-comprehension' && created.name_hi === 'वाक्य पूर्ति' && created.aliases === 1 && created.audits === 1, JSON.stringify(created));
      for (const k of ['n3.s0', 'n3.s1']) await decide((await item(r1.session_id, k)).id, 'APPROVE_NEW', null);
      const res = await importS(r1.session_id);
      const syn = await nodeId('english-comprehension.synonyms');
      const sw = await nodeId('english-comprehension.synonyms.similar-word-meaning');
      const outl = await one(`select (select count(*) from public.taxonomy_node_outlines where source = 'MASTER_INTAKE')::int n, (select cardinality(items) from public.taxonomy_node_outlines where node_id = $1)::int sw,
                                     (select count(*) from public.taxonomy_node_aliases where node_id = $2 and normalized_alias = public.fn_taxonomy_normalize('Similar words'))::int alias`, [sw, syn]);
      chk('M-3d import → 5 outlines set (fn_taxonomy_outline_set), the alias added', res.outlines_set === 5 && res.aliases_added === 1 && outl.n === 5 && outl.sw === 6 && outl.alias === 1, JSON.stringify({ res, outl }));
      chk('M-3e re-import and the same file again → refused (P0001)', (await importCode(r1.session_id)) === 'P0001' && (await createCode(MASTER)) === 'P0001');
    });

    // M-4 outline conflict ---------------------------------------------------------------------------
    await withLiveTransaction(c, async () => {
      await apply();
      const sw = await nodeId('english-comprehension.synonyms.similar-word-meaning');
      await svc(() => q(`select public.fn_taxonomy_outline_set($1, $2::text[], 'OWNER', null, $3)`, [sw, ['Existing line one', 'Existing line two'], ACTOR]));
      const file = { ...clone(MASTER), nodes: [MASTER.nodes[1]] };
      const s1 = await create(file);
      const it = (await items(s1.session_id))[0];
      chk('M-4a a different outline → outline_conflict; import refused until REPLACE / KEEP', it.outline_conflict && (await importCode(s1.session_id)) === 'P0001');
      await svc(() => q(`select public.fn_syllabus_map_set_outline_action($1, 'KEEP', null, $2)`, [it.id, ACTOR]));
      const rk = await importS(s1.session_id);
      const kept = await one(`select items from public.taxonomy_node_outlines where node_id = $1`, [sw]);
      chk('M-4b KEEP → the master outline stays as it was', rk.outlines_kept === 1 && kept.items.join('|') === 'Existing line one|Existing line two', JSON.stringify({ rk, kept }));
      const file2 = { ...clone(MASTER), based_on: 'second paste (REPLACE)', nodes: [MASTER.nodes[1]] };
      const s2 = await create(file2);
      const it2 = (await items(s2.session_id))[0];
      await svc(() => q(`select public.fn_syllabus_map_set_outline_action($1, 'REPLACE', null, $2)`, [it2.id, ACTOR]));
      const rr = await importS(s2.session_id);
      const replaced = await one(`select cardinality(items) n, source from public.taxonomy_node_outlines where node_id = $1`, [sw]);
      chk('M-4c REPLACE → replaced through fn_taxonomy_outline_set', rr.outlines_set === 1 && replaced.n === 6 && replaced.source === 'MASTER_INTAKE', JSON.stringify({ rr, replaced }));
    });

    // M-5 + M-6 + M-7 EXAM sample ------------------------------------------------------------------------
    await withLiveTransaction(c, async () => {
      await apply();
      const nodesBefore = (await one(`select count(*)::int n from public.canonical_taxonomy_nodes`)).n;
      const r = await create(EXAM);
      const its = await items(r.session_id);
      const mirror = its.find((i) => i.raw_name === 'Mirror Images');
      const ssc = its.find((i) => i.raw_name === 'Successive Percentage Change');
      chk('M-5a fuzzy: "Mirror Images" → CLOSE with suggestions, UNDECIDED; nothing created by the create', mirror.match_status === 'CLOSE' && mirror.decision === null && mirror.candidates.length > 0 && (await one(`select count(*)::int n from public.canonical_taxonomy_nodes`)).n === nodesBefore, JSON.stringify(mirror));
      chk('M-5b APPROVE_NEW on a name / a path item → 22023; import refused while undecided',
        (await decideCode(mirror.id, 'APPROVE_NEW', null)) === '22023' && (await decideCode(its[0].id, 'APPROVE_NEW', null)) === '22023' && (await importCode(r.session_id)) === 'P0001');
      // the refusal is the "only a proposed node" guard itself (not merely a missing parent), and a name / path item can
      // never carry a parent (chk_map_item_parent): two layers
      const why = await svc(() => errMsg(`select public.fn_syllabus_map_decide($1, 'APPROVE_NEW', null, null, $2)`, [mirror.id, ACTOR]));
      const forgedParent = await createCode({ ...clone(EXAM), based_on: `M-5d ${Math.random()}` }, (xs) => {
        const n = xs.find((x) => x.kind === 'NAME');
        n.parent_node_id = xs.find((x) => x.kind === 'NEW').parent_node_id;
      });
      chk('M-5d APPROVE_NEW on a name item is refused by the "only a proposed node" guard; a name item with a parent → 23514', /only a proposed node can be created/.test(why || '') && forgedParent === '23514', JSON.stringify({ why, forgedParent }));
      chk('M-5c 19 path refs linked at once; the proposed subtopic waits (NEW)', its.filter((i) => i.decision === 'LINK').length === 19 && ssc.kind === 'NEW' && ssc.decision === null, JSON.stringify(its.map((i) => [i.item_key, i.match_status, i.decision])));
      await decide(mirror.id, 'LINK', await nodeId('general-intelligence-and-reasoning.non-verbal-reasoning.mirror-and-water-images'));
      await decide(ssc.id, 'APPROVE_NEW', null);
      const res = await importS(r.session_id);
      const v = await one(`select status, tier, metadata from public.exam_syllabus_versions where id = $1`, [res.version_id]);
      const counts = await one(`select count(*) filter (where node_kind = 'PAPER')::int papers, count(*) filter (where node_kind = 'SECTION')::int sections,
                                       count(*) filter (where node_kind = 'SECTION' and choice_group = 'optional-subject')::int grouped, count(*) filter (where node_kind = 'UNIT')::int units
                                  from public.exam_syllabus_nodes where syllabus_version_id = $1`, [res.version_id]);
      const maps = await one(`select count(*)::int n from public.exam_syllabus_canonical_mappings m join public.exam_syllabus_nodes n on n.id = m.syllabus_node_id where n.syllabus_version_id = $1`, [res.version_id]);
      const analogy = await one(`select weightage_tier, metadata ->> 'avg_questions' avg from public.exam_syllabus_nodes where syllabus_version_id = $1 and raw_title = 'Analogy'`, [res.version_id]);
      const stages = await one(`select count(*)::int n, bool_and(status = 'DRAFT') d from public.exam_selection_stages where exam_id = (select exam_id from public.exam_syllabus_versions where id = $1)`, [res.version_id]);
      chk('M-7a ONE DRAFT version: 1 paper, 5 sections (2 in the group), 16 units (one per master topic), 21 mappings, 5 DRAFT stages',
        v.status === 'DRAFT' && counts.papers === 1 && counts.sections === 5 && counts.grouped === 2 && counts.units === 16 && maps.n === 21 && stages.n === 5 && stages.d && res.selection_stages === 5 && v.metadata.choice_groups['optional-subject'].pick === 1,
        JSON.stringify({ res, counts, maps, stages, v: v.status }));
      chk('M-7b the per-exam weightage is on the unit (Analogy: HIGH_YIELD, 4 questions)', analogy.weightage_tier === 'HIGH_YIELD' && Number(analogy.avg) === 4, JSON.stringify(analogy));
      const exam = await one(`select exam_id from public.exam_syllabus_versions where id = $1`, [res.version_id]);
      const rm = await as('anon', () => one(`select public.fn_exam_syllabus_read_model($1, null) r`, [exam.exam_id]));
      const anonStages = await as('anon', () => one(`select count(*)::int n from public.exam_selection_stages where exam_id = $1`, [exam.exam_id]));
      const anonVersion = await as('anon', () => one(`select count(*)::int n from public.exam_syllabus_versions where id = $1`, [res.version_id]).catch(() => ({ n: 0 })));
      chk('M-7c candidates see none of the draft (read model as anon: no syllabus; stages: 0 rows; the draft version row: 0)', rm.r && rm.r.state === 'NO_SYLLABUS' && anonStages.n === 0 && anonVersion.n === 0, JSON.stringify({ state: rm.r && rm.r.state, anonStages, anonVersion }));
    });

    // M-6 alias + forged claims ----------------------------------------------------------------------------
    await withLiveTransaction(c, async () => {
      await apply();
      const al = await one(`select a.alias, n.hierarchy_path from public.taxonomy_node_aliases a join public.canonical_taxonomy_nodes n on n.id = a.node_id
                             where n.node_type in ('TOPIC', 'SUBTOPIC') and n.is_active and not n.is_internal and a.language = 'en' order by a.alias limit 1`);
      const small = (entries) => ({ ...clone(EXAM), based_on: `M-6 ${entries.length} ${Math.random()}`, papers: [{ name: 'Paper', questions: 10, marks: 20, sections: [{ name: 'S', questions: 10, marks: 20, map: entries }] }], selection_process: undefined });
      if (!al) chk('M-6a alias match — SKIPPED (no alias in this database)', true);
      else {
        const r = await create(small([{ name: al.alias, avg_questions: 10 }]));
        const [it] = await items(r.session_id);
        chk(`M-6a an alias of a real node → ALIAS, linked at once`, it.match_status === 'ALIAS' && it.decision === 'LINK', JSON.stringify(it));
      }
      const other = await nodeId('english-comprehension.antonyms');
      const forged = {
        ALIAS: await createCode(small([{ name: 'Totally Unknown Words', avg_questions: 10 }]), (xs) => Object.assign(xs[0], { match_status: 'ALIAS', matched_node_id: other, candidates: [] })),
        EXACT_REF: await createCode(small([{ ref: 'english-comprehension.synonyms', avg_questions: 10 }]), (xs) => Object.assign(xs[0], { matched_node_id: other })),
        EXACT: await createCode(small([{ name: 'Not Antonyms At All', avg_questions: 10 }]), (xs) => Object.assign(xs[0], { match_status: 'EXACT', matched_node_id: other, candidates: [] })),
      };
      chk('M-6b forged ALIAS / EXACT_REF / EXACT claims → 22023 (the database re-checks)', Object.values(forged).every((x) => x === '22023'), JSON.stringify(forged));
    });

    // M-8 guards + M-9 -----------------------------------------------------------------------------------
    await withLiveTransaction(c, async () => {
      await apply();
      const r = await create(MASTER);
      const top = await item(r.session_id, 'n3');
      await decide(top.id, 'APPROVE_NEW', null);
      const g = {};
      g['re-decide a created node'] = await decideCode(top.id, 'IGNORE', null);
      const ref = await item(r.session_id, 'n1');
      g['LINK to the wrong level'] = await decideCode(ref.id, 'LINK', await nodeId('english-comprehension.synonyms'));
      const internal = await one(`select id from public.canonical_taxonomy_nodes where is_internal limit 1`);
      if (internal) g['LINK to an internal node'] = await decideCode(ref.id, 'LINK', internal.id);
      g['LINK outside the subject'] = await decideCode(ref.id, 'LINK', await nodeId('quantitative-aptitude.average.basic-average'));
      g['weightage on a master file'] = await svc(() => errCode(`select public.fn_syllabus_map_set_weightage($1, 'CORE', 2, null, $2)`, [ref.id, ACTOR]));
      g['outline action without a conflict'] = await svc(() => errCode(`select public.fn_syllabus_map_set_outline_action($1, 'KEEP', null, $2)`, [ref.id, ACTOR]));
      const want = { 're-decide a created node': 'P0001', 'LINK to the wrong level': '22023', 'LINK to an internal node': '22023', 'LINK outside the subject': '22023', 'weightage on a master file': 'P0002', 'outline action without a conflict': '22023' };
      chk(`M-8a refused: ${Object.keys(g).join(', ')}`, Object.entries(g).every(([k, v]) => v === want[k]), JSON.stringify(g));
      const e = await create(EXAM);
      const before = (await one(HASH)).h;
      const linkable = (await items(e.session_id)).find((i) => i.raw_name === 'Mirror Images');
      await decide(linkable.id, 'LINK', await nodeId('general-intelligence-and-reasoning.non-verbal-reasoning.mirror-and-water-images'));
      await svc(() => q(`select public.fn_syllabus_map_discard($1, null, $2)`, [e.session_id, ACTOR]));
      chk('M-8b after discard: decide / import refused (P0001)', (await decideCode(linkable.id, 'IGNORE', null)) === 'P0001' && (await importCode(e.session_id)) === 'P0001');
      chk('M-9c LINK decisions + discard change nothing outside the staging tables', before === (await one(HASH)).h);
      const clientCalls = {};
      for (const role of ['anon', 'authenticated']) {
        clientCalls[`${role} create`] = await as(role, () => errCode(`select public.fn_syllabus_map_discard($1, null, 'a@b.c')`, [e.session_id]));
        clientCalls[`${role} read`] = await as(role, () => errCode(`select * from public.syllabus_map_items`));
      }
      chk('M-8c anon / authenticated: no 139 function, no staging read (42501)', Object.values(clientCalls).every((x) => x === '42501'), JSON.stringify(clientCalls));
    });

    // M-10 rollback -------------------------------------------------------------------------------------
    await withLiveTransaction(c, async () => {
      await apply();
      await c.query(RB);
      const left = await one(`select (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = any($1))::int fns,
                                     (to_regclass('public.syllabus_map_sessions') is null and to_regclass('public.syllabus_map_items') is null) gone,
                                     (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = any($2))::int v3`, [FNS, V3]);
      chk('M-10 rollback 139: every 139 object gone; the v3 intake functions still there', left.fns === 0 && left.gone && left.v3 >= V3.length, JSON.stringify(left));
    });
  } catch (e) {
    ok = false;
    console.log(`FAIL — ${String(e && e.message ? e.message : e).slice(0, 500)}`);
  } finally {
    await c.end().catch(() => {});
  }
  console.log(ok ? `SYLLABUS-MAP-B2 live${PRE ? ' (--pre, rolled back)' : ''}${LOCAL ? ' [LOCAL]' : ''}: ALL PASS` : `SYLLABUS-MAP-B2 live${PRE ? ' (--pre)' : ''}${LOCAL ? ' [LOCAL]' : ''}: FAILURES`);
  process.exitCode = ok ? 0 : 1;
})();
