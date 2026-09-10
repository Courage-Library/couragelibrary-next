/**
 * Courage Library — Phase 5E.4: Candidate Historical Intelligence Types & Policies
 * 
 * Strict Read-Only Analytical Engine Specifications.
 * Governed by CandidateIntelligencePolicyV1.
 */

export interface CandidateIntelligencePolicy {
  policyVersion: "v1.0.0";
  trendClassification: {
    minSampleForTrend: number; // N >= 5
    improvingSlopeThreshold: number; // beta > +0.75
    decliningSlopeThreshold: number; // beta < -0.75
    improvingEffectSize: number; // Delta_recent >= +5.0%
    decliningEffectSize: number; // Delta_recent <= -5.0%
    maxStableVolatilityCV: number; // CV <= 15.0%
    volatileThresholdCV: number; // CV > 25.0%
  };
  timeWindowWeights: {
    recentWeight: number; // 0.50 (50%)
    recentAttemptLimit: number; // 3 attempts
    mediumWeight: number; // 0.35 (35%)
    mediumAttemptLimit: number; // 4 to 10 attempts
    longTermWeight: number; // 0.15 (15%)
  };
  strengthThresholds: {
    minQuestions: number; // n >= 15
    minAttemptCount: number; // >= 3 tests
    minCumulativeAccuracy: number; // 82.0%
    minRecentAccuracy: number; // 75.0%
    minDataConfidence: number; // 0.70
  };
  weaknessThresholds: {
    minQuestions: number; // n >= 15
    minAttemptCount: number; // >= 3 tests
    maxCumulativeAccuracy: number; // < 55.0%
    minDataConfidence: number; // 0.70
  };
  dataConfidenceParameters: {
    targetSampleSize: number; // 30 questions
    sampleWeight: number; // 0.40
    mappingWeight: number; // 0.30
    recencyWeight: number; // 0.30
    activeLookbackDays: number; // 90 days
  };
  comparabilityRules: {
    strictExamFamilyMatch: boolean; // true
    strictPatternStructureMatch: boolean; // true
    strictScoringSemanticsMatch: boolean; // true
    preferPercentileOverRank: boolean; // true
  };
}

export const CANDIDATE_INTELLIGENCE_POLICY_V1: CandidateIntelligencePolicy = {
  policyVersion: "v1.0.0",
  trendClassification: {
    minSampleForTrend: 5,
    improvingSlopeThreshold: 0.75,
    decliningSlopeThreshold: -0.75,
    improvingEffectSize: 5.0,
    decliningEffectSize: -5.0,
    maxStableVolatilityCV: 15.0,
    volatileThresholdCV: 25.0,
  },
  timeWindowWeights: {
    recentWeight: 0.50,
    recentAttemptLimit: 3,
    mediumWeight: 0.35,
    mediumAttemptLimit: 10,
    longTermWeight: 0.15,
  },
  strengthThresholds: {
    minQuestions: 15,
    minAttemptCount: 3,
    minCumulativeAccuracy: 82.0,
    minRecentAccuracy: 75.0,
    minDataConfidence: 0.70,
  },
  weaknessThresholds: {
    minQuestions: 15,
    minAttemptCount: 3,
    maxCumulativeAccuracy: 55.0,
    minDataConfidence: 0.70,
  },
  dataConfidenceParameters: {
    targetSampleSize: 30,
    sampleWeight: 0.40,
    mappingWeight: 0.30,
    recencyWeight: 0.30,
    activeLookbackDays: 90,
  },
  comparabilityRules: {
    strictExamFamilyMatch: true,
    strictPatternStructureMatch: true,
    strictScoringSemanticsMatch: true,
    preferPercentileOverRank: true,
  },
};

export type TrendClassification = "IMPROVING" | "STABLE" | "DECLINING" | "VOLATILE" | "INSUFFICIENT_DATA";

export type SubjectClassification = "STRONG" | "STABLE" | "NEEDS_ATTENTION" | "INSUFFICIENT_DATA";

export type AttemptSourceType = "LIVE_TEST" | "FULL_MOCK" | "SECTIONAL" | "ADAPTIVE" | "TOPIC_TEST";

