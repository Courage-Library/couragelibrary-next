"use client";

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import Script from "next/script";
import { CAPTCHA_FIELD, TURNSTILE_SCRIPT_SRC } from "@/lib/auth/captcha";

/** AUTH-UX-1: what the form needs to know about the check (never the token itself in the UI) */
export type CaptchaStatus = "pending" | "ready" | "error" | "expired";

/**
 * AUTH-1 2b-2: Cloudflare Turnstile widget (explicit render, no npm package). Rendered ONLY when the server-evaluated
 * flag is on (the page passes the public site key), so with the flag off there is no script, no widget and no request
 * to Cloudflare. The token travels in a hidden "captchaToken" field of the surrounding form and is also reported to
 * the parent (the sign-in page shares it with the Google button). Supabase verifies it; it is never logged here.
 * Tokens are single use: whenever `resetKey` changes (a form submit came back) the widget is reset and the token
 * cleared, so the next attempt gets a fresh one.
 * AUTH-UX-1 (spec §3.6, owner decision 4): appearance "interaction-only" — the widget is visible ONLY when Cloudflare
 * needs the visitor; no space is reserved otherwise (the slot sits below the submit button). Status changes go to
 * `onStatus`; `resetRef` lets the form's "Retry" re-run the check (turnstile.reset). Server verification is unchanged.
 */
export function TurnstileWidget({
  siteKey,
  action,
  resetKey,
  onToken,
  onStatus,
  resetRef,
}: {
  siteKey: string;
  action: "login" | "signup" | "forgot-password";
  resetKey?: unknown;
  onToken?: (token: string | null) => void;
  onStatus?: (status: CaptchaStatus) => void;
  resetRef?: MutableRefObject<(() => void) | null>;
}) {
  const slot = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | undefined>(undefined);
  const [token, setToken] = useState("");
  const [interactive, setInteractive] = useState(false);
  const report = useRef(onToken);
  const status = useRef(onStatus);
  useEffect(() => {
    report.current = onToken;
    status.current = onStatus;
  }, [onToken, onStatus]);

  const update = useCallback((value: string, s: CaptchaStatus) => {
    setToken(value);
    report.current?.(value || null);
    status.current?.(s);
  }, []);

  const setUp = useCallback(() => {
    const ts = window.turnstile;
    if (!ts || !slot.current || widgetId.current !== undefined) return;
    status.current?.("pending");
    widgetId.current = ts.render(slot.current, {
      sitekey: siteKey,
      action,
      "response-field": false,
      size: "flexible",
      theme: "light",
      appearance: "interaction-only",
      callback: (t) => update(t, "ready"),
      "expired-callback": () => update("", "expired"),
      "timeout-callback": () => update("", "expired"),
      "error-callback": () => update("", "error"),
      "before-interactive-callback": () => setInteractive(true),
      "after-interactive-callback": () => setInteractive(false),
    });
  }, [siteKey, action, update]);

  const reset = useCallback(() => {
    update("", "pending");
    setInteractive(false);
    if (widgetId.current !== undefined) window.turnstile?.reset(widgetId.current);
  }, [update]);
  useEffect(() => {
    if (resetRef) resetRef.current = reset;
    return () => {
      if (resetRef) resetRef.current = null;
    };
  }, [resetRef, reset]);

  // single use: after every submit result, reset the widget (fresh token) and drop the spent one
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    reset();
  }, [resetKey, reset]);

  useEffect(
    () => () => {
      if (widgetId.current !== undefined) window.turnstile?.remove(widgetId.current);
      widgetId.current = undefined;
    },
    [],
  );

  return (
    <div data-turnstile="" data-turnstile-interactive={interactive ? "" : undefined} className={interactive ? "flex min-h-[65px] w-full justify-center" : "flex w-full justify-center"}>
      <Script src={TURNSTILE_SCRIPT_SRC} strategy="afterInteractive" onReady={setUp} />
      <div ref={slot} className="w-full" />
      <input type="hidden" name={CAPTCHA_FIELD} value={token} />
    </div>
  );
}
