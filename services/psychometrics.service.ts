/**
 * COURAGE LIBRARY — PHASE 5E.6.3
 * EXAM & QUESTION QUALITY PSYCHOMETRICS SERVICE
 * 
 * Production Item Classical Statistics and 1PL / Rasch Item Difficulty Calibration Engine.
 * Implements:
 * 1. Classical item statistics (p-value, empirical difficulty, omission rate, response time)
 * 2. Strict population isolation (guaranteeing CAT exclusion from linear calibration)
 * 3. Production 1PL / Rasch item calibration (PROX init, raw-score logits, alternating JMLE,
 *    λ = 0.05 regularization, zero-mean centering, max 50 iterations, ε = 0.005 convergence)
 * 4. Calibration lifecycle states (UNCALIBRATED, INSUFFICIENT_DATA, PROVISIONAL, CALIBRATED, UNSTABLE)
 * 5. Deterministic ordering, evidence watermarking, and immutable snapshot recording
 * 6. Non-hardcoded exam-specific marking scheme accommodation
 */

import crypto from 'crypto';
import { createAdminServerSupabaseClient } from '@/lib/supabase/server';
import {
  PsychometricPopulationType,
  ItemCalibrationState,
  ItemClassicalStats,
  ItemCalibrationResult,
  CalibrationBatchSummary,
  MeasurementUncertainty,
  ExamMarkingScheme,
  ItemResponseEvidenceRecord,
  DEFAULT_PSYCHOMETRIC_POLICY_V1,
  PsychometricPolicyConfig,
  ItemDiscriminationStats,
  DiscriminationRating,
  ItemDistractorAnalytics,
  DistractorOptionMetric,
  PsychometricModelVersion,
  PsychometricPolicyVersion,
  ICCGridSpecification,
  ItemInformationPoint,
  ItemCharacteristicCurveData,
  ItemInformationComparisonResult,
  SectionReliabilityStats,
  TestReliabilityStats,
  TestReliabilityStatus,
  ReliabilityQualityFlagKey,
  ReliabilityQualityFlag,
} from '@/types/psychometrics';

export interface CandidateItemResponse {
  attemptId: string;
  userId: string;
  questionVersionId: string;
  isCorrect: boolean;
  isAnswered: boolean;
  responseTimeMs: number;
  selectedOptionKey: string | null;
  submittedAt: string;
}

export interface ItemCalibrationInput {
  questionVersionId: string;
  questionId: string;
}

export class PsychometricsService {
  /**
   * Probability function for 1PL / Rasch model: P(theta, b) = 1 / (1 + exp(-(theta - b)))
   */
  public static calculateRaschProbability(theta: number, b: number): number {
    const exponent = -(theta - b);
    if (exponent > 35) return 0.0;
    if (exponent < -35) return 1.0;
    return 1.0 / (1.0 + Math.exp(exponent));
  }

  /**
   * Calculates Classical Item Statistics with full mathematical safety guards.
   */
  public static calculateClassicalStats(
    questionVersionId: string,
    population: PsychometricPopulationType,
    responses: CandidateItemResponse[]
  ): ItemClassicalStats {
    const totalAttempts = responses.length;
    if (totalAttempts === 0) {
      return {
        questionVersionId,
        population,
        totalAttempts: 0,
        correctAttempts: 0,
        incorrectAttempts: 0,
        unansweredAttempts: 0,
        facilityIndex: 0.0,
        empiricalDifficulty: 1.0,
        omissionRate: 0.0,
        avgResponseTimeMs: 0,
        facilityUncertainty: {
          standardError: 0.0,
          confidenceInterval95: [0.0, 0.0],
        },
      };
    }

    let correctAttempts = 0;
    let incorrectAttempts = 0;
    let unansweredAttempts = 0;
    let totalResponseTimeMs = 0;
    let responseTimeCount = 0;

    for (const r of responses) {
      if (!r.isAnswered) {
        unansweredAttempts++;
      } else if (r.isCorrect) {
        correctAttempts++;
      } else {
        incorrectAttempts++;
      }

      if (r.responseTimeMs > 0) {
        totalResponseTimeMs += r.responseTimeMs;
        responseTimeCount++;
      }
    }

    const eligibleResponses = correctAttempts + incorrectAttempts;
    let facilityIndex = 0.0;
    if (eligibleResponses > 0) {
      facilityIndex = correctAttempts / eligibleResponses;
    } else if (totalAttempts > 0 && unansweredAttempts === totalAttempts) {
      facilityIndex = 0.0;
    }

    // Bound facility strictly in [0.0, 1.0]
    facilityIndex = Math.max(0.0, Math.min(1.0, facilityIndex));
    const empiricalDifficulty = 1.0 - facilityIndex;
    const omissionRate = totalAttempts > 0 ? unansweredAttempts / totalAttempts : 0.0;
    const avgResponseTimeMs = responseTimeCount > 0 ? Math.round(totalResponseTimeMs / responseTimeCount) : 0;

    // Standard error of facility: SE = sqrt(p(1-p)/n)
    let seFacility = 0.0;
    if (eligibleResponses > 0 && facilityIndex > 0 && facilityIndex < 1) {
      seFacility = Math.sqrt((facilityIndex * (1.0 - facilityIndex)) / eligibleResponses);
    }

    const ciLower = Math.max(0.0, facilityIndex - 1.96 * seFacility);
    const ciUpper = Math.min(1.0, facilityIndex + 1.96 * seFacility);

    return {
      questionVersionId,
      population,
      totalAttempts,
      correctAttempts,
      incorrectAttempts,
      unansweredAttempts,
      facilityIndex: Number(facilityIndex.toFixed(4)),
      empiricalDifficulty: Number(empiricalDifficulty.toFixed(4)),
      omissionRate: Number(omissionRate.toFixed(4)),
      avgResponseTimeMs,
      facilityUncertainty: {
        standardError: Number(seFacility.toFixed(4)),
        confidenceInterval95: [Number(ciLower.toFixed(4)), Number(ciUpper.toFixed(4))],
        degreesOfFreedom: Math.max(0, eligibleResponses - 1),
      },
    };
  }

  /**
   * Filters and isolates response evidence by population type.
   * STRICT INVARIANT: POP_ADAPTIVE_CAT responses are completely excluded from classical linear calibrations.
   */
  public static filterResponsesByPopulation(
    responses: CandidateItemResponse[],
    population: PsychometricPopulationType
  ): CandidateItemResponse[] {
    if (population === 'POP_ADAPTIVE_CAT') {
      throw new Error(
        'POP_ADAPTIVE_CAT is strictly quarantined from classical item calibration. Use latent IRT ability models.'
      );
    }

    // Deduplicate responses to the candidate's first valid attempt to eliminate practice effect bias
    const userSeenMap = new Map<string, CandidateItemResponse>();
    const sortedResponses = [...responses].sort((a, b) => 
      new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime()
    );

    for (const r of sortedResponses) {
      const key = `${r.userId}_${r.questionVersionId}`;
      if (!userSeenMap.has(key)) {
        userSeenMap.set(key, r);
      }
    }

    return Array.from(userSeenMap.values());
  }

  /**
   * Computes a canonical, deterministic evidence watermark for an item or calibration run.
   * Invariant: Fully independent of execution timestamp, database retrieval order, or memory addresses.
   * Fully dependent on: population, identifiers, model_version, policy_version, and sorted response payload.
   */
  public static computeEvidenceWatermark(params: {
    population: PsychometricPopulationType;
    questionVersionId?: string;
    itemIds?: string[];
    modelVersion: string;
    policyVersion: string;
    evidence: Array<{
      attemptId: string;
      userId: string;
      questionVersionId?: string;
      isCorrect?: boolean;
      selectedOptionKey?: string | null;
      score?: number;
      submittedAt?: string;
    }>;
  }): string {
    const hasher = crypto.createHash('sha256');
    const qvPart = params.questionVersionId || (params.itemIds ? [...params.itemIds].sort().join(',') : 'ALL');
    hasher.update(`WATERMARK_V1|${params.population}|${qvPart}|${params.modelVersion}|${params.policyVersion}|${params.evidence.length}\n`);

    // Canonical sort of evidence records: userId ASC, questionVersionId ASC, attemptId ASC
    const canonicalEvidence = [...params.evidence].sort((a, b) => {
      if (a.userId !== b.userId) return a.userId.localeCompare(b.userId);
      const qvA = a.questionVersionId || '';
      const qvB = b.questionVersionId || '';
      if (qvA !== qvB) return qvA.localeCompare(qvB);
      return a.attemptId.localeCompare(b.attemptId);
    });

    for (const rec of canonicalEvidence) {
      const isCorr = rec.isCorrect ?? (rec as any).isTargetCorrect ?? '';
      const sc = rec.score ?? (rec as any).targetItemScore ?? '';
      hasher.update(`${rec.userId}|${rec.questionVersionId ?? ''}|${rec.attemptId}|${isCorr}|${rec.selectedOptionKey ?? ''}|${sc}\n`);
    }

    return hasher.digest('hex').substring(0, 16);
  }

