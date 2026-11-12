/**
 * LEGAL-PAGES-1: the two consent lines, word for word as the owner set them, with real links. Usable in server and
 * client components (plain links, no state).
 *   - AuthConsentLine: sign-in and sign-up (incl. Continue with Google), shown before any continue button
 *   - PaymentConsentLine: every pay screen, shown BEFORE the pay button
 */
import type { ReactNode } from "react";
import { TextLink } from "@/components/ui/link";

export const AUTH_CONSENT_TEXT = "By continuing you confirm you are 18 or older and agree to our Terms and Privacy Policy.";
export const PAYMENT_CONSENT_TEXT = "By paying you agree to the Terms, Privacy Policy and Refund Policy.";

export function AuthConsentLine({ className = "" }: { className?: string }) {
  return (
    <p className={`text-body-sm text-fg-secondary ${className}`} data-auth-consent="">
      By continuing you confirm you are 18 or older and agree to our <TextLink href="/terms">Terms</TextLink> and{" "}
      <TextLink href="/privacy">Privacy Policy</TextLink>.
    </p>
  );
}

const PAYMENT_HREFS = { terms: "/terms", privacy: "/privacy", refund: "/refund-policy" };

export function PaymentConsentLine({ className = "", hrefs = PAYMENT_HREFS, children }: { className?: string; hrefs?: { terms: string; privacy: string; refund: string }; children?: ReactNode }) {
  return (
    <p className={`text-body-sm text-fg-secondary ${className}`} data-payment-consent="">
      By paying you agree to the <TextLink href={hrefs.terms}>Terms</TextLink>, <TextLink href={hrefs.privacy}>Privacy Policy</TextLink> and{" "}
      <TextLink href={hrefs.refund}>Refund Policy</TextLink>.{children ? <> {children}</> : null}
    </p>
  );
}
