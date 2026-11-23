import { ForgotPasswordForm } from "./forgot-password-form";
import { isCaptchaEnabled, turnstileSiteKey } from "@/lib/auth/captcha";
import { paywallSwitchForDisplay } from "@/lib/access/policy";
import { AuthShell } from "@/components/auth/auth-shell";

/**
 * Password-reset request page. AUTH-1 2b-2: a server page so the Turnstile flag is evaluated on the server; flag on →
 * the public site key goes to the form (widget + token), flag off → no Turnstile script, widget or request.
 * AUTH-UX-1: inside THE auth layout.
 */
export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage() {
  const paywall = await paywallSwitchForDisplay();
  return (
    <AuthShell earlyAccess={paywall === "off"}>
      <ForgotPasswordForm captcha={isCaptchaEnabled() ? { siteKey: turnstileSiteKey() as string } : null} />
    </AuthShell>
  );
}