  /**
   * Direct Pearson product-moment correlation calculation: corr(X, Y)
   * Used for direct mathematical verification and statistical validation.
   */
  public static calculatePearsonCorrelation(x: number[], y: number[]): number | null {
    if (x.length !== y.length || x.length < 2) return null;
    const N = x.length;

    let sumX = 0.0;
    let sumY = 0.0;
    let sumXY = 0.0;
    let sumX2 = 0.0;
    let sumY2 = 0.0;

    for (let i = 0; i < N; i++) {
      const xi = x[i];
      const yi = y[i];
      sumX += xi;
      sumY += yi;
      sumXY += xi * yi;
      sumX2 += xi * xi;
      sumY2 += yi * yi;
    }

    const numerator = N * sumXY - sumX * sumY;
    const denomX = N * sumX2 - sumX * sumX;
    const denomY = N * sumY2 - sumY * sumY;

    if (denomX <= 1e-12 || denomY <= 1e-12) {
      return null; // Zero variance in X or Y
    }

    const r = numerator / (Math.sqrt(denomX) * Math.sqrt(denomY));
    return Math.max(-1.0, Math.min(1.0, r));
  }

  /**
   * Executes the Authoritative 1PL / Rasch Item Difficulty Calibration Engine.
   * Uses Joint Alternating Estimation with Regularized Newton-Raphson updates.
   */
  public static calibrate1PLRaschItems(
    items: ItemCalibrationInput[],
    responses: CandidateItemResponse[],
    population: PsychometricPopulationType = 'POP_AGGREGATE_ALL',
    policy: PsychometricPolicyConfig = DEFAULT_PSYCHOMETRIC_POLICY_V1
  ): {
    results: ItemCalibrationResult[];
    batchSummary: CalibrationBatchSummary;
  } {
    if (population === 'POP_ADAPTIVE_CAT') {
      throw new Error('Adaptive CAT data cannot be calibrated using classical 1PL linear calibration.');
    }

    // 1. Deterministic Ordering of Items and Candidates
    const sortedItems = [...items].sort((a, b) => a.questionVersionId.localeCompare(b.questionVersionId));
    const itemIndexMap = new Map<string, number>();
    sortedItems.forEach((item, idx) => itemIndexMap.set(item.questionVersionId, idx));

    const K = sortedItems.length;
    if (K === 0) {
      return {
        results: [],
        batchSummary: {
          population,
          totalItemsProcessed: 0,
          calibratedItemsCount: 0,
          provisionalItemsCount: 0,
          unstableItemsCount: 0,
          insufficientDataCount: 0,
          overallConvergenceAchieved: true,
          maxIterationsReached: false,
          iterationsExecuted: 0,
          meanItemDifficulty: 0.0,
          evidenceWatermark: '',
          timestamp: new Date().toISOString(),
        },
      };
    }

    // 2. Filter responses and group by candidate (attempt)
    const filteredResponses = this.filterResponsesByPopulation(responses, population);
    const candidateMap = new Map<string, Map<number, boolean>>();

    for (const r of filteredResponses) {
      const itemIdx = itemIndexMap.get(r.questionVersionId);
      if (itemIdx !== undefined && r.isAnswered) {
        if (!candidateMap.has(r.userId)) {
          candidateMap.set(r.userId, new Map<number, boolean>());
        }
        candidateMap.get(r.userId)!.set(itemIdx, r.isCorrect);
      }
    }

    // Sort candidate IDs deterministically
    const sortedCandidateIds = Array.from(candidateMap.keys()).sort();
    const N = sortedCandidateIds.length;

    // Compute canonical evidence watermark
    const evidenceWatermark = this.computeEvidenceWatermark({
      population,
      itemIds: sortedItems.map(it => it.questionVersionId),
      modelVersion: '1PL_RASCH_V1',
      policyVersion: policy.policyVersion,
      evidence: filteredResponses.map(r => ({
        attemptId: r.attemptId,
        userId: r.userId,
        questionVersionId: r.questionVersionId,
        isCorrect: r.isCorrect,
        score: r.isCorrect ? 1.0 : 0.0,
      })),
    });

    // Compute Item Statistics
    const itemCorrectCounts = new Array<number>(K).fill(0);
    const itemAttemptCounts = new Array<number>(K).fill(0);

    for (let j = 0; j < N; j++) {
      const userId = sortedCandidateIds[j];
      const itemResponses = candidateMap.get(userId)!;
      for (const [itemIdx, isCorrect] of itemResponses.entries()) {
        itemAttemptCounts[itemIdx]++;
        if (isCorrect) {
          itemCorrectCounts[itemIdx]++;
        }
      }
    }

    // Check if sample size is sufficient across items
    const bParams = new Array<number>(K).fill(0.0);
    const itemStates = new Array<ItemCalibrationState>(K).fill('UNCALIBRATED');

    // 3. Initial Values (PROX Normal Approximation for b, raw score logits for theta)
    for (let i = 0; i < K; i++) {
      const n_i = itemAttemptCounts[i];
      if (n_i === 0) {
        itemStates[i] = 'UNCALIBRATED';
        bParams[i] = 0.0;
      } else if (n_i < policy.thresholds.minSampleProvisional) {
        itemStates[i] = 'INSUFFICIENT_DATA';
        const p_i = itemCorrectCounts[i] / n_i;
        bParams[i] = Math.max(-3.0, Math.min(3.0, 6.0 * (0.5 - p_i)));
      } else {
        const p_i = (itemCorrectCounts[i] + 0.5) / (n_i + 1.0); // Smoothed
        // PROX approximation: b_0 = ln((1-p)/p)
        const logit = Math.log((1.0 - p_i) / p_i);
        bParams[i] = Math.max(-3.0, Math.min(3.0, logit));
        itemStates[i] = n_i < policy.thresholds.minSampleCalibrated ? 'PROVISIONAL' : 'PROVISIONAL';
      }
    }

    // Candidate initial ability theta
    const thetaParams = new Array<number>(N).fill(0.0);
    const candidateScores = new Array<number>(N).fill(0);
    const candidateItemCounts = new Array<number>(N).fill(0);

    for (let j = 0; j < N; j++) {
      const userId = sortedCandidateIds[j];
      const itemResponses = candidateMap.get(userId)!;
      let score = 0;
      for (const [, isCorrect] of itemResponses.entries()) {
        if (isCorrect) score++;
      }
      candidateScores[j] = score;
      candidateItemCounts[j] = itemResponses.size;

      const totalItemsSeen = Math.max(1, itemResponses.size);
      const smoothedP = (score + 0.5) / (totalItemsSeen + 1.0);
      thetaParams[j] = Math.max(-3.5, Math.min(3.5, Math.log(smoothedP / (1.0 - smoothedP))));
    }

    // 4. Joint Alternating Estimation (JMLE with Regularized Newton-Raphson)
    let iterationsExecuted = 0;
    let overallConverged = false;
    let maxDeltaBFinal = 0.0;

    const activeItemIndices = [];
    for (let i = 0; i < K; i++) {
      if (itemAttemptCounts[i] >= policy.thresholds.minSampleProvisional) {
        activeItemIndices.push(i);
      }
    }

    // Execute calibration only if we have active items and candidates
    if (activeItemIndices.length >= 1 && N >= policy.thresholds.minSampleProvisional) {
      const lambda = policy.thresholds.regularizationLambda; // 0.05
      const tolerance = policy.thresholds.convergenceTolerance; // 0.005
      const maxIter = policy.thresholds.maxCalibrationIterations; // 50

      for (let t = 0; t < maxIter; t++) {
        iterationsExecuted++;
        const prevTheta = [...thetaParams];
        const prevB = [...bParams];

        // Step A: Update Candidate Abilities theta_j
        for (let j = 0; j < N; j++) {
          const userId = sortedCandidateIds[j];
          const itemResponses = candidateMap.get(userId)!;
          if (itemResponses.size === 0) continue;

          let expectedScore = 0.0;
          let informationSum = 0.0;

          for (const [itemIdx] of itemResponses.entries()) {
            const P = this.calculateRaschProbability(prevTheta[j], prevB[itemIdx]);
            expectedScore += P;
            informationSum += P * (1.0 - P);
          }

          const numerator = candidateScores[j] - expectedScore;
          const denominator = informationSum + lambda;
          const deltaTheta = numerator / denominator;

          thetaParams[j] = Math.max(-3.5, Math.min(3.5, prevTheta[j] + deltaTheta));
        }

        // Step B: Update Item Difficulties b_i
        for (const i of activeItemIndices) {
          let expectedCorrect = 0.0;
          let informationSum = 0.0;

          for (let j = 0; j < N; j++) {
            const userId = sortedCandidateIds[j];
            const itemResponses = candidateMap.get(userId)!;
            if (itemResponses.has(i)) {
              const P = this.calculateRaschProbability(thetaParams[j], prevB[i]);
              expectedCorrect += P;
              informationSum += P * (1.0 - P);
            }
          }

          // In Rasch JMLE: dL/db = - (n_correct - sum(P))
          const numerator = itemCorrectCounts[i] - expectedCorrect;
          const denominator = informationSum + lambda;
          const deltaB = -numerator / denominator;

          bParams[i] = Math.max(-3.0, Math.min(3.0, prevB[i] + deltaB));
        }

        // Step C: Rasch Centering / Identification Constraint: sum(b_i) = 0
        let sumB = 0.0;
        for (const i of activeItemIndices) {
          sumB += bParams[i];
        }
        const meanB = sumB / activeItemIndices.length;
        for (const i of activeItemIndices) {
          bParams[i] = Math.max(-3.0, Math.min(3.0, bParams[i] - meanB));
        }

        // Step D: Accurate convergence check against start of iteration
        let maxDeltaTheta = 0.0;
        for (let j = 0; j < N; j++) {
          const d = Math.abs(thetaParams[j] - prevTheta[j]);
          if (d > maxDeltaTheta) maxDeltaTheta = d;
        }

        let maxDeltaB = 0.0;
        for (const i of activeItemIndices) {
          const d = Math.abs(bParams[i] - prevB[i]);
          if (d > maxDeltaB) maxDeltaB = d;
        }

        maxDeltaBFinal = maxDeltaB;

        if (maxDeltaB < tolerance && maxDeltaTheta < tolerance) {
          overallConverged = true;
          break;
        }
      }
    }

    // 5. Compute Standard Errors & Final Calibration States
    const results: ItemCalibrationResult[] = [];
    const timestamp = new Date().toISOString();
    let calibratedCount = 0;
    let provisionalCount = 0;
    let unstableCount = 0;
    let insufficientCount = 0;

    for (let i = 0; i < K; i++) {
      const qvId = sortedItems[i].questionVersionId;
      const n_i = itemAttemptCounts[i];
      let seB = 0.0;

      // Compute SE(b_i) = 1 / sqrt(sum(P*(1-P)))
      if (n_i > 0) {
        let infoSum = 0.0;
        for (let j = 0; j < N; j++) {
          const userId = sortedCandidateIds[j];
          const itemResponses = candidateMap.get(userId)!;
          if (itemResponses.has(i)) {
            const P = this.calculateRaschProbability(thetaParams[j], bParams[i]);
            infoSum += P * (1.0 - P);
          }
        }
        if (infoSum > 0) {
          seB = 1.0 / Math.sqrt(infoSum);
        } else {
          seB = 6.0 / Math.sqrt(Math.max(1, n_i));
        }
      }

      let finalState: ItemCalibrationState = 'UNCALIBRATED';
      if (n_i < policy.thresholds.minSampleProvisional) {
        finalState = n_i === 0 ? 'UNCALIBRATED' : 'INSUFFICIENT_DATA';
        insufficientCount++;
      } else if (n_i < policy.thresholds.minSampleCalibrated) {
        finalState = 'PROVISIONAL';
        provisionalCount++;
      } else {
        // N >= 100
        if (overallConverged && seB <= 0.35) {
          finalState = 'CALIBRATED';
          calibratedCount++;
        } else if (!overallConverged || seB > 0.50) {
          finalState = 'UNSTABLE';
          unstableCount++;
        } else {
          finalState = 'CALIBRATED';
          calibratedCount++;
        }
      }

      const ciLower = Math.max(-3.0, bParams[i] - 1.96 * seB);
      const ciUpper = Math.min(3.0, bParams[i] + 1.96 * seB);

      results.push({
        questionVersionId: qvId,
        population,
        state: finalState,
        bDifficulty: Number(bParams[i].toFixed(4)),
        uncertainty: {
          standardError: Number(seB.toFixed(4)),
          confidenceInterval95: [Number(ciLower.toFixed(4)), Number(ciUpper.toFixed(4))],
          degreesOfFreedom: Math.max(0, n_i - 1),
        },
        sampleSize: n_i,
        iterationCount: iterationsExecuted,
        converged: overallConverged,
        maxDeltaB: Number(maxDeltaBFinal.toFixed(4)),
        meanPopulationAbility: Number((thetaParams.reduce((a, c) => a + c, 0) / Math.max(1, N)).toFixed(4)),
        evidenceWatermark,
        calibratedAt: timestamp,
        modelVersion: '1PL_RASCH_V1',
        policyVersion: policy.policyVersion,
      });
    }

    // Compute mean item difficulty across calibrated items
    let sumActiveB = 0.0;
    let countActive = 0;
    for (const r of results) {
      if (r.state === 'CALIBRATED' || r.state === 'PROVISIONAL') {
        sumActiveB += r.bDifficulty;
        countActive++;
      }
    }
    const meanItemDifficulty = countActive > 0 ? Number((sumActiveB / countActive).toFixed(4)) : 0.0;

    const batchSummary: CalibrationBatchSummary = {
      population,
      totalItemsProcessed: K,
      calibratedItemsCount: calibratedCount,
      provisionalItemsCount: provisionalCount,
      unstableItemsCount: unstableCount,
      insufficientDataCount: insufficientCount,
      overallConvergenceAchieved: overallConverged,
      maxIterationsReached: iterationsExecuted >= policy.thresholds.maxCalibrationIterations,
      iterationsExecuted,
      meanItemDifficulty,
      evidenceWatermark,
      timestamp,
    };

    return { results, batchSummary };
  }

