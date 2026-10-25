"use client";

import React, { useActionState } from "react";
import Link from "next/link";
import { signupAction } from "@/app/auth/actions";
import { Button } from "@/components/ui/legacy/button";
import { Input } from "@/components/ui/legacy/input";
import { Card, CardHeader, CardDescription, CardContent, CardFooter } from "@/components/ui/legacy/card";
import { Alert } from "@/components/ui/legacy/alert";
import { BrandLogo } from "@/components/brand/logo";
import { TurnstileWidget } from "@/components/auth/turnstile-widget";
import type { CaptchaConfig } from "@/lib/auth/captcha";
import { AGE_CHECKBOX_FIELD, AGE_CONFIRM_LABEL } from "@/lib/auth/age-gate";

/**
 * AUTH-1 2a: the sign-up form (rendered by page.tsx only while registration is open). 2b-2: Turnstile when on.
 * AGE-18: with AGE_GATE_ENABLED a required "18 or older" checkbox (never pre-ticked); the server re-checks it.
 */
export function SignupForm({ captcha = null, ageGate = false }: { captcha?: CaptchaConfig; ageGate?: boolean }) {
  const [state, formAction, isPending] = useActionState(signupAction, null);

  return (
    <div className="auth-gradient min-h-[80vh] flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <Card className="glass-light w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-2">
            <BrandLogo variant="icon" size="lg" />
          </div>
          {/* UX-2b.H (H-1): the page's one h1; no unverifiable audience-size claim (#47) */}
          <h1 className="text-h2 font-bold text-fg">Create your free account</h1>
          <CardDescription className="text-body-sm text-fg-secondary">
            Free during early access: mock tests with full answer review and a Mistake Vault for your wrong answers.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {state?.error && (
            <Alert variant="error" data-auth-error={state.code ?? ""}>
              {state.error}
            </Alert>
          )}
          {/* AUTH-1 2a: identical answer for new and existing addresses (no enumeration) */}
          {state?.code === "check-email" ? (
            <Alert variant="info" data-auth-notice="check-email">
              {state.success}
            </Alert>
          ) : (
          <form action={formAction} className="space-y-4">
            <Input
              label="Full Name"
              name="fullName"
              placeholder="Aarav Sharma"
              required
              autoComplete="name"
            />
            <Input
              label="Email Address"
              name="email"
              type="email"
              placeholder="you@example.com"
              required
              autoComplete="email"
            />
            <Input
              label="Password"
              name="password"
              type="password"
              placeholder="At least 8 characters, letters and numbers"
              required
              minLength={8}
              autoComplete="new-password"
            />
            {ageGate && (
              <label className="flex min-h-12 items-start gap-3 text-body-sm text-fg" data-age-confirm="">
                <input type="checkbox" name={AGE_CHECKBOX_FIELD} required className="mt-0.5 size-5 shrink-0 accent-primary-600" />
                <span>{AGE_CONFIRM_LABEL}. Courage Library is for adults only.</span>
              </label>
            )}
            {captcha && <TurnstileWidget siteKey={captcha.siteKey} action="signup" resetKey={state} />}
            <Button
              type="submit"
              variant="default"
              size="lg"
              className="w-full font-semibold shadow-sm"
              isLoading={isPending}
            >
              Sign Up Free
            </Button>
          </form>
          )}
        </CardContent>
        <CardFooter className="justify-center text-xs text-slate-500">
          Already have an account?{" "}
          <Link href="/auth/login" className="ml-1 font-semibold text-blue-600 hover:text-blue-700">
            Sign In
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}