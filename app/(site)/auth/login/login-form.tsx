"use client";

import React, { useActionState, useCallback, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { loginAction } from "@/app/(site)/auth/actions";
import { authNotice } from "@/lib/auth/messages";
import { Button } from "@/components/ui/legacy/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardDescription, CardContent, CardFooter } from "@/components/ui/legacy/card";
import { Alert } from "@/components/ui/alert";
import { BrandLogo } from "@/components/brand/logo";
import { GoogleSignInButton } from "@/components/auth/google-signin-button";
import { AuthConsentLine } from "@/components/legal/consent-lines";
import { TurnstileWidget } from "@/components/auth/turnstile-widget";
import type { CaptchaConfig } from "@/lib/auth/captcha";

/** AUTH-1 2b-1: Google config from the server page — null when the flag is off (then nothing Google is rendered). */
export type LoginGoogleConfig = { clientId: string; nonceHash: string } | null;

/**
 * UX-IMP-1 (IMPECCABLE-1 A-1, A-2, A-12): one h1; every field labelled through <Field> (label ↔ input by id); 48 px
 * fields and links (R10); errors announced (role="alert"); the sign-up link follows the GLOBAL sign-up setting — while
 * sign-up is closed there is no link to it (UX-FIX-1), only "Explore exams".
 */
export function LoginForm({ google, captcha = null, signupOpen = false, googleAgeGate = false }: { google: LoginGoogleConfig; captcha?: CaptchaConfig; signupOpen?: boolean; googleAgeGate?: boolean }) {
  const [state, formAction, isPending] = useActionState(loginAction, null);
  // 2b-2: one widget for the whole page; the Google button reads the current token when its callback fires
  const captchaToken = useRef<string | null>(null);
  const onCaptchaToken = useCallback((t: string | null) => {
    captchaToken.current = t;
  }, []);
  const getCaptchaToken = useCallback(() => captchaToken.current ?? undefined, []);
  const searchParams = useSearchParams();
  // AUTH-1 2a: messages from the URL only via an allow-listed code (?m=CODE); unknown codes and any other
  // query text (?error=, ?message=) are ignored, so nobody can put their own words on this page.
  const notice = authNotice(searchParams.get("m"));
  // SEC-1D: carried as-is to loginAction, which sanitizes it server-side (hostile → "/").
  const next = (searchParams.get("next") ?? "").slice(0, 1024);

  return (
    <Card className="glass-light w-full max-w-md">
      <CardHeader className="space-y-1 text-center">
        <div className="flex justify-center mb-2">
          <BrandLogo variant="icon" size="lg" />
        </div>
        <h1 className="text-2xl font-extrabold tracking-tight text-fg">Welcome back</h1>
        <CardDescription className="text-sm text-slate-500">
          Sign in to access your tests, notes, and study plans
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {notice && !state?.error && (
          <Alert tone={notice.tone === "error" ? "danger" : notice.tone} live data-auth-notice="">
            {notice.text}
          </Alert>
        )}
        {state?.error && (
          <Alert tone="danger" live data-auth-error={state.code ?? ""}>
            {state.error}
          </Alert>
        )}
        {/* LEGAL-PAGES-1: before any continue button (Google or email) */}
        <AuthConsentLine />
        {google && (
          <>
            <GoogleSignInButton
              clientId={google.clientId}
              nonceHash={google.nonceHash}
              next={next}
              getCaptchaToken={captcha ? getCaptchaToken : undefined}
              ageGate={googleAgeGate}
            />
            <div className="flex items-center gap-3 text-body-sm text-fg-secondary" aria-hidden="true">
              <span className="h-px flex-1 bg-line" />
              or
              <span className="h-px flex-1 bg-line" />
            </div>
          </>
        )}
        <form action={formAction} className="space-y-4">
          {next && <input type="hidden" name="next" value={next} />}
          <Field id="login-email" label="Email address" required>
            <Input name="email" type="email" placeholder="you@example.com" autoComplete="email" className="h-12" />
          </Field>
          <Field id="login-password" label="Password" required>
            <Input name="password" type="password" autoComplete="current-password" className="h-12" />
          </Field>
          <div className="-mt-2 flex justify-end">
            <Link href="/auth/forgot-password" className="focus-ring inline-flex min-h-12 items-center text-body-sm font-medium text-link underline-offset-2 hover:underline">
              Forgot password?
            </Link>
          </div>
          {captcha && <TurnstileWidget siteKey={captcha.siteKey} action="login" resetKey={state} onToken={onCaptchaToken} />}
          <Button
            type="submit"
            variant="default"
            size="lg"
            className="w-full font-semibold shadow-sm"
            isLoading={isPending}
          >
            Sign in
          </Button>
        </form>
      </CardContent>
      <CardFooter className="flex-wrap justify-center gap-x-1 text-body-sm text-fg-secondary" data-signup-link={signupOpen ? "open" : "closed"}>
        {signupOpen ? (
          <>
            Don&apos;t have an account?
            <Link href="/auth/signup" className="focus-ring inline-flex min-h-12 items-center font-semibold text-link underline-offset-2 hover:underline">
              Create an account
            </Link>
          </>
        ) : (
          <>
            New accounts open soon.
            <Link href="/exams" className="focus-ring inline-flex min-h-12 items-center font-semibold text-link underline-offset-2 hover:underline">
              Explore exams
            </Link>
          </>
        )}
      </CardFooter>
    </Card>
  );
}
