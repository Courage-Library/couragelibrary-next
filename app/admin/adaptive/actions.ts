"use server";

import { AdminService } from "@/services/admin.service";
import { revalidatePath } from "next/cache";
import type {
  AdaptiveGlobalStatus,
  AdaptiveSafetyLimits,
  AdaptiveAlgorithmStatus,
  AdaptiveModelType,
  AdaptiveEstimationMethod,
} from "@/types/admin-adaptive";

export interface AdminActionResult {
  success?: boolean;
  message?: string;
  error?: string;
  data?: unknown;
}

// ============================================================================
// 1. GLOBAL STATUS & EMERGENCY KILL SWITCH ACTIONS
// ============================================================================

export async function updateAdaptiveGlobalStatusAction(
  updates: Partial<AdaptiveGlobalStatus>,
  reason?: string
): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized: Admin privileges required." };

  try {
    const { AdminAdaptiveService } = await import("@/services/admin-adaptive.service");
    const result = await AdminAdaptiveService.updateGlobalStatus(updates, {
      actorId: authCheck.userId || null,
      actorEmail: authCheck.userEmail || "admin@system.local",
      reason,
    });
    revalidatePath("/admin/adaptive");
    return { success: true, message: "Adaptive global status updated.", data: result };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to update adaptive status.";
    return { error: msg };
  }
}

export async function toggleAdaptiveEmergencyAction(
  disabled: boolean,
  reason: string
): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized: Admin privileges required." };

  try {
    const { AdminAdaptiveService } = await import("@/services/admin-adaptive.service");
    const result = await AdminAdaptiveService.toggleEmergencyDisable(disabled, reason, {
      actorId: authCheck.userId || null,
      actorEmail: authCheck.userEmail || "admin@system.local",
    });
    revalidatePath("/admin/adaptive");
    return {
      success: true,
      message: disabled ? "Emergency disable enabled." : "Emergency disable cleared.",
      data: result,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to toggle emergency disable.";
    return { error: msg };
  }
}

export async function updateAdaptiveSafetyLimitsAction(
  limits: AdaptiveSafetyLimits,
  reason: string
): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized: Admin privileges required." };

  try {
    const { AdminAdaptiveService } = await import("@/services/admin-adaptive.service");
    const result = await AdminAdaptiveService.updateSafetyLimits(limits, {
      actorId: authCheck.userId || null,
      actorEmail: authCheck.userEmail || "admin@system.local",
      reason,
    });
    revalidatePath("/admin/adaptive");
    return { success: true, message: "Safety limits updated.", data: result };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to update safety limits.";
    return { error: msg };
  }
}

// ============================================================================
// 2. ALGORITHM VERSION MANAGEMENT ACTIONS
// ============================================================================

export async function createAdaptiveAlgorithmVersionAction(
  params: {
    version_code: string;
    name: string;
    description?: string;
    status?: AdaptiveAlgorithmStatus;
    model_type: AdaptiveModelType;
    estimation_method: AdaptiveEstimationMethod;
    hyperparameters?: Record<string, unknown>;
    exposure_control_config?: Record<string, unknown>;
    stopping_rule_defaults?: { min_questions: number; max_questions: number; target_se: number };
    release_notes?: string;
  },
  reason?: string
): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized: Admin privileges required." };

  try {
    const { AdminAdaptiveService } = await import("@/services/admin-adaptive.service");
    const result = await AdminAdaptiveService.createAlgorithmVersion(params, {
      actorId: authCheck.userId || null,
      actorEmail: authCheck.userEmail || "admin@system.local",
      reason,
    });
    revalidatePath("/admin/adaptive");
    return { success: true, message: "Algorithm version created.", data: result };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to create algorithm version.";
    return { error: msg };
  }
}

