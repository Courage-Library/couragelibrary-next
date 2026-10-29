#!/usr/bin/env node
/**
 * NAV-IA-1 (ADMIN-IA-1 phase B) — offline gate on lib/admin/nav.ts, lib/admin/nav-redirects.ts, next.config.ts and the
 * admin page files. Each rule runs on the real nav AND on a broken copy (negative control: the rule must fire).
 *   N-1 no legacy item and no action (verb) in the sidebar: labels never say "legacy" and never start with a verb
 *   N-2 no duplicate: every route appears once across items and tabs (an item may equal its own first tab)
 *   N-3 ≤ 7 groups, ≤ 6 items per group
 *   N-4 every item / tab / action href is a real page (app/admin/…/page.tsx)
 *   N-5 every retired address redirects (exact, permanent, via next.config.ts) to a real page, and has no page itself
 *   N-6 no tab escapes its role guard: access "admin" ⇔ the page's requireAdminPage has no allowStaff ⇔ the route is
 *       in ADMIN_ONLY_ROUTES (staff get the site 404 by URL); "staff" pages are not admin-only
 *   N-7 an action marked inPage is rendered by its page (same label + href); the others are shown by the section bar
 * Run: node scripts/test_nav_ia1.cjs
 */
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
const loadTs = (rel) => {
  const m = { exports: {} };
  const out = ts.transpileModule(read(rel), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  new Function('module', 'exports', 'require', out)(m, m.exports, require);
  return m.exports;
};
const NAV = loadTs('lib/admin/nav.ts');
const { ADMIN_REDIRECTS } = loadTs('lib/admin/nav-redirects.ts');

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
const clone = (x) => JSON.parse(JSON.stringify(x));

/** the page file of an admin href (exact route; a dynamic sibling never counts) */
const pageOf = (href) => path.join(ROOT, 'app', ...href.split('?')[0].split('/').filter(Boolean), 'page.tsx');
const hasPage = (href) => fs.existsSync(pageOf(href));
/** "admin" when the page's requireAdminPage has no allowStaff, else "staff" */
const guardOf = (href) => {
  const src = fs.readFileSync(pageOf(href), 'utf8');
  const m = /requireAdminPage\(\{([^}]*)\}\)/.exec(src);
  if (!m) return 'none';
  return /allowStaff:\s*true/.test(m[1]) ? 'staff' : 'admin';
};
const routesOf = (it) => [...(it.tabs ?? []), ...(it.tabs ? [] : [it])];

// ------------------------------------------------------------------ the rules (pure over a nav + redirect list)
const VERB = /^(Generate|Import|Start|New|Create|Add|Upload|Run|Bulk|Edit|Manage)\b/;
const rules = {
  legacyOrVerb: (nav) => nav.flatMap((g) => g.items).filter((it) => /legacy/i.test(it.label) || VERB.test(it.label)).map((it) => `sidebar item "${it.label}"`),
  duplicate: (nav) => {
    const seen = new Map();
    const out = [];
    for (const g of nav)
      for (const it of g.items) {
        const hrefs = new Set([...(it.tabs ?? []).map((t) => t.href), it.href]);
        for (const h of hrefs) {
          if (seen.has(h)) out.push(`${h} (in "${seen.get(h)}" and "${it.label}")`);
          seen.set(h, it.label);
        }
        if (it.tabs && it.href !== it.tabs[0].href) out.push(`"${it.label}" does not link to its first tab`);
      }
    return out;
  },
  size: (nav) => [
    ...(nav.length > 7 ? [`${nav.length} groups (max 7)`] : []),
    ...nav.filter((g) => g.items.length > 6).map((g) => `group "${g.label}" has ${g.items.length} items (max 6)`),
  ],
  pages: (nav) => nav.flatMap((g) => g.items.flatMap((it) => [it, ...(it.tabs ?? []), ...(it.actions ?? [])])).filter((x) => !hasPage(x.href)).map((x) => `${x.href} has no page`),
  redirects: (redirects, mustMove) => {
    const out = [];
    const cfg = read('next.config.ts');
    if (!/\.\.\.ADMIN_REDIRECTS\.map\(\(r\) => \(\{ source: r\.from, destination: r\.to, permanent: true \}\)\)/.test(cfg)) out.push('next.config.ts does not turn ADMIN_REDIRECTS into permanent redirects');
    for (const old of mustMove) {
      const r = redirects.find((x) => x.from === old);
      if (!r) out.push(`${old} has no redirect`);
      else if (!hasPage(r.to)) out.push(`${old} → ${r.to}: no page there`);
    }
    for (const r of redirects) if (hasPage(r.from)) out.push(`${r.from} still has a page (the redirect would hide it)`);
    return out;
  },
  roles: (nav) => {
    const out = [];
    for (const it of nav.flatMap((g) => g.items))
      for (const r of [...routesOf(it), ...(it.actions ?? [])]) {
        if (!hasPage(r.href)) continue;
        const guard = guardOf(r.href);
        if (guard !== r.access) out.push(`${r.href}: nav says ${r.access}, the page guard says ${guard}`);
        if ((r.access === 'admin') !== NAV.isAdminOnlyPath(r.href)) out.push(`${r.href}: access ${r.access} but ADMIN_ONLY_ROUTES says ${NAV.isAdminOnlyPath(r.href) ? 'admin' : 'staff'}`);
      }
    return out;
  },
  inPage: (nav) => {
    const out = [];
    const sources = ['app', 'components'].flatMap((d) => {
      const files = [];
      const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : /\.tsx$/.test(e.name) && files.push(path.join(dir, e.name))));
      walk(path.join(ROOT, d));
      return files;
    });
    for (const a of nav.flatMap((g) => g.items.flatMap((it) => it.actions ?? []))) {
      if (!a.inPage) continue;
      const ok = sources.some((f) => {
        const s = fs.readFileSync(f, 'utf8');
        const i = s.indexOf(`href="${a.href}"`);
        return i >= 0 && s.slice(i, i + 400).includes(a.label);
      });
      if (!ok) out.push(`inPage action "${a.label}" (${a.href}) is not rendered by any page`);
    }
    return out;
  },
};

