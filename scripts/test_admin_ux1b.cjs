#!/usr/bin/env node
/**
 * ADMIN-UX-1 phase B (architect GO 2026-10-26) — offline gate: shell, role-aware sidebar, Ctrl/Cmd+K search, Today.
 * UI only — every rule below proves that NO authorization changed and NO new data is exposed.
 *   AB-01 every nav link's `access` equals its page's existing requireAdminPage guard (allowStaff → staff, else admin)
 *   AB-02 visibleNav: staff never sees an admin-only link; flags hide items / the Payments group; no empty groups
 *   AB-03 one active link (longest prefix; /admin exact; retired /admin/mock-tests-management lights nothing)
 *   AB-04 layout: the guard unchanged and first; ONE <main> (the root shell's); admin skip link; never-glass; no e-mail
 *         or hard-coded role in the shell; sidebar scrolls (never clipped); header shows the real role
 *   AB-05 search: existing guard first; users only for admins, tickets only while support is on; LIKE wildcards escaped;
 *         results = id / label / detail / href only; the client imports only the action
 *   AB-06 Today: guard first; read model server-only + service role; admin-only cards only for admins; no actor e-mails;
 *         failed reads show "Not available" (no invented values); no write-failure / nightly cards (Q5)
 *   AB-07 deep links: factory / CA / question reports / support accept only known values, after the guard
 *   AB-08 status chips: six kinds, text always shown; mapping of the existing statuses
 *   AB-09 a11y (static): aria-current, aria-expanded buttons, no clickable divs in the shell, combobox / listbox,
 *         focus rings, ≥ 36 px targets, loading + error states for /admin
 * Run: node scripts/test_admin_ux1b.cjs
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    const info = fn();
    passed++;
    console.log(`  PASS  ${name}${info ? ' — ' + info : ''}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL  ${name}\n        ${String(e && e.message ? e.message : e).slice(0, 900)}`);
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
const NAV = require(path.join(ROOT, 'lib/admin/nav.ts'));
const SEARCH = require(path.join(ROOT, 'lib/admin/search-core.ts'));
const STATUS = require(path.join(ROOT, 'lib/admin/status.ts'));
const ALL_ON = { ADAPTIVE: true, LIVE_TESTS: true, SUPPORT: true, PAYMENTS: true };
const ALL_OFF = { ADAPTIVE: false, LIVE_TESTS: false, SUPPORT: false, PAYMENTS: false };
const allLeaves = (nav) => nav.flatMap((g) => g.items.flatMap((it) => [it, ...(it.children || [])]));

test('AB-01 every nav link mirrors its page guard (no authorization change)', () => {
  const bad = [];
  for (const it of allLeaves(NAV.ADMIN_NAV)) {
    const file = `app${it.href}/page.tsx`;
    if (!fs.existsSync(path.join(ROOT, file))) { bad.push(`${it.href}: no page`); continue; }
    const m = code(read(file)).match(/requireAdminPage\(\{([^}]*)\}\)/);
    if (!m) { bad.push(`${it.href}: no requireAdminPage`); continue; }
    const guard = /allowStaff:\s*true/.test(m[1]) ? 'staff' : 'admin';
    if (guard !== it.access) bad.push(`${it.href}: nav ${it.access} ≠ page ${guard}`);
  }
  assert(bad.length === 0, bad.join('; '));
  return `${allLeaves(NAV.ADMIN_NAV).length} links checked against their pages`;
});

test('AB-02 role-aware + flag-aware visibility', () => {
  const staff = allLeaves(NAV.visibleNav('staff', ALL_ON));
  assert(staff.every((l) => l.access === 'staff'), 'staff sees an admin-only link');
  for (const h of ['/admin/users', '/admin/question-reports', '/admin/taxonomy', '/admin/pro-library', '/admin/premium', '/admin/billing']) assert(!staff.some((l) => l.href === h), `staff sees ${h}`);
  const adminOff = NAV.visibleNav('admin', ALL_OFF);
  assert(!adminOff.some((g) => g.id === 'payments'), 'Payments shown while PAYMENTS_ENABLED is off');
  assert(NAV.visibleNav('admin', ALL_ON).some((g) => g.id === 'payments'), 'Payments hidden while on');
  for (const h of ['/admin/support', '/admin/adaptive', '/admin/live-tests', '/admin/achievements']) assert(!allLeaves(adminOff).some((l) => l.href === h), `${h} shown while its flag is off`);
  for (const g of [...adminOff, ...NAV.visibleNav('staff', ALL_OFF)]) assert(g.items.length > 0, `empty group ${g.id}`);
  const st = NAV.visibleNav('staff', ALL_OFF).find((g) => g.id === 'content').items.find((i) => i.label === 'Syllabus & taxonomy');
  assert(st && !st.children && st.href === '/admin/syllabus', 'a parent with one visible child becomes a direct link');
  assert(NAV.ADMIN_NAV.find((g) => g.id === 'dormant').collapsed === true, 'dormant group starts collapsed');
});

test('AB-03 exactly one active link', () => {
  const nav = NAV.visibleNav('admin', ALL_ON);
  const cases = [['/admin', '/admin'], ['/admin/questions/factory', '/admin/questions/factory'], ['/admin/questions', '/admin/questions'], ['/admin/syllabus/abc', '/admin/syllabus'], ['/admin/content/topics', '/admin/content/topics'], ['/admin/mock-tests-management', null], ['/admin/mock-tests', '/admin/mock-tests'], ['/admin/live-tests/x/results', '/admin/live-tests']];
  for (const [p, want] of cases) assert(NAV.activeHref(p, nav) === want, `${p} → ${NAV.activeHref(p, nav)} (want ${want})`);
  assert(NAV.pageContext('/admin/question-reports', nav).title === 'Question reports' && NAV.pageContext('/nowhere', nav).title === 'Admin', 'header title');
});

test('AB-04 layout: guard unchanged + first, one <main>, skip link, never-glass, no e-mail / fake role', () => {
  const l = code(read('app/admin/layout.tsx'));
  const body = l.slice(l.indexOf('export default async function AdminLayout('));
  assert(/const \{ role \} = await requireAdminPage\(\{ allowStaff: true, path: "\/admin" \}\);/.test(body) && body.indexOf('await requireAdminPage') === body.indexOf('await '), 'guard unchanged and first');
  assert(!/<main\b/.test(l) && /id="admin-content"/.test(l) && /href="#admin-content"/.test(l), 'one <main> (root shell); admin skip link');
  assert(/data-no-glass=""/.test(l) && !/userEmail|@couragelibrary/.test(l), 'never-glass; no e-mail');
  const h = code(read('components/admin/admin-top-header.tsx'));
  assert(!/Super Admin|Live Sync|PROD|userEmail|Bell/.test(h) && /role === "admin" \? "Admin" : "Staff"/.test(h), 'header: real role, no decoration');
  const s = code(read('components/admin/admin-sidebar.tsx'));
  assert(!/overflow-hidden/.test(s) && (s.match(/overflow-y-auto/g) || []).length >= 3, 'sidebar scrolls, never clipped');
  assert(!/href="\/admin\/[a-z]/.test(s), 'sidebar has no hard-coded section links (nav.ts only; the brand links to Today)');
});

test('AB-05 search: guard first; role rules per group; escaped LIKE; minimal fields', () => {
  const a = code(read('app/admin/search/actions.ts'));
  const fn = a.slice(a.indexOf('export async function adminSearchAction('));
  assert(/const auth = await guardAdminAction\(\{ allowStaff: true \}\);\s*\n\s*if \(!auth\.ok\) return auth;/.test(fn) && fn.indexOf('guardAdminAction') < fn.indexOf('createAdminServerSupabaseClient'), 'guard first');
  assert(/searchableGroups\(auth\.role, isSupportTicketsEnabled\(\)\)/.test(fn), 'groups from role + flag');
  assert(JSON.stringify(SEARCH.searchableGroups('staff', true)) === '["Questions","Tickets"]' && JSON.stringify(SEARCH.searchableGroups('admin', false)) === '["Questions","Users"]', 'users admin-only; tickets only while on');
  assert(SEARCH.likePattern('50%_a\\b') === '%50\\%\\_a\\\\b%' && SEARCH.normalizeQuery(' a ') === null && SEARCH.normalizeQuery('ab') === 'ab' && SEARCH.normalizeQuery('x'.repeat(121)) === null, 'escaping + bounds');
  assert(SEARCH.snippet('<b>Find</b> $x$ **now**') === 'Find x now', 'snippet');
  const pushes = [...fn.matchAll(/results\.push\(\{(.*)\}\);?\s*$/gm)].map((m) => m[1]);
  assert(pushes.length >= 3 && pushes.every((p) => !/actor_email|message|staff_reply|phone|full_name/.test(p)), 'result fields');
  const c = read('components/admin/admin-search.tsx');
  assert(/^"use client";/.test(c) && !/createAdmin|users-directory"|SERVICE_ROLE/.test(c) && /adminSearchAction/.test(c), 'client imports only the action');
});

test('AB-06 Today: guard first, server-only read model, admin-only cards, no e-mails, honest failures', () => {
  const p = code(read('app/admin/page.tsx'));
  const body = p.slice(p.indexOf('export default async function AdminTodayPage('));
  assert(body.indexOf('await requireAdminPage({ allowStaff: true, path: "/admin" })') > 0 && body.indexOf('await requireAdminPage') === body.indexOf('await '), 'guard first');
  const t = read('lib/admin/today.ts');
  assert(/^import "server-only";/.test(t) && /createAdminServerSupabaseClient\(\)/.test(t), 'server-only, service role');
  const tc = code(t);
  for (const id of ['question-reports', 'library-ending']) {
    const i = tc.indexOf(`id: "${id}"`);
    assert(i > 0 && tc.lastIndexOf('if (isAdmin)', i) > tc.lastIndexOf('cards.push({\n    id: "community-flags"', i), `${id} only for admins`);
  }
  assert(/if \(isAdmin\) \{\s*\n\s*const \{ data, error \} = await sb\.from\("admin_audit_logs"\)\.select\("action_type, target_entity, created_at"\)/.test(tc), 'recent: admin only, no actor e-mail / values');
  assert(!/actor_email|old_value|new_value/.test(tc), 'no e-mails / values read');
  assert(/count === null \? "Not available"/.test(p) && /\?\? "Not available"/.test(p), 'failed read → Not available');
  assert(!/write.?failure|nightly/i.test(code(p)) && !/id: "(write|nightly)/.test(tc), 'Q5: no write-failure / nightly cards');
  assert((p.match(/data-today-primary/g) || []).length === 1, 'one primary action (R4)');
});

test('AB-07 deep links accept only known values, after the guard', () => {
  for (const [file, marker] of [['app/admin/questions/factory/page.tsx', 'LIFECYCLE.includes('], ['app/admin/current-affairs/page.tsx', 'CA_STATUSES.includes('], ['app/admin/question-reports/page.tsx', 'REPORT_STATUSES.includes('], ['app/admin/support/page.tsx', 'Object.keys(TICKET_STATUSES).includes(']]) {
    const s = code(read(file));
    assert(s.includes(marker), `${file}: whitelist`);
    const body = s.slice(s.indexOf('export default async function'));
    assert(body.indexOf('await requireAdminPage') >= 0 && body.indexOf('await requireAdminPage') < body.indexOf('await searchParams'), `${file}: guard before params`);
  }
});

test('AB-08 status chips: six kinds, text always', () => {
  const k = STATUS.chipKind;
  assert(k('DRAFT') === 'draft' && k('IN_REVIEW') === 'review' && k('CHANGES_REQUESTED') === 'review' && k('APPROVED') === 'approved' && k('COMPILED') === 'approved' && k('PUBLISHED') === 'published' && k('REJECTED') === 'rejected' && k('ARCHIVED') === 'archived' && k('SUPERSEDED') === 'archived', 'mapping');
  assert(k('LIVE') !== 'rejected' && STATUS.chipLabel('COMPILED') === 'Ready to publish' && STATUS.chipLabel('IN_REVIEW') === 'In review', 'labels; LIVE is not red');
  assert(Object.keys(STATUS.CHIP_CLASSES).length === 6, 'six kinds');
  assert(/\{chipLabel\(status\)\}/.test(read('components/admin/status-chip.tsx')), 'text rendered');
});

test('AB-09 a11y (static): current page, expandable groups, combobox, focus, targets, states', () => {
  const s = code(read('components/admin/admin-sidebar.tsx'));
  assert(/aria-current=\{on \? "page" : undefined\}/.test(s) && (s.match(/aria-expanded=/g) || []).length >= 2 && !/<div[^>]*onClick/.test(s.replace(/<dialog[\s\S]*?>/, '')), 'sidebar semantics');
  assert(/<dialog/.test(s) && /showModal\(\)/.test(s) && /aria-label="Open admin menu"/.test(s), 'phone drawer is a modal dialog');
  assert(!/min-h-[5-8]\b|\bh-6\b|\bh-7\b|text-\[1[01]px\]|text-\[9px\]/.test(s + read('components/admin/admin-top-header.tsx') + read('components/admin/admin-search.tsx')), 'no tiny targets / text');
  const c = read('components/admin/admin-search.tsx');
  assert(/role="combobox"/.test(c) && /role="listbox"/.test(c) && /role="option"/.test(c) && /aria-activedescendant/.test(c) && /aria-live="polite"/.test(c), 'combobox pattern');
  assert(/focus-ring/.test(c) && /focus-ring-on-dark/.test(s), 'focus rings');
  assert(fs.existsSync(path.join(ROOT, 'app/admin/loading.tsx')) && fs.existsSync(path.join(ROOT, 'app/admin/error.tsx')), 'loading + error states');
});

console.log(`\nADMIN-UX-1 phase B: ${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
