"use server";

/**
 * F8 server actions — thin, validated wrappers over fn_set_username / fn_set_profile_visibility (migration 096). The
 * database is authoritative (format, blocklist, 30-day limit, uniqueness, 18+ rule); codes are fixed, never DB text.
 */
import { revalidatePath } from "next/cache";
import { createAdminServerSupabaseClient, createServerSupabaseClient } from "@/lib/supabase/server";
import { getSessionState } from "@/lib/auth/session-state";
import { isProfilesEnabled } from "@/lib/profile/flag";
import { checkUsername, normalizeUsername } from "@/lib/profile/username";

const USERNAME_CODES = ["SET", "UNCHANGED", "INVALID_FORMAT", "NOT_ALLOWED", "TAKEN", "TOO_SOON", "NOT_SIGNED_IN"] as const;
const VISIBILITY_CODES = ["PUBLIC", "PRIVATE", "NEED_USERNAME", "NEED_ADULT_CONFIRMATION", "NOT_SIGNED_IN"] as const;
const LEADERBOARD_CODES = ["OPTED_IN", "OPTED_OUT", "NEED_ADULT_CONFIRMATION", "NOT_SIGNED_IN"] as const;
export type LeaderboardCode = (typeof LEADERBOARD_CODES)[number] | "FAILED";
export type UsernameCode = (typeof USERNAME_CODES)[number] | "FAILED";
export type VisibilityCode = (typeof VISIBILITY_CODES)[number] | "FAILED";

function codeOf(data: unknown, error: unknown): string {
  if (error || !data || typeof data !== "object" || Array.isArray(data)) return "FAILED";
  return String((data as Record<string, unknown>).code);
}

export async function setUsernameAction(input: { username: string }): Promise<UsernameCode> {
  if (!isProfilesEnabled()) return "FAILED";
  const local = checkUsername(String(input?.username ?? ""));
  if (local !== "OK") return local; // instant answer; the database checks again
  const supabase = await createServerSupabaseClient();
  const session = await getSessionState(supabase);
  if (session.state !== "user") return session.state === "none" ? "NOT_SIGNED_IN" : "FAILED";
  const { data, error } = await supabase.rpc("fn_set_username", { p_username: String(input.username) });
  revalidatePath("/settings/profile");
  const code = codeOf(data, error);
  return USERNAME_CODES.find((c) => c === code) ?? "FAILED";
}

// USERNAME-1: availability — yes / no only (never who holds a name, never "held for 90 days" vs "taken"), signed-in
// only, at most AVAILABILITY_PER_MINUTE checks per user per minute (per server instance; the save is authoritative)
const AVAILABILITY_PER_MINUTE = 10;
const availabilityHits = new Map<string, number[]>();
export type AvailabilityAnswer = "AVAILABLE" | "NOT_AVAILABLE" | "INVALID_FORMAT" | "NOT_ALLOWED" | "RATE_LIMITED" | "NOT_SIGNED_IN" | "FAILED";

export async function checkUsernameAvailabilityAction(input: { username: string }): Promise<AvailabilityAnswer> {
  if (!isProfilesEnabled()) return "FAILED";
  const local = checkUsername(String(input?.username ?? ""));
  if (local !== "OK") return local;
  const supabase = await createServerSupabaseClient();
  const session = await getSessionState(supabase);
  if (session.state !== "user") return session.state === "none" ? "NOT_SIGNED_IN" : "FAILED";
  const uid = session.user.id;
  const now = Date.now();
  const recent = (availabilityHits.get(uid) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= AVAILABILITY_PER_MINUTE) return "RATE_LIMITED";
  availabilityHits.set(uid, [...recent, now]);
  const name = normalizeUsername(input.username);
  try {
    const db = createAdminServerSupabaseClient(); // server-only: other users' rows are never sent to the browser
    const holdFrom = new Date(now - 90 * 86_400_000).toISOString();
    const [taken, held] = await Promise.all([
      db.from("user_profiles").select("id", { count: "exact", head: true }).eq("username", name).neq("id", uid),
      db.from("username_history").select("id", { count: "exact", head: true }).eq("username", name).neq("user_id", uid).or(`released_at.is.null,released_at.gt.${holdFrom}`),
    ]);
    if (taken.error || held.error) return "FAILED";
    return (taken.count ?? 0) + (held.count ?? 0) === 0 ? "AVAILABLE" : "NOT_AVAILABLE";
  } catch {
    return "FAILED";
  }
}

export async function setProfileVisibilityAction(input: { public: boolean; confirmAdult: boolean }): Promise<VisibilityCode> {
  if (!isProfilesEnabled() || typeof input?.public !== "boolean") return "FAILED";
  const supabase = await createServerSupabaseClient();
  const session = await getSessionState(supabase);
  if (session.state !== "user") return session.state === "none" ? "NOT_SIGNED_IN" : "FAILED";
  const { data, error } = await supabase.rpc("fn_set_profile_visibility", { p_public: input.public, p_confirm_adult: input.confirmAdult === true });
  revalidatePath("/settings/profile");
  const code = codeOf(data, error);
  return VISIBILITY_CODES.find((c) => c === code) ?? "FAILED";
}

/**
 * Architect ruling (a): the leaderboard opt-in is user_profiles.leaderboard_opt_in, written ONLY by
 * fn_set_leaderboard_opt_in (auth.uid(); under-18 rejected). With confirmAdult the 18+ confirmation is recorded first
 * through fn_set_profile_visibility WITHOUT changing whether the profile is public.
 */
export async function setLeaderboardOptInAction(input: { optIn: boolean; confirmAdult: boolean; keepPublic: boolean }): Promise<LeaderboardCode> {
  if (!isProfilesEnabled() || typeof input?.optIn !== "boolean") return "FAILED";
  const supabase = await createServerSupabaseClient();
  const session = await getSessionState(supabase);
  if (session.state !== "user") return session.state === "none" ? "NOT_SIGNED_IN" : "FAILED";
  if (input.optIn && input.confirmAdult === true) {
    const v = await supabase.rpc("fn_set_profile_visibility", { p_public: input.keepPublic === true, p_confirm_adult: true });
    if (v.error) return "FAILED";
  }
  const { data, error } = await supabase.rpc("fn_set_leaderboard_opt_in", { p_opt_in: input.optIn });
  revalidatePath("/settings/profile");
  const code = codeOf(data, error);
  return LEADERBOARD_CODES.find((c) => c === code) ?? "FAILED";
}
