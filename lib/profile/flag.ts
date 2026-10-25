/**
 * F8 (#80) profiles + usernames. Server env only; OFF unless PROFILES_ENABLED is exactly "true". Stays OFF until the
 * owner has applied migration 20261025000096_f8_profile_username.sql. Off: /settings/profile and /u/<name> are 404 and
 * the account menu has no "Profile" link.
 */
export function isProfilesEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.PROFILES_ENABLED === "true";
}
