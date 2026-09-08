"use server";

import { AdminService } from "@/services/admin.service";
import { AdminPremiumService, GeneratorPolicyConfig } from "@/services/admin-premium.service";
import { revalidatePath } from "next/cache";

export interface PremiumActionResult<T = unknown> {
  success: boolean;
  message?: string;
  error?: string;
  data?: T;
}

/**
 * Server Action: Update Global Premium Status / Maintenance Mode
 */
export async function updateGlobalPremiumConfigAction(payload: {
  isPremiumEnabled?: boolean;
  maintenanceMode?: boolean;
  maintenanceMessage?: string;
  emergencyDisableReason?: string | null;
  reason: string;
}): Promise<PremiumActionResult> {
  const auth = await AdminService.checkIsAdminOrStaff();
  if (!auth.isAdmin || !auth.userEmail) {
    return { success: false, error: "Unauthorized. Administrator credentials required." };
  }

  if (!payload.reason || payload.reason.trim().length === 0) {
    return { success: false, error: "A specific operational reason is required for global configuration changes." };
  }

  try {
    const result = await AdminPremiumService.updateGlobalConfig({
      isPremiumEnabled: payload.isPremiumEnabled,
      maintenanceMode: payload.maintenanceMode,
      maintenanceMessage: payload.maintenanceMessage,
      emergencyDisableReason: payload.emergencyDisableReason,
      reason: payload.reason,
      actorEmail: auth.userEmail,
      actorId: auth.userId,
    });

    revalidatePath("/admin/premium");
    revalidatePath("/premium");
    return { success: true, message: "Global Premium configuration successfully updated.", data: result.config };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to update global configuration.";
    return { success: false, error: message };
  }
}

/**
 * Server Action: Set Exam-Wise Premium Availability
 */
export async function setExamPremiumAvailabilityAction(payload: {
  examId: string;
  isEnabled: boolean;
  reason: string;
}): Promise<PremiumActionResult> {
  const auth = await AdminService.checkIsAdminOrStaff();
  if (!auth.isAdmin || !auth.userEmail) {
    return { success: false, error: "Unauthorized. Administrator credentials required." };
  }

  if (!payload.examId) {
    return { success: false, error: "Target Exam ID is required." };
  }

  if (!payload.reason || payload.reason.trim().length === 0) {
    return { success: false, error: "A reason is required to modify exam availability." };
  }

  try {
    const result = await AdminPremiumService.setExamAvailability({
      examId: payload.examId,
      isEnabled: payload.isEnabled,
      reason: payload.reason,
      actorEmail: auth.userEmail,
      actorId: auth.userId,
    });

    revalidatePath("/admin/premium");
    revalidatePath("/premium");
    return { success: true, message: `Exam availability successfully ${payload.isEnabled ? "enabled" : "disabled"}.`, data: result };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to update exam availability.";
    return { success: false, error: message };
  }
}

/**
 * Server Action: Set Test-Type Availability
 */
export async function setTestTypeAvailabilityAction(payload: {
  testType: string;
  isEnabled: boolean;
  reason: string;
}): Promise<PremiumActionResult> {
  const auth = await AdminService.checkIsAdminOrStaff();
  if (!auth.isAdmin || !auth.userEmail) {
    return { success: false, error: "Unauthorized. Administrator credentials required." };
  }

  if (!payload.testType) {
    return { success: false, error: "Test type is required." };
  }

  if (!payload.reason || payload.reason.trim().length === 0) {
    return { success: false, error: "A reason is required to modify test type governance." };
  }

  try {
    const result = await AdminPremiumService.setTestTypeAvailability({
      testType: payload.testType,
      isEnabled: payload.isEnabled,
      reason: payload.reason,
      actorEmail: auth.userEmail,
      actorId: auth.userId,
    });

    revalidatePath("/admin/premium");
    revalidatePath("/premium");
    return { success: true, message: `Test type "${payload.testType}" governance successfully updated.`, data: result };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to update test type governance.";
    return { success: false, error: message };
  }
}

/**
 * Server Action: Update Dynamic Generator Policy
 */
export async function updateGeneratorPolicyAction(payload: {
  policy: Partial<GeneratorPolicyConfig>;
  reason: string;
}): Promise<PremiumActionResult> {
  const auth = await AdminService.checkIsAdminOrStaff();
  if (!auth.isAdmin || !auth.userEmail) {
    return { success: false, error: "Unauthorized. Administrator credentials required." };
  }

  if (!payload.reason || payload.reason.trim().length === 0) {
    return { success: false, error: "A reason is required to update generator policies." };
  }

  try {
    const result = await AdminPremiumService.updateGeneratorPolicy({
      policy: payload.policy,
      reason: payload.reason,
      actorEmail: auth.userEmail,
      actorId: auth.userId,
    });

    revalidatePath("/admin/premium");
    return { success: true, message: "Generator policy successfully updated.", data: result.policy };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to update generator policy.";
    return { success: false, error: message };
  }
}

/**
 * Server Action: Search Candidate Profile for Premium Administration
 */
