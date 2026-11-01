"use server";



import { guardAdminAction, requireAdmin, toActionFailure, sanitizeActionResult } from "@/lib/auth/require-admin";
import { featureDisabledActionResult } from "@/lib/features/gates";
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

/** Actor identity from the session (every action already ran guardAdminAction first). */
async function verifyAdminUser() {
  const ctx = await requireAdmin({ allowStaff: true });
  return { id: ctx.userId, email: ctx.userEmail };
}

export async function createLiveEventAction(
  dto: CreateLiveEventDTO
): Promise<{ success: boolean; data?: LiveTestEvent; error?: string }> {
  const featureGate = featureDisabledActionResult("LIVE_TESTS");
  if (featureGate) return featureGate as never;
  const __auth = await guardAdminAction({ allowStaff: true });
  if (!__auth.ok) return __auth;
  try {
    const user = await verifyAdminUser();
    const res = await LiveTestFoundationService.createLiveEvent(dto, user.id);
    if (res.success) {
      revalidatePath("/admin/live-tests");
      revalidatePath("/live-tests");
    }
    return sanitizeActionResult("createLiveEventAction", await (res));
  } catch (err: any) {
    return toActionFailure("createLiveEventAction", err);
  }
}

export async function updateLiveEventStatusAction(
  eventId: string,
  nextStatus: LiveEventStatus,
  reason: string
): Promise<{ success: boolean; data?: LiveTestEvent; error?: string }> {
  const featureGate = featureDisabledActionResult("LIVE_TESTS");
  if (featureGate) return featureGate as never;
  const __auth = await guardAdminAction({ allowStaff: true });
  if (!__auth.ok) return __auth;
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
    return sanitizeActionResult("updateLiveEventStatusAction", await (res));
  } catch (err: any) {
    return toActionFailure("updateLiveEventStatusAction", err);
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
  const featureGate = featureDisabledActionResult("LIVE_TESTS");
  if (featureGate) return featureGate as never;
  const __auth = await guardAdminAction({ allowStaff: true });
  if (!__auth.ok) return __auth;
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
    return sanitizeActionResult("updateLiveEventScheduleAction", await (res));
  } catch (err: any) {
    return toActionFailure("updateLiveEventScheduleAction", err);
  }
}

export async function evaluateLiveEventAction(eventId: string): Promise<LiveTestEvaluationResult> {
  const featureGate = featureDisabledActionResult("LIVE_TESTS");
  if (featureGate) return featureGate as never;
  const __auth = await guardAdminAction({ allowStaff: true });
  if (!__auth.ok) return __auth;
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
    return sanitizeActionResult("evaluateLiveEventAction", await (res));
  } catch (err: any) {
    return toActionFailure("evaluateLiveEventAction", err);
  }
}

export async function publishLiveEventResultsAction(
  eventId: string,
  snapshotVersion: number,
  reason: string
): Promise<LiveTestPublicationResult> {
  const featureGate = featureDisabledActionResult("LIVE_TESTS");
  if (featureGate) return featureGate as never;
  const __auth = await guardAdminAction({ allowStaff: true });
  if (!__auth.ok) return __auth;
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
    return sanitizeActionResult("publishLiveEventResultsAction", await (res));
  } catch (err: any) {
    return toActionFailure("publishLiveEventResultsAction", err);
  }
}

export async function recalculateLiveEventResultsAction(
  eventId: string,
  reason: string
): Promise<LiveTestEvaluationResult> {
  const featureGate = featureDisabledActionResult("LIVE_TESTS");
  if (featureGate) return featureGate as never;
  const __auth = await guardAdminAction({ allowStaff: true });
  if (!__auth.ok) return __auth;
  try {
    const user = await verifyAdminUser();
    const { LiveTestResultService } = await import("@/services/live-test-result.service");
    const res = await LiveTestResultService.recalculateLiveEventResults(eventId, user.id, reason);
    if (res.success) {
      revalidatePath("/admin/live-tests");
      revalidatePath(`/admin/live-tests/${eventId}`);
      revalidatePath(`/admin/live-tests/${eventId}/results`);
    }
    return sanitizeActionResult("recalculateLiveEventResultsAction", await (res));
  } catch (err: any) {
    return toActionFailure("recalculateLiveEventResultsAction", err);
  }
}


