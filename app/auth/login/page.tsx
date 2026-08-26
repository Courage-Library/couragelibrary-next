"use client";

import React, { useActionState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { loginAction } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { BrandLogo } from "@/components/brand/logo";

function LoginForm() {
  const [state, formAction, isPending] = useActionState(loginAction, null);
  const searchParams = useSearchParams();
  const queryMessage = searchParams.get("message");
  const queryError = searchParams.get("error");

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
        {queryMessage && (
          <Alert variant="success">
            {queryMessage}
          </Alert>
        )}
        {(state?.error || queryError) && (
          <Alert variant="error">
            {state?.error || queryError}
          </Alert>
        )}
        <form action={formAction} className="space-y-4">
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

export default function LoginPage() {
  return (
    <div className="min-h-[80vh] flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <Suspense fallback={<div className="text-xs text-slate-400">Loading sign in...</div>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}