"use server";

import { revalidatePath } from "next/cache";
import { guardAdminAction } from "@/lib/auth/require-admin";
import type { ActionFailure } from "@/lib/auth/require-admin";
import { createAdminServerSupabaseClient } from "@/lib/supabase/server";
import { reportWriteFailure } from "@/lib/ops/write-failure";
import { ITEM_KEY_RX, isAccessKind } from "@/lib/access/policy";

/**
 * PAY-1 B2a: the admin "Free & Pro" page. ADMIN only (staff cannot change access). Every write goes through the
 * service-role database functions, which validate the input and write the audit row (actor, item, old → new).
 */
export type AccessActionResult = { ok: true; message: string } | { ok: false; error: string } | ActionFailure;

const PATH = "/admin/access";
const PAYWALL_CONFIRM = { on: "TURN ON", off: "TURN OFF" } as const;

export async function setAccessPolicyAction(payload: { kind: string; key: string; tier: string }): Promise<AccessActionResult> {
  const auth = await guardAdminAction();
  if (!auth.ok) return auth;
  const key = String(payload.key ?? "").trim();
  if (!isAccessKind(payload.kind) || !ITEM_KEY_RX.test(key) || (payload.tier !== "FREE" && payload.tier !== "PRO")) {
    return { ok: false, error: "Choose a kind, an item (a feature code, an id, or * for the default) and Free or Pro." };
  }
  const { error } = await createAdminServerSupabaseClient().rpc("fn_access_policy_set", {
    p_kind: payload.kind, p_key: key, p_tier: payload.tier, p_actor_id: auth.userId, p_actor_email: auth.userEmail || "unknown",
  });
  if (error) {
    reportWriteFailure({ fn: "setAccessPolicyAction", table: "access_policies", op: "rpc", code: error.code, ids: {} });
    return { ok: false, error: "The change could not be saved. Please try again." };
  }
  revalidatePath(PATH);
  return { ok: true, message: `${payload.kind} ${key} is now ${payload.tier === "FREE" ? "Free" : "Pro"}.` };
}

export async function clearAccessPolicyAction(payload: { kind: string; key: string }): Promise<AccessActionResult> {
  const auth = await guardAdminAction();
  if (!auth.ok) return auth;
  const key = String(payload.key ?? "").trim();
  if (!isAccessKind(payload.kind) || !ITEM_KEY_RX.test(key) || key === "*") return { ok: false, error: "A default cannot be removed; set it to Free or Pro instead." };
  const { error } = await createAdminServerSupabaseClient().rpc("fn_access_policy_clear", { p_kind: payload.kind, p_key: key, p_actor_id: auth.userId, p_actor_email: auth.userEmail || "unknown" });
  if (error) {
    reportWriteFailure({ fn: "clearAccessPolicyAction", table: "access_policies", op: "rpc", code: error.code, ids: {} });
    return { ok: false, error: "The override could not be removed. Please try again." };
  }
  revalidatePath(PATH);
  return { ok: true, message: `${payload.kind} ${key} now follows its default.` };
}

/** The paywall master switch: the admin must type the exact confirmation phrase. */
export async function setPaywallAction(payload: { enabled: boolean; confirm: string }): Promise<AccessActionResult> {
  const auth = await guardAdminAction();
  if (!auth.ok) return auth;
  const want = payload.enabled === true ? PAYWALL_CONFIRM.on : PAYWALL_CONFIRM.off;
  if (typeof payload.enabled !== "boolean" || payload.confirm !== want) return { ok: false, error: `Type ${want} to confirm.` };
  const { error } = await createAdminServerSupabaseClient().rpc("fn_paywall_set", { p_enabled: payload.enabled, p_actor_id: auth.userId, p_actor_email: auth.userEmail || "unknown" });
  if (error) {
    reportWriteFailure({ fn: "setPaywallAction", table: "access_settings", op: "rpc", code: error.code, ids: {} });
    return { ok: false, error: "The switch could not be changed. Please try again." };
  }
  revalidatePath(PATH);
  return { ok: true, message: payload.enabled ? "The paywall is ON: Pro items now need Pro." : "The paywall is OFF: everything is open." };
}
