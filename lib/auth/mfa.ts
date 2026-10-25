/**
 * AUTH-1 2b-3 — admin MFA (Supabase TOTP). Enforcement switch ADMIN_MFA_REQUIRED (server env; OFF unless exactly
 * "true"). LOCKOUT SAFETY: it stays off until the owner has enrolled an authenticator and verified it once
 * (docs/auth/ADMIN_MFA.md). When on, an admin / staff session must be AAL2 (signed in AND verified a TOTP code this
 * session) for every admin page, action and API route; students are never affected (the check runs only after the
 * admin / staff role is confirmed).
 */
export const ADMIN_MFA_PATH = "/admin/mfa";

export type AalLevel = "aal1" | "aal2" | null;

export function isAdminMfaRequired(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.ADMIN_MFA_REQUIRED === "true";
}

/** Pure: may this admin / staff session act? */
export function adminMfaSatisfied(required: boolean, current: AalLevel): boolean {
  return !required || current === "aal2";
}

type MfaClient = { auth: { mfa: { getAuthenticatorAssuranceLevel: () => Promise<{ data: { currentLevel: string | null } | null; error: unknown }> } } };

/** The session's current assurance level; any error → null (fails closed when MFA is required). */
export async function currentAal(client: MfaClient): Promise<AalLevel> {
  try {
    const { data, error } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error) return null;
    return data?.currentLevel === "aal2" ? "aal2" : data?.currentLevel === "aal1" ? "aal1" : null;
  } catch {
    return null;
  }
}
