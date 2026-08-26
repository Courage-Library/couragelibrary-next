"use client";

import React, { useActionState } from "react";
import Link from "next/link";
import { forgotPasswordAction } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";

export default function ForgotPasswordPage() {
  const [state, formAction, isPending] = useActionState(forgotPasswordAction, null);

  return (
    <div className="min-h-[80vh] flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <Card className="w-full max-w-md border-slate-200/80 shadow-lg">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Reset Password
          </CardTitle>
          <CardDescription className="text-sm text-slate-500">
            Enter your email and we will send you a reset link
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {state?.error && (
            <Alert variant="error">
              {state.error}
            </Alert>
          )}
          {state?.success && (
            <Alert variant="success">
              {state.success}
            </Alert>
          )}
          <form action={formAction} className="space-y-4">
            <Input
              label="Email Address"
              name="email"
              type="email"
              placeholder="you@example.com"
              required
            />
            <Button
              type="submit"
              variant="default"
              size="lg"
              className="w-full font-semibold shadow-sm"
              isLoading={isPending}
            >
              Send Reset Link
            </Button>
          </form>
        </CardContent>
        <CardFooter className="justify-center text-xs text-slate-500">
          Remember your password?{" "}
          <Link href="/auth/login" className="ml-1 font-semibold text-blue-600 hover:text-blue-700">
            Back to Sign In
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}