"use client";

import { useActionState, useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { signupAction } from "@/app/(site)/auth/actions";
import { authNotice } from "@/lib/auth/messages";
import { GoogleSignInButton } from "@/components/auth/google-signin-button";
import { TurnstileWidget } from "@/components/auth/turnstile-widget";
import { useCaptchaGate } from "@/components/auth/use-captcha-gate";
import { AuthAlert, AuthDivider, AuthHeading, AuthInput, AuthNotice, CloudflareLine, PRIMARY_BUTTON_CLASS, SecurityCheckCard, SecurityWaiting } from "@/components/auth/auth-ui";
import { PasswordField } from "@/components/auth/password-field";
import { ConsentCheckbox, CONSENT_ERROR } from "@/components/auth/consent-checkbox";
import { errorSlot } from "@/components/auth/auth-errors";
import type { CaptchaConfig } from "@/lib/auth/captcha";
import type { AuthGoogleConfig } from "@/lib/auth/google-config";
import type { AuthPreview } from "@/app/(site)/auth/login/login-form";

/**
 * AUTH-UX-1 (spec §4) — Create account. The FIRST element is the one consent ("I agree to the Terms and Privacy
 * Policy, and confirm I'm eligible to create an account." — AGE_CONFIRM_LABEL, field ageConfirmed). It gates BOTH
 * "Sign up with Google" and the email form: unticked → an inline error on the box, focus on it, nothing is sent (the
 * Google flow never starts). Ticked → the email form sends ageConfirmed=on and Google sends ageConfirmed === true —
 * the server's enforcement and recording are unchanged (AGE-18 / AUTH-HARDEN-1). Fields: Full name, Email, Password
 * (eye toggle, 4-step strength, the real rule as hint). AUTH-1 2a: identical answer for new and existing addresses.
 */
export function SignupForm({ captcha = null, google = null, preview }: { captcha?: CaptchaConfig; google?: AuthGoogleConfig; preview?: AuthPreview & { consentError?: boolean } }) {
  const [actionState, formAction, isPending] = useActionState(signupAction, null);
  const state = preview?.state ?? actionState;
  const gate = useCaptchaGate(!!captcha);
  const phase = preview?.security ?? gate.phase;
  const searchParams = useSearchParams();
  const m = searchParams.get("m");
  const notice = authNotice(m);
  const next = (searchParams.get("next") ?? "").slice(0, 1024);

  const consentRef = useRef<HTMLInputElement>(null);
  const [ticked, setTicked] = useState(false);
  const [consentError, setConsentError] = useState(preview?.consentError === true);
  const blockConsent = useCallback(() => {
    setConsentError(true);
    consentRef.current?.focus();
  }, []);
  const isTicked = useCallback(() => consentRef.current?.checked === true, []);

  const slot = state?.error ? errorSlot(state.code) : null;
  const noticeSlot = notice && notice.tone === "error" ? errorSlot(m) : null;
  const showSecurityCard = phase === "failed" || slot === "captcha" || (!state?.error && noticeSlot === "captcha");
  // SEC1D fix: the server-returned captcha code rides on the card (never a client-only failure)
  const securityCode = slot === "captcha" ? state?.code : !state?.error && noticeSlot === "captcha" ? (m ?? undefined) : undefined;
  const emailRef = useRef<HTMLInputElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!state?.error) return;
    if (slot === "consent") consentRef.current?.focus();
    else if (slot === "email") emailRef.current?.focus();
    else if (slot === "form") alertRef.current?.focus();
  }, [state, slot]);

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    // the consent comes first: unticked → nothing is sent
    if (!isTicked()) {
      e.preventDefault();
      blockConsent();
      return;
    }
    gate.guard(e);
  };

  if (state?.code === "check-email") {
    return (
      <>
        <AuthHeading title="Check your email" sub="One more step to finish creating your account." />
        <p role="status" className="rounded-xl bg-cl-cloud px-4 py-3.5 text-body text-cl-charcoal" data-auth-notice="check-email">
          {state.success}
        </p>
        <p className="text-center text-body-sm text-cl-slate">
          Already confirmed?{" "}
          <Link href="/auth/login" className="focus-ring inline-flex min-h-12 items-center font-semibold text-cl-blue-text underline-offset-2 hover:underline">
            Sign in
          </Link>
        </p>
      </>
    );
  }

  const consentMessage = consentError || slot === "consent" ? CONSENT_ERROR : null;
  return (
    <>
      <AuthHeading title="Create your free account" sub="Takes less than a minute." />
      {notice && !state?.error && notice.tone !== "error" && <AuthNotice text={notice.text} code={m ?? undefined} />}
      {notice && !state?.error && notice.tone === "error" && noticeSlot !== "captcha" && noticeSlot !== "consent" && (
        <AuthAlert id="signup-notice" code={m ?? ""}>
          {notice.text}
        </AuthAlert>
      )}
      <ConsentCheckbox
        ref={consentRef}
        id="signup-consent"
        error={consentMessage ?? (noticeSlot === "consent" && !state?.error ? CONSENT_ERROR : null)}
        onChange={(c) => {
          setTicked(c);
          if (c) setConsentError(false);
        }}
        form="signup-form"
      />
      {google && (
        <>
          <GoogleSignInButton
            clientId={google.clientId}
            nonceHash={google.nonceHash}
            next={next}
            getCaptchaToken={captcha ? gate.getToken : undefined}
            surface="signup"
            consent={{ ticked, isTicked, onBlocked: blockConsent }}
          />
          <AuthDivider label="or with email" />
        </>
      )}
      <form id="signup-form" action={formAction} onSubmit={onSubmit} className="flex flex-col gap-4" data-auth-form="signup">
        {next && <input type="hidden" name="next" value={next} />}
        <AuthInput id="signup-name" label="Full name" name="fullName" autoComplete="name" required />
        <AuthInput ref={emailRef} id="signup-email" label="Email" name="email" type="email" inputMode="email" autoComplete="email" required error={slot === "email" ? state?.error : null} />
        <PasswordField id="signup-password" name="password" label="Password" autoComplete="new-password" withStrength error={slot === "password" ? state?.error : null} />
        {slot === "form" && (
          <AuthAlert ref={alertRef} id="signup-error" code={state?.code ?? ""}>
            {state?.error}
          </AuthAlert>
        )}
        <button type="submit" className={PRIMARY_BUTTON_CLASS} aria-busy={isPending} data-auth-submit="">
          {isPending ? "Creating your account…" : "Create account"}
        </button>
        {phase === "waiting" && <SecurityWaiting />}
        {showSecurityCard && <SecurityCheckCard onRetry={gate.retry} code={securityCode} />}
        {captcha && <TurnstileWidget siteKey={captcha.siteKey} action="signup" resetKey={state} onToken={gate.onToken} onStatus={gate.onStatus} resetRef={gate.resetRef} />}
        {captcha && <CloudflareLine />}
      </form>
      <p className="flex flex-wrap items-center justify-center gap-x-1 text-body-sm text-cl-slate">
        Already have an account?
        <Link href="/auth/login" className="focus-ring inline-flex min-h-12 items-center font-semibold text-cl-blue-text underline-offset-2 hover:underline">
          Sign in
        </Link>
      </p>
    </>
  );
}
