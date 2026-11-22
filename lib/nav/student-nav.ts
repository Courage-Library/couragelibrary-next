import type { NavLabels } from "@/content/nav/labels";
import { LEARN_INDEX_READY } from "@/lib/nav/visitor-nav";

/**
 * NAV-1 Stage B — pure rules of the student navigation (docs/design/NAV_V1_SPEC.md §2–§4), gated by scripts/test_nav1.cjs.
 * Owner decisions (23 Nov 2026): the shell follows the SESSION (every per-request page when signed in); avatar menu =
 * spec items + "Admin studio" (staff only) + "Billing" (payments on) + "Study preferences" (onboarding on) + the coin
 * balance in the top bar (lesson coins on); the centre "Today's mock" button → today's free daily mock, else the
 * Mocks list (spec §2) — until a reliable source exists (backlog NAV-TODAY-MOCK-1) it opens the Mocks list, which shows
 * today's daily mock first; "Results" stays hidden until a results list page exists. Only routes that exist are shown.
 */

export type StudentKey = "home" | "practice" | "mocks" | "currentAffairs" | "results" | "mistakeVault" | "learn";
export type StudentIcon = "home" | "book" | "clock" | "news" | "chart" | "vault" | "learn";

export interface StudentItem {
  key: StudentKey;
  href: string;
  label: string;
  icon: StudentIcon;
  /** the PRO chip (coral) — Mistake Vault only, only while the paywall master switch is on */
  pro?: boolean;
}

export interface StudentFlags {
  practice: boolean;
  payments: boolean;
  paywall: boolean;
}

/** No results list page exists yet (results live on each mock's own result page) — "Results" / "My results" stay hidden. */
export const RESULTS_ROUTE: string | null = null;
/** Spec §2: today's free daily mock, else the Mocks list. FALLBACK until NAV-TODAY-MOCK-1 (no reliable source yet). */
export const TODAYS_MOCK_HREF = "/mock-tests";
export const STUDENT_HOME = "/dashboard";

export function studentItems(t: NavLabels, f: StudentFlags, learnReady: boolean = LEARN_INDEX_READY): StudentItem[] {
  const items: StudentItem[] = [{ key: "home", href: STUDENT_HOME, label: t.home, icon: "home" }];
  if (f.practice) items.push({ key: "practice", href: "/practice", label: t.practice, icon: "book" });
  items.push({ key: "mocks", href: "/mock-tests", label: t.mocks, icon: "clock" });
  items.push({ key: "currentAffairs", href: "/current-affairs", label: t.currentAffairs, icon: "news" });
  if (RESULTS_ROUTE) items.push({ key: "results", href: RESULTS_ROUTE, label: t.results, icon: "chart" });
  items.push({ key: "mistakeVault", href: "/mistakes", label: t.mistakeVault, icon: "vault", pro: f.paywall });
  if (learnReady) items.push({ key: "learn", href: "/learn", label: t.learn, icon: "learn" });
  return items;
}

/** The phone bottom bar: Home · Practice · [centre] · Mocks · CA. */
export function bottomItems(t: NavLabels, f: StudentFlags): { left: StudentItem[]; right: StudentItem[]; centre: { href: string; label: string; aria: string } } {
  const left: StudentItem[] = [{ key: "home", href: STUDENT_HOME, label: t.home, icon: "home" }];
  if (f.practice) left.push({ key: "practice", href: "/practice", label: t.practice, icon: "book" });
  const right: StudentItem[] = [
    { key: "mocks", href: "/mock-tests", label: t.mocks, icon: "clock" },
    { key: "currentAffairs", href: "/current-affairs", label: t.ca, icon: "news" },
  ];
  return { left, right, centre: { href: TODAYS_MOCK_HREF, label: t.todaysMock, aria: t.todaysMockAria } };
}

export interface AccountView {
  name: string;
  isStaff: boolean;
  profile?: boolean;
  studyPreferences?: boolean;
}

export interface MenuLink {
  key: "results" | "mistakeVault" | "profile" | "studyPreferences" | "help" | "billing" | "admin";
  href: string;
  label: string;
}

/**
 * The avatar menu (desktop) / sheet (phone). Desktop: Profile, Study preferences, Help, Billing, Admin studio (the
 * sidebar already has Mistake Vault); the sheet adds My results (when a list exists) and Mistake Vault first.
 * Language and Sign out are rendered by the component (a switch and the existing sign-out form).
 */
export function accountLinks(t: NavLabels, a: AccountView, f: StudentFlags, studyPreferencesLabel: string, sheet: boolean): MenuLink[] {
  const out: MenuLink[] = [];
  if (sheet && RESULTS_ROUTE) out.push({ key: "results", href: RESULTS_ROUTE, label: t.myResults });
  if (sheet) out.push({ key: "mistakeVault", href: "/mistakes", label: t.mistakeVault });
  if (a.profile) out.push({ key: "profile", href: "/settings/profile", label: t.profile });
  if (a.studyPreferences) out.push({ key: "studyPreferences", href: "/onboarding", label: studyPreferencesLabel });
  out.push({ key: "help", href: "/help", label: t.help });
  if (f.payments) out.push({ key: "billing", href: "/billing", label: t.billing });
  if (a.isStaff) out.push({ key: "admin", href: "/admin", label: t.adminStudio });
  return out;
}

/** Spec §3 exam focus: a live attempt shows only the exam console — no visitor header, sidebar or bottom bar. */
export const EXAM_FOCUS_ROUTES: readonly RegExp[] = [/^\/mock-tests\/[^/]+\/take(?:\/|$)/, /^\/live-tests\/[^/]+\/take(?:\/|$)/];
export function isExamFocus(pathname: string): boolean {
  const p = pathname.split(/[?#]/)[0] || "/";
  return EXAM_FOCUS_ROUTES.some((r) => r.test(p));
}

/** Which student item is the current page (for aria-current + the active style). */
export function activeStudentKey(pathname: string): StudentKey | null {
  const p = pathname.split(/[?#]/)[0] || "/";
  const under = (b: string) => p === b || p.startsWith(`${b}/`);
  if (under("/dashboard")) return "home";
  if (under("/practice")) return "practice";
  if (under("/mock-tests") || under("/live-tests")) return "mocks";
  if (under("/current-affairs")) return "currentAffairs";
  if (RESULTS_ROUTE && under(RESULTS_ROUTE)) return "results";
  if (under("/mistakes")) return "mistakeVault";
  if (LEARN_INDEX_READY && p === "/learn") return "learn";
  return null;
}

/** The desktop top bar's page title: the active item's label (NOT a heading — each page keeps its own <h1>). */
export function studentTitle(t: NavLabels, pathname: string, f: StudentFlags): string | null {
  const k = activeStudentKey(pathname);
  return k ? studentItems(t, f).find((i) => i.key === k)?.label ?? null : null;
}

/** "JM" from "Jan Mohammad"; one letter for one word; "?" never — "S" (Student) fallback. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "S";
  return (parts.length === 1 ? parts[0].slice(0, 1) : parts[0].slice(0, 1) + parts[parts.length - 1].slice(0, 1)).toUpperCase();
}
