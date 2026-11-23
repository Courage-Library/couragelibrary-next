/**
 * LANDING-1: the facts the landing page states, kept in ONE place (spec §0). Change a fact here and both languages
 * follow. Nothing here is a number we cannot back up.
 */
export const LANDING_FACTS = {
  founded: { en: "August 2024", enShort: "Aug 2024", hi: "अगस्त 2024" },
  city: { en: "Kanpur, Uttar Pradesh", hi: "कानपुर, उत्तर प्रदेश", enShort: "Kanpur", hiShort: "कानपुर" },
  msmeRegistered: true,
  copyrightYear: 2026,
} as const;

/** The exam cards (spec §5 "Choose your exam"), in order. `slug` = the category slug in the database; the card is a
 * link only while that category has at least one live exam (owner L3 — data-driven, never assumed). */
export const LANDING_CATEGORIES = [
  { key: "ssc", slug: "ssc", icon: "ssc", examples: { en: "CGL, CHSL, MTS, GD", hi: "CGL, CHSL, MTS, GD" }, name: { en: "SSC", hi: "SSC" } },
  { key: "banking", slug: "banking", icon: "bank", examples: { en: "IBPS, SBI PO & Clerk", hi: "IBPS, SBI PO और Clerk" }, name: { en: "Banking", hi: "बैंकिंग" } },
  { key: "railway", slug: "railway", icon: "rail", examples: { en: "NTPC, Group D, ALP", hi: "NTPC, Group D, ALP" }, name: { en: "Railway", hi: "रेलवे" } },
  { key: "police", slug: "police", icon: "police", examples: { en: "UP Police, Delhi Police", hi: "UP Police, Delhi Police" }, name: { en: "Police", hi: "पुलिस" } },
  { key: "defence", slug: "defence", icon: "def", examples: { en: "Agniveer, CDS, AFCAT", hi: "Agniveer, CDS, AFCAT" }, name: { en: "Defence", hi: "डिफेंस" } },
  { key: "teaching", slug: "teaching", icon: "teach", examples: { en: "CTET, UPTET, KVS", hi: "CTET, UPTET, KVS" }, name: { en: "Teaching", hi: "टीचिंग" } },
  { key: "state-psc", slug: "state-psc", icon: "psc", examples: { en: "UPPSC, BPSC, RPSC", hi: "UPPSC, BPSC, RPSC" }, name: { en: "State PSC", hi: "राज्य PSC" } },
] as const;

export type LandingCategoryKey = (typeof LANDING_CATEGORIES)[number]["key"];

/** The popular-exam chips (owner L3): a chip shows ONLY while its exam is live (is_active, read from the database at
 * render — on 2026-11-21 only SSC CGL is live; CHSL and MTS pages exist but say "coming soon", so they stay hidden). */
export const LANDING_CHIPS = [
  { label: "SSC CGL", slug: "ssc-cgl", href: "/exams/ssc-cgl" },
  { label: "SSC CHSL", slug: "ssc-chsl", href: "/exams/ssc-chsl" },
  { label: "SSC MTS", slug: "ssc-mts", href: "/exams/ssc-mts" },
] as const;

/** The library facts (owner: 5 pills; "AC · 5G Wi-Fi" is ONE pill). */
export const LANDING_LIBRARY_FACTS = {
  en: [`Since ${LANDING_FACTS.founded.enShort}`, "Noise-controlled reading hall", "AC · 5G Wi-Fi", "Newspapers daily", "RO water"],
  hi: [`${LANDING_FACTS.founded.hi} से`, "शांत reading hall", "AC · 5G Wi-Fi", "रोज़ अख़बार", "RO पानी"],
} as const;

/** Every internal link on the landing page (spec §6 + owner L4). All are existing routes. */
export const LANDING_ROUTES = {
  home: { en: "/", hi: "/hi" },
  signUp: "/auth/signup",
  signIn: "/auth/login",
  dashboard: "/dashboard",
  exams: "/exams",
  currentAffairs: "/current-affairs",
  mockTests: "/mock-tests",
  terms: "/terms",
  privacy: "/privacy",
  refund: "/refund-policy",
  // LEGAL-LINK-1 (owner 2026-11-23): compliance — every public footer links all five legal pages
  shipping: "/shipping-policy",
  grievance: "/contact#grievance-officer",
  about: "/about",
  contact: "/contact",
  help: "/help",
  examCategory: (slug: string) => `/exams/${slug}`,
} as const;
