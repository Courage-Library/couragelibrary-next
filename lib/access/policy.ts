import "server-only";

import { createHash } from "node:crypto";
import { unstable_cache } from "next/cache";
import { cookies } from "next/headers";
import { createAdminServerSupabaseClient, createPublicServerSupabaseClient, createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * PAY-1 B2a: the ONE app-side entry to the admin-controlled access policy (docs/payments/PAY_1_DESIGN.md §7).
 * Free vs Pro is decided ONLY by the database function fn_access_allowed (switch off → allowed; FREE → allowed; anon →
 * refused; else the caller's own Pro). No Pro rule may be written anywhere else (B3 routes every check through here).
 * No cache, except the anonymous LESSON answer (LESSON-PERF-B3, below): invalidated by every admin write in the app, so
 * the policy still takes effect on the next request after an admin change.
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
  // LESSON-PERF-B3: an anonymous lesson reader gets the cached anonymous answer (see anonLessonAccess); null = use the
  // live check below (signed-in, any doubt, or any cache error)
  if (kind === "LESSON") {
    const cached = await anonLessonAccess(want);
    if (cached) return cached;
  }
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

/**
 * LESSON-PERF-B3 (owner decision 2026-11-18): the anonymous LESSON answer, cached.
 * - ONLY the access decision, ONLY for anonymous viewers: a request with NO Supabase session cookie, so the live check
 *   would run as anon anyway; any `sb-*` cookie (even an expired session) → null → the live per-request check. Never the
 *   lesson body, never anything for a signed-in user.
 * - The answer comes from the same database function (fn_access_allowed_many) called WITHOUT a user, so it is exactly
 *   what the live check answers an anonymous visitor. Key = the lesson keys (hashed) + the paywall switch value.
 * - Invalidated by tag ACCESS_CACHE_TAG on every admin policy / switch write (app/(site)/admin/access/actions.ts; the
 *   offline gate PAY1-B3 P4-08 fails if a write lacks it); 60 s backstop for writes outside the app (scripts).
 * - Fail-closed: any error, a missing key or a missing switch → nothing is cached and null is returned (live check).
 */
export const ACCESS_CACHE_TAG = "access-policy";
const ANON_TTL_S = 60;

let paywallCache: (() => Promise<"on" | "off">) | null = null; // created on first use, not at import
const cachedPaywall = () =>
  (paywallCache ??= unstable_cache(
    async (): Promise<"on" | "off"> => {
      const { data, error } = await createAdminServerSupabaseClient().from("access_settings").select("paywall_enabled").eq("id", true).maybeSingle();
      if (error || !data) throw new Error("ACCESS_SWITCH_READ_FAILED"); // a throw is never cached
      return data.paywall_enabled === true ? "on" : "off";
    },
    ["access-paywall", "v1"],
    { tags: [ACCESS_CACHE_TAG], revalidate: ANON_TTL_S },
  ))();

/**
 * NAV-1 Stage B: the paywall master switch for DISPLAY only (the "PRO" chip on Mistake Vault in the student sidebar) —
 * the same cached read as above (invalidated by the admin switch write), bounded and never rejecting: an unknown or
 * slow switch → false (no chip). It grants or blocks nothing; every access decision stays in the checks above.
 */
export function paywallOnForNav(ms = 800): Promise<boolean> {
  return Promise.race([
    cachedPaywall().then((s) => s === "on", () => false),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), ms)),
  ]);
}

/**
 * AUTH-UX-1: the paywall master switch for the auth pages' "Free during early access." note — DISPLAY only, the same
 * cached read, bounded and never rejecting. Unlike the nav chip an unknown switch is NOT "off": "unknown" → the note
 * is hidden (never claim "free" unless the switch is known to be off). Grants or blocks nothing.
 */
export function paywallSwitchForDisplay(ms = 800): Promise<"on" | "off" | "unknown"> {
  return Promise.race([
    cachedPaywall().then((s) => s, () => "unknown" as const),
    new Promise<"unknown">((resolve) => setTimeout(() => resolve("unknown"), ms)),
  ]);
}

async function anonLessonAccess(keys: string[]): Promise<Map<string, AccessAnswer> | null> {
  try {
    const jar = await cookies();
    if (jar.getAll().some((c) => c.name.startsWith("sb-"))) return null; // a session (or what may be one) → live
    const sorted = [...keys].sort();
    const sw = await cachedPaywall();
    const digest = createHash("sha256").update(sorted.join("\n")).digest("hex");
    const rows = await unstable_cache(
      async (): Promise<[string, AccessTier, boolean][]> => {
        const anon = createPublicServerSupabaseClient(); // no user: auth.uid() IS NULL, like a signed-out visitor
        const got = new Map<string, [AccessTier, boolean]>();
        for (let i = 0; i < sorted.length; i += 500) {
          const { data, error } = await anon.rpc("fn_access_allowed_many", { p_kind: "LESSON", p_keys: sorted.slice(i, i + 500) });
          if (error || !Array.isArray(data)) throw new Error("ACCESS_ANON_READ_FAILED");
          for (const r of data) got.set(r.item_key, [r.tier === "FREE" ? "FREE" : "PRO", r.allowed === true]);
        }
        if (sorted.some((k) => !got.has(k))) throw new Error("ACCESS_ANON_INCOMPLETE");
        return sorted.map((k) => [k, ...(got.get(k) as [AccessTier, boolean])]);
      },
      ["access-anon", "v1", "LESSON", sw, digest],
      { tags: [ACCESS_CACHE_TAG], revalidate: ANON_TTL_S },
    )();
    const out = new Map<string, AccessAnswer>();
    for (const [k, tier, allowed] of rows) out.set(k, { tier, allowed });
    return keys.every((k) => out.has(k)) ? out : null;
  } catch {
    return null; // fail-closed: the live check decides
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
