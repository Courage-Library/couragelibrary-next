"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { LiveTestFoundationService } from "@/services/live-test-foundation.service";
import { LiveTestRegistrationService } from "@/services/live-test-registration.service";
import {
  LiveEventStatus,
  CreateLiveEventDTO,
  LiveTestEvent,
  LiveTestEvaluationResult,
  LiveTestPublicationResult,
  LiveTestRewardDistributionResult,
  LiveTestRewardSettlement,
  LiveTestCertificateGenerationResult,
  LiveCertificateStatus,
} from "@/types/live-test";
import { revalidatePath } from "next/cache";

async function verifyAdminUser() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Authentication required.");
  }

  // Check admin role via profiles/metadata
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const role = (profile as any)?.role || "user";
  if (role !== "admin" && role !== "superadmin") {
    throw new Error("Administrative privileges required.");
  }

  return user;
}

export async function createLiveEventAction(
  dto: CreateLiveEventDTO
): Promise<{ success: boolean; data?: LiveTestEvent; error?: string }> {
  try {
    const user = await verifyAdminUser();
    const res = await LiveTestFoundationService.createLiveEvent(dto, user.id);
    if (res.success) {
      revalidatePath("/admin/live-tests");
      revalidatePath("/live-tests");
    }
    return res;
  } catch (err: any) {
    return { success: false, error: err?.message || "Failed to create live event." };
  }
}

export async function updateLiveEventStatusAction(
  eventId: string,
  nextStatus: LiveEventStatus,
  reason: string
): Promise<{ success: boolean; data?: LiveTestEvent; error?: string }> {
  try {
    const user = await verifyAdminUser();
    const res = await LiveTestFoundationService.transitionEventStatus(
      eventId,
      nextStatus,
      user.id,
      reason
    );
    if (res.success) {
      revalidatePath("/admin/live-tests");
      revalidatePath("/live-tests");
    }
    return res;
  } catch (err: any) {
    return { success: false, error: err?.message || "Failed to transition event status." };
  }
}

export async function updateLiveEventScheduleAction(
  eventId: string,
  updates: {
    registration_start_at?: string;
    registration_end_at?: string;
    event_start_at?: string;
    event_end_at?: string;
    result_publish_at?: string;
  },
  reason: string
): Promise<{ success: boolean; data?: LiveTestEvent; error?: string }> {
  try {
    const user = await verifyAdminUser();
    const res = await LiveTestRegistrationService.updateEventSchedule(
      eventId,
      updates,
      user.id,
      reason
    );
    if (res.success) {
      revalidatePath("/admin/live-tests");
      revalidatePath("/live-tests");
    }
    return res;
  } catch (err: any) {
    return { success: false, error: err?.message || "Failed to update event schedule." };
  }
}

export async function evaluateLiveEventAction(eventId: string): Promise<LiveTestEvaluationResult> {
  try {
    const user = await verifyAdminUser();
    const { LiveTestResultService } = await import("@/services/live-test-result.service");
    const res = await LiveTestResultService.evaluateLiveEvent(eventId, user.id);
    if (res.success) {
      revalidatePath("/admin/live-tests");
      revalidatePath(`/admin/live-tests/${eventId}`);
      revalidatePath(`/admin/live-tests/${eventId}/results`);
      revalidatePath("/live-tests");
    }
    return res;
  } catch (err: any) {
    return { success: false, error: err?.message || "Failed to evaluate live event." };
  }
}

export async function publishLiveEventResultsAction(
  eventId: string,
  snapshotVersion: number,
  reason: string
): Promise<LiveTestPublicationResult> {
  try {
    const user = await verifyAdminUser();
    const { LiveTestResultService } = await import("@/services/live-test-result.service");
    const res = await LiveTestResultService.publishLiveEventResults(eventId, snapshotVersion, user.id, reason);
    if (res.success) {
      revalidatePath("/admin/live-tests");
      revalidatePath(`/admin/live-tests/${eventId}`);
      revalidatePath(`/admin/live-tests/${eventId}/results`);
      revalidatePath("/live-tests");
    }
    return res;
  } catch (err: any) {
    return { success: false, error: err?.message || "Failed to publish live event results." };
  }
}

export async function recalculateLiveEventResultsAction(
  eventId: string,
  reason: string
): Promise<LiveTestEvaluationResult> {
  try {
    const user = await verifyAdminUser();
    const { LiveTestResultService } = await import("@/services/live-test-result.service");
    const res = await LiveTestResultService.recalculateLiveEventResults(eventId, user.id, reason);
    if (res.success) {
      revalidatePath("/admin/live-tests");
      revalidatePath(`/admin/live-tests/${eventId}`);
      revalidatePath(`/admin/live-tests/${eventId}/results`);
    }
    return res;
  } catch (err: any) {
    return { success: false, error: err?.message || "Failed to recalculate live event results." };
  }
}


export async function voidLiveAttemptAction(
  attemptId: string,
  reason: string
) {
  try {
    const user = await verifyAdminUser();
    const { LiveTestResultService } = await import("@/services/live-test-result.service");
    return await LiveTestResultService.voidLiveAttempt(attemptId, user.id, reason);
  } catch (err: any) {
    return { success: false, error: err?.message || "Failed to void live attempt." };
  }
}

