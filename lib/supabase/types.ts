/**
 * COURAGE LIBRARY — Supabase client types (TYPES-1).
 *
 * `AppSupabaseClient` is the one client type for code that receives a client as a parameter (server, browser and
 * admin factories all return it), instead of `supabase: any`.
 *
 * `fromSsrClient()` is the single, documented adapter for @supabase/ssr 0.5.2: it declares its result with the
 * pre-2.5x generic order `SupabaseClient<Database, SchemaName, Schema>`, which supabase-js 2.109 reads as
 * `<Database, SchemaNameOrClientOptions, SchemaName>` — every table then resolves to `never`. The runtime object
 * IS a supabase-js SupabaseClient, so the factories state its real type here. Remove when @supabase/ssr is
 * upgraded to a release built against supabase-js ≥ 2.5x generics (TYPES-1 B6 report, "ssr upgrade" option).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export type AppSupabaseClient = SupabaseClient<Database>;

export function fromSsrClient(client: unknown): AppSupabaseClient {
  return client as AppSupabaseClient;
}
