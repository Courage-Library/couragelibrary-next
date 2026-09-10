/**
 * COURAGE LIBRARY — PHASE 5E.6.1
 * EXAM & QUESTION QUALITY PSYCHOMETRICS DATA CONTRACTS
 * 
 * Authoritative Type Definitions & Mathematical Contracts for:
 * 1. Population Scopes & Evidence Isolation
 * 2. Exam Marking Schemes & Criterion Scores
 * 3. Item Calibration States & 1PL / Rasch Methodology
 * 4. Classical Item Statistics & Facility Values
 * 5. Corrected Point-Biserial Discrimination ($r_{pbis}$)
 * 6. Distractor Analytics & Option Attractor Dynamics
 * 7. 1PL Fisher Information & Item Characteristic Curves (ICC)
 * 8. Test & Section Reliability (Cronbach's $\alpha$, McDonald's $\omega$, SEM)
 * 9. Deterministic Quality Flags (11 Mandatory Metadata Fields)
 * 10. Statistical Drift & Longitudinal Stability
 * 11. Psychometric Policy Versions & Calibration Watermarks
 * 12. Admin Intelligence & Human Review Queue Models
 */

// ============================================================================
// 1. POPULATION SCOPES & ISOLATION
// ============================================================================

export type PsychometricPopulationType =
  | 'POP_FIXED_MOCK'
  | 'POP_LIVE_COMPETITION'
  | 'POP_OFFICIAL_PYQ'
  | 'POP_ADAPTIVE_CAT'
  | 'POP_AGGREGATE_ALL';

export interface PopulationScopeDefinition {
  populationType: PsychometricPopulationType;
  description: string;
  isAdaptiveIsolated: boolean;
  minSampleSizeRequired: number;
  allowsClassicalDiscrimination: boolean;
}

export const POPULATION_DEFINITIONS: Record<PsychometricPopulationType, PopulationScopeDefinition> = {
  POP_FIXED_MOCK: {
    populationType: 'POP_FIXED_MOCK',
    description: 'Standardized full-length and sectional fixed mock examination attempts.',
    isAdaptiveIsolated: true,
    minSampleSizeRequired: 50,
    allowsClassicalDiscrimination: true,
  },
  POP_LIVE_COMPETITION: {
    populationType: 'POP_LIVE_COMPETITION',
    description: 'Scheduled All-India live competition events with verified synchronized cohorts.',
    isAdaptiveIsolated: true,
    minSampleSizeRequired: 100,
    allowsClassicalDiscrimination: true,
  },
  POP_OFFICIAL_PYQ: {
    populationType: 'POP_OFFICIAL_PYQ',
    description: 'Official Previous Year Question paper administrations used as standard anchors.',
    isAdaptiveIsolated: true,
    minSampleSizeRequired: 50,
    allowsClassicalDiscrimination: true,
  },
  POP_ADAPTIVE_CAT: {
    populationType: 'POP_ADAPTIVE_CAT',
    description: 'Computerized Adaptive Testing sessions (strictly isolated from classical unweighted stats).',
    isAdaptiveIsolated: true,
    minSampleSizeRequired: 100,
    allowsClassicalDiscrimination: false,
  },
  POP_AGGREGATE_ALL: {
    populationType: 'POP_AGGREGATE_ALL',
    description: 'Master pool of all non-adaptive valid attempts across standardized tests.',
    isAdaptiveIsolated: true,
    minSampleSizeRequired: 100,
    allowsClassicalDiscrimination: true,
  },
};

// ============================================================================
// 2. SCORING SEMANTICS & MARKING SCHEMES
// ============================================================================

export interface ExamMarkingScheme {
  positiveMarks: number;
  negativePenalty: number;
  unansweredPenalty: number;
}

export interface ItemResponseEvidenceRecord {
  attemptId: string;
  userId: string;
  questionVersionId: string;
  questionId: string;
  selectedOptionKey: string | null;
  isCorrect: boolean;
  isAnswered: boolean;
  responseTimeMs: number;
  itemScore: number;
  submittedAt: string;
}