  /**
   * Calculates Corrected Point-Biserial Discrimination ($r_{pbis-corrected}$) with Self-Score Exclusion.
   * Trait criterion: Rest-of-test score Y_(i) = Y_total - Y_i under authoritative negative marking scheme.
   */
  public static calculateCorrectedPointBiserial(
    questionVersionId: string,
    population: PsychometricPopulationType,
    candidateAttempts: Array<{
      userId: string;
      attemptId: string;
      submittedAt: string;
      totalScore: number;
      targetItemScore: number;
      isTargetCorrect: boolean;
      isTargetAnswered: boolean;
    }>,
    markingScheme: ExamMarkingScheme = { positiveMarks: 1.0, negativePenalty: 0.25, unansweredPenalty: 0.0 },
    policy: PsychometricPolicyConfig = DEFAULT_PSYCHOMETRIC_POLICY_V1
  ): ItemDiscriminationStats {
    if (population === 'POP_ADAPTIVE_CAT') {
      throw new Error('POP_ADAPTIVE_CAT is strictly quarantined from classical point-biserial discrimination.');
    }

    // 1. Deduplicate to first valid attempt per user
    const userAttemptMap = new Map<string, typeof candidateAttempts[0]>();
    const sortedAttempts = [...candidateAttempts].sort((a, b) => 
      new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime()
    );

    for (const att of sortedAttempts) {
      if (!userAttemptMap.has(att.userId)) {
        userAttemptMap.set(att.userId, att);
      }
    }

    const eligibleAttempts = Array.from(userAttemptMap.values()).filter(a => a.isTargetAnswered);
    const N = eligibleAttempts.length;

    // Minimum sample size gate: N >= 50
    if (N < policy.thresholds.minSampleDiscrimination) {
      return {
        questionVersionId,
        population,
        correctedPointBiserial: null,
        discriminationRating: 'INVALID',
        meanScoreCorrect: null,
        meanScoreIncorrect: null,
        restOfTestStdDev: null,
        varianceRestOfTest: null,
        isValid: false,
        sampleSize: N,
        uncertainty: null,
      };
    }

    // 2. Compute Rest-of-Test Scores: Y_(i) = Y_total - Y_i
    let sumCorrectRest = 0.0;
    let countCorrect = 0;
    let sumIncorrectRest = 0.0;
    let countIncorrect = 0;
    let sumRest = 0.0;
    let sumRestSq = 0.0;

    for (const att of eligibleAttempts) {
      const restOfTestScore = att.totalScore - att.targetItemScore;
      sumRest += restOfTestScore;
      sumRestSq += restOfTestScore * restOfTestScore;

      if (att.isTargetCorrect) {
        sumCorrectRest += restOfTestScore;
        countCorrect++;
      } else {
        sumIncorrectRest += restOfTestScore;
        countIncorrect++;
      }
    }

    // Facility p on eligible attempts
    const p = countCorrect / N;

    // Zero-variance / boundary check: p = 0 or p = 1
    if (countCorrect === 0 || countIncorrect === 0) {
      return {
        questionVersionId,
        population,
        correctedPointBiserial: null,
        discriminationRating: 'INVALID',
        meanScoreCorrect: countCorrect > 0 ? Number((sumCorrectRest / countCorrect).toFixed(4)) : null,
        meanScoreIncorrect: countIncorrect > 0 ? Number((sumIncorrectRest / countIncorrect).toFixed(4)) : null,
        restOfTestStdDev: null,
        varianceRestOfTest: null,
        isValid: false,
        sampleSize: N,
        uncertainty: null,
      };
    }

    const meanRestOfTest = sumRest / N;
    const varianceRestOfTest = (sumRestSq - (sumRest * sumRest) / N) / (N - 1);

    // Zero rest-of-test variance guard
    if (varianceRestOfTest <= 1e-7) {
      return {
        questionVersionId,
        population,
        correctedPointBiserial: null,
        discriminationRating: 'INVALID',
        meanScoreCorrect: Number((sumCorrectRest / countCorrect).toFixed(4)),
        meanScoreIncorrect: Number((sumIncorrectRest / countIncorrect).toFixed(4)),
        restOfTestStdDev: 0.0,
        varianceRestOfTest: 0.0,
        isValid: false,
        sampleSize: N,
        uncertainty: null,
      };
    }

    const restOfTestStdDev = Math.sqrt(varianceRestOfTest);
    const meanCorrect = sumCorrectRest / countCorrect;
    const meanIncorrect = sumIncorrectRest / countIncorrect;

    // Exact Pearson Correlation Formulation:
    // r_pbis_corrected = ((meanCorrect - meanIncorrect) / S_Y) * sqrt((countCorrect * countIncorrect) / (N * (N - 1)))
    // which is algebraically identical to corr(X, Y_(i))
    const pearsonFactor = Math.sqrt((countCorrect * countIncorrect) / (N * (N - 1)));
    let rPbis = ((meanCorrect - meanIncorrect) / restOfTestStdDev) * pearsonFactor;

    // Clamp strictly in [-1.0, +1.0]
    rPbis = Math.max(-1.0, Math.min(1.0, rPbis));

    // Standard Error of r_pbis: SE = (1 - r^2) / sqrt(N - 2)
    const seR = (1.0 - rPbis * rPbis) / Math.sqrt(Math.max(1, N - 2));
    const ciLower = Math.max(-1.0, rPbis - 1.96 * seR);
    const ciUpper = Math.min(1.0, rPbis + 1.96 * seR);

    // Quality Rating Matrix
    let rating: DiscriminationRating = 'POOR';
    if (rPbis >= 0.40) rating = 'EXCELLENT';
    else if (rPbis >= 0.30) rating = 'GOOD';
    else if (rPbis >= 0.20) rating = 'MARGINAL';
    else if (rPbis >= 0.00) rating = 'POOR';
    else rating = 'DEFECTIVE';

    // Canonical Evidence Watermark
    const evidenceWatermark = this.computeEvidenceWatermark({
      population,
      questionVersionId,
      modelVersion: '1PL_RASCH_V1',
      policyVersion: policy.policyVersion,
      evidence: eligibleAttempts.map(a => ({
        attemptId: a.attemptId,
        userId: a.userId,
        questionVersionId,
        isCorrect: a.isTargetCorrect,
        score: a.targetItemScore,
        submittedAt: a.submittedAt,
      })),
    });

    return {
      questionVersionId,
      population,
      correctedPointBiserial: Number(rPbis.toFixed(4)),
      discriminationRating: rating,
      meanScoreCorrect: Number(meanCorrect.toFixed(4)),
      meanScoreIncorrect: Number(meanIncorrect.toFixed(4)),
      restOfTestStdDev: Number(restOfTestStdDev.toFixed(4)),
      varianceRestOfTest: Number(varianceRestOfTest.toFixed(4)),
      isValid: true,
      sampleSize: N,
      uncertainty: {
        standardError: Number(seR.toFixed(4)),
        confidenceInterval95: [Number(ciLower.toFixed(4)), Number(ciUpper.toFixed(4))],
        degreesOfFreedom: N - 2,
      },
      evidenceWatermark,
      modelVersion: '1PL_RASCH_V1',
      policyVersion: policy.policyVersion,
    };
  }

