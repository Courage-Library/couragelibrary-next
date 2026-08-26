"use client";

import React, { useActionState } from "react";
import Link from "next/link";
import { signupAction } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
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
          <CardTitle className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Create an account
          </CardTitle>
          <CardDescription className="text-sm text-slate-500">
            Join thousands of aspirants preparing for competitive exams
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