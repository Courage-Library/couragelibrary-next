"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { LiveTestRegistrationService } from "@/services/live-test-registration.service";
import { LiveTestRunnerService } from "@/services/live-test-runner.service";
import { LiveAnswerPayload } from "@/types/live-test";
import { revalidatePath } from "next/cache";

export async function registerForLiveTestAction(eventId: string) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "Please log in to register for this live mock." };
    }

    const res = await LiveTestRegistrationService.registerCandidate(eventId, user.id);
    if (res.success) {
      revalidatePath("/live-tests");
      revalidatePath(`/live-tests/${eventId}`);
    }
    return res;
  } catch (err: any) {
    return { success: false, error: err?.message || "Failed to register for live mock." };
  }
}

export async function cancelLiveRegistrationAction(eventId: string) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "Please log in." };
    }

    const res = await LiveTestRegistrationService.cancelRegistration(eventId, user.id);
    if (res.success) {
      revalidatePath("/live-tests");
      revalidatePath(`/live-tests/${eventId}`);
    }
    return res;
  } catch (err: any) {
    return { success: false, error: err?.message || "Failed to cancel registration." };
  }
}

export async function startLiveAttemptAction(eventSlug: string) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "Please log in to start the live mock test." };
    }

    return await LiveTestRunnerService.startOrResumeLiveAttempt(eventSlug, user.id);
  } catch (err: any) {
    return { success: false, error: err?.message || "Failed to start live mock attempt." };
  }
}

export async function saveLiveAnswerAction(payload: LiveAnswerPayload) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "Unauthorized" };
    }

    return await LiveTestRunnerService.saveLiveAnswer(payload, user.id);
  } catch (err: any) {
    return { success: false, error: err?.message || "Failed to save answer." };
  }
}

export async function submitLiveAttemptAction(attemptId: string, isAutoSubmitted: boolean = false) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "Unauthorized" };
    }

    const res = await LiveTestRunnerService.submitLiveAttempt(attemptId, user.id, isAutoSubmitted);
    if (res.success) {
      revalidatePath("/live-tests");
    }
    return res;
  } catch (err: any) {
    return { success: false, error: err?.message || "Failed to submit live attempt." };
  }
}

export async function getLiveTestResultAction(slugOrId: string) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { LiveTestResultService } = await import("@/services/live-test-result.service");
    return await LiveTestResultService.getCandidateScorecard(slugOrId, user?.id);
  } catch (err: any) {
    console.error("[getLiveTestResultAction] Error:", err);
    return null;
  }
}

export async function getLiveTestLeaderboardAction(
  eventIdOrSlug: string,
  page: number = 1,
  limit: number = 50
) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { LiveTestResultService } = await import("@/services/live-test-result.service");
    return await LiveTestResultService.getLiveTestLeaderboard(eventIdOrSlug, page, limit, user?.id);
  } catch (err: any) {
    console.error("[getLiveTestLeaderboardAction] Error:", err);
    return { entries: [], total: 0, snapshot: null, currentUserEntry: null };
  }
}

