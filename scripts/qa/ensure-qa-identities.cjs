/**
 * COURAGE LIBRARY — PERMANENT QA IDENTITIES (SEC-1B)
 *
 * Idempotently ensures the permanent QA identities exist on couragelibrary-next:
 *   qa-admin@courage-library.test    app_metadata.role = 'admin'
 *   qa-staff@courage-library.test    app_metadata.role = 'staff'
 *   qa-student@courage-library.test  (no role)
 * Roles are set server-side with the service role (app_metadata is not user-writable).
 * Passwords are generated once and appended to .env.local (QA_ADMIN_PASSWORD, QA_STAFF_PASSWORD,
 * QA_STUDENT_PASSWORD) only if those keys are absent. Nothing secret is ever printed.
 * Never creates throwaway users. See docs/testing/QA_IDENTITIES.md.
 *
 * Usage: node scripts/qa/ensure-qa-identities.cjs
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { readEnv, dbTarget, ROOT } = require('../db/_db-env.cjs');

const IDENTITIES = [
  { email: 'qa-admin@courage-library.test', role: 'admin', envKey: 'QA_ADMIN_PASSWORD' },
  { email: 'qa-staff@courage-library.test', role: 'staff', envKey: 'QA_STAFF_PASSWORD' },
  { email: 'qa-student@courage-library.test', role: null, envKey: 'QA_STUDENT_PASSWORD' },
];

(async () => {
  dbTarget(); // ref guard + TLS CA present
  const env = readEnv();
  if (typeof globalThis.WebSocket === 'undefined') globalThis.WebSocket = class DummyWebSocket {};
  const { createClient } = require('@supabase/supabase-js');
  const svc = createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });

  let all = [];
  for (let page = 1; page < 20; page++) {
    const { data, error } = await svc.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers failed (${error.status || 'unknown'})`);
    all = all.concat(data.users);
    if (data.users.length < 200) break;
  }

  const envFile = path.join(ROOT, '.env.local');
  const additions = [];
  for (const id of IDENTITIES) {
    let password = env(id.envKey);
    const existing = all.find((u) => (u.email || '').toLowerCase() === id.email);
    if (!password) {
      password = crypto.randomBytes(24).toString('base64url') + 'aA1!';
      additions.push(`${id.envKey}=${password}`);
    }
    const appMetadata = id.role ? { role: id.role } : {};
    if (!existing) {
      const { error } = await svc.auth.admin.createUser({ email: id.email, password, email_confirm: true, app_metadata: appMetadata, user_metadata: { full_name: `QA ${id.role || 'student'}` } });
      if (error) throw new Error(`createUser ${id.email} failed (${error.status || 'unknown'})`);
      console.log(`created ${id.email} role=${id.role || 'none'}`);
    } else {
      const update = { app_metadata: appMetadata };
      if (additions.some((a) => a.startsWith(id.envKey + '='))) update.password = password;
      const { error } = await svc.auth.admin.updateUserById(existing.id, update);
      if (error) throw new Error(`updateUser ${id.email} failed (${error.status || 'unknown'})`);
      console.log(`exists  ${id.email} role=${id.role || 'none'} (role re-asserted)`);
    }
  }
  if (additions.length) {
    const cur = fs.readFileSync(envFile, 'utf8');
    fs.writeFileSync(envFile, cur + (cur.endsWith('\n') ? '' : '\n') + '# Permanent QA identities (SEC-1B) — never commit\n' + additions.join('\n') + '\n');
    console.log(`stored ${additions.length} QA password(s) in .env.local`);
  }
})().catch((e) => {
  console.log('ERR', e.message);
  process.exit(1);
});