// the addresses the proposal retires (docs/ux/ADMIN_IA_1_PROPOSAL.md §5 + rulings): each must keep redirecting
const MUST_MOVE = ['/admin/questions/factory', '/admin/review/focus', '/admin/bulk-import', '/admin/question-reports', '/admin/reports', '/admin/community',
  '/admin/lessons/generate', '/admin/content', '/admin/content/topics', '/admin/lessons/coverage', '/admin/lessons/notes', '/admin/exam-knowledge',
  '/admin/schedules', '/admin/categories', '/admin/taxonomy', '/admin/patterns', '/admin/sections', '/admin/mock-tests-management', '/admin/users',
  '/admin/pro-library', '/admin/billing', '/admin/premium', '/admin/settings', '/admin/design-system', '/admin/descriptive'];

const N = NAV.ADMIN_NAV;
const item = (n, label) => n.flatMap((g) => g.items).find((i) => i.label === label);

test('N-1 no legacy item, no verb in the sidebar (negative control: a "Content Studio (legacy)" / "Lesson generator"-style item fires)', () => {
  assert(rules.legacyOrVerb(N).length === 0, rules.legacyOrVerb(N).join('; '));
  const bad = clone(N);
  bad[2].items.push({ label: 'Content Studio (legacy)', href: '/admin/lessons/legacy', icon: 'learning', access: 'admin' }, { label: 'Generate lesson', href: '/admin/lessons/new', icon: 'learning', access: 'admin' });
  assert(rules.legacyOrVerb(bad).length === 2, 'negative control did not fire');
  return `${N.flatMap((g) => g.items).length} sidebar items`;
});
test('N-2 every route once (negative control: a tab duplicated into another section fires)', () => {
  assert(rules.duplicate(N).length === 0, rules.duplicate(N).join('; '));
  const bad = clone(N);
  item(bad, 'Mock tests').tabs.push({ label: 'Notes', href: '/admin/exams/notes', access: 'admin' });
  assert(rules.duplicate(bad).some((x) => /exams\/notes/.test(x)), 'negative control did not fire');
  return 'ok';
});
test('N-3 ≤ 7 groups, ≤ 6 items per group (negative controls: an 8th group, a 7th item)', () => {
  assert(rules.size(N).length === 0, rules.size(N).join('; '));
  const g8 = clone(N);
  g8.push({ id: 'x', label: 'Extra', items: [{ label: 'X', href: '/admin', icon: 'today', access: 'staff' }] });
  const i7 = clone(N);
  i7[2].items.push(...Array.from({ length: 3 }, (_, k) => ({ label: `X${k}`, href: '/admin', icon: 'today', access: 'staff' })));
  assert(rules.size(g8).length === 1 && rules.size(i7).length === 1, 'negative controls did not fire');
  return `${N.length} groups, max ${Math.max(...N.map((g) => g.items.length))} items`;
});
test('N-4 every href is a page (negative control: a link to a deleted page fires)', () => {
  assert(rules.pages(N).length === 0, rules.pages(N).join('; '));
  const bad = clone(N);
  bad[1].items[0].tabs.push({ label: 'Gone', href: '/admin/exams/gone', access: 'staff' });
  assert(rules.pages(bad).length === 1, 'negative control did not fire');
  return 'ok';
});
test('N-5 every retired address redirects to a real page and has no page itself (negative control: a dropped redirect fires)', () => {
  const p = rules.redirects(ADMIN_REDIRECTS, MUST_MOVE);
  assert(p.length === 0, p.join('; '));
  const bad = ADMIN_REDIRECTS.filter((r) => r.from !== '/admin/taxonomy');
  assert(rules.redirects(bad, MUST_MOVE).some((x) => /\/admin\/taxonomy has no redirect/.test(x)), 'negative control did not fire');
  return `${ADMIN_REDIRECTS.length} redirects`;
});
test('N-6 no tab escapes its role guard (page guard = nav access = ADMIN_ONLY_ROUTES; negative control: Notes marked staff fires)', () => {
  assert(rules.roles(N).length === 0, rules.roles(N).join('; '));
  const bad = clone(N);
  item(bad, 'Exams').tabs.find((t) => t.href === '/admin/exams/notes').access = 'staff';
  assert(rules.roles(bad).length === 2, `negative control: ${JSON.stringify(rules.roles(bad))}`);
  // the staff view really loses the admin-only tabs and keeps the staff ones
  const staff = NAV.visibleNav('staff', { ADAPTIVE: false, LIVE_TESTS: false, SUPPORT: true, PAYMENTS: true });
  const staffRoutes = staff.flatMap((g) => g.items.flatMap((it) => [it.href, ...(it.tabs ?? []).map((t) => t.href), ...(it.actions ?? []).map((a) => a.href)]));
  assert(staffRoutes.every((h) => !NAV.isAdminOnlyPath(h)), `staff can see an admin-only route: ${staffRoutes.filter((h) => NAV.isAdminOnlyPath(h))}`);
  assert(item(staff, 'System').href === '/admin/mfa' && item(staff, 'Reports & support').tabs.length === 2, 'staff keeps MFA + tickets / flags');
  return `${staffRoutes.length} staff routes, none admin-only`;
});
test('N-7 inPage actions are rendered by their page (negative control: an inPage action no page renders fires)', () => {
  assert(rules.inPage(N).length === 0, rules.inPage(N).join('; '));
  const bad = clone(N);
  item(bad, 'Mock tests').actions = [{ label: 'New mock test', href: '/admin/mock-tests', access: 'staff', inPage: true }];
  assert(rules.inPage(bad).length === 1, 'negative control did not fire');
  return 'ok';
});
test('N-8 breadcrumbs, tabs, Ctrl-K entries come from the nav', () => {
  const a = NAV.activeSection('/admin/exams/knowledge', N);
  assert(a && a.item.label === 'Exams' && a.tab.label === 'Knowledge', 'active section');
  assert(JSON.stringify(NAV.breadcrumbs('/admin/exams/knowledge', N)) === JSON.stringify([{ label: 'Exams', href: null }, { label: 'Exams', href: '/admin/exams' }, { label: 'Knowledge', href: '/admin/exams/knowledge' }]), 'breadcrumbs');
  assert(NAV.activeHref('/admin/questions/review', N) === '/admin/questions' && NAV.activeHref('/admin/lessons/123', N) === '/admin/lessons', 'sidebar active on a tab / a record');
  const e = NAV.searchEntries(N);
  assert(e.some((x) => x.kind === 'action' && x.label === 'Start intake') && e.some((x) => x.kind === 'page' && x.label === 'Questions › Review'), 'search entries');
  const bar = read('components/admin/admin-section-bar.tsx');
  assert(/aria-label="Breadcrumb"/.test(bar) && /aria-current=\{on \? "page" : undefined\}/.test(bar) && /filter\(\(x\) => !x\.inPage\)/.test(bar), 'section bar');
  assert(/<AdminSectionBar nav=\{nav\} \/>/.test(read('app/admin/layout.tsx')), 'the layout renders it with the role-filtered nav');
  return 'ok';
});
test('N-9 retired code is gone (Descriptive create, orphan hub, Content Studio) and no table was touched', () => {
  for (const f of ['app/admin/descriptive/page.tsx', 'components/admin/admin-descriptive-manager.tsx', 'app/admin/mock-tests-management/page.tsx', 'app/admin/content/page.tsx', 'app/admin/content/actions.ts', 'components/admin/content-studio', 'app/admin/categories/page.tsx', 'components/admin/exam-onboarding/ai-assisted-onboarding-studio.tsx'])
    assert(!fs.existsSync(path.join(ROOT, f)), `${f} still exists`);
  const a = read('app/admin/actions.ts');
  assert(!/createDescriptiveAction|createCategoryAction|updateCategoryAction|toggleCategoryStatusAction|descriptive_prompts/.test(a), 'dead actions removed');
  const legacy = read('app/admin/lessons/legacy/page.tsx');
  assert(!/\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.rpc\(|"use server"/.test(legacy), 'the legacy tab is read only');
  return 'ok';
});

console.log(`\nNAV-IA-1 offline: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
