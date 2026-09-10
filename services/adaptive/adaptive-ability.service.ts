import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/types/database";
import { DifficultyTier } from "./adaptive-types";

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export type DifficultySource = "CALIBRATED" | "PROVISIONAL" | "STATIC_FALLBACK" | "DEPRECATED_FALLBACK";

export interface ResponseItemRecord {
  question_version_id: string;
  is_correct: boolean;
  difficulty_b: number;
  difficulty_source: DifficultySource;
  subject_id?: string | null;
  topic_id?: string | null;
  step_number?: number;
}

export interface EstimatorOptions {
  regularization_lambda?: number;
  min_theta?: number;
  max_theta?: number;
  min_se?: number;
  max_se?: number;
  max_iterations?: number;
  convergence_tolerance?: number;
  initial_theta?: number;
  initial_se?: number;
}

export interface EstimationResult {
  theta: number;
  standard_error: number;
  effective_information: number;
  converged: boolean;
  iterations: number;
  gradient: number;
  hessian: number;
  log_likelihood: number;
}

export interface RecordEstimationHistoryParams {
  attempt_id: string;
  attempt_state_id?: string | null;
  user_id: string;
  question_version_id: string;
  step_number: number;
  theta_before: number;
  theta_after: number;
  se_before: number;
  se_after: number;
  estimator_version?: string;
  difficulty_source: DifficultySource;
  difficulty_b: number;
  is_correct: boolean;
  converged: boolean;
  iterations: number;
  effective_information?: number;
  regularization_lambda?: number;
  subject_id?: string | null;
  topic_id?: string | null;
  metadata?: Record<string, unknown>;
}

export interface WarmStartConfig {
  enabled: boolean;
  min_theta?: number;
  max_theta?: number;
  min_confidence?: number;
}

// ============================================================================
// ADAPTIVE ABILITY SERVICE
// ============================================================================

export class AdaptiveAbilityService {
  public static readonly DEFAULT_LAMBDA = 0.2;
  public static readonly DEFAULT_MIN_THETA = -3.0;
  public static readonly DEFAULT_MAX_THETA = 3.0;
  public static readonly DEFAULT_MIN_SE = 0.10;
  public static readonly DEFAULT_MAX_SE = 1.0;
  public static readonly DEFAULT_MAX_ITERATIONS = 25;
  public static readonly DEFAULT_TOLERANCE = 0.0001;
  public static readonly ESTIMATOR_VERSION = "estimator_v1_regularized_1pl";

  /**
   * Evaluates the standard 1PL logistic response function:
   * P(correct | theta, b) = 1 / (1 + exp(-(theta - b)))
   */
  public static computeLogisticProbability(theta: number, b: number): number {
    const diff = theta - b;
    // Prevent floating point overflow / underflow
    if (diff > 15.0) return 0.999999;
    if (diff < -15.0) return 0.000001;
    const exponent = -diff;
    return 1.0 / (1.0 + Math.exp(exponent));
  }

  /**
   * Computes the regularized log-likelihood:
   * L(theta) = sum [ y_i * ln(P_i) + (1-y_i) * ln(1-P_i) ] - (lambda / 2) * theta^2
   */
  public static computeLogLikelihood(
    theta: number,
    responses: ResponseItemRecord[],
    lambda: number = this.DEFAULT_LAMBDA
  ): number {
    let sum = 0.0;
    for (const r of responses) {
      const p = this.computeLogisticProbability(theta, r.difficulty_b);
      const safeP = Math.max(1e-12, Math.min(1.0 - 1e-12, p));
      if (r.is_correct) {
        sum += Math.log(safeP);
      } else {
        sum += Math.log(1.0 - safeP);
      }
    }
    const penalty = 0.5 * lambda * (theta * theta);
    return sum - penalty;
  }

  /**
   * Computes the gradient (first derivative) of regularized log-likelihood:
   * g(theta) = sum [ y_i - P_i(theta) ] - lambda * theta
   */
  public static computeGradient(
    theta: number,
    responses: ResponseItemRecord[],
    lambda: number = this.DEFAULT_LAMBDA
  ): number {
    let sum = 0.0;
    for (const r of responses) {
      const p = this.computeLogisticProbability(theta, r.difficulty_b);
      const y = r.is_correct ? 1.0 : 0.0;
      sum += (y - p);
    }
    return sum - (lambda * theta);
  }

  /**
   * Computes the Hessian (second derivative) of regularized log-likelihood:
   * H(theta) = - sum [ P_i(theta) * (1 - P_i(theta)) ] - lambda
   */
  public static computeHessian(
    theta: number,
    responses: ResponseItemRecord[],
    lambda: number = this.DEFAULT_LAMBDA
  ): number {
    let sum = 0.0;
    for (const r of responses) {
      const p = this.computeLogisticProbability(theta, r.difficulty_b);
      sum += p * (1.0 - p);
    }
    return -sum - lambda;
  }