  /**
   * Calculates Distractor Analytics and Option Choice Dynamics.
   * Evaluates selection frequencies, distractor biserials, non-functioning options, and positive distractor anomalies.
   */
  public static calculateDistractorAnalytics(
    questionVersionId: string,
    population: PsychometricPopulationType,
    candidateAttempts: Array<{
      userId: string;
      attemptId: string;
      submittedAt: string;
      totalScore: number;
      targetItemScore: number;
      selectedOptionKey: string | null;
      isTargetAnswered: boolean;
    }>,
    options: Array<{
      key: string;
      isCorrect: boolean;
    }>,
    policy: PsychometricPolicyConfig = DEFAULT_PSYCHOMETRIC_POLICY_V1
  ): ItemDistractorAnalytics {
    if (population === 'POP_ADAPTIVE_CAT') {
      throw new Error('POP_ADAPTIVE_CAT is strictly quarantined from distractor analytics.');
    }

    // 1. Deduplicate to first valid attempt per user
    const userAttemptMap = new Map<string, typeof candidateAttempts[0]>();
    const sortedAttempts = [...candidateAttempts].sort((a, b) => 
      new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime()
    );

    for (const att of sortedAttempts) {
      if (!userAttemptMap.has(att.userId)) {
        userAttemptMap.set(att.userId, att);
      }
    }

    const eligibleAttempts = Array.from(userAttemptMap.values()).filter(a => a.isTargetAnswered);
    const N = eligibleAttempts.length;

    // Canonical Evidence Watermark
    const evidenceWatermark = this.computeEvidenceWatermark({
      population,
      questionVersionId,
      modelVersion: '1PL_RASCH_V1',
      policyVersion: policy.policyVersion,
      evidence: eligibleAttempts.map(a => ({
        attemptId: a.attemptId,
        userId: a.userId,
        questionVersionId,
        selectedOptionKey: a.selectedOptionKey,
        score: a.targetItemScore,
        submittedAt: a.submittedAt,
      })),
    });

    if (N === 0 || options.length === 0) {
      return {
        questionVersionId,
        population,
        totalResponses: 0,
        options: options.map(opt => ({
          optionKey: opt.key,
          isCorrectKey: opt.isCorrect,
          selectionCount: 0,
          selectionProportion: 0.0,
          distractorBiserial: null,
          isNonFunctioning: false,
          isPositiveDistractor: false,
        })),
        hasNonFunctioningDistractor: false,
        hasPositiveDistractorDiscrimination: false,
        evidenceWatermark,
        modelVersion: '1PL_RASCH_V1',
        policyVersion: policy.policyVersion,
      };
    }

    // 2. Compute Rest-of-Test standard deviation
    let sumRest = 0.0;
    let sumRestSq = 0.0;
    for (const att of eligibleAttempts) {
      const restScore = att.totalScore - att.targetItemScore;
      sumRest += restScore;
      sumRestSq += restScore * restScore;
    }
    const varianceRestOfTest = N > 1 ? (sumRestSq - (sumRest * sumRest) / N) / (N - 1) : 0.0;
    const restOfTestStdDev = varianceRestOfTest > 1e-7 ? Math.sqrt(varianceRestOfTest) : 0.0;

    // 3. Option counts & option rest-of-test sum aggregations
    const optionCounts = new Map<string, number>();
    const optionRestSums = new Map<string, number>();
    options.forEach(opt => {
      optionCounts.set(opt.key, 0);
      optionRestSums.set(opt.key, 0.0);
    });

    for (const att of eligibleAttempts) {
      if (att.selectedOptionKey && optionCounts.has(att.selectedOptionKey)) {
        optionCounts.set(att.selectedOptionKey, optionCounts.get(att.selectedOptionKey)! + 1);
        const restScore = att.totalScore - att.targetItemScore;
        optionRestSums.set(att.selectedOptionKey, optionRestSums.get(att.selectedOptionKey)! + restScore);
      }
    }

    // 4. Calculate metrics for each option
    let hasNonFunctioning = false;
    let hasPositiveDistractor = false;

    const optionMetrics: DistractorOptionMetric[] = options.map(opt => {
      const count = optionCounts.get(opt.key) || 0;
      const proportion = Number((count / N).toFixed(4));

      if (opt.isCorrect) {
        return {
          optionKey: opt.key,
          isCorrectKey: true,
          selectionCount: count,
          selectionProportion: proportion,
          distractorBiserial: null,
          isNonFunctioning: false,
          isPositiveDistractor: false,
        };
      }

      // Distractor options
      // Non-functioning alert: selection proportion < 3% with N >= 100
      const isNonFunctioning = proportion < policy.thresholds.nonFunctioningDistractorRate && N >= policy.thresholds.minSampleCalibrated;
      if (isNonFunctioning) hasNonFunctioning = true;

      // Distractor point-biserial: r_dist = ((mean_k - mean_not_k) / S_Y) * sqrt((count * (N - count)) / (N * (N - 1)))
      let distractorBiserial: number | null = null;
      let isPositive = false;

      if (count > 0 && count < N && restOfTestStdDev > 0 && N >= policy.thresholds.minSampleDistractor) {
        const sumRestK = optionRestSums.get(opt.key) || 0;
        const meanK = sumRestK / count;
        const countNotK = N - count;
        const sumRestNotK = sumRest - sumRestK;
        const meanNotK = sumRestNotK / countNotK;

        // Exact Pearson correlation between binary option indicator X_k and rest-of-test score Y_(i)
        const pearsonDistractorFactor = Math.sqrt((count * countNotK) / (N * (N - 1)));
        let rDist = ((meanK - meanNotK) / restOfTestStdDev) * pearsonDistractorFactor;
        rDist = Math.max(-1.0, Math.min(1.0, rDist));
        distractorBiserial = Number(rDist.toFixed(4));

        // Anomaly alert: positive distractor discrimination (r_dist > 0.05)
        if (rDist > policy.thresholds.positiveDistractorDiscrimination) {
          isPositive = true;
          hasPositiveDistractor = true;
        }
      }

      return {
        optionKey: opt.key,
        isCorrectKey: false,
        selectionCount: count,
        selectionProportion: proportion,
        distractorBiserial,
        isNonFunctioning,
        isPositiveDistractor: isPositive,
      };
    });

    return {
      questionVersionId,
      population,
      totalResponses: N,
      options: optionMetrics,
      hasNonFunctioningDistractor: hasNonFunctioning,
      hasPositiveDistractorDiscrimination: hasPositiveDistractor,
      evidenceWatermark,
      modelVersion: '1PL_RASCH_V1',
      policyVersion: policy.policyVersion,
    };
  }