export interface CandidateCriterionScore {
  attemptId: string;
  userId: string;
  rawNetScore: number;
  restOfTestScore: number;
  targetItemScore: number;
  isTargetCorrect: boolean;
}

// ============================================================================
// 3. ITEM CALIBRATION STATES & MODEL VERSIONS
// ============================================================================

export type ItemCalibrationState =
  | 'UNCALIBRATED'
  | 'INSUFFICIENT_DATA'
  | 'PROVISIONAL'
  | 'CALIBRATED'
  | 'UNSTABLE'
  | 'DEPRECATED';

export type PsychometricModelVersion =
  | '1PL_RASCH_V1'
  | '2PL_EXPERIMENTAL_V1'
  | '3PL_FUTURE_V1';

export type PsychometricPolicyVersion = 'PSYCHOMETRIC_POLICY_V1';

// ============================================================================
// 4. UNCERTAINTY & CONFIDENCE BOUNDS
// ============================================================================

export interface MeasurementUncertainty {
  standardError: number;
  confidenceInterval95: [number, number];
  degreesOfFreedom?: number;
}

// ============================================================================
// 5. CLASSICAL ITEM STATISTICS
// ============================================================================

export interface ItemClassicalStats {
  questionVersionId: string;
  population: PsychometricPopulationType;
  totalAttempts: number;
  correctAttempts: number;
  incorrectAttempts: number;
  unansweredAttempts: number;
  facilityIndex: number;          // p-value in [0.0, 1.0]
  empiricalDifficulty: number;    // d = 1.0 - p in [0.0, 1.0]
  omissionRate: number;           // unanswered / totalAttempts
  avgResponseTimeMs: number;
  facilityUncertainty: MeasurementUncertainty;
}

// ============================================================================
// 6. CORRECTED POINT-BISERIAL DISCRIMINATION ($r_{pbis}$)
// ============================================================================

export type DiscriminationRating =
  | 'EXCELLENT'
  | 'GOOD'
  | 'MARGINAL'
  | 'POOR'
  | 'DEFECTIVE'
  | 'INVALID';

export interface ItemDiscriminationStats {
  questionVersionId: string;
  population: PsychometricPopulationType;
  correctedPointBiserial: number | null; // in [-1.0, +1.0] or null if invalid
  discriminationRating: DiscriminationRating;
  meanScoreCorrect: number | null;       // Y_bar_{(i), 1}
  meanScoreIncorrect: number | null;     // Y_bar_{(i), 0}
  restOfTestStdDev: number | null;       // S_{Y_{(i)}}
  varianceRestOfTest: number | null;     // Var(Y_{(i)})
  isValid: boolean;
  sampleSize: number;
  uncertainty: MeasurementUncertainty | null;
  evidenceWatermark?: string;
  modelVersion?: PsychometricModelVersion;
  policyVersion?: PsychometricPolicyVersion;
}

// ============================================================================
// 7. DISTRACTOR ANALYTICS & OPTION ATTRACTOR DYNAMICS
// ============================================================================

export interface DistractorOptionMetric {
  optionKey: string;
  isCorrectKey: boolean;
  selectionCount: number;
  selectionProportion: number;          // f(k) in [0.0, 1.0]
  distractorBiserial: number | null;    // r_dist(k) in [-1.0, +1.0] or null
  isNonFunctioning: boolean;            // f(k) < 0.03
  isPositiveDistractor: boolean;        // r_dist(k) > 0.05
}

export interface ItemDistractorAnalytics {
  questionVersionId: string;
  population: PsychometricPopulationType;
  totalResponses: number;
  options: DistractorOptionMetric[];
  hasNonFunctioningDistractor: boolean;
  hasPositiveDistractorDiscrimination: boolean;
  evidenceWatermark?: string;
  modelVersion?: PsychometricModelVersion;
  policyVersion?: PsychometricPolicyVersion;
}

