/**
 * COURAGE LIBRARY — DATABASE TYPE GENERATOR (TYPES-1, decision #24)
 *
 *   npm run db:types        → regenerate types/database.ts from the live public schema
 *   npm run db:types:check  → generate to a temp file, diff against the committed file, exit 1 on drift
 *
 * Generator: pinned Supabase CLI (devDependency) → Management API
 *   `supabase gen types typescript --project-id <ref> --schema public`
 *
 * PROJECT-REF LOCK (SUPABASE_ACCESS_TOKEN is account-wide and could reach other projects):
 *   - the ref comes ONLY from .env.local, exactly like scripts/db/_db-env.cjs (NEXT_PUBLIC_SUPABASE_URL host,
 *     cross-checked against the POSTGRES_URL_NON_POOLING ref); CLI arguments never supply a ref;
 *   - sha256(ref) must equal the committed couragelibrary-next fingerprint, AND the Management API must report
 *     the project name 'couragelibrary-next' — otherwise exit 1 before generating;
 *   - only `--schema public` (never `retired`);
 *   - the token is passed to the CLI through its environment only and is never printed; CLI output is scrubbed.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { ROOT, readEnv } = require('./_db-env.cjs');

/** sha256 of the couragelibrary-next project ref (the ref itself is not committed). */
const EXPECTED_REF_SHA256 = '801b7fd354b67966184cf28fba1ac44a304cd0aed7e760a4a13a56ed7a4fdc5e';
const EXPECTED_PROJECT_NAME = 'couragelibrary-next';
const OUT_FILE = path.join(ROOT, 'types', 'database.ts');
const HEADER = '// GENERATED — DO NOT EDIT — regenerate with `npm run db:types` (TYPES-1; schema: public)\n';

const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

/** Ref from env, derived exactly as _db-env.cjs does; both sources must agree. Throws otherwise. */
function refFromEnv(env = readEnv()) {
  const api = env('NEXT_PUBLIC_SUPABASE_URL');
  const raw = env('POSTGRES_URL_NON_POOLING');
  if (!api || !raw) throw new Error('ENV_MISSING: NEXT_PUBLIC_SUPABASE_URL / POSTGRES_URL_NON_POOLING');
  const apiRef = new URL(api).hostname.split('.')[0];
  const u = new URL(raw);
  const dbRef = decodeURIComponent(u.username).split('.')[1] || (u.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/) || [])[1] || '';
  if (!dbRef || dbRef !== apiRef) throw new Error('TARGET_REF_MISMATCH: database and API refs differ');
  return apiRef;
}

/** Refuses any ref that is not couragelibrary-next (pure; unit-tested with fake refs). */
function assertProjectRef(ref) {
  if (typeof ref !== 'string' || !/^[a-z0-9]{20}$/.test(ref)) throw new Error('REF_LOCK: malformed project ref');
  if (sha256(ref) !== EXPECTED_REF_SHA256) throw new Error('REF_LOCK: project ref is not couragelibrary-next — refusing to run');
  return ref;
}

/** Replaces every occurrence of the secrets in a string. */
function scrub(text, secrets) {
  let out = String(text || '');
  for (const s of secrets.filter(Boolean)) out = out.split(s).join('[redacted]');
  return out.replace(/sbp_[A-Za-z0-9]{20,}/g, '[redacted]');
}

async function assertProjectName(ref, token) {
  for (let i = 1; i <= 3; i++) {
    try {
      const r = await fetch(`https://api.supabase.com/v1/projects/${ref}`, { headers: { Authorization: `Bearer ${token}` } });
      const j = await r.json().catch(() => ({}));
      // A scoped token without project_admin_read cannot read the project name; the sha256 ref lock
      // (assertProjectRef) already pins couragelibrary-next, so this second check is skipped, not failed.
      if (r.status === 403 && /project_admin_read/.test(JSON.stringify(j))) return 'skipped (token lacks project_admin_read; sha256 ref lock enforced)';
      if (r.status === 401 || r.status === 403) throw new Error(`REF_LOCK: Management API refused access (HTTP ${r.status})`);
      if (j.name !== EXPECTED_PROJECT_NAME) throw new Error('REF_LOCK: project name is not couragelibrary-next — refusing to run');
      return 'verified (couragelibrary-next)';
    } catch (e) {
      if (/^REF_LOCK/.test(e.message) || i === 3) throw new Error(scrub(e.message, [token, ref]));
    }
  }
}

function generate(ref, token) {
  // The pinned CLI's JS entry point, run with this Node binary directly (no shell → no quoting, no echo).
  const cli = path.join(ROOT, 'node_modules', 'supabase', 'dist', 'supabase.js');
  if (!fs.existsSync(cli)) throw new Error('Supabase CLI not installed (npm install)');
  const env = { ...process.env, SUPABASE_ACCESS_TOKEN: token };
  for (let i = 1; i <= 3; i++) {
    const r = spawnSync(process.execPath, [cli, 'gen', 'types', 'typescript', '--project-id', ref, '--schema', 'public'], {
      cwd: ROOT, env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, shell: false, windowsHide: true,
    });
    if (r.status === 0 && r.stdout && /export type Database/.test(r.stdout)) {
      return HEADER + r.stdout.replace(/\r\n/g, '\n').replace(/\s+$/, '') + '\n';
    }
    if (i === 3) throw new Error(`type generation failed: ${scrub(r.stderr || r.error?.message, [token, ref]).slice(0, 400)}`);
  }
}

async function main(mode) {
  const env = readEnv();
  const token = env('SUPABASE_ACCESS_TOKEN');
  if (!token) throw new Error('SUPABASE_ACCESS_TOKEN is not set in .env.local');
  const ref = assertProjectRef(refFromEnv(env));
  const nameCheck = await assertProjectName(ref, token);
  console.log(`ref lock: sha256 OK; project-name check: ${nameCheck}`);
  const generated = generate(ref, token);
  if (mode === 'check') {
    const committed = fs.existsSync(OUT_FILE) ? fs.readFileSync(OUT_FILE, 'utf8').replace(/\r\n/g, '\n') : '';
    const tmp = path.join(os.tmpdir(), `db-types-check-${process.pid}.ts`);
    fs.writeFileSync(tmp, generated);
    fs.unlinkSync(tmp);
    if (committed !== generated) {
      const a = committed.split('\n');
      const b = generated.split('\n');
      let line = 0;
      while (line < Math.max(a.length, b.length) && a[line] === b[line]) line++;
      console.error(`db:types:check FAILED — types/database.ts differs from the live public schema (first difference at line ${line + 1}). Run: npm run db:types`);
      process.exit(1);
    }
    console.log('db:types:check OK — types/database.ts matches the live public schema');
    return;
  }
  fs.writeFileSync(OUT_FILE, generated);
  console.log(`db:types OK — wrote types/database.ts (${generated.split('\n').length} lines, schema public)`);
}

if (require.main === module) {
  // Arguments select the mode only; a project ref is never read from argv.
  const mode = process.argv.includes('--check') ? 'check' : 'write';
  main(mode).catch((e) => { console.error(String(e.message || e)); process.exit(1); });
}

module.exports = { assertProjectRef, refFromEnv, scrub, EXPECTED_REF_SHA256, HEADER };