  /**
   * Persists item psychometric calibration snapshots to the database.
   * STRICT INVARIANT: Records immutable point-in-time snapshots to item_psychometric_snapshots.
   */
  public static async persistCalibrationSnapshots(
    results: ItemCalibrationResult[],
    scoringSemantics: ExamMarkingScheme = { positiveMarks: 1.0, negativePenalty: 0.25, unansweredPenalty: 0.0 }
  ): Promise<{ persistedCount: number }> {
    if (results.length === 0) return { persistedCount: 0 };

    const supabase = createAdminServerSupabaseClient() as any;
    const snapshotRows = results.map(r => ({
      question_version_id: r.questionVersionId,
      population: r.population,
      state: r.state,
      facility_p: null,
      difficulty_b: r.bDifficulty,
      discrimination_pbis: null,
      distractor_metrics: [],
      quality_flags: [],
      sample_size: r.sampleSize,
      uncertainty: r.uncertainty,
      model_version: r.modelVersion,
      policy_version: r.policyVersion,
      evidence_watermark: r.evidenceWatermark,
      scoring_semantics: scoringSemantics,
      snapshot_at: r.calibratedAt,
      metadata: {
        iteration_count: r.iterationCount,
        converged: r.converged,
        max_delta_b: r.maxDeltaB,
        mean_population_ability: r.meanPopulationAbility,
      },
    }));

    // Insert immutable snapshots (triggers protect against updates/deletes)
    const { error: snapshotError } = await supabase
      .from('item_psychometric_snapshots')
      .insert(snapshotRows);

    if (snapshotError) {
      console.error('Error persisting item_psychometric_snapshots:', snapshotError);
      throw new Error(`Failed to persist item psychometric snapshots: ${snapshotError.message}`);
    }

    // Update active calibration table public.adaptive_item_calibrations additively
    for (const r of results) {
      await supabase
        .from('adaptive_item_calibrations')
        .update({
          difficulty_b: r.bDifficulty,
          sample_size: r.sampleSize,
          calibration_status: r.state.toLowerCase(),
          standard_error_b: r.uncertainty.standardError,
          confidence_interval_95: r.uncertainty.confidenceInterval95,
          policy_version: r.policyVersion,
          model_version: r.modelVersion,
          evidence_watermark: r.evidenceWatermark,
          evidence_count: r.sampleSize,
          iterations_count: r.iterationCount,
          is_converged: r.converged,
          calibrated_at: r.calibratedAt,
          updated_at: new Date().toISOString(),
        })
        .eq('question_version_id', r.questionVersionId);
    }

    return { persistedCount: results.length };
  }

  // ============================================================================
  // PHASE 5E.6.5: 1PL INFORMATION FUNCTION & ITEM CHARACTERISTIC CURVE ENGINE
  // ============================================================================

  /**
   * Computes P(correct | theta, b) under the authoritative 1PL Rasch model.
   * P(correct | theta, b) = 1 / (1 + exp(-(theta - b)))
   * Numerically stable implementation preventing overflow, underflow, NaN, and Infinity.
   */
  public static getProbabilityCorrect(
    theta: number,
    itemDifficulty: number,
    modelVersion: PsychometricModelVersion = '1PL_RASCH_V1'
  ): number {
    if (modelVersion !== '1PL_RASCH_V1') {
      throw new Error(`Unsupported model version '${modelVersion}'. Only '1PL_RASCH_V1' is authorized for production psychometrics.`);
    }

    const logit = theta - itemDifficulty;

    // Extreme bound protections
    if (logit > 35.0) return 1.0;
    if (logit < -35.0) return 0.0;

    // Numerically stable sigmoid branching
    if (logit >= 0.0) {
      const expNeg = Math.exp(-logit);
      return 1.0 / (1.0 + expNeg);
    } else {
      const expPos = Math.exp(logit);
      return expPos / (1.0 + expPos);
    }
  }

  /**
   * Computes Item Information I(theta) and Normalized Information I_norm(theta).
   * For 1PL Rasch: I(theta) = P(theta)(1 - P(theta)), max information = 0.25 at theta = b.
   * Normalized: I_norm(theta) = I(theta) / 0.25 in [0.0, 1.0].
   * Standard Error: CONDITIONAL_ITEM_INFORMATION_SE = 1 / sqrt(I(theta))
   * (Strictly distinct from Phase 5E.6.6 test-level SEM = sigma_test * sqrt(1 - alpha)).
   */
  public static getItemInformation(
    theta: number,
    itemDifficulty: number,
    modelVersion: PsychometricModelVersion = '1PL_RASCH_V1'
  ): {
    probability: number;
    information: number;
    normalizedInformation: number;
    standardError: number;
  } {
    const p = this.getProbabilityCorrect(theta, itemDifficulty, modelVersion);
    const q = 1.0 - p;
    const info = p * q;
    const clampedInfo = Math.max(0.0, Math.min(0.25, info));
    const normalizedInfo = Math.max(0.0, Math.min(1.0, clampedInfo / 0.25));
    const se = 1.0 / Math.sqrt(Math.max(1e-12, clampedInfo));

    return {
      probability: p,
      information: clampedInfo,
      normalizedInformation: normalizedInfo,
      standardError: se,
    };
  }

  /**
   * Generates theoretical Item Characteristic Curve (ICC) and Item Information Curve (IIF) data
   * across a deterministic theta grid for admin question intelligence.
   * Enforces calibration state gating and population isolation.
   */
  public static generateItemCharacteristicCurve(params: {
    questionVersionId: string;
    population: PsychometricPopulationType;
    bDifficulty: number;
    state: ItemCalibrationState;
    evidenceWatermark?: string;
    modelVersion?: PsychometricModelVersion;
    policyVersion?: PsychometricPolicyVersion;
    gridSpec?: Partial<ICCGridSpecification>;
    allowProvisional?: boolean;
  }): ItemCharacteristicCurveData {
    const {
      questionVersionId,
      population,
      bDifficulty,
      state,
      evidenceWatermark = 'PROD_CALIBRATED',
      modelVersion = '1PL_RASCH_V1',
      policyVersion = 'PSYCHOMETRIC_POLICY_V1',
      gridSpec,
      allowProvisional = false,
    } = params;

    // 1. Population Isolation: CAT is quarantined from linear psychometrics
    if (population === 'POP_ADAPTIVE_CAT') {
      throw new Error('POP_ADAPTIVE_CAT is strictly quarantined from classical ICC/IIF generation.');
    }

    // 2. Model Version Gating
    if (modelVersion !== '1PL_RASCH_V1') {
      throw new Error(`Unsupported model version '${modelVersion}'. Only '1PL_RASCH_V1' is authorized for production psychometrics.`);
    }

    // 3. Calibration State Gating
    if (state === 'UNCALIBRATED' || state === 'INSUFFICIENT_DATA') {
      throw new Error(`Cannot generate authoritative ICC/IIF: Item is in '${state}' state.`);
    }
    if (state === 'UNSTABLE' || state === 'DEPRECATED') {
      throw new Error(`Cannot generate authoritative ICC/IIF: Item is in '${state}' state and excluded from production.`);
    }
    if (state === 'PROVISIONAL' && !allowProvisional) {
      throw new Error("Item calibration is in 'PROVISIONAL' state. Explicit allowProvisional flag is required for provisional curves.");
    }

    // 4. Grid Specification & Deterministic Grid Generation
    const minTheta = gridSpec?.minTheta ?? -3.0;
    const maxTheta = gridSpec?.maxTheta ?? +3.0;
    const step = gridSpec?.step ?? 0.1;

    if (step <= 0 || minTheta >= maxTheta) {
      throw new Error('Invalid grid specification: minTheta must be < maxTheta and step > 0.');
    }

    const theoreticalCurve: ItemInformationPoint[] = [];
    const numSteps = Math.round((maxTheta - minTheta) / step);

    for (let s = 0; s <= numSteps; s++) {
      const rawTheta = minTheta + s * step;
      const theta = Number(rawTheta.toFixed(4));
      const infoStats = this.getItemInformation(theta, bDifficulty, modelVersion);

      theoreticalCurve.push({
        theta,
        probability: Number(infoStats.probability.toFixed(6)),
        information: Number(infoStats.information.toFixed(6)),
        normalizedInformation: Number(infoStats.normalizedInformation.toFixed(6)),
        standardError: Number(infoStats.standardError.toFixed(4)),
        itemDifficulty: bDifficulty,
        modelVersion,
      });
    }

    return {
      questionVersionId,
      population,
      state,
      bDifficulty,
      theoreticalCurve,
      peakInformationTheta: bDifficulty,
      maxInformationValue: 0.25,
      maxNormalizedInformation: 1.0,
      gridSpecification: {
        minTheta,
        maxTheta,
        step,
      },
      isProvisional: state === 'PROVISIONAL',
      evidenceWatermark,
      modelVersion,
      policyVersion,
    };
  }