// ============================================================================
// 8. 1PL / RASCH ITEM CALIBRATION
// ============================================================================

export interface ItemCalibrationResult {
  questionVersionId: string;
  population: PsychometricPopulationType;
  state: ItemCalibrationState;
  bDifficulty: number;                  // bounded in [-3.0, +3.0]
  uncertainty: MeasurementUncertainty;
  sampleSize: number;
  iterationCount: number;
  converged: boolean;
  maxDeltaB: number;
  meanPopulationAbility: number;
  evidenceWatermark: string;
  calibratedAt: string;
  modelVersion: PsychometricModelVersion;
  policyVersion: PsychometricPolicyVersion;
}

export interface CalibrationBatchSummary {
  population: PsychometricPopulationType;
  totalItemsProcessed: number;
  calibratedItemsCount: number;
  provisionalItemsCount: number;
  unstableItemsCount: number;
  insufficientDataCount: number;
  overallConvergenceAchieved: boolean;
  maxIterationsReached: boolean;
  iterationsExecuted: number;
  meanItemDifficulty: number;           // Centered around 0.0
  evidenceWatermark: string;
  timestamp: string;
}

// ============================================================================
// 9. ITEM INFORMATION & ITEM CHARACTERISTIC CURVES (ICC)
// ============================================================================

export interface ICCGridSpecification {
  minTheta: number;                     // Default: -3.0
  maxTheta: number;                     // Default: +3.0
  step: number;                         // Default: 0.1
}

export interface ItemInformationPoint {
  theta: number;                        // Latent trait in [-3.0, +3.0]
  probability: number;                  // P(theta, b) in [0.0, 1.0]
  information: number;                  // I(theta) = P(1-P) in [0.0, 0.25]
  normalizedInformation: number;        // I_norm(theta) = I(theta) / 0.25 in [0.0, 1.0]
  /**
   * CONDITIONAL_ITEM_INFORMATION_SE = 1 / sqrt(I(theta))
   * Note: This is the local theoretical conditional standard error for this item at ability theta under the Rasch model.
   * This is strictly distinct from Phase 5E.6.6 Test-level Standard Error of Measurement (TEST_SEM = sigma_test * sqrt(1 - alpha)).
   */
  standardError: number;                // CONDITIONAL_ITEM_INFORMATION_SE: 1 / sqrt(I(theta))
  itemDifficulty?: number;              // Calibrated b
  modelVersion?: PsychometricModelVersion;
}

export interface EmpiricalQuintilePoint {
  quintileIndex: number;                // 1 to 5
  meanRestOfTestScore: number;
  estimatedTheta: number;
  observedProportion: number;
  candidateCount: number;
}

export interface ItemCharacteristicCurveData {
  questionVersionId: string;
  population: PsychometricPopulationType;
  state: ItemCalibrationState;
  bDifficulty: number;
  theoreticalCurve: ItemInformationPoint[];
  empiricalPoints?: EmpiricalQuintilePoint[];
  peakInformationTheta: number;         // theta = b
  maxInformationValue: number;          // 0.25
  maxNormalizedInformation: number;     // 1.0
  gridSpecification: ICCGridSpecification;
  isProvisional: boolean;
  evidenceWatermark: string;
  modelVersion: PsychometricModelVersion;
  policyVersion: PsychometricPolicyVersion;
}

export interface ItemInformationComparisonResult {
  theta: number;
  itemA: {
    questionVersionId: string;
    bDifficulty: number;
    probability: number;
    information: number;
    normalizedInformation: number;
  };
  itemB: {
    questionVersionId: string;
    bDifficulty: number;
    probability: number;
    information: number;
    normalizedInformation: number;
  };
  preferredItem: 'ITEM_A' | 'ITEM_B' | 'EQUAL';
  informationDifference: number;        // |I_A(theta) - I_B(theta)|
  modelVersion: PsychometricModelVersion;
}

// ============================================================================
// 10. TEST & SECTION RELIABILITY (CRONBACH'S ALPHA, TEST SEM & OMEGA QUARANTINE)
// ============================================================================

