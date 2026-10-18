/**
 * CI-1 Stage 2 — orphan-session check (architect-approved). Lists the CURRENT DB user's other sessions that are not idle
 * (active, idle in transaction, idle in transaction (aborted)) and how long / how many locks — PIDs, states and the
 * statement's first keyword only; never hosts, users or full queries. It NEVER terminates a session.
 * Usage: node scripts/ci/db-sessions.cjs [--fail-on-own-open]
 *   --fail-on-own-open  exit 1 if any such session is older than 30 s (a leftover from a suite), so the run fails loudly
 * Verified TLS via scripts/db/_db-env.cjs (PROD_CA_PATH); bounded (connect + one query, 60 s total).
 */
const { Client } = require('pg');
const { dbTarget } = require('../db/_db-env.cjs');

(async () => {
  const failOnOpen = process.argv.includes('--fail-on-own-open');
  const c = new Client({ ...dbTarget().pg, connectionTimeoutMillis: 20000, statement_timeout: 20000 });
  c.on('error', () => {});
  const timer = setTimeout(() => { console.log('db-sessions: FAIL — timed out (60 s)'); process.exit(1); }, 60000);
  await c.connect();
  const rows = (await c.query(`SELECT pid, state, extract(epoch FROM now() - coalesce(state_change, query_start))::int AS age_s,
      (SELECT count(*)::int FROM pg_locks l WHERE l.pid = a.pid) AS locks, upper(split_part(ltrim(coalesce(query, '')), ' ', 1)) AS verb
    FROM pg_stat_activity a
    WHERE datname = current_database() AND usename = current_user AND pid <> pg_backend_pid() AND state <> 'idle'
    ORDER BY age_s DESC`)).rows;
  await c.end().catch(() => {});
  clearTimeout(timer);
  const stale = rows.filter((r) => r.age_s > 30);
  for (const r of rows) console.log(`db-sessions: pid ${r.pid} ${r.state} ${r.age_s} s, ${r.locks} locks, ${r.verb || '?'}`);
  console.log(`db-sessions: ${rows.length} non-idle own session(s), ${stale.length} older than 30 s — never terminated here`);
  process.exit(failOnOpen && stale.length ? 1 : 0);
})().catch((e) => { console.log(`db-sessions: FAIL — ${e && e.code ? `error code ${e.code}` : 'connection error'}`); process.exit(1); });
