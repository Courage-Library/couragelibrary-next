/**
 * COURAGE LIBRARY — PHASE 5E.4: CANDIDATE HISTORICAL INTELLIGENCE SERVICE
 *
 * Server-authoritative candidate historical intelligence, multi-dimensional time-series
 * trajectories, exam-scoped isolation, deterministic strengths/weaknesses diagnostics,
 * and unified activity timeline projection.
 *
 * Strict downstream read-only analytics consumer.
 * Governed by CandidateIntelligencePolicyV1.
 */

import { createAdminServerSupabaseClient } from "@/lib/supabase/server";
import {
  CANDIDATE_INTELLIGENCE_POLICY_V1,
  CandidateIntelligencePolicy,
  NormalizedHistoricalAttempt,
  CandidatePerformanceOverview,
  ScoreTrajectoryData,
  ScoreTrajectoryPoint,
  RankPercentileTrajectoryData,
  RankPercentileTrajectoryPoint,
  SubjectBreakdownData,
  SubjectBreakdownItem,
  TopicPerformanceData,
  TopicPerformanceItem,
  StrengthsWeaknessesData,
  StrengthItem,
  WeaknessItem,
  UnifiedTimelineEvent,
  ExamScopeSummary,
  PersonalBestSummary,
  TrendClassification,
  DataConfidenceBreakdown,
  SubjectClassification,
} from "@/types/candidate-intelligence";

export class CandidateIntelligenceService {
  /**
   * Retrieves high-level comprehensive candidate performance overview.
   */
  public static async getCandidatePerformanceOverview(
    userId: string,
    examId?: string,
    policy: CandidateIntelligencePolicy = CANDIDATE_INTELLIGENCE_POLICY_V1
  ): Promise<CandidatePerformanceOverview> {
    const attempts = await this.getNormalizedHistoricalAttempts(userId, examId);
    const validAttempts = attempts.filter((a) => a.status === "EVALUATED");

    const totalAttemptsCount = validAttempts.length;
    const totalLiveTestsCount = validAttempts.filter((a) => a.sourceType === "LIVE_TEST").length;
    const totalMocksCount = validAttempts.filter((a) => a.sourceType === "FULL_MOCK").length;
    const totalAdaptiveCount = validAttempts.filter((a) => a.sourceType === "ADAPTIVE").length;

    // Averages calculation across sliding windows
    let overallAveragePercentage = 0;
    let recentAveragePercentage = 0;
    let mediumTermAveragePercentage = 0;
    let longTermAveragePercentage = 0;
    let recencyWeightedPercentage = 0;

    if (totalAttemptsCount > 0) {
      const allPercentages = validAttempts.map((a) => a.percentageScore);
      overallAveragePercentage = this.roundToTwo(this.calculateMean(allPercentages));
      longTermAveragePercentage = overallAveragePercentage;

      const recentAttempts = validAttempts.slice(-policy.timeWindowWeights.recentAttemptLimit);
      recentAveragePercentage = this.roundToTwo(
        this.calculateMean(recentAttempts.map((a) => a.percentageScore))
      );

      const mediumAttempts = validAttempts.slice(-policy.timeWindowWeights.mediumAttemptLimit);
      mediumTermAveragePercentage = this.roundToTwo(
        this.calculateMean(mediumAttempts.map((a) => a.percentageScore))
      );

      recencyWeightedPercentage = this.roundToTwo(
        policy.timeWindowWeights.recentWeight * recentAveragePercentage +
          policy.timeWindowWeights.mediumWeight * mediumTermAveragePercentage +
          policy.timeWindowWeights.longTermWeight * longTermAveragePercentage
      );
    }

    // Trajectory Trend & Consistency
    const trend = this.calculateTrendClassification(
      validAttempts.map((a) => a.percentageScore),
      policy
    );

    const percentilePoints = validAttempts
      .filter((a) => a.percentile !== null && a.percentile !== undefined)
      .map((a) => Number(a.percentile));

    const consistencyResult = this.calculateConsistencyIndex(percentilePoints);

    // Personal Bests
    const personalBests = this.calculatePersonalBests(validAttempts);

    // Exam Scopes
    const examScopes = await this.calculateExamScopes(userId, policy);
    const selectedExamScope = examId
      ? examScopes.find((s) => s.examId === examId) || null
      : null;

    // Cross-system Integrations (Achievements, Certs, Rewards)
    const achievementsSummary = await this.getAchievementsSummary(userId);
    const certificatesCount = await this.getCertificatesCount(userId);
    const totalRewardsEarnedCL = await this.getTotalRewardsEarnedCL(userId);

    return {
      policyVersion: policy.policyVersion,
      userId,
      generatedAt: new Date().toISOString(),
      totalAttemptsCount,
      totalLiveTestsCount,
      totalMocksCount,
      totalAdaptiveCount,
      overallAveragePercentage,
      recentAveragePercentage,
      mediumTermAveragePercentage,
      longTermAveragePercentage,
      recencyWeightedPercentage,
      trend,
      consistencyIndex: consistencyResult.index,
      consistencyRating: consistencyResult.rating,
      personalBests,
      examScopes,
      selectedExamScope,
      achievementsSummary,
      certificatesCount,
      totalRewardsEarnedCL,
    };
  }

