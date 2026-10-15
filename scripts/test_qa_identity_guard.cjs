/**
 * HOTFIX-1: permanent QA identity guard (unit, NO network).
 *
 *   G-01 the protected set is parsed from docs/testing/QA_IDENTITIES.md (qa-admin, qa-staff, qa-student, W2 reviewer)
 *   G-02 assertDeletable refuses every permanent identity (also with different case / whitespace) and unknown e-mails
 *   G-03 guardedDeleteUser (mocked admin) refuses each permanent identity by id: deleteUser is never called
 *   G-04 guardedDeleteUser allows a non-listed user: deleteUser is reached exactly once
 *   G-05 guardedDeleteUser fails closed when the user cannot be verified (lookup error / missing user)
 *   G-06 cleanup-student.cjs: refuses a permanent identity without E2E_KEEP_USER=1 BEFORE any connection, re-checks the
 *        found user, and deletes only through guardedDeleteUser
 *   G-07 no script/source calls auth.admin.deleteUser directly (only the guard; test mocks excluded)
 *   G-08 findUserByEmail / findUser use their e-mail argument (the cause of the false existence check in B1)
 *
 * Run: node scripts/test_qa_identity_guard.cjs
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const guard = require('./qa/qa-identity-guard.cjs');

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try { const info = await fn(); passed++; console.log(`  PASS  ${name}${info ? ' — ' + info : ''}`); } catch (e) { failed++; console.log(`  FAIL  ${name}\n        ${String(e && e.message ? e.message : e).slice(0, 800)}`); }
}
const assert = (c, m) => { if (!c) throw new Error(m || 'assertion failed'); };
const throws = (fn, re) => { try { fn(); } catch (e) { if (!re || re.test(e.message)) return true; throw new Error(`unexpected error: ${e.message}`); } throw new Error('expected a refusal'); };
const rejects = async (p, re) => { try { await p; } catch (e) { if (!re || re.test(e.message)) return true; throw new Error(`unexpected error: ${e.message}`); } throw new Error('expected a refusal'); };

const PERMANENT = ['qa-admin@courage-library.test', 'qa-staff@courage-library.test', 'qa-student@courage-library.test'];

/** Mock of supabase-js admin auth: users by id, records deleteUser calls. No network. */
function mockAdmin(usersById, { lookupError = false } = {}) {
  const calls = { deleteUser: [] };
  return {
    calls,
    auth: { admin: {
      getUserById: async (id) => (lookupError ? { data: null, error: { message: 'lookup failed' } } : { data: { user: usersById[id] || null }, error: null }),
      deleteUser: async (id) => { calls.deleteUser.push(id); return { data: {}, error: null }; },
    } },
  };
}

