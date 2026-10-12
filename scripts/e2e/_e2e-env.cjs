/**
 * Shared setup for the student E2E harness (scripts/e2e).
 * - Reads .env.local / process.env through scripts/db/_db-env.cjs (same ref guard + verified TLS as the
 *   migration runner). Never prints values.
 * - The test student password is generated per run and kept in memory only.
 *
 * Env:
 *   E2E_BASE_URL       app under test (default http://localhost:3100; must be a local dev host)
 *   E2E_STUDENT_EMAIL  temp student (default qa-student-e2e@example.test; must end in .test)
 *   E2E_MOCK_ID        mock test id, or E2E_MOCK_SLUG (default ssc-cgl-daily-monday-mock)
 *   E2E_SCREENS_DIR    optional directory for screenshots (none taken when unset)
 *   E2E_OUT_DIR        directory for JSON results (default OS temp dir)
 *   E2E_PG_PORT        Postgres port (default 6543, the Supavisor transaction pooler)
 */
const os = require('os');
const crypto = require('crypto');
const { readEnv, dbTarget } = require('../db/_db-env.cjs');

if (typeof globalThis.WebSocket === 'undefined') globalThis.WebSocket = class DummyWebSocket {};
const { createClient } = require('@supabase/supabase-js');

const env = readEnv();
const target = dbTarget(); // throws TARGET_REF_MISMATCH / TLS_CA_MISSING before anything connects

const BASE = (env('E2E_BASE_URL') || 'http://localhost:3100').replace(/\/$/, '');
const baseHost = new URL(BASE).hostname;
if (!/^(localhost|127\.0\.0\.1|\[::1\])$/.test(baseHost) && !/\.(localhost|test)$/.test(baseHost)) {
  throw new Error('E2E_BASE_URL must be a local dev host');
}
const EMAIL = env('E2E_STUDENT_EMAIL') || 'qa-student-e2e@example.test';
if (!EMAIL.endsWith('.test')) throw new Error('E2E_STUDENT_EMAIL must use a .test domain');
const OUT_DIR = env('E2E_OUT_DIR') || os.tmpdir();
const SCREENS_DIR = env('E2E_SCREENS_DIR') || null;

const pgConfig = () => ({ ...target.pg, port: Number(env('E2E_PG_PORT') || 6543) });

const URL_ = env('NEXT_PUBLIC_SUPABASE_URL');
const noSession = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(URL_, env('SUPABASE_SERVICE_ROLE_KEY'), noSession);
const anonKey = env('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY') || env('NEXT_PUBLIC_SUPABASE_ANON_KEY');
const userClient = () => createClient(URL_, anonKey, noSession);

async function findUser() {
  for (let page = 1; page < 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const u = data.users.find((x) => x.email === EMAIL);
    if (u) return u;
    if (data.users.length < 200) return null;
  }
  return null;
}

/** Ensures the student exists with NO app_metadata role and a fresh random password. */
async function ensureStudent() {
  const password = crypto.randomBytes(18).toString('base64url') + 'aA1!';
  let user = await findUser();
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email: EMAIL,
      password,
      email_confirm: true,
      user_metadata: { full_name: 'QA Student E2E' },
      app_metadata: {},
    });
    if (error) throw error;
    user = data.user;
  } else {
    const { error } = await admin.auth.admin.updateUserById(user.id, { password });
    if (error) throw error;
  }
  if (user.app_metadata && user.app_metadata.role) throw new Error('test student must not have an app_metadata role');
  return { user, password };
}

async function resolveMockId() {
  const id = env('E2E_MOCK_ID');
  if (id) return id;
  const slug = env('E2E_MOCK_SLUG') || 'ssc-cgl-daily-monday-mock';
  const { data, error } = await admin.from('mock_tests').select('id').eq('slug', slug).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`mock test not found for slug ${slug}`);
  return data.id;
}

function stepRecorder() {
  const results = [];
  const step = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  };
  return { results, step };
}

module.exports = { BASE, EMAIL, OUT_DIR, SCREENS_DIR, pgConfig, admin, userClient, findUser, ensureStudent, resolveMockId, stepRecorder };
