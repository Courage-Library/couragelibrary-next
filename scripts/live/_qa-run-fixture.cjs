#!/usr/bin/env node
/**
 * QA-FIXTURES option (b) (architect 2026-10-30): per-RUN committed QA fixtures — created at the start of a suite, deleted
 * in its `finally`, never left behind. Used where a suite must commit (SYL-IMPORT-1 imports through the real RPC as the
 * real staff role, so its syllabus draft must map COMMITTED master-tree nodes).
 *   createRunTopics(client, tag, keys) → commits one INTERNAL TOPIC per key under the SUBJECT `quantitative-aptitude`
 *     (slug qa-fixture-run-<tag>-<key>; metadata { source: QA_FIXTURE_RUN, run: tag }); returns their paths in key order.
 *     NO new SUBJECT: a subject would be projected into public.subjects, which anon / students list (mistake filters,
 *     exam pages). An INTERNAL topic without questions or a lesson is listed nowhere public (the suite proves it each run).
 *   deleteRunTopics(client, tag) → commits the deletion of exactly that run's nodes (QA-marked TOPICs only, else refuses)
 *   sweepQaRunFixtures(q, { olderThanMinutes = 120, actorEmail }) → inside the CALLER's transaction: deletes leftover run
 *     fixtures (a killed run) older than the limit — ONLY INTERNAL TOPIC rows with source QA_FIXTURE_RUN and a
 *     qa-fixture-run-* slug — and writes one QA_FIXTURE_SWEEP audit row; returns the deleted ids. Never a non-QA row.
 * CLI: node scripts/live/_qa-run-fixture.cjs --sweep [--dry-run]   (LIVE-LOCK-SAFETY: safeBegin; --dry-run rolls back)
 */
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const { safeBegin } = require(path.join(ROOT, 'scripts/db/live-safety.cjs'));

const RUN_SOURCE = 'QA_FIXTURE_RUN';
const RUN_PREFIX = 'qa-fixture-run-';
const RUN_PARENT = 'quantitative-aptitude';
const SWEEP_ACTOR = 'qa-fixture-sweeper@courage-library.test';
const QA_ROW = `metadata ->> 'source' = '${RUN_SOURCE}' and slug like '${RUN_PREFIX}%' and node_type = 'TOPIC' and is_internal`;
const runTag = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

async function createRunTopics(client, tag, keys) {
  if (!/^[a-z0-9]{4,20}$/.test(tag)) throw new Error('QA run fixture: bad run tag');
  await safeBegin(client);
  try {
    const meta = JSON.stringify({ source: RUN_SOURCE, run: tag });
    const paths = [];
    for (const key of keys) {
      const [t] = (await client.query(`insert into public.canonical_taxonomy_nodes (parent_id, node_type, name, slug, is_internal, metadata)
          select id, 'TOPIC', $2, $3, true, $4::jsonb from public.canonical_taxonomy_nodes where hierarchy_path = $1 and node_type = 'SUBJECT'
          returning hierarchy_path`, [RUN_PARENT, `QA Fixture ${key} (${tag})`, `${RUN_PREFIX}${tag}-${key}`, meta])).rows;
      if (!t) throw new Error(`QA run fixture: subject ${RUN_PARENT} missing`);
      paths.push(t.hierarchy_path);
    }
    await client.query('COMMIT');
    return paths;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  }
}

async function deleteRunTopics(client, tag) {
  await safeBegin(client);
  try {
    const all = (await client.query(`select count(*)::int n from public.canonical_taxonomy_nodes where metadata ->> 'run' = $1`, [tag])).rows[0].n;
    const own = (await client.query(`select count(*)::int n from public.canonical_taxonomy_nodes where metadata ->> 'run' = $1 and ${QA_ROW}`, [tag])).rows[0].n;
    if (all !== own) throw new Error('refusing to delete: a node of this run tag is not a QA run fixture');
    await client.query(`delete from public.canonical_taxonomy_nodes where metadata ->> 'run' = $1 and ${QA_ROW}`, [tag]);
    await client.query('COMMIT');
    return own;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  }
}

/** Inside the caller's open transaction. `q(sql, params) → rows`. */
async function sweepQaRunFixtures(q, { olderThanMinutes = 120, actorEmail = SWEEP_ACTOR } = {}) {
  const doomed = await q(`select id, metadata ->> 'run' run from public.canonical_taxonomy_nodes
      where ${QA_ROW} and created_at < now() - make_interval(mins => $1)`, [olderThanMinutes]);
  if (!doomed.length) return [];
  const ids = doomed.map((d) => d.id);
  await q(`delete from public.canonical_taxonomy_nodes where id = any($1::uuid[]) and ${QA_ROW}`, [ids]);
  await q(`insert into public.admin_audit_logs (actor_id, actor_email, action_type, target_entity, target_id, old_value, new_value, reason)
      values (null, $1, 'QA_FIXTURE_SWEEP', 'canonical_taxonomy_node', null, jsonb_build_object('runs', $2::jsonb, 'nodes', $3::int), null, $4)`,
  [actorEmail, JSON.stringify([...new Set(doomed.map((d) => d.run))]), ids.length, `QA run fixtures older than ${olderThanMinutes} min (a run that did not clean up)`]);
  return ids;
}

module.exports = { RUN_SOURCE, RUN_PREFIX, runTag, createRunTopics, deleteRunTopics, sweepQaRunFixtures };

if (require.main === module) {
  (async () => {
    const { Client } = require('pg');
    const { dbTarget, redactor } = require(path.join(ROOT, 'scripts/db/_db-env.cjs'));
    const target = dbTarget();
    const red = redactor(target);
    const dry = process.argv.includes('--dry-run');
    if (!process.argv.includes('--sweep')) { console.log('usage: node scripts/live/_qa-run-fixture.cjs --sweep [--dry-run]'); process.exit(2); }
    const c = new Client(target.pg); c.on('error', () => {}); await c.connect();
    try {
      await safeBegin(c);
      const ids = await sweepQaRunFixtures(async (s, p) => (await c.query(s, p)).rows);
      await c.query(dry ? 'ROLLBACK' : 'COMMIT');
      console.log(`${dry ? 'DRY-RUN (rolled back)' : 'COMMITTED'}: ${ids.length} QA run-fixture node(s) older than 2 h swept`);
    } catch (e) {
      await c.query('ROLLBACK').catch(() => {});
      console.log(`FAILED — ${red(String(e.message)).slice(0, 200)}`);
      process.exitCode = 1;
    } finally {
      await c.end().catch(() => {});
    }
  })();
}