export async function activateAdaptiveAlgorithmVersionAction(
  versionId: string,
  reason: string
): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized: Admin privileges required." };

  try {
    const { AdminAdaptiveService } = await import("@/services/admin-adaptive.service");
    const result = await AdminAdaptiveService.activateAlgorithmVersion(versionId, {
      actorId: authCheck.userId || null,
      actorEmail: authCheck.userEmail || "admin@system.local",
      reason,
    });
    revalidatePath("/admin/adaptive");
    return { success: true, message: "Algorithm version activated.", data: result };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to activate algorithm version.";
    return { error: msg };
  }
}

// ============================================================================
// 3. BLUEPRINT CONFIGURATION ACTIONS
// ============================================================================

export async function saveAdaptiveConfigAction(
  config: {
    id?: string;
    exam_id: string;
    test_type: string;
    title: string;
    slug: string;
    is_active: boolean;
    min_questions: number;
    max_questions: number;
    target_duration_minutes: number;
    difficulty_policy: Record<string, unknown>;
    topic_policy: Record<string, unknown>;
    stopping_policy: Record<string, unknown>;
    selection_policy: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  },
  reason?: string
): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized: Admin privileges required." };

  try {
    const { AdminAdaptiveService } = await import("@/services/admin-adaptive.service");
    const result = await AdminAdaptiveService.saveAdaptiveConfig(config, {
      actorId: authCheck.userId || null,
      actorEmail: authCheck.userEmail || "admin@system.local",
      reason,
    });
    revalidatePath("/admin/adaptive");
    return { success: true, message: "Adaptive blueprint config saved.", data: result };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to save adaptive config.";
    return { error: msg };
  }
}

// ============================================================================
// 4. ITEM CALIBRATION & QUESTION GOVERNANCE ACTIONS
// ============================================================================

export async function recalibrateItemAction(
  questionVersionId: string,
  reason: string
): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized: Admin privileges required." };

  try {
    const { AdaptiveCalibrationService } = await import("@/services/adaptive/adaptive-calibration.service");
    const result = await AdaptiveCalibrationService.recalibrateQuestionVersion(
      questionVersionId,
      { reason },
      { actorId: authCheck.userId || null, actorEmail: authCheck.userEmail || "admin@system.local" }
    );
    revalidatePath("/admin/adaptive");
    return { success: true, message: `Item recalibrated (${result.sample_size} responses).`, data: result };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to recalibrate item.";
    return { error: msg };
  }
}

export async function recalibrateBatchAction(
  questionVersionIds: string[],
  reason: string
): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized: Admin privileges required." };

  try {
    const { AdaptiveCalibrationService } = await import("@/services/adaptive/adaptive-calibration.service");
    const result = await AdaptiveCalibrationService.recalibrateBatch(
      questionVersionIds,
      { reason },
      { actorId: authCheck.userId || null, actorEmail: authCheck.userEmail || "admin@system.local" }
    );
    revalidatePath("/admin/adaptive");
    return { success: true, message: `Batch recalibrated ${result.processedCount} items.`, data: result };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to recalibrate batch.";
    return { error: msg };
  }
}

export async function flagQuestionVersionAction(
  questionVersionId: string,
  reason: string
): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized: Admin privileges required." };

  try {
    const { AdaptiveCalibrationService } = await import("@/services/adaptive/adaptive-calibration.service");
    await AdaptiveCalibrationService.flagQuestionVersion(questionVersionId, reason, {
      actorId: authCheck.userId || null,
      actorEmail: authCheck.userEmail || "admin@system.local",
    });
    revalidatePath("/admin/adaptive");
    return { success: true, message: "Item flagged for review." };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to flag item.";
    return { error: msg };
  }
}

export async function unflagQuestionVersionAction(
  questionVersionId: string,
  reason: string
): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized: Admin privileges required." };

  try {
    const { AdaptiveCalibrationService } = await import("@/services/adaptive/adaptive-calibration.service");
    await AdaptiveCalibrationService.unflagQuestionVersion(questionVersionId, reason, {
      actorId: authCheck.userId || null,
      actorEmail: authCheck.userEmail || "admin@system.local",
    });
    revalidatePath("/admin/adaptive");
    return { success: true, message: "Item unflagged successfully." };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to unflag item.";
    return { error: msg };
  }
}

