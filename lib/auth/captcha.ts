/**
 * AUTH-1 2b-2: Cloudflare Turnstile on the auth forms. Server-evaluated flag, default OFF.
 * ON only when AUTH_CAPTCHA_ENABLED === "true" AND the public Turnstile site key is present and well-formed.
 * The token is VERIFIED BY SUPABASE (Attack Protection → CAPTCHA, secret entered in the Supabase dashboard only): our
 * server only checks the token's shape and forwards it as options.captchaToken. The Turnstile SECRET is never needed
 * here and must never appear in the repo, env files, tests or logs.
 * Pure and runtime-agnostic (server pages, server actions, offline tests); the script URL is shared with the widget.
 */
import type { AuthErrorCode } from "@/lib/auth/messages";

export const TURNSTILE_SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
export const MAX_CAPTCHA_TOKEN_LENGTH = 2048;
/** Form field the widget's token travels in (email forms) — the Google button passes it as an action argument. */
export const CAPTCHA_FIELD = "captchaToken";
/** What a server page hands its client form: the public site key, or null when the flag is off (nothing rendered). */
export type CaptchaConfig = { siteKey: string } | null;

/** The public Turnstile site key, or null when it is missing / malformed (it is rendered into the page). */
export function turnstileSiteKey(env: NodeJS.ProcessEnv = process.env): string | null {
  const key = (env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "").trim();
  if (!key || key.length > 100 || !/^[A-Za-z0-9_-]+$/.test(key)) return null;
  return key;
}

export function isCaptchaEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.AUTH_CAPTCHA_ENABLED === "true" && turnstileSiteKey(env) !== null;
}

/**
 * Server-side token check before any Supabase call:
 *   flag off                                  → { ok, token: undefined } (nothing is sent; nothing is required)
 *   flag on, missing / empty                  → captcha-required
 *   flag on, not a string or > 2048 chars     → captcha-failed
 *   flag on, a plausible token                → { ok, token } (Supabase verifies it)
 */
export function checkCaptchaToken(
  value: unknown,
  env: NodeJS.ProcessEnv = process.env,
): { ok: true; token: string | undefined } | { ok: false; code: Extract<AuthErrorCode, "captcha-required" | "captcha-failed"> } {
  if (!isCaptchaEnabled(env)) return { ok: true, token: undefined };
  if (value === null || value === undefined || value === "") return { ok: false, code: "captcha-required" };
  if (typeof value !== "string" || value.length > MAX_CAPTCHA_TOKEN_LENGTH) return { ok: false, code: "captcha-failed" };
  return { ok: true, token: value };
}

/** Supabase's CAPTCHA rejection (error code captcha_failed / "captcha protection: request disallowed …"). */
export function isCaptchaError(err: unknown): boolean {
  const e = (err || {}) as { code?: string; message?: string };
  return (e.code || "").toLowerCase().includes("captcha") || (e.message || "").toLowerCase().includes("captcha");
}
