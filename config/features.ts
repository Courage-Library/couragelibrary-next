/**
 * Server-side feature flags (DRIFT-1c feature quarantine).
 *
 * Features whose database objects are not deployed (DRIFT-1a/1b: migrations 038–051 are
 * SUPERSEDED_NOT_APPLIED) are switched off so their routes, actions and services are never
 * reached. Flags are read from server env only — not NEXT_PUBLIC_, no client override.
 *
 * Parsing: an explicit value enables a feature only when it is exactly "true"; any other
 * explicit value disables it. When the variable is unset, the documented default applies.
 */

export type FeatureKey = 'ADAPTIVE' | 'LIVE_TESTS' | 'PSYCHOMETRICS' | 'BATTLES';

export const FEATURE_ENV: Record<FeatureKey, string> = {
  ADAPTIVE: 'FEATURE_ADAPTIVE',
  LIVE_TESTS: 'FEATURE_LIVE_TESTS',
  PSYCHOMETRICS: 'FEATURE_PSYCHOMETRICS',
  BATTLES: 'FEATURE_BATTLES',
};

/** Defaults when the env var is unset. BATTLES decided by the DRIFT-1c functional check. */
export const FEATURE_DEFAULTS: Record<FeatureKey, boolean> = {
  ADAPTIVE: false,
  LIVE_TESTS: false,
  PSYCHOMETRICS: false,
  BATTLES: false,
};

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  ADAPTIVE: 'Adaptive testing',
  LIVE_TESTS: 'Live tests',
  PSYCHOMETRICS: 'Performance intelligence',
  BATTLES: 'Quiz battles',
};

export function isFeatureEnabled(key: FeatureKey): boolean {
  const raw = process.env[FEATURE_ENV[key]];
  if (raw === undefined || raw === '') return FEATURE_DEFAULTS[key];
  return raw === 'true';
}

export function getFeatureFlags(): Record<FeatureKey, boolean> {
  return {
    ADAPTIVE: isFeatureEnabled('ADAPTIVE'),
    LIVE_TESTS: isFeatureEnabled('LIVE_TESTS'),
    PSYCHOMETRICS: isFeatureEnabled('PSYCHOMETRICS'),
    BATTLES: isFeatureEnabled('BATTLES'),
  };
}

export const FEATURE_DISABLED_CODE = 'FEATURE_DISABLED' as const;
