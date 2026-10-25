/**
 * LIVE-LOCK-SAFETY (architect rule, 2026-10-25) — defaults for EVERY live smoke / verify / apply session:
 *   lock_timeout = 3s, statement_timeout = 60s; one live session per object group at a time (no dry-run during a smoke);
 *   long DDL smokes split into small rolled-back transactions; a lock timeout (55P03) → retry ONCE, then STOP and report.
 *   Never raise these timeouts to force a run.
 * Applied with SET LOCAL inside the transaction (a pooled backend may not keep session settings between transactions).
 * idle_in_transaction_session_timeout = 30s: if the client dies mid-transaction (a killed smoke), the server ends the
 * orphaned transaction and releases its locks within 30 s (incident 2026-10-25: a stopped 102 smoke left a pooled backend
 * "idle in transaction (aborted)" holding ACCESS EXCLUSIVE locks on 27 tables; the server default is 0 = never).
 */
const LOCK_TIMEOUT = '3s';
const STATEMENT_TIMEOUT = '60s';
const IDLE_IN_TX_TIMEOUT = '30s';
const LIVE_SAFETY_SQL = `SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'; SET LOCAL statement_timeout = '${STATEMENT_TIMEOUT}'; SET LOCAL idle_in_transaction_session_timeout = '${IDLE_IN_TX_TIMEOUT}'`;

/** Call right after BEGIN on a pg Client. */
async function applyLiveSafety(client) {
  await client.query(LIVE_SAFETY_SQL);
}

/** True for a lock timeout (55P03 lock_not_available) — retry once, then stop. */
function isLockTimeout(e) {
  return !!e && e.code === '55P03';
}

/**
 * INC-7: on SIGINT / SIGTERM, ROLLBACK first, then close the client, then exit. Returns a function that removes the
 * handlers. A hard kill cannot run handlers — that is what idle_in_transaction_session_timeout covers.
 */
function installStopHandler(client) {
  const stop = async (sig) => {
    await client.query('ROLLBACK').catch(() => undefined);
    await client.end().catch(() => undefined);
    console.error(`LIVE-LOCK-SAFETY: ${sig} — rolled back and closed; exiting`);
    process.exit(130);
  };
  const onInt = () => stop('SIGINT');
  const onTerm = () => stop('SIGTERM');
  process.once('SIGINT', onInt);
  process.once('SIGTERM', onTerm);
  return () => { process.removeListener('SIGINT', onInt); process.removeListener('SIGTERM', onTerm); };
}

/**
 * Runs fn(client) in ONE transaction with the live-safety settings, then ALWAYS rolls back (rolled-back smokes /
 * verifies) — try/finally: ROLLBACK even on error; the stop handler covers SIGINT / SIGTERM. Keep fn small (one object
 * group) so no lock is held for more than a few seconds.
 */
async function withLiveTransaction(client, fn, { readOnly = false } = {}) {
  const remove = installStopHandler(client);
  try {
    // BEGIN and the settings in ONE round trip: a connection that stalls right after BEGIN can never leave a transaction
    // without the idle-in-transaction timeout (observed 2026-10-25: a backend "idle in transaction" after a bare BEGIN)
    await client.query(`${readOnly ? 'BEGIN READ ONLY' : 'BEGIN'}; ${LIVE_SAFETY_SQL}`);
    return await fn(client);
  } finally {
    await client.query('ROLLBACK').catch(() => undefined);
    remove();
  }
}

module.exports = { LOCK_TIMEOUT, STATEMENT_TIMEOUT, IDLE_IN_TX_TIMEOUT, LIVE_SAFETY_SQL, applyLiveSafety, isLockTimeout, installStopHandler, withLiveTransaction };
