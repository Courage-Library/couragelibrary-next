#!/usr/bin/env node
/**
 * PUBLIC IDENTITY (owner ruling 2026-11-02): other people never see a user's real name, e-mail or phone — only the
 * username (USERNAME-1; until then "Member"). Real names are readable by the user themself and by admins (server side).
 *   I-1 no student-facing code reads ANOTHER user's name / e-mail / phone: a user_profiles read of full_name / phone /
 *       email for several ids (.in(...)) is allowed only inside an admin function (name contains "Admin") or admin code
 *   I-2 the test leaderboard shows "You" / the server-resolved username or Team label (USERNAME-1), "Member" as the
 *       fallback — never a (masked) real name
 *   I-3 community never renders a user id or name of another member
 * --self-test: NEGATIVE CONTROLS — a student-facing multi-user name read and a masked-name leaderboard must each fail.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(rel, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(rel);
  }
  return out;
}

const NAME_READ = /from\(\s*["']user_profiles["']\s*\)\s*\.select\(\s*["'`][^"'`]*\b(full_name|phone|email)\b[^"'`]*["'`]\s*\)\s*\.in\(/g;

function check(files) {
  const fails = [];
  const list = Object.keys(files).length ? Object.keys(files) : ['app', 'components', 'lib', 'services', 'actions'].flatMap((d) => walk(d));
  const get = (f) => (f in files ? files[f] : read(f));
  // I-1
  for (const f of list) {
    if (/\/admin\/|admin-|\/\(site\)\/admin\//.test(f)) continue;
    const s = get(f).replace(/\s+/g, ' ');
    for (const m of s.matchAll(NAME_READ)) {
      const before = s.slice(0, m.index);
      const fn = [...before.matchAll(/(?:static\s+)?async\s+(?:function\s+)?(\w+)\s*\(/g)].pop();
      if (!fn || !/Admin/.test(fn[1])) fails.push(`I-1 ${f}: ${fn ? fn[1] : '?'} reads other users' ${m[1]}`);
    }
  }
  // I-2
  const svc = get('services/assessment.service.ts');
  const lb = svc.slice(svc.indexOf('const item = (e: LeaderboardEntry)'), svc.indexOf('const item = (e: LeaderboardEntry)') + 400);
  // USERNAME-1: the label comes from the server resolver (username or "Courage Library Team"), "Member" as the fallback
  if (!/displayName: isCurrentUser \? "You" : identityOf\(labels, e\.userId\)\.label \|\| PUBLIC_MEMBER_LABEL,/.test(lb) || /maskCandidateName\(|full_name/.test(lb)) fails.push('I-2 the test leaderboard shows another student\'s (masked) name');
  if (!/export const PUBLIC_MEMBER_LABEL = "Member";/.test(svc)) fails.push('I-2 PUBLIC_MEMBER_LABEL is not "Member"');
  // I-3
  const thread = get('app/(site)/community/[id]/thread-client.tsx');
  if (/authorId\.slice|\{m\.authorId\}|authorEmail|fullName/.test(thread)) fails.push('I-3 community renders a member id / name');
  return fails;
}

if (process.argv.includes('--self-test')) {
  const base = Object.fromEntries(['services/assessment.service.ts', 'app/(site)/community/[id]/thread-client.tsx'].map((f) => [f, read(f)]));
  const controls = [
    ['a student-facing multi-user name read', { ...base, 'services/zz-fixture.service.ts': 'class X { static async getLeague(ids) { return sb.from("user_profiles").select("id, full_name").in("id", ids); } }' }, /I-1 services\/zz-fixture/],
    ['a masked-name leaderboard', { ...base, 'services/assessment.service.ts': base['services/assessment.service.ts'].replace('displayName: isCurrentUser ? "You" : identityOf(labels, e.userId).label || PUBLIC_MEMBER_LABEL,','displayName: isCurrentUser ? "You" : AssessmentService.maskCandidateName(n),') }, /I-2/],
    ['community showing the author id', { ...base, 'app/(site)/community/[id]/thread-client.tsx': base['app/(site)/community/[id]/thread-client.tsx'] + '\n<span>{m.authorId.slice(0, 8)}</span>' }, /I-3/],
  ];
  let bad = 0;
  for (const [n, files, want] of controls) {
    const f = check(files);
    const ok = f.some((x) => want.test(x));
    if (!ok) bad++;
    console.log(`${ok ? 'OK  ' : 'MISS'} negative control: ${n}${ok ? '' : ' — ' + JSON.stringify(f)}`);
  }
  const allowed = check({ 'services/zz-admin.service.ts': 'class X { static async getAdminStats(ids) { return sb.from("user_profiles").select("id, full_name").in("id", ids); } }', ...base });
  if (allowed.some((x) => /zz-admin/.test(x))) { bad++; console.log('MISS admin function wrongly flagged'); }
  console.log(bad ? 'PUBLIC-IDENTITY self-test: FAILED' : 'PUBLIC-IDENTITY self-test: all negative controls caught');
  process.exit(bad ? 1 : 0);
}

const fails = check({});
for (const f of fails) console.log('FAIL ' + f);
console.log(fails.length ? `PUBLIC-IDENTITY: ${fails.length} FAILURES` : 'PUBLIC-IDENTITY: ALL PASS (no student-facing read of other users\' names; leaderboard "Member"; community shows no member id)');
process.exit(fails.length ? 1 : 0);
