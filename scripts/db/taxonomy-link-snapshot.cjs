#!/usr/bin/env node
/**
 * CA-1 (architect condition): prove every existing taxonomy link is UNCHANGED by a migration — counts AND a hash of
 * each link set, before vs after. READ ONLY (BEGIN READ ONLY; LIVE-LOCK-SAFETY timeouts). Prints counts + hash
 * prefixes only (no row data).
 *   - every FK into canonical_taxonomy_nodes, discovered from the catalogue (public schema; self-references included
 *     as the tree's own links): count + md5 of "pk → fk value" pairs ordered by pk
 *   - the tree itself (id, parent, type, slug, hierarchy_path, active) and the projections (subjects / topics / subtopics)
 *   - the Learn-more chain: learning_units (topic / subtopic) and learning_documents (unit, slug, status, version)
 * Usage:
 *   node scripts/db/taxonomy-link-snapshot.cjs --out=<file.json>            (take a snapshot)
 *   node scripts/db/taxonomy-link-snapshot.cjs --compare=<before.json>      (take one and compare; exit 1 on any change)
 */
const { safeBegin } = require('./live-safety.cjs'); // LIVE-LOCK-SWEEP: the one safe BEGIN (timeouts + rollback on stop)
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const { dbTarget, redactor } = require('./_db-env.cjs');

const arg = (k) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').slice(k.length + 3);
const OUT = arg('out');
const CMP = arg('compare');
if (!OUT && !CMP) throw new Error('--out=<file> or --compare=<before.json>');

(async () => {
  const target = dbTarget();
  const red = redactor(target);
  const c = new Client({ ...target.pg, port: 6543 });
  await c.connect();
  const q = async (s, p) => (await c.query(s, p)).rows;
  const snap = {};
  try {
    await safeBegin(c, { readOnly: true });



    const fks = await q(`
      SELECT con.conname, n.nspname AS schema, cl.relname AS tbl,
             (SELECT a.attname FROM pg_attribute a WHERE a.attrelid = con.conrelid AND a.attnum = con.conkey[1]) AS col
      FROM pg_constraint con JOIN pg_class cl ON cl.oid = con.conrelid JOIN pg_namespace n ON n.oid = cl.relnamespace
      WHERE con.contype = 'f' AND con.confrelid = 'public.canonical_taxonomy_nodes'::regclass AND n.nspname = 'public'
      ORDER BY 3, 1`);
    for (const fk of fks) {
      const pk = await q(`SELECT a.attname FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
                          WHERE i.indrelid = $1::regclass AND i.indisprimary ORDER BY a.attnum`, [`public.${fk.tbl}`]);
      const pkExpr = pk.length ? pk.map((x) => `${JSON.stringify(x.attname)}::text`).join(` || '|' || `) : `ctid::text`;
      const col = JSON.stringify(fk.col);
      const r = (await q(`SELECT count(*)::int n, count(${col})::int linked,
                                 left(md5(coalesce(string_agg((${pkExpr}) || '>' || coalesce(${col}::text, '-'), ',' ORDER BY (${pkExpr})), '')), 16) h
                          FROM public.${JSON.stringify(fk.tbl)}`))[0];
      snap[`fk:${fk.tbl}.${fk.col}`] = r;
    }
    const extra = {
      'tree:nodes': `SELECT count(*)::int n, left(md5(coalesce(string_agg(id::text||'|'||coalesce(parent_id::text,'-')||'|'||node_type||'|'||slug||'|'||hierarchy_path||'|'||is_active::text, ',' ORDER BY id), '')), 16) h FROM public.canonical_taxonomy_nodes`,
      'proj:subjects': `SELECT count(*)::int n, left(md5(coalesce(string_agg(id::text||'|'||slug||'|'||name, ',' ORDER BY id), '')), 16) h FROM public.subjects`,
      'proj:topics': `SELECT count(*)::int n, left(md5(coalesce(string_agg(id::text||'|'||subject_id::text||'|'||slug||'|'||name, ',' ORDER BY id), '')), 16) h FROM public.topics`,
      'proj:subtopics': `SELECT count(*)::int n, left(md5(coalesce(string_agg(id::text||'|'||topic_id::text||'|'||slug||'|'||name, ',' ORDER BY id), '')), 16) h FROM public.subtopics`,
      'learn:units': `SELECT count(*)::int n, left(md5(coalesce(string_agg(id::text||'|'||topic_id::text||'|'||coalesce(subtopic_id::text,'-')||'|'||slug||'|'||is_active::text, ',' ORDER BY id), '')), 16) h FROM public.learning_units`,
      'learn:documents': `SELECT count(*)::int n, left(md5(coalesce(string_agg(id::text||'|'||coalesce(learning_unit_id::text,'-')||'|'||canonical_slug||'|'||status||'|'||coalesce(current_published_version_id::text,'-'), ',' ORDER BY id), '')), 16) h FROM public.learning_documents`,
      'syllabus:mappings': `SELECT count(*)::int n, left(md5(coalesce(string_agg(id::text||'|'||syllabus_node_id::text||'|'||canonical_node_id::text||'|'||match_status, ',' ORDER BY id), '')), 16) h FROM public.exam_syllabus_canonical_mappings`,
      'exam:question_mappings': `SELECT count(*)::int n, left(md5(coalesce(string_agg(exam_id::text||'|'||question_id::text, ',' ORDER BY exam_id, question_id), '')), 16) h FROM public.exam_question_mappings`,
      'mock:sections': `SELECT count(*)::int n, left(md5(coalesce(string_agg(id::text||'|'||coalesce(subject_id::text,'-'), ',' ORDER BY id), '')), 16) h FROM public.mock_sections`,
      'pattern:sections': `SELECT count(*)::int n, left(md5(coalesce(string_agg(id::text||'|'||coalesce(subject_id::text,'-'), ',' ORDER BY id), '')), 16) h FROM public.pattern_sections`,
    };
    for (const [k, sql] of Object.entries(extra)) snap[k] = (await q(sql))[0];
    await c.query('ROLLBACK');
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    console.error('SNAPSHOT FAILED', red(e.message).slice(0, 200));
    process.exit(2);
  } finally {
    await c.end();
  }
  const keys = Object.keys(snap).sort();
  if (OUT) {
    fs.mkdirSync(path.dirname(path.resolve(OUT)), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify({ takenAt: new Date().toISOString(), snap }, null, 1));
    console.log(`snapshot: ${keys.length} link sets → ${OUT}`);
    for (const k of keys) console.log(`  ${k.padEnd(52)} n=${snap[k].n}${snap[k].linked !== undefined ? ` linked=${snap[k].linked}` : ''} h=${snap[k].h}`);
    return;
  }
  const before = JSON.parse(fs.readFileSync(CMP, 'utf8')).snap;
  const diff = [];
  const added = [];
  for (const k of new Set([...Object.keys(before), ...keys])) {
    // a link set created by the migration itself (e.g. a new FK) is reported, not a change, only while it is EMPTY
    if (!(k in before) && snap[k] && snap[k].n === 0) {
      added.push(k);
      continue;
    }
    const a = JSON.stringify(before[k] ?? null), b = JSON.stringify(snap[k] ?? null);
    if (a !== b) diff.push(`${k}: ${a} → ${b}`);
  }
  console.log(`compare: ${keys.length} link sets; ${diff.length} changed; ${added.length} new (empty)`);
  for (const k of added) console.log('  NEW (empty)', k);
  for (const d of diff) console.log('  CHANGED', d);
  process.exit(diff.length ? 1 : 0);
})();
