import { LANDING_FACTS } from "./facts";
import type { LandingCopy } from "./types";

/**
 * LANDING-1 English copy — LANDING_V1_SPEC.md §5 with the owner's amendments of 2026-11-21 (hero sub, search
 * placeholder, "Choose your exam" lead, step 1, Free list items 1 / 3 / 5, pain answers 1 / 2, step 4, FAQ 1 / 2).
 * "Learn" (nav) and "Lessons" (footer) are left out until a Learn index exists (owner L4).
 */
export const LANDING_EN: LandingCopy = {
  lang: "en",
  meta: {
    title: "Courage Library — Find your weak topics. Fix them. Score better.",
    // no Hindi claim here (owner round 3: Hindi claims only behind published Hindi content; metadata is static)
    description: "Free lessons, practice and mock tests for government exams. Starting with SSC, with more exams on the way.",
  },
  skip: "Skip to content",
  nav: { exams: "Exams", currentAffairs: "Current Affairs", mockTests: "Mock Tests", label: "Main" },
  langSwitch: { label: "Language", en: "EN", hi: "हिंदी" },
  signIn: "Sign in",
  startFree: "Start free",
  dashboard: "Go to dashboard",
  menu: { open: "Menu" },
  hero: {
    badge: "Free for every aspirant · Hindi & English",
    h1Before: "Find your weak topics. Fix them. ",
    h1Strong: "Score better",
    h1After: " in your next attempt.",
    sub: "Free lessons, practice and mock tests for government exams, in Hindi and English. Starting with SSC, with more exams on the way.",
    explore: "Explore exams",
    tagline: "Har attempt, behtar.",
    loop: ["Learn", "Practice", "Mock", "Weak topics", "Fix", "Improve"],
    loopAlt: "The improvement loop: Learn, Practice, Mock, Weak topics, Fix, Improve — then back to Learn.",
  },
  band: {
    h2: "Find your exam",
    text: "Syllabus, lessons, practice and mocks for your exam, in one place.",
    search: "Search for your exam…",
    searchLabel: "Search exams",
    chipsLabel: "Popular exams",
  },
  liveExams: {
    one: "{LIVE_EXAMS} is live now. More exams are coming next, added step by step from each official syllabus.",
    many: "{LIVE_EXAMS} are live now. More exams are coming next, added step by step from each official syllabus.",
    none: "Exams are being added step by step, starting with SSC.",
    and: "and",
  },
  hindiPending: {
    badge: "Free for every aspirant",
    sub: "Free lessons, practice and mock tests for government exams. Starting with SSC, with more exams on the way.",
    faq: { q: "Is it available in Hindi?", a: "This website is available in Hindi today; use the हिंदी button at the top. Hindi lessons and questions are being added." },
    promise: { title: "Hindi on the way", text: "The site is in Hindi today. Hindi lessons and questions are being added." },
  },
  exams: {
    h2: "Choose your exam",
    lead: "Start with the exam you are preparing for. SSC is live now; more categories are coming.",
    allName: "All exams",
    allText: "See the full list →",
    comingSoon: "Coming soon",
    liveSuffix: "live",
    moreComing: "more coming",
  },
  pain: {
    h2: "Scoring low and don't know why?",
    lead: "Most aspirants work hard. What's missing is knowing exactly what to fix.",
    items: [
      { quote: "“I keep making the same mistakes.”", answer: "Every wrong answer is saved for revision, with an explanation and a link to that topic's lesson wherever one is available." },
      { quote: "“I don't know which topic is weak.”", answer: "Each mock shows your score section by section and names the topics where you keep losing marks." },
      { quote: "“I study a lot, but my marks don't rise.”", answer: "After every attempt you get a short list of what to learn and practice next. Nothing extra." },
    ],
  },
  how: {
    h2: "How it works",
    lead: "One simple loop. Every attempt teaches you something, and the next one goes better.",
    steps: [
      { title: "Learn", text: "Clear lessons, topic by topic" },
      { title: "Practice", text: "Topic-wise questions with solutions" },
      { title: "Mock", text: "Full tests in the real exam pattern" },
      { title: "Find weak topics", text: "See the sections and topics where marks were lost" },
      { title: "Fix", text: "Open the lesson and practice that topic" },
      { title: "Improve", text: "Score better in your next attempt" },
    ],
  },
  plans: {
    h2: "Start free. Stay free.",
    lead: "Everything you need to begin is free. Pro is optional, for when you want more.",
    free: {
      title: "Free",
      tag: "For everyone",
      sub: "No card needed. Sign up and start.",
      list: ["Topic-wise lessons for every live exam", "Daily practice questions with solutions", "Daily current affairs", "Free mock tests in the exam pattern", "Section-wise result with your weak topics"],
    },
    pro: {
      title: "Pro",
      tag: "Optional",
      sub: "For aspirants who want the full mock series.",
      list: ["Full mock test series", "Advanced analysis of every attempt", "Mistake drills and revision"],
      note: "Pro opens soon. Free features stay free.",
    },
  },
  library: {
    eyebrow: "A real library behind it",
    h2: "Built inside a real study library in Kanpur",
    text: `Since ${LANDING_FACTS.founded.en}, Courage Library has given aspirants a quiet place to prepare. This platform takes the same focus online, for students who study on their own.`,
    photos: ["Reading hall", "Desk close-up", "Entrance & signboard"],
    photoNote: "Real photo to be shot",
    photosLabel: "Library photos (coming soon)",
  },
  promises: {
    h2: "Our promises to you",
    lead: "What we will never do, and what we will always do.",
    items: [
      { title: "No fake toppers", text: "We never show invented selection numbers or fake results. Ever." },
      { title: "Checked answers", text: "Every question has a “Report a problem” button, and we fix what you report." },
      { title: "Clear refund policy", text: "Simple rules, written in plain words, before you pay anything." },
      { title: "Hindi and English", text: "Learn in the language you think in. Switch any time." },
    ],
  },
  faq: {
    h2: "Questions aspirants ask",
    items: [
      // the answer is built from the live exams at render (liveExams above); this text is never shown
      { q: "Which exams are covered?", a: "{LIVE_EXAMS_ANSWER}" },
      { q: "Is it really free?", a: "Yes. Lessons, daily practice, current affairs, free daily mocks and your result with weak topics are free. Pro is optional." },
      { q: "Can I study in Hindi?", a: "Yes. Switch between Hindi and English at any time with the button at the top." },
      { q: "Do I need an app?", a: "No. It works in the browser on any phone or computer." },
      { q: "What if I pay for Pro and change my mind?", a: "Our refund policy explains exactly when and how you get your money back, in simple words." },
      { q: "Who runs Courage Library?", a: `Courage Library is an MSME-registered study library in Kanpur, running since ${LANDING_FACTS.founded.en}.` },
    ],
  },
  final: { h2: "Your next attempt starts today", text: "Pick your exam, take a free mock and see exactly what to fix." },
  footer: {
    purpose: "We give every aspirant the courage to attempt again and the clarity to do better each time.",
    made: "Made for aspirants, in Hindi and English",
    madePending: "Made for government-exam aspirants",
    platform: "Platform",
    company: "Company",
    legal: "Legal",
    links: {
      exams: "Exams",
      mockTests: "Mock tests",
      currentAffairs: "Current affairs",
      about: "About",
      library: "Library in Kanpur",
      contact: "Contact",
      help: "Help",
      terms: "Terms",
      privacy: "Privacy",
      refund: "Refund policy",
      grievance: "Grievance officer",
    },
  },
};
