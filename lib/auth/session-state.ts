/**
 * AUTH-1 Stage 2a (AUTH-RESILIENCE): tri-state session result.
 *
 * `supabase.auth.getUser()` reports a transient infrastructure failure (network error, timeout, Supabase 5xx) the same
 * way as "nobody is signed in" unless the error is inspected. Treating such a failure as "signed out" sent signed-in
 * students to the login page and rendered the anonymous shell during Supabase blips. This module separates the three
 * outcomes:
 *   user  — a verified session user
 *   none  — no session, or an invalid / expired one (a real "signed out")
 *   error — we could not find out (transient); callers must show a retry state, never protected data, never a
 *           login redirect, and admin guards must deny
 * Pure and runtime-agnostic (middleware / edge safe): it only inspects the client's result.
 */

export type SessionState<U> = { state: "user"; user: U } | { state: "none" } | { state: "error" };

type AuthLikeError = { name?: string; message?: string; status?: number; code?: string } | null | undefined;

const TRANSIENT_MESSAGE = /fetch failed|network|timed? ?out|timeout|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|UND_ERR|socket|aborted/i;

/** True when the error means "could not reach / could not ask Supabase", not "no valid session". */
export function isTransientAuthError(err: unknown): boolean {
  if (!err) return false;
  const e = err as AuthLikeError & { cause?: unknown };
  if (e?.name === "AuthRetryableFetchError") return true;
  if (typeof e?.status === "number" && (e.status === 0 || e.status >= 500)) return true;
  if (e?.name === "AbortError" || e?.name === "TimeoutError") return true;
  if (typeof e?.message === "string" && TRANSIENT_MESSAGE.test(e.message)) return true;
  const cause = e?.cause as AuthLikeError;
  return Boolean(cause && typeof cause.message === "string" && TRANSIENT_MESSAGE.test(cause.message));
}

/** Classifies a getUser() result (or a thrown error) into the three states. */
export function classifyAuthResult<U>(user: U | null | undefined, error: unknown): SessionState<U> {
  if (user) return { state: "user", user };
  if (error && isTransientAuthError(error)) return { state: "error" };
  return { state: "none" };
}

type GetUserClient<U> = { auth: { getUser: () => Promise<{ data: { user: U | null } | null; error: unknown }> } };

/** Runs getUser() on the given Supabase client and classifies the result; never throws. */
export async function getSessionState<U>(client: GetUserClient<U>): Promise<SessionState<U>> {
  try {
    const { data, error } = await client.auth.getUser();
    return classifyAuthResult(data?.user ?? null, error);
  } catch {
    // getUser() reports "no session" as a returned error, never a throw: a thrown error is infrastructure trouble.
    return { state: "error" };
  }
}
