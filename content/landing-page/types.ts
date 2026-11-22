/**
 * LANDING-1: ONE shape for both languages — en.ts and hi.ts must fill every key (TypeScript checks it), so the two
 * pages can never drift apart. Copy = docs/design/LANDING_V1_SPEC.md §5, with the owner's amendments of 2026-11-21
 * (L3 honest coverage, the feature-claim replacements). Facts (dates, city, exam lists, library facts) are NOT here:
 * they live in facts.ts.
 */
export type LandingLang = "en" | "hi";

export interface LandingCopy {
  lang: LandingLang;
  meta: { title: string; description: string };
  skip: string;
  nav: { exams: string; currentAffairs: string; mockTests: string; label: string };
  langSwitch: { label: string; en: string; hi: string };
  signIn: string;
  startFree: string;
  dashboard: string;
  menu: { open: string };
  hero: {
    badge: string;
    h1Before: string;
    h1Strong: string;
    h1After: string;
    sub: string;
    explore: string;
    tagline: string;
    loop: [string, string, string, string, string, string];
    loopAlt: string;
  };
  band: { h2: string; text: string; search: string; searchLabel: string; chipsLabel: string };
  /** FAQ 1 answer, built from the LIVE exams at render ({LIVE_EXAMS} = their names joined naturally) — never hard-coded names */
  liveExams: { one: string; many: string; none: string; and: string };
  /** owner round 3: the Hindi-claim lines while NO Hindi content is published (the hero / FAQ 3 / promise 4 lines in
   *  this file are the Hindi-live versions) */
  hindiPending: { badge: string; sub: string; faq: { q: string; a: string }; promise: { title: string; text: string } };
  /** LANDING-1.1: a LIVE category's subtitle is built from its live exams ("CGL live · more coming"), never a fixed list */
  exams: { h2: string; lead: string; allName: string; allText: string; comingSoon: string; liveSuffix: string; moreComing: string };
  pain: { h2: string; lead: string; items: Array<{ quote: string; answer: string }> };
  how: { h2: string; lead: string; steps: Array<{ title: string; text: string }> };
  plans: {
    h2: string;
    lead: string;
    free: { title: string; tag: string; sub: string; list: string[] };
    pro: { title: string; tag: string; sub: string; list: string[]; note: string };
  };
  library: { eyebrow: string; h2: string; text: string; photos: [string, string, string]; photoNote: string; photosLabel: string };
  promises: { h2: string; lead: string; items: Array<{ title: string; text: string }> };
  faq: { h2: string; items: Array<{ q: string; a: string }> };
  final: { h2: string; text: string };

}
