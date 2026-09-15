"use server";

import { revalidatePath } from "next/cache";
import { MistakeService, DrillConfigOptions, DrillSessionPayload, DrillSubmissionResult } from "@/services/mistake.service";
import { BookmarkService } from "@/services/bookmark.service";
import { MistakeLongitudinalIntelligenceService } from "@/services/mistake-longitudinal-intelligence.service";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  LongitudinalWindowType,
  MistakeLongitudinalOverview,
} from "@/types/mistake-longitudinal-intelligence";

export interface NoteActionResult {
  success: boolean;
  error?: string;
}

export interface BookmarkActionResult {
  success: boolean;
  isBookmarked: boolean;
  error?: string;
}

export interface LongitudinalActionResult {
  success: boolean;
  data?: MistakeLongitudinalOverview;
  error?: string;
}

/**
 * Server Action: Saves candidate's personal revision note on a mistake vault record.
 * Identity is derived strictly from the authenticated server session inside MistakeService.
 */
export async function saveMistakeNoteAction(
  vaultId: string,
  noteText: string | null
): Promise<NoteActionResult> {
  if (!vaultId) {
    return { success: false, error: "Invalid mistake record reference." };
  }

  const result = await MistakeService.updateMistakeNote(vaultId, noteText);

  if (result.success) {
    revalidatePath("/mistakes");
    revalidatePath(`/mistakes/${vaultId}`);
  }

  return result;
}

/**
 * Server Action: Toggles candidate bookmark status for a question.
 * Identity is derived strictly from the authenticated server session inside BookmarkService.
 */
export async function toggleBookmarkAction(
  questionId: string,
  questionVersionId?: string
): Promise<BookmarkActionResult> {
  if (!questionId) {
    return { success: false, isBookmarked: false, error: "Invalid question reference." };
  }

  const result = await BookmarkService.toggleQuestionBookmark(
    questionId,
    questionVersionId
  );

  if (result.success) {
    revalidatePath("/mistakes");
  }

  return result;
}

/**
 * Server Action: Generates a new Mistake Drill session for the authenticated candidate.
 * Applies deterministic MPI ranking, filters, and complete answer-key scrubbing.
 */
export async function generateDrillAction(
  config: DrillConfigOptions
): Promise<DrillSessionPayload> {
  const result = await MistakeService.generateMistakeDrill(config);
  if (result.success) {
    revalidatePath("/mistakes");
    revalidatePath("/mistakes/drill");
  }
  return result;
}

/**
 * Server Action: Submits candidate drill responses for server-authoritative evaluation.
 * Advances streak and mastery status, updates vault records, and awards gamification coins.
 */
export async function submitDrillAction(
  drillId: string,
  responses: Array<{
    vault_id?: string;
    question_id: string;
    selected_option_key?: string;
    selected_option_id?: string;
    response_time_seconds?: number;
  }>
): Promise<DrillSubmissionResult> {
  if (!drillId) {
    return { success: false, error: "Drill ID is required for submission." };
  }

  const result = await MistakeService.submitMistakeDrill(drillId, responses);
  if (result.success) {
    revalidatePath("/mistakes");
    revalidatePath("/mistakes/drill");
  }
  return result;
}

/**
 * Server Action: Fetches candidate longitudinal overview with dynamic window selection.
 * Identity is derived strictly from authenticated server session with zero trust of client user_id.
 */
export async function fetchLongitudinalOverviewAction(
  windowType: LongitudinalWindowType = "30D",
  subjectId?: string
): Promise<LongitudinalActionResult> {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "Authentication required to view longitudinal intelligence." };
    }

    const data = await MistakeLongitudinalIntelligenceService.getLongitudinalOverview(
      supabase as any,
      user.id,
      {
        windowDays: windowType,
        subjectId: subjectId === "ALL" ? undefined : subjectId,
      }
    );

    return { success: true, data };
  } catch (err: any) {
    console.error("[fetchLongitudinalOverviewAction] Error:", err);
    return { success: false, error: err?.message || "Failed to load longitudinal intelligence." };
  }
}
