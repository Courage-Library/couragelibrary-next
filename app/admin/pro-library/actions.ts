"use server";

import { revalidatePath } from "next/cache";
import { guardAdminAction } from "@/lib/auth/require-admin";
import { createAdminServerSupabaseClient } from "@/lib/supabase/server";
import { reportWriteFailure } from "@/lib/ops/write-failure";
import type { ActionFailure } from "@/lib/auth/require-admin";

/**
 * F9-B library members: admin-granted Pro (no payment). ADMIN only (staff cannot grant); the database function
 * (fn_grant_library_pro / fn_revoke_library_pro, service role) writes the entitlement + audit row; revoke never deletes.
 * A grant always has an end date (an open-ended grant would block the member from ever buying).
 */
export type LibraryActionResult = { ok: true; message: string } | { ok: false; error: string } | ActionFailure;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_DAYS = 400;

export async function grantLibraryProAction(payload: { userId: string; validUntil: string }): Promise<LibraryActionResult> {
  const auth = await guardAdminAction();
  if (!auth.ok) return auth;
  if (!UUID.test(payload.userId ?? "")) return { ok: false, error: "Choose a member first." };
  const until = new Date(`${payload.validUntil}T23:59:59+05:30`);
  const days = (until.getTime() - Date.now()) / 86400e3;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.validUntil ?? "") || Number.isNaN(days) || days <= 0 || days > MAX_DAYS) {
    return { ok: false, error: `Choose an end date between tomorrow and ${MAX_DAYS} days from today.` };
  }
  const { data, error } = await createAdminServerSupabaseClient().rpc("fn_grant_library_pro", { p_user_id: payload.userId, p_valid_until: until.toISOString(), p_admin_id: auth.userId });
  const r = (data ?? {}) as { success?: boolean; code?: string };
  if (error || r.success !== true) {
    if (error) reportWriteFailure({ fn: "grantLibraryProAction", table: "user_entitlements", op: "rpc", code: error.code, ids: { user_id: payload.userId } });
    return { ok: false, error: error ? "The grant could not be saved. Please try again." : `The grant was refused (${r.code ?? "UNKNOWN"}).` };
  }
  revalidatePath("/admin/students/library-pro");
  return { ok: true, message: "Library Pro granted." };
}

export async function revokeLibraryProAction(payload: { entitlementId: string }): Promise<LibraryActionResult> {
  const auth = await guardAdminAction();
  if (!auth.ok) return auth;
  if (!UUID.test(payload.entitlementId ?? "")) return { ok: false, error: "Unknown grant." };
  const { data, error } = await createAdminServerSupabaseClient().rpc("fn_revoke_library_pro", { p_entitlement_id: payload.entitlementId, p_admin_id: auth.userId });
  const r = (data ?? {}) as { success?: boolean; code?: string };
  if (error || r.success !== true) {
    if (error) reportWriteFailure({ fn: "revokeLibraryProAction", table: "user_entitlements", op: "rpc", code: error.code, ids: { entitlement_id: payload.entitlementId } });
    return { ok: false, error: error ? "The grant could not be revoked. Please try again." : `The revoke was refused (${r.code ?? "UNKNOWN"}).` };
  }
  revalidatePath("/admin/students/library-pro");
  return { ok: true, message: "Library Pro revoked." };
}
