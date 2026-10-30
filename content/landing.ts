/**
 * UX-2a — every user-facing string of the landing page ("/") in one place, for owner review.
 *
 * Rules (decisions #15 / #46): no fabricated values, honest claims only. This file holds NO numbers: counts
 * (mock tests, exam guides) are read live by lib/landing/landing-data.ts and passed to the templates below; when
 * the read fails the page uses the `fallback` texts, which carry no numbers. The only allowed figure is the
 * founding year (2024, from the owner's brief). scripts/test_ux2a_landing.cjs enforces this.
 * Plain English, no internal / technical words (UX-1b U-1).
 */

export const LANDING_BRAND_LINE = "Learn Smarter. Prepare Independently.";

export const LANDING_META = {
  title: "Courage Library: Government exam preparation with free mock tests",
  description:
    "Prepare for government exams with free full-length mock tests, clear answer analysis and a Mistake Vault that turns every wrong answer into practice. Free during early access.",
} as const;

export const LANDING_HERO = {
  eyebrow: "Government exam preparation",
  title: LANDING_BRAND_LINE,
  lead: "Courage Library helps government-exam aspirants practice with real exam-style mock tests, see exactly where marks were lost, and fix those mistakes until they stick.",
  primaryCta: { label: "Start free", href: "/auth/signup" },
  signedInCta: { label: "Go to dashboard", href: "/dashboard" },
  secondaryCta: { label: "Explore SSC CGL", href: "/exams/ssc-cgl" },
  note: "Free during early access. No card needed.",
} as const;

export const LANDING_LOOP = {
  heading: "How Courage Library works",
  lead: "One simple loop, repeated until the exam day.",
  stepLabel: (n: number) => `Step ${n}: `,
  /** UX-FIX-1: the hero shows steps 1–3 and links here (the count comes from `steps`, never typed in) */
  seeAll: (n: number) => `See all ${n} steps`,
  steps: [
    { title: "Explore", text: "Understand your exam: pattern, eligibility and what is asked." },
    { title: "Learn", text: "Study one topic at a time, in plain language." },
    { title: "Practice", text: "Answer questions on that topic and check yourself." },
    { title: "Mock", text: "Take a full-length test under real exam timing." },
    { title: "Analyze", text: "Review every answer and see which sections cost you marks." },
    { title: "Diagnose", text: "Your wrong answers are saved in your Mistake Vault." },
    { title: "Master", text: "Drill those mistakes until you get them right, again and again." },
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
    { slug: "ssc-chsl", title: "SSC CHSL", body: "Staff Selection Commission" },
    { slug: "ssc-mts", title: "SSC MTS", body: "Staff Selection Commission" },
  ],
  fallback: "The exam list could not be loaded right now. You can still browse all exams.",
  fallbackCta: { label: "Browse exams", href: "/exams" },
  allExamsCta: { label: "All exams", href: "/exams" },
} as const;

export const LANDING_FEATURES = {
  heading: "What you get",
  lead: "Everything below is available to students today, unless it says coming soon.",
  liveLabel: "Available now",
  comingSoonLabel: "Coming soon",
  items: {
    mocks: {
      title: "Full-length mock tests",
      text: "Exam-pattern tests with real timing, sections and negative marking.",
      count: (n: number) => (n === 1 ? `${n} free mock test live` : `${n} free mock tests live`),
    },
    analysis: {
      title: "Answer analysis",
      text: "After each test: your score, accuracy and section-by-section breakdown, plus a review of every question with the correct answer and, where available, an explanation.",
    },
    mistakes: {
      title: "Mistake Vault and drills",
      text: "Every wrong answer is saved. Short drills bring them back until you get them right.",
    },
    guides: {
      title: "Exam guides",
      text: "Pattern, eligibility, selection process and more, with links to the official sources.",
      count: (n: number) => (n === 1 ? `${n} guide published` : `${n} guides published`),
    },
    syllabus: {
      title: "Syllabus tracker",
      text: "The official syllabus as a checklist linked to practice.",
    },
    currentAffairs: {
      title: "Daily current affairs",
      text: "Short daily updates for the general awareness section.",
    },
    courses: {
      title: "Courses and test series",
      text: "Structured courses and planned test series.",
    },
  },
} as const;

export const LANDING_PLANS = {
  heading: "Plans",
  text: "Free during early access. Pro coming soon.",
  proBadge: "Pro coming soon",
  detail: "Everything marked available now is free while we are in early access. Pro plans will be announced here first; there is nothing to pay today.",
} as const;

export const LANDING_TRUST = {
  heading: "Built by a real library in Kanpur",
  text: "Courage Library began as a physical study library in Kanpur, Uttar Pradesh, open since August 2024: a quiet, focused place where aspirants come to study every day.",
  detail: "This platform is built by the same people, for students who study on their own and want honest feedback on their preparation.",
  location: "Kanpur, Uttar Pradesh",
} as const;

export const LANDING_FINAL_CTA = {
  heading: "Take your first mock test today",
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
