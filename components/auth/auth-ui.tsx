"use client";

import { forwardRef, useEffect, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { AlertCircle, Check, ShieldCheck } from "lucide-react";
import { Icon } from "@/components/icons/icon";

/**
 * AUTH-UX-1 (owner spec docs/design/AUTH_UX_V1_SPEC.md) — the small shared pieces of the auth pages. cl-* tokens only;
 * no emoji (Lucide utility icons via <Icon>); 48 px fields and buttons; errors coral (cl-coral-text) with an icon and a
 * border, tied to their field by aria-describedby; notices are neutral and fade after ~5 s, errors never fade.
 */

/** ADMIN-MFA-UX-1: optional `muted` tail for the two-tone heading (slate; only Poppins 600/700 are self-hosted); without it, unchanged markup */
export function AuthHeading({ title, sub, muted }: { title: string; sub: string; muted?: string }) {
  return (
    <header className="flex flex-col gap-1.5" data-auth-heading="">
      <h1 className="font-heading text-[28px] font-semibold leading-tight text-cl-charcoal">
        {title}
        {muted ? <span className="text-cl-slate"> {muted}</span> : null}
      </h1>
      <p className="text-body text-cl-slate">{sub}</p>
    </header>
  );
}

/** spec §3.2: "You've been signed out." etc. — neutral, role=status, fades after ~5 s (instantly with reduced motion) */
export function AuthNotice({ text, code }: { text: string; code?: string }) {
  const [shown, setShown] = useState(true);
  const [gone, setGone] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShown(false), 5000);
    return () => clearTimeout(t);
  }, []);
  if (gone) return null;
  return (
    <p
      role="status"
      data-auth-notice={code ?? ""}
      onTransitionEnd={() => !shown && setGone(true)}
      className={`flex items-start gap-2 rounded-xl bg-cl-cloud px-3.5 py-3 text-body-sm text-cl-slate motion-safe:transition-opacity motion-safe:duration-500 ${shown ? "opacity-100" : "opacity-0 motion-reduce:hidden"}`}
    >
      <Icon icon={Check} size={18} className="mt-0.5 shrink-0 text-success-600" />
      <span>{text}</span>
    </p>
  );
}

/** a form-level error (credentials, rate limit, network …): coral, role=alert, focusable so focus can move to it */
export const AuthAlert = forwardRef<HTMLDivElement, { id: string; code?: string; children: ReactNode }>(function AuthAlert({ id, code, children }, ref) {
  return (
    <div ref={ref} id={id} role="alert" tabIndex={-1} data-auth-error={code ?? ""} className="flex items-start gap-2 rounded-xl border border-cl-coral-text bg-cl-coral-tint px-3.5 py-3 text-body-sm font-medium text-cl-coral-text outline-none">
      <Icon icon={AlertCircle} size={18} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
});

export function FieldError({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className="flex items-start gap-1.5 text-body-sm font-medium text-cl-coral-text" data-field-error="">
      <Icon icon={AlertCircle} size={16} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

export const FIELD_CLASS =
  "block h-12 w-full rounded-xl border bg-cl-white px-3.5 text-body text-cl-charcoal placeholder:text-cl-silver outline-none transition-[border-color,box-shadow] focus:border-cl-blue focus:ring-4 focus:ring-cl-blue-tint";

export interface AuthInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  id: string;
  label: string;
  error?: string | null;
  /** extra content on the label row (right side), e.g. "Forgot password?" */
  aside?: ReactNode;
  /** extra content under the input (e.g. a hint), referenced by aria-describedby */
  hint?: ReactNode;
  hintId?: string;
}

/** a labelled 48 px field; an error turns the border coral and is announced through aria-describedby (no red asterisks) */
export const AuthInput = forwardRef<HTMLInputElement, AuthInputProps>(function AuthInput({ id, label, error, aside, hint, hintId, className, ...rest }, ref) {
  const errId = `${id}-error`;
  const describedBy = [error ? errId : null, hint && hintId ? hintId : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className="flex flex-col gap-1.5" data-auth-field={rest.name}>
      <div className="flex items-end justify-between gap-3">
        <label htmlFor={id} className="text-body-sm font-semibold text-cl-charcoal">
          {label}
        </label>
        {aside}
      </div>
      <input ref={ref} id={id} aria-invalid={error ? true : undefined} aria-describedby={describedBy} className={`${FIELD_CLASS} ${error ? "border-cl-coral-text" : "border-cl-line-2"} ${className ?? ""}`} {...rest} />
      {hint}
      {error && <FieldError id={errId}>{error}</FieldError>}
    </div>
  );
});

export function AuthDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 text-body-sm text-cl-slate" data-auth-divider="">
      <span className="h-px flex-1 bg-cl-line" aria-hidden="true" />
      {label}
      <span className="h-px flex-1 bg-cl-line" aria-hidden="true" />
    </div>
  );
}

/** spec §3.6: the small line under the submit button (only while Turnstile is on) */
export function CloudflareLine() {
  return (
    <p className="flex items-center justify-center gap-1.5 text-caption text-cl-slate" data-cloudflare-line="">
      <Icon icon={ShieldCheck} size={14} className="shrink-0" />
      Protected by Cloudflare
    </p>
  );
}

/** owner decision 4: shown while a submit waits for the Turnstile token */
export function SecurityWaiting() {
  return (
    <p role="status" aria-live="polite" className="text-center text-body-sm text-cl-slate" data-security-waiting="">
      Finishing security check…
    </p>
  );
}

/**
 * spec §3.8: the check failed / expired / never finished — Retry re-runs it (turnstile.reset).
 * SEC1D fix (owner, 2026-11-24): when the SERVER returned the captcha code (captcha-failed / captcha-required), the card
 * carries it as data-auth-error="<code>" — the same fixed code AuthAlert carries, so gates can read it. A client-only
 * failure (the widget never finished) has no server code and no attribute.
 */
export function SecurityCheckCard({ onRetry, code }: { onRetry: () => void; code?: string }) {
  return (
    <div role="alert" className="flex flex-col gap-2 rounded-xl border border-cl-line-2 bg-cl-cloud px-4 py-3.5" data-security-check="" data-auth-error={code || undefined}>
      <p className="text-body-sm font-semibold text-cl-charcoal">Quick security check</p>
      <p className="text-body-sm text-cl-slate">Cloudflare needs one more check. It usually finishes by itself.</p>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={onRetry} className="focus-ring inline-flex min-h-12 items-center rounded-xl border border-cl-blue px-5 text-body-sm font-semibold text-cl-blue-text hover:bg-cl-blue-tint" data-security-retry="">
          Retry
        </button>
        <span className="text-caption text-cl-slate">Try turning off VPN or ad-blocker.</span>
      </div>
    </div>
  );
}

export const PRIMARY_BUTTON_CLASS =
  "focus-ring inline-flex h-12 w-full items-center justify-center rounded-xl bg-cl-blue px-5 text-body font-semibold text-cl-white shadow-sm hover:bg-cl-blue-hover disabled:cursor-not-allowed disabled:opacity-60";
