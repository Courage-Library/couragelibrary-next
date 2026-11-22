/**
 * UX-1b shell flags (server-evaluated feature flags the shells pass to their navigation).
 * NAV-1: the header / sidebar / bottom-bar links live in lib/nav/visitor-nav.ts (visitor header, Stage A) and
 * lib/nav/student-nav.ts (student shell + exam focus routes, Stage B).
 * FOOTER-1: the footer link lists moved to lib/site/footer-links.ts (THE public footer + THE student slim line); the
 * old FOOTER_NAV / FOOTER_LEGAL lists were removed with the old navy footer.
 */
export type ShellFlags = { COURSES: boolean; BATTLES: boolean; PRACTICE: boolean };