  /**
   * Computes effective information under regularized MAP framework:
   * I_effective(theta) = sum [ P_i(1 - P_i) ] + lambda
   */
  public static computeEffectiveInformation(
    theta: number,
    responses: ResponseItemRecord[],
    lambda: number = this.DEFAULT_LAMBDA
  ): number {
    let sum = 0.0;
    for (const r of responses) {
      const p = this.computeLogisticProbability(theta, r.difficulty_b);
      sum += p * (1.0 - p);
    }
    return sum + lambda;
  }

  /**
   * Computes Standard Error (SE) from effective information:
   * SE(theta) = 1 / sqrt(I_effective(theta))
   */
  public static computeStandardError(
    effectiveInfo: number,
    minSe: number = this.DEFAULT_MIN_SE,
    maxSe: number = this.DEFAULT_MAX_SE
  ): number {
    if (!Number.isFinite(effectiveInfo) || effectiveInfo <= 0) {
      return maxSe;
    }
    const rawSe = 1.0 / Math.sqrt(effectiveInfo);
    return Math.max(minSe, Math.min(maxSe, Number(rawSe.toFixed(4))));
  }

  /**
   * Solves for regularized MAP theta using bounded Newton-Raphson numerical optimization.
   * Deterministic, safe, finite-number guarded.
   */
  public static estimateAbility(
    responses: ResponseItemRecord[],
    initialTheta: number = 0.0,
    options?: EstimatorOptions
  ): EstimationResult {
    const lambda = options?.regularization_lambda ?? this.DEFAULT_LAMBDA;
    const minTheta = options?.min_theta ?? this.DEFAULT_MIN_THETA;
    const maxTheta = options?.max_theta ?? this.DEFAULT_MAX_THETA;
    const minSe = options?.min_se ?? this.DEFAULT_MIN_SE;
    const maxSe = options?.max_se ?? this.DEFAULT_MAX_SE;
    const maxIterations = options?.max_iterations ?? this.DEFAULT_MAX_ITERATIONS;
    const tolerance = options?.convergence_tolerance ?? this.DEFAULT_TOLERANCE;

    // Handle empty response history (Cold / Warm start prior)
    if (!responses || responses.length === 0) {
      const clampedInitial = Math.max(minTheta, Math.min(maxTheta, initialTheta));
      const info = lambda;
      const se = this.computeStandardError(info, minSe, maxSe);
      return {
        theta: Number(clampedInitial.toFixed(4)),
        standard_error: se,
        effective_information: Number(info.toFixed(4)),
        converged: true,
        iterations: 0,
        gradient: 0.0,
        hessian: -lambda,
        log_likelihood: 0.0,
      };
    }

    let currentTheta = Math.max(minTheta, Math.min(maxTheta, initialTheta));
    let converged = false;
    let iterationCount = 0;
    let lastGrad = 0.0;
    let lastHess = -lambda;

    for (let i = 1; i <= maxIterations; i++) {
      iterationCount = i;
      const grad = this.computeGradient(currentTheta, responses, lambda);
      const hess = this.computeHessian(currentTheta, responses, lambda);
      lastGrad = grad;
      lastHess = hess;

      // Check for zero / non-finite gradient or Hessian
      if (!Number.isFinite(grad) || !Number.isFinite(hess) || Math.abs(hess) < 1e-12) {
        break;
      }

      // Check gradient convergence
      if (Math.abs(grad) < tolerance) {
        converged = true;
        break;
      }

      // Newton-Raphson step: delta = -grad / hess
      const step = -grad / hess;
      const nextTheta = Math.max(minTheta, Math.min(maxTheta, currentTheta + step));

      // Check parameter step convergence
      if (Math.abs(nextTheta - currentTheta) < tolerance) {
        currentTheta = nextTheta;
        converged = true;
        break;
      }

      currentTheta = nextTheta;
    }

    // Safety fallback: if not converged or NaN/Infinity, clamp cleanly
    if (!Number.isFinite(currentTheta)) {
      currentTheta = Math.max(minTheta, Math.min(maxTheta, initialTheta));
      converged = false;
    }

    const finalTheta = Number(Math.max(minTheta, Math.min(maxTheta, currentTheta)).toFixed(4));
    const finalInfo = this.computeEffectiveInformation(finalTheta, responses, lambda);
    const finalSe = this.computeStandardError(finalInfo, minSe, maxSe);
    const finalLogLikelihood = Number(this.computeLogLikelihood(finalTheta, responses, lambda).toFixed(4));

    return {
      theta: finalTheta,
      standard_error: finalSe,
      effective_information: Number(finalInfo.toFixed(4)),
      converged,
      iterations: iterationCount,
      gradient: Number(lastGrad.toFixed(6)),
      hessian: Number(lastHess.toFixed(6)),
      log_likelihood: finalLogLikelihood,
    };
  }

