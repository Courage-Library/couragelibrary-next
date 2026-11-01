/**
 * UX-2a — every user-facing string of the landing page ("/") in one place, for owner review.
 *
 * Rules (decisions #15 / #46): no fabricated values, honest claims only. This file holds NO numbers: counts
 * (mock tests, exam guides) are read live by lib/landing/landing-data.ts and passed to the templates below; when
 * the read fails the page uses the `fallback` texts, which carry no numbers. The only allowed figure is the
 * founding year (2024, from the owner's brief). scripts/test_ux2a_landing.cjs enforces this.
 * Plain English, no internal / technical words (UX-1b U-1).
 */

import { andList } from "@/lib/text/and-list";

export const LANDING_BRAND_LINE = "Learn Smarter. Prepare Independently.";

export const LANDING_META = {
  title: "Courage Library: Government exam preparation with free mock tests",
  description:
    "Prepare for government exams with free full-length mock tests, clear answer analysis and a Mistake Vault that turns every wrong answer into practice. Free during early access.",
} as const;

export const LANDING_HERO = {
  // HOME-1 expert UX pass: the slogan is the small eyebrow line; the H1 says the value plainly
  eyebrow: LANDING_BRAND_LINE,
  /** honest: only categories that have live exams are named; none (or the read failed) → "government exams" */
  title: (liveCategories: readonly string[]) => `Free preparation for ${liveCategories.length ? andList(liveCategories) : "government"} exams`,
  /** content languages (the website UI stays English, #82) */
  chip: "Content in Hindi & English",
  // HOME-1: short (the hero line is the LCP element on slow phones); no exam-specific action anywhere on home
  lead: "Mock tests, practice and revision for government exams. See where you lost marks and fix it.",
  primaryCta: { label: "Start free", href: "/auth/signup" },
  signedInCta: { label: "Go to dashboard", href: "/dashboard" },
  /** HOME-1 (ruling Q2): THE primary action while sign-up is closed (the sign-up setting switches it to "Start free") */
  secondaryCta: { label: "Explore exams", href: "/#categories" },
  note: "Free during early access. No card needed.",
} as const;

export const LANDING_LOOP = {
  heading: "How it works",
  lead: "One simple loop, repeated until the exam day.",
  stepLabel: (n: number) => `Step ${n}: `,
  // HOME-1 design upgrade: the loop closes back to step 1 (shown under the steps)
  loopBack: "Then back to Learn with the next topic.",
  /** UX-FIX-1: the hero shows steps 1–3 and links here (the count comes from `steps`, never typed in) */
  seeAll: (n: number) => `See all ${n} steps`,
  // HOME-1: 5 steps (was 7)
  steps: [
    // `short` = the one line per step on phones (owner decision 1)
    { title: "Learn", text: "Study one topic at a time, in plain language.", short: "One topic at a time." },
    { title: "Practice", text: "Answer questions on that topic and check yourself.", short: "Check yourself on it." },
    { title: "Mock", text: "Take a full-length test under real exam timing.", short: "Real exam timing." },
    { title: "Analyze", text: "See which sections and questions cost you marks.", short: "See where marks went." },
    { title: "Revise", text: "Your mistakes come back until you get them right.", short: "Mistakes return until fixed." },
  ],
} as const;

export const LANDING_EXAMS = {
  heading: "Exams",
  lead: "Start with the exam you are preparing for.",
  cardCta: "Open exam",
  loadingLabel: "Loading exams and features",
  glanceLabel: (title: string) => `${title} at a glance`,
  mocks: (n: number) => (n === 1 ? `${n} free mock test` : `${n} free mock tests`),
  noMocks: "Mock tests coming soon",
  guides: (n: number) => (n === 1 ? `${n} exam guide` : `${n} exam guides`),
  syllabusAvailable: "Syllabus available",
  syllabusSoon: "Syllabus coming soon",
  comingSoonLabel: "Coming soon",
  /** shown as plain text cards (no links) until their exam pages exist; hidden once the exam is active. `body` = the
   *  conducting body named in the coming-soon hub's not-affiliated line (EXAM-LOGO-1: every exam page carries it) */
  comingSoon: [
    { slug: "ssc-chsl", title: "SSC CHSL", body: "Staff Selection Commission", category: "ssc" },
    { slug: "ssc-mts", title: "SSC MTS", body: "Staff Selection Commission", category: "ssc" },
  ],
  fallback: "The exam list could not be loaded right now. You can still browse all exams.",
  fallbackCta: { label: "Browse exams", href: "/exams" },
  allExamsCta: { label: "All exams", href: "/exams" },
} as const;

