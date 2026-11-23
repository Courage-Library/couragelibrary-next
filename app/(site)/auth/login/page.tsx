import { Suspense } from "react";
import { LoginForm } from "./login-form";
import { googleConfig } from "@/lib/auth/google-config";
import { isCaptchaEnabled, turnstileSiteKey } from "@/lib/auth/captcha";
import { getSignupAvailability } from "@/lib/auth/signup-availability";
import { paywallSwitchForDisplay } from "@/lib/access/policy";
import { AuthShell } from "@/components/auth/auth-shell";

/**
 * Sign-in page. AUTH-1 2b-1 (decision #66): when the server-evaluated Google flag is on, the middleware has minted a
 * nonce for this request (httpOnly cookie, forwarded on the request); this page passes ONLY its SHA-256 hash and the
 * public client id to the client. Flag off (default) → no Google config, so no script, no button, no Google request.
 * AUTH-1 2b-2: the Turnstile flag is evaluated here too; ON → the public site key is passed and ONE widget serves both
 * the email form and the Google button. OFF → null: no Turnstile script, widget or request.
 * AUTH-UX-1: inside THE auth layout; no consent box on sign-in (owner decision 1 — a new Google account goes to Create
 * account). "Free during early access." only while the paywall switch is known to be off (bounded, display only).
 */
export const dynamic = "force-dynamic";

/**
 * UX-IMP-1 (IMPECCABLE-1 A-2): the sign-up link follows the GLOBAL sign-up setting. Bounded (1.5 s) and never rejecting:
 * a slow or failed read shows the CLOSED view — never a link to a closed sign-up, never a hung sign-in page (AUTH-1).
 */
function signupOpen(): Promise<boolean> {
  return Promise.race([
    getSignupAvailability().then((a) => a !== "closed", () => false),
    new Promise<boolean>((ok) => setTimeout(() => ok(false), 1500)),
  ]);
}

export default async function LoginPage() {
  const [google, open, paywall] = await Promise.all([googleConfig(), signupOpen(), paywallSwitchForDisplay()]);
  const captcha = isCaptchaEnabled() ? { siteKey: turnstileSiteKey() as string } : null;
  return (
    <AuthShell earlyAccess={paywall === "off"}>
      <Suspense fallback={null}>
        <LoginForm google={google} captcha={captcha} signupOpen={open} />
      </Suspense>
    </AuthShell>
  );
}
