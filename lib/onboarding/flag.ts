/**
 * F0 onboarding (decision #76) feature flag. Server env only (no NEXT_PUBLIC_, no client override); OFF unless
 * ONBOARDING_ENABLED is exactly "true". Stays OFF until the owner has applied migration 20261025000091_f0_onboarding.sql
 * (after a backup); with the flag off there is no redirect, no dashboard card, no menu link and /onboarding is 404.
 */
export function isOnboardingEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.ONBOARDING_ENABLED === "true";
}
