/**
 * ADMIN-UX-1 phase B / Courage Studio (decision #84: Today · Focus review · CREATE · CARE · SYSTEM): the ONLY source of admin sidebar links (pure: no React, no env — the offline gate loads it).
 * Q1 (architect 2026-10-26): grouped and role-aware — a link is shown only when the role passes that page's EXISTING
 * guard (`access` mirrors requireAdminPage: "staff" = allowStaff: true, "admin" = admin only; test_admin_ux1b.cjs
 * checks every item against the page file). Visibility is UI only: every page still authorizes itself.
 * Every href must be a real route (test_ux1b_shell U-2 reads this file).
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

export interface NavItem {
  label: string;
  href: string;
  icon: NavIcon;
  access: NavAccess;
  flag?: NavFlag;
  /** "exact": active only on this path (Today); default: longest matching prefix wins */
  match?: "exact";
  badge?: NavBadge;
  children?: NavItem[];
}

export interface NavGroup {
  id: string;
  label: string | null;
  /** hidden entirely while this flag is off (Payments while PAYMENTS_ENABLED is off) */
  flag?: NavFlag;
  /** starts collapsed (dormant features) */
  collapsed?: boolean;
  items: NavItem[];
}

export const ADMIN_NAV: NavGroup[] = [
  {
    id: "today",
    label: null,
    items: [
      { label: "Today", href: "/admin", icon: "today", access: "staff", match: "exact" },
      { label: "Focus review", href: "/admin/review/focus", icon: "focus", access: "staff", badge: "inReview" },
    ],
  },
  {
    id: "create",
    label: "Create",
    items: [
      {
        label: "Questions", href: "/admin/questions", icon: "questions", access: "staff",
        children: [
          { label: "Question drafts", href: "/admin/questions/factory", icon: "drafts", access: "staff" },
          { label: "Question bank", href: "/admin/questions", icon: "questions", access: "staff" },
          { label: "Bulk import", href: "/admin/bulk-import", icon: "questions", access: "staff" },
        ],
      },
      {
        label: "Mock tests", href: "/admin/mock-tests", icon: "mocks", access: "staff",
        children: [
          { label: "Mock tests", href: "/admin/mock-tests", icon: "mocks", access: "staff" },
          { label: "Patterns", href: "/admin/patterns", icon: "mocks", access: "staff" },
          { label: "Sections", href: "/admin/sections", icon: "mocks", access: "staff" },
          { label: "Categories", href: "/admin/categories", icon: "mocks", access: "staff" },
          { label: "Schedules", href: "/admin/schedules", icon: "mocks", access: "staff" },
        ],
      },
      {
        label: "Learning", href: "/admin/content", icon: "learning", access: "staff",
        children: [
          { label: "Lessons", href: "/admin/lessons", icon: "learning", access: "admin" },
          { label: "Lesson generator", href: "/admin/lessons/generate", icon: "learning", access: "admin" },
          { label: "Prompt templates", href: "/admin/prompts", icon: "learning", access: "admin" },
          { label: "Content Studio (legacy)", href: "/admin/content", icon: "learning", access: "staff" },
          { label: "Topic links", href: "/admin/content/topics", icon: "learning", access: "staff" },
          { label: "Descriptive", href: "/admin/descriptive", icon: "learning", access: "staff" },
        ],
      },
      { label: "Current affairs", href: "/admin/current-affairs", icon: "news", access: "staff" },
      {
        label: "Syllabus map", href: "/admin/syllabus", icon: "syllabus", access: "staff",
        children: [
          { label: "Syllabus", href: "/admin/syllabus", icon: "syllabus", access: "staff" },
          { label: "Syllabus intake", href: "/admin/syllabus/intake", icon: "syllabus", access: "admin" },
          { label: "Exams", href: "/admin/exams", icon: "exams", access: "staff" },
          { label: "Exam Knowledge", href: "/admin/exam-knowledge", icon: "exams", access: "staff" },
          { label: "Taxonomy", href: "/admin/taxonomy", icon: "syllabus", access: "admin" },
        ],
      },
    ],
  },
  {
    id: "care",
    label: "Care",
    items: [
      { label: "Question reports", href: "/admin/question-reports", icon: "reports", access: "admin" },
      { label: "Tickets", href: "/admin/support", icon: "tickets", access: "staff", flag: "SUPPORT" },
      { label: "Community flags", href: "/admin/community", icon: "flag", access: "staff" },
      {
        label: "Students", href: "/admin/users", icon: "users", access: "admin",
        children: [
          { label: "Users", href: "/admin/users", icon: "users", access: "admin" },
          { label: "Library Pro", href: "/admin/pro-library", icon: "library", access: "admin" },
        ],
      },
      { label: "Institutes", href: "/admin/institutes", icon: "institutes", access: "staff" },
    ],
  },
  {
    id: "payments",
    label: "Payments",
    flag: "PAYMENTS",
    items: [
      { label: "Billing", href: "/admin/billing", icon: "billing", access: "admin" },
      { label: "Premium", href: "/admin/premium", icon: "premium", access: "admin" },
    ],
  },
  {
    id: "system",
    label: "System",
    items: [
      { label: "Security (MFA)", href: "/admin/mfa", icon: "security", access: "staff" },
      { label: "Settings", href: "/admin/settings", icon: "settings", access: "admin" },
      { label: "Design system", href: "/admin/design-system", icon: "design", access: "staff" },
    ],
  },
  {
    id: "dormant",
    label: "Not live yet",
    collapsed: true,
    items: [
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

/** The sidebar for this role + flags: hidden items removed, empty parents / groups dropped. */
export function visibleNav(role: AdminRole, flags: NavFlags, nav: NavGroup[] = ADMIN_NAV): NavGroup[] {
  const out: NavGroup[] = [];
  for (const g of nav) {
    if (g.flag && !flags[g.flag]) continue;
    const items: NavItem[] = [];
    for (const it of g.items) {
      if (!canSee(it, role, flags)) continue;
      if (it.children) {
        const children = it.children.filter((c) => canSee(c, role, flags));
        if (children.length === 0) continue;
        items.push(children.length === 1 ? { ...children[0], label: it.label, icon: it.icon } : { ...it, children });
      } else items.push(it);
    }
    if (items.length) out.push({ ...g, items });
  }
  return out;
}

/** Every leaf (link) of a nav tree. */
export function navLeaves(nav: NavGroup[]): NavItem[] {
  return nav.flatMap((g) => g.items.flatMap((it) => (it.children ? it.children : [it])));
}

/** The ONE active leaf href for a pathname: exact items match exactly; otherwise the longest prefix on a "/" boundary. */
export function activeHref(pathname: string, nav: NavGroup[]): string | null {
  let best: string | null = null;
  for (const leaf of navLeaves(nav)) {
    const hit = leaf.match === "exact" ? pathname === leaf.href : pathname === leaf.href || pathname.startsWith(leaf.href + "/");
    if (hit && (!best || leaf.href.length > best.length)) best = leaf.href;
  }
  return best;
}

/** Header title + group for a pathname (falls back to "Admin"). */
export function pageContext(pathname: string, nav: NavGroup[] = ADMIN_NAV): { title: string; group: string | null } {
  const href = activeHref(pathname, nav);
  for (const g of nav) {
    for (const it of g.items) {
      const leaves = it.children ?? [it];
      const leaf = leaves.find((l) => l.href === href);
      if (leaf) return { title: leaf.label, group: g.label };
    }
  }
  return { title: "Admin", group: null };
}

/**
 * SEC-1C L-04 (architect option (a), 2026-10-27): every ADMIN-ONLY admin page route — the single source the admin
 * layout uses to answer a staff user's request for an admin-only route with the site 404 BEFORE the admin shell
 * renders. Must equal the set of app/admin pages whose requireAdminPage has no allowStaff (gated: test_admin_ux1b AB-10).
 * Per-page guards stay as defence in depth.
 */
export const ADMIN_ONLY_ROUTES: readonly string[] = [
  "/admin/adaptive",
  "/admin/billing",
  "/admin/gamification",
  "/admin/lessons",
  "/admin/lessons/[id]",
  "/admin/lessons/[id]/translate",
  "/admin/lessons/generate",
  "/admin/live-tests/[id]/intelligence",
  "/admin/live-tests/[id]/results",
  "/admin/live-tests/intelligence",
  "/admin/premium",
  "/admin/prompts",
  "/admin/pro-library",
  "/admin/question-reports",
  "/admin/reports",
  "/admin/rewards",
  "/admin/settings",
  "/admin/syllabus/intake",
  "/admin/syllabus/intake/[id]",
  "/admin/taxonomy",
  "/admin/users",
];

const routeRe = (r: string) => new RegExp("^" + r.replace(/[.*+?^${}()|\\]/g, "\\$&").replace(/\[[^\]]+\]/g, "[^/]+") + "(?:/.*)?$");
const ADMIN_ONLY_RE = ADMIN_ONLY_ROUTES.map(routeRe);

/** Is this pathname an admin-only route (or below one)? [param] segments match one path segment. Pure. */
export function isAdminOnlyPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  const p = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return ADMIN_ONLY_RE.some((re) => re.test(p));
}
