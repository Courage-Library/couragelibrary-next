"use client";

import { forwardRef } from "react";
import { AGE_CHECKBOX_FIELD } from "@/lib/auth/age-gate";
import { FieldError } from "@/components/auth/auth-ui";

export const CONSENT_ERROR = "Please accept the Terms and Privacy Policy to continue.";

/**
 * AUTH-UX-1 (spec §4.9, owner decision): THE one eligibility consent on Create account (and /confirm-age) — the text of
 * AGE_CONFIRM_LABEL with real links (new tab). No age number on any auth screen: the rule lives in the Terms (§1.1).
 * Same field as before (AGE_CHECKBOX_FIELD = "ageConfirmed", value "on"), so the server's enforcement and recording are
 * unchanged. Never pre-ticked. It gates BOTH "Sign up with Google" and the email form (the forms show `error`).
 */
export const ConsentCheckbox = forwardRef<HTMLInputElement, { id: string; error?: string | null; onChange?: (checked: boolean) => void; name?: string; form?: string; required?: boolean }>(
  function ConsentCheckbox({ id, error, onChange, name = AGE_CHECKBOX_FIELD, form, required }, ref) {
    const errId = `${id}-error`;
    const link = "font-semibold text-cl-blue-text underline underline-offset-2";
    return (
      <div className="flex flex-col gap-1.5" data-consent="">
        <label htmlFor={id} className="flex min-h-12 cursor-pointer items-start gap-3 text-body-sm text-cl-charcoal">
          <input
            ref={ref}
            id={id}
            type="checkbox"
            name={name}
            form={form}
            required={required}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errId : undefined}
            onChange={(e) => onChange?.(e.target.checked)}
            className={`mt-0.5 size-5 shrink-0 accent-cl-blue ${error ? "outline outline-2 outline-offset-2 outline-cl-coral-text" : ""}`}
          />
          <span>
            I agree to the{" "}
            <a href="/terms" target="_blank" rel="noopener noreferrer" className={link}>
              Terms
            </a>{" "}
            and{" "}
            <a href="/privacy" target="_blank" rel="noopener noreferrer" className={link}>
              Privacy Policy
            </a>
            , and confirm I&apos;m eligible to create an account.
          </span>
        </label>
        {error && <FieldError id={errId}>{error}</FieldError>}
      </div>
    );
  },
);
