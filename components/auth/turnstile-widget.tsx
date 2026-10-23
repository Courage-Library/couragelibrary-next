"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Script from "next/script";
import { CAPTCHA_FIELD, TURNSTILE_SCRIPT_SRC } from "@/lib/auth/captcha";

/**
 * AUTH-1 2b-2: Cloudflare Turnstile widget (explicit render, no npm package). Rendered ONLY when the server-evaluated
 * flag is on (the page passes the public site key), so with the flag off there is no script, no widget and no request
 * to Cloudflare. The token travels in a hidden "captchaToken" field of the surrounding form and is also reported to
 * the parent (the sign-in page shares it with the Google button). Supabase verifies it; it is never logged here.
 * Tokens are single use: whenever `resetKey` changes (a form submit came back) the widget is reset and the token
 * cleared, so the next attempt gets a fresh one.
 */
export function TurnstileWidget({
  siteKey,
  action,
  resetKey,
  onToken,
}: {
  siteKey: string;
  action: "login" | "signup" | "forgot-password";
  resetKey?: unknown;
  onToken?: (token: string | null) => void;
}) {
  const slot = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | undefined>(undefined);
  const [token, setToken] = useState("");
  const report = useRef(onToken);
  useEffect(() => {
    report.current = onToken;
  }, [onToken]);

  const update = useCallback((value: string) => {
    setToken(value);
    report.current?.(value || null);
  }, []);

  const setUp = useCallback(() => {
    const ts = window.turnstile;
    if (!ts || !slot.current || widgetId.current !== undefined) return;
    widgetId.current = ts.render(slot.current, {
      sitekey: siteKey,
      action,
      "response-field": false,
      size: "flexible",
      theme: "light",
      callback: (t) => update(t),
      "expired-callback": () => update(""),
      "timeout-callback": () => update(""),
      "error-callback": () => update(""),
    });
  }, [siteKey, action, update]);

  // single use: after every submit result, reset the widget (fresh token) and drop the spent one
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    update("");
    if (widgetId.current !== undefined) window.turnstile?.reset(widgetId.current);
  }, [resetKey, update]);

  useEffect(
    () => () => {
      if (widgetId.current !== undefined) window.turnstile?.remove(widgetId.current);
      widgetId.current = undefined;
    },
    [],
  );

  return (
    <div data-turnstile="" className="flex min-h-[65px] w-full justify-center">
      <Script src={TURNSTILE_SCRIPT_SRC} strategy="afterInteractive" onReady={setUp} />
      <div ref={slot} className="w-full" />
      <input type="hidden" name={CAPTCHA_FIELD} value={token} />
    </div>
  );
}
