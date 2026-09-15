/**
 * COURAGE LIBRARY — MISTAKE VAULT PHASE 6 TASK 3
 * CAT ADAPTIVE REMEDIATION ENGINE
 *
 * Provides a deterministic, explainable CAT-style adaptive remediation layer
 * for candidate mistake revision on top of Adaptive Testing V1 infrastructure.
 *
 * SACRED BOUNDARIES:
 * - Reuses existing Adaptive V1 (1PL Fisher Information, Item Calibrations).
 * - Reuses existing Mistake Vault (MPI, Revision Priority, Error Decay).
 * - CAT assessment ability (theta) is strictly separated from Mistake Mastery.
 * - Zero schema migrations / Zero new tables / Zero answer leakage.
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/types/database";
import {
  DifficultyTier,
} from "./adaptive-types";
import { AdaptivePolicyService } from "./adaptive-policy.service";
import { AdaptiveSelectionService } from "./adaptive-selection.service";
import {
  DrillQuestion,
  DrillQuestionOption,
  calculateMistakePriorityIndex,
  calculateRevisionDueState,
  calculateRevisionPriority,
  calculateDecayScheduleState,
} from "../mistake.service";

export interface RemediationCandidateQuestion {
  question_id: string;
  question_version_id: string;
  question_text: string;
  topic_id: string | null;
  subject_id: string | null;
  difficulty: DifficultyTier;
  difficulty_b: number;
  calibration_status: string;
  cognitive_type_id: string;
  topic_congruence_score: number; // [0.0, 1.0]
  cognitive_match_score: number; // [0.0, 1.0]
  fisher_information: number; // [0.0001, 0.2500]
  information_fit_score: number; // [0.0, 1.0]
  fatigue_bonus: number; // [0.0, 1.0]
  remediation_fit_score: number; // Multi-factor score in [0.0000, 1.0000]
  selection_rationale: string;
  options: DrillQuestionOption[];
}

export interface RemediationSelectionContext {
  targetMistake: {
    vault_id: string;
    question_id: string;
    topic_id?: string | null;
    subject_id?: string | null;
    primary_cognitive_type_id?: string;
    cognitive_type_id?: string;
    lifecycle_status?: string;
    consecutive_correct?: number;
    total_mistakes_count?: number;
    last_mistake_at?: string;
    mastered_at?: string | null;
  };
  candidateAbilityTheta: number; // Estimated ability theta (-3.0 to +3.0)
  targetDifficulty?: DifficultyTier;
  servedQuestionVersionIds?: Set<string>;
  recentlyDrilledQuestionIds?: Set<string>;
  errataQuestionIds?: Set<string>;
  referenceNow?: number;
}

export interface AdaptiveRemediationSessionConfig {
  vaultId: string;
  maxQuestions?: number; // Default: 4
  focusCognitiveType?: string;
  difficultyPreference?: DifficultyTier;
}

export interface AdaptiveRemediationSessionPayload {
  success: boolean;
  session_id?: string;
  vault_id: string;
  target_topic_id: string | null;
  target_cognitive_type: string;
  initial_ability_theta: number;
  questions: DrillQuestion[];
  selection_rationales: Array<{ question_id: string; rationale: string; fit_score: number }>;
  error?: string;
}

export class AdaptiveRemediationService {
  /**
   * Deterministic Multi-Factor Remediation Fit Score:
   * RemediationFit = (0.35 * TopicCongruence) + (0.25 * CognitiveMatch) + (0.20 * InformationFit) + (0.20 * FatigueBonus)
   *
   * Weights:
   * - Topic Congruence (35%): Aligns item with the specific knowledge node.
   * - Cognitive Alignment (25%): Targets the diagnosed cognitive failure mode.
   * - 1PL Information Fit (20%): Optimizes item measurement precision at candidate's ability level.
   * - Fatigue / Recency Bonus (20%): Prevents repetitive presentation of recently practiced questions.
   */
  public static calculateRemediationFitScore(params: {
    topicCongruence: number;
    cognitiveMatch: number;
    informationFit: number;
    fatigueBonus: number;
  }): number {
    const topic = Math.max(0.0, Math.min(1.0, params.topicCongruence));
    const cog = Math.max(0.0, Math.min(1.0, params.cognitiveMatch));
    const info = Math.max(0.0, Math.min(1.0, params.informationFit));
    const fatigue = Math.max(0.0, Math.min(1.0, params.fatigueBonus));

    const rawScore = (0.35 * topic) + (0.25 * cog) + (0.20 * info) + (0.20 * fatigue);
    return Number(Math.max(0.0, Math.min(1.0, rawScore)).toFixed(4));
  }

  /**
   * Evaluates topic congruence between candidate mistake and potential remediation item.
   */
  public static evaluateTopicCongruence(
    targetTopicId: string | null | undefined,
    targetSubjectId: string | null | undefined,
    itemTopicId: string | null | undefined,
    itemSubjectId: string | null | undefined
  ): number {
    if (targetTopicId && itemTopicId && targetTopicId === itemTopicId) {
      return 1.0; // Exact canonical topic match
    }
    if (targetSubjectId && itemSubjectId && targetSubjectId === itemSubjectId) {
      return 0.6; // Same subject / related domain
    }
    return 0.2; // Cross-domain fallback
  }

  /**
   * Evaluates cognitive error type alignment for diagnostic remediation.
   * Authoritative Mistake Vault Taxonomy:
   * 1. CONCEPTUAL_GAP
   * 2. CALCULATION_SLIP
   * 3. MISREAD_QUESTION
   * 4. TIME_PANIC
   * 5. FORMULA_CONFUSION
   * 6. DISTRACTOR_TRAP
   * 7. UNCLASSIFIED
   */
  public static evaluateCognitiveMatch(
    targetCognitiveType: string | undefined,
    itemCognitiveType: string | undefined
  ): number {
    const target = targetCognitiveType || "UNCLASSIFIED";
    const item = itemCognitiveType || "UNCLASSIFIED";

    if (target === item && target !== "UNCLASSIFIED") {
      return 1.0; // Exact cognitive error mode targeting
    }

    // Deterministic remediation affinity matrix across the 7 authoritative types:
    const affinityMatrix: Record<string, string[]> = {
      CONCEPTUAL_GAP: ["FORMULA_CONFUSION", "DISTRACTOR_TRAP"],
      FORMULA_CONFUSION: ["CONCEPTUAL_GAP", "CALCULATION_SLIP"],
      CALCULATION_SLIP: ["FORMULA_CONFUSION", "TIME_PANIC"],
      MISREAD_QUESTION: ["DISTRACTOR_TRAP", "TIME_PANIC"],
      DISTRACTOR_TRAP: ["MISREAD_QUESTION", "CONCEPTUAL_GAP"],
      TIME_PANIC: ["CALCULATION_SLIP", "MISREAD_QUESTION"],
      UNCLASSIFIED: [],
    };

    if (affinityMatrix[target]?.includes(item)) {
      return 0.6; // Related cognitive error affinity family
    }

    if (item === "UNCLASSIFIED" || target === "UNCLASSIFIED") {
      return 0.4; // Neutral unclassified baseline
    }

    return 0.2; // Orthogonal cognitive mode
  }

  /**
   * Evaluates recency / fatigue heuristic score based on question-level exposure evidence.
   * Note: This is an educational scheduling heuristic, not a psychological measurement.
   */
  public static evaluateFatigueBonus(
    questionId: string,
    recentlyDrilledIds?: Set<string>,
    daysSinceLastDrill?: number
  ): number {
    if (recentlyDrilledIds?.has(questionId)) {
      if (daysSinceLastDrill !== undefined) {
        if (daysSinceLastDrill <= 0.33) return 0.10; // High recency (< 8 hours)
        if (daysSinceLastDrill <= 1.0) return 0.30;  // Moderate recency (8 to 24 hours)
        if (daysSinceLastDrill <= 7.0) return 0.60;  // Mild recency (1 to 7 days)
      }
      return 0.20; // Default recent exposure penalty
    }
    return 1.0; // Fresh question bonus (> 7 days or never attempted)
  }

  /**
   * Resolves the latest exposure timestamp and elapsed time for a question
   * from an array of question-level exposure records.
   */
  public static resolveLatestQuestionExposure(
    questionId: string,
    exposures: Array<{ question_id: string; created_at: string | number }>,
    referenceNow: number = Date.now()
  ): { latestExposureAt: number | null; hoursElapsed: number | null; daysElapsed: number | null; isRecent: boolean } {
    const matching = exposures.filter((e) => e.question_id === questionId);
    if (matching.length === 0) {
      return { latestExposureAt: null, hoursElapsed: null, daysElapsed: null, isRecent: false };
    }

    let latest = -Infinity;
    for (const exp of matching) {
      const ts = typeof exp.created_at === "string" ? new Date(exp.created_at).getTime() : Number(exp.created_at);
      if (!isNaN(ts) && ts > latest) {
        latest = ts;
      }
    }

    if (latest === -Infinity) {
      return { latestExposureAt: null, hoursElapsed: null, daysElapsed: null, isRecent: false };
    }

    const hoursElapsed = Math.max(0, (referenceNow - latest) / (1000 * 3600));
    const daysElapsed = hoursElapsed / 24;
    return {
      latestExposureAt: latest,
      hoursElapsed: Number(hoursElapsed.toFixed(2)),
      daysElapsed: Number(daysElapsed.toFixed(2)),
      isRecent: daysElapsed <= 7.0,
    };
  }

  /**
   * Deterministically selects the single best remediation question candidate from a pool.
   */
  public static rankAndSelectRemediationCandidates(
    candidatePool: Array<{
      question_id: string;
      question_version_id: string;
      question_text: string;
      topic_id: string | null;
      subject_id: string | null;
      difficulty: string | null;
      difficulty_b?: number | null;
      calibration_status?: string | null;
      cognitive_type_id?: string;
      options: DrillQuestionOption[];
    }>,
    context: RemediationSelectionContext,
    limit: number = 4
  ): RemediationCandidateQuestion[] {
    const errataSet = context.errataQuestionIds || new Set<string>();
    const servedSet = context.servedQuestionVersionIds || new Set<string>();
    const recentSet = context.recentlyDrilledQuestionIds || new Set<string>();
    const theta = context.candidateAbilityTheta;

    const ranked: RemediationCandidateQuestion[] = [];

    for (const item of candidatePool) {
      // 1. Exclude errata and voided questions
      if (errataSet.has(item.question_id) || errataSet.has(item.question_version_id)) {
        continue;
      }

      // 2. Exclude already served items in active session
      if (servedSet.has(item.question_version_id)) {
        continue;
      }

      // 3. Exclude deprecated calibrations
      if (item.calibration_status === "deprecated") {
        continue;
      }

      const diffTier = AdaptivePolicyService.normalizeDifficulty(item.difficulty);
      const b = item.difficulty_b !== null && item.difficulty_b !== undefined
        ? item.difficulty_b
        : AdaptiveSelectionService.mapStaticDifficultyToB(item.difficulty);

      // Compute 1PL Fisher Information & normalized fit
      const fisherInfo = AdaptiveSelectionService.calculate1PLFisherInformation(theta, b);
      const infoFit = AdaptiveSelectionService.calculateNormalizedInformation(theta, b);

      // Evaluate topic congruence
      const topicCongruence = this.evaluateTopicCongruence(
        context.targetMistake.topic_id,
        context.targetMistake.subject_id,
        item.topic_id,
        item.subject_id
      );

      // Evaluate cognitive match
      const targetCognitive = context.targetMistake.primary_cognitive_type_id || context.targetMistake.cognitive_type_id;
      const cognitiveMatch = this.evaluateCognitiveMatch(
        targetCognitive,
        item.cognitive_type_id
      );

      // Evaluate fatigue
      const fatigueBonus = this.evaluateFatigueBonus(item.question_id, recentSet);

      // Compute multi-factor fit score
      const fitScore = this.calculateRemediationFitScore({
        topicCongruence,
        cognitiveMatch,
        informationFit: infoFit,
        fatigueBonus,
      });

      // Construct explainable selection rationale
      const rationaleParts: string[] = [];
      if (topicCongruence === 1.0) rationaleParts.push("exact canonical topic match");
      else if (topicCongruence >= 0.6) rationaleParts.push("related subject domain");

      if (cognitiveMatch === 1.0) rationaleParts.push(`targeted ${context.targetMistake.primary_cognitive_type_id || "diagnosed"} error mode`);
      else if (cognitiveMatch >= 0.6) rationaleParts.push("related cognitive failure mode");

      rationaleParts.push(`difficulty b=${b.toFixed(2)} (Fisher Info: ${fisherInfo.toFixed(3)})`);
      if (fatigueBonus === 1.0) rationaleParts.push("fresh unpracticed item");
      else rationaleParts.push("spaced revision candidate");

      const rationale = `Selected for remediation: ${rationaleParts.join(", ")} (Fit: ${(fitScore * 100).toFixed(1)}%).`;

      ranked.push({
        question_id: item.question_id,
        question_version_id: item.question_version_id,
        question_text: item.question_text,
        topic_id: item.topic_id,
        subject_id: item.subject_id,
        difficulty: diffTier,
        difficulty_b: Number(b.toFixed(2)),
        calibration_status: item.calibration_status || "uncalibrated",
        cognitive_type_id: item.cognitive_type_id || "UNCLASSIFIED",
        topic_congruence_score: topicCongruence,
        cognitive_match_score: cognitiveMatch,
        fisher_information: Number(fisherInfo.toFixed(4)),
        information_fit_score: infoFit,
        fatigue_bonus: fatigueBonus,
        remediation_fit_score: fitScore,
        selection_rationale: rationale,
        options: item.options,
      });
    }

    // Deterministic sorting with stable tie-breaking:
    // 1. remediation_fit_score DESC
    // 2. fisher_information DESC
    // 3. question_id ASC (lexicographical tie-breaker)
    ranked.sort((a, b) => {
      const fitDiff = b.remediation_fit_score - a.remediation_fit_score;
      if (Math.abs(fitDiff) > 0.0001) return fitDiff;

      const infoDiff = b.fisher_information - a.fisher_information;
      if (Math.abs(infoDiff) > 0.0001) return infoDiff;

      return String(a.question_id).localeCompare(String(b.question_id));
    });

    return ranked.slice(0, limit);
  }

  /**
   * Generates a CAT Adaptive Remediation session tailored to a specific candidate mistake.
   */
  public static async generateAdaptiveRemediationSession(
    supabase: SupabaseClient<Database>,
    userId: string,
    config: AdaptiveRemediationSessionConfig
  ): Promise<AdaptiveRemediationSessionPayload> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;

    // 1. Fetch target mistake vault record
    const { data: vaultRow, error: vaultErr } = await sb
      .from("user_mistake_vault")
      .select("id, question_id, topic_id, subject_id, total_mistakes_count, consecutive_correct_in_remediation, lifecycle_status, primary_cognitive_type_id, user_override_cognitive_type_id, last_mistake_at, mastered_at")
      .eq("id", config.vaultId)
      .eq("user_id", userId)
      .maybeSingle();

    if (vaultErr || !vaultRow) {
      return {
        success: false,
        vault_id: config.vaultId,
        target_topic_id: null,
        target_cognitive_type: "UNCLASSIFIED",
        initial_ability_theta: 0.0,
        questions: [],
        selection_rationales: [],
        error: "Target mistake not found in candidate vault.",
      };
    }

    const cognitiveTypeId = config.focusCognitiveType || vaultRow.user_override_cognitive_type_id || vaultRow.primary_cognitive_type_id || "UNCLASSIFIED";

    // 2. Fetch candidate ability theta from user_adaptive_profiles or default to 0.0
    let candidateTheta = 0.0;
    const { data: profile } = await sb
      .from("user_adaptive_profiles")
      .select("current_theta, standard_error")
      .eq("user_id", userId)
      .maybeSingle();

    if (profile && typeof profile.current_theta === "number") {
      candidateTheta = Math.max(-3.0, Math.min(3.0, profile.current_theta));
    }

    // 3. Fetch recent question-level exposure evidence for fatigue control
    const { data: recentDrills } = await sb
      .from("user_mistake_drills")
      .select("questions_data, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10);

    const { data: recentOccurrences } = await sb
      .from("user_mistake_occurrences")
      .select("question_id, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20);

    const exposureRecords: Array<{ question_id: string; created_at: string | number }> = [];
    (recentOccurrences || []).forEach((occ: any) => {
      if (occ?.question_id && occ?.created_at) {
        exposureRecords.push({ question_id: occ.question_id, created_at: occ.created_at });
      }
    });

    const recentlyDrilledIds = new Set<string>();
    (recentDrills || []).forEach((d: any) => {
      if (Array.isArray(d.questions_data)) {
        d.questions_data.forEach((q: any) => {
          if (q?.question_id) {
            recentlyDrilledIds.add(q.question_id);
            if (d.created_at) {
              exposureRecords.push({ question_id: q.question_id, created_at: d.created_at });
            }
          }
        });
      }
    });

    // 4. Fetch candidate pool using deterministic retrieval hierarchy:
    // Hierarchy: 1. Exact canonical topic -> 2. Broad pool fallback (if pool < requested items)
    const maxPoolLimit = 50;
    let rawQuestions: any[] = [];

    if (vaultRow.topic_id) {
      const { data: topicQuestions } = await sb
        .from("questions")
        .select(`
          id,
          canonical_topic_id,
          question_versions!inner(
            id,
            question_id,
            question_text,
            difficulty,
            is_current,
            question_options(id, option_key, content_text, option_order)
          )
        `)
        .eq("question_versions.is_current", true)
        .eq("canonical_topic_id", vaultRow.topic_id)
        .limit(maxPoolLimit);

      if (topicQuestions && Array.isArray(topicQuestions)) {
        rawQuestions = topicQuestions;
      }
    }

    // Fallback if topic query yields insufficient items
    const requiredItems = Math.max(1, Math.min(10, config.maxQuestions || 4));
    if (rawQuestions.length < requiredItems) {
      const existingIds = new Set(rawQuestions.map((q: any) => q.id));
      const remainingLimit = maxPoolLimit - rawQuestions.length;

      const { data: fallbackQuestions } = await sb
        .from("questions")
        .select(`
          id,
          canonical_topic_id,
          question_versions!inner(
            id,
            question_id,
            question_text,
            difficulty,
            is_current,
            question_options(id, option_key, content_text, option_order)
          )
        `)
        .eq("question_versions.is_current", true)
        .limit(remainingLimit);

      if (fallbackQuestions && Array.isArray(fallbackQuestions)) {
        fallbackQuestions.forEach((fq: any) => {
          if (!existingIds.has(fq.id)) {
            rawQuestions.push(fq);
            existingIds.add(fq.id);
          }
        });
      }
    }

    if (rawQuestions.length === 0) {
      return {
        success: false,
        vault_id: config.vaultId,
        target_topic_id: vaultRow.topic_id,
        target_cognitive_type: cognitiveTypeId,
        initial_ability_theta: candidateTheta,
        questions: [],
        selection_rationales: [],
        error: "No eligible remediation questions available for this concept.",
      };
    }

    const versionIds: string[] = [];
    const poolItems: Array<{
      question_id: string;
      question_version_id: string;
      question_text: string;
      topic_id: string | null;
      subject_id: string | null;
      difficulty: string | null;
      difficulty_b?: number | null;
      calibration_status?: string | null;
      cognitive_type_id?: string;
      options: DrillQuestionOption[];
    }> = [];

    for (const q of rawQuestions as any[]) {
      const qv = q.question_versions?.[0];
      if (!qv) continue;
      versionIds.push(qv.id);

      const options: DrillQuestionOption[] = (qv.question_options || [])
        .sort((a: any, b: any) => (a.option_order || 0) - (b.option_order || 0))
        .map((opt: any) => ({
          id: opt.id,
          option_key: opt.option_key,
          content_text: opt.content_text,
          option_text: opt.content_text,
          option_order: opt.option_order || 0,
        }));

      poolItems.push({
        question_id: q.id,
        question_version_id: qv.id,
        question_text: qv.question_text || "",
        topic_id: q.canonical_topic_id,
        subject_id: vaultRow.subject_id || null,
        difficulty: qv.difficulty,
        cognitive_type_id: cognitiveTypeId,
        options,
      });
    }

    // 5. Fetch calibrations in batch (0 N+1)
    if (versionIds.length > 0) {
      const { data: calibs } = await sb
        .from("adaptive_item_calibrations")
        .select("question_version_id, calibration_status, difficulty_b")
        .in("question_version_id", versionIds);

      if (calibs && Array.isArray(calibs)) {
        const calibMap: Record<string, { status: string; b: number | null }> = {};
        calibs.forEach((c: any) => {
          calibMap[c.question_version_id] = { status: c.calibration_status, b: c.difficulty_b };
        });

        poolItems.forEach((item) => {
          const c = calibMap[item.question_version_id];
          if (c) {
            item.calibration_status = c.status;
            item.difficulty_b = c.b;
          }
        });
      }
    }

    // 6. Rank and select optimal remediation questions
    const limit = Math.max(1, Math.min(10, config.maxQuestions || 4));
    const selected = this.rankAndSelectRemediationCandidates(
      poolItems,
      {
        targetMistake: {
          vault_id: vaultRow.id,
          question_id: vaultRow.question_id,
          topic_id: vaultRow.topic_id,
          subject_id: vaultRow.subject_id,
          primary_cognitive_type_id: cognitiveTypeId,
          lifecycle_status: vaultRow.lifecycle_status,
          consecutive_correct: vaultRow.consecutive_correct_in_remediation,
          total_mistakes_count: vaultRow.total_mistakes_count,
          last_mistake_at: vaultRow.last_mistake_at,
          mastered_at: vaultRow.mastered_at,
        },
        candidateAbilityTheta: candidateTheta,
        targetDifficulty: config.difficultyPreference,
        recentlyDrilledQuestionIds: recentlyDrilledIds,
      },
      limit
    );

    if (selected.length === 0) {
      return {
        success: false,
        vault_id: config.vaultId,
        target_topic_id: vaultRow.topic_id,
        target_cognitive_type: cognitiveTypeId,
        initial_ability_theta: candidateTheta,
        questions: [],
        selection_rationales: [],
        error: "Could not select eligible remediation questions.",
      };
    }

    // 7. Format questions for player (SCRUBBED of all answers and explanations)
    const drillQuestions: DrillQuestion[] = selected.map((s) => ({
      vault_id: vaultRow.id,
      question_id: s.question_id,
      question_version_id: s.question_version_id,
      question_text: s.question_text,
      primary_cognitive_type_id: s.cognitive_type_id,
      consecutive_correct: vaultRow.consecutive_correct_in_remediation || 0,
      options: s.options,
      context: {
        cognitive_type_name: cognitiveTypeId,
        total_mistakes_count: vaultRow.total_mistakes_count || 1,
        consecutive_correct: vaultRow.consecutive_correct_in_remediation || 0,
        last_mistake_at: vaultRow.last_mistake_at,
      },
    }));

    const rationales = selected.map((s) => ({
      question_id: s.question_id,
      rationale: s.selection_rationale,
      fit_score: s.remediation_fit_score,
    }));

    // 8. Persist drill session in user_mistake_drills
    const { data: drillRecord } = await sb
      .from("user_mistake_drills")
      .insert({
        user_id: userId,
        topic_id: vaultRow.topic_id,
        cognitive_type_id: cognitiveTypeId !== "UNCLASSIFIED" ? cognitiveTypeId : null,
        total_questions: drillQuestions.length,
        questions_data: drillQuestions,
        status: "IN_PROGRESS",
      })
      .select("id")
      .single();

    return {
      success: true,
      session_id: drillRecord?.id || undefined,
      vault_id: vaultRow.id,
      target_topic_id: vaultRow.topic_id,
      target_cognitive_type: cognitiveTypeId,
      initial_ability_theta: candidateTheta,
      questions: drillQuestions,
      selection_rationales: rationales,
    };
  }
}
