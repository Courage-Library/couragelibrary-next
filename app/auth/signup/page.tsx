"use client";

import React, { useActionState } from "react";
import Link from "next/link";
import { signupAction } from "@/app/auth/actions";
import { Button } from "@/components/ui/legacy/button";
import { Input } from "@/components/ui/legacy/input";
import { Card, CardHeader, CardDescription, CardContent, CardFooter } from "@/components/ui/legacy/card";
import { Alert } from "@/components/ui/legacy/alert";
import { BrandLogo } from "@/components/brand/logo";

export default function SignupPage() {
  const [state, formAction, isPending] = useActionState(signupAction, null);

  return (
    <div className="min-h-[80vh] flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <Card className="w-full max-w-md border-slate-200/80 shadow-lg">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-2">
            <BrandLogo variant="icon" size="lg" />
          </div>
          {/* UX-2b.H (H-1): the page's one h1; no unverifiable "thousands of aspirants" claim (#47) */}
          <h1 className="text-h2 font-bold text-fg">Create your free account</h1>
          <CardDescription className="text-body-sm text-fg-secondary">
            Free during early access: mock tests with full answer review and a Mistake Vault for your wrong answers.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {state?.error && (
            <Alert variant="error">
              {state.error}
            </Alert>
          )}
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
              placeholder="At least 8 characters"
              required
              autoComplete="new-password"
            />
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