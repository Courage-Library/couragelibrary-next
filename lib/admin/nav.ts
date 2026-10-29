/**
 * ADMIN-IA-1 phase B (owner rulings 2026-10-29; docs/ux/ADMIN_IA_1_PROPOSAL.md): the ONLY source of the admin sidebar,
 * the per-section tab bars, the page actions, the breadcrumbs and the Ctrl-K "Go to" entries (pure: no React, no env —
 * the gates load it).
 *   - the sidebar holds NOUNS only, grouped by workflow (≤ 7 groups, ≤ 6 items each); actions (Start intake, New lesson,
 *     Import questions) are page buttons (`actions`), never sidebar items
 *   - a section's sub-pages are route TABS (`tabs`): each tab is its own page with its OWN guard, so a merged page never
 *     widens access — `access` mirrors that page's requireAdminPage ("staff" = allowStaff: true, "admin" = admin only;
 *     NAV-IA-1 and test_admin_ux1b check every entry against the page file) and admin-only tab routes are in
 *     ADMIN_ONLY_ROUTES (the layout answers a staff request with the site 404 before anything renders)
 *   - an item is shown when at least one of its tabs is visible to the role, and links to its first visible tab
 * Visibility is UI only: every page still authorizes itself. Moved addresses redirect (lib/admin/nav-redirects.ts).
 */
export type AdminRole = "admin" | "staff";
export type NavAccess = "staff" | "admin";
export type NavFlag = "ADAPTIVE" | "LIVE_TESTS" | "SUPPORT" | "PAYMENTS";
export type NavIcon =
  | "today" | "drafts" | "reports" | "news" | "flag" | "questions" | "mocks" | "learning" | "syllabus" | "exams"
  | "users" | "tickets" | "library" | "institutes" | "billing" | "premium" | "security" | "design" | "rewards"
  | "coins" | "badge" | "live" | "adaptive" | "focus" | "settings";

/** live counts shown as a badge next to a link (computed by the layout on the server; never from the client) */
export type NavBadge = "inReview";
export type NavBadges = Partial<Record<NavBadge, number | null>>;

/** A sub-page of a section (its own route + guard). */
export interface NavTab {
  label: string;
  href: string;
  access: NavAccess;
  flag?: NavFlag;
}

/** A page button (a verb): shown in the section bar (or by the page itself) and in Ctrl-K, never in the sidebar. */
export interface NavAction {
  label: string;
  href: string;
  access: NavAccess;
  /** the page renders this button itself (same label + href; NAV-IA-1 checks it), so the section bar does not */
  inPage?: boolean;
}

export interface NavItem {
  label: string;
  href: string;
  icon: NavIcon;
  access: NavAccess;
  flag?: NavFlag;
  /** "exact": active only on this path (Today); default: longest matching prefix wins */
  match?: "exact";
  badge?: NavBadge;
  /** the section's route tabs (the first is the item's own page) */
  tabs?: NavTab[];
  actions?: NavAction[];
}

export interface NavGroup {
  id: string;
  label: string | null;
  /** starts collapsed (dormant features) */
  collapsed?: boolean;
  items: NavItem[];
}

