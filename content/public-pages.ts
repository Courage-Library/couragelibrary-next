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

export const CONTACT_PAGE = {
  meta: {
    title: "Contact",
    description: "Contact Courage Library by email. Kanpur, Uttar Pradesh.",
  },
  title: "Contact us",
  lead: "Please reach us by email. We reply from the same address.",
  emailHeading: "Email",
  email: SHELL_COPY.supportEmail,
  emailUses: [
    "Help with your account or signing in",
    "A question about an exam or a mock test",
    "Reporting a mistake in a question",
    "A request to see or delete your data",
  ],
  locationHeading: "Location",
  location: SHELL_COPY.location,
} as const;

/** Shown at the top of both legal pages until the owner / a lawyer approves them. */
export const LEGAL_DRAFT_NOTICE = {
  title: "Draft — under legal review",
  text: "This page describes how the platform works today. It is a draft and will be finalised before public registration opens.",
} as const;

export type LegalSection = { heading: string; paragraphs?: string[]; items?: string[] };

export const PRIVACY_PAGE = {
  meta: {
    title: "Privacy policy (draft)",
    description: "How Courage Library handles your data: what we collect, why, who processes it for us, and how to ask for deletion. Draft under legal review.",
  },
  title: "Privacy policy",
  sections: [
    {
      heading: "Who we are",
      paragraphs: [`Courage Library, Kanpur, Uttar Pradesh. You can reach us at ${SHELL_COPY.supportEmail}.`],
    },
    {
      heading: "What we collect",
      items: [
        "When you create an account: your email address, the name you enter, and a password. The password is stored only as a secure hash by our sign-in provider; we never see it.",
        "When you use the platform: your test attempts and answers, scores, the questions saved in your Mistake Vault, your drills and bookmarks, and study activity such as streaks and reward coins.",
        "When you visit: our hosting provider keeps standard technical logs, such as IP address and browser type, to run and protect the service.",
      ],
    },
    {
      heading: "Cookies",
      paragraphs: ["We use cookies only to keep you signed in. We do not use advertising or analytics cookies."],
    },
    {
      heading: "How we use your data",
      items: [
        "To run your account and show your results, progress and mistakes",
        "To keep the service working and secure",
        "To reply when you write to us",
      ],
    },
    {
      heading: "Who processes it for us",
      items: [
        "Supabase: database and sign-in",
        "Vercel: website hosting",
        "Our email provider: sign-in and password-reset emails",
      ],
      paragraphs: [
        "We do not sell your data and we do not share it for advertising.",
        "Your answers and activity are not sent to AI services.",
        "We do not take payments today.",
      ],
    },
    {
      heading: "Your choices",
      paragraphs: [
        `To see, correct or delete your data, email ${SHELL_COPY.supportEmail} from the address on your account. We will delete your account and personal data, except where the law requires us to keep something.`,
      ],
    },
    {
      heading: "School students",
      paragraphs: [
        "Courage Library is not yet open to school students. If we open CNTS registration, a parent or guardian will register the student, and this policy will be updated before that happens.",
      ],
    },
    {
      heading: "Changes",
      paragraphs: ["If this policy changes, we will update this page."],
    },
  ] as LegalSection[],
} as const;

export const TERMS_PAGE = {
  meta: {
    title: "Terms of use (draft)",
    description: "The terms for using Courage Library during early access. Draft under legal review.",
  },
  title: "Terms of use",
  sections: [
    {
      heading: "About these terms",
      paragraphs: ["By using Courage Library you agree to these terms. Please read them with the privacy policy."],
    },
    {
      heading: "Your account",
      items: [
        "Use your own email address and keep your password safe.",
        "One person per account.",
        "You are responsible for what happens under your account.",
      ],
    },
    {
      heading: "Early access",
      paragraphs: [
        "Courage Library is free during early access. Features may change, pause or be removed while we build the platform. We will say on the pricing page before anything becomes paid.",
      ],
    },
    {
      heading: "Fair use",
      items: [
        "Do not copy, sell or republish our questions, tests or guides.",
        "Do not use bots or scripts to collect content.",
        "Do not try to break into accounts or the service.",
      ],
    },
    {
      heading: "Our content",
      paragraphs: [
        "We prepare questions and exam guides carefully, but mistakes can happen. Always check exam rules and dates with the body that conducts the exam. If you find a mistake, tell us and we will fix it.",
        "Courage Library is an independent platform. It is not connected with any government department or exam-conducting body.",
      ],
    },
    {
      heading: "Ending your use",
      paragraphs: [
        "You can stop using Courage Library and ask us to delete your account at any time. We may suspend an account that breaks these terms.",
      ],
    },
    {
      heading: "Responsibility",
      paragraphs: [
        "We work to keep the platform accurate and available, but we cannot promise exam results. To the extent the law allows, Courage Library is not responsible for losses that come from using the platform.",
      ],
    },
    {
      heading: "Governing law",
      paragraphs: ["To be confirmed in legal review."],
    },
    {
      heading: "Contact",
      paragraphs: [`Questions about these terms: ${SHELL_COPY.supportEmail}.`],
    },
  ] as LegalSection[],
} as const;

/** Footer additions (UX-2b): only routes that exist. */
export const FOOTER_ABOUT = {
  heading: "Courage Library",
  items: [
    { href: "/about", label: "About" },
    { href: "/cnts", label: "CNTS" },
    { href: "/contact", label: "Contact" },
    { href: "/help", label: "Help" },
    { href: "/grievance", label: "Grievance redressal" },
  ],
  legal: [
    { href: "/privacy", label: "Privacy (draft)" },
    { href: "/terms", label: "Terms (draft)" },
  ],
} as const;
