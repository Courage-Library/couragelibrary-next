import { createAdminServerSupabaseClient } from "@/lib/supabase/server";
import { AdminAdaptiveService, AdaptiveCalibrationStatus } from "@/services/admin-adaptive.service";
import type { Json } from "@/types/database";

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface ItemResponseEvidencePayload {
  question_version_id: string;
  attempt_id: string;
  user_id: string;
  is_correct: boolean;
  response_source?: string;
  difficulty_context?: string;
  adaptive_step_number?: number | null;
  ability_estimate_before?: number | null;
  ability_estimate_after?: number | null;
  metadata?: Record<string, unknown>;
}

export interface CalibrationCalculationResult {
  question_version_id: string;
  sample_size: number;
  correct_count: number;
  incorrect_count: number;
  accuracy_rate: number;
  difficulty_score: number;
  difficulty_b: number | null;
  discrimination_a: null;
  guessing_c: null;
  confidence_score: number;
  reliability_score: number;
  calibration_status: AdaptiveCalibrationStatus;
  calibration_method: string;
  is_unstable: boolean;
  instability_reason: string | null;
  calculated_at: string;
}

export interface CalibrationHistoryEntry {
  id: string;
  question_version_id: string;
  calibration_id: string | null;
  previous_status: string | null;
  new_status: string;
  previous_parameters: Record<string, unknown>;
  new_parameters: Record<string, unknown>;
  sample_size: number;
  calculated_at: string;
  calculation_version: string;
  reason: string | null;
}

export interface ItemCalibrationDetailView {
  id?: string;
  question_version_id: string;
  question_id?: string;
  question_text: string;
  static_difficulty: string;
  options_type?: string;
  language?: string;
  sample_size: number;
  correct_count: number;
  incorrect_count: number;
  accuracy_rate: number;
  difficulty_score: number;
  difficulty_b: number | null;
  discrimination_a: null;
  guessing_c: null;
  confidence_score: number;
  reliability_score: number;
  calibration_status: AdaptiveCalibrationStatus;
  calibration_method: string;
  calibrated_at: string | null;
  history: CalibrationHistoryEntry[];
}

export const CALIBRATION_CONFIG_DEFAULTS = {
  min_provisional_sample: 20,
  min_calibrated_sample: 100,
  drift_threshold: 0.35,
  min_drift_sample: 40,
  max_batch_recalibrate_size: 50,
  calculation_version: "calibration_v1_heuristic",
};

// ============================================================================
// SERVICE IMPLEMENTATION
// ============================================================================

