"use server";



import { guardAdminAction, requireAdmin, toActionFailure } from "@/lib/auth/require-admin";
import { featureDisabledActionResult } from "@/lib/features/gates";
import { AdminCompetitionIntelligenceService } from "@/services/admin-competition-intelligence.service";
import {
  MacroCompetitionIntelligenceOverview,
  EventCompetitionIntelligence,
  CrossEventComparisonResult,
  CandidateDrillDownItem,
} from "@/types/admin-competition-intelligence";

/**
 * Validates that current session belongs to an authenticated user with administrative role.
 */
async function verifyAdminPrivileges() {
  // SEC-1B: real session role (was hard-coded "admin", so the staff restriction below never applied).
  const ctx = await requireAdmin({ allowStaff: true });
  return { user: { id: ctx.userId, email: ctx.userEmail }, role: ctx.role };
}

/**
 * Server Action: Get macro platform competition intelligence overview.
 */
export async function getMacroCompetitionOverviewAction(): Promise<{
  success: boolean;
  data?: MacroCompetitionIntelligenceOverview;
  error?: string;
}> {
  const featureGate = featureDisabledActionResult("LIVE_TESTS");
  if (featureGate) return featureGate as never;
  const __auth = await guardAdminAction({ allowStaff: true });
  if (!__auth.ok) return __auth;
  try {
    await verifyAdminPrivileges();
    const data = await AdminCompetitionIntelligenceService.getMacroCompetitionOverview();
    return { success: true, data };
  } catch (err: any) {
    return toActionFailure("getMacroCompetitionOverviewAction", err);
  }
}

/**
 * Server Action: Get event-level competition intelligence deep dive.
 */
export async function getEventCompetitionIntelligenceAction(
  eventId: string
): Promise<{
  success: boolean;
  data?: EventCompetitionIntelligence;
  error?: string;
}> {
  const featureGate = featureDisabledActionResult("LIVE_TESTS");
  if (featureGate) return featureGate as never;
  const __auth = await guardAdminAction({ allowStaff: true });
  if (!__auth.ok) return __auth;
  try {
    await verifyAdminPrivileges();
    const data = await AdminCompetitionIntelligenceService.getEventCompetitionIntelligence(eventId);
    return { success: true, data };
  } catch (err: any) {
    return toActionFailure("getEventCompetitionIntelligenceAction", err);
  }
}

/**
 * Server Action: Compare two competition events with strict comparability checks.
 */
export async function getCrossEventComparisonAction(
  event1Id: string,
  event2Id: string
): Promise<{
  success: boolean;
  data?: CrossEventComparisonResult;
  error?: string;
}> {
  const featureGate = featureDisabledActionResult("LIVE_TESTS");
  if (featureGate) return featureGate as never;
  const __auth = await guardAdminAction({ allowStaff: true });
  if (!__auth.ok) return __auth;
  try {
    await verifyAdminPrivileges();
    const data = await AdminCompetitionIntelligenceService.getCrossEventComparison(event1Id, event2Id);
    return { success: true, data };
  } catch (err: any) {
    return toActionFailure("getCrossEventComparisonAction", err);
  }
}

/**
 * Server Action: Authorized Candidate Drill-Down with Mandatory Audit Logging.
 */
export async function getCandidateDrillDownAction(
  eventId: string
): Promise<{
  success: boolean;
  data?: CandidateDrillDownItem[];
  error?: string;
}> {
  // Candidate drill-down: admin only (staff restricted to aggregate metrics).
  const featureGate = featureDisabledActionResult("LIVE_TESTS");
  if (featureGate) return featureGate as never;
  const __auth = await guardAdminAction();
  if (!__auth.ok) return __auth;
  try {
    const { user, role } = await verifyAdminPrivileges();
    if (role === "staff") {
      throw new Error("Staff role is restricted to aggregate metrics. Candidate drill-down requires Admin or SuperAdmin.");
    }

    const data = await AdminCompetitionIntelligenceService.getCandidateDrillDown(eventId, user.id);
    return { success: true, data };
  } catch (err: any) {
    return toActionFailure("getCandidateDrillDownAction", err);
  }
}
