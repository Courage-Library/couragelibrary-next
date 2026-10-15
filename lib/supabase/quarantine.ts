/**
 * COURAGE LIBRARY — QUARANTINED SUPABASE CLIENT (TYPES-1, architect rule 2)
 *
 * Quarantined modules (adaptive, live tests, battles, psychometrics, competition / candidate intelligence)
 * are switched off behind server flags (DRIFT-1c) and are KNOWN-BROKEN against the live schema: they read
 * tables / columns that were never deployed (DRIFT-1a/1b). Instead of per-line `as any` on their queries,
 * each quarantined file obtains its client once through `quarantinedClient`, which returns an explicitly
 * untyped client. Every use is registered (one entry per file) in docs/reports/types/TYPES1_ESCAPES.json
 * with its re-enable precondition.
 *
 * Only files of the quarantined modules may import this helper (scripts/test_types1.cjs, T-08).
 * Re-enabling a module requires deploying its schema, regenerating types and removing its quarantine.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/** Tag that ties a quarantined file to its register entry, e.g. `TYPES-1:C-ADAPTIVE-SESSION`. */
export type QuarantineTag = `TYPES-1:C-${string}`;

/**
 * A Supabase client with no schema typing. Queries made through it are NOT checked against the generated
 * types — by design, because the quarantined modules target schema that does not exist yet.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the single, registered quarantine escape (TYPES-1:C)
export type QuarantinedClient = SupabaseClient<any, any, any>;

export function quarantinedClient(client: unknown, tag: QuarantineTag): QuarantinedClient {
  if (!/^TYPES-1:C-[A-Z0-9-]+$/.test(tag)) throw new Error(`quarantinedClient: invalid tag ${tag}`);
  return client as QuarantinedClient;
}