export async function deprecateQuestionVersionAction(
  questionVersionId: string,
  reason: string
): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized: Admin privileges required." };

  try {
    const { AdaptiveCalibrationService } = await import("@/services/adaptive/adaptive-calibration.service");
    await AdaptiveCalibrationService.deprecateQuestionVersion(questionVersionId, reason, {
      actorId: authCheck.userId || null,
      actorEmail: authCheck.userEmail || "admin@system.local",
    });
    revalidatePath("/admin/adaptive");
    return { success: true, message: "Item deprecated and excluded from adaptive tests." };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to deprecate item.";
    return { error: msg };
  }
}

export async function restoreQuestionVersionAction(
  questionVersionId: string,
  reason: string
): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized: Admin privileges required." };

  try {
    const { AdaptiveCalibrationService } = await import("@/services/adaptive/adaptive-calibration.service");
    await AdaptiveCalibrationService.restoreQuestionVersion(questionVersionId, reason, {
      actorId: authCheck.userId || null,
      actorEmail: authCheck.userEmail || "admin@system.local",
    });
    revalidatePath("/admin/adaptive");
    return { success: true, message: "Item restored to active pool." };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to restore item.";
    return { error: msg };
  }
}

export async function getItemCalibrationDetailAction(
  questionVersionId: string
): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized: Admin privileges required." };

  try {
    const { AdaptiveCalibrationService } = await import("@/services/adaptive/adaptive-calibration.service");
    const detail = await AdaptiveCalibrationService.getItemCalibrationDetail(questionVersionId);
    return { success: true, data: detail };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch item detail.";
    return { error: msg };
  }
}

// ============================================================================
// 5. ABILITY ESTIMATOR & TELEMETRY ACTIONS
// ============================================================================

export async function updateEstimatorConfigAction(
  config: Record<string, unknown>,
  reason: string
): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized: Admin privileges required." };

  try {
    const { AdminAdaptiveService } = await import("@/services/admin-adaptive.service");
    const updated = await AdminAdaptiveService.updateEstimatorConfig(
      config,
      reason,
      authCheck.userEmail || "admin@system.local"
    );
    revalidatePath("/admin/adaptive");
    return { success: true, message: "Estimator configuration updated successfully.", data: updated };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to update estimator configuration.";
    return { error: msg };
  }
}

export async function getAttemptAbilityDetailAction(
  attemptId: string
): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized: Admin privileges required." };

  try {
    const { AdminAdaptiveService } = await import("@/services/admin-adaptive.service");
    const detail = await AdminAdaptiveService.getAttemptAbilityDetail(attemptId);
    return { success: true, data: detail };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch attempt ability detail.";
    return { error: msg };
  }
}

// ============================================================================
// 6. CAT SELECTION CONFIGURATION & HEALTH ACTIONS
// ============================================================================

export async function getCATConfigAction(): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized: Admin privileges required." };

  try {
    const { AdminAdaptiveService } = await import("@/services/admin-adaptive.service");
    const config = await AdminAdaptiveService.getCATConfig();
    return { success: true, data: config };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch CAT configuration.";
    return { error: msg };
  }
}

export async function updateCATConfigAction(
  config: Record<string, unknown>,
  reason: string
): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized: Admin privileges required." };

  try {
    const { AdminAdaptiveService } = await import("@/services/admin-adaptive.service");
    const updated = await AdminAdaptiveService.updateCATConfig(
      config,
      reason,
      authCheck.userEmail || "admin@system.local"
    );
    revalidatePath("/admin/adaptive");
    return { success: true, message: "CAT selection configuration updated successfully.", data: updated };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to update CAT selection configuration.";
    return { error: msg };
  }
}

