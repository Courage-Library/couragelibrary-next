"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  PremiumQuestionGeneratorService,
  GeneratorError,
  TopicTestRequest,
  WeakAreaTestRequest,
  MistakeRevisionTestRequest,
  PersonalizedTestRequest,
  PyqSimulationRequest,
} from "@/services/premium-generator.service";
import { PremiumHubService } from "@/services/premium-hub.service";
import { MistakeService } from "@/services/mistake.service";

export type ActionResponse<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
  errorCode?: string;
};

/**
 * Helper to authenticate candidate user for Server Actions
 */
async function getAuthenticatedUser() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error("Authentication required. Please log in to access Premium practice.");
  }

  return user;
}

/**
 * Generates a dynamic Topic Test
 */
export async function generateTopicTestAction(
  params: Omit<TopicTestRequest, "userId">
): Promise<ActionResponse<{ mockTestId: string; slug: string; redirectUrl: string }>> {
  try {
    const user = await getAuthenticatedUser();

    if (!params.examId || !params.topicIds || params.topicIds.length === 0) {
      return {
        success: false,
        error: "Please select an exam and at least one topic to generate a topic test.",
      };
    }

    const result = await PremiumQuestionGeneratorService.generateTopicTest({
      ...params,
      userId: user.id,
    });

    return {
      success: true,
      data: {
        mockTestId: result.mockTestId,
        slug: result.slug,
        redirectUrl: `/mock-tests/${result.mockTestId}/take`,
      },
    };
  } catch (err: any) {
    console.error("Failed to generate topic test:", err);
    return {
      success: false,
      error: err.message || "Failed to generate topic test.",
      errorCode: err instanceof GeneratorError ? err.code : undefined,
    };
  }
}

/**
 * Generates an automated Weak Area Test
 */
export async function generateWeakAreaTestAction(
  params: Omit<WeakAreaTestRequest, "userId">
): Promise<ActionResponse<{ mockTestId: string; slug: string; redirectUrl: string }>> {
  try {
    const user = await getAuthenticatedUser();

    if (!params.examId) {
      return {
        success: false,
        error: "Please select an exam to generate a weak area test.",
      };
    }

    const result = await PremiumQuestionGeneratorService.generateWeakAreaTest({
      ...params,
      userId: user.id,
    });

    return {
      success: true,
      data: {
        mockTestId: result.mockTestId,
        slug: result.slug,
        redirectUrl: `/mock-tests/${result.mockTestId}/take`,
      },
    };
  } catch (err: any) {
    console.error("Failed to generate weak area test:", err);
    return {
      success: false,
      error: err.message || "Failed to generate weak area test.",
      errorCode: err instanceof GeneratorError ? err.code : undefined,
    };
  }
}

/**
 * Generates a dynamic Mistake Revision Test from candidate's Mistake Vault
 */
export async function generateMistakeRevisionTestAction(
  params: Omit<MistakeRevisionTestRequest, "userId">
): Promise<ActionResponse<{ mockTestId: string; slug: string; redirectUrl: string }>> {
  try {
    const user = await getAuthenticatedUser();

    if (!params.examId) {
      return {
        success: false,
        error: "Please select an exam to generate a mistake revision test.",
      };
    }

    const result = await PremiumQuestionGeneratorService.generateMistakeRevisionTest({
      ...params,
      userId: user.id,
    });

    return {
      success: true,
      data: {
        mockTestId: result.mockTestId,
        slug: result.slug,
        redirectUrl: `/mock-tests/${result.mockTestId}/take`,
      },
    };
  } catch (err: any) {
    console.error("Failed to generate mistake revision test:", err);
    return {
      success: false,
      error: err.message || "Failed to generate mistake revision test.",
      errorCode: err instanceof GeneratorError ? err.code : undefined,
    };
  }
}

/**
 * Generates an AI-Balanced Personalized Mock Test
 */
export async function generatePersonalizedMockAction(
  params: Omit<PersonalizedTestRequest, "userId">
): Promise<ActionResponse<{ mockTestId: string; slug: string; redirectUrl: string }>> {
  try {
    const user = await getAuthenticatedUser();

    if (!params.examId) {
      return {
        success: false,
        error: "Please select an exam to generate a personalized mock test.",
      };
    }

    const result = await PremiumQuestionGeneratorService.generatePersonalizedTest({
      ...params,
      userId: user.id,
    });

    return {
      success: true,
      data: {
        mockTestId: result.mockTestId,
        slug: result.slug,
        redirectUrl: `/mock-tests/${result.mockTestId}/take`,
      },
    };
  } catch (err: any) {
    console.error("Failed to generate personalized mock:", err);
    return {
      success: false,
      error: err.message || "Failed to generate personalized mock.",
      errorCode: err instanceof GeneratorError ? err.code : undefined,
    };
  }
}

/**
 * Generates a dynamic PYQ Simulation
 */
export async function generatePyqSimulationAction(
  params: Omit<PyqSimulationRequest, "userId">
): Promise<ActionResponse<{ mockTestId: string; slug: string; redirectUrl: string }>> {
  try {
    const user = await getAuthenticatedUser();

    if (!params.examId || !params.year) {
      return {
        success: false,
        error: "Please select an exam and year to generate a PYQ simulation.",
      };
    }

    const result = await PremiumQuestionGeneratorService.generatePyqSimulation({
      ...params,
      userId: user.id,
    });

    return {
      success: true,
      data: {
        mockTestId: result.mockTestId,
        slug: result.slug,
        redirectUrl: `/mock-tests/${result.mockTestId}/take`,
      },
    };
  } catch (err: any) {
    console.error("Failed to generate PYQ simulation:", err);
    return {
      success: false,
      error: err.message || "Failed to generate PYQ simulation.",
      errorCode: err instanceof GeneratorError ? err.code : undefined,
    };
  }
}

/**
 * Fetches subjects & topics for dynamic topic selector modal
 */
export async function fetchExamTopicsAction(examId: string): Promise<ActionResponse<any>> {
  try {
    await getAuthenticatedUser();
    const topics = await PremiumHubService.getExamTopics(examId);
    return { success: true, data: topics };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Fetches weak topics for the candidate
 */
export async function fetchCandidateWeakAreasAction(examId: string): Promise<ActionResponse<any>> {
  try {
    await getAuthenticatedUser();
    const vaultSummary = await MistakeService.getMistakeVaultSummary();
    return { success: true, data: vaultSummary?.weakTopics || [] };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
