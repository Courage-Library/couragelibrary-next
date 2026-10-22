/**
 * AUTH-1 2b-1 (decision #66): Sign in with Google feature flag. Server-evaluated; default OFF.
 * ON only when AUTH_GOOGLE_ENABLED === "true" AND the public Google client id looks like a real Google web client id.
 * The Google client SECRET is never needed here: it lives only in the Supabase dashboard.
 * Pure and runtime-agnostic (used by middleware, the login page and the server action).
 */

const CLIENT_ID_SUFFIX = ".apps.googleusercontent.com";

/** The public Google web client id, or null when it is missing / malformed. */
export function googleClientId(env: NodeJS.ProcessEnv = process.env): string | null {
  const id = (env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "").trim();
  if (!id || !id.endsWith(CLIENT_ID_SUFFIX) || id.length <= CLIENT_ID_SUFFIX.length || id.length > 200) return null;
  if (!/^[A-Za-z0-9.-]+$/.test(id)) return null;
  return id;
}

export function isGoogleSignInEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.AUTH_GOOGLE_ENABLED === "true" && googleClientId(env) !== null;
}