export async function getCATHealthAction(): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized: Admin privileges required." };

  try {
    const { AdminAdaptiveService } = await import("@/services/admin-adaptive.service");
    const health = await AdminAdaptiveService.getCATHealth();
    return { success: true, data: health };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch CAT health telemetry.";
    return { error: msg };
  }
}

export async function getItemInformationExplorerAction(
  targetTheta: number = 0.0,
  limit: number = 50
): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized: Admin privileges required." };

  try {
    const { AdminAdaptiveService } = await import("@/services/admin-adaptive.service");
    const items = await AdminAdaptiveService.getItemInformationExplorer(targetTheta, limit);
    return { success: true, data: items };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to explore item information.";
    return { error: msg };
  }
}

// ============================================================================
// 7. STOPPING POLICY CONFIGURATION & HEALTH ACTIONS
// ============================================================================

export async function getStoppingConfigAction(): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized: Admin privileges required." };

  try {
    const { AdminAdaptiveService } = await import("@/services/admin-adaptive.service");
    const config = await AdminAdaptiveService.getStoppingConfig();
    return { success: true, data: config };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch stopping configuration.";
    return { error: msg };
  }
}

export async function updateStoppingConfigAction(
  config: Record<string, unknown>,
  reason: string
): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized: Admin privileges required." };

  try {
    const { AdminAdaptiveService } = await import("@/services/admin-adaptive.service");
    const updated = await AdminAdaptiveService.updateStoppingConfig(
      config,
      reason,
      authCheck.userEmail || "admin@system.local"
    );
    revalidatePath("/admin/adaptive");
    return { success: true, message: "Stopping configuration updated successfully.", data: updated };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to update stopping configuration.";
    return { error: msg };
  }
}

export async function getStoppingHealthAction(): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized: Admin privileges required." };

  try {
    const { AdminAdaptiveService } = await import("@/services/admin-adaptive.service");
    const health = await AdminAdaptiveService.getStoppingHealth();
    return { success: true, data: health };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch stopping health.";
    return { error: msg };
  }
}

// ============================================================================
// 8. PERSONALIZATION POLICY CONFIGURATION & HEALTH ACTIONS
// ============================================================================

export async function getPersonalizationConfigAction(): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized: Admin privileges required." };

  try {
    const { AdminAdaptiveService } = await import("@/services/admin-adaptive.service");
    const config = await AdminAdaptiveService.getPersonalizationConfig();
    return { success: true, data: config };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch personalization configuration.";
    return { error: msg };
  }
}

export async function updatePersonalizationConfigAction(
  config: Record<string, unknown>,
  reason: string
): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized: Admin privileges required." };

  try {
    const { AdminAdaptiveService } = await import("@/services/admin-adaptive.service");
    const updated = await AdminAdaptiveService.updatePersonalizationConfig(
      config,
      reason,
      authCheck.userEmail || "admin@system.local"
    );
    revalidatePath("/admin/adaptive");
    return { success: true, message: "Personalization configuration updated successfully.", data: updated };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to update personalization configuration.";
    return { error: msg };
  }
}

export async function getPersonalizationHealthAction(): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized: Admin privileges required." };

  try {
    const { AdminAdaptiveService } = await import("@/services/admin-adaptive.service");
    const health = await AdminAdaptiveService.getPersonalizationHealth();
    return { success: true, data: health };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch personalization health.";
    return { error: msg };
  }
}

// ============================================================================
// 9. PHASE 4D.6: ADAPTIVE ANALYTICS & ADMIN INTELLIGENCE ACTIONS
// ============================================================================

export async function getAdaptiveOverviewAction(filters?: Record<string, unknown>): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized: Admin privileges required." };

  try {
    const { AdminAdaptiveService } = await import("@/services/admin-adaptive.service");
    const data = await AdminAdaptiveService.getAdaptiveOverview(filters);
    return { success: true, data };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch adaptive overview.";
    return { error: msg };
  }
}

