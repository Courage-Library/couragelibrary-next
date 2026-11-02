import "server-only";
import { createAdminServerSupabaseClient } from "@/lib/supabase/server";

/**
 * USERNAME-1 (owner ruling 2026-11-02: PUBLIC IDENTITY = USERNAME). What other people see for a user: the username, or
 * "Courage Library Team" (with the verified badge) for staff / admin — never a real name, e-mail, phone or user id.
 * Resolved on the SERVER only, through fn_public_identities (migration 134: SECURITY DEFINER, service_role only, ≤ 100
 * ids per call). Callers pass the label (and isTeam) to the page — never the id. A failed read → "Member" for everyone.
 */
export interface PublicIdentity {
  label: string;
  isTeam: boolean;
}

export const PUBLIC_MEMBER: PublicIdentity = { label: "Member", isTeam: false };
export const TEAM_LABEL = "Courage Library Team";
export const PUBLIC_IDENTITY_BATCH = 100;

export async function resolvePublicIdentities(ids: readonly string[]): Promise<Map<string, PublicIdentity>> {
  const out = new Map<string, PublicIdentity>();
  const unique = [...new Set(ids.filter((x) => typeof x === "string" && x.length > 0))];
  if (unique.length === 0) return out;
  try {
    const db = createAdminServerSupabaseClient();
    for (let i = 0; i < unique.length; i += PUBLIC_IDENTITY_BATCH) {
      const { data, error } = await db.rpc("fn_public_identities", { p_ids: unique.slice(i, i + PUBLIC_IDENTITY_BATCH) });
      if (error || !Array.isArray(data)) continue;
      for (const r of data as Array<{ id: string; label: string; is_team: boolean }>) {
        out.set(r.id, r.is_team ? { label: TEAM_LABEL, isTeam: true } : { label: r.label || PUBLIC_MEMBER.label, isTeam: false });
      }
    }
  } catch {
    /* "Member" for everyone below */
  }
  return out;
}

/** The label for one id from a resolved map ("Member" when unknown). */
export function identityOf(map: Map<string, PublicIdentity>, id: string | null | undefined): PublicIdentity {
  return (id && map.get(id)) || PUBLIC_MEMBER;
}
