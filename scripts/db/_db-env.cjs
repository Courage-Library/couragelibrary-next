/**
 * Shared, secret-safe DB environment helpers for scripts/db/*.
 *
 * - Reads .env.local at runtime; never prints values.
 * - Enforces the project-ref guard: the ref in POSTGRES_URL_NON_POOLING must equal
 *   the ref in NEXT_PUBLIC_SUPABASE_URL (prevents connecting to any other project).
 * - TLS is always verified with the CA from PROD_CA_PATH.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_BACKUP_DIR = 'E:/CourageLibrary-Backups';
const DEFAULT_PG_BIN = 'C:/Program Files/PostgreSQL/17/bin';

function readEnv() {
  const file = path.join(ROOT, '.env.local');
  if (!fs.existsSync(file)) {
    // CI-1 Stage 2 (architect-approved): on CI the values come from the job environment (GitHub environment secrets).
    // Only when CI=true AND .env.local is absent; nothing is ever written to disk.
    if (process.env.CI === 'true') return (k) => process.env[k];
    throw new Error('ENV_MISSING: .env.local not found');
  }
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  return (k) => {
    if (process.env[k]) return process.env[k];
    const v = lines.filter((l) => l.startsWith(k + '=')).map((l) => l.slice(k.length + 1).trim().replace(/^["']|["']$/g, ''));
    return v[v.length - 1];
  };
}

function dbTarget() {
  const env = readEnv();
  const raw = env('POSTGRES_URL_NON_POOLING');
  const api = env('NEXT_PUBLIC_SUPABASE_URL');
  const ca = env('PROD_CA_PATH');
  if (!raw || !api) throw new Error('ENV_MISSING: POSTGRES_URL_NON_POOLING / NEXT_PUBLIC_SUPABASE_URL');
  if (!ca || !fs.existsSync(ca)) throw new Error('TLS_CA_MISSING: PROD_CA_PATH not set or file not found');
  const u = new URL(raw);
  const dbRef = decodeURIComponent(u.username).split('.')[1] || (u.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/) || [])[1] || '';
  const apiRef = new URL(api).hostname.split('.')[0];
  if (!dbRef || dbRef !== apiRef) throw new Error('TARGET_REF_MISMATCH: refusing to connect');
  return {
    pg: {
      host: u.hostname,
      port: Number(u.port || 5432),
      user: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
      database: u.pathname.slice(1) || 'postgres',
      ssl: { rejectUnauthorized: true, ca: fs.readFileSync(ca, 'utf8'), servername: u.hostname },
    },
    caPath: ca,
    backupDir: env('BACKUP_DIR') || DEFAULT_BACKUP_DIR,
    pgBin: env('PG_BIN') || DEFAULT_PG_BIN,
  };
}

/** Removes host/user identifiers and URLs from any message before printing. */
function redactor(target) {
  return (msg) =>
    String(msg)
      .replace(/postgres(ql)?:\/\/\S+/g, '[redacted-url]')
      .split(target.pg.host).join('[host]')
      .split(target.pg.user).join('[user]');
}

/** Ledger checksum: sha256 of the file with CRLF normalized to LF (stable across OSes). */
function fileChecksum(file) {
  const text = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

module.exports = { ROOT, readEnv, dbTarget, redactor, fileChecksum };
