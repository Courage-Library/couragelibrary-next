"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import Script from "next/script";
import { Alert } from "@/components/ui/alert";
import { signInWithGoogleAction } from "@/app/(site)/auth/google-actions";
import type { AuthState } from "@/app/(site)/auth/actions";
import { googleRetryUrl } from "@/lib/auth/google-signin";
import { AGE_CONFIRM_LABEL } from "@/lib/auth/age-gate";

/**
 * AUTH-1 2b-1 (decision #66): "Continue with Google" via Google Identity Services, rendered on our own origin
 * (never the Supabase redirect flow). Rendered ONLY when the server-evaluated flag is on, so with the flag off there
 * is no script, no button and no request to Google. Receives only the SHA-256 hash of the nonce (the raw value stays
 * in an httpOnly cookie). No One Tap / auto prompt. The credential goes straight to the server action and is never
 * logged or stored here.
 * 2b-2: with Turnstile on, the page's widget token is read when the callback fires and passed to the action (a spent
 * or missing token ends in the usual full reload, which renders a fresh widget).
 */
export function GoogleSignInButton({
  clientId,
  nonceHash,
  next,
  getCaptchaToken,
  ageGate = false,
}: {
  clientId: string;
  nonceHash: string;
  next: string;
  getCaptchaToken?: () => string | undefined;
  /** AUTH-HARDEN-1: 18+ gate on and registrations open → a NEW Google account needs the 18+ box (existing ones don't) */
  ageGate?: boolean;
}) {
  const slot = useRef<HTMLDivElement>(null);
  const ageBox = useRef<HTMLInputElement>(null);
  const initialised = useRef(false);
  const [result, setResult] = useState<AuthState | null>(null);
  const [pending, startTransition] = useTransition();

  const setUp = useCallback(() => {
    const gsi = window.google?.accounts?.id;
    if (!gsi || !slot.current || initialised.current) return;
    initialised.current = true;
    gsi.initialize({
      client_id: clientId,
      nonce: nonceHash,
      ux_mode: "popup",
      auto_select: false,
      cancel_on_tap_outside: true,
      itp_support: true,
      use_fedcm_for_button: true,
      callback: (response) => {
        const credential = response.credential;
        setResult(null);
        startTransition(async () => {
          // success redirects on the server; only a fixed-code failure comes back
          // the server decides: the box only matters when this Google account is new (exactly `true` counts)
          const r = await signInWithGoogleAction(credential, next, getCaptchaToken?.(), ageBox.current?.checked === true);
          if (!r) return;
          if (r.code === "google-disabled") {
            setResult(r); // nothing to retry: Google sign-in is off
            return;
          }
          // 2b-1a: the nonce was spent, so reload the page in FULL (fresh nonce + fresh GIS); the message comes back
          // through the ?m= allow-list. No soft navigation, no automatic retry.
          window.location.replace(googleRetryUrl(r.code ?? "google-failed", next));
        });
      },
    });
    gsi.renderButton(slot.current, {
      type: "standard",
      theme: "outline",
      size: "large",
      text: "continue_with",
      shape: "rectangular",
      logo_alignment: "left",
      width: Math.min(Math.max(slot.current.offsetWidth, 200), 400),
    });
  }, [clientId, nonceHash, next, getCaptchaToken]);

  return (
    <div className="flex flex-col gap-3" data-google-signin="">
      <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" onReady={setUp} />
      <div role="group" aria-label="Sign in with Google" aria-busy={pending} className="flex min-h-11 w-full justify-center">
        <div ref={slot} className="w-full max-w-[400px]" />
      </div>
      {ageGate && (
        <label className="flex min-h-11 items-start gap-3 text-body-sm text-fg" data-google-age="">
          <input ref={ageBox} type="checkbox" name="googleAgeConfirmed" className="mt-1 h-5 w-5 shrink-0" />
          <span>
            {AGE_CONFIRM_LABEL}. <span className="text-fg-secondary">Needed only to create a new account with Google.</span>
          </span>
        </label>
      )}
      {pending && (
        <p role="status" className="text-center text-body-sm text-fg-secondary">
          Signing you in…
        </p>
      )}
      {result?.error && (
        <Alert tone="danger" live data-auth-error={result.code ?? ""}>
          {result.error}
        </Alert>
      )}
    </div>
  );
}
