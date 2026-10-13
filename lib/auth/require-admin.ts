import "server-only";

/**
 * COURAGE LIBRARY — CANONICAL ADMIN AUTHORIZATION GUARD (SEC-1B)
 *
 * The single place that decides whether the current request may perform an admin action.
 *
 * - Identity comes ONLY from the session (Supabase server client → auth.getUser()). No function
 *   here accepts a caller-supplied user id.
 * - Roles come ONLY from app_metadata.role (writable by the service role alone):
 *     'admin' → admin, 'staff' → staff. user_metadata is never consulted.
 * - ADMIN_EMAILS (comma-separated env var) still grants admin, unchanged from SEC-1A; its removal
 *   is SEC-1. Unset/empty grants nothing.
 * - Fail-closed: requireAdmin() throws AuthorizationError; the action/route helpers convert that
 *   into a uniform denial. Any unexpected error while resolving the session is a denial too.
 */

import { NextResponse } from "next/server";
import { notFound, redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { sanitizeAdminPath } from "@/lib/auth/safe-redirect";

export type AdminRole = "admin" | "staff";
export type AuthorizationCode = "UNAUTHORIZED" | "FORBIDDEN";
export type ActionFailureCode = AuthorizationCode | "DB_ERROR" | "VALIDATION";

export class AuthorizationError extends Error {
  readonly code: AuthorizationCode;
  constructor(code: AuthorizationCode, message?: string) {
    super(message || (code === "UNAUTHORIZED" ? "Sign in required." : "You do not have permission to perform this action."));
    this.name = "AuthorizationError";
    this.code = code;
  }
}

export interface AdminContext {
  userId: string;
  role: AdminRole;
  /** Session email (used for audit actor_email); empty string if the account has none. */
  userEmail: string;
}

export interface RequireAdminOptions {
  /** Also allow app_metadata.role = 'staff'. Default: admin only. */
  allowStaff?: boolean;
}

/** Uniform failure result for server actions. `success: false` keeps legacy callers fail-closed. */
export interface ActionFailure {
  ok: false;
  success: false;
  error: ActionFailureCode;
  /** Same as error; matches existing { success, code, error } result shapes. */
  code: ActionFailureCode;
  message: string;
  data?: undefined;
}

export type GuardResult = ({ ok: true; isAdmin: true } & AdminContext) | ActionFailure;

function configuredAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/** Role of a session user, or null. Pure — exported for tests and for AdminService.checkIsAdminOrStaff. */
export function resolveRole(user: { email?: string | null; app_metadata?: Record<string, unknown> | null } | null): AdminRole | null {
  if (!user) return null;
  const appRole = user.app_metadata?.role;
  if (appRole === "admin") return "admin";
  if (user.email && configuredAdminEmails().includes(user.email.toLowerCase())) return "admin";
  if (appRole === "staff") return "staff";
  return null;
}

/**
 * Throws AuthorizationError unless the session user is an admin (or staff when allowStaff).
 */
export async function requireAdmin(opts: RequireAdminOptions = {}): Promise<AdminContext> {
  let user: { id: string; email?: string | null; app_metadata?: Record<string, unknown> | null } | null = null;
  try {
    const supabase = await createServerSupabaseClient();
    const { data } = await supabase.auth.getUser();
    user = data?.user ?? null;
  } catch {
    throw new AuthorizationError("UNAUTHORIZED");
  }
  if (!user) throw new AuthorizationError("UNAUTHORIZED");
  const role = resolveRole(user);
  if (role === "admin" || (role === "staff" && opts.allowStaff)) {
    return { userId: user.id, role, userEmail: user.email ?? "" };
  }
  throw new AuthorizationError("FORBIDDEN");
}

/** Login page used for anonymous admin page requests. */
export const ADMIN_LOGIN_PATH = "/auth/login";

/**
 * `next` target for the login redirect: only a relative /admin path (no scheme, host, `//`, `..`,
 * query or fragment); anything else falls back to "/admin". Prevents open redirects.
 * SEC-1D: one implementation — the shared sanitizer plus the /admin constraint.
 */
export function sanitizeAdminNext(path: unknown): string {
  return sanitizeAdminPath(path);
}

export interface RequireAdminPageOptions extends RequireAdminOptions {
  /** This page's path, used only as the post-login `next` target (sanitized). */
  path?: string;
}

/**
 * SEC-1C page guard (layouts are not security boundaries). Must be the FIRST awaited call in every
 * app/admin page and generateMetadata, before any data fetch.
 *   anonymous / session error → redirect to login (?next=<sanitized /admin path>)
 *   signed in without a permitted role → notFound()
 * Same session-only identity and resolveRole as requireAdmin; never accepts a user id.
 */
export async function requireAdminPage(opts: RequireAdminPageOptions = {}): Promise<AdminContext> {
  let user: { id: string; email?: string | null; app_metadata?: Record<string, unknown> | null } | null = null;
  try {
    const supabase = await createServerSupabaseClient();
    const { data } = await supabase.auth.getUser();
    user = data?.user ?? null;
  } catch {
    user = null;
  }
  if (!user) redirect(`${ADMIN_LOGIN_PATH}?next=${encodeURIComponent(sanitizeAdminNext(opts.path))}`);
  const role = resolveRole(user);
  if (role === "admin" || (role === "staff" && opts.allowStaff)) return { userId: user.id, role, userEmail: user.email ?? "" };
  notFound();
}

export function actionFailure(code: ActionFailureCode, message: string): ActionFailure {
  return { ok: false, success: false, error: code, code, message };
}

/** Server-action helper: never throws; returns a uniform denial or the admin context. */
export async function guardAdminAction(opts: RequireAdminOptions = {}): Promise<GuardResult> {
  try {
    const ctx = await requireAdmin(opts);
    return { ok: true, isAdmin: true, ...ctx };
  } catch (err) {
    const code: AuthorizationCode = err instanceof AuthorizationError ? err.code : "UNAUTHORIZED";
    return actionFailure(code, code === "UNAUTHORIZED" ? "Sign in required." : "You do not have permission to perform this action.");
  }
}

/** API-route helper: never throws; a denial carries a ready 401/403 response. */
export async function guardAdminRoute(
  opts: RequireAdminOptions = {}
): Promise<({ ok: true; isAdmin: true } & AdminContext) | { ok: false; response: NextResponse }> {
  const res = await guardAdminAction(opts);
  if (res.ok) return res;
  const status = res.error === "UNAUTHORIZED" ? 401 : 403;
  return { ok: false, response: NextResponse.json({ ok: false, success: false, error: res.error, message: res.message }, { status }) };
}

const DB_ERROR_HINT = /violates|duplicate key|relation |column |syntax error|permission denied|does not exist|null value|foreign key|PGRST|JWT|connection|timeout|fetch failed|ECONN|ETIMEDOUT|invalid input syntax/i;

/**
 * Maps a caught error to a safe action failure. Database/infrastructure errors become DB_ERROR with a
 * generic message (details logged server-side, no secrets); application-thrown messages
 * (validation, workflow rules) pass through as VALIDATION.
 */
export function toActionFailure(context: string, err: unknown): ActionFailure {
  if (err instanceof AuthorizationError) return actionFailure(err.code, err.message);
  const e = err as { code?: unknown; message?: unknown } | null;
  const message = typeof e?.message === "string" ? e.message : "";
  const looksDb = (typeof e?.code === "string" && /^([0-9A-Z]{5}|PGRST\w+)$/.test(e.code)) || DB_ERROR_HINT.test(message) || !message;
  if (looksDb) {
    console.error(`[${context}] database/storage error: ${typeof e?.code === "string" ? e.code : "unknown"}`);
    return actionFailure("DB_ERROR", "The change could not be saved. Please try again.");
  }
  return actionFailure("VALIDATION", message);
}

/** Failure for a returned (not thrown) Supabase/PostgREST error object. */
export function dbFailure(context: string, err: unknown): ActionFailure {
  const e = err as { code?: unknown } | null;
  console.error(`[${context}] database error: ${typeof e?.code === "string" ? e.code : "unknown"}`);
  return actionFailure("DB_ERROR", "The change could not be saved. Please try again.");
}

/** API-route counterpart of toActionFailure: 400 VALIDATION, 500 DB_ERROR, 401/403 authorization. */
export function toRouteErrorResponse(context: string, err: unknown): NextResponse {
  const f = toActionFailure(context, err);
  const status = f.error === "VALIDATION" ? 400 : f.error === "UNAUTHORIZED" ? 401 : f.error === "FORBIDDEN" ? 403 : 500;
  return NextResponse.json({ ok: false, success: false, error: f.error, message: f.message }, { status });
}

const GENERIC_DB_MESSAGE = "The change could not be saved. Please try again.";

/** True if a message looks like raw database/infrastructure error text. */
export function isDbLikeMessage(message: unknown): boolean {
  return typeof message === "string" && DB_ERROR_HINT.test(message);
}

/** Returns the message unless it is raw database/infrastructure text (then a generic message). */
export function safeMessage(message: string): string {
  return isDbLikeMessage(message) ? GENERIC_DB_MESSAGE : message;
}

/**
 * Boundary scrub for results passed through from services: keeps the result's shape and type, but
 * on a failure (success === false or ok === false) replaces DB-like `error` / `message` strings with
 * a generic message (logged server-side). Successful results are returned unchanged.
 */
export function sanitizeActionResult<T>(context: string, res: T): T {
  if (!res || typeof res !== "object") return res;
  const r = res as Record<string, unknown>;
  const looksFailed = r.success === false || r.ok === false || (r.error != null && r.success !== true && r.ok !== true);
  if (!looksFailed) return res;
  let scrubbed = false;
  const out: Record<string, unknown> = { ...r };
  for (const key of ["error", "message"]) {
    const v = out[key];
    if (isDbLikeMessage(v)) {
      out[key] = key === "error" && r.ok === false ? "DB_ERROR" : GENERIC_DB_MESSAGE;
      scrubbed = true;
    } else if (v && typeof v === "object" && isDbLikeMessage((v as { message?: unknown }).message)) {
      out[key] = { ...(v as object), message: GENERIC_DB_MESSAGE };
      scrubbed = true;
    }
  }
  if (scrubbed) console.error(`[${context}] database error text scrubbed from result`);
  return out as T;
}