export const ADMIN_NAV: NavGroup[] = [
  {
    id: "today",
    label: null,
    items: [{ label: "Today", href: "/admin", icon: "today", access: "staff", match: "exact" }],
  },
  {
    id: "exams",
    label: "Exams",
    items: [
      {
        label: "Exams", href: "/admin/exams", icon: "exams", access: "staff",
        tabs: [
          { label: "Exams", href: "/admin/exams", access: "staff" },
          { label: "Knowledge", href: "/admin/exams/knowledge", access: "staff" },
          { label: "Cycles", href: "/admin/exams/cycles", access: "staff" },
          { label: "Notes", href: "/admin/exams/notes", access: "admin" },
        ],
      },
      {
        label: "Syllabus", href: "/admin/syllabus", icon: "syllabus", access: "staff",
        tabs: [
          { label: "Versions", href: "/admin/syllabus", access: "staff" },
          { label: "Intakes", href: "/admin/syllabus/intake", access: "admin" },
        ],
        actions: [{ label: "Start intake", href: "/admin/syllabus/intake", access: "admin" }],
      },
      { label: "Coverage & launch", href: "/admin/coverage", icon: "learning", access: "admin" },
    ],
  },
  {
    id: "content",
    label: "Content",
    items: [
      {
        label: "Lessons", href: "/admin/lessons", icon: "learning", access: "admin",
        tabs: [
          { label: "Lessons", href: "/admin/lessons", access: "admin" },
          { label: "Legacy (read only)", href: "/admin/lessons/legacy", access: "admin" },
        ],
        actions: [{ label: "New lesson", href: "/admin/lessons/new", access: "admin", inPage: true }],
      },
      {
        label: "Questions", href: "/admin/questions", icon: "questions", access: "staff", badge: "inReview",
        tabs: [
          { label: "Bank", href: "/admin/questions", access: "staff" },
          { label: "Drafts", href: "/admin/questions/drafts", access: "staff" },
          { label: "Review", href: "/admin/questions/review", access: "staff" },
        ],
        actions: [{ label: "Import questions", href: "/admin/questions/import", access: "staff", inPage: true }],
      },
      { label: "Current affairs", href: "/admin/current-affairs", icon: "news", access: "staff" },
      { label: "Master tree", href: "/admin/master-tree", icon: "syllabus", access: "admin" },
    ],
  },
  {
    id: "tests",
    label: "Tests",
    items: [
      {
        label: "Mock tests", href: "/admin/mock-tests", icon: "mocks", access: "staff",
        tabs: [
          { label: "Tests", href: "/admin/mock-tests", access: "staff" },
          { label: "Patterns", href: "/admin/mock-tests/patterns", access: "staff" },
          { label: "Sections", href: "/admin/mock-tests/sections", access: "staff" },
        ],
      },
    ],
  },
  {
    id: "students",
    label: "Students",
    items: [
      {
        label: "Students", href: "/admin/students", icon: "users", access: "admin",
        tabs: [
          { label: "Students", href: "/admin/students", access: "admin" },
          { label: "Library Pro", href: "/admin/students/library-pro", access: "admin" },
        ],
      },
      {
        label: "Reports & support", href: "/admin/support", icon: "reports", access: "staff",
        tabs: [
          { label: "Tickets", href: "/admin/support", access: "staff", flag: "SUPPORT" },
          { label: "Question reports", href: "/admin/support/question-reports", access: "admin" },
          { label: "Community flags", href: "/admin/support/flags", access: "staff" },
        ],
      },
    ],
  },
  {
    id: "settings",
    label: "Settings",
    items: [
      { label: "Prompt templates", href: "/admin/prompts", icon: "settings", access: "admin" },
      {
        label: "Plans & payments", href: "/admin/payments", icon: "billing", access: "admin", flag: "PAYMENTS",
        tabs: [
          { label: "Plans", href: "/admin/payments", access: "admin" },
          { label: "Premium access", href: "/admin/payments/premium", access: "admin" },
        ],
      },
      {
        label: "System", href: "/admin/system", icon: "security", access: "staff",
        tabs: [
          { label: "Settings", href: "/admin/system", access: "admin" },
          // the MFA page keeps its own address: the admin-MFA redirect (lib/auth/mfa.ts ADMIN_MFA_PATH) points there
          { label: "Security (MFA)", href: "/admin/mfa", access: "staff" },
          { label: "Design system", href: "/admin/system/design", access: "admin" },
        ],
      },
    ],
  },
  {
    id: "dormant",
    label: "Not live yet",
    collapsed: true,
    items: [
      { label: "Institutes", href: "/admin/institutes", icon: "institutes", access: "staff" },
      { label: "Rewards store", href: "/admin/rewards", icon: "rewards", access: "admin" },
      { label: "Coins", href: "/admin/gamification", icon: "coins", access: "admin" },
      { label: "Achievements", href: "/admin/achievements", icon: "badge", access: "staff", flag: "LIVE_TESTS" },
      { label: "Live tests", href: "/admin/live-tests", icon: "live", access: "staff", flag: "LIVE_TESTS" },
      { label: "Adaptive Testing", href: "/admin/adaptive", icon: "adaptive", access: "admin", flag: "ADAPTIVE" },
    ],
  },
];

export type NavFlags = Record<NavFlag, boolean>;

function canSee(item: { access: NavAccess; flag?: NavFlag }, role: AdminRole, flags: NavFlags): boolean {
  if (item.access === "admin" && role !== "admin") return false;
  if (item.flag && !flags[item.flag]) return false;
  return true;
}

/**
 * The sidebar for this role + flags: an item with tabs keeps only the tabs the role may open and links to the first
 * of them (hidden when none is left); hidden items removed, empty groups dropped.
 */
export function visibleNav(role: AdminRole, flags: NavFlags, nav: NavGroup[] = ADMIN_NAV): NavGroup[] {
  const out: NavGroup[] = [];
  for (const g of nav) {
    const items: NavItem[] = [];
    for (const it of g.items) {
      if (it.flag && !flags[it.flag]) continue;
      if (it.tabs) {
        const tabs = it.tabs.filter((t) => canSee(t, role, flags));
        if (!tabs.length) continue;
        items.push({ ...it, href: tabs[0].href, access: tabs.some((t) => t.access === "staff") ? "staff" : "admin", tabs, actions: (it.actions ?? []).filter((a) => canSee(a, role, flags)) });
      } else if (canSee(it, role, flags)) items.push({ ...it, actions: (it.actions ?? []).filter((a) => canSee(a, role, flags)) });
    }
    if (items.length) out.push({ ...g, items });
  }
  return out;
}

/** Every route an item stands for: its tabs, else itself. */
const itemRoutes = (it: NavItem): Array<{ href: string; match?: "exact" }> => (it.tabs?.length ? it.tabs : [it]);
const hits = (pathname: string, href: string, match?: "exact") => (match === "exact" ? pathname === href : pathname === href || pathname.startsWith(href + "/"));