export async function getAdminLiveEventResultsSummaryAction(eventId: string) {
  try {
    await verifyAdminUser();
    const { LiveTestResultService } = await import("@/services/live-test-result.service");
    return await LiveTestResultService.getAdminResultsSummary(eventId);
  } catch (err: any) {
    return { event: null, snapshots: [], activeSnapshot: null };
  }
}

export async function distributeLiveEventRewardsAction(
  eventId: string
): Promise<LiveTestRewardDistributionResult> {
  try {
    const user = await verifyAdminUser();
    const { LiveTestRewardService } = await import("@/services/live-test-reward.service");
    const res = await LiveTestRewardService.distributeLiveEventRewards(eventId, user.id);
    if (res.success) {
      revalidatePath(`/admin/live-tests/${eventId}/results`);
      revalidatePath(`/live-tests/${eventId}/result`);
    }
    return res;
  } catch (err: any) {
    return { success: false, error: err?.message || "Failed to distribute live event rewards." };
  }
}

export async function getLiveEventRewardSettlementsAction(
  eventId: string,
  options?: { limit?: number; offset?: number }
) {
  try {
    await verifyAdminUser();
    const { LiveTestRewardService } = await import("@/services/live-test-reward.service");
    return await LiveTestRewardService.getEventRewardSettlements(eventId, options);
  } catch (err: any) {
    return { settlements: [], totalCount: 0 };
  }
}

// ============================================================================
// PHASE 5E.2: CERTIFICATE ADMIN ACTIONS
// ============================================================================

export async function generateLiveEventCertificatesAction(
  eventId: string
): Promise<LiveTestCertificateGenerationResult> {
  try {
    const user = await verifyAdminUser();
    const { LiveTestCertificateService } = await import("@/services/live-test-certificate.service");
    const res = await LiveTestCertificateService.generateLiveEventCertificates(eventId, user.id);
    if (res.success) {
      revalidatePath(`/admin/live-tests/${eventId}/results`);
      revalidatePath(`/live-tests/${eventId}/result`);
      revalidatePath("/certificates");
    }
    return res;
  } catch (err: any) {
    return { success: false, error: err?.message || "Failed to generate live event certificates." };
  }
}

export async function getLiveEventCertificatesAction(
  eventId: string,
  statusFilter?: any
) {
  try {
    await verifyAdminUser();
    const { LiveTestCertificateService } = await import("@/services/live-test-certificate.service");
    return await LiveTestCertificateService.getEventCertificatesAdmin(eventId, statusFilter);
  } catch (err: any) {
    return [];
  }
}

export async function revokeLiveEventCertificateAction(
  certificateId: string,
  reason: string
) {
  try {
    const user = await verifyAdminUser();
    const { LiveTestCertificateService } = await import("@/services/live-test-certificate.service");
    return await LiveTestCertificateService.revokeCertificate(certificateId, user.id, reason);
  } catch (err: any) {
    return { success: false, error: err?.message || "Failed to revoke certificate." };
  }
}

// ============================================================================
// PHASE 5E.3: ACHIEVEMENTS & BADGES ADMIN ACTIONS
// ============================================================================

export async function evaluateLiveEventAchievementsAction(
  eventId: string
) {
  try {
    const user = await verifyAdminUser();
    const { LiveTestAchievementService } = await import("@/services/live-test-achievement.service");
    const res = await LiveTestAchievementService.evaluateLiveEventAchievements(eventId, user.id);
    if (res.success) {
      revalidatePath(`/admin/live-tests/${eventId}/results`);
      revalidatePath(`/live-tests/${eventId}/result`);
      revalidatePath("/achievements");
    }
    return res;
  } catch (err: any) {
    return { success: false, error: err?.message || "Failed to evaluate achievements." };
  }
}

export async function getEventAchievementAwardsAction(
  eventId: string
) {
  try {
    await verifyAdminUser();
    const { LiveTestAchievementService } = await import("@/services/live-test-achievement.service");
    return await LiveTestAchievementService.getEventAchievementAwards(eventId);
  } catch (err: any) {
    return [];
  }
}

export async function revokeAchievementAwardAction(
  awardId: string,
  reason: string
) {
  try {
    const user = await verifyAdminUser();
    const { LiveTestAchievementService } = await import("@/services/live-test-achievement.service");
    const res = await LiveTestAchievementService.revokeAchievementAward(awardId, user.id, reason);
    if (res.success) {
      revalidatePath("/achievements");
      revalidatePath("/admin/achievements");
    }
    return res;
  } catch (err: any) {
    return { success: false, error: err?.message || "Failed to revoke achievement award." };
  }
}

export async function getAchievementDefinitionsAction() {
  try {
    await verifyAdminUser();
    const { LiveTestAchievementService } = await import("@/services/live-test-achievement.service");
    return await LiveTestAchievementService.getAchievementDefinitions();
  } catch (err: any) {
    return [];
  }
}