(async () => {
  console.log('HOTFIX-1 QA identity guard');

  await test('G-01 protected identities parsed from QA_IDENTITIES.md', async () => {
    const list = guard.permanentIdentityEmails();
    for (const e of PERMANENT) assert(list.includes(e), `missing ${e.split('@')[0]}`);
    assert(list.some((e) => e.startsWith('qa-content-reviewer-gap22a@')), 'W2 reviewer residue must be protected too');
    return `${list.length} protected`;
  });

  await test('G-02 assertDeletable refuses permanent identities (case/whitespace variants) and unknown e-mails', async () => {
    for (const e of PERMANENT) {
      throws(() => guard.assertDeletable(e), /permanent QA identity/);
      throws(() => guard.assertDeletable(`  ${e.toUpperCase()} `), /permanent QA identity/);
    }
    throws(() => guard.assertDeletable(null), /unknown/);
    throws(() => guard.assertDeletable(''), /unknown/);
    assert(guard.assertDeletable('qa-student-e2e@example.test') === true, 'temp E2E student must be deletable');
  });

  await test('G-03 guardedDeleteUser refuses each permanent identity by id; deleteUser never called', async () => {
    const users = Object.fromEntries(PERMANENT.map((e, i) => [`id-${i}`, { id: `id-${i}`, email: e }]));
    const admin = mockAdmin(users);
    for (const id of Object.keys(users)) await rejects(guard.guardedDeleteUser(admin, id), /permanent QA identity/);
    assert(admin.calls.deleteUser.length === 0, `deleteUser was called ${admin.calls.deleteUser.length}x`);
    return `${PERMANENT.length} refused`;
  });

  await test('G-04 guardedDeleteUser allows a non-listed user (deleteUser reached once)', async () => {
    const admin = mockAdmin({ 'id-temp': { id: 'id-temp', email: 'qa-student-e2e@example.test' } });
    await guard.guardedDeleteUser(admin, 'id-temp');
    assert(admin.calls.deleteUser.length === 1 && admin.calls.deleteUser[0] === 'id-temp', 'allowed path not reached');
  });

  await test('G-05 guardedDeleteUser fails closed when the user cannot be verified', async () => {
    const a1 = mockAdmin({}, { lookupError: true });
    await rejects(guard.guardedDeleteUser(a1, 'id-x'), /cannot verify/);
    const a2 = mockAdmin({});
    await rejects(guard.guardedDeleteUser(a2, 'id-missing'), /cannot verify/);
    await rejects(guard.guardedDeleteUser(a2, ''), /user id required/);
    assert(a1.calls.deleteUser.length + a2.calls.deleteUser.length === 0, 'deleteUser called on an unverified user');
  });

  await test('G-06 cleanup-student.cjs: early refusal, re-check, guarded deletion', async () => {
    const src = fs.readFileSync(path.join(ROOT, 'scripts/e2e/cleanup-student.cjs'), 'utf8');
    const refuse = src.indexOf('if (!KEEP_USER && isPermanentIdentity(EMAIL))');
    const connect = src.indexOf('await c.connect()');
    const find = src.indexOf('await findUser()');
    assert(refuse > 0, 'early refusal for permanent identities missing');
    assert(refuse < find && refuse < connect, 'refusal must run before findUser / DB connect');
    assert(/if \(!KEEP_USER\) assertDeletable\(u\.email\)/.test(src), 'found user is not re-checked');
    assert(/guardedDeleteUser\(admin, uid\)/.test(src), 'deletion does not go through guardedDeleteUser');
    assert(!/admin\.auth\.admin\.deleteUser\(/.test(src), 'direct deleteUser call remains');
  });

  await test('G-07 no direct auth.admin.deleteUser outside the guard (scripts, lib, services, app)', async () => {
    const offenders = [];
    const walk = (dir) => {
      if (!fs.existsSync(dir)) return;
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { if (!['node_modules', '.next'].includes(e.name)) walk(p); continue; }
        if (!/\.(c?js|mjs|ts|tsx)$/.test(e.name)) continue;
        const rel = path.relative(ROOT, p).replace(/\\/g, '/');
        if (rel === 'scripts/qa/qa-identity-guard.cjs' || rel === 'scripts/test_qa_identity_guard.cjs') continue;
        fs.readFileSync(p, 'utf8').split(/\r?\n/).forEach((l, i) => {
          if (/\.deleteUser\s*\(/.test(l)) offenders.push(`${rel}:${i + 1}`); // mocks define `deleteUser:` (property), not a call
        });
      }
    };
    ['scripts', 'lib', 'services', 'app'].forEach((d) => walk(path.join(ROOT, d)));
    assert(offenders.length === 0, offenders.join(', '));
  });

  await test('G-08 findUserByEmail uses its argument (pagination, case-insensitive, fail-closed) and findUser forwards it', async () => {
    const { findUserByEmail } = require('./e2e/find-user.cjs');
    // 450 users over 3 pages; the target sits on page 3, the E2E default e-mail on page 1.
    const users = Array.from({ length: 450 }, (_, i) => ({ id: `u${i}`, email: `user${i}@example.test` }));
    users[3].email = 'qa-student-e2e@example.test';
    users[420].email = 'qa-student@courage-library.test';
    const pages = [];
    const admin = { auth: { admin: { listUsers: async ({ page, perPage }) => (pages.push(page), { data: { users: users.slice((page - 1) * perPage, page * perPage) }, error: null }) } } };
    const hit = await findUserByEmail(admin, 'QA-Student@Courage-Library.test ');
    assert(hit && hit.id === 'u420', `expected u420, got ${hit && hit.id}`);
    assert((await findUserByEmail(admin, 'qa-student-e2e@example.test')).id === 'u3', 'different argument must find a different user');
    assert((await findUserByEmail(admin, 'nobody@example.test')) === null, 'absent user → null after the last page');
    await rejects(findUserByEmail(admin, ''), /e-mail required/);
    const failing = { auth: { admin: { listUsers: async () => ({ data: null, error: new Error('network down') }) } } };
    await rejects(findUserByEmail(failing, 'qa-student@courage-library.test'), /network down/); // never a false "not found"
    const env = fs.readFileSync(path.join(ROOT, 'scripts/e2e/_e2e-env.cjs'), 'utf8');
    assert(/async function findUser\(email = EMAIL\) \{\s*return findUserByEmail\(admin, email\);/.test(env), '_e2e-env findUser must forward its argument');
    assert(!/x\.email === EMAIL/.test(env), 'old argument-ignoring lookup still present');
    return `pages read ${Math.max(...pages)}`;
  });

  console.log(`\nQA identity guard: ${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
})();