  /**
   * Retrieves score time-series trajectory and volatility metrics.
   */
  public static async getCandidateScoreTrajectory(
    userId: string,
    examId?: string,
    policy: CandidateIntelligencePolicy = CANDIDATE_INTELLIGENCE_POLICY_V1
  ): Promise<ScoreTrajectoryData> {
    const attempts = await this.getNormalizedHistoricalAttempts(userId, examId);
    const validAttempts = attempts.filter((a) => a.status === "EVALUATED");

    const points: ScoreTrajectoryPoint[] = [];
    const percentageSeries: number[] = [];

    for (let i = 0; i < validAttempts.length; i++) {
      const att = validAttempts[i];
      percentageSeries.push(att.percentageScore);

      // SMA_3 calculation for smoothing
      let movingAverage: number | null = null;
      if (i >= 2) {
        const window = percentageSeries.slice(i - 2, i + 1);
        movingAverage = this.roundToTwo(this.calculateMean(window));
      }

      points.push({
        attemptId: att.attemptId,
        testTitle: att.testTitle,
        examId: att.examId,
        examTitle: att.examTitle,
        sourceType: att.sourceType,
        submittedAt: att.submittedAt,
        rawScore: att.totalScore,
        maxScore: att.maxScore,
        percentageScore: att.percentageScore,
        movingAverageScore: movingAverage,
        accuracyPercentage: att.accuracyPercentage,
      });
    }

    if (points.length === 0) {
      return {
        policyVersion: policy.policyVersion,
        examId: examId || null,
        totalAttempts: 0,
        points: [],
        latestScore: null,
        bestScore: null,
        worstScore: null,
        averageScore: null,
        recentAverageScore: null,
        volatilityCV: null,
        stabilityRating: "INSUFFICIENT_DATA",
        trend: "INSUFFICIENT_DATA",
        slopeBeta: null,
      };
    }

    const latestScore = points[points.length - 1].percentageScore;
    const bestScore = Math.max(...points.map((p) => p.percentageScore));
    const worstScore = Math.min(...points.map((p) => p.percentageScore));
    const averageScore = this.roundToTwo(this.calculateMean(percentageSeries));

    const recentPoints = percentageSeries.slice(-policy.timeWindowWeights.recentAttemptLimit);
    const recentAverageScore = this.roundToTwo(this.calculateMean(recentPoints));

    const volatilityCV = this.calculateCoefficientOfVariation(percentageSeries);
    let stabilityRating: "STABLE" | "MODERATE" | "VOLATILE" | "INSUFFICIENT_DATA" = "INSUFFICIENT_DATA";

    if (volatilityCV !== null) {
      if (volatilityCV <= policy.trendClassification.maxStableVolatilityCV) {
        stabilityRating = "STABLE";
      } else if (volatilityCV <= policy.trendClassification.volatileThresholdCV) {
        stabilityRating = "MODERATE";
      } else {
        stabilityRating = "VOLATILE";
      }
    }

    const trend = this.calculateTrendClassification(percentageSeries, policy);
    const slopeBeta = this.calculateSlope(percentageSeries);

    return {
      policyVersion: policy.policyVersion,
      examId: examId || null,
      totalAttempts: points.length,
      points,
      latestScore,
      bestScore,
      worstScore,
      averageScore,
      recentAverageScore,
      volatilityCV,
      stabilityRating,
      trend,
      slopeBeta,
    };
  }

  /**
   * Retrieves rank and percentile time-series trajectory.
   * Respects rank comparability invariants and prefers percentile across heterogeneous cohorts.
   */
  public static async getCandidateRankPercentileTrajectory(
    userId: string,
    examId?: string,
    policy: CandidateIntelligencePolicy = CANDIDATE_INTELLIGENCE_POLICY_V1
  ): Promise<RankPercentileTrajectoryData> {
    const attempts = await this.getNormalizedHistoricalAttempts(userId, examId);
    const rankedAttempts = attempts.filter(
      (a) => a.status === "EVALUATED" && (a.rank !== null || a.percentile !== null)
    );

    const points: RankPercentileTrajectoryPoint[] = rankedAttempts.map((att) => ({
      attemptId: att.attemptId,
      eventId: att.eventId || null,
      testTitle: att.testTitle,
      examId: att.examId,
      examTitle: att.examTitle,
      submittedAt: att.submittedAt,
      rank: att.rank ?? null,
      percentile: att.percentile !== null && att.percentile !== undefined ? Number(att.percentile) : null,
      totalParticipants: att.totalParticipants ?? null,
      isComparable: true,
    }));

    if (points.length === 0) {
      return {
        policyVersion: policy.policyVersion,
        examId: examId || null,
        totalRankedAttempts: 0,
        points: [],
        latestRank: null,
        bestRank: null,
        previousRank: null,
        latestPercentile: null,
        bestPercentile: null,
        recentPercentileAverage: null,
        percentileTrend: "INSUFFICIENT_DATA",
        comparableCohortNotice: "Take competitive live tests to unlock national rank trajectory.",
      };
    }

    const validRanks = points.filter((p) => p.rank !== null).map((p) => p.rank as number);
    const validPercentiles = points
      .filter((p) => p.percentile !== null)
      .map((p) => p.percentile as number);

    const latestRank = validRanks.length > 0 ? validRanks[validRanks.length - 1] : null;
    const bestRank = validRanks.length > 0 ? Math.min(...validRanks) : null;
    const previousRank = validRanks.length >= 2 ? validRanks[validRanks.length - 2] : null;

    const latestPercentile =
      validPercentiles.length > 0 ? validPercentiles[validPercentiles.length - 1] : null;
    const bestPercentile =
      validPercentiles.length > 0 ? Math.max(...validPercentiles) : null;

    const recentPercentiles = validPercentiles.slice(-policy.timeWindowWeights.recentAttemptLimit);
    const recentPercentileAverage =
      recentPercentiles.length > 0
        ? this.roundToTwo(this.calculateMean(recentPercentiles))
        : null;

    const percentileTrend = this.calculateTrendClassification(validPercentiles, policy);

    return {
      policyVersion: policy.policyVersion,
      examId: examId || null,
      totalRankedAttempts: points.length,
      points,
      latestRank,
      bestRank,
      previousRank,
      latestPercentile,
      bestPercentile,
      recentPercentileAverage,
      percentileTrend,
      comparableCohortNotice:
        "Percentile is prioritized for cross-event trend evaluation across differing cohort sizes.",
    };
  }