export async function voidLiveAttemptAction(
  attemptId: string,
  reason: string
) {
  const featureGate = featureDisabledActionResult("LIVE_TESTS");
  if (featureGate) return featureGate as never;
  const __auth = await guardAdminAction({ allowStaff: true });
  if (!__auth.ok) return __auth;
  try {
    const user = await verifyAdminUser();
    const { LiveTestResultService } = await import("@/services/live-test-result.service");
    return sanitizeActionResult("voidLiveAttemptAction", await (LiveTestResultService.voidLiveAttempt(attemptId, user.id, reason)));
  } catch (err: any) {
    return toActionFailure("voidLiveAttemptAction", err);
  }
}

export async function getAdminLiveEventResultsSummaryAction(eventId: string) {
  const featureGate = featureDisabledActionResult("LIVE_TESTS");
  if (featureGate) return featureGate as never;
  const __auth = await guardAdminAction({ allowStaff: true });
  if (!__auth.ok) return __auth;
  try {
    await verifyAdminUser();
    const { LiveTestResultService } = await import("@/services/live-test-result.service");
    return sanitizeActionResult("getAdminLiveEventResultsSummaryAction", await (LiveTestResultService.getAdminResultsSummary(eventId)));
  } catch (err: any) {
    return { event: null, snapshots: [], activeSnapshot: null };
  }
}

export async function distributeLiveEventRewardsAction(
  eventId: string
): Promise<LiveTestRewardDistributionResult> {
  const featureGate = featureDisabledActionResult("LIVE_TESTS");
  if (featureGate) return featureGate as never;
  const __auth = await guardAdminAction({ allowStaff: true });
  if (!__auth.ok) return __auth;
  try {
    const user = await verifyAdminUser();
    const { LiveTestRewardService } = await import("@/services/live-test-reward.service");
    const res = await LiveTestRewardService.distributeLiveEventRewards(eventId, user.id);
    if (res.success) {
      revalidatePath(`/admin/live-tests/${eventId}/results`);
      revalidatePath(`/live-tests/${eventId}/result`);
    }
    return sanitizeActionResult("distributeLiveEventRewardsAction", await (res));
  } catch (err: any) {
    return toActionFailure("distributeLiveEventRewardsAction", err);
  }
}

