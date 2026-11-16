import "server-only";

import { createAdminServerSupabaseClient, createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * PAY-1 B2a: the ONE app-side entry to the admin-controlled access policy (docs/payments/PAY_1_DESIGN.md §7).
 * Free vs Pro is decided ONLY by the database function fn_access_allowed (switch off → allowed; FREE → allowed; anon →
 * refused; else the caller's own Pro). No Pro rule may be written anywhere else (B3 routes every check through here).
 * No cache: the policy takes effect on the next request after an admin change.
 */

export const ACCESS_KINDS = ["FEATURE", "MOCK_SERIES", "MOCK_TEST", "COURSE", "LESSON", "TOPIC"] as const;
export type AccessKind = (typeof ACCESS_KINDS)[number];
export type AccessTier = "FREE" | "PRO";

/** Feature codes the admin page lists (an unknown code is PRO — fail-closed — until the admin sets it). */
export const FEATURE_CODES = [
  { code: "ADVANCED_ANALYTICS", label: "Advanced analytics (performance)" },
  { code: "MISTAKE_VAULT", label: "Mistake Vault (viewing)" },
  { code: "MISTAKE_DRILLS", label: "Mistake Vault drills" },
  { code: "MEMORY_LOCK", label: "Memory Lock" },
  { code: "FLASHCARDS", label: "Flashcards" },
  { code: "PREMIUM_CA", label: "Premium current affairs" },
] as const;

export const ITEM_KEY_RX = /^(\*|[A-Za-z0-9_-]{1,64})$/;
export const isAccessKind = (v: unknown): v is AccessKind => typeof v === "string" && (ACCESS_KINDS as readonly string[]).includes(v);

/**
 * May the CURRENT user (session) use this item? Fails CLOSED (false) on any error. Runs as the user's own session, so
 * the database decides with auth.uid().
 */
export async function canAccess(kind: AccessKind, key: string): Promise<boolean> {
  try {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.rpc("fn_access_allowed", { p_kind: kind, p_key: key });
    return !error && data === true;
  } catch {
    return false;
  }
}

export type AccessAnswer = { tier: AccessTier; allowed: boolean };
const DENIED: AccessAnswer = { tier: "PRO", allowed: false };

/**
 * PAY-1 B3 (147): the central check for a LIST of keys in one call (fn_access_allowed_many — the same rule as
 * fn_access_allowed). Every key gets an answer; a key the database did not answer, or any error, is PRO + refused
 * (fail-closed). ≤ 500 keys per call (larger lists are split).
 */
export async function accessMany(kind: AccessKind, keys: string[]): Promise<Map<string, AccessAnswer>> {
  const want = [...new Set(keys.filter((k) => typeof k === "string" && k.length > 0))];
  const out = new Map<string, AccessAnswer>(want.map((k) => [k, DENIED]));
  if (!want.length) return out;
  try {
    const supabase = await createServerSupabaseClient();
    for (let i = 0; i < want.length; i += 500) {
      const { data, error } = await supabase.rpc("fn_access_allowed_many", { p_kind: kind, p_keys: want.slice(i, i + 500) });
      if (error || !Array.isArray(data)) continue;
      for (const r of data) if (out.has(r.item_key)) out.set(r.item_key, { tier: r.tier === "FREE" ? "FREE" : "PRO", allowed: r.allowed === true });
    }
  } catch {
    // fail-closed: every key stays PRO + refused
  }
  return out;
}

/** The resolved tier of an item (for showing a lock badge); PRO on any error (fail-closed). */
export async function accessTier(kind: AccessKind, key: string): Promise<AccessTier> {
  try {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.rpc("fn_access_tier", { p_kind: kind, p_key: key });
    return !error && data === "FREE" ? "FREE" : "PRO";
  } catch {
    return "PRO";
  }
}

export interface AccessPolicyRow {
  kind: AccessKind;
  key: string;
  tier: AccessTier;
  updatedAt: string;
}

/** ADMIN page only (the caller has passed requireAdminPage): every stored row + the paywall switch. */
export async function loadAccessPolicyForAdmin(): Promise<{ rows: AccessPolicyRow[]; paywallEnabled: boolean; error: boolean }> {
  const admin = createAdminServerSupabaseClient();
  const [rows, settings] = await Promise.all([
    admin.from("access_policies").select("item_kind, item_key, tier, updated_at").order("item_kind").order("item_key"),
    admin.from("access_settings").select("paywall_enabled").eq("id", true).maybeSingle(),
  ]);
  if (rows.error || settings.error) return { rows: [], paywallEnabled: false, error: true };
  return {
    rows: (rows.data ?? []).filter((r) => isAccessKind(r.item_kind)).map((r) => ({ kind: r.item_kind as AccessKind, key: r.item_key, tier: r.tier === "FREE" ? "FREE" : "PRO", updatedAt: r.updated_at })),
    paywallEnabled: settings.data?.paywall_enabled === true,
    error: false,
  };
}
