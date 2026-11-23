"use client";

import { forwardRef, useState, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Icon } from "@/components/icons/icon";
import { FieldError, FIELD_CLASS } from "@/components/auth/auth-ui";

/** AUTH-UX-1: the REAL rule (lib/auth/messages.ts isAcceptablePassword: ≥ 8 characters with a letter and a digit) */
export const PASSWORD_HINT = "At least 8 characters, with a letter and a number";

/**
 * 0–4 steps for the strength bar. Display only — the server rule (isAcceptablePassword) decides; anything below the
 * rule is at most "weak". 1 = some text · 2 = meets the rule · 3 = rule + 12 characters · 4 = rule + 12 + mixed case or
 * a symbol.
 */
export function passwordStrength(pw: string): 0 | 1 | 2 | 3 | 4 {
  if (!pw) return 0;
  const rule = pw.length >= 8 && /[A-Za-z]/.test(pw) && /\d/.test(pw);
  if (!rule) return 1;
  if (pw.length < 12) return 2;
  return /[a-z]/.test(pw) && /[A-Z]/.test(pw) || /[^A-Za-z0-9]/.test(pw) ? 4 : 3;
}
export const STRENGTH_LABEL = ["", "weak", "fair", "good", "strong"] as const;

/**
 * spec §3.5 / §4.10: a password field with a show / hide eye button (aria-label "Show password" / "Hide password",
 * aria-pressed), an optional "Forgot password?" link on the label row, an optional hint + 4-step strength bar (with a
 * text label for screen readers). autoComplete current-password / new-password (password managers keep working).
 */
export const PasswordField = forwardRef<
  HTMLInputElement,
  { id: string; name: string; label: string; autoComplete: "current-password" | "new-password"; error?: string | null; aside?: ReactNode; withStrength?: boolean; required?: boolean }
>(function PasswordField({ id, name, label, autoComplete, error, aside, withStrength = false, required = true }, ref) {
  const [visible, setVisible] = useState(false);
  const [value, setValue] = useState("");
  const errId = `${id}-error`;
  const hintId = `${id}-hint`;
  const strength = passwordStrength(value);
  const describedBy = [error ? errId : null, withStrength ? hintId : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className="flex flex-col gap-1.5" data-auth-field={name}>
      <div className="flex items-end justify-between gap-3">
        <label htmlFor={id} className="text-body-sm font-semibold text-cl-charcoal">
          {label}
        </label>
        {aside}
      </div>
      <div className="relative">
        <input
          ref={ref}
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          required={required}
          minLength={autoComplete === "new-password" ? 8 : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(e) => setValue(e.target.value)}
          className={`${FIELD_CLASS} pr-14 ${error ? "border-cl-coral-text" : "border-cl-line-2"}`}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          aria-controls={id}
          className="focus-ring absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-xl text-cl-slate hover:text-cl-charcoal"
          data-password-toggle=""
        >
          <Icon icon={visible ? EyeOff : Eye} size={20} />
        </button>
      </div>
      {withStrength && (
        <div id={hintId} className="flex flex-col gap-1.5" data-password-hint="">
          <div className="grid grid-cols-4 gap-1.5" aria-hidden="true" data-strength={strength}>
            {[1, 2, 3, 4].map((i) => (
              <span key={i} className={`h-1 rounded-full ${i <= strength ? (strength <= 1 ? "bg-cl-coral" : strength === 2 ? "bg-warning-500" : "bg-success-600") : "bg-cl-line"}`} />
            ))}
          </div>
          <p className="text-caption text-cl-slate">
            {PASSWORD_HINT}
            {strength > 0 && <span className="sr-only">. Password strength: {STRENGTH_LABEL[strength]}</span>}
          </p>
        </div>
      )}
      {error && <FieldError id={errId}>{error}</FieldError>}
    </div>
  );
});