export async function getLiveEventRewardSettlementsAction(
  eventId: string,
  options?: { limit?: number; offset?: number }
) {
  const featureGate = featureDisabledActionResult("LIVE_TESTS");
  if (featureGate) return featureGate as never;
  const __auth = await guardAdminAction({ allowStaff: true });
  if (!__auth.ok) return __auth;
  try {
    await verifyAdminUser();
    const { LiveTestRewardService } = await import("@/services/live-test-reward.service");
    return sanitizeActionResult("getLiveEventRewardSettlementsAction", await (LiveTestRewardService.getEventRewardSettlements(eventId, options)));
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
  const featureGate = featureDisabledActionResult("LIVE_TESTS");
  if (featureGate) return featureGate as never;
  const __auth = await guardAdminAction({ allowStaff: true });
  if (!__auth.ok) return __auth;
  try {
    const user = await verifyAdminUser();
    const { LiveTestCertificateService } = await import("@/services/live-test-certificate.service");
    const res = await LiveTestCertificateService.generateLiveEventCertificates(eventId, user.id);
    if (res.success) {
      revalidatePath(`/admin/live-tests/${eventId}/results`);
      revalidatePath(`/live-tests/${eventId}/result`);
      revalidatePath("/certificates");
    }
    return sanitizeActionResult("generateLiveEventCertificatesAction", await (res));
  } catch (err: any) {
    return toActionFailure("generateLiveEventCertificatesAction", err);
  }
}

export async function getLiveEventCertificatesAction(
  eventId: string,
  statusFilter?: any
) {
  const featureGate = featureDisabledActionResult("LIVE_TESTS");
  if (featureGate) return featureGate as never;
  const __auth = await guardAdminAction({ allowStaff: true });
  if (!__auth.ok) return __auth;
  try {
    await verifyAdminUser();
    const { LiveTestCertificateService } = await import("@/services/live-test-certificate.service");
    return sanitizeActionResult("getLiveEventCertificatesAction", await (LiveTestCertificateService.getEventCertificatesAdmin(eventId, statusFilter)));
  } catch (err: any) {
    return sanitizeActionResult("getLiveEventCertificatesAction", await ([]));
  }
}

export async function revokeLiveEventCertificateAction(
  certificateId: string,
  reason: string
) {
  const featureGate = featureDisabledActionResult("LIVE_TESTS");
  if (featureGate) return featureGate as never;
  const __auth = await guardAdminAction({ allowStaff: true });
  if (!__auth.ok) return __auth;
  try {
    const user = await verifyAdminUser();
    const { LiveTestCertificateService } = await import("@/services/live-test-certificate.service");
    return sanitizeActionResult("revokeLiveEventCertificateAction", await (LiveTestCertificateService.revokeCertificate(certificateId, user.id, reason)));
  } catch (err: any) {
    return toActionFailure("revokeLiveEventCertificateAction", err);
  }
}

// ============================================================================
// PHASE 5E.3: ACHIEVEMENTS & BADGES ADMIN ACTIONS
// ============================================================================

export async function evaluateLiveEventAchievementsAction(
  eventId: string
) {
  const featureGate = featureDisabledActionResult("LIVE_TESTS");
  if (featureGate) return featureGate as never;
  const __auth = await guardAdminAction({ allowStaff: true });
  if (!__auth.ok) return __auth;
  try {
    const user = await verifyAdminUser();
    const { LiveTestAchievementService } = await import("@/services/live-test-achievement.service");
    const res = await LiveTestAchievementService.evaluateLiveEventAchievements(eventId, user.id);
    if (res.success) {
      revalidatePath(`/admin/live-tests/${eventId}/results`);
      revalidatePath(`/live-tests/${eventId}/result`);
      revalidatePath("/achievements");
    }
    return sanitizeActionResult("evaluateLiveEventAchievementsAction", await (res));
  } catch (err: any) {
    return toActionFailure("evaluateLiveEventAchievementsAction", err);
  }
}

export async function getEventAchievementAwardsAction(
  eventId: string
) {
  const featureGate = featureDisabledActionResult("LIVE_TESTS");
  if (featureGate) return featureGate as never;
  const __auth = await guardAdminAction({ allowStaff: true });
  if (!__auth.ok) return __auth;
  try {
    await verifyAdminUser();
    const { LiveTestAchievementService } = await import("@/services/live-test-achievement.service");
    return sanitizeActionResult("getEventAchievementAwardsAction", await (LiveTestAchievementService.getEventAchievementAwards(eventId)));
  } catch (err: any) {
    return sanitizeActionResult("getEventAchievementAwardsAction", await ([]));
  }
}

export async function revokeAchievementAwardAction(
  awardId: string,
  reason: string
) {
  const featureGate = featureDisabledActionResult("LIVE_TESTS");
  if (featureGate) return featureGate as never;
  const __auth = await guardAdminAction({ allowStaff: true });
  if (!__auth.ok) return __auth;
  try {
    const user = await verifyAdminUser();
    const { LiveTestAchievementService } = await import("@/services/live-test-achievement.service");
    const res = await LiveTestAchievementService.revokeAchievementAward(awardId, user.id, reason);
    if (res.success) {
      revalidatePath("/achievements");
      revalidatePath("/admin/achievements");
    }
    return sanitizeActionResult("revokeAchievementAwardAction", await (res));
  } catch (err: any) {
    return toActionFailure("revokeAchievementAwardAction", err);
  }
}

export async function getAchievementDefinitionsAction() {
  const featureGate = featureDisabledActionResult("LIVE_TESTS");
  if (featureGate) return featureGate as never;
  const __auth = await guardAdminAction({ allowStaff: true });
  if (!__auth.ok) return __auth;
  try {
    await verifyAdminUser();
    const { LiveTestAchievementService } = await import("@/services/live-test-achievement.service");
    return sanitizeActionResult("getAchievementDefinitionsAction", await (LiveTestAchievementService.getAchievementDefinitions()));
  } catch (err: any) {
    return sanitizeActionResult("getAchievementDefinitionsAction", await ([]));
  }
}



