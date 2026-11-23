"use client";

import { useActionState, useEffect, useRef } from "react";
import Link from "next/link";
import { forgotPasswordAction } from "@/app/(site)/auth/actions";
import { TurnstileWidget } from "@/components/auth/turnstile-widget";
import { useCaptchaGate } from "@/components/auth/use-captcha-gate";
import { AuthAlert, AuthHeading, AuthInput, CloudflareLine, PRIMARY_BUTTON_CLASS, SecurityCheckCard, SecurityWaiting } from "@/components/auth/auth-ui";
import { errorSlot } from "@/components/auth/auth-errors";
import type { CaptchaConfig } from "@/lib/auth/captcha";
import type { AuthPreview } from "@/app/(site)/auth/login/login-form";

/** AUTH-UX-1 (spec §5): never reveals whether the address has an account (the action already answers success-shaped) */
export const RESET_SENT_TEXT = "If an account exists for this email, we've sent a reset link.";

/** The reset-request form (client). AUTH-1 2b-2: page.tsx evaluates the Turnstile flag and passes the site key. */
export function ForgotPasswordForm({ captcha = null, preview }: { captcha?: CaptchaConfig; preview?: AuthPreview }) {
  const [actionState, formAction, isPending] = useActionState(forgotPasswordAction, null);
  const state = preview?.state ?? actionState;
  const gate = useCaptchaGate(!!captcha);
  const phase = preview?.security ?? gate.phase;
  const slot = state?.error ? errorSlot(state.code) : null;
  const emailRef = useRef<HTMLInputElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!state?.error) return;
    if (slot === "email") emailRef.current?.focus();
    else if (slot === "form") alertRef.current?.focus();
  }, [state, slot]);

  return (
    <>
      <AuthHeading title="Forgot your password?" sub="Enter your email and we'll send you a reset link." />
      {state?.code === "check-email" ? (
        <p role="status" className="rounded-xl bg-cl-cloud px-4 py-3.5 text-body text-cl-charcoal" data-auth-notice="reset-sent">
          {RESET_SENT_TEXT}
        </p>
      ) : (
        <form action={formAction} onSubmit={(e) => gate.guard(e)} className="flex flex-col gap-4" data-auth-form="forgot">
          <AuthInput ref={emailRef} id="forgot-email" label="Email" name="email" type="email" inputMode="email" autoComplete="email" required error={slot === "email" ? state?.error : null} />
          {slot === "form" && (
            <AuthAlert ref={alertRef} id="forgot-error" code={state?.code ?? ""}>
              {state?.error}
            </AuthAlert>
          )}
          <button type="submit" className={PRIMARY_BUTTON_CLASS} aria-busy={isPending} data-auth-submit="">
            {isPending ? "Sending…" : "Send reset link"}
          </button>
          {phase === "waiting" && <SecurityWaiting />}
          {(phase === "failed" || slot === "captcha") && <SecurityCheckCard onRetry={gate.retry} code={slot === "captcha" ? state?.code : undefined} />}
          {captcha && <TurnstileWidget siteKey={captcha.siteKey} action="forgot-password" resetKey={state} onToken={gate.onToken} onStatus={gate.onStatus} resetRef={gate.resetRef} />}
          {captcha && <CloudflareLine />}
        </form>
      )}
      <p className="flex flex-wrap items-center justify-center gap-x-1 text-body-sm text-cl-slate">
        Remembered it?
        <Link href="/auth/login" className="focus-ring inline-flex min-h-12 items-center font-semibold text-cl-blue-text underline-offset-2 hover:underline">
          Back to sign in
        </Link>
      </p>
    </>
  );
}
