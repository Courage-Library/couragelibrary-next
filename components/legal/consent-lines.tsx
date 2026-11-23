/**
 * LEGAL-PAGES-1: the pay-screen consent line, word for word as the owner set it, with real links. Usable in server and
 * client components (plain links, no state).
 *   - PaymentConsentLine: every pay screen, shown BEFORE the pay button
 * AUTH-UX-1 (owner, 24 Nov 2026): the sign-in / sign-up consent line ("By continuing you confirm you are 18 or older …")
 * is retired — sign-in shows no consent; Create account (and /confirm-age) has THE consent box instead
 * (components/auth/consent-checkbox.tsx, no age number; the rule lives in the Terms §1.1).
 */
import type { ReactNode } from "react";
import { TextLink } from "@/components/ui/link";

export const PAYMENT_CONSENT_TEXT = "By paying you agree to the Terms, Privacy Policy and Refund Policy.";

const PAYMENT_HREFS = { terms: "/terms", privacy: "/privacy", refund: "/refund-policy" };

export function PaymentConsentLine({ className = "", hrefs = PAYMENT_HREFS, children }: { className?: string; hrefs?: { terms: string; privacy: string; refund: string }; children?: ReactNode }) {
  return (
    <p className={`text-body-sm text-fg-secondary ${className}`} data-payment-consent="">
      By paying you agree to the <TextLink href={hrefs.terms}>Terms</TextLink>, <TextLink href={hrefs.privacy}>Privacy Policy</TextLink> and{" "}
      <TextLink href={hrefs.refund}>Refund Policy</TextLink>.{children ? <> {children}</> : null}
    </p>
  );
}
