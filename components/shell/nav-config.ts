/**
 * UX-1b navigation. Every link points to a route that exists and works today (checked on a local
 * production build, anonymous and signed in). Flagged routes only appear when the server-evaluated
 * feature flag is on. Omitted until UX-2 builds them: About, Contact, Privacy, Terms, Profile / Settings.
 */
export type ShellFlags = { COURSES: boolean; BATTLES: boolean };

export type NavItem = {
  href: string;
  label: string;
  /** Extra path prefixes that mark this item active. */
  match?: string[];
  /** Shown only when this server-evaluated feature flag is on. */
  flag?: keyof ShellFlags;
};

export const LEARN_MENU: NavItem[] = [
  { href: "/practice", label: "Practice" },
  { href: "/articles", label: "Articles" },
  { href: "/flashcards", label: "Flashcards" },
  { href: "/descriptive", label: "Descriptive writing" },
  { href: "/courses", label: "Courses", flag: "COURSES" },
  { href: "/battles", label: "Battles", flag: "BATTLES" },
];

/** Signed-out header, in order; "Learn" is a menu (LEARN_MENU) placed after Mock tests. */
export const PUBLIC_NAV: NavItem[] = [
  { href: "/exams", label: "Exams" },
  { href: "/mock-tests", label: "Mock tests" },
  { href: "/current-affairs", label: "Current affairs" },
  { href: "/pricing", label: "Pricing" },
];

/** Signed-in desktop header, in order; "Learn" is a menu placed after Mistakes. */
export const STUDENT_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/mock-tests", label: "Tests" },
  { href: "/mistakes", label: "Mistakes" },
  { href: "/exams", label: "Exams" },
  { href: "/current-affairs", label: "Current affairs" },
];

/** Account menu (desktop) and Account sheet (mobile bottom nav). Admin studio is added for staff. */
export const ACCOUNT_MENU: NavItem[] = [
  { href: "/notifications", label: "Notifications" },
  { href: "/wallet", label: "Wallet" },
  { href: "/store", label: "Rewards store" },
  { href: "/billing", label: "Billing" },
  { href: "/pricing", label: "Plans and pricing", match: ["/premium"] },
];

export const FOOTER_NAV: Array<{ heading: string; items: NavItem[] }> = [
  {
    heading: "Prepare",
    items: [
      { href: "/exams", label: "Exams" },
      { href: "/mock-tests", label: "Mock tests" },
      { href: "/practice", label: "Practice" },
      { href: "/flashcards", label: "Flashcards" },
    ],
  },
  {
    heading: "Read",
    items: [
      { href: "/current-affairs", label: "Current affairs" },
      { href: "/articles", label: "Articles" },
      { href: "/descriptive", label: "Descriptive writing" },
    ],
  },
  {
    heading: "Community",
    items: [
      { href: "/community", label: "Discussions" },
      { href: "/institutes", label: "Institutes" },
      { href: "/pricing", label: "Pricing" },
    ],
  },
];

export const LEARN_PREFIXES = ["/practice", "/articles", "/flashcards", "/descriptive", "/courses", "/battles"];

/** Routes where the student bottom nav is hidden (full-screen test console). */
export const CONSOLE_ROUTES = [/^\/mock-tests\/[^/]+\/take/, /^\/live-tests\/[^/]+\/take/];

export function visibleItems(items: NavItem[], flags: ShellFlags): NavItem[] {
  return items.filter((i) => !i.flag || flags[i.flag]);
}

export function isActive(pathname: string, item: Pick<NavItem, "href" | "match">): boolean {
  const prefixes = [item.href, ...(item.match ?? [])];
  return prefixes.some((p) => (p === "/" ? pathname === "/" : pathname === p || pathname.startsWith(`${p}/`)));
}
