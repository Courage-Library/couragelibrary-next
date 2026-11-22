import type { FooterCopy } from "@/content/footer";
import { LEARN_INDEX_READY } from "@/lib/nav/visitor-nav";

/**
 * FOOTER-1 — which links the footers show (pure; gated by scripts/test_footer1.cjs). Only LIVE routes are links; a
 * not-ready item is muted text ("· soon", never a link) or left out, as the owner decided (23 Nov 2026):
 *   Daily free mock — no stable route (backlog NAV-TODAY-MOCK-1) → left out
 *   Learn           — only once the Learn index exists (LEARN_INDEX_READY, the NAV-1 rule) → left out today
 *   Partner Schools — /institutes is unlinked until it has real content (UX-FIX-1) → left out
 * Payment-gateway compliance (owner decision 6): Privacy, Terms, Refund, Shipping and Contact are ALWAYS linked on the
 * public footer.
 */
export const FOOTER_ROUTES = {
  exams: "/exams",
  mockTests: "/mock-tests",
  currentAffairs: "/current-affairs",
  learn: "/learn",
  about: "/about",
  contact: "/contact",
  help: "/help",
  privacy: "/privacy",
  terms: "/terms",
  refund: "/refund-policy",
  shipping: "/shipping-policy",
  signUp: "/auth/signup",
} as const;

/** the five links a payment gateway expects on every public page */
export const COMPLIANCE_ROUTES = [FOOTER_ROUTES.privacy, FOOTER_ROUTES.terms, FOOTER_ROUTES.refund, FOOTER_ROUTES.shipping, FOOTER_ROUTES.contact] as const;

export type FooterItem = { label: string; href: string | null; soon?: boolean; more?: boolean };
export type FooterColumn = { key: "exams" | "prepare" | "company" | "legal"; heading: string; items: FooterItem[] };
export type FooterCategory = { slug: string; name: string; href: string | null };

export const FOOTER_MAX_CATEGORIES = 5;

/** live categories first (links), then the rest as muted "· soon" text; at most 5; then "All exams ›" */
export function examItems(t: FooterCopy, categories: readonly FooterCategory[]): FooterItem[] {
  const live = categories.filter((c) => c.href);
  const soon = categories.filter((c) => !c.href);
  const top = [...live, ...soon].slice(0, FOOTER_MAX_CATEGORIES);
  return [...top.map((c) => (c.href ? { label: c.name, href: c.href } : { label: c.name, href: null, soon: true })), { label: t.allExams, href: FOOTER_ROUTES.exams, more: true }];
}

export function footerColumns(t: FooterCopy, categories: readonly FooterCategory[], opts: { learnReady?: boolean } = {}): FooterColumn[] {
  const learnReady = opts.learnReady ?? LEARN_INDEX_READY;
  return [
    { key: "exams", heading: t.exams, items: examItems(t, categories) },
    {
      key: "prepare",
      heading: t.prepare,
      items: [
        { label: t.mockTests, href: FOOTER_ROUTES.mockTests },
        { label: t.currentAffairs, href: FOOTER_ROUTES.currentAffairs },
        ...(learnReady ? [{ label: "Learn", href: FOOTER_ROUTES.learn }] : []),
      ],
    },
    {
      key: "company",
      heading: t.company,
      items: [
        { label: t.about, href: FOOTER_ROUTES.about },
        { label: t.contact, href: FOOTER_ROUTES.contact },
      ],
    },
    {
      key: "legal",
      heading: t.helpLegal,
      items: [
        { label: t.help, href: FOOTER_ROUTES.help },
        { label: t.privacy, href: FOOTER_ROUTES.privacy },
        { label: t.terms, href: FOOTER_ROUTES.terms },
        { label: t.refund, href: FOOTER_ROUTES.refund },
        { label: t.shipping, href: FOOTER_ROUTES.shipping },
      ],
    },
  ];
}

/** the trust line: "© year Courage Library · Registered MSME (Udyam)" + Razorpay ONLY while payments are on */
export function trustLine(t: FooterCopy, year: number, paymentsEnabled: boolean): string {
  return [`© ${year} Courage Library`, t.msme, ...(paymentsEnabled ? [t.razorpay] : [])].join(" · ");
}

/** student slim line: © · Help · Privacy · Terms · Refunds (+ Contact on desktop) */
export function studentLinks(t: FooterCopy): Array<FooterItem & { desktopOnly?: boolean }> {
  return [
    { label: "Help", href: FOOTER_ROUTES.help },
    { label: "Privacy", href: FOOTER_ROUTES.privacy },
    { label: "Terms", href: FOOTER_ROUTES.terms },
    { label: t.refunds, href: FOOTER_ROUTES.refund },
    { label: t.contact, href: FOOTER_ROUTES.contact, desktopOnly: true },
  ];
}

/** the sign-up band: never on the landing (it has its own final CTA) or on auth pages */
export function bandAllowed(pathname: string): boolean {
  const p = pathname.split(/[?#]/)[0] || "/";
  if (p === "/" || p === "/hi") return false;
  return !(p === "/auth" || p.startsWith("/auth/"));
}

/** Hindi footer copy only on /hi (owner decision 4: /hi/learn/* keeps the English footer) */
export function footerLangFor(pathname: string): "en" | "hi" {
  return (pathname.split(/[?#]/)[0] || "/") === "/hi" ? "hi" : "en";
}
