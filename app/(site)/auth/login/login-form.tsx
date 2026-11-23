"use client";

import { useActionState, useEffect, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { loginAction, type AuthState } from "@/app/(site)/auth/actions";
import { authNotice } from "@/lib/auth/messages";
import { GoogleSignInButton } from "@/components/auth/google-signin-button";
import { TurnstileWidget } from "@/components/auth/turnstile-widget";
import { useCaptchaGate } from "@/components/auth/use-captcha-gate";
import { AuthAlert, AuthDivider, AuthHeading, AuthInput, AuthNotice, CloudflareLine, PRIMARY_BUTTON_CLASS, SecurityCheckCard, SecurityWaiting } from "@/components/auth/auth-ui";
import { PasswordField } from "@/components/auth/password-field";
import { errorSlot } from "@/components/auth/auth-errors";
import type { CaptchaConfig } from "@/lib/auth/captcha";
import type { AuthGoogleConfig } from "@/lib/auth/google-config";

/** AUTH-1 2b-1: Google config from the server page — null when the flag is off (then nothing Google is rendered). */
export type LoginGoogleConfig = AuthGoogleConfig;

/** fixture builds only (app/(auth-fixture)): a fixed result / security phase to render the error states without a sign-in */
export type AuthPreview = { state?: AuthState; security?: "waiting" | "failed" };

/**
 * AUTH-UX-1 (spec §3) — sign in. Order: Google → "or sign in with email" → Email → Password (Forgot password? on its label
 * row, eye toggle) → Sign in → the security check slot (Turnstile interaction-only, below the button) → "Protected by
 * Cloudflare" → "New here? Create a free account". NO consent box and no age sentence here: a NEW Google account is
 * refused by the server (unchanged) and sent to Create account. Credential errors are form-level and reveal nothing;
 * focus moves to the first error. Notices from ?m= come only through the allow-list (lib/auth/messages.ts).
 * Kept from UX-IMP-1 / AUTH-1: one h1; field names email / password / next; the sign-up link follows the GLOBAL
 * sign-up setting (closed → "Explore exams", never a link to a closed sign-up).
 */
export function LoginForm({ google, captcha = null, signupOpen = false, preview }: { google: LoginGoogleConfig; captcha?: CaptchaConfig; signupOpen?: boolean; preview?: AuthPreview }) {
  const [actionState, formAction, isPending] = useActionState(loginAction, null);
  const state = preview?.state ?? actionState;
  const gate = useCaptchaGate(!!captcha);
  const phase = preview?.security ?? gate.phase;
  const searchParams = useSearchParams();
  // AUTH-1 2a: messages from the URL only via an allow-listed code (?m=CODE); anything else is ignored
  const m = searchParams.get("m");
  const notice = authNotice(m);
  // SEC-1D: carried as-is to loginAction, which sanitizes it server-side (hostile → "/")
  const next = (searchParams.get("next") ?? "").slice(0, 1024);

  const slot = state?.error ? errorSlot(state.code) : null;
  const noticeSlot = notice && notice.tone === "error" ? errorSlot(m) : null;
  const showSecurityCard = phase === "failed" || slot === "captcha" || (!state?.error && noticeSlot === "captcha");
  // SEC1D fix: the server-returned captcha code rides on the card (never a client-only failure)
  const securityCode = slot === "captcha" ? state?.code : !state?.error && noticeSlot === "captcha" ? (m ?? undefined) : undefined;
  const emailRef = useRef<HTMLInputElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!state?.error) return;
    if (slot === "email") emailRef.current?.focus();
    else if (slot === "form") alertRef.current?.focus();
  }, [state, slot]);

  return (
    <>
      <AuthHeading title="Welcome back" sub="Sign in to continue your preparation." />
      {notice && !state?.error && notice.tone !== "error" && <AuthNotice text={notice.text} code={m ?? undefined} />}
      {notice && !state?.error && notice.tone === "error" && noticeSlot !== "captcha" && (
        <AuthAlert id="login-notice" code={m ?? ""}>
          {notice.text}
        </AuthAlert>
      )}
      {google && (
        <>
          <GoogleSignInButton clientId={google.clientId} nonceHash={google.nonceHash} next={next} getCaptchaToken={captcha ? gate.getToken : undefined} surface="login" />
          <AuthDivider label="or sign in with email" />
        </>
      )}
      <form action={formAction} onSubmit={(e) => gate.guard(e)} className="flex flex-col gap-4" data-auth-form="login">
        {next && <input type="hidden" name="next" value={next} />}
        <AuthInput ref={emailRef} id="login-email" label="Email" name="email" type="email" inputMode="email" autoComplete="email" required error={slot === "email" ? state?.error : null} />
        <PasswordField
          id="login-password"
          name="password"
          label="Password"
          autoComplete="current-password"
          aside={
            <Link href="/auth/forgot-password" className="focus-ring inline-flex min-h-12 items-center -my-3.5 text-body-sm font-semibold text-cl-blue-text underline-offset-2 hover:underline" data-forgot-link="">
              Forgot password?
            </Link>
          }
        />
        {slot === "form" && (
          <AuthAlert ref={alertRef} id="login-error" code={state?.code ?? ""}>
            {state?.error}
          </AuthAlert>
        )}
        <button type="submit" className={PRIMARY_BUTTON_CLASS} aria-busy={isPending} data-auth-submit="">
          {isPending ? "Signing in…" : "Sign in"}
        </button>
        {phase === "waiting" && <SecurityWaiting />}
        {showSecurityCard && <SecurityCheckCard onRetry={gate.retry} code={securityCode} />}
        {captcha && <TurnstileWidget siteKey={captcha.siteKey} action="login" resetKey={state} onToken={gate.onToken} onStatus={gate.onStatus} resetRef={gate.resetRef} />}
        {captcha && <CloudflareLine />}
      </form>
      <p className="flex flex-wrap items-center justify-center gap-x-1 text-body-sm text-cl-slate" data-signup-link={signupOpen ? "open" : "closed"}>
        {signupOpen ? (
          <>
            New here?
            <Link href="/auth/signup" className="focus-ring inline-flex min-h-12 items-center font-semibold text-cl-blue-text underline-offset-2 hover:underline">
              Create a free account
            </Link>
          </>
        ) : (
          <>
            New accounts open soon.
            <Link href="/exams" className="focus-ring inline-flex min-h-12 items-center font-semibold text-cl-blue-text underline-offset-2 hover:underline">
              Explore exams
            </Link>
          </>
        )}
      </p>
    </>
  );
}