  /**
   * Admin comparison utility to evaluate relative measurement precision of two calibrated items at a given ability level theta.
   */
  public static compareItemInformationAtTheta(
    theta: number,
    itemA: { questionVersionId: string; bDifficulty: number; state: ItemCalibrationState },
    itemB: { questionVersionId: string; bDifficulty: number; state: ItemCalibrationState },
    modelVersion: PsychometricModelVersion = '1PL_RASCH_V1',
    allowProvisional = false
  ): ItemInformationComparisonResult {
    // Validate state
    const validateState = (item: { questionVersionId: string; state: ItemCalibrationState }, label: string) => {
      if (item.state === 'UNCALIBRATED' || item.state === 'INSUFFICIENT_DATA' || item.state === 'UNSTABLE' || item.state === 'DEPRECATED') {
        throw new Error(`Cannot compare ${label} (${item.questionVersionId}): Item is in invalid state '${item.state}'.`);
      }
      if (item.state === 'PROVISIONAL' && !allowProvisional) {
        throw new Error(`Cannot compare ${label} (${item.questionVersionId}): Item is PROVISIONAL without allowProvisional flag.`);
      }
    };

    validateState(itemA, 'itemA');
    validateState(itemB, 'itemB');

    const infoA = this.getItemInformation(theta, itemA.bDifficulty, modelVersion);
    const infoB = this.getItemInformation(theta, itemB.bDifficulty, modelVersion);

    const diff = Math.abs(infoA.information - infoB.information);
    let preferred: 'ITEM_A' | 'ITEM_B' | 'EQUAL' = 'EQUAL';
    if (infoA.information > infoB.information + 1e-6) {
      preferred = 'ITEM_A';
    } else if (infoB.information > infoA.information + 1e-6) {
      preferred = 'ITEM_B';
    }

    return {
      theta,
      itemA: {
        questionVersionId: itemA.questionVersionId,
        bDifficulty: itemA.bDifficulty,
        probability: Number(infoA.probability.toFixed(6)),
        information: Number(infoA.information.toFixed(6)),
        normalizedInformation: Number(infoA.normalizedInformation.toFixed(6)),
      },
      itemB: {
        questionVersionId: itemB.questionVersionId,
        bDifficulty: itemB.bDifficulty,
        probability: Number(infoB.probability.toFixed(6)),
        information: Number(infoB.information.toFixed(6)),
        normalizedInformation: Number(infoB.normalizedInformation.toFixed(6)),
      },
      preferredItem: preferred,
      informationDifference: Number(diff.toFixed(6)),
      modelVersion,
    };
  }

  // ============================================================================
  // PHASE 5E.6.6: SECTION & TEST RELIABILITY ENGINE
  // (Cronbach's Alpha + Test SEM + Section Reliability + Omega Quarantine)
  // ============================================================================

  /**
   * Computes authoritative Classical Cronbach's Alpha from a binary item-response matrix.
   * alpha = (K / (K - 1)) * (1 - sum(sigma^2_i) / sigma^2_T)
   * 
   * Strict Safeguards:
   * - Requires K >= 3 items (otherwise returns NOT_APPLICABLE)
   * - Requires N >= 30 complete cases (otherwise returns INSUFFICIENT_DATA)
   * - Handles zero total-score variance safely without division by zero
   * - Returns calculated negative alpha if present (diagnostic evidence, never truncated to 0 or crash)
   * - Emits deterministic quality flags (NEGATIVE_ALPHA, EXTREME_ALPHA, ZERO_SCORE_VARIANCE, etc.)
   */
  public static calculateCronbachAlpha(
    binaryMatrix: number[][],
    options?: {
      minItems?: number;
      minSample?: number;
    }
  ): {
    cronbachAlpha: number | null;
    totalScoreVariance: number;
    sumItemVariances: number;
    isAlphaValid: boolean;
    status: TestReliabilityStatus;
    qualityFlags: ReliabilityQualityFlagKey[];
  } {
    const minItems = options?.minItems ?? 3;
    const minSample = options?.minSample ?? 30;

    const sampleSize = binaryMatrix.length;
    const itemCount = binaryMatrix[0]?.length ?? 0;
    const qualityFlags: ReliabilityQualityFlagKey[] = [];

    // 1. Minimum Item Count Check
    if (itemCount < minItems) {
      qualityFlags.push('LOW_ITEM_COUNT');
      return {
        cronbachAlpha: null,
        totalScoreVariance: 0,
        sumItemVariances: 0,
        isAlphaValid: false,
        status: 'NOT_APPLICABLE',
        qualityFlags,
      };
    }

    // 2. Minimum Sample Size Check
    if (sampleSize < minSample) {
      qualityFlags.push('INSUFFICIENT_SAMPLE');
      return {
        cronbachAlpha: null,
        totalScoreVariance: 0,
        sumItemVariances: 0,
        isAlphaValid: false,
        status: 'INSUFFICIENT_DATA',
        qualityFlags,
      };
    }

    // 3. Compute Candidate Total Binary Scores: T_j = sum_{i=0}^{K-1} X_{j,i}
    const candidateTotals: number[] = new Array(sampleSize);
    let sumTotalScores = 0;

    for (let j = 0; j < sampleSize; j++) {
      let candidateSum = 0;
      const row = binaryMatrix[j];
      for (let i = 0; i < itemCount; i++) {
        candidateSum += (row[i] === 1 ? 1 : 0);
      }
      candidateTotals[j] = candidateSum;
      sumTotalScores += candidateSum;
    }

    const meanTotalScore = sumTotalScores / sampleSize;

    // 4. Sample Variance of Total Binary Scores: sigma^2_T = (1 / (N - 1)) * sum( (T_j - mean_T)^2 )
    let sumSquaredTotalDeviations = 0;
    for (let j = 0; j < sampleSize; j++) {
      const dev = candidateTotals[j] - meanTotalScore;
      sumSquaredTotalDeviations += dev * dev;
    }
    const totalScoreVariance = sumSquaredTotalDeviations / (sampleSize - 1);

    // 5. Zero Variance Protection
    if (totalScoreVariance <= 1e-12) {
      qualityFlags.push('ZERO_SCORE_VARIANCE');
      return {
        cronbachAlpha: null,
        totalScoreVariance: 0.0,
        sumItemVariances: 0.0,
        isAlphaValid: false,
        status: 'ZERO_VARIANCE',
        qualityFlags,
      };
    }

    // 6. Sample Variance of Individual Binary Items: sigma^2_i = (1 / (N - 1)) * sum( (X_{j,i} - p_i)^2 ) = (N / (N - 1)) * p_i * (1 - p_i)
    let sumItemVariances = 0;
    for (let i = 0; i < itemCount; i++) {
      let correctCount = 0;
      for (let j = 0; j < sampleSize; j++) {
        if (binaryMatrix[j][i] === 1) {
          correctCount++;
        }
      }
      const p = correctCount / sampleSize;
      const itemVariance = (sampleSize / (sampleSize - 1)) * (p * (1.0 - p));
      sumItemVariances += itemVariance;
    }

    // 7. Cronbach's Alpha: alpha = (K / (K - 1)) * (1 - (sumItemVariances / totalScoreVariance))
    const kFactor = itemCount / (itemCount - 1);
    const varianceRatio = sumItemVariances / totalScoreVariance;
    const rawAlpha = kFactor * (1.0 - varianceRatio);

    // 8. Diagnostic Quality Flags on Alpha
    if (rawAlpha < 0.0) {
      qualityFlags.push('NEGATIVE_ALPHA');
    } else if (rawAlpha > 0.95) {
      qualityFlags.push('EXTREME_ALPHA');
    }

    return {
      cronbachAlpha: Number(rawAlpha.toFixed(4)),
      totalScoreVariance: Number(totalScoreVariance.toFixed(4)),
      sumItemVariances: Number(sumItemVariances.toFixed(4)),
      isAlphaValid: true,
      status: 'CALCULATED',
      qualityFlags,
    };
  }

  /**
   * Computes the Test Standard Error of Measurement:
   * TEST_SEM = sigma_test * sqrt(max(0, 1 - alpha))
   * 
   * CRITICAL TERMINOLOGY DISTINCTION:
   * - Phase 5E.6.6: TEST_SEM = sigma_test * sqrt(1 - alpha)  (Score metric measurement uncertainty across total paper)
   * - Phase 5E.6.5: CONDITIONAL_ITEM_INFORMATION_SE = 1 / sqrt(I(theta)) (Item-level information precision in Rasch space)
   */
  public static calculateTestSEM(
    authoritativeScoreStdDev: number,
    cronbachAlpha: number | null
  ): number | null {
    if (cronbachAlpha === null || isNaN(cronbachAlpha)) {
      return null;
    }
    if (authoritativeScoreStdDev < 0 || isNaN(authoritativeScoreStdDev)) {
      return null;
    }
    if (authoritativeScoreStdDev === 0) {
      return 0.0;
    }

    // If alpha < 0 (diagnostic negative alpha), (1 - alpha) > 1 is computed faithfully
    const factor = Math.max(0, 1.0 - cronbachAlpha);
    const sem = authoritativeScoreStdDev * Math.sqrt(factor);
    return Number(sem.toFixed(4));
  }

