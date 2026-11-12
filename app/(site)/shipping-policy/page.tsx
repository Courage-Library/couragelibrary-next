import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/legal-document";
import { legalPageDef } from "@/content/legal";
import { isLessonCoinsEarnEnabled } from "@/lib/coins/flag";
import { constructMetadata } from "@/lib/seo/metadata";

/** LEGAL-PAGES-1: Shipping & Delivery Policy — the owner-approved text, verbatim (docs/legal/LEGAL_PAGES_v1.md). Public; no data reads. */
const def = legalPageDef("/shipping-policy");

export const metadata: Metadata = constructMetadata({ title: def.meta.title, description: def.meta.description, canonicalUrl: def.route });

export default function ShippingPolicyPage() {
  return <LegalDocument def={def} coins={isLessonCoinsEarnEnabled()} />;
}
