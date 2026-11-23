/**
 * UX-2b — every user-facing string of the public pages in one place, for owner review (docs/reports/ux/UX2B_REPORT.md
 * §4 reproduces this file). Rules (decisions #15 / #46 / #51 / #55): honest claims only, plain English, English only.
 * NO counts or prices here: counts are read live (lib/landing/landing-data.ts) and passed to the templates below; when
 * the read fails the page shows the no-number fallback. The only figures are documented facts from the owner's brief:
 * the founding year (2024) and the CNTS class range (Classes 5 to 8). scripts/test_ux2b_public.cjs enforces this.
 */
import { LANDING_BRAND_LINE, LANDING_EXAMS, LANDING_LOOP, LANDING_TRUST, SHELL_COPY } from "@/content/landing";

/** Exams that have an honest "coming soon" hub (decision #32: hubs exist, content shown only when published). */
export const COMING_SOON_EXAMS = LANDING_EXAMS.comingSoon;

export const EXAMS_PAGE = {
  meta: {
    title: "Exams",
    description: "Government exams on Courage Library: free mock tests, exam guides and the syllabus for SSC CGL. SSC CHSL and SSC MTS are coming soon.",
  },
  title: "Exams",
  lead: "Choose the exam you are preparing for. Everything available today is free during early access.",
  availableHeading: "Available now",
  comingSoonHeading: "Coming soon",
  comingSoonText: "Not published yet. See what we plan to add.",
  comingSoonCta: "See what's planned",
  fallback: "We couldn't load the exam list just now. You can still open SSC CGL directly.",
  fallbackCta: { label: "Open SSC CGL", href: "/exams/ssc-cgl" },
} as const;

export const COMING_SOON_HUB = {
  metaDescription: (title: string) => `${title} is coming soon to Courage Library. Nothing is published for it yet.`,
  badge: "Coming soon",
  lead: (title: string) => `We are preparing ${title} on Courage Library. Nothing is published for it yet, so there is nothing to study here today.`,
  plannedHeading: "What we plan to add",
  planned: [
    "An exam guide: pattern, eligibility and what is asked",
    "The syllabus as a checklist",
    "Full-length mock tests with a review of every answer",
    "Mistake Vault practice from the questions you get wrong",
  ],
  plannedNote: "These will appear here only once they are published.",
  availableNow: "Available now",
  availableCta: { label: "Explore SSC CGL", href: "/exams/ssc-cgl" },
  allExamsCta: { label: "All exams", href: "/exams" },
} as const;

export const PRICING_META = {
  title: "Plans and pricing",
  description: "Courage Library is free during early access. Pro is coming soon, and there is nothing to pay today.",
  headline: "Free during early access. Pro coming soon.",
} as const;

export const ABOUT_PAGE = {
  meta: {
    title: "About Courage Library",
    description: "Courage Library began as a physical study library in Kanpur, Uttar Pradesh. Learn Smarter. Prepare Independently.",
  },
  title: "About Courage Library",
  lead: LANDING_BRAND_LINE,
  startedHeading: "Where we started",
  started: LANDING_TRUST.text,
  buildingHeading: "What we are building",
  building:
    "This platform is built by the same people. It is for students who prepare on their own and want honest feedback: real exam-style practice, a clear view of where marks were lost, and a simple way to fix those mistakes.",
  loopHeading: LANDING_LOOP.heading,
  loopLead: LANDING_LOOP.lead,
  loopSteps: LANDING_LOOP.steps,
  todayHeading: "Where we are today",
  today: "We are in early access. SSC CGL is available now, and more exams are on the way. Everything available today is free.",
  ctas: [
    { label: "Explore exams", href: "/exams" },
    { label: "Contact us", href: "/contact" },
  ],
} as const;

export const CNTS_PAGE = {
  meta: {
    title: "Courage National Talent Search (CNTS)",
    description: "The Courage National Talent Search is a talent search for school students in Classes 5 to 8. Registrations open soon.",
  },
  title: "Courage National Talent Search (CNTS)",
  lead: "A talent search for school students in Classes 5 to 8, run by Courage Library.",
  groupsHeading: "Who it is for",
  groups: [
    { name: "Junior", classes: "Classes 5 and 6" },
    { name: "Senior", classes: "Classes 7 and 8" },
  ],
  registrationTitle: "Registrations open soon",
  registrationText: "Registration is not open yet. There is nothing to fill in or pay today.",
  parentHeading: "Registration by parents",
  parentText: "When registration opens, a parent or guardian will register the student. Students do not sign up on their own.",
  detailsHeading: "Details",
  detailsText: "The test format, the dates and how results are shared will be announced on this page before registration opens.",
  questionsHeading: "Questions",
  questionsText: "Write to us and we will reply by email.",
} as const;

// LEGAL-PAGES-1: Contact, Privacy and Terms are the owner-approved legal text now (content/legal, docs/legal).

/** Footer additions (UX-2b): only routes that exist. LEGAL-PAGES-1: the legal row lists the five legal pages. */
export const FOOTER_ABOUT = {
  heading: "Courage Library",
  items: [
    { href: "/about", label: "About" },
    { href: "/cnts", label: "CNTS" },
    { href: "/help", label: "Help" },
  ],
  legal: [
    { href: "/terms", label: "Terms" },
    { href: "/privacy", label: "Privacy" },
    { href: "/refund-policy", label: "Refund Policy" },
    { href: "/shipping-policy", label: "Shipping Policy" },
    { href: "/contact", label: "Contact & Grievance" },
  ],
} as const;
