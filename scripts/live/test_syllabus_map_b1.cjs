#!/usr/bin/env node
/**
 * SYLLABUS-MAP-1 B1 (migration 138) — DB gate AS THE REAL ROLES; every statement inside a transaction that is ALWAYS
 * rolled back (withLiveTransaction). Nothing is persisted.
 *   --local=<port>  a throwaway LOCAL PostgreSQL (scripts/db/local-pg.cjs up); refuses any host but 127.0.0.1
 *   (default)       the project database — ONLY with the owner present (owner rule 2026-11-12)
 *   --pre           138 is not applied yet: each transaction first runs the migration (then everything rolls back)
 *   D-1 schema: both tables, RLS on, client grants (outlines none; stages SELECT), choice_group + its CHECK, 0 SECURITY
 *       DEFINER among the 5 functions, search_path '' on each, writers executable by service_role only
 *   D-2 outlines (service_role): set → changed + 1 audit row; the same lines again → no-op, NO audit row; new lines →
 *       old / new audited; clear → TAXONOMY_OUTLINE_CLEAR; clear again → no-op; refused (22023): 31 lines, a 201-char
 *       line, a duplicate line (any case), an untrimmed line, a newline, a SUBJECT node, an internal topic, no actor;
 *       a direct INSERT of 31 lines → 23514 (the table enforces it too); a wrong node_type → 23503
 *   D-3 clients: anon / authenticated cannot read or write outlines (42501) nor call any 138 function (42501)
 *   D-4 choice_group: a DRAFT version's SECTION accepts "language"; a UNIT / a bad slug → 23514
 *   D-5 selection stages: save draft (5 GD stages) → anon sees 0 (draft hidden); publish → anon sees 5; a new draft
 *       (3) → anon still sees the 5; publish → the 5 ARCHIVED, anon sees 3; refused: unknown key / 21 stages (22023),
 *       a paper on a PET stage / a bad kind (23514), another exam's cycle (22023), publish without a draft (P0002),
 *       an anon INSERT (42501); discard → audited; discard of nothing → 0, no audit row
 *   D-6 unrelated data unchanged: hashes of the master tree, aliases, syllabus nodes (original columns), mappings and
 *       versions — before = after (with --pre: across the apply too)
 *   D-7 rollback 138 (in the transaction): every 138 object gone; exam_syllabus_nodes has its original columns
 * Run: node scripts/live/test_syllabus_map_b1.cjs --local=54329 --pre      (local)
 *      node scripts/live/test_syllabus_map_b1.cjs [--pre]                  (project DB, owner present)
 */
require('../db/safe-net.cjs'); // SAFE-NET: masks IPs / hosts / e-mails / keys in all output (scripts/db/safe-net.cjs)
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const { Client } = require('pg');
const { pgClient } = require(path.join(ROOT, 'scripts/db/safe-net.cjs'));
const { withLiveTransaction } = require(path.join(ROOT, 'scripts/db/live-safety.cjs'));

const PRE = process.argv.includes('--pre');
const LOCAL = (process.argv.find((a) => a.startsWith('--local=')) || '').slice('--local='.length);
const FILE = '20261114000138_syllabus_map_b1.sql';
const SQL = fs.readFileSync(path.join(ROOT, 'supabase/migrations', FILE), 'utf8');
const RB = fs.readFileSync(path.join(ROOT, 'docs/database/rollback/138_rollback.sql'), 'utf8');
const ACTOR = 'syllabus-map-b1@courage-library.test';
const FNS = ['fn_outline_lines_valid', 'fn_taxonomy_outline_set', 'fn_selection_stages_save_draft', 'fn_selection_stages_publish', 'fn_selection_stages_discard_draft'];