  /**
   * Computes section-level reliability stats for a specific section.
   */
  public static calculateSectionReliability(params: {
    sectionId: string;
    sectionName: string;
    itemIds: string[];
    candidateResponses: Array<{
      attemptId: string;
      userId: string;
      sectionScore: number;
      itemResponses: Record<string, { isCorrect: boolean; isAnswered: boolean }>;
    }>;
    policyVersion?: PsychometricPolicyVersion;
  }): SectionReliabilityStats {
    const { sectionId, sectionName, itemIds, candidateResponses } = params;
    const itemCount = itemIds.length;
    const totalCandidates = candidateResponses.length;

    // Filter to complete cases in this section
    const completeCaseMatrix: number[][] = [];
    const sectionAuthoritativeScores: number[] = [];

    for (const cand of candidateResponses) {
      let isComplete = true;
      const row: number[] = [];
      for (const itemId of itemIds) {
        const resp = cand.itemResponses[itemId];
        if (!resp) {
          isComplete = false;
          break;
        }
        row.push(resp.isAnswered && resp.isCorrect ? 1 : 0);
      }
      if (isComplete) {
        completeCaseMatrix.push(row);
        sectionAuthoritativeScores.push(cand.sectionScore);
      }
    }

    const completeCaseCount = completeCaseMatrix.length;
    const excludedCaseCount = totalCandidates - completeCaseCount;

    const alphaResult = this.calculateCronbachAlpha(completeCaseMatrix, {
      minItems: 3,
      minSample: 30,
    });

    // Compute section authoritative score standard deviation
    let sectionScoreSD = 0.0;
    if (completeCaseCount > 1) {
      const meanSectionScore = sectionAuthoritativeScores.reduce((a, b) => a + b, 0) / completeCaseCount;
      const sumSq = sectionAuthoritativeScores.reduce((acc, val) => acc + Math.pow(val - meanSectionScore, 2), 0);
      sectionScoreSD = Math.sqrt(sumSq / (completeCaseCount - 1));
    }

    const sectionSEM = this.calculateTestSEM(sectionScoreSD, alphaResult.cronbachAlpha);

    // Map quality flags
    const structuredFlags = this.mapQualityFlags(alphaResult.qualityFlags, {
      sampleSize: completeCaseCount,
      itemCount,
      alpha: alphaResult.cronbachAlpha,
      variance: alphaResult.totalScoreVariance,
    });

    return {
      sectionId,
      sectionName,
      itemCount,
      sampleSize: totalCandidates,
      completeCaseCount,
      excludedCaseCount,
      totalVariance: alphaResult.totalScoreVariance,
      sumItemVariances: alphaResult.sumItemVariances,
      cronbachAlpha: alphaResult.cronbachAlpha,
      standardErrorOfMeasurement: sectionSEM,
      status: alphaResult.status,
      isValid: alphaResult.isAlphaValid,
      qualityFlags: structuredFlags,
    };
  }

  /**
   * Authoritative Test-Level Reliability Engine.
   * Computes complete test-level Cronbach's Alpha, section-level Alphas, Test SEM,
   * missingness diagnostics, quality flags, and evidence watermark.
   * Quarantines McDonald's Omega strictly as EXPERIMENTAL_RESEARCH.
   */
  public static calculateTestReliability(params: {
    mockTestId: string;
    population: PsychometricPopulationType;
    questions: Array<{
      questionVersionId: string;
      sectionId: string;
      sectionName: string;
    }>;
    attempts: Array<{
      attemptId: string;
      userId: string;
      authoritativeScore: number;
      status: string;
      itemResponses: Record<string, { isCorrect: boolean; isAnswered: boolean; itemScore?: number }>;
    }>;
    policyVersion?: PsychometricPolicyVersion;
    evaluationVersion?: string;
  }): TestReliabilityStats {
    const {
      mockTestId,
      population,
      questions,
      attempts,
      policyVersion = 'PSYCHOMETRIC_POLICY_V1',
      evaluationVersion = 'EVAL_V1',
    } = params;

    // 1. Population Isolation: Quarantines Adaptive CAT from Classical Linear Reliability
    if (population === 'POP_ADAPTIVE_CAT') {
      throw new Error('POP_ADAPTIVE_CAT is strictly quarantined from classical test reliability calculations.');
    }

    const totalItemCount = questions.length;
    const questionVersionIds = questions.map((q) => q.questionVersionId);

    // 2. Eligible Attempts Filter: Complete, evaluated attempts only
    const eligibleAttempts = attempts.filter(
      (a) => a.status === 'COMPLETED' || a.status === 'EVALUATED' || a.status === 'PUBLISHED'
    );
    const sampleSize = eligibleAttempts.length;

    // 3. Complete Case Response Matrix Construction & Missingness Tracking
    const completeCaseMatrix: number[][] = [];
    const authoritativeScoresForCompleteCases: number[] = [];
    let missingResponseCount = 0;
    const totalPotentialCells = sampleSize * totalItemCount;

    for (const attempt of eligibleAttempts) {
      let isComplete = true;
      const row: number[] = [];

      for (const qid of questionVersionIds) {
        const resp = attempt.itemResponses[qid];
        if (!resp) {
          missingResponseCount++;
          isComplete = false;
        } else {
          row.push(resp.isAnswered && resp.isCorrect ? 1 : 0);
        }
      }

      if (isComplete && row.length === totalItemCount) {
        completeCaseMatrix.push(row);
        authoritativeScoresForCompleteCases.push(attempt.authoritativeScore);
      }
    }

    const completeCaseCount = completeCaseMatrix.length;
    const excludedCaseCount = sampleSize - completeCaseCount;
    const missingResponseRate = totalPotentialCells > 0 ? missingResponseCount / totalPotentialCells : 0.0;

    // 4. Calculate Test-Level Cronbach's Alpha
    const alphaResult = this.calculateCronbachAlpha(completeCaseMatrix, {
      minItems: 3,
      minSample: 30,
    });

    // 5. Authoritative Score Variance & Standard Deviation (sigma_test)
    let authoritativeScoreVariance = 0.0;
    let authoritativeScoreStdDev = 0.0;
    if (completeCaseCount > 1) {
      const meanAuthScore =
        authoritativeScoresForCompleteCases.reduce((a, b) => a + b, 0) / completeCaseCount;
      const sumSqDev = authoritativeScoresForCompleteCases.reduce(
        (acc, val) => acc + Math.pow(val - meanAuthScore, 2),
        0
      );
      authoritativeScoreVariance = sumSqDev / (completeCaseCount - 1);
      authoritativeScoreStdDev = Math.sqrt(authoritativeScoreVariance);
    }

    // 6. Test Standard Error of Measurement: TEST_SEM = sigma_test * sqrt(max(0, 1 - alpha))
    const testSEM = this.calculateTestSEM(authoritativeScoreStdDev, alphaResult.cronbachAlpha);

    // 7. Section Reliability Breakdown
    const sectionMap = new Map<string, { sectionName: string; itemIds: string[] }>();
    for (const q of questions) {
      if (!sectionMap.has(q.sectionId)) {
        sectionMap.set(q.sectionId, { sectionName: q.sectionName, itemIds: [] });
      }
      sectionMap.get(q.sectionId)!.itemIds.push(q.questionVersionId);
    }

    const sectionReliabilities: Record<string, SectionReliabilityStats> = {};
    let hasSectionInsufficientData = false;

    for (const [secId, secData] of sectionMap.entries()) {
      const candidateSectionData = eligibleAttempts.map((att) => {
        let secScore = 0;
        for (const itemId of secData.itemIds) {
          const resp = att.itemResponses[itemId];
          if (resp && resp.itemScore) {
            secScore += resp.itemScore;
          }
        }
        return {
          attemptId: att.attemptId,
          userId: att.userId,
          sectionScore: secScore,
          itemResponses: att.itemResponses,
        };
      });

      const secReliability = this.calculateSectionReliability({
        sectionId: secId,
        sectionName: secData.sectionName,
        itemIds: secData.itemIds,
        candidateResponses: candidateSectionData,
        policyVersion,
      });

      sectionReliabilities[secId] = secReliability;
      if (secReliability.status === 'INSUFFICIENT_DATA' || secReliability.status === 'NOT_APPLICABLE') {
        hasSectionInsufficientData = true;
      }
    }

    // 8. Quality Flags Assembly
    const rawQualityFlags: ReliabilityQualityFlagKey[] = [...alphaResult.qualityFlags];

    if (missingResponseRate > 0.15) {
      rawQualityFlags.push('HIGH_MISSINGNESS');
    }
    if (sampleSize > 0 && completeCaseCount / sampleSize < 0.70) {
      rawQualityFlags.push('LOW_RESPONSE_COVERAGE');
    }
    if (hasSectionInsufficientData) {
      rawQualityFlags.push('SECTION_INSUFFICIENT_DATA');
    }

    const qualityFlags = this.mapQualityFlags(rawQualityFlags, {
      sampleSize: completeCaseCount,
      itemCount: totalItemCount,
      alpha: alphaResult.cronbachAlpha,
      variance: alphaResult.totalScoreVariance,
      missingRate: missingResponseRate,
    });

    // 9. Evidence Watermark Generation
    const evidenceWatermark = this.generateReliabilityEvidenceWatermark({
      mockTestId,
      population,
      policyVersion,
      evaluationVersion,
      attempts: eligibleAttempts,
      questionVersionIds,
    });

    return {
      mockTestId,
      population,
      sampleSize,
      completeCaseCount,
      excludedCaseCount,
      missingResponseCount,
      missingResponseRate: Number(missingResponseRate.toFixed(4)),
      totalItemCount,
      totalScoreVariance: alphaResult.totalScoreVariance,
      sumItemVariances: alphaResult.sumItemVariances,
      authoritativeScoreVariance: Number(authoritativeScoreVariance.toFixed(4)),
      authoritativeScoreStdDev: Number(authoritativeScoreStdDev.toFixed(4)),
      cronbachAlpha: alphaResult.cronbachAlpha,
      standardErrorOfMeasurement: testSEM,
      testSEM,
      isAlphaValid: alphaResult.isAlphaValid,
      status: alphaResult.status,
      qualityFlags,
      sectionReliabilities,
      mcdonaldOmegaResearch: null, // Quarantined: EXPERIMENTAL / RESEARCH ONLY
      omegaStatus: 'EXPERIMENTAL_RESEARCH',
      policyVersion,
      evaluationVersion,
      evidenceWatermark,
      calculatedAt: new Date().toISOString(),
    };
  }