  /**
   * Retrieves subject and sectional performance diagnostics.
   */
  public static async getCandidateSubjectBreakdown(
    userId: string,
    examId?: string,
    policy: CandidateIntelligencePolicy = CANDIDATE_INTELLIGENCE_POLICY_V1
  ): Promise<SubjectBreakdownData> {
    const adminSb: any = await createAdminServerSupabaseClient();

    // Query attempt answers for candidate
    let query = adminSb
      .from("attempt_answers")
      .select(`
        id,
        attempt_id,
        is_correct,
        marks_awarded,
        time_spent_seconds,
        mock_question:mock_questions(
          section_id,
          mock_section:mock_sections(
            id,
            name,
            total_marks
          )
        ),
        test_attempt:test_attempts!inner(
          id,
          user_id,
          status,
          submitted_at,
          mock_test:mock_tests(
            exam_id
          )
        )
      `)
      .eq("test_attempt.user_id", userId)
      .eq("test_attempt.status", "EVALUATED");

    if (examId) {
      query = query.eq("test_attempt.mock_test.exam_id", examId);
    }

    const { data, error } = await query;

    if (error || !data || data.length === 0) {
      return {
        policyVersion: policy.policyVersion,
        examId: examId || null,
        subjects: [],
        dominantSubject: null,
        vulnerableSubject: null,
      };
    }

    // Group by section
    const sectionMap = new Map<string, {
      name: string;
      total: number;
      attempted: number;
      correct: number;
      incorrect: number;
      marksScored: number;
      maxMarks: number;
      negativeMarks: number;
      recentCorrect: number;
      recentTotal: number;
    }>();

    const now = new Date().getTime();
    const lookbackMs = policy.dataConfidenceParameters.activeLookbackDays * 86400 * 1000;

    for (const row of data as any[]) {
      const section = row.mock_question?.mock_section;
      const sectionKey = section?.id || "uncategorized";
      const sectionName = section?.name || "General Section";

      if (!sectionMap.has(sectionKey)) {
        sectionMap.set(sectionKey, {
          name: sectionName,
          total: 0,
          attempted: 0,
          correct: 0,
          incorrect: 0,
          marksScored: 0,
          maxMarks: 0,
          negativeMarks: 0,
          recentCorrect: 0,
          recentTotal: 0,
        });
      }

      const sec = sectionMap.get(sectionKey)!;
      sec.total += 1;
      const isAttempted = row.is_correct !== null;
      if (isAttempted) {
        sec.attempted += 1;
        if (row.is_correct) {
          sec.correct += 1;
        } else {
          sec.incorrect += 1;
          const markVal = Number(row.marks_awarded || 0);
          if (markVal < 0) {
            sec.negativeMarks += Math.abs(markVal);
          }
        }
      }

      sec.marksScored += Number(row.marks_awarded || 0);

      // Recency check
      const submittedAtMs = new Date(row.test_attempt?.submitted_at).getTime();
      if (now - submittedAtMs <= lookbackMs) {
        sec.recentTotal += 1;
        if (row.is_correct) sec.recentCorrect += 1;
      }
    }

    const subjects: SubjectBreakdownItem[] = [];

    for (const [key, sec] of sectionMap.entries()) {
      const accuracyPercentage =
        sec.attempted > 0 ? this.roundToTwo((sec.correct / sec.attempted) * 100) : 0;
      const masteryPercentage =
        sec.total > 0 ? this.roundToTwo((sec.correct / sec.total) * 100) : 0;
      const negativeDragPercentage =
        sec.marksScored + sec.negativeMarks > 0
          ? this.roundToTwo((sec.negativeMarks / (sec.marksScored + sec.negativeMarks)) * 100)
          : 0;

      const dataConfidence = this.calculateDataConfidence(
        sec.total,
        policy.dataConfidenceParameters.targetSampleSize,
        1.0, // Full response telemetry
        key !== "uncategorized" ? 1.0 : 0.0, // Mapping completeness
        sec.total > 0 ? sec.recentTotal / sec.total : 0
      );

      let classification: SubjectClassification = "INSUFFICIENT_DATA";
      if (sec.total >= 10) {
        if (accuracyPercentage >= 80 && masteryPercentage >= 75) {
          classification = "STRONG";
        } else if (accuracyPercentage >= 60 && masteryPercentage >= 50) {
          classification = "STABLE";
        } else {
          classification = "NEEDS_ATTENTION";
        }
      }

      subjects.push({
        sectionKey: key,
        sectionTitle: sec.name,
        totalQuestions: sec.total,
        attemptedQuestions: sec.attempted,
        correctQuestions: sec.correct,
        incorrectQuestions: sec.incorrect,
        accuracyPercentage,
        marksScored: this.roundToTwo(sec.marksScored),
        maxMarks: this.roundToTwo(sec.marksScored + sec.negativeMarks),
        masteryPercentage,
        negativeMarksIncurred: this.roundToTwo(sec.negativeMarks),
        negativeDragPercentage,
        classification,
        dataConfidence,
      });
    }

    // Sort by accuracy descending
    subjects.sort((a, b) => b.accuracyPercentage - a.accuracyPercentage);

    const dominantSubject = subjects.length > 0 ? subjects[0].sectionTitle : null;
    const vulnerableSubject =
      subjects.length > 0 ? subjects[subjects.length - 1].sectionTitle : null;

    return {
      policyVersion: policy.policyVersion,
      examId: examId || null,
      subjects,
      dominantSubject,
      vulnerableSubject,
    };
  }

