import { notFound } from "next/navigation";
import { NextResponse } from "next/server";
import { FEATURE_DISABLED_CODE, FEATURE_LABELS, type FeatureKey, isFeatureEnabled } from "@/config/features";

/** Server components: 404 before any data access when the feature is off. */
export function requireFeatureOrNotFound(key: FeatureKey): void {
  if (!isFeatureEnabled(key)) notFound();
}

/** API routes: 404 JSON before auth/DB when the feature is off; null when enabled. */
export function featureDisabledApiResponse(key: FeatureKey): NextResponse | null {
  if (isFeatureEnabled(key)) return null;
  return NextResponse.json(
    { success: false, code: FEATURE_DISABLED_CODE, error: `${FEATURE_LABELS[key]} is not enabled.` },
    { status: 404 }
  );
}

/** Server actions: result object to return early when the feature is off; null when enabled. */
export function featureDisabledActionResult(
  key: FeatureKey
): { success: false; error: string; code: typeof FEATURE_DISABLED_CODE } | null {
  if (isFeatureEnabled(key)) return null;
  return { success: false, error: `${FEATURE_LABELS[key]} is not enabled.`, code: FEATURE_DISABLED_CODE };
}