export class AdaptiveCalibrationService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static getClient(): any {
    return createAdminServerSupabaseClient() as any;
  }

  // ==========================================================================
  // 1. RECORD RESPONSE EVIDENCE (SERVER-AUTHORITATIVE & IDEMPOTENT)
  // ==========================================================================

  static async recordResponseEvidence(evidence: ItemResponseEvidencePayload): Promise<boolean> {
    if (!evidence.question_version_id || !evidence.attempt_id || !evidence.user_id) {
      return false;
    }

    const supabase = this.getClient();
    const payload = {
      question_version_id: evidence.question_version_id,
      attempt_id: evidence.attempt_id,
      user_id: evidence.user_id,
      is_correct: Boolean(evidence.is_correct),
      response_source: evidence.response_source || "submitted_attempt",
      difficulty_context: evidence.difficulty_context || "medium",
      adaptive_step_number: evidence.adaptive_step_number ?? null,
      ability_estimate_before: evidence.ability_estimate_before ?? null,
      ability_estimate_after: evidence.ability_estimate_after ?? null,
      metadata: evidence.metadata || {},
      response_recorded_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("adaptive_item_response_evidence")
      .upsert(payload, { onConflict: "attempt_id,question_version_id" });

    if (error) {
      console.warn("[AdaptiveCalibrationService] Evidence record skipped/error:", error.message);
      return false;
    }

    return true;
  }

  // ==========================================================================
  // 2. MATHEMATICAL CALIBRATION FORMULAS (DETERMINISTIC & TRANSPARENT)
  // ==========================================================================

  static computeMetrics(
    questionVersionId: string,
    evidenceList: Array<{ is_correct: boolean; response_recorded_at?: string }>,
    currentStatus?: AdaptiveCalibrationStatus
  ): CalibrationCalculationResult {
    const n = evidenceList.length;
    const correctCount = evidenceList.filter((e) => e.is_correct).length;
    const incorrectCount = n - correctCount;

    const accuracyRate = n > 0 ? Number((correctCount / n).toFixed(4)) : 0.0;
    const difficultyScore = n > 0 ? Number((1.0 - accuracyRate).toFixed(4)) : 0.5;

    // Stability & Drift Analysis
    let isUnstable = false;
    let instabilityReason: string | null = null;
    let instabilityPenalty = 0.0;

    if (n >= CALIBRATION_CONFIG_DEFAULTS.min_drift_sample) {
      // Compare recent 20 answers vs all-time cumulative
      const recentWindow = evidenceList.slice(-20);
      const recentCorrect = recentWindow.filter((e) => e.is_correct).length;
      const recentAccuracy = recentCorrect / recentWindow.length;
      const drift = Math.abs(recentAccuracy - accuracyRate);

      if (drift >= CALIBRATION_CONFIG_DEFAULTS.drift_threshold) {
        isUnstable = true;
        instabilityReason = `High accuracy drift detected: |recent(${recentAccuracy.toFixed(2)}) - all(${accuracyRate.toFixed(2)})| = ${drift.toFixed(2)}`;
        instabilityPenalty = Math.min(0.4, drift);
      }
    }

    // Confidence Calculation: min(1.0, sqrt(n)/sqrt(100)) * (1 - penalty)
    const baseConfidence = Math.min(1.0, Math.sqrt(n) / Math.sqrt(CALIBRATION_CONFIG_DEFAULTS.min_calibrated_sample));
    const confidenceScore = Number((baseConfidence * (1.0 - instabilityPenalty)).toFixed(4));

    // Reliability Proxy: min(1.0, n / (n + 10)) * (1 - penalty)
    const baseReliability = n > 0 ? n / (n + 10) : 0.0;
    const reliabilityScore = Number((baseReliability * (1.0 - instabilityPenalty)).toFixed(4));

    // Continuous Bounded Difficulty b: 6.0 * (0.5 - accuracy) in [-3.0, +3.0]
    let difficultyB: number | null = null;
    if (n >= CALIBRATION_CONFIG_DEFAULTS.min_provisional_sample) {
      const rawB = 6.0 * (0.5 - accuracyRate);
      difficultyB = Number(Math.max(-3.0, Math.min(3.0, rawB)).toFixed(4));
    }

    // Status Resolution
    let resolvedStatus: AdaptiveCalibrationStatus = "uncalibrated";
    if (currentStatus === "deprecated") {
      resolvedStatus = "deprecated";
    } else if (isUnstable) {
      resolvedStatus = "flagged";
    } else if (n >= CALIBRATION_CONFIG_DEFAULTS.min_calibrated_sample) {
      resolvedStatus = "calibrated";
    } else if (n >= CALIBRATION_CONFIG_DEFAULTS.min_provisional_sample) {
      resolvedStatus = "provisional";
    } else {
      resolvedStatus = "uncalibrated";
    }

    return {
      question_version_id: questionVersionId,
      sample_size: n,
      correct_count: correctCount,
      incorrect_count: incorrectCount,
      accuracy_rate: accuracyRate,
      difficulty_score: difficultyScore,
      difficulty_b: difficultyB,
      discrimination_a: null, // Strictly non-fabricated
      guessing_c: null, // Strictly non-fabricated
      confidence_score: confidenceScore,
      reliability_score: reliabilityScore,
      calibration_status: resolvedStatus,
      calibration_method: n >= CALIBRATION_CONFIG_DEFAULTS.min_calibrated_sample ? "empirical_continuous_b" : "uncalibrated_baseline",
      is_unstable: isUnstable,
      instability_reason: instabilityReason,
      calculated_at: new Date().toISOString(),
    };
  }

  // ==========================================================================
  // 3. RECALIBRATE SINGLE QUESTION VERSION
  // ==========================================================================

  static async recalibrateQuestionVersion(
    questionVersionId: string,
    options?: { reason?: string },
    adminContext?: { actorId?: string | null; actorEmail?: string }
  ): Promise<CalibrationCalculationResult> {
    const supabase = this.getClient();

    // 1. Fetch current calibration record if exists
    const { data: currentCalib } = await supabase
      .from("adaptive_item_calibrations")
      .select("*")
      .eq("question_version_id", questionVersionId)
      .maybeSingle();

    // 2. Fetch all response evidence for this version
    const { data: evidenceList } = await supabase
      .from("adaptive_item_response_evidence")
      .select("is_correct, response_recorded_at")
      .eq("question_version_id", questionVersionId)
      .order("response_recorded_at", { ascending: true });

    // Also include submitted attempt_answers if evidence table is nascent
    let allEvidence: Array<{ is_correct: boolean; response_recorded_at?: string }> = (evidenceList || []);
    if (allEvidence.length === 0) {
      const { data: rawAnswers } = await supabase
        .from("attempt_answers")
        .select("is_correct, created_at, test_attempts:attempt_id(status)")
        .eq("question_version_id", questionVersionId);

      const validSubmitted = (rawAnswers || []).filter(
        (a: any) => a.test_attempts?.status === "submitted" || a.test_attempts?.status === "evaluated"
      );
      allEvidence = validSubmitted.map((a: any) => ({
        is_correct: Boolean(a.is_correct),
        response_recorded_at: a.created_at,
      }));
    }

    // 3. Compute metrics
    const result = this.computeMetrics(
      questionVersionId,
      allEvidence,
      (currentCalib?.calibration_status as AdaptiveCalibrationStatus) || "uncalibrated"
    );

    // 4. Record Calibration History snapshot
    const historyPayload = {
      question_version_id: questionVersionId,
      calibration_id: currentCalib?.id || null,
      previous_status: currentCalib?.calibration_status || "uncalibrated",
      new_status: result.calibration_status,
      previous_parameters: {
        difficulty_b: currentCalib?.difficulty_b ?? null,
        sample_size: currentCalib?.sample_size ?? 0,
        reliability_score: currentCalib?.reliability_score ?? null,
      },
      new_parameters: {
        difficulty_b: result.difficulty_b,
        difficulty_score: result.difficulty_score,
        accuracy_rate: result.accuracy_rate,
        confidence_score: result.confidence_score,
        reliability_score: result.reliability_score,
        instability_reason: result.instability_reason,
      },
      sample_size: result.sample_size,
      calculated_at: result.calculated_at,
      calculation_version: CALIBRATION_CONFIG_DEFAULTS.calculation_version,
      reason: options?.reason || "RECALIBRATION_TRIGGER",
    };

    await supabase.from("adaptive_item_calibration_history").insert(historyPayload);

    // 5. Upsert active calibration record
    const calibPayload = {
      question_version_id: questionVersionId,
      difficulty_b: result.difficulty_b,
      discrimination_a: null,
      guessing_c: null,
      sample_size: result.sample_size,
      reliability_score: result.reliability_score,
      calibration_status: result.calibration_status,
      calibration_method: result.calibration_method,
      calibrated_at: result.calculated_at,
      calibration_metadata: {
        accuracy_rate: result.accuracy_rate,
        confidence_score: result.confidence_score,
        correct_count: result.correct_count,
        incorrect_count: result.incorrect_count,
        instability_reason: result.instability_reason,
      },
      updated_at: result.calculated_at,
    };

    await supabase
      .from("adaptive_item_calibrations")
      .upsert(calibPayload, { onConflict: "question_version_id,calibration_version" });

    // 6. Audit log
    if (adminContext?.actorEmail) {
      await AdminAdaptiveService.recordAuditLog({
        actorId: adminContext.actorId || null,
        actorEmail: adminContext.actorEmail,
        actionType: "ADAPTIVE_ITEM_RECALIBRATED",
        targetEntity: "ADAPTIVE_CALIBRATION",
        targetId: questionVersionId,
        oldValue: currentCalib as unknown as Json,
        newValue: calibPayload as unknown as Json,
        reason: options?.reason || `Recalibrated item: ${result.sample_size} responses`,
      });
    }

    return result;
  }

  // ==========================================================================
  // 4. BATCH RECALIBRATION (BOUNDED & SAFE)
  // ==========================================================================

  static async recalibrateBatch(
    questionVersionIds: string[],
    options?: { reason?: string },
    adminContext?: { actorId?: string | null; actorEmail?: string }
  ): Promise<{ processedCount: number; results: CalibrationCalculationResult[] }> {
    if (!Array.isArray(questionVersionIds) || questionVersionIds.length === 0) {
      return { processedCount: 0, results: [] };
    }

    if (questionVersionIds.length > CALIBRATION_CONFIG_DEFAULTS.max_batch_recalibrate_size) {
      throw new Error(
        `Batch size exceeds safe maximum limit of ${CALIBRATION_CONFIG_DEFAULTS.max_batch_recalibrate_size} items.`
      );
    }

    const results: CalibrationCalculationResult[] = [];
    for (const qvId of questionVersionIds) {
      const res = await this.recalibrateQuestionVersion(qvId, options, adminContext);
      results.push(res);
    }

    return {
      processedCount: results.length,
      results,
    };
  }

  // ==========================================================================
  // 5. ITEM CALIBRATION DETAIL VIEW
  // ==========================================================================

  static async getItemCalibrationDetail(questionVersionId: string): Promise<ItemCalibrationDetailView | null> {
    const supabase = this.getClient();

    const [qvRes, calibRes, historyRes, evidenceRes] = await Promise.all([
      supabase
        .from("question_versions")
        .select("id, question_id, question_text, difficulty, options_type, language")
        .eq("id", questionVersionId)
        .maybeSingle(),
      supabase
        .from("adaptive_item_calibrations")
        .select("*")
        .eq("question_version_id", questionVersionId)
        .maybeSingle(),
      supabase
        .from("adaptive_item_calibration_history")
        .select("*")
        .eq("question_version_id", questionVersionId)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("adaptive_item_response_evidence")
        .select("is_correct")
        .eq("question_version_id", questionVersionId),
    ]);

    if (!qvRes.data) {
      return null;
    }

    const qv = qvRes.data;
    const calib = calibRes.data;
    const evidence = evidenceRes.data || [];
    const n = evidence.length || calib?.sample_size || 0;
    const correctCount = evidence.filter((e: any) => e.is_correct).length;
    const incorrectCount = n - correctCount;
    const accuracyRate = n > 0 ? correctCount / n : 0.0;
    const difficultyScore = n > 0 ? 1.0 - accuracyRate : 0.5;

    const history: CalibrationHistoryEntry[] = (historyRes.data || []).map((h: any) => ({
      id: h.id,
      question_version_id: h.question_version_id,
      calibration_id: h.calibration_id,
      previous_status: h.previous_status,
      new_status: h.new_status,
      previous_parameters: (h.previous_parameters as Record<string, unknown>) || {},
      new_parameters: (h.new_parameters as Record<string, unknown>) || {},
      sample_size: h.sample_size,
      calculated_at: h.calculated_at,
      calculation_version: h.calculation_version,
      reason: h.reason,
    }));

    return {
      id: calib?.id,
      question_version_id: qv.id,
      question_id: qv.question_id,
      question_text: qv.question_text,
      static_difficulty: qv.difficulty || "medium",
      options_type: qv.options_type || "text",
      language: qv.language || "en",
      sample_size: n,
      correct_count: correctCount,
      incorrect_count: incorrectCount,
      accuracy_rate: accuracyRate,
      difficulty_score: difficultyScore,
      difficulty_b: calib?.difficulty_b ?? null,
      discrimination_a: null,
      guessing_c: null,
      confidence_score: calib?.calibration_metadata?.confidence_score ?? 0.0,
      reliability_score: calib?.reliability_score ?? 0.0,
      calibration_status: (calib?.calibration_status as AdaptiveCalibrationStatus) || "uncalibrated",
      calibration_method: calib?.calibration_method || "uncalibrated_baseline",
      calibrated_at: calib?.calibrated_at || null,
      history,
    };
  }

  // ==========================================================================
  // 6. ADMINISTRATIVE CALIBRATION STATUS CONTROLS
  // ==========================================================================

  static async updateItemStatus(
    questionVersionId: string,
    newStatus: AdaptiveCalibrationStatus,
    actionType: string,
    reason: string,
    adminContext: { actorId?: string | null; actorEmail: string }
  ): Promise<boolean> {
    if (!reason || reason.trim().length < 5) {
      throw new Error("A valid reason (minimum 5 characters) is required for calibration status modification.");
    }

    const supabase = this.getClient();

    const { data: currentCalib } = await supabase
      .from("adaptive_item_calibrations")
      .select("*")
      .eq("question_version_id", questionVersionId)
      .maybeSingle();

    const oldStatus = currentCalib?.calibration_status || "uncalibrated";

    // 1. Record history
    await supabase.from("adaptive_item_calibration_history").insert({
      question_version_id: questionVersionId,
      calibration_id: currentCalib?.id || null,
      previous_status: oldStatus,
      new_status: newStatus,
      previous_parameters: currentCalib?.calibration_metadata || {},
      new_parameters: { updated_by_admin: true, reason },
      sample_size: currentCalib?.sample_size || 0,
      calculated_at: new Date().toISOString(),
      calculation_version: CALIBRATION_CONFIG_DEFAULTS.calculation_version,
      reason: `${actionType}: ${reason.trim()}`,
    });

    // 2. Upsert calibration record
    const { error } = await supabase.from("adaptive_item_calibrations").upsert(
      {
        question_version_id: questionVersionId,
        calibration_status: newStatus,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "question_version_id,calibration_version" }
    );

    if (error) {
      throw new Error(`Failed to update item status: ${error.message}`);
    }

    // 3. Write admin audit log
    await AdminAdaptiveService.recordAuditLog({
      actorId: adminContext.actorId || null,
      actorEmail: adminContext.actorEmail,
      actionType,
      targetEntity: "ADAPTIVE_CALIBRATION",
      targetId: questionVersionId,
      oldValue: { status: oldStatus },
      newValue: { status: newStatus },
      reason: reason.trim(),
    });

    return true;
  }

  static async flagQuestionVersion(
    questionVersionId: string,
    reason: string,
    adminContext: { actorId?: string | null; actorEmail: string }
  ): Promise<boolean> {
    return this.updateItemStatus(questionVersionId, "flagged", "ADAPTIVE_ITEM_FLAGGED", reason, adminContext);
  }

  static async unflagQuestionVersion(
    questionVersionId: string,
    reason: string,
    adminContext: { actorId?: string | null; actorEmail: string }
  ): Promise<boolean> {
    return this.updateItemStatus(questionVersionId, "uncalibrated", "ADAPTIVE_ITEM_UNFLAGGED", reason, adminContext);
  }

  static async deprecateQuestionVersion(
    questionVersionId: string,
    reason: string,
    adminContext: { actorId?: string | null; actorEmail: string }
  ): Promise<boolean> {
    return this.updateItemStatus(questionVersionId, "deprecated", "ADAPTIVE_ITEM_DEPRECATED", reason, adminContext);
  }

  static async restoreQuestionVersion(
    questionVersionId: string,
    reason: string,
    adminContext: { actorId?: string | null; actorEmail: string }
  ): Promise<boolean> {
    return this.updateItemStatus(questionVersionId, "uncalibrated", "ADAPTIVE_ITEM_RESTORED", reason, adminContext);
  }
}
