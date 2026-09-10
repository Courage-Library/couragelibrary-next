"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
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
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Authentication required.");
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const role = (profile as any)?.role || "user";
  if (role !== "admin" && role !== "superadmin" && role !== "staff") {
    throw new Error("Administrative privileges required. Access denied.");
  }

  return { user, role };
}

/**
 * Server Action: Get macro platform competition intelligence overview.
 */
export async function getMacroCompetitionOverviewAction(): Promise<{
  success: boolean;
  data?: MacroCompetitionIntelligenceOverview;
  error?: string;
}> {
  try {
    await verifyAdminPrivileges();
    const data = await AdminCompetitionIntelligenceService.getMacroCompetitionOverview();
    return { success: true, data };
  } catch (err: any) {
    return { success: false, error: err?.message || "Failed to fetch macro intelligence overview." };
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
  try {
    await verifyAdminPrivileges();
    const data = await AdminCompetitionIntelligenceService.getEventCompetitionIntelligence(eventId);
    return { success: true, data };
  } catch (err: any) {
    return { success: false, error: err?.message || "Failed to fetch event intelligence." };
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
  try {
    await verifyAdminPrivileges();
    const data = await AdminCompetitionIntelligenceService.getCrossEventComparison(event1Id, event2Id);
    return { success: true, data };
  } catch (err: any) {
    return { success: false, error: err?.message || "Failed to compare competition events." };
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
  try {
    const { user, role } = await verifyAdminPrivileges();
    if (role === "staff") {
      throw new Error("Staff role is restricted to aggregate metrics. Candidate drill-down requires Admin or SuperAdmin.");
    }

    const data = await AdminCompetitionIntelligenceService.getCandidateDrillDown(eventId, user.id);
    return { success: true, data };
  } catch (err: any) {
    return { success: false, error: err?.message || "Failed to fetch candidate drill-down." };
  }
}
