import "server-only";

/**
 * F8 profile reads. Own profile: the caller's RLS session. Public profile: the server reads ONLY username + the month the
 * account was created, and ONLY when the student made the profile public — which the database allows only with a
 * username and the 18+ confirmation (no minor ever has a public profile). Nothing else is exposed.
 */
import type { AppSupabaseClient } from "@/lib/supabase/types";
import { createAdminServerSupabaseClient } from "@/lib/supabase/server";
import { normalizeUsername, USERNAME_RX } from "./username";

export type OwnProfile = { username: string | null; usernameChangedAt: string | null; profilePublic: boolean; adultConfirmed: boolean; leaderboardOptIn: boolean };

export async function loadOwnProfile(supabase: AppSupabaseClient, userId: string): Promise<OwnProfile | null> {
  const { data } = await supabase.from("user_profiles").select("username, username_changed_at, profile_public, adult_confirmed_at, leaderboard_opt_in").eq("id", userId).maybeSingle();
  if (!data) return null;
  return { username: data.username, usernameChangedAt: data.username_changed_at, profilePublic: data.profile_public === true, adultConfirmed: Boolean(data.adult_confirmed_at), leaderboardOptIn: data.leaderboard_opt_in === true };
}

export type PublicProfile = { username: string; memberSince: string };

export async function loadPublicProfile(username: string): Promise<PublicProfile | null> {
  const u = normalizeUsername(username);
  if (!USERNAME_RX.test(u)) return null;
  const { data } = await createAdminServerSupabaseClient()
    .from("user_profiles")
    .select("username, created_at")
    .eq("username", u)
    .eq("profile_public", true)
    .not("adult_confirmed_at", "is", null)
    .maybeSingle();
  if (!data?.username) return null;
  return { username: data.username, memberSince: data.created_at };
}
