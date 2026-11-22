import { LANDING_CATEGORIES } from "@/content/landing-page/facts";
import type { NavLabels, NavLang } from "@/content/nav/labels";

/**
 * NAV-1 Stage A — pure rules of the visitor header (docs/design/NAV_V1_SPEC.md §1), gated by scripts/test_nav1.cjs.
 *   - links: Exams ▾, Current Affairs, Mock Tests; Learn only once a Learn index route exists (LEARN_INDEX_READY)
 *   - Exams menu: every landing category with its palette swatch; a category with ≥ 1 live exam is a link to its hub
 *     with "<live exams> live · more coming", every other one is a muted "Coming soon" that is NOT a link
 *   - language switch only on "/" and "/hi"
 *   - start action: "Start free" → sign-up while public sign-up is open, else "Explore exams" → /exams (UXFIX1 X-01)
 */

/** No Learn index page exists yet (app has /learn/[...path] lessons only) — flip when app/(site)/learn/page.tsx ships. */
export const LEARN_INDEX_READY = false;

export const VISITOR_ROUTES = {
  exams: "/exams",
  currentAffairs: "/current-affairs",
  mockTests: "/mock-tests",
  learn: "/learn",
  signIn: "/auth/login",
  signUp: "/auth/signup",
  dashboard: "/dashboard",
} as const;

export interface NavLink {
  key: "currentAffairs" | "mockTests" | "learn";
  href: string;
  label: string;
}

/** The plain links after the Exams menu, in order. */
export function visitorLinks(t: NavLabels, learnReady: boolean = LEARN_INDEX_READY): NavLink[] {
  const links: NavLink[] = [
    { key: "currentAffairs", href: VISITOR_ROUTES.currentAffairs, label: t.currentAffairs },
    { key: "mockTests", href: VISITOR_ROUTES.mockTests, label: t.mockTests },
  ];
  if (learnReady) links.push({ key: "learn", href: VISITOR_ROUTES.learn, label: t.learn });
  return links;
}

export interface NavCategory {
  slug: string;
  name: string;
  /** a hub link only while the category has ≥ 1 live exam */
  href: string | null;
  status: string;
  /** palette gradient token (app/globals.css --cl-grad-<slug>) */
  swatch: string;
}

export interface CategoryLiveInput {
  categories: Record<string, boolean>;
  liveShortNames: Record<string, string[]>;
  moreComing: Record<string, boolean>;
}

/** "CGL live · more coming" / "CGL उपलब्ध · और जल्द"; "Coming soon" when nothing is live (never invented). */
export function categoryStatus(t: NavLabels, shortNames: readonly string[] | undefined, moreComing: boolean): string {
  const names = (shortNames ?? []).map((n) => n.trim()).filter(Boolean);
  if (!names.length) return t.comingSoon;
  return `${names.join(", ")} ${t.liveSuffix}${moreComing ? ` · ${t.moreComing}` : ""}`;
}

/** The Exams menu tiles. `live` null (the read failed) → every tile "Coming soon" and no link (never a guessed link). */
export function navCategories(t: NavLabels, live: CategoryLiveInput | null): NavCategory[] {
  return LANDING_CATEGORIES.map((c) => {
    const isLive = Boolean(live && live.categories[c.slug] && (live.liveShortNames[c.slug] ?? []).length > 0);
    return {
      slug: c.slug,
      name: c.name[t.lang],
      href: isLive ? `/exams/${c.slug}` : null,
      status: isLive && live ? categoryStatus(t, live.liveShortNames[c.slug], Boolean(live.moreComing[c.slug])) : t.comingSoon,
      swatch: `var(--cl-grad-${c.slug})`,
    };
  });
}

export interface StartLink {
  href: string;
  label: string;
}

/** UXFIX1 X-01: while public sign-up is closed (or unknown) no start action points to /auth/signup. */
export function startAction(t: NavLabels, signupOpen: boolean): StartLink {
  return signupOpen ? { href: VISITOR_ROUTES.signUp, label: t.startFree } : { href: VISITOR_ROUTES.exams, label: t.exploreExams };
}

/** Spec §1 / §0: the EN | हिंदी switch is shown only on the landing ("/" and "/hi"). */
export function showsLanguageSwitch(pathname: string): boolean {
  return pathname === "/" || pathname === "/hi";
}

/** The language of the visitor header on a page: Hindi only where a Hindi page exists. */
export function navLangFor(pathname: string): NavLang {
  return pathname === "/hi" || pathname.startsWith("/hi/") ? "hi" : "en";
}

/** Which desktop link is the current section (Exams covers every /exams page and the category hubs). */
export function activeVisitorKey(pathname: string): "exams" | NavLink["key"] | null {
  const p = pathname.split(/[?#]/)[0] || "/";
  const under = (base: string) => p === base || p.startsWith(`${base}/`);
  if (under("/exams") || under("/category")) return "exams";
  if (under("/current-affairs")) return "currentAffairs";
  if (under("/mock-tests")) return "mockTests";
  if (p === "/learn" || under("/learn")) return LEARN_INDEX_READY ? "learn" : null;
  return null;
}