export type TestReliabilityStatus =
  | 'CALCULATED'
  | 'INSUFFICIENT_DATA'
  | 'NOT_APPLICABLE'
  | 'ZERO_VARIANCE'
  | 'INVALID_POPULATION';

export type ReliabilityQualityFlagKey =
  | 'INSUFFICIENT_SAMPLE'
  | 'LOW_ITEM_COUNT'
  | 'ZERO_SCORE_VARIANCE'
  | 'NEGATIVE_ALPHA'
  | 'EXTREME_ALPHA'
  | 'HIGH_MISSINGNESS'
  | 'LOW_RESPONSE_COVERAGE'
  | 'SECTION_INSUFFICIENT_DATA'
  | 'SCORING_SEMANTICS_MISMATCH'
  | 'POPULATION_MIXING'
  | 'ERRATA_INSTABILITY';

export interface ReliabilityQualityFlag {
  flagKey: ReliabilityQualityFlagKey;
  severity: QualityFlagSeverity;
  metric: string;
  observedValue: number | string | null;
  thresholdValue: number | string | null;
  interpretation: string;
  humanReviewRequirement: HumanReviewRequirement;
}

export interface SectionReliabilityStats {
  sectionId: string;
  sectionName: string;
  itemCount: number;                       // K_s (items in section)
  sampleSize: number;                      // Eligible complete candidate attempts N_s
  completeCaseCount: number;               // Number of complete cases used
  excludedCaseCount: number;               // Excluded attempts due to missingness
  totalVariance: number;                   // Var(Total binary score in section)
  sumItemVariances: number;                // Sum of item variances in section
  cronbachAlpha: number | null;            // Section Cronbach's Alpha
  /**
   * Section Standard Error of Measurement: sigma_section * sqrt(1 - alpha_section)
   * Strictly distinct from CONDITIONAL_ITEM_INFORMATION_SE.
   */
  standardErrorOfMeasurement: number | null;
  status: TestReliabilityStatus;
  isValid: boolean;
  qualityFlags: ReliabilityQualityFlag[];
  evidenceWatermark?: string;
}

export interface TestReliabilityStats {
  mockTestId: string;
  population: PsychometricPopulationType;
  sampleSize: number;                      // Eligible candidate attempts N
  completeCaseCount: number;               // Number of complete cases used for matrix
  excludedCaseCount: number;               // Number of excluded attempts
  missingResponseCount: number;            // Total missing/omitted cells in matrix
  missingResponseRate: number;             // Proportion of missing cells [0.0, 1.0]
  totalItemCount: number;                  // Total item count K
  totalScoreVariance: number;              // Variance of total binary test score (sigma^2_T)
  sumItemVariances: number;                // Sum of individual binary item variances (sum sigma^2_i)
  authoritativeScoreVariance: number;      // Variance of authoritative evaluated total marks
  authoritativeScoreStdDev: number;        // StdDev of authoritative evaluated total marks (sigma_test)
  cronbachAlpha: number | null;            // Production authoritative reliability metric
  /**
   * Test Standard Error of Measurement: TEST_SEM = sigma_test * sqrt(max(0, 1 - alpha))
   * IMPORTANT: This is the aggregate test-level score measurement error.
   * This is STRICTLY DISTINCT from CONDITIONAL_ITEM_INFORMATION_SE (1 / sqrt(I(theta))) from Phase 5E.6.5.
   */
  standardErrorOfMeasurement: number | null; // TEST_SEM
  testSEM: number | null;                  // Alias explicitly named testSEM
  isAlphaValid: boolean;
  status: TestReliabilityStatus;
  qualityFlags: ReliabilityQualityFlag[];
  sectionReliabilities: Record<string, SectionReliabilityStats>;
  /**
   * McDonald's Omega is QUARANTINED for research/experimental use only.
   * Never exposed to candidates or treated as authoritative in V1 production.
   */
  mcdonaldOmegaResearch: number | null;
  omegaStatus: 'EXPERIMENTAL_RESEARCH';
  policyVersion: PsychometricPolicyVersion;
  evaluationVersion: string;
  evidenceWatermark: string;
  calculatedAt: string;
}

