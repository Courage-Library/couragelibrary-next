/**
 * Decision #38 guard — NO direct database connections from runtime code. Static, no network.
 *
 * Runtime = app/, services/, lib/, actions/, components/, config/, middleware.ts.
 *   R-1 no import / require of 'pg', 'postgres', 'pg-pool' (incl. sub-paths and dynamic require)
 *   R-2 no `rejectUnauthorized` and no `NODE_TLS_REJECT_UNAUTHORIZED` (TLS verification can never be weakened at runtime)
 *   R-3 direct-connection env vars (DATABASE_URL, POSTGRES_*, SUPABASE_DB_URL) are referenced only by allow-listed files
 *       that never connect (parse-only), each with an owner; any new reference fails
 *   R-4 the HOTFIX-3 fail-closed path for atomic subtree creation stays in place
 *
 * Direct pg is allowed only in scripts/ (verified TLS via scripts/db/_db-env.cjs + ref guard).
 * Run: node scripts/test_no_runtime_db.cjs
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const RUNTIME_DIRS = ['app', 'services', 'lib', 'actions', 'components', 'config'];
const RUNTIME_FILES = ['middleware.ts'];
// parse-only references to connection-string env vars (no connection is opened); owner in brackets
const ENV_ALLOW = {
  'services/current-affairs-production-sync.service.ts': 'TEST-CA (B3): reads the URL only to label the environment in the admin sync-status health view',
};

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try { const info = await fn(); passed++; console.log(`  PASS  ${name}${info ? ' — ' + info : ''}`); } catch (e) { failed++; console.log(`  FAIL  ${name}\n        ${String(e && e.message ? e.message : e).slice(0, 2500)}`); }
}
const assert = (c, m) => { if (!c) throw new Error(m || 'assertion failed'); };

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!['node_modules', '.next'].includes(e.name)) walk(p, acc); } else if (/\.(c?js|mjs|jsx|ts|tsx)$/.test(e.name)) acc.push(p);
  }
  return acc;
}
const files = [...RUNTIME_DIRS.flatMap((d) => walk(path.join(ROOT, d))), ...RUNTIME_FILES.map((f) => path.join(ROOT, f)).filter((f) => fs.existsSync(f))];
const rel = (f) => path.relative(ROOT, f).replace(/\\/g, '/');
/** Source without comments (so documentation of the rule does not trip it). */
const code = (f) => fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const scan = (re) => {
  const hits = [];
  for (const f of files) code(f).split('\n').forEach((l, i) => { if (re.test(l)) hits.push(`${rel(f)}:${i + 1}: ${l.trim().slice(0, 120)}`); });
  return hits;
};

(async () => {
  console.log('Decision #38: no runtime direct DB connections');

  await test('R-1 no pg / postgres / pg-pool import or require in runtime code', async () => {
    const hits = scan(/(?:require\s*\(\s*|import\s*\(\s*|from\s+)['"](pg|postgres|pg-pool)(\/[^'"]*)?['"]/);
    assert(hits.length === 0, hits.join('\n        '));
    return `${files.length} runtime files`;
  });

  await test('R-2 no rejectUnauthorized / NODE_TLS_REJECT_UNAUTHORIZED in runtime code', async () => {
    const hits = scan(/rejectUnauthorized|NODE_TLS_REJECT_UNAUTHORIZED/);
    assert(hits.length === 0, hits.join('\n        '));
  });

  await test('R-3 direct-connection env vars referenced only by allow-listed parse-only files', async () => {
    const hits = scan(/\b(DATABASE_URL|POSTGRES_[A-Z_]+|SUPABASE_DB_URL)\b/).filter((h) => !Object.prototype.hasOwnProperty.call(ENV_ALLOW, h.split(':')[0]));
    assert(hits.length === 0, hits.join('\n        '));
    for (const f of Object.keys(ENV_ALLOW)) {
      const src = code(path.join(ROOT, f));
      assert(!/\.connect\s*\(|new\s+Client\s*\(|createPool|new\s+Pool\s*\(/.test(src), `${f} is allow-listed as parse-only but opens a connection`);
    }
    return `allow-listed: ${Object.keys(ENV_ALLOW).length}`;
  });

  await test('R-4 atomic subtree creation fails closed from runtime (HOTFIX-3)', async () => {
    const svc = fs.readFileSync(path.join(ROOT, 'services/exam-syllabus-resolution.service.ts'), 'utf8');
    assert(/if \(!isPg\) \{\s*throw new SyllabusReconciliationUnavailableError\(\);/.test(svc), 'createSubtree must throw before any read/write when no script client is supplied');
    const op = fs.readFileSync(path.join(ROOT, 'services/operational-syllabus-reconciliation.service.ts'), 'utf8');
    assert(/if \(normalizedAction === 'CREATE_NEW_SUBTREE'\) \{\s*throw new OperationalSyllabusReconciliationError\('SERVICE_UNAVAILABLE', SYLLABUS_RECONCILIATION_UNAVAILABLE_MESSAGE, 503\);/.test(op), 'operational service must reject CREATE_NEW_SUBTREE before delegation');
    const types = fs.readFileSync(path.join(ROOT, 'types/dynamic-syllabus-reconciliation.ts'), 'utf8');
    assert(types.includes("SYLLABUS_RECONCILIATION_UNAVAILABLE_MESSAGE = 'Syllabus reconciliation is unavailable until the syllabus rebuild (GAP2-4)'"), 'message text');
    assert(fs.readFileSync(path.join(ROOT, 'app/admin/syllabus-reconciliation/syllabus-reconciliation-client.tsx'), 'utf8').includes('{SYLLABUS_RECONCILIATION_UNAVAILABLE_MESSAGE}'), 'admin page must show the message');
  });

  console.log(`\nNo runtime DB: ${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
})();
