/**
 * COURAGE LIBRARY — PHASE 5E.5: ADMIN COMPETITION INTELLIGENCE TYPES & POLICIES
 *
 * Strict read-only administrative competition intelligence and cohort analytics.
 * Governed by ADMIN_COMPETITION_INTELLIGENCE_POLICY_V1.
 *
 * SCOPE BOUNDARY: Strictly observational and descriptive statistics.
 * PSYCHOMETRIC MODELING (IRT, Rasch, Item Calibration) IS EXCLUDED (Phase 5E.6).
 */

export interface CompetitionAnomalyPolicy {
  policyVersion: "v1.0.0";
  thresholds: {
    highDropoutRatePercent: number; // Default: 25.0%
    highExpiryRatePercent: number; // Default: 40.0%
    unusualScoreConcentrationPercent: number; // Default: 50.0%
    evaluationBacklogMinutes: number; // Default: 30 minutes
    unsettledRewardLagHours: number; // Default: 2 hours
    minimumPrivacyCohortSize: number; // Default: 5 candidates
    earlyExitThresholdMinutes: number; // Default: 15 minutes
    earlyExitSpikePercent: number; // Default: 15.0%
  };
  comparabilityRules: {
    strictExamMatch: boolean; // true
    strictTotalMarksMatch: boolean; // true
    requirePublishedStatus: boolean; // true
    requireActiveSnapshot: boolean; // true
  };
}

export const ADMIN_COMPETITION_INTELLIGENCE_POLICY_V1: CompetitionAnomalyPolicy = {
  policyVersion: "v1.0.0",
  thresholds: {
    highDropoutRatePercent: 25.0,
    highExpiryRatePercent: 40.0,
    unusualScoreConcentrationPercent: 50.0,
    evaluationBacklogMinutes: 30,
    unsettledRewardLagHours: 2,
    minimumPrivacyCohortSize: 5,
    earlyExitThresholdMinutes: 15,
    earlyExitSpikePercent: 15.0,
  },
  comparabilityRules: {
    strictExamMatch: true,
    strictTotalMarksMatch: true,
    requirePublishedStatus: true,
    requireActiveSnapshot: true,
  },
};

export type AnomalySeverity = "INFO" | "WARNING" | "CRITICAL";

export interface AnomalySignal {
  code: string;
  label: string;
  severity: AnomalySeverity;
  description: string;
  triggered: boolean;
  value: number;
  threshold: number;
}

export interface ParticipationFunnelData {
  registeredCount: number;
  startedCount: number;
  submittedCount: number;
  evaluatedCount: number;
  rankedCount: number;
  publishedCount: number;
  turnoutRate: number; // (started / registered) * 100
  completionRate: number; // (submitted / started) * 100
  dropoutRate: number; // ((started - submitted) / started) * 100
  expiryRate: number; // (expired / started) * 100
  earlyDropoutRate: number; // (earlyExit / started) * 100
  autoSubmissionRate: number; // (autoTimerExpiry / started) * 100
}

export interface ScoreBandItem {
  range: [number, number];
  label: string;
  count: number;
  percentage: number;
}

export interface ScoreDistributionData {
  meanScore: number | null;
  medianScore: number | null;
  stdDev: number | null;
  iqr: number | null;
  minScore: number | null;
  maxScore: number | null;
  skewness: number | null;
  scoreBands: ScoreBandItem[];
  privacySuppressed: boolean;
}

export interface AccuracyDistributionData {
  meanAccuracy: number | null;
  medianAccuracy: number | null;
  accuracyBands: ScoreBandItem[];
  privacySuppressed: boolean;
}

export interface DecileItem {
  percentile: number; // 10, 20, ..., 90
  markCutoff: number;
  candidateCount: number;
}

export interface RankingPercentileData {
  deciles: DecileItem[];
  eliteThresholds: {
    top1PercentScore: number | null;
    top5PercentScore: number | null;
    top10PercentScore: number | null;
  };
  tiedRankCount: number;
  tiedRankFrequency: number; // (tiedRanks / totalRanked) * 100
  totalRanked: number;
  privacySuppressed: boolean;
}

export interface TimingIntelligenceData {
  minDurationMinutes: number;
  maxDurationMinutes: number;
  meanDurationMinutes: number;
  medianDurationMinutes: number;
  timeUtilizationRate: number; // (medianDuration / allottedTime) * 100
  submissionModes: {
    explicitSubmit: number;
    autoTimerExpiry: number;
  };
  earlyExitCount: number;
  earlyExitSpikeDetected: boolean;
}

export interface SectionIntelligenceItem {
  sectionId: string;
  sectionName: string;
  totalQuestions: number;
  avgMarks: number;
  avgAccuracy: number;
  avgTimeMinutes: number;
}

export interface SubjectIntelligenceItem {
  subjectId: string;
  subjectName: string;
  totalQuestions: number;
  avgAccuracy: number;
}