  /**
   * Retrieves topic performance using existing public.user_topic_mastery.
   * Gracefully returns INSUFFICIENT_TOPIC_DATA when mapping or sample is incomplete.
   */
  public static async getCandidateTopicPerformance(
    userId: string,
    examId?: string,
    policy: CandidateIntelligencePolicy = CANDIDATE_INTELLIGENCE_POLICY_V1
  ): Promise<TopicPerformanceData> {
    const adminSb: any = await createAdminServerSupabaseClient();

    const { data, error } = await adminSb
      .from("user_topic_mastery")
      .select(`
        id,
        user_id,
        topic_id,
        mastery_score,
        stability,
        attempts_count,
        correct_count,
        last_attempted_at,
        topic:topics(
          id,
          name,
          subject:subjects(
            name
          )
        )
      `)
      .eq("user_id", userId);

    if (error || !data || data.length === 0) {
      return {
        policyVersion: policy.policyVersion,
        isTopicDataAvailable: false,
        statusNotice: "INSUFFICIENT_TOPIC_DATA",
        topics: [],
      };
    }

    const topics: TopicPerformanceItem[] = [];

    for (const row of data as any[]) {
      const total = Number(row.attempts_count || 0);
      const correct = Number(row.correct_count || 0);
      const incorrect = total - correct;
      const accuracyPercentage = total > 0 ? this.roundToTwo((correct / total) * 100) : 0;

      const dataConfidence = this.calculateDataConfidence(
        total,
        policy.dataConfidenceParameters.targetSampleSize,
        1.0,
        1.0,
        0.8
      );

      let status: "MASTERED" | "NEEDS_PRACTICE" | "UNASSESSED" = "UNASSESSED";
      if (total >= 10) {
        if (accuracyPercentage >= 80) status = "MASTERED";
        else status = "NEEDS_PRACTICE";
      }

      topics.push({
        topicId: row.topic_id,
        topicName: row.topic?.name || "Topic " + row.topic_id.substring(0, 6),
        subjectTitle: row.topic?.subject?.name || "Subject",
        totalQuestions: total,
        attemptedQuestions: total,
        correctQuestions: correct,
        incorrectQuestions: incorrect,
        accuracyPercentage,
        status,
        dataConfidence,
      });
    }

    return {
      policyVersion: policy.policyVersion,
      isTopicDataAvailable: topics.length > 0,
      statusNotice: topics.length > 0 ? "TOPIC_DATA_AVAILABLE" : "INSUFFICIENT_TOPIC_DATA",
      topics,
    };
  }

  /**
   * Deterministically evaluates Strengths and Weaknesses using approved policy thresholds.
   */
  public static async getCandidateStrengthsAndWeaknesses(
    userId: string,
    examId?: string,
    policy: CandidateIntelligencePolicy = CANDIDATE_INTELLIGENCE_POLICY_V1
  ): Promise<StrengthsWeaknessesData> {
    const subjectData = await this.getCandidateSubjectBreakdown(userId, examId, policy);
    const topicData = await this.getCandidateTopicPerformance(userId, examId, policy);

    const strengths: StrengthItem[] = [];
    const weaknesses: WeaknessItem[] = [];

    let totalQuestionsEvaluated = 0;
    let totalCorrectQuestions = 0;

    // Evaluate Subject Level
    for (const sub of subjectData.subjects) {
      totalQuestionsEvaluated += sub.totalQuestions;
      totalCorrectQuestions += sub.correctQuestions;

      // Strength policy check: n >= 15, acc >= 82%, confidence >= 0.70
      if (
        sub.totalQuestions >= policy.strengthThresholds.minQuestions &&
        sub.accuracyPercentage >= policy.strengthThresholds.minCumulativeAccuracy &&
        sub.dataConfidence.score >= policy.strengthThresholds.minDataConfidence
      ) {
        strengths.push({
          key: sub.sectionKey,
          title: sub.sectionTitle,
          type: "SUBJECT",
          totalQuestions: sub.totalQuestions,
          cumulativeAccuracy: sub.accuracyPercentage,
          recentAccuracy: sub.accuracyPercentage,
          dataConfidence: sub.dataConfidence.score,
          evidence: `High mastery across ${sub.totalQuestions} questions with ${sub.accuracyPercentage}% accuracy.`,
        });
      }

      // Weakness policy check: n >= 15, acc < 55%, confidence >= 0.70
      if (
        sub.totalQuestions >= policy.weaknessThresholds.minQuestions &&
        sub.accuracyPercentage < policy.weaknessThresholds.maxCumulativeAccuracy &&
        sub.dataConfidence.score >= policy.weaknessThresholds.minDataConfidence
      ) {
        let rootCause: "KNOWLEDGE_GAP" | "ACCURACY_GUESSING_GAP" | "SPEED_TIME_DRAG" | "UNSPECIFIED" =
          "KNOWLEDGE_GAP";
        if (sub.negativeDragPercentage > 20) {
          rootCause = "ACCURACY_GUESSING_GAP";
        }

        weaknesses.push({
          key: sub.sectionKey,
          title: sub.sectionTitle,
          type: "SUBJECT",
          totalQuestions: sub.totalQuestions,
          cumulativeAccuracy: sub.accuracyPercentage,
          negativeMarksIncurred: sub.negativeMarksIncurred,
          negativeDragPercentage: sub.negativeDragPercentage,
          rootCause,
          dataConfidence: sub.dataConfidence.score,
          evidence: `Low accuracy (${sub.accuracyPercentage}%) across ${sub.totalQuestions} questions with ${sub.negativeMarksIncurred} marks lost to negative marking.`,
        });
      }
    }

    // Evaluate Topic Level
    for (const top of topicData.topics) {
      if (
        top.totalQuestions >= policy.strengthThresholds.minQuestions &&
        top.accuracyPercentage >= policy.strengthThresholds.minCumulativeAccuracy &&
        top.dataConfidence.score >= policy.strengthThresholds.minDataConfidence
      ) {
        strengths.push({
          key: top.topicId,
          title: `${top.topicName} (${top.subjectTitle})`,
          type: "TOPIC",
          totalQuestions: top.totalQuestions,
          cumulativeAccuracy: top.accuracyPercentage,
          recentAccuracy: top.accuracyPercentage,
          dataConfidence: top.dataConfidence.score,
          evidence: `Consistent mastery in ${top.topicName} with ${top.accuracyPercentage}% accuracy.`,
        });
      }

      if (
        top.totalQuestions >= policy.weaknessThresholds.minQuestions &&
        top.accuracyPercentage < policy.weaknessThresholds.maxCumulativeAccuracy &&
        top.dataConfidence.score >= policy.weaknessThresholds.minDataConfidence
      ) {
        weaknesses.push({
          key: top.topicId,
          title: `${top.topicName} (${top.subjectTitle})`,
          type: "TOPIC",
          totalQuestions: top.totalQuestions,
          cumulativeAccuracy: top.accuracyPercentage,
          negativeMarksIncurred: 0,
          negativeDragPercentage: 0,
          rootCause: "KNOWLEDGE_GAP",
          dataConfidence: top.dataConfidence.score,
          evidence: `Low topic retention (${top.accuracyPercentage}% accuracy) across ${top.totalQuestions} practice questions.`,
        });
      }
    }

    const overallAccuracy =
      totalQuestionsEvaluated > 0
        ? this.roundToTwo((totalCorrectQuestions / totalQuestionsEvaluated) * 100)
        : 0;

    const attempts = await this.getNormalizedHistoricalAttempts(userId, examId);
    const percentilePoints = attempts
      .filter((a) => a.status === "EVALUATED" && a.percentile !== null && a.percentile !== undefined)
      .map((a) => Number(a.percentile));

    const consistencyResult = this.calculateConsistencyIndex(percentilePoints);

    return {
      policyVersion: policy.policyVersion,
      strengths,
      weaknesses,
      overallAccuracy,
      totalQuestionsEvaluated,
      consistencyIndex: consistencyResult.index,
      consistencyRating: consistencyResult.rating,
    };
  }

