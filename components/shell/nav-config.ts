/**
 * UX-1b navigation — the FOOTER link lists. Every link points to a route that exists and works today. Flagged routes only
 * appear when the server-evaluated feature flag is on. UX-2b added About, CNTS, Contact (footer) and the legal pages.
 * UX-FIX-1: Flashcards, Descriptive writing, Discussions, Institutes and Articles are NOT linked until each has real
 * published content (the routes stay, noindex); "/practice" is labelled "Mistake drills" until topic practice (F2).
 * F2 (#79): with PRACTICE on, "/practice" is "Practice" (topic practice) and "Mistake drills" links /mistakes/drill.
 * NAV-1: the header / sidebar / bottom-bar links live in lib/nav/visitor-nav.ts (visitor header, Stage A) and
 * lib/nav/student-nav.ts (student shell + exam focus routes, Stage B).
 */
import { FOOTER_ABOUT } from "@/content/public-pages";

export type ShellFlags = { COURSES: boolean; BATTLES: boolean; PRACTICE: boolean };

export type NavItem = {
  href: string;
  label: string;
  /** Extra path prefixes that mark this item active. */
  match?: string[];
  /** Shown only when this server-evaluated feature flag is on. */
  flag?: keyof ShellFlags;
  /** Shown only when this flag is OFF (the pre-flag version of an entry). */
  unlessFlag?: keyof ShellFlags;
};

export const FOOTER_NAV: Array<{ heading: string; items: NavItem[] }> = [
  {
    heading: "Prepare",
    items: [
      { href: "/exams", label: "Exams" },
      { href: "/mock-tests", label: "Mock tests" },
      { href: "/practice", label: "Practice", flag: "PRACTICE" },
      { href: "/mistakes/drill", label: "Mistake drills", flag: "PRACTICE" },
      { href: "/practice", label: "Mistake drills", unlessFlag: "PRACTICE" },
      { href: "/pricing", label: "Pricing" },
    ],
  },
  {
    heading: "Read",
    items: [{ href: "/current-affairs", label: "Current affairs" }],
  },
  { heading: FOOTER_ABOUT.heading, items: FOOTER_ABOUT.items.map((i) => ({ ...i })) },
];

/** UX-2b footer bar links: the legal pages (drafts under legal review). */
export const FOOTER_LEGAL: NavItem[] = FOOTER_ABOUT.legal.map((i) => ({ ...i }));

export function visibleItems(items: NavItem[], flags: ShellFlags): NavItem[] {
  return items.filter((i) => (!i.flag || flags[i.flag]) && (!i.unlessFlag || !flags[i.unlessFlag]));
}
