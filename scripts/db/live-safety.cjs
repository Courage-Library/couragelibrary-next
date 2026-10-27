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

/** Isolation levels safeBegin accepts (anything else is a programming error). */
const ISOLATION_LEVELS = new Set(['READ COMMITTED', 'REPEATABLE READ', 'SERIALIZABLE']);

// LIVE-LOCK-SWEEP: every client with a transaction opened by safeBegin, rolled back + closed on SIGINT / SIGTERM.
const openClients = new Set();
let globalStopInstalled = false;
function installGlobalStop() {
  if (globalStopInstalled) return;
  globalStopInstalled = true;
  const stop = async (sig) => {
    for (const c of openClients) {
      await c.query('ROLLBACK').catch(() => undefined);
      await c.end().catch(() => undefined);
    }
    console.error(`LIVE-LOCK-SAFETY: ${sig} — rolled back and closed ${openClients.size} session(s); exiting`);
    process.exit(sig === 'SIGINT' ? 130 : 143);
  };
  process.once('SIGINT', () => stop('SIGINT'));
  process.once('SIGTERM', () => stop('SIGTERM'));
}

/**
 * THE shared safe-begin (LIVE-LOCK-SWEEP; gate scripts/test_live_lock_sweep.cjs): BEGIN [isolation] [READ ONLY | READ
 * WRITE] and the three LIVE-LOCK-SAFETY settings in ONE statement (a connection that stalls right after BEGIN can never
 * leave a transaction without the idle-in-transaction timeout), and the client is registered for rollback-on-stop.
 * The caller ends the transaction itself (ROLLBACK, or COMMIT where a live step must persist).
 */
async function safeBegin(client, { readOnly = false, isolation = null } = {}) {
  if (isolation !== null && !ISOLATION_LEVELS.has(isolation)) throw new Error(`safeBegin: unknown isolation level ${isolation}`);
  installGlobalStop();
  if (!openClients.has(client)) {
    openClients.add(client);
    if (typeof client.once === 'function') client.once('end', () => openClients.delete(client));
  }
  const mode = `${isolation ? `ISOLATION LEVEL ${isolation} ` : ''}${readOnly ? 'READ ONLY' : 'READ WRITE'}`;
  await client.query(`BEGIN ${mode}; ${LIVE_SAFETY_SQL}`);
}

/**
 * Runs fn(client) in ONE transaction with the live-safety settings (safeBegin), then ALWAYS rolls back (rolled-back
 * smokes / verifies) — try/finally: ROLLBACK even on error; safeBegin's stop handler covers SIGINT / SIGTERM. Keep fn
 * small (one object group) so no lock is held for more than a few seconds.
 */
async function withLiveTransaction(client, fn, { readOnly = false } = {}) {
  try {
    await safeBegin(client, { readOnly });
    return await fn(client);
  } finally {
    await client.query('ROLLBACK').catch(() => undefined);
  }
}

module.exports = { LOCK_TIMEOUT, STATEMENT_TIMEOUT, IDLE_IN_TX_TIMEOUT, LIVE_SAFETY_SQL, applyLiveSafety, isLockTimeout, installStopHandler, safeBegin, withLiveTransaction };
