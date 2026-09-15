/**
 * COURAGE LIBRARY — MISTAKE VAULT PHASE 6 TASK 4
 * LONGITUDINAL MISTAKE ANALYTICS & CROSS-EXAM INTELLIGENCE TYPES
 *
 * Strict read-only downstream diagnostic analytics contract.
 * Pure deterministic educational indicators without psychometric claims.
 */

export type LongitudinalWindowType = '7D' | '30D' | '90D' | 'ALL_TIME';

export type RawSourceContext = 
  | 'MOCK_TEST' 
  | 'CUSTOM_PRACTICE' 
  | 'QUIZ_BATTLE' 
  | 'FLASHCARD_REVIEW' 
  | 'MISTAKE_DRILL' 
  | 'DIAGNOSTIC_ASSESSMENT';

export type ProductAssessmentCategory = 
  | 'DAILY_MOCK' 
  | 'PREMIUM_MOCK' 
  | 'LIVE_ALL_INDIA' 
  | 'ADAPTIVE_CAT' 
  | 'CUSTOM_PRACTICE' 
  | 'MISTAKE_DRILL' 
  | 'QUIZ_BATTLE' 
  | 'FLASHCARD_REVIEW' 
  | 'DIAGNOSTIC_ASSESSMENT' 
  | 'MOCK_TEST';

export type TrajectoryState = 
  | 'IMPROVING' 
  | 'STABLE' 
  | 'DECLINING' 
  | 'RECOVERING' 
  | 'RELAPSING' 
  | 'INSUFFICIENT_DATA';

export type CrossExamPattern = 
  | 'CONSISTENTLY_STRONG' 
  | 'CONSISTENTLY_WEAK' 
  | 'CONTEXT_SPECIFIC' 
  | 'INSUFFICIENT_DATA';

export type OccurrenceStatus = 
  | 'ACTIVE' 
  | 'REVOKED_ERRATA' 
  | 'REVOKED_VOID' 
  | 'SUPERSEDED';

export type RelapseStatus = 
  | 'VERIFIED_RELAPSE' 
  | 'INSUFFICIENT_HISTORY' 
  | 'NO_RELAPSE';

export interface LongitudinalWindowConfig {
  windowType: LongitudinalWindowType;
  startDate: string; // ISO 8601 UTC (recent window start)
  endDate: string;   // ISO 8601 UTC (recent window end)
  priorStartDate?: string; // ISO 8601 UTC (prior comparison window start)
  priorEndDate?: string;   // ISO 8601 UTC (prior comparison window end)
  internalFetchStartDate: string; // ISO 8601 UTC (internal fetch span: 14D for 7D, 60D for 30D, 180D for 90D)
  internalFetchEndDate: string;   // ISO 8601 UTC (internal fetch span end)
  daysDuration: number; // 7, 30, 90, Infinity
  internalFetchDaysDuration: number; // 14, 60, 180, Infinity
}

export interface NormalizedMetric<T = number> {
  numerator: number;
  denominator: number | null;
  minimumSample: number;
  isSufficient: boolean;
  rate: T | null;
}

export interface TopicTrajectoryDetail {
  topicId: string;
  topicName: string;
  subjectId: string;
  subjectName: string;
  trajectory: TrajectoryState;
  recentMetric: NormalizedMetric<number>;
  priorMetric: NormalizedMetric<number>;
  deltaErrorRate: number | null;
  activeDurationDays: number;
  contextsAttemptedCount: number;
  contextsWithErrorsCount: number;
  crossExamPattern: CrossExamPattern;
  relapseCount: number;
  hasActiveRelapse: boolean;
  activeMistakeCount: number;
}

export interface SubjectTrajectoryDetail {
  subjectId: string;
  subjectName: string;
  trajectory: TrajectoryState;
  recentMetric: NormalizedMetric<number>;
  priorMetric: NormalizedMetric<number>;
  deltaErrorRate: number | null;
  activeMistakeCount: number;
  topicsCount: number;
}

export interface CrossExamContextDetail {
  sourceContext: string;
  productCategory?: string;
  metric: NormalizedMetric<number>;
  mistakeCount: number;
  uniqueQuestionsAffected: number;
  isDenominatorAvailable: boolean;
}

export interface CrossExamIntelligenceSummary {
  contextsAttempted: number;
  contextsWithErrors: number;
  contextsWithoutErrors: number;
  totalAttempted: number;
  totalIncorrect: number;
  overallNormalizedErrorRate: number | null;
  contextErrorRates: CrossExamContextDetail[];
  contexts?: CrossExamContextDetail[];
  highestErrorContext: string | null;
  lowestErrorContext: string | null;
  contextRateDelta: number | null;
  crossExamPattern: CrossExamPattern;
  patternDescription?: string;
}

export interface CognitiveDistributionSummary {
  cognitiveTypeId: string;
  cognitiveTypeName: string;
  activeMistakeCount: number;
  proportionOfActiveMistakes: number; // Normalized in [0.0, 1.0] across active failures
  recentMistakeCount: number;
  topAssociatedSubject: string | null;
  sourceContextDistribution: Record<string, number>;
}

export interface RelapseRecoveryDetail {
  vaultId: string;
  questionId: string;
  topicId: string | null;
  topicName: string | null;
  subjectId: string | null;
  subjectName: string | null;
  masteredAt: string | null;
  firstMistakeAt: string;
  lastMistakeAt: string;
  relapsedAt: string | null;
  daysToRelapse: number | null;
  daysToInitialRecovery: number | null;
  sourceWhereRelapsed: string | null;
  status: RelapseStatus;
  consecutiveCorrectInRemediation: number;
  currentLifecycleStatus: string;
}

export interface LongitudinalWeaknessItem {
  rank: number;
  topicId: string;
  topicName: string;
  subjectId: string;
  subjectName: string;
  errorRate: number | null;
  activeMistakeCount: number;
  activeDurationDays: number;
  contextsWithErrorsCount: number;
  crossExamPattern: CrossExamPattern;
  trajectory: TrajectoryState;
  hasRelapse: boolean;
  isSufficientData: boolean;
}

export interface MistakeLongitudinalOverview {
  userId: string;
  generatedAt: string;
  window: LongitudinalWindowConfig;
  totalActiveMistakes: number;
  totalResolvedMistakes: number;
  totalRevokedMistakes: number;
  overallNormalizedMetric: NormalizedMetric<number>;
  topWeaknesses: LongitudinalWeaknessItem[];
  topicTrajectories: TopicTrajectoryDetail[];
  cognitiveDistribution: CognitiveDistributionSummary[];
  crossExamIntelligence: CrossExamIntelligenceSummary;
  recoverySummary: {
    totalMasteredCount: number;
    totalRelapsedCount: number;
    activeRelapsesCount: number;
    averageDaysToRecovery: number | null;
    relapseDetails: RelapseRecoveryDetail[];
  };
  relapseRecovery?: {
    totalMasteredCount: number;
    totalRelapseCount: number;
    activeRelapsesCount: number;
    relapseRate: number;
    averageDaysToRecovery: number | null;
    relapseDetails: RelapseRecoveryDetail[];
  };
}

export interface QueryOptions {
  windowDays?: '7D' | '30D' | '90D' | 'ALL_TIME' | 'ALL' | 'all' | 7 | 30 | 90;
  referenceNow?: number; // Epoch MS timestamp for deterministic testing
  subjectId?: string;
  topicId?: string;
}