  /**
   * Resolves item difficulty parameter (b) and records source using Phase 4D.2 calibration
   */
  public static async resolveItemDifficulty(
    supabase: SupabaseClient<Database>,
    questionVersionId: string,
    authorDifficulty?: string | null
  ): Promise<{ difficulty_b: number; difficulty_source: DifficultySource }> {
    try {
      const { data: calib } = await (supabase as any)
        .from("adaptive_item_calibrations")
        .select("calibration_status, difficulty_b")
        .eq("question_version_id", questionVersionId)
        .maybeSingle();

      if (calib) {
        if (calib.calibration_status === "calibrated" && typeof calib.difficulty_b === "number") {
          return {
            difficulty_b: Number(calib.difficulty_b.toFixed(4)),
            difficulty_source: "CALIBRATED",
          };
        }
        if (calib.calibration_status === "provisional" && typeof calib.difficulty_b === "number") {
          return {
            difficulty_b: Number(calib.difficulty_b.toFixed(4)),
            difficulty_source: "PROVISIONAL",
          };
        }
      }
    } catch {
      // Fallback on query error
    }

    // Static baseline author fallback
    const norm = (authorDifficulty || "medium").toLowerCase();
    let b = 0.0;
    if (norm === "easy") b = -1.0;
    else if (norm === "hard") b = 1.0;

    return {
      difficulty_b: b,
      difficulty_source: "STATIC_FALLBACK",
    };
  }

  /**
   * Records an immutable snapshot of the ability estimation state transition
   */
  public static async recordEstimationHistory(
    supabase: SupabaseClient<Database>,
    params: RecordEstimationHistoryParams
  ): Promise<void> {
    try {
      await (supabase as any)
        .from("adaptive_ability_estimation_history")
        .insert({
          attempt_id: params.attempt_id,
          attempt_state_id: params.attempt_state_id || null,
          user_id: params.user_id,
          question_version_id: params.question_version_id,
          step_number: params.step_number,
          theta_before: params.theta_before,
          theta_after: params.theta_after,
          se_before: params.se_before,
          se_after: params.se_after,
          estimator_version: params.estimator_version || this.ESTIMATOR_VERSION,
          difficulty_source: params.difficulty_source,
          difficulty_b: params.difficulty_b,
          is_correct: params.is_correct,
          converged: params.converged,
          iterations: params.iterations,
          effective_information: params.effective_information || null,
          regularization_lambda: params.regularization_lambda ?? this.DEFAULT_LAMBDA,
          subject_id: params.subject_id || null,
          topic_id: params.topic_id || null,
          metadata: params.metadata || {},
        });
    } catch (err) {
      console.warn("[AdaptiveAbilityService.recordEstimationHistory] Notice:", err);
    }
  }

  /**
   * Resolves warm start initial theta for a candidate from user_adaptive_profiles
   */
  public static async getWarmStartTheta(
    supabase: SupabaseClient<Database>,
    userId: string,
    examId: string,
    config: WarmStartConfig
  ): Promise<number> {
    if (!config.enabled) return 0.0;

    try {
      const { data: profile } = await supabase
        .from("user_adaptive_profiles")
        .select("overall_theta, overall_confidence")
        .eq("user_id", userId)
        .eq("exam_id", examId)
        .maybeSingle();

      if (profile && typeof profile.overall_theta === "number") {
        const minConf = config.min_confidence ?? 0.3;
        if (profile.overall_confidence >= minConf) {
          const minT = config.min_theta ?? -2.0;
          const maxT = config.max_theta ?? 2.0;
          return Math.max(minT, Math.min(maxT, profile.overall_theta));
        }
      }
    } catch {
      // Return default on error
    }

    return 0.0;
  }

  /**
   * Computes subject-level abilities from partitioned responses
   */
  public static computeSubjectAbilities(
    responses: ResponseItemRecord[],
    options?: EstimatorOptions
  ): Record<string, { theta: number; se: number; count: number; accuracy: number }> {
    const subjectGroups: Record<string, ResponseItemRecord[]> = {};

    for (const r of responses) {
      if (r.subject_id) {
        if (!subjectGroups[r.subject_id]) {
          subjectGroups[r.subject_id] = [];
        }
        subjectGroups[r.subject_id].push(r);
      }
    }

    const result: Record<string, { theta: number; se: number; count: number; accuracy: number }> = {};

    for (const [subjectId, items] of Object.entries(subjectGroups)) {
      const estimation = this.estimateAbility(items, 0.0, options);
      const correctCount = items.filter((x) => x.is_correct).length;
      result[subjectId] = {
        theta: estimation.theta,
        se: estimation.standard_error,
        count: items.length,
        accuracy: items.length > 0 ? Number((correctCount / items.length).toFixed(4)) : 0.0,
      };
    }

    return result;
  }
}