// ============================================================================
// 11. DETERMINISTIC QUESTION QUALITY FLAGS
// ============================================================================

export type QualityFlagKey =
  | 'EXTREMELY_HARD'
  | 'EXTREMELY_EASY'
  | 'LOW_DISCRIMINATION'
  | 'NEGATIVE_DISCRIMINATION'
  | 'NON_FUNCTIONING_DISTRACTOR'
  | 'POSITIVE_DISTRACTOR_DISCRIMINATION'
  | 'POSSIBLE_AMBIGUITY'
  | 'UNSTABLE_CALIBRATION'
  | 'INSUFFICIENT_SAMPLE';

export type QualityFlagSeverity = 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type HumanReviewRequirement = 'RECOMMENDED' | 'MANDATORY';

export interface PsychometricQualityFlag {
  flagKey: QualityFlagKey;
  metric: 'p_value' | 'r_pbis' | 'b_difficulty' | 'distractor_biserial' | 'calibration_stability' | 'sample_size';
  value: number;
  threshold: number;
  evidenceCount: number;
  uncertainty: MeasurementUncertainty;
  population: PsychometricPopulationType;
  modelVersion: PsychometricModelVersion;
  policyVersion: PsychometricPolicyVersion;
  severity: QualityFlagSeverity;
  interpretation: string;
  humanReviewRequirement: HumanReviewRequirement;
}

// ============================================================================
// 12. STATISTICAL DRIFT & LONGITUDINAL STABILITY
// ============================================================================

export type DriftType = 'DIFFICULTY_DRIFT' | 'DISCRIMINATION_DRIFT' | 'DISTRACTOR_DRIFT';

export interface WindowMetricRecord {
  windowStart: string;
  windowEnd: string;
  sampleSize: number;
  value: number;
  standardError: number;
}

export interface ItemDriftReport {
  questionVersionId: string;
  driftType: DriftType;
  baselineWindow: WindowMetricRecord;
  comparisonWindow: WindowMetricRecord;
  deltaValue: number;
  pooledStandardError: number;
  isDriftSignificant: boolean;
  severity: QualityFlagSeverity;
  evaluatedAt: string;
}

// ============================================================================
// 13. PSYCHOMETRIC POLICY CONFIGURATION
// ============================================================================

export interface PsychometricPolicyConfig {
  policyVersion: PsychometricPolicyVersion;
  thresholds: {
    minSampleProvisional: number;           // 20
    minSampleCalibrated: number;            // 100
    minSampleDiscrimination: number;        // 50
    minSampleDistractor: number;            // 50
    minSampleReliability: number;           // 30
    minSampleDriftComparison: number;       // 100
    lowFacilityThreshold: number;           // p < 0.15 (Extremely Hard)
    highFacilityThreshold: number;          // p > 0.90 (Extremely Easy)
    marginalDiscriminationThreshold: number;// r_pbis < 0.20
    negativeDiscriminationThreshold: number;// r_pbis < 0.00
    nonFunctioningDistractorRate: number;   // f(k) < 0.03
    positiveDistractorDiscrimination: number;// r_dist > 0.05
    unstableDifficultyDelta: number;        // |Delta_b| > 0.50
    maxCalibrationIterations: number;       // 50
    convergenceTolerance: number;           // 0.005
    regularizationLambda: number;           // 0.05
  };
}

