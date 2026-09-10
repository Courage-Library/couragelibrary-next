"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { CandidateIntelligenceService } from "@/services/candidate-intelligence.service";
import { CANDIDATE_INTELLIGENCE_POLICY_V1 } from "@/types/candidate-intelligence";

export async function getPerformanceOverviewAction(examId?: string) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const data = await CandidateIntelligenceService.getCandidatePerformanceOverview(
      user.id,
      examId,
      CANDIDATE_INTELLIGENCE_POLICY_V1
    );
    return { success: true, data };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to load performance overview" };
  }
}

export async function getScoreTrajectoryAction(examId?: string) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const data = await CandidateIntelligenceService.getCandidateScoreTrajectory(
      user.id,
      examId,
      CANDIDATE_INTELLIGENCE_POLICY_V1
    );
    return { success: true, data };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to load score trajectory" };
  }
}

export async function getRankTrajectoryAction(examId?: string) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const data = await CandidateIntelligenceService.getCandidateRankPercentileTrajectory(
      user.id,
      examId,
      CANDIDATE_INTELLIGENCE_POLICY_V1
    );
    return { success: true, data };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to load rank trajectory" };
  }
}

export async function getSubjectBreakdownAction(examId?: string) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const data = await CandidateIntelligenceService.getCandidateSubjectBreakdown(
      user.id,
      examId,
      CANDIDATE_INTELLIGENCE_POLICY_V1
    );
    return { success: true, data };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to load subject breakdown" };
  }
}

export async function getStrengthsWeaknessesAction(examId?: string) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const data = await CandidateIntelligenceService.getCandidateStrengthsAndWeaknesses(
      user.id,
      examId,
      CANDIDATE_INTELLIGENCE_POLICY_V1
    );
    return { success: true, data };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to load strengths and weaknesses" };
  }
}
