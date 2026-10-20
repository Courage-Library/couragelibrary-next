/**
 * AUTH-1 Stage 2a (AUTH-RESILIENCE): a time limit on Supabase AUTH requests made by the session clients.
 *
 * supabase-js puts no timeout on its fetches, so a Supabase Auth endpoint that accepts the connection but never
 * answers kept a page (and the middleware in front of it) waiting indefinitely. Requests to `/auth/v1/` without a
 * caller signal are aborted after AUTH_FETCH_TIMEOUT_MS. auth-js reports the abort as AuthRetryableFetchError, which
 * the tri-state helper (lib/auth/session-state) classifies as "error" → retry UI, never a login redirect.
 * Data requests (PostgREST, storage) are passed through unchanged. Runtime-agnostic (middleware / edge safe).
 */

export const AUTH_FETCH_TIMEOUT_MS = 5000;

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

export const authTimeoutFetch: typeof fetch = async (input, init) => {
  if (init?.signal || !urlOf(input).includes("/auth/v1/")) return fetch(input, init);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AUTH_FETCH_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};
