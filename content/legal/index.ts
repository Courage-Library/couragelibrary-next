/**
 * LEGAL-PAGES-1: the five public legal pages. The TEXT is the owner-approved docs/legal/LEGAL_PAGES_v1.md, generated into
 * content/legal/legal-pages.ts (never edited by hand); this file only maps each text page to its route and adds the
 * page metadata (title / description for search results), which is not part of the legal text.
 */
import type { LegalTextPage, LegalTextSection } from "@/content/legal/types";
import { LEGAL_TEXT_PAGES } from "@/content/legal/legal-pages";

/**
 * "{{LAST_UPDATED}}" on every legal page. RELEASE REMINDER (owner): set the real date (e.g. "12 November 2026") before
 * the release; the gate LEGAL-PAGES-1 reports the placeholder as an open release item.
 */
export const LEGAL_LAST_UPDATED = "2026-XX-XX";
export const LEGAL_LAST_UPDATED_PLACEHOLDER = "2026-XX-XX";

export type LegalRoute = "/terms" | "/privacy" | "/refund-policy" | "/shipping-policy" | "/contact";

export interface LegalPageDef {
  route: LegalRoute;
  /** the "## N." page number in LEGAL_PAGES_v1.md */
  number: string;
  /** footer / breadcrumb label */
  label: string;
  meta: { title: string; description: string };
  /** a small table of contents under the intro */
  toc: boolean;
}

export const LEGAL_PAGES: readonly LegalPageDef[] = [
  {
    route: "/terms",
    number: "1",
    label: "Terms",
    meta: { title: "Terms of Service", description: "The terms for using Courage Library: accounts, paid plans, fair use, content, liability and how to raise a complaint." },
    toc: true,
  },
  {
    route: "/privacy",
    number: "2",
    label: "Privacy",
    meta: { title: "Privacy Policy", description: "What personal data Courage Library collects, why, who processes it, how long we keep it and your rights under the DPDP Act, 2023." },
    toc: true,
  },
  {
    route: "/refund-policy",
    number: "3",
    label: "Refund Policy",
    meta: { title: "Refund & Cancellation Policy", description: "How plans end, when you get a full refund, when a refund is not given, and how to ask for one." },
    toc: false,
  },
  {
    route: "/shipping-policy",
    number: "4",
    label: "Shipping Policy",
    meta: { title: "Shipping & Delivery Policy", description: "Courage Library sells only digital services: what you get after paying, when access starts and what to do if it has not." },
    toc: false,
  },
  {
    route: "/contact",
    number: "5",
    label: "Contact & Grievance",
    meta: { title: "Contact Us & Grievance Redressal", description: "Business details, the Grievance Officer and how complaints are handled at Courage Library." },
    toc: false,
  },
];

/** The anchor of the Grievance Officer section (5.1); /grievance redirects here. */
export const GRIEVANCE_ANCHOR_HREF = "/contact#grievance-officer";

export function legalTextPage(def: LegalPageDef): LegalTextPage {
  const page = LEGAL_TEXT_PAGES.find((p) => p.number === def.number);
  if (!page) throw new Error(`LEGAL: no text page ${def.number}`);
  return page;
}

export const legalPageDef = (route: LegalRoute): LegalPageDef => LEGAL_PAGES.find((p) => p.route === route) as LegalPageDef;

/** Terms 1.5 (Coins) only while the lesson-coins flag is on; the other numbers never change. */
export const visibleLegalSections = (page: LegalTextPage, { coins }: { coins: boolean }): LegalTextSection[] => page.sections.filter((s) => coins || !s.coins);
