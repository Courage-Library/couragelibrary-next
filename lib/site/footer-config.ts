import { siteConfig } from "@/config/site";

/**
 * FOOTER-1 (owner spec docs/design/FOOTER_V1_SPEC.md §1, decisions 23 Nov 2026) — the ONE typed config the footer
 * reads for owner-provided values. A value that is not set (null / "") hides its element: no placeholder text, no
 * invented address or handle, and never the account / owner e-mail. Gated: scripts/test_footer1.cjs.
 *   contactEmail  public contact address (owner decides separately) — null = no mailto in the footer
 *   libraryPath   the existing page about the physical study library in Kanpur — /about#started (the "Where we
 *                 started" section heading carries id="started"; verified in the gate)
 *   social        from siteConfig.links (the same source as the JSON-LD sameAs), so the icons and the structured data
 *                 can never disagree; only https URLs count
 */
export type SocialKey = "youtube" | "instagram" | "telegram" | "twitter" | "linkedin" | "facebook" | "whatsapp";

export interface FooterConfig {
  contactEmail: string | null;
  libraryPath: string | null;
  social: Partial<Record<SocialKey, string>>;
}

export const SOCIAL_ORDER: readonly SocialKey[] = ["youtube", "instagram", "telegram", "twitter", "linkedin", "facebook", "whatsapp"];

export const SOCIAL_LABEL: Record<SocialKey, string> = {
  youtube: "YouTube",
  instagram: "Instagram",
  telegram: "Telegram",
  twitter: "X",
  linkedin: "LinkedIn",
  facebook: "Facebook",
  whatsapp: "WhatsApp",
};

export const FOOTER_CONFIG: FooterConfig = {
  contactEmail: null,
  libraryPath: "/about#started",
  social: {
    youtube: siteConfig.links.youtube,
    instagram: siteConfig.links.instagram,
    telegram: siteConfig.links.telegram,
    twitter: siteConfig.links.twitter,
    linkedin: siteConfig.links.linkedin,
    facebook: siteConfig.links.facebook,
    whatsapp: siteConfig.links.whatsapp,
  },
};

const EMAIL_RX = /^[^\s@<>"']+@[^\s@<>"']+\.[a-z]{2,}$/i;
const PLACEHOLDER_RX = /example\.|\[|\]|placeholder|your-|xxx/i;

/** a configured, real-looking public address — else null (hidden) */
export function footerEmail(c: FooterConfig = FOOTER_CONFIG): string | null {
  const v = (c.contactEmail ?? "").trim();
  return v && EMAIL_RX.test(v) && !PLACEHOLDER_RX.test(v) ? v : null;
}

/** the configured accounts, in a fixed order — https only, never a placeholder */
export function footerSocials(c: FooterConfig = FOOTER_CONFIG): Array<{ key: SocialKey; href: string; label: string }> {
  return SOCIAL_ORDER.flatMap((key) => {
    const v = (c.social[key] ?? "").trim();
    return /^https:\/\/[^\s]+$/.test(v) && !PLACEHOLDER_RX.test(v) ? [{ key, href: v, label: SOCIAL_LABEL[key] }] : [];
  });
}

/** the library page — an internal path only */
export function footerLibraryPath(c: FooterConfig = FOOTER_CONFIG): string | null {
  const v = (c.libraryPath ?? "").trim();
  return v.startsWith("/") && !v.startsWith("//") ? v : null;
}
