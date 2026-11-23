"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import Script from "next/script";
import { signInWithGoogleAction } from "@/app/(site)/auth/google-actions";
import type { AuthState } from "@/app/(site)/auth/actions";
import { googleCallbackDecision, googleRetryUrl } from "@/lib/auth/google-signin";
import { AuthAlert } from "@/components/auth/auth-ui";

/**
 * AUTH-1 2b-1 (decision #66): "Continue with Google" via Google Identity Services, rendered on our own origin
 * (never the Supabase redirect flow). Rendered ONLY when the server-evaluated flag is on, so with the flag off there
 * is no script, no button and no request to Google. Receives only the SHA-256 hash of the nonce (the raw value stays
 * in an httpOnly cookie). No One Tap / auto prompt. The credential goes straight to the server action and is never
 * logged or stored here.
 * 2b-2: with Turnstile on, the page's widget token is read when the callback fires and passed to the action (a spent
 * or missing token ends in the usual full reload, which renders a fresh widget).
 * AUTH-UX-1 (owner decision 1): the SAME button + action on both pages.
 *   - sign-in (`surface="login"`): "Continue with Google"; it NEVER sends the consent (`ageConfirmed` is always false),
 *     so a NEW Google account is refused by the server (unchanged) and the reload goes to Create account
 *     (?m=new-account, googleRetryUrl)
 *   - Create account (`surface="signup"`): "Sign up with Google"; while the consent box is unticked Google's button is
 *     inert behind our own button, which only shows the consent error — the Google flow never starts; ticked → the
 *     callback sends ageConfirmed === true (the box's state at that moment)
 * Styled through Google's own options (outline, rectangular, large, full width ≤ 400 px) — never replaced.
 */
export function GoogleSignInButton({
  clientId,
  nonceHash,
  next,
  getCaptchaToken,
  surface = "login",
  consent,
}: {
  clientId: string;
  nonceHash: string;
  next: string;
  getCaptchaToken?: () => string | undefined;
  surface?: "login" | "signup";
  /** Create account only: the consent box (ticked now?), and what to do when Google is pressed while it is unticked */
  consent?: { ticked: boolean; isTicked: () => boolean; onBlocked: () => void };
}) {
  const slot = useRef<HTMLDivElement>(null);
  const initialised = useRef(false);
  const [result, setResult] = useState<AuthState | null>(null);
  const [pending, startTransition] = useTransition();
  const blocked = surface === "signup" && !!consent && !consent.ticked;

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
        // the consent is sent ONLY from Create account, ONLY when ticked (exactly `true` counts on the server); Create
        // account with the box unticked never calls the action (defence in depth behind the inert button)
        const decision = googleCallbackDecision(surface, consent?.isTicked());
        if (decision === "block") {
          consent?.onBlocked();
          return;
        }
        const ageConfirmed = decision === "call-with-consent";
        startTransition(async () => {
          // success redirects on the server; only a fixed-code failure comes back
          const r = await signInWithGoogleAction(credential, next, getCaptchaToken?.(), ageConfirmed);
          if (!r) return;
          if (r.code === "google-disabled") {
            setResult(r); // nothing to retry: Google sign-in is off
            return;
          }
          // 2b-1a: the nonce was spent, so reload the page in FULL (fresh nonce + fresh GIS); the message comes back
          // through the ?m= allow-list. No soft navigation, no automatic retry.
          window.location.replace(googleRetryUrl(r.code ?? "google-failed", next, surface));
        });
      },
    });
    gsi.renderButton(slot.current, {
      type: "standard",
      theme: "outline",
      size: "large",
      text: surface === "signup" ? "signup_with" : "continue_with",
      shape: "rectangular",
      logo_alignment: "center",
      width: Math.min(Math.max(slot.current.offsetWidth, 200), 400),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- set up ONCE per page (a fresh nonce needs a full reload)
  }, [clientId, nonceHash, next, getCaptchaToken, surface]);

  return (
    <div className="flex flex-col gap-3" data-google-signin={surface}>
      <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" onReady={setUp} />
      <div role="group" aria-label={surface === "signup" ? "Sign up with Google" : "Sign in with Google"} aria-busy={pending} className="relative flex min-h-12 w-full items-center justify-center">
        <div ref={slot} className="w-full max-w-[400px]" inert={blocked || undefined} data-google-slot="" />
        {blocked && (
          <button
            type="button"
            onClick={consent?.onBlocked}
            className="focus-ring absolute inset-0 rounded-xl bg-transparent"
            data-google-blocked=""
          >
            {/* transparent over Google's own (inert) button, so the real button with its G logo stays what people see */}
            <span className="sr-only">Sign up with Google</span>
          </button>
        )}
      </div>
      {pending && (
        <p role="status" className="text-center text-body-sm text-cl-slate">
          Signing you in…
        </p>
      )}
      {result?.error && (
        <AuthAlert id={`google-${surface}-error`} code={result.code ?? ""}>
          {result.error}
        </AuthAlert>
      )}
    </div>
  );
}