/** Every sidebar item of a nav tree. */
export function navLeaves(nav: NavGroup[]): NavItem[] {
  return nav.flatMap((g) => g.items);
}

/** The active section + tab for a pathname: the longest matching route (tab or item) on a "/" boundary. */
export function activeSection(pathname: string, nav: NavGroup[]): { group: NavGroup; item: NavItem; tab: NavTab | null } | null {
  let best: { group: NavGroup; item: NavItem; tab: NavTab | null; len: number } | null = null;
  for (const group of nav)
    for (const item of group.items)
      for (const r of itemRoutes(item))
        if (hits(pathname, r.href, r.match) && (!best || r.href.length > best.len))
          best = { group, item, tab: item.tabs?.find((t) => t.href === r.href) ?? null, len: r.href.length };
  return best ? { group: best.group, item: best.item, tab: best.tab } : null;
}

/** The ONE active sidebar item href for a pathname (an item is active on any of its tabs). */
export function activeHref(pathname: string, nav: NavGroup[]): string | null {
  return activeSection(pathname, nav)?.item.href ?? null;
}

/** Header title + group for a pathname (falls back to "Admin"); the tab's label when it is not the section's first. */
export function pageContext(pathname: string, nav: NavGroup[] = ADMIN_NAV): { title: string; group: string | null } {
  const a = activeSection(pathname, nav);
  if (!a) return { title: "Admin", group: null };
  return { title: a.tab && a.item.tabs && a.tab !== a.item.tabs[0] ? a.tab.label : a.item.label, group: a.group.label };
}

/** Breadcrumbs derived from the nav: Group › Section › Tab (the last one is the current page). */
export function breadcrumbs(pathname: string, nav: NavGroup[]): Array<{ label: string; href: string | null }> {
  const a = activeSection(pathname, nav);
  if (!a) return [];
  const out: Array<{ label: string; href: string | null }> = [];
  if (a.group.label) out.push({ label: a.group.label, href: null });
  out.push({ label: a.item.label, href: a.item.href });
  if (a.tab && a.item.tabs && a.tab !== a.item.tabs[0]) out.push({ label: a.tab.label, href: a.tab.href });
  return out;
}

/** Ctrl-K "Go to" + action entries for this role's visible nav (nouns first, then the verbs). */
export function searchEntries(nav: NavGroup[]): Array<{ label: string; hint: string; href: string; kind: "page" | "action" }> {
  const out: Array<{ label: string; hint: string; href: string; kind: "page" | "action" }> = [];
  for (const g of nav)
    for (const it of g.items) {
      for (const t of it.tabs ?? [it]) out.push({ label: t === it || (it.tabs && t === it.tabs[0]) ? it.label : `${it.label} › ${t.label}`, hint: g.label ?? "Today", href: t.href, kind: "page" });
      for (const a of it.actions ?? []) out.push({ label: a.label, hint: it.label, href: a.href, kind: "action" });
    }
  return out;
}

/**
 * SEC-1C L-04 (architect option (a), 2026-10-27): every ADMIN-ONLY admin page route — the single source the admin
 * layout uses to answer a staff user's request for an admin-only route with the site 404 BEFORE the admin shell
 * renders. Must equal the set of app/admin pages whose requireAdminPage has no allowStaff (gated: test_admin_ux1b AB-10).
 * Per-page guards stay as defence in depth. ADMIN-IA-1: the moved addresses are listed at their NEW place (the old
 * ones are redirects in next.config.ts, so a staff request lands here and gets the 404).
 */
export const ADMIN_ONLY_ROUTES: readonly string[] = [
  "/admin/adaptive",
  "/admin/coverage",
  "/admin/exams/notes",
  "/admin/gamification",
  "/admin/lessons",
  "/admin/lessons/[id]",
  "/admin/lessons/[id]/translate",
  "/admin/lessons/legacy",
  "/admin/lessons/new",
  "/admin/live-tests/[id]/intelligence",
  "/admin/live-tests/[id]/results",
  "/admin/live-tests/intelligence",
  "/admin/master-tree",
  "/admin/payments",
  "/admin/payments/premium",
  "/admin/prompts",
  "/admin/rewards",
  "/admin/students",
  "/admin/students/library-pro",
  "/admin/support/question-reports",
  "/admin/syllabus/intake",
  "/admin/syllabus/intake/[id]",
  "/admin/system",
  "/admin/system/design",
];

const routeRe = (r: string) => new RegExp("^" + r.replace(/[.*+?^${}()|\\]/g, "\\$&").replace(/\[[^\]]+\]/g, "[^/]+") + "(?:/.*)?$");
const ADMIN_ONLY_RE = ADMIN_ONLY_ROUTES.map(routeRe);

/** Is this pathname an admin-only route (or below one)? [param] segments match one path segment. Pure. */
export function isAdminOnlyPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  const p = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return ADMIN_ONLY_RE.some((re) => re.test(p));
}