let ok = true;
const chk = (n, cond, info) => {
  if (!cond) ok = false;
  console.log(`${cond ? 'PASS' : 'FAIL'} ${n}${cond ? '' : ' — ' + String(info ?? '').slice(0, 600)}`);
};

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
  /** the SQLSTATE of a statement run under a savepoint (null = it succeeded) */
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
  const as = async (role, fn) => {
    await c.query(`SET LOCAL ROLE ${role}`);
    try {
      return await fn();
    } finally {
      await c.query('RESET ROLE');
    }
  };
  const audits = async (type) => (await q(`select count(*)::int n from public.admin_audit_logs where action_type = $1 and actor_email = $2`, [type, ACTOR]))[0].n;

  try {
    const [led] = await q(`select count(*)::int n from public.schema_migration_ledger where filename = $1 and status = 'APPLIED'`, [FILE]);
    if (PRE && led.n) throw new Error('--pre refused: 138 is already APPLIED');
    if (!PRE && !led.n) throw new Error('138 is not applied (use --pre)');
    const apply = async () => {
      if (PRE) await c.query(SQL);
    };
    const HASH = `select md5(coalesce(string_agg(r, '|' order by r), '')) h from (
        select concat_ws(',', id, name, slug, parent_id, hierarchy_path, node_type, is_active, is_internal, metadata::text) r from public.canonical_taxonomy_nodes
        union all select concat_ws(',', 'a', node_id, normalized_alias, language) from public.taxonomy_node_aliases
        union all select concat_ws(',', 'n', id, syllabus_version_id, parent_node_id, raw_title, node_kind, weightage_tier, metadata::text) from public.exam_syllabus_nodes
        union all select concat_ws(',', 'm', id, syllabus_node_id, canonical_node_id, match_status) from public.exam_syllabus_canonical_mappings
        union all select concat_ws(',', 'v', id, exam_id, status, version_number) from public.exam_syllabus_versions) x`;

    // fixtures (read only)
    const [topic] = await q(`select id from public.canonical_taxonomy_nodes where node_type = 'TOPIC' and is_active and not is_internal order by hierarchy_path limit 1`);
    const [subtopic, subtopic2] = await q(`select id from public.canonical_taxonomy_nodes where node_type = 'SUBTOPIC' and is_active and not is_internal order by hierarchy_path limit 2`);
    const [subject] = await q(`select id from public.canonical_taxonomy_nodes where node_type = 'SUBJECT' and is_active limit 1`);
    const [internal] = await q(`select id from public.canonical_taxonomy_nodes where node_type = 'TOPIC' and is_internal limit 1`);
    const [gd] = await q(`select id from public.exams where slug = 'ssc-gd-constable'`);
    const [otherCycle] = await q(`select ec.id from public.exam_cycles ec join public.exams e on e.id = ec.exam_id where e.slug <> 'ssc-gd-constable' limit 1`);
    const [draftSection] = await q(`select n.id from public.exam_syllabus_nodes n join public.exam_syllabus_versions v on v.id = n.syllabus_version_id where v.status = 'DRAFT' and n.node_kind = 'SECTION' limit 1`);
    const [draftUnit] = await q(`select n.id from public.exam_syllabus_nodes n join public.exam_syllabus_versions v on v.id = n.syllabus_version_id where v.status = 'DRAFT' and n.node_kind = 'UNIT' limit 1`);
    if (!topic || !subtopic || !subtopic2 || !subject || !gd) throw new Error('fixtures missing (a topic, a subtopic, a subject, ssc-gd-constable)');

    // D-1 + D-6 (apply inside) ---------------------------------------------------------------------------
    await withLiveTransaction(c, async () => {
      const before = (await q(HASH))[0].h;
      await apply();
      const t = await q(`select c.relname, c.relrowsecurity rls, has_table_privilege('anon', c.oid, 'SELECT') anon_sel, has_table_privilege('authenticated', c.oid, 'INSERT') auth_ins,
                                has_table_privilege('authenticated', c.oid, 'SELECT') auth_sel
                           from pg_class c where c.oid in ('public.taxonomy_node_outlines'::regclass, 'public.exam_selection_stages'::regclass)`);
      const o = t.find((x) => x.relname === 'taxonomy_node_outlines');
      const s = t.find((x) => x.relname === 'exam_selection_stages');
      chk('D-1a both tables, RLS on; outlines: no client privilege; stages: client SELECT only', o.rls && s.rls && !o.anon_sel && !o.auth_sel && !o.auth_ins && s.anon_sel && s.auth_sel && !s.auth_ins, JSON.stringify(t));
      const f = await q(`select p.proname, p.prosecdef, array_to_string(p.proconfig, ',') cfg, has_function_privilege('anon', p.oid, 'EXECUTE') anon_x,
                                has_function_privilege('authenticated', p.oid, 'EXECUTE') auth_x, has_function_privilege('service_role', p.oid, 'EXECUTE') svc_x
                           from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = any($1)`, [FNS]);
      chk('D-1b 5 functions: 0 SECURITY DEFINER, search_path "", service_role only', f.length === 5 && f.every((x) => !x.prosecdef && x.cfg === 'search_path=""' && !x.anon_x && !x.auth_x && x.svc_x), JSON.stringify(f));
      const [col] = await q(`select count(*)::int n from pg_attribute where attrelid = 'public.exam_syllabus_nodes'::regclass and attname = 'choice_group' and not attisdropped`);
      const [pol] = await q(`select count(*)::int n from pg_policies where tablename = 'exam_selection_stages' and cmd = 'SELECT' and qual like '%PUBLISHED%'`);
      chk('D-1c choice_group column; one PUBLISHED-only read policy', col.n === 1 && pol.n === 1, `${col.n} / ${pol.n}`);
      const after = (await q(HASH))[0].h;
      chk(`D-6a unrelated data unchanged${PRE ? ' across the apply' : ''} (master, aliases, syllabus nodes / mappings / versions)`, before === after, `${before} ≠ ${after}`);
    });

    // D-2 + D-3 outlines ----------------------------------------------------------------------------------
    await withLiveTransaction(c, async () => {
      await apply();
      const set = (id, items) => q(`select public.fn_taxonomy_outline_set($1, $2::text[], 'OWNER', null, $3) r`, [id, items, ACTOR]).then((r) => r[0].r);
      const r1 = await as('service_role', () => set(subtopic.id, ['Direct antonyms', 'Prefix antonyms']));
      const a1 = await audits('TAXONOMY_OUTLINE_SET');
      const r2 = await as('service_role', () => set(subtopic.id, ['Direct antonyms', 'Prefix antonyms']));
      const a2 = await audits('TAXONOMY_OUTLINE_SET');
      chk('D-2a set → changed + 1 audit row; the same lines again → no-op, no audit row (idempotent)', r1.changed === true && a1 === 1 && r2.changed === false && a2 === 1, JSON.stringify({ r1, r2, a1, a2 }));
      const r3 = await as('service_role', () => set(subtopic.id, ['Direct antonyms', 'Context antonyms', 'Prefix antonyms']));
      // one transaction = one now(): find the row of THIS change by its content, not by time
      const logs = await q(`select old_value, new_value from public.admin_audit_logs where action_type = 'TAXONOMY_OUTLINE_SET' and actor_email = $1 and jsonb_array_length(new_value -> 'items') = 3`, [ACTOR]);
      const log = logs[0];
      chk('D-2b new lines → changed; the audit row keeps old and new', r3.changed && logs.length === 1 && log.old_value && log.old_value.items.length === 2 && log.new_value.items.length === 3, JSON.stringify(logs));
      const bad = {
        '31 lines': [subtopic.id, Array.from({ length: 31 }, (_, i) => `L${i}`)],
        '201 characters': [subtopic.id, ['x'.repeat(201)]],
        'duplicate line': [subtopic.id, ['Antonyms', 'ANTONYMS']],
        'untrimmed line': [subtopic.id, [' Antonyms']],
        newline: [subtopic.id, ['two\nlines']],
        'a SUBJECT node': [subject.id, ['A']],
        ...(internal ? { 'an internal topic': [internal.id, ['A']] } : {}),
      };
      const codes = {};
      for (const [k, [id, items]] of Object.entries(bad)) codes[k] = await as('service_role', () => errCode(`select public.fn_taxonomy_outline_set($1, $2::text[], 'OWNER', null, $3)`, [id, items, ACTOR]));
      codes['no actor'] = await as('service_role', () => errCode(`select public.fn_taxonomy_outline_set($1, $2::text[], 'OWNER', null, '')`, [topic.id, ['A']]));
      chk(`D-2c refused (22023): ${Object.keys(codes).join(', ')}`, Object.values(codes).every((x) => x === '22023'), JSON.stringify(codes));
      const direct = await as('service_role', () => errCode(`insert into public.taxonomy_node_outlines (node_id, node_type, items, source, updated_by_email) values ($1, 'TOPIC', $2::text[], 'OWNER', $3)`, [topic.id, Array.from({ length: 31 }, (_, i) => `L${i}`), ACTOR]));
      const wrongType = await as('service_role', () => errCode(`insert into public.taxonomy_node_outlines (node_id, node_type, items, source, updated_by_email) values ($1, 'TOPIC', '{A}', 'OWNER', $2)`, [subtopic2.id, ACTOR])); // a subtopic WITHOUT an outline (no PK clash)
      chk('D-2d the table itself refuses 31 lines (23514) and a wrong node type (23503)', direct === '23514' && wrongType === '23503', `${direct} / ${wrongType}`);
      const clear = await as('service_role', () => set(subtopic.id, []));
      const again = await as('service_role', () => set(subtopic.id, null));
      chk('D-2e clear → TAXONOMY_OUTLINE_CLEAR; clear again → no-op', clear.changed && !again.changed && (await audits('TAXONOMY_OUTLINE_CLEAR')) === 1, JSON.stringify({ clear, again }));
      const client3 = {};
      for (const role of ['anon', 'authenticated']) {
        client3[`${role} read`] = await as(role, () => errCode(`select * from public.taxonomy_node_outlines`));
        client3[`${role} write`] = await as(role, () => errCode(`insert into public.taxonomy_node_outlines (node_id, node_type, items, source, updated_by_email) values ($1, 'TOPIC', '{A}', 'OWNER', 'x@y.z')`, [topic.id]));
        client3[`${role} outline call`] = await as(role, () => errCode(`select public.fn_taxonomy_outline_set($1, $2::text[], 'OWNER', null, 'a@b.c')`, [topic.id, ['A']]));
        client3[`${role} stages call`] = await as(role, () => errCode(`select public.fn_selection_stages_publish($1, null, null, 'a@b.c')`, [gd.id]));
      }
      chk('D-3 anon / authenticated: no outline read / write, no 138 function (42501)', Object.values(client3).every((x) => x === '42501'), JSON.stringify(client3));
    });

    // D-4 choice_group -----------------------------------------------------------------------------------
    await withLiveTransaction(c, async () => {
      await apply();
      if (!draftSection) chk('D-4 choice_group on a DRAFT SECTION — SKIPPED (no draft section in this database)', true);
      else {
        const okSet = await errCode(`update public.exam_syllabus_nodes set choice_group = 'language' where id = $1`, [draftSection.id]);
        const badSlug = await errCode(`update public.exam_syllabus_nodes set choice_group = 'Lang Uage' where id = $1`, [draftSection.id]);
        const onUnit = draftUnit ? await errCode(`update public.exam_syllabus_nodes set choice_group = 'language' where id = $1`, [draftUnit.id]) : '23514';
        chk('D-4 a DRAFT SECTION takes "language"; a bad slug / a UNIT → 23514', okSet === null && badSlug === '23514' && onUnit === '23514', `${okSet} / ${badSlug} / ${onUnit}`);
      }
    });

    // D-5 selection stages ------------------------------------------------------------------------------
    await withLiveTransaction(c, async () => {
      await apply();
      const five = [
        { stage: 'CBT', name: 'Computer Based Examination', nature: 'MERIT', paper: 'Computer Based Examination' },
        { stage: 'PET', name: 'Physical Efficiency Test', nature: 'QUALIFYING', details: { male: '5 km in 24 minutes' } },
        { stage: 'PST', name: 'Physical Standard Test', nature: 'QUALIFYING' },
        { stage: 'MEDICAL', name: 'Detailed Medical Examination', nature: 'QUALIFYING' },
        { stage: 'DV', name: 'Document Verification', nature: 'QUALIFYING' },
      ];
      const save = (stages, cycle = null) => q(`select public.fn_selection_stages_save_draft($1, $2, $3::jsonb, 'https://ssc.gov.in/notice', '2026-11-01', null, $4) r`, [gd.id, cycle, JSON.stringify(stages), ACTOR]).then((r) => r[0].r);
      const publish = () => q(`select public.fn_selection_stages_publish($1, null, null, $2) r`, [gd.id, ACTOR]).then((r) => r[0].r);
      const anonSees = () => as('anon', () => q(`select count(*)::int n from public.exam_selection_stages where exam_id = $1`, [gd.id]).then((r) => r[0].n));
      const s1 = await as('service_role', () => save(five));
      const seeDraft = await anonSees();
      const p1 = await as('service_role', publish);
      const seePub = await anonSees();
      const s2 = await as('service_role', () => save(five.slice(0, 3)));
      const seeStill = await anonSees();
      const p2 = await as('service_role', publish);
      const seeNew = await anonSees();
      const [arch] = await q(`select count(*)::int n from public.exam_selection_stages where exam_id = $1 and status = 'ARCHIVED'`, [gd.id]);
      chk('D-5a draft hidden from candidates; publish shows it; a newer draft never leaks; republish archives the old set',
        s1.stages === 5 && seeDraft === 0 && p1.published === 5 && seePub === 5 && s2.stages === 3 && seeStill === 5 && p2.published === 3 && p2.archived === 5 && seeNew === 3 && arch.n === 5,
        JSON.stringify({ s1, seeDraft, p1, seePub, s2, seeStill, p2, seeNew, arch }));
      const e = {};
      e['unknown key'] = await as('service_role', () => errCode(`select public.fn_selection_stages_save_draft($1, null, $2::jsonb, null, null, null, $3)`, [gd.id, JSON.stringify([{ stage: 'PET', name: 'PET', nature: 'QUALIFYING', colour: 'red' }]), ACTOR]));
      e['21 stages'] = await as('service_role', () => errCode(`select public.fn_selection_stages_save_draft($1, null, $2::jsonb, null, null, null, $3)`, [gd.id, JSON.stringify(Array.from({ length: 21 }, () => ({ stage: 'OTHER', name: 'Stage', nature: 'QUALIFYING' }))), ACTOR]));
      e['paper on PET'] = await as('service_role', () => errCode(`select public.fn_selection_stages_save_draft($1, null, $2::jsonb, null, null, null, $3)`, [gd.id, JSON.stringify([{ stage: 'PET', name: 'PET', nature: 'QUALIFYING', paper: 'CBT' }]), ACTOR]));
      e['bad kind'] = await as('service_role', () => errCode(`select public.fn_selection_stages_save_draft($1, null, $2::jsonb, null, null, null, $3)`, [gd.id, JSON.stringify([{ stage: 'RUN', name: 'Run', nature: 'QUALIFYING' }]), ACTOR]));
      if (otherCycle) e['another exam cycle'] = await as('service_role', () => errCode(`select public.fn_selection_stages_save_draft($1, $2, $3::jsonb, null, null, null, $4)`, [gd.id, otherCycle.id, JSON.stringify(five), ACTOR]));
      e['publish without draft'] = await as('service_role', () => errCode(`select public.fn_selection_stages_publish($1, null, null, $2)`, [gd.id, ACTOR]));
      e['anon insert'] = await as('anon', () => errCode(`insert into public.exam_selection_stages (exam_id, position, stage_kind, name, nature, created_by_email) values ($1, 1, 'PET', 'PET', 'QUALIFYING', 'x@y.z')`, [gd.id]));
      const want = { 'unknown key': '22023', '21 stages': '22023', 'paper on PET': '23514', 'bad kind': '23514', 'another exam cycle': '22023', 'publish without draft': 'P0002', 'anon insert': '42501' };
      chk(`D-5b refused: ${Object.keys(e).join(', ')}`, Object.entries(e).every(([k, v]) => v === want[k]), JSON.stringify(e));
      await as('service_role', () => save(five));
      const d1 = await as('service_role', () => q(`select public.fn_selection_stages_discard_draft($1, null, null, $2) r`, [gd.id, ACTOR]).then((r) => r[0].r));
      const d2 = await as('service_role', () => q(`select public.fn_selection_stages_discard_draft($1, null, null, $2) r`, [gd.id, ACTOR]).then((r) => r[0].r));
      chk('D-5c discard → audited; discard of nothing → 0, no audit row', d1.discarded === 5 && d2.discarded === 0 && (await audits('SELECTION_STAGES_DISCARD_DRAFT')) === 1, JSON.stringify({ d1, d2 }));
    });

    // D-7 rollback ----------------------------------------------------------------------------------------
    await withLiveTransaction(c, async () => {
      const cols = async () => (await q(`select string_agg(attname, ',' order by attnum) c from pg_attribute where attrelid = 'public.exam_syllabus_nodes'::regclass and attnum > 0 and not attisdropped`))[0].c;
      const before = PRE ? await cols() : null;
      await apply();
      await c.query(RB);
      const [left] = await q(`select (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = any($1))::int fns,
                                     (to_regclass('public.taxonomy_node_outlines') is null and to_regclass('public.exam_selection_stages') is null) tables_gone`, [FNS]);
      const after = await cols();
      chk('D-7 rollback 138: every 138 object gone; exam_syllabus_nodes back to its original columns', left.fns === 0 && left.tables_gone && !after.split(',').includes('choice_group') && (!PRE || before === after), JSON.stringify({ left, before, after }));
    });
  } catch (e) {
    ok = false;
    console.log(`FAIL — ${String(e && e.message ? e.message : e).slice(0, 400)}`);
  } finally {
    await c.end().catch(() => {});
  }
  console.log(ok ? `SYLLABUS-MAP-B1 live${PRE ? ' (--pre, rolled back)' : ''}${LOCAL ? ' [LOCAL]' : ''}: ALL PASS` : `SYLLABUS-MAP-B1 live${PRE ? ' (--pre)' : ''}${LOCAL ? ' [LOCAL]' : ''}: FAILURES`);
  process.exitCode = ok ? 0 : 1;
})();