export interface TopicIntelligenceItem {
  topicId: string;
  topicName: string;
  totalQuestions: number;
  avgAccuracy: number;
}

export interface SectionSubjectTopicIntelligence {
  sections: SectionIntelligenceItem[];
  subjects: SubjectIntelligenceItem[];
  topics: TopicIntelligenceItem[];
  topicStatus: "TOPIC_DATA_AVAILABLE" | "TOPIC_DATA_INSUFFICIENT";
  mappedQuestionsRatio: number;
}

export interface RewardIntelligenceData {
  totalCoinsDisbursed: number;
  podiumCoinsDisbursed: number;
  participationCoinsDisbursed: number;
  settledCount: number;
  pendingCount: number;
  settlementRate: number;
  settlementStatus: "ALL_SETTLED" | "PENDING_SETTLEMENT" | "NOT_APPLICABLE";
}

export interface CertificateIntelligenceData {
  totalCertificatesIssued: number;
  tierCounts: {
    merit: number;
    excellence: number;
    participation: number;
  };
  verificationScanCount: number;
}

export interface TopBadgeAwardItem {
  badgeId: string;
  badgeName: string;
  awardCount: number;
}

export interface AchievementIntelligenceData {
  totalAchievementsAwarded: number;
  categoryCounts: {
    rankBased: number;
    accuracyBased: number;
    speedBased: number;
    streakBased: number;
  };
  topBadgeAwards: TopBadgeAwardItem[];
}

export interface RetentionDynamicsData {
  firstTimeParticipantsCount: number;
  repeatParticipantsCount: number;
  firstTimeRate: number;
  repeatRate: number;
  sevenDayReturnRate?: number;
  thirtyDayReturnRate?: number;
}

export interface OperationalHealthData {
  eventStatus: string;
  scheduledDurationMinutes: number;
  evaluationLatencySeconds: number;
  settlementLagHours: number;
  anomalies: AnomalySignal[];
  isHealthy: boolean;
}

export interface DataQualityDiagnostics {
  overallStatus: "AVAILABLE" | "INSUFFICIENT_DATA" | "TOPIC_DATA_INSUFFICIENT" | "DATA_INCONSISTENT";
  details: string[];
}

export interface EventCompetitionIntelligence {
  eventId: string;
  eventTitle: string;
  examId?: string;
  examTitle?: string;
  status: string;
  isPublished: boolean;
  totalMarks: number;
  durationMinutes: number;
  activeSnapshotId?: string;
  evaluatedAt?: string;
  publishedAt?: string;
  funnel: ParticipationFunnelData;
  scoreDistribution: ScoreDistributionData;
  accuracyDistribution: AccuracyDistributionData;
  rankingPercentile: RankingPercentileData;
  timing: TimingIntelligenceData;
  sectionTopic: SectionSubjectTopicIntelligence;
  rewards: RewardIntelligenceData;
  certificates: CertificateIntelligenceData;
  achievements: AchievementIntelligenceData;
  retention: RetentionDynamicsData;
  operationalHealth: OperationalHealthData;
  dataQuality: DataQualityDiagnostics;
  policyVersion: string;
}

export interface MacroCompetitionIntelligenceOverview {
  totalEvents: number;
  totalRegistrations: number;
  totalStarts: number;
  totalSubmissions: number;
  overallTurnoutRate: number;
  overallCompletionRate: number;
  totalCoinsDisbursed: number;
  totalCertificatesIssued: number;
  totalAchievementsAwarded: number;
  recentEvents: Array<{
    id: string;
    title: string;
    examTitle?: string;
    status: string;
    isPublished: boolean;
    startTime: string;
    registeredCount: number;
    startedCount: number;
    submittedCount: number;
    meanScore: number | null;
    anomalyCount: number;
  }>;
  anomaliesSummary: {
    totalAnomaliesTriggered: number;
    unsettledRewardEventsCount: number;
    highDropoutEventsCount: number;
  };
}

export interface CrossEventComparisonResult {
  compatibilityStatus: "COMPARABLE" | "COMPARISON_NOT_COMPARABLE";
  reasonIfNotComparable?: string;
  event1: EventCompetitionIntelligence;
  event2: EventCompetitionIntelligence;
  deltas?: {
    turnoutRateDelta: number; // e2 - e1
    completionRateDelta: number; // e2 - e1
    meanScoreDelta: number; // e2 - e1
    medianScoreDelta: number; // e2 - e1
    durationMinutesDelta: number; // e2 - e1
    firstTimeRateDelta: number; // e2 - e1
  };
}

export interface CandidateDrillDownItem {
  userId: string;
  fullName: string;
  email?: string;
  rank: number;
  score: number;
  percentile: number;
  accuracy: number;
  durationMinutes: number;
  submissionMode: "EXPLICIT" | "TIMEOUT" | "IN_PROGRESS" | "VOIDED";
  submittedAt?: string;
  coinsEarned: number;
  certificateTier?: string;
  badgesEarned: string[];
}
