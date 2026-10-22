"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import Script from "next/script";
import { Alert } from "@/components/ui/alert";
import { signInWithGoogleAction } from "@/app/auth/google-actions";
import type { AuthState } from "@/app/auth/actions";
import { googleRetryUrl } from "@/lib/auth/google-signin";

/**
 * AUTH-1 2b-1 (decision #66): "Continue with Google" via Google Identity Services, rendered on our own origin
 * (never the Supabase redirect flow). Rendered ONLY when the server-evaluated flag is on, so with the flag off there
 * is no script, no button and no request to Google. Receives only the SHA-256 hash of the nonce (the raw value stays
 * in an httpOnly cookie). No One Tap / auto prompt. The credential goes straight to the server action and is never
 * logged or stored here.
 */
export function GoogleSignInButton({ clientId, nonceHash, next }: { clientId: string; nonceHash: string; next: string }) {
  const slot = useRef<HTMLDivElement>(null);
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
          const r = await signInWithGoogleAction(credential, next);
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
  }, [clientId, nonceHash, next]);

  return (
    <div className="flex flex-col gap-3" data-google-signin="">
      <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" onReady={setUp} />
      <div role="group" aria-label="Sign in with Google" aria-busy={pending} className="flex min-h-11 w-full justify-center">
        <div ref={slot} className="w-full max-w-[400px]" />
      </div>
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
