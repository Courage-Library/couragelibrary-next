import { Suspense } from "react";
import Link from "next/link";
import { getSignupAvailability } from "@/lib/auth/signup-availability";
import { SignupForm } from "./signup-form";
import { isCaptchaEnabled, turnstileSiteKey } from "@/lib/auth/captcha";
import { googleConfig } from "@/lib/auth/google-config";
import { paywallSwitchForDisplay } from "@/lib/access/policy";
import { AuthShell } from "@/components/auth/auth-shell";
import { AuthHeading, PRIMARY_BUTTON_CLASS } from "@/components/auth/auth-ui";

export const dynamic = "force-dynamic";

/**
 * AUTH-1 Stage 2a (decision #60.2): while public registration is off (the Supabase project's "Allow new users to sign
 * up" setting, or AUTH_SIGNUP_ENABLED=false), the page says so honestly and shows no form. The form and the
 * server action keep working for when registration is re-opened.
 * AUTH-1 2b-2: when the form is shown and the Turnstile flag is on, the public site key is passed to it.
 * AUTH-UX-1 (owner decision 1): "Sign up with Google" here too — the same button, action and nonce (the middleware mints
 * it for this page as well); the consent box gates it. Inside THE auth layout.
 */
export default async function SignupPage() {
  const [availability, paywall] = await Promise.all([getSignupAvailability(), paywallSwitchForDisplay()]);
  const earlyAccess = paywall === "off";
  if (availability !== "closed") {
    const google = await googleConfig();
    return (
      <AuthShell earlyAccess={earlyAccess}>
        <Suspense fallback={null}>
          <SignupForm captcha={isCaptchaEnabled() ? { siteKey: turnstileSiteKey() as string } : null} google={google} />
        </Suspense>
      </AuthShell>
    );
  }

  return (
    <AuthShell earlyAccess={earlyAccess}>
      <div className="flex flex-col gap-5" data-signup-closed="">
        <AuthHeading title="Registrations open soon" sub="We aren't taking new accounts yet. If you already have an account, you can sign in." />
        <Link href="/auth/login" className={PRIMARY_BUTTON_CLASS}>
          Sign in
        </Link>
        <Link href="/" className="focus-ring inline-flex min-h-12 items-center justify-center text-body-sm font-semibold text-cl-blue-text underline underline-offset-2">
          Back to the home page
        </Link>
      </div>
    </AuthShell>
  );
}