  /**
   * Retrieves unified chronological activity and credential timeline.
   */
  public static async getCandidateUnifiedTimeline(
    userId: string,
    limit: number = 50
  ): Promise<UnifiedTimelineEvent[]> {
    const adminSb: any = await createAdminServerSupabaseClient();
    const events: UnifiedTimelineEvent[] = [];

    // 1. Normalized Attempts (Live Tests, Mocks, Adaptives)
    const attempts = await this.getNormalizedHistoricalAttempts(userId);

    for (const att of attempts) {
      let eventType: "LIVE_TEST_COMPLETED" | "MOCK_COMPLETED" | "ADAPTIVE_COMPLETED" =
        "MOCK_COMPLETED";
      if (att.sourceType === "LIVE_TEST") eventType = "LIVE_TEST_COMPLETED";
      else if (att.sourceType === "ADAPTIVE") eventType = "ADAPTIVE_COMPLETED";

      const isVoid = att.status === "VOIDED" || att.status === "DISQUALIFIED";

      events.push({
        id: `att-${att.attemptId}`,
        eventType,
        title: att.testTitle,
        subtitle: att.examTitle,
        occurredAt: att.submittedAt,
        score: att.totalScore,
        maxScore: att.maxScore,
        percentageScore: att.percentageScore,
        rank: att.rank ?? null,
        percentile: att.percentile !== null && att.percentile !== undefined ? Number(att.percentile) : null,
        totalParticipants: att.totalParticipants ?? null,
        statusBadge: isVoid ? `[${att.status}]` : undefined,
        isVoidedOrDisqualified: isVoid,
      });
    }

    // 2. Achievements (Phase 5E.3)
    const { data: awards } = await adminSb
      .from("live_test_achievement_awards")
      .select(`
        id,
        badge_code,
        awarded_at,
        status,
        definition:live_test_achievement_definitions(
          badge:badges(
            title,
            tier,
            icon_url
          )
        )
      `)
      .eq("user_id", userId)
      .eq("status", "AWARDED");

    if (awards) {
      for (const aw of awards as any[]) {
        events.push({
          id: `ach-${aw.id}`,
          eventType: "BADGE_EARNED",
          title: `Earned Badge: ${aw.definition?.badge?.title || aw.badge_code}`,
          subtitle: `Tier: ${aw.definition?.badge?.tier || "Standard"}`,
          occurredAt: aw.awarded_at,
          badgeCode: aw.badge_code,
          badgeTitle: aw.definition?.badge?.title || aw.badge_code,
          badgeTier: aw.definition?.badge?.tier || "Standard",
          badgeIconUrl: aw.definition?.badge?.icon_url || null,
        });
      }
    }

    // 3. Certificates (Phase 5E.2)
    const { data: certs } = await adminSb
      .from("live_test_certificates")
      .select(`
        id,
        certificate_number,
        certificate_type,
        verification_code,
        issued_at,
        status
      `)
      .eq("user_id", userId)
      .eq("status", "ISSUED");

    if (certs) {
      for (const cert of certs as any[]) {
        events.push({
          id: `cert-${cert.id}`,
          eventType: "CERTIFICATE_ISSUED",
          title: `Issued ${cert.certificate_type.replace(/_/g, " ")}`,
          subtitle: `Cert #${cert.certificate_number}`,
          occurredAt: cert.issued_at,
          certificateNumber: cert.certificate_number,
          certificateType: cert.certificate_type,
          verificationCode: cert.verification_code,
        });
      }
    }

    // 4. Rewards (Phase 5E.1)
    const { data: rewards } = await adminSb
      .from("live_test_reward_settlements")
      .select(`
        id,
        reward_type,
        coins_awarded,
        settled_at,
        status
      `)
      .eq("user_id", userId)
      .eq("status", "SETTLED");

    if (rewards) {
      for (const rew of rewards as any[]) {
        events.push({
          id: `rew-${rew.id}`,
          eventType: "REWARD_SETTLED",
          title: `CL Coin Reward Settled: +${rew.coins_awarded} Coins`,
          subtitle: `Type: ${rew.reward_type}`,
          occurredAt: rew.settled_at,
          coinsEarned: Number(rew.coins_awarded),
        });
      }
    }

    // Sort timeline strictly descending by occurredAt
    events.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());

