"use client";

import { useActionState, useEffect, useRef } from "react";
import Link from "next/link";
import { updatePasswordAction } from "@/app/(site)/auth/actions";
import { AuthAlert, AuthHeading, PRIMARY_BUTTON_CLASS } from "@/components/auth/auth-ui";
import { PasswordField } from "@/components/auth/password-field";
import { errorSlot } from "@/components/auth/auth-errors";
import type { AuthPreview } from "@/app/(site)/auth/login/login-form";

/**
 * AUTH-UX-1 (spec §5) — reset password: new password (eye toggle, 4-step strength, the real rule as hint) + confirm
 * (eye toggle) → "Update password". Field names password / confirmPassword unchanged; the action is unchanged.
 */
export function UpdatePasswordForm({ preview }: { preview?: AuthPreview }) {
  const [actionState, formAction, isPending] = useActionState(updatePasswordAction, null);
  const state = preview?.state ?? actionState;
  const slot = state?.error ? errorSlot(state.code) : null;
  const pwRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!state?.error) return;
    if (slot === "password") pwRef.current?.focus();
    else if (slot === "confirmPassword") confirmRef.current?.focus();
    else alertRef.current?.focus();
  }, [state, slot]);

  return (
    <>
      <AuthHeading title="Set a new password" sub="Choose a new password for your account." />
      {state?.success ? (
        <p role="status" className="rounded-xl bg-cl-cloud px-4 py-3.5 text-body text-cl-charcoal" data-auth-notice="password-updated">
          {state.success}
        </p>
      ) : (
        <form action={formAction} className="flex flex-col gap-4" data-auth-form="update-password">
          <PasswordField ref={pwRef} id="reset-password" name="password" label="New password" autoComplete="new-password" withStrength error={slot === "password" ? state?.error : null} />
          <PasswordField ref={confirmRef} id="reset-confirm" name="confirmPassword" label="Confirm new password" autoComplete="new-password" error={slot === "confirmPassword" ? state?.error : null} />
          {state?.error && slot !== "password" && slot !== "confirmPassword" && (
            <AuthAlert ref={alertRef} id="reset-error" code={state.code ?? ""}>
              {state.error}
            </AuthAlert>
          )}
          <button type="submit" className={PRIMARY_BUTTON_CLASS} aria-busy={isPending} data-auth-submit="">
            {isPending ? "Updating…" : "Update password"}
          </button>
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