export const DEFAULT_PSYCHOMETRIC_POLICY_V1: PsychometricPolicyConfig = {
  policyVersion: 'PSYCHOMETRIC_POLICY_V1',
  thresholds: {
    minSampleProvisional: 20,
    minSampleCalibrated: 100,
    minSampleDiscrimination: 50,
    minSampleDistractor: 50,
    minSampleReliability: 30,
    minSampleDriftComparison: 100,
    lowFacilityThreshold: 0.15,
    highFacilityThreshold: 0.90,
    marginalDiscriminationThreshold: 0.20,
    negativeDiscriminationThreshold: 0.00,
    nonFunctioningDistractorRate: 0.03,
    positiveDistractorDiscrimination: 0.05,
    unstableDifficultyDelta: 0.50,
    maxCalibrationIterations: 50,
    convergenceTolerance: 0.005,
    regularizationLambda: 0.05,
  },
};

// ============================================================================
// 14. ADMIN INTELLIGENCE & REVIEW QUEUE MODELS
// ============================================================================

export type PsychometricAdminActionType =
  | 'PSYCHOMETRIC_RECALIBRATION_EXECUTE'
  | 'PSYCHOMETRIC_FLAG_DISMISS'
  | 'PSYCHOMETRIC_ITEM_DEPRECATE'
  | 'PSYCHOMETRIC_EXPORT';

export interface PsychometricReviewQueueItem {
  questionVersionId: string;
  questionId: string;
  questionTextSnippet: string;
  subjectName?: string;
  topicName?: string;
  nominalDifficulty?: string;
  state: ItemCalibrationState;
  facilityIndex: number;
  correctedPointBiserial: number | null;
  activeFlags: PsychometricQualityFlag[];
  highestSeverity: QualityFlagSeverity;
  totalResponses: number;
  lastEvaluatedAt: string;
}

export interface QuestionPsychometricDetailData {
  questionVersionId: string;
  questionId: string;
  questionText: string;
  options: Array<{
    key: string;
    text: string;
    isCorrect: boolean;
  }>;
  explanationText?: string;
  subjectName?: string;
  topicName?: string;
  nominalDifficulty?: string;
  classicalStats: ItemClassicalStats;
  discriminationStats: ItemDiscriminationStats;
  distractorAnalytics: ItemDistractorAnalytics;
  calibrationResult: ItemCalibrationResult;
  iccData: ItemCharacteristicCurveData;
  activeFlags: PsychometricQualityFlag[];
  driftReport: ItemDriftReport | null;
  historicalCalibrations: Array<{
    calibratedAt: string;
    bDifficulty: number;
    sampleSize: number;
    state: ItemCalibrationState;
  }>;
}

export interface PaperPsychometricHealthData {
  mockTestId: string;
  title: string;
  totalQuestions: number;
  totalCandidates: number;
  reliabilityStats: TestReliabilityStats;
  meanDifficultyP: number;
  meanDiscriminationRpbis: number;
  flaggedQuestionsCount: number;
  flagDensityPercent: number;
  itemsRoster: Array<{
    questionVersionId: string;
    sequenceIndex: number;
    sectionName: string;
    facilityIndex: number;
    bDifficulty: number;
    correctedPointBiserial: number | null;
    discriminationRating: DiscriminationRating;
    activeFlagsCount: number;
    highestSeverity: QualityFlagSeverity | null;
  }>;
}

export interface PsychometricOverviewDashboardData {
  totalQuestionsCalibrated: number;
  totalQuestionsProvisional: number;
  totalQuestionsUncalibrated: number;
  totalQuestionsFlagged: number;
  criticalFlagsCount: number;
  highSeverityFlagsCount: number;
  facilityDistribution: {
    extremelyHard: number;  // p < 0.15
    hard: number;           // 0.15 <= p < 0.40
    medium: number;         // 0.40 <= p < 0.70
    easy: number;           // 0.70 <= p < 0.90
    extremelyEasy: number;  // p >= 0.90
  };
  discriminationDistribution: {
    excellent: number;      // r >= 0.40
    good: number;           // 0.30 <= r < 0.40
    marginal: number;       // 0.20 <= r < 0.30
    poor: number;           // 0.00 <= r < 0.20
    defective: number;      // r < 0.00
  };
  recentReviewQueue: PsychometricReviewQueueItem[];
  lastRecalibrationAt: string | null;
  policyVersion: PsychometricPolicyVersion;
}
