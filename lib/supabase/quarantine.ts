/**
 * COURAGE LIBRARY — QUARANTINED SUPABASE CLIENT (TYPES-1, architect rule 2)
 *
 * Quarantined modules (adaptive, live tests, battles, psychometrics, competition / candidate intelligence)
 * are switched off behind server flags (DRIFT-1c) and are KNOWN-BROKEN against the live schema: they read
 * tables / columns / functions that were never deployed (DRIFT-1a/1b). Instead of per-line `as any` on their
 * queries, each quarantined file obtains its client through `quarantinedClient`, which returns an explicitly
 * untyped client. Every quarantined file is registered (one entry per file, tag `TYPES-1:C-<NAME>`) in
 * docs/reports/types/TYPES1_ESCAPES.json with its re-enable precondition.
 *
 * Only files of the quarantined modules may import this helper (scripts/test_types1.cjs, T-08).
 * Re-enabling a module requires deploying its schema, regenerating types and removing its quarantine.
 */

/** Tag that ties a quarantined file to its register entry, e.g. `TYPES-1:C-ADAPTIVE-SESSION`. */
export type QuarantineTag = `TYPES-1:C-${string}`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the single, registered quarantine escape (TYPES-1:C)
type Untyped = any;

/**
 * A Supabase client with NO schema typing: query builders and results are untyped. Queries made through it
 * are not checked against the generated types — by design, because the quarantined modules target schema
 * that does not exist yet.
 */
export interface QuarantinedClient {
  from(relation: string): Untyped;
  rpc(fn: string, args?: Record<string, unknown>, options?: Record<string, unknown>): Untyped;
  schema(schema: string): Untyped;
  readonly storage: Untyped;
  readonly auth: Untyped;
}

/** A row read through a QuarantinedClient (untyped by design; same registered escape). */
export type QuarantinedRow = Untyped;

export function quarantinedClient(client: unknown, tag: QuarantineTag): QuarantinedClient {
  if (!/^TYPES-1:C-[A-Z0-9-]+$/.test(tag)) throw new Error(`quarantinedClient: invalid tag ${tag}`);
  return client as QuarantinedClient;
}
