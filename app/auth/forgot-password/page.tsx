import { ForgotPasswordForm } from "./forgot-password-form";
import { isCaptchaEnabled, turnstileSiteKey } from "@/lib/auth/captcha";

/**
 * Password-reset request page. AUTH-1 2b-2: a server page so the Turnstile flag is evaluated on the server; flag on →
 * the public site key goes to the form (widget + token), flag off → no Turnstile script, widget or request.
 */
export const dynamic = "force-dynamic";

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm captcha={isCaptchaEnabled() ? { siteKey: turnstileSiteKey() as string } : null} />;
}
