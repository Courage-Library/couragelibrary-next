import { Suspense } from "react";
import { LoginForm, type LoginGoogleConfig } from "./login-form";
import { googleClientId, isGoogleSignInEnabled } from "@/lib/auth/google-flag";
import { nonceHashForRender } from "@/lib/auth/google-nonce";
import { isCaptchaEnabled, turnstileSiteKey } from "@/lib/auth/captcha";

/**
 * Sign-in page. AUTH-1 2b-1 (decision #66): when the server-evaluated Google flag is on, the middleware has minted a
 * nonce for this request (httpOnly cookie, forwarded on the request); this page passes ONLY its SHA-256 hash and the
 * public client id to the client. Flag off (default) → no Google config, so no script, no button, no Google request.
 * AUTH-1 2b-2: the Turnstile flag is evaluated here too; ON → the public site key is passed and ONE widget serves both
 * the email form and the Google button. OFF → null: no Turnstile script, widget or request.
 */
export const dynamic = "force-dynamic";

async function googleConfig(): Promise<LoginGoogleConfig> {
  if (!isGoogleSignInEnabled()) return null;
  const clientId = googleClientId();
  const nonceHash = await nonceHashForRender();
  return clientId && nonceHash ? { clientId, nonceHash } : null;
}

export default async function LoginPage() {
  const google = await googleConfig();
  const captcha = isCaptchaEnabled() ? { siteKey: turnstileSiteKey() as string } : null;
  return (
    <div className="auth-gradient min-h-[80vh] flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <Suspense fallback={<div className="text-xs text-slate-400">Loading sign in...</div>}>
        <LoginForm google={google} captcha={captcha} />
      </Suspense>
    </div>
  );
}
