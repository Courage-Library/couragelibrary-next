"use client";

import React, { useActionState } from "react";
import Link from "next/link";
import { updatePasswordAction } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { KeyRound } from "lucide-react";

export default function UpdatePasswordPage() {
  const [state, formAction, isPending] = useActionState(updatePasswordAction, null);

  return (
    <div className="min-h-[80vh] flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <Card className="w-full max-w-md border-slate-200/80 shadow-lg">
        <CardHeader className="space-y-1 text-center">
          <div className="w-12 h-12 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center mx-auto mb-2">
            <KeyRound className="w-6 h-6" />
          </div>
          <CardTitle className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Set New Password
          </CardTitle>
          <CardDescription className="text-sm text-slate-500">
            Please enter your new password to complete the reset process
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
              label="New Password"
              name="password"
              type="password"
              placeholder="••••••••"
              required
              minLength={6}
            />
            <Input
              label="Confirm New Password"
              name="confirmPassword"
              type="password"
              placeholder="••••••••"
              required
              minLength={6}
            />
            <Button
              type="submit"
              variant="default"
              size="lg"
              className="w-full font-semibold shadow-sm"
              isLoading={isPending}
            >
              Update Password
            </Button>
          </form>
        </CardContent>
        <CardFooter className="justify-center text-xs text-slate-500">
          Remembered your password?{" "}
          <Link href="/auth/login" className="ml-1 font-semibold text-blue-600 hover:text-blue-700">
            Back to Sign In
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}
