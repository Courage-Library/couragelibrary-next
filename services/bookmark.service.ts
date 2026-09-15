import { createServerSupabaseClient } from "@/lib/supabase/server";

export interface BookmarkToggleResult {
  success: boolean;
  isBookmarked: boolean;
  error?: string;
}

export class BookmarkService {
  /**
   * Toggles bookmark state for a question.
   * Derives user identity strictly from the authenticated server session.
   */
  static async toggleQuestionBookmark(
    questionId: string,
    questionVersionId?: string,
    sourceAttemptId?: string
  ): Promise<BookmarkToggleResult> {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        success: false,
        isBookmarked: false,
        error: "Authentication required to bookmark questions.",
      };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;

    // 1. Check if bookmark already exists
    const { data: existing, error: checkError } = await sb
      .from("user_question_bookmarks")
      .select("id")
      .eq("user_id", user.id)
      .eq("question_id", questionId)
      .maybeSingle();

    if (checkError) {
      return {
        success: false,
        isBookmarked: false,
        error: checkError.message || "Failed to check bookmark status.",
      };
    }

    // 2. If exists -> Delete bookmark (Unbookmark)
    if (existing) {
      const { error: deleteError } = await sb
        .from("user_question_bookmarks")
        .delete()
        .eq("user_id", user.id)
        .eq("question_id", questionId);

      if (deleteError) {
        return {
          success: false,
          isBookmarked: true,
          error: deleteError.message || "Failed to remove bookmark.",
        };
      }

      return {
        success: true,
        isBookmarked: false,
      };
    }

    // 3. If does not exist -> Resolve version if not provided and Insert
    let resolvedVersionId = questionVersionId;
    if (!resolvedVersionId) {
      const { data: qv } = await sb
        .from("question_versions")
        .select("id")
        .eq("question_id", questionId)
        .order("version_number", { ascending: false })
        .limit(1)
        .maybeSingle();

      resolvedVersionId = qv?.id;
    }

    if (!resolvedVersionId) {
      return {
        success: false,
        isBookmarked: false,
        error: "Question version reference could not be resolved.",
      };
    }

    const { error: insertError } = await sb
      .from("user_question_bookmarks")
      .upsert(
        {
          user_id: user.id,
          question_id: questionId,
          question_version_id: resolvedVersionId,
          source_attempt_id: sourceAttemptId || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,question_id" }
      );

    if (insertError) {
      return {
        success: false,
        isBookmarked: false,
        error: insertError.message || "Failed to save bookmark.",
      };
    }

    return {
      success: true,
      isBookmarked: true,
    };
  }

  /**
   * Batch resolves bookmark status for a list of question IDs in 1 single database query.
   * Returns a map of { [questionId]: boolean }.
   */
  static async getBookmarkedQuestionIdMap(
    questionIds: string[]
  ): Promise<Record<string, boolean>> {
    if (!questionIds || questionIds.length === 0) {
      return {};
    }

    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      const emptyMap: Record<string, boolean> = {};
      questionIds.forEach((id) => {
        emptyMap[id] = false;
      });
      return emptyMap;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const { data: bookmarks } = await sb
      .from("user_question_bookmarks")
      .select("question_id")
      .eq("user_id", user.id)
      .in("question_id", questionIds);

    const bookmarkMap: Record<string, boolean> = {};
    questionIds.forEach((id) => {
      bookmarkMap[id] = false;
    });

    if (bookmarks && Array.isArray(bookmarks)) {
      bookmarks.forEach((b: { question_id: string }) => {
        bookmarkMap[b.question_id] = true;
      });
    }

    return bookmarkMap;
  }

  /**
   * Checks whether a single question is bookmarked by the current candidate.
   */
  static async isQuestionBookmarked(questionId: string): Promise<boolean> {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return false;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const { data } = await sb
      .from("user_question_bookmarks")
      .select("id")
      .eq("user_id", user.id)
      .eq("question_id", questionId)
      .maybeSingle();

    return Boolean(data?.id);
  }

  /**
   * Returns all question IDs bookmarked by the current candidate.
   */
  static async getBookmarkedQuestionIds(): Promise<string[]> {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const { data } = await sb
      .from("user_question_bookmarks")
      .select("question_id")
      .eq("user_id", user.id);

    return (data || []).map((row: { question_id: string }) => row.question_id);
  }
}
