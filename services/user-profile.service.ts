import { createServerSupabaseClient } from "@/lib/supabase/server";

export interface UserProfileRecord {
  id: string;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  language_preference: "en" | "hi";
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export class UserProfileService {
  /**
   * Authoritative, idempotent profile synchronization.
   * Ensures a 1:1 user_profiles row exists for any authenticated Supabase user.
   */
  static async ensureProfile(user: {
    id: string;
    email?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    user_metadata?: Record<string, any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    raw_user_meta_data?: Record<string, any>;
  }): Promise<UserProfileRecord | null> {
    if (!user || !user.id) return null;

    try {
      const supabaseRaw = await createServerSupabaseClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = supabaseRaw as any;

      const meta = user.user_metadata || user.raw_user_meta_data || {};
      const fullName = meta.full_name || meta.name || user.email?.split("@")[0] || "Student";
      const langPref = meta.language_preference === "hi" ? "hi" : "en";

      const { data, error } = await supabase
        .from("user_profiles")
        .upsert(
          {
            id: user.id,
            full_name: fullName,
            language_preference: langPref,
            is_active: true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" }
        )
        .select("*")
        .single();

      if (error) {
        console.error(`[UserProfileService] Error ensuring profile for user ${user.id}:`, error.message);
        return null;
      }

      return data as UserProfileRecord;
    } catch (err) {
      console.error(`[UserProfileService] Unexpected error ensuring profile:`, err);
      return null;
    }
  }

  /**
   * Fetch user profile by Auth user ID.
   */
  static async getProfileById(userId: string): Promise<UserProfileRecord | null> {
    if (!userId) return null;

    try {
      const supabaseRaw = await createServerSupabaseClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = supabaseRaw as any;

      const { data, error } = await supabase
        .from("user_profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();

      if (error) {
        console.error(`[UserProfileService] Error fetching profile for ${userId}:`, error.message);
        return null;
      }

      return data as UserProfileRecord;
    } catch (err) {
      console.error(`[UserProfileService] Unexpected error fetching profile:`, err);
      return null;
    }
  }
}