  /**
   * Generates deterministic evidence watermark for reliability evidence sets.
   * Ensures bit-for-bit repeatability irrespective of database retrieval order.
   */
  public static generateReliabilityEvidenceWatermark(params: {
    mockTestId: string;
    population: PsychometricPopulationType;
    policyVersion: PsychometricPolicyVersion;
    evaluationVersion: string;
    attempts: Array<{
      attemptId: string;
      userId: string;
      itemResponses: Record<string, { isCorrect: boolean; isAnswered: boolean; itemScore?: number }>;
    }>;
    questionVersionIds: string[];
  }): string {
    const { mockTestId, population, policyVersion, evaluationVersion, attempts, questionVersionIds } = params;

    // Canonical sorted question IDs
    const sortedQids = [...questionVersionIds].sort();

    // Canonical sorted attempts
    const sortedAttempts = [...attempts]
      .sort((a, b) => a.attemptId.localeCompare(b.attemptId))
      .map((att) => {
        const itemArray = sortedQids.map((qid) => {
          const resp = att.itemResponses[qid];
          return resp
            ? `${qid}:${resp.isAnswered ? '1' : '0'}:${resp.isCorrect ? '1' : '0'}`
            : `${qid}:null`;
        });
        return `${att.attemptId}|${att.userId}|${itemArray.join(',')}`;
      });

    const canonicalPayload = [
      'WATERMARK_V1_RELIABILITY',
      population,
      mockTestId,
      policyVersion,
      evaluationVersion,
      sortedAttempts.join('||'),
    ].join('###');

    const hash = crypto.createHash('sha256').update(canonicalPayload).digest('hex');
    return `rel_wm_${hash.substring(0, 16)}`;
  }

  /**
   * Maps internal quality flag keys to structured diagnostic flags with severities and interpretations.
   */
  private static mapQualityFlags(
    keys: ReliabilityQualityFlagKey[],
    context: {
      sampleSize: number;
      itemCount: number;
      alpha: number | null;
      variance: number;
      missingRate?: number;
    }
  ): ReliabilityQualityFlag[] {
    const uniqueKeys = Array.from(new Set(keys));
    return uniqueKeys.map((key) => {
      switch (key) {
        case 'INSUFFICIENT_SAMPLE':
          return {
            flagKey: 'INSUFFICIENT_SAMPLE',
            severity: 'HIGH',
            metric: 'sample_size',
            observedValue: context.sampleSize,
            thresholdValue: 30,
            interpretation: `Candidate sample size (N=${context.sampleSize}) is below minimum psychometric requirement (N=30).`,
            humanReviewRequirement: 'RECOMMENDED',
          };
        case 'LOW_ITEM_COUNT':
          return {
            flagKey: 'LOW_ITEM_COUNT',
            severity: 'HIGH',
            metric: 'item_count',
            observedValue: context.itemCount,
            thresholdValue: 3,
            interpretation: `Test/section item count (K=${context.itemCount}) is below minimum requirement (K=3) for internal consistency.`,
            humanReviewRequirement: 'RECOMMENDED',
          };
        case 'ZERO_SCORE_VARIANCE':
          return {
            flagKey: 'ZERO_SCORE_VARIANCE',
            severity: 'CRITICAL',
            metric: 'total_score_variance',
            observedValue: context.variance,
            thresholdValue: 0.0,
            interpretation: 'Zero total score variance across candidates. Internal consistency cannot be mathematically evaluated.',
            humanReviewRequirement: 'MANDATORY',
          };
        case 'NEGATIVE_ALPHA':
          return {
            flagKey: 'NEGATIVE_ALPHA',
            severity: 'HIGH',
            metric: 'cronbach_alpha',
            observedValue: context.alpha,
            thresholdValue: 0.0,
            interpretation: `Calculated Cronbach's Alpha (alpha=${context.alpha}) is negative, indicating item heterogeneity, key mismatch, or inverse item relationships.`,
            humanReviewRequirement: 'MANDATORY',
          };
        case 'EXTREME_ALPHA':
          return {
            flagKey: 'EXTREME_ALPHA',
            severity: 'MEDIUM',
            metric: 'cronbach_alpha',
            observedValue: context.alpha,
            thresholdValue: 0.95,
            interpretation: `Extremely high internal consistency (alpha=${context.alpha} > 0.95) may indicate item redundancy or excessive test length.`,
            humanReviewRequirement: 'RECOMMENDED',
          };
        case 'HIGH_MISSINGNESS':
          return {
            flagKey: 'HIGH_MISSINGNESS',
            severity: 'HIGH',
            metric: 'missing_response_rate',
            observedValue: context.missingRate ?? 0,
            thresholdValue: 0.15,
            interpretation: 'High rate of omitted/missing responses across candidate attempts (>15%).',
            humanReviewRequirement: 'RECOMMENDED',
          };
        case 'LOW_RESPONSE_COVERAGE':
          return {
            flagKey: 'LOW_RESPONSE_COVERAGE',
            severity: 'MEDIUM',
            metric: 'complete_case_rate',
            observedValue: context.sampleSize,
            thresholdValue: 0.70,
            interpretation: 'Less than 70% of candidate attempts had complete response data.',
            humanReviewRequirement: 'RECOMMENDED',
          };
        case 'SECTION_INSUFFICIENT_DATA':
          return {
            flagKey: 'SECTION_INSUFFICIENT_DATA',
            severity: 'LOW',
            metric: 'section_sample',
            observedValue: null,
            thresholdValue: null,
            interpretation: 'One or more sections in the test had insufficient sample size or item count for reliable section alpha.',
            humanReviewRequirement: 'RECOMMENDED',
          };
        default:
          return {
            flagKey: key,
            severity: 'MEDIUM',
            metric: 'unknown',
            observedValue: null,
            thresholdValue: null,
            interpretation: `Psychometric quality flag: ${key}`,
            humanReviewRequirement: 'RECOMMENDED',
          };
      }
    });
  }

  /**
   * Prepares an immutable snapshot payload ready for storage in public.test_psychometric_snapshots.
   */
  public static buildReliabilitySnapshotPayload(
    stats: TestReliabilityStats,
    options?: {
      meanFacilityP?: number;
      meanDiscriminationPbis?: number;
      flaggedItemsCount?: number;
      flagDensityPercent?: number;
      itemsRoster?: unknown[];
    }
  ) {
    return {
      mock_test_id: stats.mockTestId,
      population: stats.population,
      sample_size: stats.sampleSize,
      item_count: stats.totalItemCount,
      cronbach_alpha: stats.cronbachAlpha,
      standard_error_of_measurement: stats.standardErrorOfMeasurement,
      total_score_variance: stats.totalScoreVariance,
      sum_item_variances: stats.sumItemVariances,
      section_reliabilities: stats.sectionReliabilities,
      mcdonald_omega_research: stats.mcdonaldOmegaResearch,
      mean_facility_p: options?.meanFacilityP ?? null,
      mean_discrimination_pbis: options?.meanDiscriminationPbis ?? null,
      flagged_items_count: options?.flaggedItemsCount ?? 0,
      flag_density_percent: options?.flagDensityPercent ?? 0.0,
      items_roster: options?.itemsRoster ?? [],
      policy_version: stats.policyVersion,
      calculated_at: stats.calculatedAt,
      metadata: {
        evaluation_version: stats.evaluationVersion,
        evidence_watermark: stats.evidenceWatermark,
        complete_case_count: stats.completeCaseCount,
        excluded_case_count: stats.excludedCaseCount,
        missing_response_count: stats.missingResponseCount,
        missing_response_rate: stats.missingResponseRate,
        authoritative_score_variance: stats.authoritativeScoreVariance,
        authoritative_score_std_dev: stats.authoritativeScoreStdDev,
        omega_status: stats.omegaStatus,
        quality_flags: stats.qualityFlags,
        status: stats.status,
      },
    };
  }
}