export type AttemptStatus = "EVALUATED" | "SUPERSEDED" | "VOIDED" | "DISQUALIFIED";

export interface NormalizedHistoricalAttempt {
  attemptId: string;
  sourceType: AttemptSourceType;
  eventId?: string | null;
  mockTestId?: string | null;
  examId: string;
  examFamilyId?: string | null;
  examPatternId?: string | null;
  examTitle: string;
  testTitle: string;
  startedAt: string;
  submittedAt: string;
  totalScore: number;
  maxScore: number;
  percentageScore: number;
  accuracyPercentage: number;
  timeSpentSeconds: number;
  rank?: number | null;
  percentile?: number | null;
  totalParticipants?: number | null;
  correctCount: number;
  incorrectCount: number;
  unattemptedCount: number;
  negativeMarksIncurred: number;
  status: AttemptStatus;
}

export interface DataConfidenceBreakdown {
  score: number; // 0.0 - 1.0
  sampleSize: number;
  targetSampleSize: number;
  sampleFactor: number;
  dataCompletenessFactor: number;
  mappingCompletenessFactor: number;
  recencyFactor: number;
  isHighConfidence: boolean;
}

export interface ScoreTrajectoryPoint {
  attemptId: string;
  testTitle: string;
  examId: string;
  examTitle: string;
  sourceType: AttemptSourceType;
  submittedAt: string;
  rawScore: number;
  maxScore: number;
  percentageScore: number;
  movingAverageScore: number | null; // SMA_3
  accuracyPercentage: number;
}

export interface ScoreTrajectoryData {
  policyVersion: "v1.0.0";
  examId?: string | null;
  totalAttempts: number;
  points: ScoreTrajectoryPoint[];
  latestScore: number | null;
  bestScore: number | null;
  worstScore: number | null;
  averageScore: number | null;
  recentAverageScore: number | null; // Last 3 attempts
  volatilityCV: number | null; // Coefficient of Variation %
  stabilityRating: "STABLE" | "MODERATE" | "VOLATILE" | "INSUFFICIENT_DATA";
  trend: TrendClassification;
  slopeBeta: number | null;
}

export interface RankPercentileTrajectoryPoint {
  attemptId: string;
  eventId?: string | null;
  testTitle: string;
  examId: string;
  examTitle: string;
  submittedAt: string;
  rank: number | null;
  percentile: number | null;
  totalParticipants: number | null;
  isComparable: boolean;
}

export interface RankPercentileTrajectoryData {
  policyVersion: "v1.0.0";
  examId?: string | null;
  totalRankedAttempts: number;
  points: RankPercentileTrajectoryPoint[];
  latestRank: number | null;
  bestRank: number | null;
  previousRank: number | null;
  latestPercentile: number | null;
  bestPercentile: number | null;
  recentPercentileAverage: number | null;
  percentileTrend: TrendClassification;
  comparableCohortNotice?: string;
}

export interface SubjectBreakdownItem {
  sectionKey: string;
  sectionTitle: string;
  totalQuestions: number;
  attemptedQuestions: number;
  correctQuestions: number;
  incorrectQuestions: number;
  accuracyPercentage: number;
  marksScored: number;
  maxMarks: number;
  masteryPercentage: number;
  negativeMarksIncurred: number;
  negativeDragPercentage: number;
  classification: SubjectClassification;
  dataConfidence: DataConfidenceBreakdown;
}

export interface SubjectBreakdownData {
  policyVersion: "v1.0.0";
  examId?: string | null;
  subjects: SubjectBreakdownItem[];
  dominantSubject?: string | null;
  vulnerableSubject?: string | null;
}

export interface TopicPerformanceItem {
  topicId: string;
  topicName: string;
  subjectTitle: string;
  totalQuestions: number;
  attemptedQuestions: number;
  correctQuestions: number;
  incorrectQuestions: number;
  accuracyPercentage: number;
  status: "MASTERED" | "NEEDS_PRACTICE" | "UNASSESSED";
  dataConfidence: DataConfidenceBreakdown;
}

