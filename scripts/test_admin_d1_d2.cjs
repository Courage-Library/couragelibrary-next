#!/usr/bin/env node
/**
 * ADMIN-UX-1 Q2 (architect 2026-10-26) — offline gate for the two admin fixes (no network, no database).
 *   D1-01 decision mapping onto the canonical discussion_moderation_flags values (RESOLVED → RESOLVED_REMOVED +
 *         CONTENT_REMOVED, DISMISSED → RESOLVED_DISMISSED + DISMISSED); anything else refused
 *   D1-02 resolveCommunityFlagAction: the existing guard first; canonical table only (no community_moderation_flags);
 *         PENDING-only update; content removal as fn_moderate_flagged_content; audit row; errors returned, never ignored;
 *         the manager shows the result
 *   D2-01 directory helpers: page / query parsing, email match, role from app_metadata only (never user_metadata)
 *   D2-02 lib/admin/users-directory.ts is server-only, uses the service-role client, real paging, a bounded scan
 *   D2-03 /admin/users: requireAdminPage (admin only) is the first await; nothing client-side imports the directory or
 *         the service-role client; the manager is a server component; the broken getAdminUsers is gone
 * Live counterpart: scripts/live/test_admin_d1_d2.cjs (real roles, rolled back).
 * Run: node scripts/test_admin_d1_d2.cjs
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    const info = fn();
    passed++;
    console.log(`  PASS  ${name}${info ? ' — ' + info : ''}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL  ${name}\n        ${String(e && e.message ? e.message : e).slice(0, 600)}`);
  }
}
const assert = (c, m) => {
  if (!c) throw new Error(m || 'assertion failed');
};
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => {
  const out = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
  module._compile(out.outputText, filename);
};
const MOD = require(path.join(ROOT, 'lib/community/moderation.ts'));
const DIR = require(path.join(ROOT, 'lib/admin/users-directory-core.ts'));

test('D1-01 decision mapping onto the canonical CHECK values', () => {
  const r = MOD.moderationDecision('RESOLVED');
  const d = MOD.moderationDecision('dismissed');
  assert(r.status === 'RESOLVED_REMOVED' && r.resolution_action === 'CONTENT_REMOVED' && r.removeContent === true, 'resolve');
  assert(d.status === 'RESOLVED_DISMISSED' && d.resolution_action === 'DISMISSED' && d.removeContent === false, 'dismiss');
  for (const bad of ['resolved_removed', '', null, 'USER_MUTED', 'PENDING']) assert(MOD.moderationDecision(bad) === null, `refused: ${bad}`);
  const mig = read('supabase/migrations/20260825000025_phase3l_community_discussions.sql');
  assert(/status IN \('PENDING', 'RESOLVED_REMOVED', 'RESOLVED_DISMISSED'\)/.test(mig) && /resolution_action IN \('DISMISSED', 'CONTENT_REMOVED'/.test(mig), 'values match the table CHECKs');
});

test('D1-02 resolveCommunityFlagAction: guard first, canonical table, PENDING-only, removal, audit, result shown', () => {
  const a = read('app/admin/actions.ts');
  const fn = code(a.slice(a.indexOf('export async function resolveCommunityFlagAction('), a.indexOf('\n}\n', a.indexOf('export async function resolveCommunityFlagAction(')) + 3));
  assert(/^\s*const authCheck = await guardAdminAction\(\{ allowStaff: true \}\);\s*\n\s*if \(!authCheck\.ok\) return authCheck;/m.test(fn.split('\n').slice(1, 3).join('\n')), 'the existing guard is the first statement');
  assert(!/community_moderation_flags/.test(code(a)) && /\.from\("discussion_moderation_flags"\)/.test(fn), 'canonical table only');
  assert(/\.eq\("status", "PENDING"\)/.test(fn) && /if \(!flag\) return actionFailure\("VALIDATION"/.test(fn), 'PENDING-only; a handled flag is reported');
  assert(/discussion_messages"\)\.update\(\{ is_deleted: true, deleted_at: now \}\)/.test(fn) && /discussion_threads"\)\.update\(\{ status: "LOCKED"/.test(fn), 'content removal as the RPC');
  assert(/action_type: "COMMUNITY_FLAG_MODERATED"/.test(fn) && /if \(auditError\) reportWriteFailure\(/.test(fn), 'audit row, failure logged');
  assert(!/@ts-expect-error/.test(fn), 'no escape left in the action');
  const m = read('components/admin/admin-community-manager.tsx');
  assert(/const r = await resolveCommunityFlagAction\(flagId, status\);/.test(m) && /role="status"/.test(m), 'manager shows the result');
});

test('D2-01 directory helpers (paging, email search, role from app_metadata only)', () => {
  assert(DIR.parsePage('3') === 3 && DIR.parsePage('0') === 1 && DIR.parsePage('x') === 1 && DIR.parsePage(['2']) === 2 && DIR.parsePage('1.5') === 1, 'page');
  assert(DIR.parseEmailQuery('  Foo@Bar.TEST ') === 'foo@bar.test' && DIR.parseEmailQuery(undefined) === '' && DIR.parseEmailQuery('x'.repeat(200)).length === 120, 'query');
  assert(DIR.emailMatches('Someone@Example.test', 'example') && !DIR.emailMatches(null, 'a') && !DIR.emailMatches('a@b.test', ''), 'match');
  assert(DIR.displayRole({ app_metadata: { role: 'admin' } }) === 'admin' && DIR.displayRole({ app_metadata: {}, user_metadata: { role: 'admin' } }) === 'student', 'role never from user_metadata');
  const u = DIR.toDirectoryUser({ id: 'u1', email: 'p@q.test', created_at: '2026-10-26T00:00:00Z', app_metadata: {} }, undefined);
  assert(u.hasProfile === false && u.profileStatus === 'Profile Missing' && u.fullName === 'p', 'missing profile');
  assert(DIR.pageCount(0) === 1 && DIR.pageCount(26) === 2 && DIR.pageCount(25) === 1, 'page count');
  assert(DIR.MAX_SCAN_PAGES * DIR.SCAN_PAGE_SIZE <= 50000, 'bounded scan');
});

test('D2-02 users-directory.ts: server-only, service role, real paging, bounded scan', () => {
  const s = read('lib/admin/users-directory.ts');
  assert(/^import "server-only";/.test(s) && /createAdminServerSupabaseClient\(\)/.test(s) && !/createServerSupabaseClient\(/.test(s), 'server-only + service role');
  assert(/listUsers\(\{ page: opts\.page, perPage \}\)/.test(s) && /listUsers\(\{ page: p, perPage: SCAN_PAGE_SIZE \}\)/.test(s) && /for \(let p = 1; p <= MAX_SCAN_PAGES; p\+\+\)/.test(s), 'paging + bounded scan');
  assert(/if \(error\) \{\s*logRead\("listUsers"/.test(s), 'errors are checked (the old code ignored them)');
});

test('D2-03 /admin/users: guard first; service role never reaches the client; broken path removed', () => {
  const p = code(read('app/admin/users/page.tsx'));
  const body = p.slice(p.indexOf('export default async function AdminUsersPage('));
  assert(body.indexOf('await requireAdminPage({ path: "/admin/users" });') > 0 && body.indexOf('await requireAdminPage') < body.indexOf('await searchParams'), 'admin-only guard is the first await');
  assert(/listDirectoryUsers\(/.test(p), 'uses the directory');
  const m = read('components/admin/admin-users-manager.tsx');
  assert(!/"use client"/.test(m) && !/users-directory"/.test(m) && !/createAdmin|SERVICE_ROLE/.test(m), 'manager: server component, no server module / key');
  const offenders = [];
  const walk = (d) => {
    for (const f of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) {
      const rel = `${d}/${f.name}`;
      if (f.isDirectory()) { if (!/node_modules|\.next/.test(rel)) walk(rel); continue; }
      if (!/\.(ts|tsx)$/.test(f.name)) continue;
      const s = read(rel);
      if (/"use client"/.test(s) && /lib\/admin\/users-directory"|createAdminServerSupabaseClient/.test(s)) offenders.push(rel);
    }
  };
  ['app', 'components', 'lib'].forEach(walk);
  assert(offenders.length === 0, offenders.join(', '));
  assert(!/getAdminUsers|AdminUserListItem/.test(read('services/admin.service.ts')), 'old getAdminUsers removed');
});

console.log(`\nADMIN D1/D2: ${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
