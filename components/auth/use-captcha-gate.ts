"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { CAPTCHA_FIELD } from "@/lib/auth/captcha";
import type { CaptchaStatus } from "@/components/auth/turnstile-widget";

/** AUTH-UX-1 (owner decision 4): how long a submit waits for the Turnstile token before the "Quick security check" card */
export const CAPTCHA_WAIT_MS = 8000;

/**
 * AUTH-UX-1 (owner decision 4) — the submit button stays ENABLED. On submit without a Turnstile token: "Finishing
 * security check…" (aria-live), wait up to CAPTCHA_WAIT_MS for the token, then submit; if none arrives, or the check
 * errors / expires meanwhile → the "Quick security check" card with Retry (turnstile.reset). With the flag off it does
 * nothing (every submit passes). The token is only ever written into the form's hidden field — never shown or logged.
 */
export function useCaptchaGate(enabled: boolean) {
  const token = useRef<string | null>(null);
  const status = useRef<CaptchaStatus>("pending");
  const waitingForm = useRef<HTMLFormElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resetRef = useRef<(() => void) | null>(null);
  const [phase, setPhase] = useState<"idle" | "waiting" | "failed">("idle");

  const stopWaiting = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    waitingForm.current = null;
  }, []);
  useEffect(() => stopWaiting, [stopWaiting]);

  const submitNow = useCallback((form: HTMLFormElement, t: string) => {
    const field = form.elements.namedItem(CAPTCHA_FIELD);
    if (field instanceof HTMLInputElement) field.value = t;
    form.requestSubmit();
  }, []);

  const onToken = useCallback(
    (t: string | null) => {
      token.current = t;
      const form = waitingForm.current;
      if (t && form) {
        stopWaiting();
        setPhase("idle");
        submitNow(form, t);
      }
    },
    [stopWaiting, submitNow],
  );

  const onStatus = useCallback(
    (s: CaptchaStatus) => {
      status.current = s;
      if ((s === "error" || s === "expired") && waitingForm.current) {
        stopWaiting();
        setPhase("failed");
      }
    },
    [stopWaiting],
  );

  /** call first in the form's onSubmit: true = let the submit go on; false = it was held (waiting / failed) */
  const guard = useCallback(
    (e: FormEvent<HTMLFormElement>): boolean => {
      if (!enabled || token.current) return true;
      e.preventDefault();
      if (status.current === "error" || status.current === "expired") {
        setPhase("failed");
        return false;
      }
      stopWaiting();
      waitingForm.current = e.currentTarget;
      setPhase("waiting");
      timer.current = setTimeout(() => {
        if (!waitingForm.current) return;
        stopWaiting();
        setPhase("failed");
      }, CAPTCHA_WAIT_MS);
      return false;
    },
    [enabled, stopWaiting],
  );

  /** the card's Retry: re-run the check (turnstile.reset); the next submit waits again */
  const retry = useCallback(() => {
    stopWaiting();
    token.current = null;
    status.current = "pending";
    setPhase("idle");
    resetRef.current?.();
  }, [stopWaiting]);

  /** the Google button reads the current token when its callback fires */
  const getToken = useCallback(() => token.current ?? undefined, []);

  return { phase, guard, retry, onToken, onStatus, resetRef, getToken };
}