export interface TopicPerformanceData {
  policyVersion: "v1.0.0";
  isTopicDataAvailable: boolean;
  statusNotice?: "INSUFFICIENT_TOPIC_DATA" | "TOPIC_DATA_AVAILABLE";
  topics: TopicPerformanceItem[];
}

export interface StrengthItem {
  key: string;
  title: string;
  type: "SUBJECT" | "TOPIC";
  totalQuestions: number;
  cumulativeAccuracy: number;
  recentAccuracy: number;
  dataConfidence: number;
  evidence: string;
}

export interface WeaknessItem {
  key: string;
  title: string;
  type: "SUBJECT" | "TOPIC";
  totalQuestions: number;
  cumulativeAccuracy: number;
  negativeMarksIncurred: number;
  negativeDragPercentage: number;
  rootCause: "KNOWLEDGE_GAP" | "ACCURACY_GUESSING_GAP" | "SPEED_TIME_DRAG" | "UNSPECIFIED";
  dataConfidence: number;
  evidence: string;
}

export interface StrengthsWeaknessesData {
  policyVersion: "v1.0.0";
  strengths: StrengthItem[];
  weaknesses: WeaknessItem[];
  overallAccuracy: number;
  totalQuestionsEvaluated: number;
  consistencyIndex: number | null; // 0-100
  consistencyRating: "HIGH" | "MODERATE" | "VOLATILE" | "INSUFFICIENT_DATA";
}

export interface PersonalBestSummary {
  bestScore: {
    value: number;
    maxScore: number;
    percentage: number;
    testTitle: string;
    achievedAt: string;
  } | null;
  bestRank: {
    value: number;
    totalParticipants: number;
    testTitle: string;
    achievedAt: string;
  } | null;
  bestPercentile: {
    value: number;
    testTitle: string;
    achievedAt: string;
  } | null;
}

export interface UnifiedTimelineEvent {
  id: string;
  eventType: "LIVE_TEST_COMPLETED" | "MOCK_COMPLETED" | "ADAPTIVE_COMPLETED" | "BADGE_EARNED" | "CERTIFICATE_ISSUED" | "REWARD_SETTLED";
  title: string;
  subtitle: string;
  occurredAt: string;
  score?: number | null;
  maxScore?: number | null;
  percentageScore?: number | null;
  rank?: number | null;
  percentile?: number | null;
  totalParticipants?: number | null;
  badgeCode?: string | null;
  badgeTitle?: string | null;
  badgeTier?: string | null;
  badgeIconUrl?: string | null;
  certificateNumber?: string | null;
  certificateType?: string | null;
  verificationCode?: string | null;
  coinsEarned?: number | null;
  statusBadge?: string | null;
  isVoidedOrDisqualified?: boolean;
}

export interface ExamScopeSummary {
  examId: string;
  examTitle: string;
  examFamilyId?: string | null;
  totalAttempts: number;
  averageScorePercentage: number;
  latestScorePercentage: number;
  bestRank?: number | null;
  latestPercentile?: number | null;
  trend: TrendClassification;
}

export interface CandidatePerformanceOverview {
  policyVersion: "v1.0.0";
  userId: string;
  generatedAt: string;
  totalAttemptsCount: number;
  totalLiveTestsCount: number;
  totalMocksCount: number;
  totalAdaptiveCount: number;
  overallAveragePercentage: number;
  recentAveragePercentage: number; // 3 tests
  mediumTermAveragePercentage: number; // 4-10 tests
  longTermAveragePercentage: number; // all tests
  recencyWeightedPercentage: number; // 50% / 35% / 15%
  trend: TrendClassification;
  consistencyIndex: number | null;
  consistencyRating: "HIGH" | "MODERATE" | "VOLATILE" | "INSUFFICIENT_DATA";
  personalBests: PersonalBestSummary;
  examScopes: ExamScopeSummary[];
  selectedExamScope?: ExamScopeSummary | null;
  achievementsSummary: {
    totalBadgesEarned: number;
    podiumCount: number;
    nationalMeritCount: number;
    streakCount: number;
  };
  certificatesCount: number;
  totalRewardsEarnedCL: number;
}
