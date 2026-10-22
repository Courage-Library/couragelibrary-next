"use client";

import React, { useActionState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { loginAction } from "@/app/auth/actions";
import { authNotice } from "@/lib/auth/messages";
import { Button } from "@/components/ui/legacy/button";
import { Input } from "@/components/ui/legacy/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/legacy/card";
import { Alert } from "@/components/ui/legacy/alert";
import { BrandLogo } from "@/components/brand/logo";
import { GoogleSignInButton } from "@/components/auth/google-signin-button";

/** AUTH-1 2b-1: Google config from the server page — null when the flag is off (then nothing Google is rendered). */
export type LoginGoogleConfig = { clientId: string; nonceHash: string } | null;

export function LoginForm({ google }: { google: LoginGoogleConfig }) {
  const [state, formAction, isPending] = useActionState(loginAction, null);
  const searchParams = useSearchParams();
  // AUTH-1 2a: messages from the URL only via an allow-listed code (?m=CODE); unknown codes and any other
  // query text (?error=, ?message=) are ignored, so nobody can put their own words on this page.
  const notice = authNotice(searchParams.get("m"));
  // SEC-1D: carried as-is to loginAction, which sanitizes it server-side (hostile → "/").
  const next = (searchParams.get("next") ?? "").slice(0, 1024);

  return (
    <Card className="w-full max-w-md border-slate-200/80 shadow-lg">
      <CardHeader className="space-y-1 text-center">
        <div className="flex justify-center mb-2">
          <BrandLogo variant="icon" size="lg" />
        </div>
        <CardTitle className="text-2xl font-extrabold text-slate-900 tracking-tight">
          Welcome back
        </CardTitle>
        <CardDescription className="text-sm text-slate-500">
          Sign in to access your tests, notes, and study plans
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {notice && !state?.error && (
          <Alert variant={notice.tone} data-auth-notice="">
            {notice.text}
          </Alert>
        )}
        {state?.error && (
          <Alert variant="error" data-auth-error={state.code ?? ""}>
            {state.error}
          </Alert>
        )}
        {google && (
          <>
            <GoogleSignInButton clientId={google.clientId} nonceHash={google.nonceHash} next={next} />
            <div className="flex items-center gap-3 text-body-sm text-fg-secondary" aria-hidden="true">
              <span className="h-px flex-1 bg-line" />
              or
              <span className="h-px flex-1 bg-line" />
            </div>
          </>
        )}
        <form action={formAction} className="space-y-4">
          {next && <input type="hidden" name="next" value={next} />}
          <Input
            label="Email Address"
            name="email"
            type="email"
            placeholder="you@example.com"
            required
            autoComplete="email"
          />
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-slate-700">Password</label>
              <Link
                href="/auth/forgot-password"
                className="text-xs font-medium text-blue-600 hover:text-blue-700"
              >
                Forgot password?
              </Link>
            </div>
            <Input
              name="password"
              type="password"
              placeholder="••••••••"
              required
              autoComplete="current-password"
            />
          </div>
          <Button
            type="submit"
            variant="default"
            size="lg"
            className="w-full font-semibold shadow-sm"
            isLoading={isPending}
          >
            Sign In
          </Button>
        </form>
      </CardContent>
      <CardFooter className="justify-center text-xs text-slate-500">
        Don&apos;t have an account?{" "}
        <Link href="/auth/signup" className="ml-1 font-semibold text-blue-600 hover:text-blue-700">
          Create an account
        </Link>
      </CardFooter>
    </Card>
  );
}
