#!/usr/bin/env node
/**
 * USERNAME-1 (owner ruling 2026-11-02: PUBLIC IDENTITY = USERNAME) — offline gate.
 *   N-1 rules (lib/profile/username.ts): 3–20 a–z 0–9 _ . , starts with a letter, no two separators in a row, no trailing
 *       separator; reserved also with . / _ swapped or removed; phone-like (8+ digits) and e-mail-like refused; automatic
 *       names are valid and not phone-like
 *   N-2 TS ↔ SQL (migration 134): the same format regexes, phone / e-mail patterns and reserved additions in the CHECK,
 *       fn_set_username and the TS module
 *   N-3 migration 134: fn_public_identities SECURITY DEFINER + search_path '' + ≤ 100 ids + EXECUTE service_role only
 *       (REVOKE PUBLIC / anon / authenticated); returns id / label / is_team (no full_name / email / phone selected);
 *       username_history RLS on, no client grant; the trigger function revoked; 90-day hold + 30-day rule in
 *       fn_set_username; proof block; rollback file
 *   N-4 server-only resolver: lib/profile/public-identity.ts imports server-only, uses the admin client, batches of 100,
 *       "Member" on failure; community, leaderboard and the certificate check use it; no surface renders a user id or a
 *       real name of another member
 *   N-5 availability check: signed-in, rate-limited, answers yes / no only (AVAILABLE / NOT_AVAILABLE + rule codes)
 * --self-test: NEGATIVE CONTROLS — a resolver granted to authenticated, a resolver without the 100 cap, a trigger-less
 *   migration, a TS rule that accepts a phone number, and a certificate page showing the RPC's real name must each fail.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

const MIG = 'supabase/migrations/20261102000134_username_1.sql';
const FILES = [MIG, 'docs/database/rollback/134_rollback.sql', 'lib/profile/username.ts', 'lib/profile/public-identity.ts', 'services/community.service.ts',
  'services/assessment.service.ts', 'services/live-test-certificate.service.ts', 'app/(site)/settings/profile/actions.ts', 'components/profile/profile-settings-form.tsx',
  'app/(site)/community/[id]/thread-client.tsx'];

function loadUsername(src) {
  const ts = require('typescript');
  const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', out)(require, mod, mod.exports);
  return mod.exports;
}

function check(over = {}) {
  const f = Object.fromEntries(FILES.map((x) => [x, x in over ? over[x] : read(x)]));
  const fails = [];
  const fail = (m) => fails.push(m);
  // N-1
  const U = loadUsername(f['lib/profile/username.ts']);
  const cases = {
    'a.b_c': 'OK', 'Zz.Test': 'OK', abc: 'OK', aspirant_123456: 'OK', ab: 'INVALID_FORMAT', '9abc': 'INVALID_FORMAT', 'a..b': 'INVALID_FORMAT', 'a._b': 'INVALID_FORMAT',
    'abc.': 'INVALID_FORMAT', abc_: 'INVALID_FORMAT', 'a-b-c': 'INVALID_FORMAT', [`a${'b'.repeat(20)}`]: 'INVALID_FORMAT', admin: 'NOT_ALLOWED', 'courage.library': 'NOT_ALLOWED',
    'courage_library': 'NOT_ALLOWED', ssc: 'NOT_ALLOWED', 'u.p.s.c': 'NOT_ALLOWED', a9876543210: 'NOT_ALLOWED', 'ram.gmail': 'NOT_ALLOWED', 'ram.com': 'NOT_ALLOWED', team: 'NOT_ALLOWED',
  };
  for (const [u, want] of Object.entries(cases)) if (U.checkUsername(u) !== want) fail(`N-1 checkUsername(${u}) = ${U.checkUsername(u)} (want ${want})`);
  if (!U.AUTO_USERNAME_RX || !U.AUTO_USERNAME_RX.test('aspirant_000123')) fail('N-1 AUTO_USERNAME_RX missing');
  // N-2
  const m = f[MIG];
  if (!m.includes("username ~ '^[a-z][a-z0-9_.]{2,19}$' AND username !~ '[_.][_.]' AND username !~ '[_.]$'")) fail('N-2 CHECK format differs');
  if (!m.includes("v_name !~ '^[a-z][a-z0-9_.]{2,19}$' OR v_name ~ '[_.][_.]' OR v_name ~ '[_.]$'")) fail('N-2 fn_set_username format differs');
  if (String(U.USERNAME_RX) !== '/^[a-z][a-z0-9_.]{2,19}$/') fail('N-2 TS USERNAME_RX differs');
  if (!/length\(regexp_replace\(v_name, '\[\^0-9\]', '', 'g'\)\) >= 8/.test(m)) fail('N-2 SQL phone-like rule differs');
  if (!m.includes("v_name ~ '(gmail|yahoo|outlook|hotmail|rediffmail|icloud|protonmail)'") || !m.includes("v_name ~ '[.](com|in|net|org|co|edu|gov|io)$'")) fail('N-2 SQL e-mail-like rule differs');
  const tsU = f['lib/profile/username.ts'];
  if (!tsU.includes('/(gmail|yahoo|outlook|hotmail|rediffmail|icloud|protonmail)/') || !tsU.includes('/[.](com|in|net|org|co|edu|gov|io)$/') || !/length >= 8\) return "NOT_ALLOWED"/.test(tsU)) fail('N-2 TS phone / e-mail rules differ');
  for (const t of ['aspirant', 'ibps', 'police', 'rrb', 'ssc', 'upsc']) if (!m.includes(`('${t}', 'RESERVED')`) || !U.RESERVED_USERNAMES.includes(t)) fail(`N-2 reserved ${t} missing`);
  // N-3
  const fnBody = (m.match(/CREATE OR REPLACE FUNCTION public\.fn_public_identities[\s\S]*?\n\$\$;/) || [''])[0];
  if (!/SECURITY DEFINER\s+SET search_path = ''/.test(fnBody)) fail('N-3 resolver not SECURITY DEFINER with search_path ""');
  if (!/cardinality\(p_ids\) > 100 THEN\s+RAISE EXCEPTION/.test(fnBody)) fail('N-3 resolver has no 100-id cap');
  if (/full_name|email|phone/.test(fnBody.replace(/--[^\n]*/g, ''))) fail('N-3 resolver reads a real name / e-mail / phone');
  if (!/RETURNS TABLE \(id uuid, label text, is_team boolean\)/.test(fnBody)) fail('N-3 resolver returns more than id / label / is_team');
  if (!m.includes('REVOKE ALL ON FUNCTION public.fn_public_identities(uuid[]) FROM PUBLIC, anon, authenticated;') || !m.includes('GRANT EXECUTE ON FUNCTION public.fn_public_identities(uuid[]) TO service_role;')
    || /GRANT EXECUTE ON FUNCTION public\.fn_public_identities\(uuid\[\]\) TO [^;]*(anon|authenticated)/.test(m)) fail('N-3 resolver EXECUTE not service_role only');
  if (!m.includes('ALTER TABLE public.username_history ENABLE ROW LEVEL SECURITY;') || !m.includes('REVOKE ALL ON public.username_history FROM PUBLIC, anon, authenticated;') || /GRANT [^;]* ON public\.username_history TO [^;]*(anon|authenticated)/.test(m)) fail('N-3 username_history client-readable');
  if (!m.includes('CREATE TRIGGER trg_user_profiles_auto_username BEFORE INSERT ON public.user_profiles') || !m.includes('REVOKE ALL ON FUNCTION public.fn_user_profiles_auto_username() FROM PUBLIC, anon, authenticated;')) fail('N-3 auto-username trigger missing / callable');
  if (!/interval '90 days'/.test(m) || !/interval '30 days'/.test(m) || !/DO \$proof\$/.test(m)) fail('N-3 90-day hold / 30-day rule / proof block missing');
  if (!/DROP FUNCTION IF EXISTS public\.fn_public_identities/.test(f['docs/database/rollback/134_rollback.sql'])) fail('N-3 rollback incomplete');
  // N-4
  const r = f['lib/profile/public-identity.ts'];
  if (!/^import "server-only";/.test(r) || !/createAdminServerSupabaseClient\(\)/.test(r) || !/PUBLIC_IDENTITY_BATCH = 100;/.test(r) || !/rpc\("fn_public_identities"/.test(r)) fail('N-4 resolver is not server-only / admin client / batched by 100');
  if (!/resolvePublicIdentities\(/.test(f['services/community.service.ts']) || !/\{m\.authorLabel\}/.test(f['app/(site)/community/[id]/thread-client.tsx'])) fail('N-4 community does not show the username label');
  if (!/resolvePublicIdentities\(view\.entries/.test(f['services/assessment.service.ts'])) fail('N-4 leaderboard does not resolve usernames');
  const cert = f['services/live-test-certificate.service.ts'];
  if (!/candidate_display_name = identityOf\(labels, holder\)\.label;/.test(cert)) fail('N-4 certificate check still shows the RPC name');
  if (/authorId\.slice|\{m\.authorId\}|fullName/.test(f['app/(site)/community/[id]/thread-client.tsx'])) fail('N-4 community renders an id / name');
  // N-5
  const a = f['app/(site)/settings/profile/actions.ts'];
  const av = a.slice(a.indexOf('export async function checkUsernameAvailabilityAction'), a.indexOf('export async function setProfileVisibilityAction'));
  if (!/session\.state !== "user"/.test(av) || !/AVAILABILITY_PER_MINUTE/.test(av) || !/"AVAILABLE" : "NOT_AVAILABLE"/.test(av) || /\.select\("(?!id")/.test(av)) fail('N-5 availability check is not signed-in / rate-limited / yes-no only');
  if (!/checkUsernameAvailabilityAction\(/.test(f['components/profile/profile-settings-form.tsx'])) fail('N-5 the profile form has no availability check');
  return fails;
}

if (process.argv.includes('--self-test')) {
  const m = read(MIG);
  const controls = [
    ['a resolver granted to authenticated', { [MIG]: m + '\nGRANT EXECUTE ON FUNCTION public.fn_public_identities(uuid[]) TO authenticated;' }, /N-3 resolver EXECUTE/],
    ['a resolver without the 100 cap', { [MIG]: m.replace('cardinality(p_ids) > 100', 'cardinality(p_ids) > 100000') }, /N-3 resolver has no 100-id cap/],
    ['a resolver reading full_name', { [MIG]: m.replace("coalesce(p.username, 'Member')", "coalesce(p.username, p.full_name)") }, /N-3 resolver reads a real name/],
    ['a migration without the trigger', { [MIG]: m.replace('CREATE TRIGGER trg_user_profiles_auto_username', 'CREATE TRIGGER zz_other') }, /N-3 auto-username trigger/],
    ['a TS rule that accepts a phone number', { 'lib/profile/username.ts': read('lib/profile/username.ts').replace('length >= 8) return "NOT_ALLOWED"', 'length >= 80) return "NOT_ALLOWED"') }, /N-1 checkUsername\(a9876543210\)/],
    ['a certificate page showing the RPC name', { 'services/live-test-certificate.service.ts': read('services/live-test-certificate.service.ts').replace('candidate_display_name = identityOf(labels, holder).label;', 'candidate_display_name;') }, /N-4 certificate/],
  ];
  let bad = 0;
  for (const [n, over, want] of controls) {
    const f = check(over);
    const caught = f.some((x) => want.test(x));
    if (!caught) bad++;
    console.log(`${caught ? 'OK  ' : 'MISS'} negative control: ${n}${caught ? '' : ' — ' + JSON.stringify(f)}`);
  }
  console.log(bad ? 'USERNAME-1 self-test: FAILED' : 'USERNAME-1 self-test: all negative controls caught');
  process.exit(bad ? 1 : 0);
}

const fails = check();
for (const x of fails) console.log('FAIL ' + x);
console.log(fails.length ? `USERNAME-1 offline: ${fails.length} FAILURES` : 'USERNAME-1 offline: ALL PASS (rules, TS ↔ SQL, resolver service_role only + ≤ 100 + label only, history private, trigger, surfaces, availability)');
process.exit(fails.length ? 1 : 0);