    return events.slice(0, limit);
  }

  // ============================================================================
  // PRIVATE AGGREGATION & NORMALIZATION HELPERS
  // ============================================================================

  /**
   * Fetches and normalizes all historical attempts for a candidate across live tests,
   * mocks, and adaptive sessions.
   */
  public static async getNormalizedHistoricalAttempts(
    userId: string,
    examId?: string
  ): Promise<NormalizedHistoricalAttempt[]> {
    const adminSb: any = await createAdminServerSupabaseClient();
    const attempts: NormalizedHistoricalAttempt[] = [];

    // 1. Query Standard Mocks & Tests from public.test_attempts
    let mockQuery = adminSb
      .from("test_attempts")
      .select(`
        id,
        user_id,
        mock_test_id,
        live_test_event_id,
        started_at,
        submitted_at,
        status,
        time_spent_seconds,
        test_result:test_results(
          total_marks,
          max_marks,
          percentage,
          accuracy_percentage,
          correct_count,
          incorrect_count,
          unattempted_count,
          negative_marks
        ),
        mock_test:mock_tests(
          id,
          title,
          exam_id,
          exam:exams(
            id,
            title
          )
        )
      `)
      .eq("user_id", userId)
      .is("live_test_event_id", null)
      .not("submitted_at", "is", null);

    if (examId) {
      mockQuery = mockQuery.eq("mock_test.exam_id", examId);
    }

    const { data: mockData } = await mockQuery;

    if (mockData) {
      for (const row of mockData as any[]) {
        const tr = Array.isArray(row.test_result) ? row.test_result[0] : row.test_result;
        const totalScore = Number(tr?.total_marks || 0);
        const maxScore = Number(tr?.max_marks || 100);
        const percentageScore =
          maxScore > 0 ? Number(tr?.percentage || (totalScore / maxScore) * 100) : 0;
        const accuracyPercentage = Number(tr?.accuracy_percentage || 0);

        let status: "EVALUATED" | "SUPERSEDED" | "VOIDED" | "DISQUALIFIED" = "EVALUATED";
        if (row.status === "VOIDED" || row.status === "EXPIRED") status = "VOIDED";

        attempts.push({
          attemptId: row.id,
          sourceType: "FULL_MOCK",
          mockTestId: row.mock_test_id,
          examId: row.mock_test?.exam_id || "general",
          examTitle: row.mock_test?.exam?.title || "General Exam",
          testTitle: row.mock_test?.title || "Mock Assessment",
          startedAt: row.started_at,
          submittedAt: row.submitted_at,
          totalScore: this.roundToTwo(totalScore),
          maxScore: this.roundToTwo(maxScore),
          percentageScore: this.roundToTwo(percentageScore),
          accuracyPercentage: this.roundToTwo(accuracyPercentage),
          timeSpentSeconds: Number(row.time_spent_seconds || 0),
          correctCount: Number(tr?.correct_count || 0),
          incorrectCount: Number(tr?.incorrect_count || 0),
          unattemptedCount: Number(tr?.unattempted_count || 0),
          negativeMarksIncurred: Number(tr?.negative_marks || 0),
          status,
        });
      }
    }

    // 2. Query Live Tests from public.live_test_leaderboard_entries
    // Strict Model C Errata Filter: Only active finalized snapshots
    let liveQuery = adminSb
      .from("live_test_leaderboard_entries")
      .select(`
        id,
        attempt_id,
        user_id,
        live_test_event_id,
        snapshot_id,
        score,
        rank,
        percentile,
        accuracy_percentage,
        correct_count,
        incorrect_count,
        unattempted_count,
        time_spent_seconds,
        is_disqualified,
        live_test_event:live_test_events(
          id,
          title,
          exam_id,
          exam:exams(
            id,
            title
          )
        ),
        snapshot:live_test_ranking_snapshots!inner(
          id,
          is_active,
          total_participants,
          highest_score
        ),
        test_attempt:test_attempts(
          started_at,
          submitted_at,
          status
        )
      `)
      .eq("user_id", userId)
      .eq("snapshot.is_active", true);

    if (examId) {
      liveQuery = liveQuery.eq("live_test_event.exam_id", examId);
    }

    const { data: liveData } = await liveQuery;

    if (liveData) {
      for (const row of liveData as any[]) {
        const totalScore = Number(row.score || 0);
        const maxScore = Number(row.snapshot?.highest_score || 200);
        const percentageScore =
          maxScore > 0 ? (totalScore / maxScore) * 100 : 0;

        let status: "EVALUATED" | "SUPERSEDED" | "VOIDED" | "DISQUALIFIED" = "EVALUATED";
        if (row.is_disqualified) {
          status = "DISQUALIFIED";
        } else if (row.test_attempt?.status === "VOIDED") {
          status = "VOIDED";
        }

        attempts.push({
          attemptId: row.attempt_id || row.id,
          sourceType: "LIVE_TEST",
          eventId: row.live_test_event_id,
          examId: row.live_test_event?.exam_id || "live",
          examTitle: row.live_test_event?.exam?.title || "National Live Championship",
          testTitle: row.live_test_event?.title || "Live Mock Competition",
          startedAt: row.test_attempt?.started_at || new Date().toISOString(),
          submittedAt: row.test_attempt?.submitted_at || new Date().toISOString(),
          totalScore: this.roundToTwo(totalScore),
          maxScore: this.roundToTwo(maxScore),
          percentageScore: this.roundToTwo(percentageScore),
          accuracyPercentage: Number(row.accuracy_percentage || 0),
          timeSpentSeconds: Number(row.time_spent_seconds || 0),
          rank: Number(row.rank || 0),
          percentile: Number(row.percentile || 0),
          totalParticipants: Number(row.snapshot?.total_participants || 0),
          correctCount: Number(row.correct_count || 0),
          incorrectCount: Number(row.incorrect_count || 0),
          unattemptedCount: Number(row.unattempted_count || 0),
          negativeMarksIncurred: 0,
          status,
        });
      }
    }

    // Sort strictly chronological: submittedAt ASC
    attempts.sort(
      (a, b) => new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime()
    );

    return attempts;
  }

  /**
   * Deterministic Data Confidence computation.
   * DATA_CONFIDENCE = S * (0.40 * C_data + 0.30 * M_map + 0.30 * R_recent)
   */
  public static calculateDataConfidence(
    sampleSize: number,
    targetSampleSize: number = 30,
    dataCompletenessFactor: number = 1.0,
    mappingCompletenessFactor: number = 1.0,
    recencyFactor: number = 1.0
  ): DataConfidenceBreakdown {
    const sampleFactor = Math.min(1.0, sampleSize / targetSampleSize);
    const score = this.roundToTwo(
      sampleFactor *
        (0.4 * dataCompletenessFactor +
          0.3 * mappingCompletenessFactor +
          0.3 * recencyFactor)
    );

    return {
      score,
      sampleSize,
      targetSampleSize,
      sampleFactor: this.roundToTwo(sampleFactor),
      dataCompletenessFactor: this.roundToTwo(dataCompletenessFactor),
      mappingCompletenessFactor: this.roundToTwo(mappingCompletenessFactor),
      recencyFactor: this.roundToTwo(recencyFactor),
      isHighConfidence: score >= 0.7,
    };
  }

  /**
   * Deterministic Trend Classification based on sample sufficiency N >= 5 and slope beta.
   */
  public static calculateTrendClassification(
    series: number[],
    policy: CandidateIntelligencePolicy = CANDIDATE_INTELLIGENCE_POLICY_V1
  ): TrendClassification {
    const n = series.length;
    if (n < policy.trendClassification.minSampleForTrend) {
      return "INSUFFICIENT_DATA";
    }

    const cv = this.calculateCoefficientOfVariation(series) || 0;
    if (cv > policy.trendClassification.volatileThresholdCV) {
      return "VOLATILE";
    }

    const slope = this.calculateSlope(series) || 0;

    // Effect size: recent 3 vs prior 3
    const recent3 = series.slice(-3);
    const prior3 = series.slice(-6, -3);
    const recentMean = this.calculateMean(recent3);
    const priorMean = prior3.length > 0 ? this.calculateMean(prior3) : recentMean;
    const effectSize = recentMean - priorMean;

    if (
      slope > policy.trendClassification.improvingSlopeThreshold &&
      effectSize >= policy.trendClassification.improvingEffectSize
    ) {
      return "IMPROVING";
    }

    if (
      slope < policy.trendClassification.decliningSlopeThreshold &&
      effectSize <= policy.trendClassification.decliningEffectSize
    ) {
      return "DECLINING";
    }

    if (
      Math.abs(slope) <= policy.trendClassification.improvingSlopeThreshold &&
      cv <= policy.trendClassification.maxStableVolatilityCV
    ) {
      return "STABLE";
    }

    return "STABLE";
  }

  /**
   * Consistency Index: 100 - min(100, CV_percentile)
   */
  public static calculateConsistencyIndex(
    percentiles: number[]
  ): { index: number | null; rating: "HIGH" | "MODERATE" | "VOLATILE" | "INSUFFICIENT_DATA" } {
    if (percentiles.length < 3) {
      return { index: null, rating: "INSUFFICIENT_DATA" };
    }

    const cv = this.calculateCoefficientOfVariation(percentiles);
    if (cv === null) {
      return { index: null, rating: "INSUFFICIENT_DATA" };
    }

    const index = Math.max(0, this.roundToTwo(100 - Math.min(100, cv)));
    let rating: "HIGH" | "MODERATE" | "VOLATILE" = "MODERATE";
    if (index >= 80) rating = "HIGH";
    else if (index < 50) rating = "VOLATILE";

    return { index, rating };
  }

  /**
   * Linear Regression Slope beta.
   */
  public static calculateSlope(series: number[]): number | null {
    const n = series.length;
    if (n < 2) return null;

    const t = Array.from({ length: n }, (_, i) => i + 1);
    const meanT = this.calculateMean(t);
    const meanY = this.calculateMean(series);

    let numerator = 0;
    let denominator = 0;

    for (let i = 0; i < n; i++) {
      numerator += (t[i] - meanT) * (series[i] - meanY);
      denominator += Math.pow(t[i] - meanT, 2);
    }

    if (denominator === 0) return 0;
    return this.roundToTwo(numerator / denominator);
  }

  /**
   * Coefficient of Variation CV = (sigma / mu) * 100
   */
  public static calculateCoefficientOfVariation(series: number[]): number | null {
    const n = series.length;
    if (n < 2) return null;

    const mean = this.calculateMean(series);
    if (mean === 0) return 0;

    const variance =
      series.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / n;
    const stdDev = Math.sqrt(variance);

    return this.roundToTwo((stdDev / mean) * 100);
  }

  /**
   * Personal best extractor.
   */
  private static calculatePersonalBests(
    attempts: NormalizedHistoricalAttempt[]
  ): PersonalBestSummary {
    let bestScoreObj: PersonalBestSummary["bestScore"] = null;
    let bestRankObj: PersonalBestSummary["bestRank"] = null;
    let bestPercentileObj: PersonalBestSummary["bestPercentile"] = null;

    for (const att of attempts) {
      // Score PB
      if (
        !bestScoreObj ||
        att.percentageScore > bestScoreObj.percentage ||
        (att.percentageScore === bestScoreObj.percentage && att.totalScore > bestScoreObj.value)
      ) {
        bestScoreObj = {
          value: att.totalScore,
          maxScore: att.maxScore,
          percentage: att.percentageScore,
          testTitle: att.testTitle,
          achievedAt: att.submittedAt,
        };
      }

      // Rank PB
      if (att.rank !== null && att.rank !== undefined && att.rank > 0) {
        if (!bestRankObj || att.rank < bestRankObj.value) {
          bestRankObj = {
            value: att.rank,
            totalParticipants: att.totalParticipants || 0,
            testTitle: att.testTitle,
            achievedAt: att.submittedAt,
          };
        }
      }

      // Percentile PB
      if (att.percentile !== null && att.percentile !== undefined) {
        const pVal = Number(att.percentile);
        if (!bestPercentileObj || pVal > bestPercentileObj.value) {
          bestPercentileObj = {
            value: pVal,
            testTitle: att.testTitle,
            achievedAt: att.submittedAt,
          };
        }
      }
    }

    return {
      bestScore: bestScoreObj,
      bestRank: bestRankObj,
      bestPercentile: bestPercentileObj,
    };
  }

  /**
   * Exam-wise summaries generator.
   */
  private static async calculateExamScopes(
    userId: string,
    policy: CandidateIntelligencePolicy
  ): Promise<ExamScopeSummary[]> {
    const attempts = await this.getNormalizedHistoricalAttempts(userId);
    const validAttempts = attempts.filter((a) => a.status === "EVALUATED");

    const examMap = new Map<string, {
      title: string;
      attempts: NormalizedHistoricalAttempt[];
    }>();

    for (const att of validAttempts) {
      if (!examMap.has(att.examId)) {
        examMap.set(att.examId, {
          title: att.examTitle,
          attempts: [],
        });
      }
      examMap.get(att.examId)!.attempts.push(att);
    }

    const summaries: ExamScopeSummary[] = [];

    for (const [examId, data] of examMap.entries()) {
      const pSeries = data.attempts.map((a) => a.percentageScore);
      const avgPercentage = this.roundToTwo(this.calculateMean(pSeries));
      const latestScorePercentage = pSeries[pSeries.length - 1];

      const ranked = data.attempts.filter((a) => a.rank !== null && a.rank !== undefined);
      const bestRank = ranked.length > 0 ? Math.min(...ranked.map((a) => a.rank!)) : null;

      const percentiles = data.attempts.filter(
        (a) => a.percentile !== null && a.percentile !== undefined
      );
      const latestPercentile =
        percentiles.length > 0
          ? Number(percentiles[percentiles.length - 1].percentile)
          : null;

      const trend = this.calculateTrendClassification(pSeries, policy);

      summaries.push({
        examId,
        examTitle: data.title,
        totalAttempts: data.attempts.length,
        averageScorePercentage: avgPercentage,
        latestScorePercentage,
        bestRank,
        latestPercentile,
        trend,
      });
    }

    return summaries;
  }

  private static async getAchievementsSummary(userId: string) {
    const adminSb: any = await createAdminServerSupabaseClient();
    const { data: awards } = await adminSb
      .from("live_test_achievement_awards")
      .select("badge_code")
      .eq("user_id", userId)
      .eq("status", "AWARDED");

    if (!awards) {
      return { totalBadgesEarned: 0, podiumCount: 0, nationalMeritCount: 0, streakCount: 0 };
    }

    const codes = awards.map((a: any) => a.badge_code);
    const uniqueBadges = new Set(codes).size;
    const podiumCount = codes.filter((c: string) => c.startsWith("PODIUM_")).length;
    const nationalMeritCount = codes.filter((c: string) => c.startsWith("NATIONAL_TOP_")).length;
    const streakCount = codes.filter((c: string) => c.startsWith("CONSISTENT_PERFORMER_")).length;

    return {
      totalBadgesEarned: uniqueBadges,
      podiumCount,
      nationalMeritCount,
      streakCount,
    };
  }

  private static async getCertificatesCount(userId: string): Promise<number> {
    const adminSb: any = await createAdminServerSupabaseClient();
    const { count } = await adminSb
      .from("live_test_certificates")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "ISSUED");

    return count || 0;
  }

  private static async getTotalRewardsEarnedCL(userId: string): Promise<number> {
    const adminSb: any = await createAdminServerSupabaseClient();
    const { data } = await adminSb
      .from("live_test_reward_settlements")
      .select("coins_awarded")
      .eq("user_id", userId)
      .eq("status", "SETTLED");

    if (!data) return 0;
    return data.reduce((sum: number, r: any) => sum + Number(r.coins_awarded || 0), 0);
  }

  private static calculateMean(numbers: number[]): number {
    if (numbers.length === 0) return 0;
    return numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
  }

  private static roundToTwo(num: number): number {
    return Math.round((num + Number.EPSILON) * 100) / 100;
  }
}