export const LANDING_FEATURES = {
  heading: "What you get",
  // HOME-1: only what students can use today is listed (no "coming soon" cards on home)
  lead: "Everything below works today and is free during early access.",
  liveLabel: "Available now",
  /** HOME-1 expert UX pass: the section's focal element = the live numbers (read live; no number is typed here) */
  statsLabel: "Live on Courage Library today",
  examsUnit: (n: number) => (n === 1 ? "exam live" : "exams live"),
  comingSoonLabel: "Coming soon",
  items: {
    mocks: {
      title: "Full-length mock tests",
      text: "Exam-pattern tests with real timing, sections and negative marking.",
      count: (n: number) => (n === 1 ? `${n} free mock test live` : `${n} free mock tests live`),
      unit: (n: number) => (n === 1 ? "free mock test live" : "free mock tests live"),
      short: "Real timing, sections and negative marking.",
    },
    analysis: {
      title: "Answer analysis",
      text: "After each test: your score, accuracy and section-by-section breakdown, plus a review of every question with the correct answer and, where available, an explanation.",
      short: "Score, accuracy and every answer reviewed.",
    },
    mistakes: {
      title: "Mistake Vault and drills",
      text: "Every wrong answer is saved. Short drills bring them back until you get them right.",
      short: "Wrong answers come back as short drills.",
    },
    guides: {
      title: "Exam guides",
      text: "Pattern, eligibility, selection process and more, with links to the official sources.",
      count: (n: number) => (n === 1 ? `${n} guide published` : `${n} guides published`),
      unit: (n: number) => (n === 1 ? "guide published" : "guides published"),
      short: "Pattern, eligibility and official links.",
    },
    syllabus: {
      title: "Syllabus tracker",
      text: "The official syllabus as a checklist linked to practice.",
      short: "The official syllabus, topic by topic.",
    },
    currentAffairs: {
      title: "Daily current affairs",
      text: "Short daily updates for the general awareness section.",
      short: "Short daily updates for general awareness.",
    },
    courses: {
      title: "Courses and test series",
      text: "Structured courses and planned test series.",
      short: "Structured courses and test series.",
    },
  },
} as const;

export const LANDING_PLANS = {
  heading: "Free and Pro",
  text: "Free during early access. Pro coming soon.",
  proBadge: "Pro coming soon",
  detail: "Everything marked available now is free while we are in early access. Pro plans will be announced here first; there is nothing to pay today.",
  /** HOME-1: features only, no prices ("Pricing at launch") */
  free: { title: "Free", note: "Now, during early access", items: ["Full-length mock tests", "Answer analysis", "Mistake Vault and drills", "Exam guides"] },
  pro: { title: "Pro", note: "Coming soon. Pricing at launch.", items: ["More full-length mocks", "Deeper analysis of your progress", "Announced here first"] },
  /** owner decision 1: a small comparison table (features only, no prices) */
  table: {
    caption: "What is free now and what Pro adds. Pricing at launch.",
    columns: ["Feature", "Free", "Pro"],
    rows: [
      { feature: "Full-length mock tests", free: true, pro: true },
      { feature: "Answer analysis", free: true, pro: true },
      { feature: "Mistake Vault and drills", free: true, pro: true },
      { feature: "Exam guides", free: true, pro: true },
      { feature: "More full-length mocks", free: false, pro: true },
      { feature: "Deeper progress analysis", free: false, pro: true },
    ],
    proNote: "Pro is coming soon. Pricing at launch.",
  },
} as const;

/** HOME-1: the category tiles (data: lib/exams/category-data.ts; numbers only from live rows) */
export const LANDING_CATEGORIES = {
  heading: "Choose your exam category",
  lead: "Pick a category to see its exams.",
  comingSoon: "Coming soon",
  allExams: { label: "All exams", href: "/exams" },
  fallback: "The categories could not be loaded right now. You can still browse all exams.",
} as const;

/** HOME-1: plain answers; no promises of selection, no numbers we cannot show (CCPA coaching-ad guidelines; UX research phase 1) */
export const LANDING_FAQ = {
  heading: "Questions",
  items: [
    { q: "Is it really free?", a: "Yes. Everything you can use today is free during early access, and no card is needed. Pro will be announced here first, before anything costs money." },
    { q: "Which exams do you cover?", a: "We start with SSC exams and add more categories (Police, Defence, Railway, Banking) one by one. A category shows Coming soon until its first exam is ready." },
    { q: "Can I study in Hindi?", a: "Lessons are being written in English and Hindi. The website itself is in English for now." },
    { q: "Do you promise selection?", a: "No. Nobody can honestly promise selection. We help you practice, find your weak areas and fix them." },
    { q: "Who runs Courage Library?", a: "The team behind a physical study library in Kanpur, Uttar Pradesh, open since August 2024." },
    { q: "Are you connected to SSC or any exam body?", a: "No. Courage Library is an independent platform and is not affiliated with any exam conducting body." },
  ],
} as const;

export const LANDING_TRUST = {
  galleryLabel: "Photos of the library",
  /** owner decision 1: the home page story in ≤ 3 lines (plus the library photo when uploaded) */
  short: "A real study library in Kanpur, Uttar Pradesh, open since August 2024. The same team builds this platform for students who study on their own.",
  heading: "Built by a real library in Kanpur",
  text: "Courage Library began as a physical study library in Kanpur, Uttar Pradesh, open since August 2024: a quiet, focused place where aspirants come to study every day.",
  detail: "This platform is built by the same people, for students who study on their own and want honest feedback on their preparation.",
  location: "Kanpur, Uttar Pradesh",
} as const;

export const LANDING_FINAL_CTA = {
  heading: "Start preparing today",
  note: "Free during early access.",
  text: "Create a free account and start with a full-length test.",
  cta: { label: "Start free", href: "/auth/signup" },
  signedInCta: { label: "Go to dashboard", href: "/dashboard" },
} as const;

/** Public shell (header / footer) strings added in UX-2a. */
export const SHELL_COPY = {
  signIn: "Sign in",
  /** UX-FIX-1: one label for every start action (shown only while sign-up is open) */
  startFree: "Start free",
  goToDashboard: "Go to dashboard",
  footerContactHeading: "Contact",
  supportEmail: "support@couragelibrary.in",
  location: "Kanpur, Uttar Pradesh",
} as const;
