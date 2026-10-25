"use server";

/**
 * LEADERBOARD-GATE-1: the student's own leaderboard opt-in (default off). Stored in their own auth user_metadata —
 * a preference about themselves only; it decides whether their masked name is listed, never what anyone can read.
 */
import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function setLeaderboardOptInAction(input: { optIn: boolean; mockId: string }): Promise<{ ok: boolean }> {
  if (typeof input?.optIn !== "boolean") return { ok: false };
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { ok: false };
  const { error } = await supabase.auth.updateUser({ data: { leaderboard_opt_in: input.optIn } });
  if (error) return { ok: false };
  if (/^[0-9a-f-]{36}$/i.test(String(input.mockId))) revalidatePath(`/mock-tests/${input.mockId}/leaderboard`);
  return { ok: true };
}