export async function getCandidateIntelligenceAction(filters?: Record<string, unknown>): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized: Admin privileges required." };

  try {
    const { AdminAdaptiveService } = await import("@/services/admin-adaptive.service");
    const data = await AdminAdaptiveService.getCandidateIntelligence(filters);
    return { success: true, data };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch candidate intelligence.";
    return { error: msg };
  }
}

export async function getCandidateAdaptiveDetailAction(userId: string, examId?: string): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized: Admin privileges required." };

  try {
    const { AdminAdaptiveService } = await import("@/services/admin-adaptive.service");
    const data = await AdminAdaptiveService.getCandidateAdaptiveDetail(userId, examId);
    return { success: true, data };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch candidate detail.";
    return { error: msg };
  }
}

export async function getItemIntelligenceAction(filters?: Record<string, unknown>): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized: Admin privileges required." };

  try {
    const { AdminAdaptiveService } = await import("@/services/admin-adaptive.service");
    const data = await AdminAdaptiveService.getItemIntelligence(filters);
    return { success: true, data };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch item intelligence.";
    return { error: msg };
  }
}

export async function getCATIntelligenceAction(filters?: Record<string, unknown>): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized: Admin privileges required." };

  try {
    const { AdminAdaptiveService } = await import("@/services/admin-adaptive.service");
    const data = await AdminAdaptiveService.getCATIntelligence(filters);
    return { success: true, data };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch CAT intelligence.";
    return { error: msg };
  }
}

export async function getAbilityIntelligenceAction(filters?: Record<string, unknown>): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized: Admin privileges required." };

  try {
    const { AdminAdaptiveService } = await import("@/services/admin-adaptive.service");
    const data = await AdminAdaptiveService.getAbilityIntelligence(filters);
    return { success: true, data };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch ability intelligence.";
    return { error: msg };
  }
}

export async function getStoppingIntelligenceAction(filters?: Record<string, unknown>): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized: Admin privileges required." };

  try {
    const { AdminAdaptiveService } = await import("@/services/admin-adaptive.service");
    const data = await AdminAdaptiveService.getStoppingIntelligence(filters);
    return { success: true, data };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch stopping intelligence.";
    return { error: msg };
  }
}

export async function getPersonalizationIntelligenceAction(filters?: Record<string, unknown>): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized: Admin privileges required." };

  try {
    const { AdminAdaptiveService } = await import("@/services/admin-adaptive.service");
    const data = await AdminAdaptiveService.getPersonalizationIntelligence(filters);
    return { success: true, data };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch personalization intelligence.";
    return { error: msg };
  }
}

export async function getAlgorithmComparisonAction(filters?: Record<string, unknown>): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized: Admin privileges required." };

  try {
    const { AdminAdaptiveService } = await import("@/services/admin-adaptive.service");
    const data = await AdminAdaptiveService.getAlgorithmComparison(filters);
    return { success: true, data };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch algorithm comparison.";
    return { error: msg };
  }
}

export async function getAdaptiveHealthAction(filters?: Record<string, unknown>): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized: Admin privileges required." };

  try {
    const { AdminAdaptiveService } = await import("@/services/admin-adaptive.service");
    const data = await AdminAdaptiveService.getAdaptiveHealth(filters);
    return { success: true, data };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch adaptive health.";
    return { error: msg };
  }
}

export async function getDataQualityDiagnosticsAction(): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized: Admin privileges required." };

  try {
    const { AdminAdaptiveService } = await import("@/services/admin-adaptive.service");
    const data = await AdminAdaptiveService.getDataQualityDiagnostics();
    return { success: true, data };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch data quality diagnostics.";
    return { error: msg };
  }
}

export async function getAttemptDiagnosticsAction(attemptId: string): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized: Admin privileges required." };

  try {
    const { AdminAdaptiveService } = await import("@/services/admin-adaptive.service");
    const data = await AdminAdaptiveService.getAttemptDiagnostics(attemptId);
    return { success: true, data };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch attempt diagnostics.";
    return { error: msg };
  }
}