export async function searchCandidateAction(
  emailOrId: string
): Promise<PremiumActionResult> {
  const auth = await AdminService.checkIsAdminOrStaff();
  if (!auth.isAdmin || !auth.userEmail) {
    return { success: false, error: "Unauthorized. Administrator credentials required." };
  }

  try {
    const result = await AdminPremiumService.searchCandidate(emailOrId);
    return { success: true, data: result };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Candidate lookup failed.";
    return { success: false, error: message };
  }
}

/**
 * Server Action: Grant Candidate Promotional Pass
 */
export async function grantPromotionalPassAction(payload: {
  userId: string;
  examId?: string | null;
  durationDays: number;
  customLimits?: Record<string, number>;
  reason: string;
}): Promise<PremiumActionResult> {
  const auth = await AdminService.checkIsAdminOrStaff();
  if (!auth.isAdmin || !auth.userEmail) {
    return { success: false, error: "Unauthorized. Administrator credentials required." };
  }

  try {
    const result = await AdminPremiumService.grantPromotionalPass({
      userId: payload.userId,
      examId: payload.examId,
      durationDays: payload.durationDays,
      customLimits: payload.customLimits,
      reason: payload.reason,
      actorEmail: auth.userEmail,
      actorId: auth.userId,
    });

    revalidatePath("/admin/premium");
    return { success: true, message: "Promotional entitlement granted successfully.", data: result };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to grant promotional entitlement.";
    return { success: false, error: message };
  }
}

/**
 * Server Action: Revoke Candidate Entitlement
 */
export async function revokeEntitlementAction(payload: {
  entitlementId: string;
  reason: string;
}): Promise<PremiumActionResult> {
  const auth = await AdminService.checkIsAdminOrStaff();
  if (!auth.isAdmin || !auth.userEmail) {
    return { success: false, error: "Unauthorized. Administrator credentials required." };
  }

  try {
    const result = await AdminPremiumService.revokeEntitlement({
      entitlementId: payload.entitlementId,
      reason: payload.reason,
      actorEmail: auth.userEmail,
      actorId: auth.userId,
    });

    revalidatePath("/admin/premium");
    return { success: true, message: "Entitlement revoked successfully.", data: result };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to revoke entitlement.";
    return { success: false, error: message };
  }
}

/**
 * Server Action: Update Custom Quota Limits on Entitlement
 */
export async function updateCustomLimitsAction(payload: {
  entitlementId: string;
  customLimits: Record<string, number>;
  reason: string;
}): Promise<PremiumActionResult> {
  const auth = await AdminService.checkIsAdminOrStaff();
  if (!auth.isAdmin || !auth.userEmail) {
    return { success: false, error: "Unauthorized. Administrator credentials required." };
  }

  try {
    const result = await AdminPremiumService.updateCustomLimits({
      entitlementId: payload.entitlementId,
      customLimits: payload.customLimits,
      reason: payload.reason,
      actorEmail: auth.userEmail,
      actorId: auth.userId,
    });

    revalidatePath("/admin/premium");
    return { success: true, message: "Custom limits updated successfully.", data: result };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to update custom limits.";
    return { success: false, error: message };
  }
}

/**
 * Server Action: Toggle Test Series Activation Status
 */
export async function toggleTestSeriesStatusAction(payload: {
  seriesId: string;
  isActive: boolean;
  reason: string;
}): Promise<PremiumActionResult> {
  const auth = await AdminService.checkIsAdminOrStaff();
  if (!auth.isAdmin || !auth.userEmail) {
    return { success: false, error: "Unauthorized. Administrator credentials required." };
  }

  try {
    const result = await AdminPremiumService.toggleTestSeriesStatus({
      seriesId: payload.seriesId,
      isActive: payload.isActive,
      reason: payload.reason,
      actorEmail: auth.userEmail,
      actorId: auth.userId,
    });

    revalidatePath("/admin/premium");
    revalidatePath("/premium");
    return { success: true, message: `Test series ${payload.isActive ? "activated" : "deactivated"} successfully.`, data: result };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to update test series status.";
    return { success: false, error: message };
  }
}

/**
 * Server Action: Update Curated Mock Status and Featuring
 */
export async function updateMockCuratedStatusAction(payload: {
  mockTestId: string;
  lifecycleStatus?: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  isFeatured?: boolean;
  curatedBadge?: string | null;
  reason: string;
}): Promise<PremiumActionResult> {
  const auth = await AdminService.checkIsAdminOrStaff();
  if (!auth.isAdmin || !auth.userEmail) {
    return { success: false, error: "Unauthorized. Administrator credentials required." };
  }

  try {
    const result = await AdminPremiumService.updateMockCuratedStatus({
      mockTestId: payload.mockTestId,
      lifecycleStatus: payload.lifecycleStatus,
      isFeatured: payload.isFeatured,
      curatedBadge: payload.curatedBadge,
      reason: payload.reason,
      actorEmail: auth.userEmail,
      actorId: auth.userId,
    });

    revalidatePath("/admin/premium");
    revalidatePath("/premium");
    return { success: true, message: "Curated mock test status updated successfully.", data: result };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to update mock test status.";
    return { success: false, error: message };
  }
}
