"use client";

import { forwardRef, useState } from "react";

/**
 * ADMIN-MFA-UX-1 §2.9 — the 6-box code field: ONE real <input> (inputmode numeric, autocomplete one-time-code,
 * maxlength 6, pattern [0-9]*) laid transparently over six visual boxes, so typing, paste, password-manager and SMS-style
 * autofill all fill every box. Digits only. Never logged, never stored — the value lives in the parent's state.
 */
export const OtpInput = forwardRef<HTMLInputElement, { id: string; label: string; value: string; onChange: (v: string) => void; invalid?: boolean; describedBy?: string; disabled?: boolean }>(
  function OtpInput({ id, label, value, onChange, invalid, describedBy, disabled }, ref) {
    const [focused, setFocused] = useState(false);
    const active = Math.min(value.length, 5);
    return (
      <div className="flex flex-col gap-2">
        <label htmlFor={id} className="text-body-sm font-medium text-cl-charcoal">
          {label}
        </label>
        <div className="relative w-fit" data-mfa-otp="">
          <input
            ref={ref}
            id={id}
            name="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            spellCheck={false}
            disabled={disabled}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            value={value}
            onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
            // a pasted "123 456" / "123-456" would be cut by maxlength BEFORE the digit filter: keep the first 6 digits
            onPaste={(e) => {
              const digits = e.clipboardData.getData("text").replace(/\D/g, "");
              if (!digits) return;
              e.preventDefault();
              onChange(digits.slice(0, 6));
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            // transparent text over the boxes; 16 px+ so phones never zoom; the caret is hidden (the box ring shows focus)
            className="absolute inset-0 z-10 h-full w-full cursor-text rounded-xl bg-transparent text-[16px] text-transparent caret-transparent outline-none selection:bg-transparent"
          />
          <div aria-hidden="true" className="flex gap-2">
            {Array.from({ length: 6 }, (_, i) => {
              const isActive = focused && i === active && value.length < 6;
              const border = invalid ? "border-cl-coral-text" : isActive || (focused && value.length === 6 && i === 5) ? "border-cl-blue ring-4 ring-cl-blue-tint" : "border-cl-line";
              return (
                <span key={i} className={`flex h-14 w-11 items-center justify-center rounded-xl border-[1.5px] bg-cl-white font-heading text-[22px] font-semibold text-cl-charcoal sm:h-[60px] sm:w-[52px] sm:text-[24px] ${border}`}>
                  {value[i] ?? ""}
                </span>
              );
            })}
          </div>
        </div>
      </div>
    );
  },
);
