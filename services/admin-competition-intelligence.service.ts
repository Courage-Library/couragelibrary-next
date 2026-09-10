/**
 * COURAGE LIBRARY — PHASE 5E.5: ADMIN COMPETITION INTELLIGENCE SERVICE
 *
 * Authoritative administrative competition intelligence, participation funnels,
 * cohort distributions, sectional analytics, reward/credential summaries,
 * deterministic anomaly diagnostics, and cross-event comparability.
 *
 * Strict downstream read-only analytics consumer.
 * Governed by ADMIN_COMPETITION_INTELLIGENCE_POLICY_V1.
 */

import { createAdminServerSupabaseClient } from "@/lib/supabase/server";
import {
  ADMIN_COMPETITION_INTELLIGENCE_POLICY_V1,
  CompetitionAnomalyPolicy,
  EventCompetitionIntelligence,
  MacroCompetitionIntelligenceOverview,
  CrossEventComparisonResult,
  ParticipationFunnelData,
  ScoreDistributionData,
  AccuracyDistributionData,
  RankingPercentileData,
  TimingIntelligenceData,
  SectionSubjectTopicIntelligence,
  SectionIntelligenceItem,
  SubjectIntelligenceItem,
  TopicIntelligenceItem,
  RewardIntelligenceData,
  CertificateIntelligenceData,
  AchievementIntelligenceData,
  RetentionDynamicsData,
  OperationalHealthData,
  DataQualityDiagnostics,
  AnomalySignal,
  CandidateDrillDownItem,
  ScoreBandItem,
  DecileItem,
} from "@/types/admin-competition-intelligence";

export class AdminCompetitionIntelligenceService {
  /**
   * Retrieves high-level macro competition intelligence across all live events.
   */
  public static async getMacroCompetitionOverview(): Promise<MacroCompetitionIntelligenceOverview> {
    const supabase = createAdminServerSupabaseClient();

    // 1. Fetch all live test events ordered by start time desc
    const { data: events, error: eventsErr } = await (supabase as any)
      .from("live_test_events")
      .select("id, title, status, start_time, end_time, total_marks, duration_minutes, exam_id, exams(title)")
      .order("start_time", { ascending: false });

    if (eventsErr || !events) {
      return {
        totalEvents: 0,
        totalRegistrations: 0,
        totalStarts: 0,
        totalSubmissions: 0,
        overallTurnoutRate: 0,
        overallCompletionRate: 0,
        totalCoinsDisbursed: 0,
        totalCertificatesIssued: 0,
        totalAchievementsAwarded: 0,
        recentEvents: [],
        anomaliesSummary: {
          totalAnomaliesTriggered: 0,
          unsettledRewardEventsCount: 0,
          highDropoutEventsCount: 0,
        },
      };
    }

    // 2. Fetch aggregate registrations count
    const { count: totalRegistrations } = await (supabase as any)
      .from("live_test_registrations")
      .select("*", { count: "exact", head: true })
      .eq("status", "REGISTERED");

    // 3. Fetch aggregate attempts count
    const { data: allAttempts } = await (supabase as any)
      .from("test_attempts")
      .select("id, event_id, status, total_score");

    const totalStarts = (allAttempts || []).length;
    const totalSubmissions = (allAttempts || []).filter(
      (a: any) => a.status === "SUBMITTED" || a.status === "EVALUATED"
    ).length;

    // 4. Fetch reward disbursements sum
    const { data: rewards } = await (supabase as any)
      .from("live_test_reward_settlements")
      .select("coins_awarded");
    const totalCoinsDisbursed = (rewards || []).reduce((sum: number, r: any) => sum + (r.coins_awarded || 0), 0);

    // 5. Fetch certificates count
    const { count: totalCertificatesIssued } = await (supabase as any)
      .from("live_test_certificates")
      .select("*", { count: "exact", head: true });

    // 6. Fetch achievements count
    const { count: totalAchievementsAwarded } = await (supabase as any)
      .from("live_test_achievement_awards")
      .select("*", { count: "exact", head: true });

    // 7. Calculate overall rates safely
    const overallTurnoutRate =
      (totalRegistrations || 0) > 0
        ? this.roundToTwo((totalStarts / (totalRegistrations || 1)) * 100)
        : 0;
    const overallCompletionRate =
      totalStarts > 0 ? this.roundToTwo((totalSubmissions / totalStarts) * 100) : 0;

    // 8. Build recent events summary
    const recentEventsSummary: MacroCompetitionIntelligenceOverview["recentEvents"] = [];
    let totalAnomaliesTriggered = 0;
    let unsettledRewardEventsCount = 0;
    let highDropoutEventsCount = 0;

    for (const evt of (events as any[]).slice(0, 15)) {
      const { count: regCount } = await (supabase as any)
        .from("live_test_registrations")
        .select("*", { count: "exact", head: true })
        .eq("live_test_id", evt.id)
        .eq("status", "REGISTERED");

      const evtAttempts = (allAttempts || []).filter((a: any) => a.event_id === evt.id);
      const startCount = evtAttempts.length;
      const subCount = evtAttempts.filter(
        (a: any) => a.status === "SUBMITTED" || a.status === "EVALUATED"
      ).length;

      const evaluatedScores = evtAttempts
        .filter((a: any) => a.total_score != null)
        .map((a: any) => Number(a.total_score));

      const meanScore =
        evaluatedScores.length > 0
          ? this.roundToTwo(this.calculateMean(evaluatedScores))
          : null;

      let anomalyCount = 0;
      const dropoutRate =
        startCount > 0 ? ((startCount - subCount) / startCount) * 100 : 0;

      if (dropoutRate > ADMIN_COMPETITION_INTELLIGENCE_POLICY_V1.thresholds.highDropoutRatePercent) {
        anomalyCount++;
        highDropoutEventsCount++;
      }

      totalAnomaliesTriggered += anomalyCount;

      recentEventsSummary.push({
        id: evt.id,
        title: evt.title,
        examTitle: evt.exams?.title || undefined,
        status: evt.status,
        isPublished: evt.status === "PUBLISHED",
        startTime: evt.start_time,
        registeredCount: regCount || 0,
        startedCount: startCount,
        submittedCount: subCount,
        meanScore,
        anomalyCount,
      });
    }

    return {
      totalEvents: events.length,
      totalRegistrations: totalRegistrations || 0,
      totalStarts,
      totalSubmissions,
      overallTurnoutRate,
      overallCompletionRate,
      totalCoinsDisbursed,
      totalCertificatesIssued: totalCertificatesIssued || 0,
      totalAchievementsAwarded: totalAchievementsAwarded || 0,
      recentEvents: recentEventsSummary,
      anomaliesSummary: {
        totalAnomaliesTriggered,
        unsettledRewardEventsCount,
        highDropoutEventsCount,
      },
    };
  }

  /**
   * Retrieves comprehensive event-level competition intelligence for a specific event.
   */
  public static async getEventCompetitionIntelligence(
    eventId: string,
    policy: CompetitionAnomalyPolicy = ADMIN_COMPETITION_INTELLIGENCE_POLICY_V1
  ): Promise<EventCompetitionIntelligence> {
    const supabase = createAdminServerSupabaseClient();

    // 1. Fetch Event Details
    const { data: event, error: eventErr } = await (supabase as any)
      .from("live_test_events")
      .select("*, exams(id, title)")
      .eq("id", eventId)
      .single();

    if (eventErr || !event) {
      throw new Error(`Event not found: ${eventId}`);
    }

    const isPublished = event.status === "PUBLISHED";

    // 2. Fetch Registrations
    const { data: registrations } = await (supabase as any)
      .from("live_test_registrations")
      .select("id, user_id, status, registered_at")
      .eq("live_test_id", eventId)
      .eq("status", "REGISTERED");

    const registeredCount = (registrations || []).length;

    // 3. Fetch Attempts
    const { data: attempts } = await (supabase as any)
      .from("test_attempts")
      .select("id, user_id, status, started_at, submitted_at, time_spent_seconds, total_score, percentage_score")
      .eq("event_id", eventId);

    const validAttempts = attempts || [];
    const startedCount = validAttempts.length;
    const submittedAttempts = validAttempts.filter((a: any) => a.status === "SUBMITTED" || a.status === "EVALUATED");
    const submittedCount = submittedAttempts.length;
    const expiredCount = validAttempts.filter((a: any) => a.status === "EXPIRED").length;

    // 4. Fetch Active Snapshot and Leaderboard Entries
    const { data: activeSnapshot } = await (supabase as any)
      .from("live_test_ranking_snapshots")
      .select("*")
      .eq("event_id", eventId)
      .eq("is_active", true)
      .maybeSingle();

    let leaderboardEntries: any[] = [];
    if (activeSnapshot) {
      const { data: entries } = await (supabase as any)
        .from("live_test_leaderboard_entries")
        .select("*")
        .eq("snapshot_id", activeSnapshot.id)
        .order("rank", { ascending: true });
      leaderboardEntries = entries || [];
    }

    const evaluatedCount = activeSnapshot ? activeSnapshot.total_participants || leaderboardEntries.length : 0;
    const rankedCount = leaderboardEntries.length;
    const publishedCount = isPublished ? rankedCount : 0;

    // 5. Compute Participation Funnel
    const turnoutRate = registeredCount > 0 ? this.roundToTwo((startedCount / registeredCount) * 100) : 0;
    const completionRate = startedCount > 0 ? this.roundToTwo((submittedCount / startedCount) * 100) : 0;
    const dropoutRate = startedCount > 0 ? this.roundToTwo(((startedCount - submittedCount) / startedCount) * 100) : 0;
    const expiryRate = startedCount > 0 ? this.roundToTwo((expiredCount / startedCount) * 100) : 0;

    const earlyExitCutoffSec = policy.thresholds.earlyExitThresholdMinutes * 60;
    const earlyExitAttempts = submittedAttempts.filter(
      (a: any) => a.time_spent_seconds != null && a.time_spent_seconds < earlyExitCutoffSec
    );
    const earlyExitCount = earlyExitAttempts.length;
    const earlyDropoutRate = startedCount > 0 ? this.roundToTwo((earlyExitCount / startedCount) * 100) : 0;
    const autoSubmissionRate = startedCount > 0 ? this.roundToTwo((expiredCount / startedCount) * 100) : 0;

    const funnel: ParticipationFunnelData = {
      registeredCount,
      startedCount,
      submittedCount,
      evaluatedCount,
      rankedCount,
      publishedCount,
      turnoutRate,
      completionRate,
      dropoutRate,
      expiryRate,
      earlyDropoutRate,
      autoSubmissionRate,
    };

    // 6. Compute Score Distribution
    const privacySuppressed = rankedCount < policy.thresholds.minimumPrivacyCohortSize;
    let scoreDistribution: ScoreDistributionData;
    let accuracyDistribution: AccuracyDistributionData;
    let rankingPercentile: RankingPercentileData;

    if (privacySuppressed || rankedCount === 0) {
      scoreDistribution = {
        meanScore: null,
        medianScore: null,
        stdDev: null,
        iqr: null,
        minScore: null,
        maxScore: null,
        skewness: null,
        scoreBands: [],
        privacySuppressed: true,
      };

      accuracyDistribution = {
        meanAccuracy: null,
        medianAccuracy: null,
        accuracyBands: [],
        privacySuppressed: true,
      };

      rankingPercentile = {
        deciles: [],
        eliteThresholds: {
          top1PercentScore: null,
          top5PercentScore: null,
          top10PercentScore: null,
        },
        tiedRankCount: 0,
        tiedRankFrequency: 0,
        totalRanked: rankedCount,
        privacySuppressed: true,
      };
    } else {
      const scores = leaderboardEntries.map((e: any) => Number(e.score)).sort((a: number, b: number) => a - b);
      const accuracies = leaderboardEntries
        .map((e: any) => Number(e.accuracy || ((e.score / (event.total_marks || 100)) * 100)))
        .sort((a: number, b: number) => a - b);

      const meanScore = this.roundToTwo(this.calculateMean(scores));
      const medianScore = this.roundToTwo(this.calculatePercentile(scores, 50));
      const stdDev = this.roundToTwo(this.calculateStdDev(scores, meanScore));
      const q1 = this.calculatePercentile(scores, 25);
      const q3 = this.calculatePercentile(scores, 75);
      const iqr = this.roundToTwo(q3 - q1);
      const minScore = scores[0];
      const maxScore = scores[scores.length - 1];
      const skewness = stdDev > 0 ? this.roundToTwo((meanScore - medianScore) / stdDev) : 0;

      // 10 Equidistant Score Bands
      const totalMarks = event.total_marks || 100;
      const bandWidth = totalMarks / 10;
      const scoreBands: ScoreBandItem[] = [];

      for (let i = 0; i < 10; i++) {
        const low = i * bandWidth;
        const high = (i + 1) * bandWidth;
        const count = scores.filter((s: number) => (i === 9 ? s >= low && s <= high : s >= low && s < high)).length;
        const percentage = this.roundToTwo((count / rankedCount) * 100);
        scoreBands.push({
          range: [this.roundToTwo(low), this.roundToTwo(high)],
          label: `${this.roundToTwo(low)} - ${this.roundToTwo(high)}`,
          count,
          percentage,
        });
      }

      scoreDistribution = {
        meanScore,
        medianScore,
        stdDev,
        iqr,
        minScore,
        maxScore,
        skewness,
        scoreBands,
        privacySuppressed: false,
      };

      // Accuracy Distribution
      const meanAccuracy = this.roundToTwo(this.calculateMean(accuracies));
      const medianAccuracy = this.roundToTwo(this.calculatePercentile(accuracies, 50));
      const accuracyBands: ScoreBandItem[] = [];
      for (let i = 0; i < 5; i++) {
        const low = i * 20;
        const high = (i + 1) * 20;
        const count = accuracies.filter((a: number) => (i === 4 ? a >= low && a <= high : a >= low && a < high)).length;
        const percentage = this.roundToTwo((count / rankedCount) * 100);
        accuracyBands.push({
          range: [low, high],
          label: `${low}% - ${high}%`,
          count,
          percentage,
        });
      }

      accuracyDistribution = {
        meanAccuracy,
        medianAccuracy,
        accuracyBands,
        privacySuppressed: false,
      };

      // Ranking & Deciles
      const deciles: DecileItem[] = [];
      for (let d = 10; d <= 90; d += 10) {
        const markCutoff = this.roundToTwo(this.calculatePercentile(scores, d));
        const candidateCount = scores.filter((s: number) => s >= markCutoff).length;
        deciles.push({
          percentile: d,
          markCutoff,
          candidateCount,
        });
      }

      const top1PercentScore = this.roundToTwo(this.calculatePercentile(scores, 99));
      const top5PercentScore = this.roundToTwo(this.calculatePercentile(scores, 95));
      const top10PercentScore = this.roundToTwo(this.calculatePercentile(scores, 90));

      const rankCounts = new Map<number, number>();
      for (const e of leaderboardEntries) {
        rankCounts.set(e.rank, (rankCounts.get(e.rank) || 0) + 1);
      }
      let tiedRankCount = 0;
      for (const count of rankCounts.values()) {
        if (count > 1) tiedRankCount += count;
      }
      const tiedRankFrequency = this.roundToTwo((tiedRankCount / rankedCount) * 100);

      rankingPercentile = {
        deciles,
        eliteThresholds: {
          top1PercentScore,
          top5PercentScore,
          top10PercentScore,
        },
        tiedRankCount,
        tiedRankFrequency,
        totalRanked: rankedCount,
        privacySuppressed: false,
      };
    }

    // 7. Timing Intelligence
    const durations = validAttempts
      .filter((a: any) => a.time_spent_seconds != null && a.time_spent_seconds > 0)
      .map((a: any) => Number(a.time_spent_seconds) / 60)
      .sort((a: number, b: number) => a - b);

    const minDurationMinutes = durations.length > 0 ? this.roundToTwo(durations[0]) : 0;
    const maxDurationMinutes = durations.length > 0 ? this.roundToTwo(durations[durations.length - 1]) : 0;
    const meanDurationMinutes = durations.length > 0 ? this.roundToTwo(this.calculateMean(durations)) : 0;
    const medianDurationMinutes = durations.length > 0 ? this.roundToTwo(this.calculatePercentile(durations, 50)) : 0;
    const allottedMinutes = event.duration_minutes || 60;
    const timeUtilizationRate = this.roundToTwo((medianDurationMinutes / allottedMinutes) * 100);

    const explicitSubmit = submittedCount - expiredCount;
    const earlyExitSpikeDetected = earlyDropoutRate > policy.thresholds.earlyExitSpikePercent;

    const timing: TimingIntelligenceData = {
      minDurationMinutes,
      maxDurationMinutes,
      meanDurationMinutes,
      medianDurationMinutes,
      timeUtilizationRate,
      submissionModes: {
        explicitSubmit: Math.max(0, explicitSubmit),
        autoTimerExpiry: expiredCount,
      },
      earlyExitCount,
      earlyExitSpikeDetected,
    };

    // 8. Section & Topic Intelligence
    const sectionTopic = await this.compileSectionTopicIntelligence(eventId, event.mock_test_id);

    // 9. Reward Intelligence
    const { data: rewardRows } = await (supabase as any)
      .from("live_test_reward_settlements")
      .select("*")
      .eq("event_id", eventId);

    const rewardsData = rewardRows || [];
    const totalCoinsDisbursed = rewardsData.reduce((sum: number, r: any) => sum + (r.coins_awarded || 0), 0);
    const podiumCoinsDisbursed = rewardsData
      .filter((r: any) => r.settlement_type === "TOP_RANK" || (r.rank != null && r.rank <= 3))
      .reduce((sum: number, r: any) => sum + (r.coins_awarded || 0), 0);
    const participationCoinsDisbursed = totalCoinsDisbursed - podiumCoinsDisbursed;
    const settledCount = rewardsData.filter((r: any) => r.status === "SETTLED").length;
    const pendingCount = rewardsData.filter((r: any) => r.status === "PENDING").length;
    const totalEligibleRewards = rewardsData.length;
    const settlementRate = totalEligibleRewards > 0 ? this.roundToTwo((settledCount / totalEligibleRewards) * 100) : 100;
    const settlementStatus: RewardIntelligenceData["settlementStatus"] =
      totalEligibleRewards === 0 ? "NOT_APPLICABLE" : pendingCount === 0 ? "ALL_SETTLED" : "PENDING_SETTLEMENT";

    const rewards: RewardIntelligenceData = {
      totalCoinsDisbursed,
      podiumCoinsDisbursed,
      participationCoinsDisbursed,
      settledCount,
      pendingCount,
      settlementRate,
      settlementStatus,
    };

    // 10. Certificate Intelligence
    const { data: certRows } = await (supabase as any)
      .from("live_test_certificates")
      .select("*")
      .eq("event_id", eventId);

    const certsData = certRows || [];
    const totalCertificatesIssued = certsData.length;
    const meritCerts = certsData.filter((c: any) => c.certificate_type === "MERIT" || c.tier === "MERIT").length;
    const excellenceCerts = certsData.filter((c: any) => c.certificate_type === "EXCELLENCE" || c.tier === "EXCELLENCE").length;
    const participationCerts = totalCertificatesIssued - meritCerts - excellenceCerts;

    const certificates: CertificateIntelligenceData = {
      totalCertificatesIssued,
      tierCounts: {
        merit: meritCerts,
        excellence: excellenceCerts,
        participation: Math.max(0, participationCerts),
      },
      verificationScanCount: certsData.reduce((sum: number, c: any) => sum + (c.verification_count || 0), 0),
    };

    // 11. Achievement Intelligence
    const { data: achievementRows } = await (supabase as any)
      .from("live_test_achievement_awards")
      .select("id, achievement_id, badge_id, badges(name, category)")
      .eq("event_id", eventId);

    const achievementsData = achievementRows || [];
    const totalAchievementsAwarded = achievementsData.length;
    let rankBased = 0;
    let accuracyBased = 0;
    let speedBased = 0;
    let streakBased = 0;

    const badgeCounts = new Map<string, { name: string; count: number }>();
    for (const ach of achievementsData) {
      const category = (ach as any).badges?.category || "RANK_BASED";
      if (category.includes("RANK") || category.includes("PODIUM")) rankBased++;
      else if (category.includes("ACCURACY") || category.includes("PERFECT")) accuracyBased++;
      else if (category.includes("SPEED") || category.includes("FAST")) speedBased++;
      else streakBased++;

      if (ach.badge_id) {
        const bName = (ach as any).badges?.name || "Competition Badge";
        const current = badgeCounts.get(ach.badge_id) || { name: bName, count: 0 };
        current.count++;
        badgeCounts.set(ach.badge_id, current);
      }
    }

    const topBadgeAwards = Array.from(badgeCounts.entries())
      .map(([badgeId, val]) => ({
        badgeId,
        badgeName: val.name,
        awardCount: val.count,
      }))
      .sort((a, b) => b.awardCount - a.awardCount)
      .slice(0, 5);

    const achievements: AchievementIntelligenceData = {
      totalAchievementsAwarded,
      categoryCounts: {
        rankBased,
        accuracyBased,
        speedBased,
        streakBased,
      },
      topBadgeAwards,
    };

    // 12. Retention Dynamics
    const userIds = validAttempts.map((a: any) => a.user_id);
    let firstTimeCount = 0;
    let repeatCount = 0;

    if (userIds.length > 0) {
      // Check historical attempts prior to this event
      const { data: priorAttempts } = await (supabase as any)
        .from("test_attempts")
        .select("user_id")
        .in("user_id", userIds)
        .neq("event_id", eventId);

      const repeatUserSet = new Set((priorAttempts || []).map((p: any) => p.user_id));
      for (const uId of new Set(userIds)) {
        if (repeatUserSet.has(uId)) repeatCount++;
        else firstTimeCount++;
      }
    }

    const totalUniqueParticipants = firstTimeCount + repeatCount;
    const firstTimeRate = totalUniqueParticipants > 0 ? this.roundToTwo((firstTimeCount / totalUniqueParticipants) * 100) : 0;
    const repeatRate = totalUniqueParticipants > 0 ? this.roundToTwo((repeatCount / totalUniqueParticipants) * 100) : 0;

    const retention: RetentionDynamicsData = {
      firstTimeParticipantsCount: firstTimeCount,
      repeatParticipantsCount: repeatCount,
      firstTimeRate,
      repeatRate,
    };

    // 13. Operational Health & Anomaly Evaluation
    const anomalies: AnomalySignal[] = [];

    // Check High Dropout
    const isHighDropout = dropoutRate > policy.thresholds.highDropoutRatePercent;
    anomalies.push({
      code: "HIGH_DROPOUT_RATE",
      label: "High Dropout Rate",
      severity: isHighDropout ? "WARNING" : "INFO",
      description: `Observed dropout rate of ${dropoutRate}% exceeds threshold of ${policy.thresholds.highDropoutRatePercent}%.`,
      triggered: isHighDropout,
      value: dropoutRate,
      threshold: policy.thresholds.highDropoutRatePercent,
    });

    // Check High Expiry
    const isHighExpiry = expiryRate > policy.thresholds.highExpiryRatePercent;
    anomalies.push({
      code: "HIGH_EXPIRY_RATE",
      label: "High Expiry Rate",
      severity: isHighExpiry ? "WARNING" : "INFO",
      description: `Observed expiry rate of ${expiryRate}% exceeds threshold of ${policy.thresholds.highExpiryRatePercent}%.`,
      triggered: isHighExpiry,
      value: expiryRate,
      threshold: policy.thresholds.highExpiryRatePercent,
    });

    // Check Evaluation Backlog
    let evaluationLatencySeconds = 0;
    let isEvaluationBacklog = false;
    if (event.end_time) {
      const scheduledEnd = new Date(event.end_time).getTime();
      const evaluatedTime = activeSnapshot?.created_at ? new Date(activeSnapshot.created_at).getTime() : Date.now();
      evaluationLatencySeconds = Math.max(0, Math.floor((evaluatedTime - scheduledEnd) / 1000));
      if (!activeSnapshot && Date.now() - scheduledEnd > policy.thresholds.evaluationBacklogMinutes * 60 * 1000) {
        isEvaluationBacklog = true;
      }
    }
    anomalies.push({
      code: "EVALUATION_BACKLOG",
      label: "Evaluation Engine Backlog",
      severity: isEvaluationBacklog ? "CRITICAL" : "INFO",
      description: `Event has ended but ranking snapshot has not been compiled within ${policy.thresholds.evaluationBacklogMinutes} minutes.`,
      triggered: isEvaluationBacklog,
      value: Math.floor(evaluationLatencySeconds / 60),
      threshold: policy.thresholds.evaluationBacklogMinutes,
    });

    // Check Unsettled Rewards
    let settlementLagHours = 0;
    let isUnsettledRewardLag = false;
    if (isPublished && event.published_at && pendingCount > 0) {
      const pubTime = new Date(event.published_at).getTime();
      settlementLagHours = this.roundToTwo((Date.now() - pubTime) / (1000 * 60 * 60));
      if (settlementLagHours > policy.thresholds.unsettledRewardLagHours) {
        isUnsettledRewardLag = true;
      }
    }
    anomalies.push({
      code: "UNSETTLED_REWARDS",
      label: "Pending Reward Settlements",
      severity: isUnsettledRewardLag ? "WARNING" : "INFO",
      description: `${pendingCount} rewards remain unsettled ${settlementLagHours} hours after publication.`,
      triggered: isUnsettledRewardLag,
      value: settlementLagHours,
      threshold: policy.thresholds.unsettledRewardLagHours,
    });

    // Check Unusual Score Concentration
    let maxBandPercentage = 0;
    if (!privacySuppressed && scoreDistribution.scoreBands.length > 0) {
      maxBandPercentage = Math.max(...scoreDistribution.scoreBands.map((b) => b.percentage));
    }
    const isScoreConcentrated = maxBandPercentage > policy.thresholds.unusualScoreConcentrationPercent;
    anomalies.push({
      code: "UNUSUAL_SCORE_CONCENTRATION",
      label: "Unusual Score Concentration",
      severity: isScoreConcentrated ? "WARNING" : "INFO",
      description: `Single score band contains ${maxBandPercentage}% of all candidates (threshold: ${policy.thresholds.unusualScoreConcentrationPercent}%).`,
      triggered: isScoreConcentrated,
      value: maxBandPercentage,
      threshold: policy.thresholds.unusualScoreConcentrationPercent,
    });

    const isHealthy = !anomalies.some((a) => a.triggered && a.severity === "CRITICAL");

    const operationalHealth: OperationalHealthData = {
      eventStatus: event.status,
      scheduledDurationMinutes: event.duration_minutes || 60,
      evaluationLatencySeconds,
      settlementLagHours,
      anomalies,
      isHealthy,
    };

    // 14. Data Quality Diagnostics
    const qualityDetails: string[] = [];
    let overallStatus: DataQualityDiagnostics["overallStatus"] = "AVAILABLE";

    if (rankedCount === 0) {
      overallStatus = "INSUFFICIENT_DATA";
      qualityDetails.push("No candidates have been evaluated or ranked yet.");
    } else if (privacySuppressed) {
      overallStatus = "INSUFFICIENT_DATA";
      qualityDetails.push(`Cohort size (${rankedCount}) is below privacy threshold (${policy.thresholds.minimumPrivacyCohortSize}).`);
    }

    if (sectionTopic.topicStatus === "TOPIC_DATA_INSUFFICIENT") {
      qualityDetails.push(`Topic mapping incomplete: ${this.roundToTwo(sectionTopic.mappedQuestionsRatio * 100)}% mapped.`);
    }

    const dataQuality: DataQualityDiagnostics = {
      overallStatus,
      details: qualityDetails,
    };

    return {
      eventId: event.id,
      eventTitle: event.title,
      examId: event.exam_id || undefined,
      examTitle: event.exams?.title || undefined,
      status: event.status,
      isPublished,
      totalMarks: event.total_marks || 100,
      durationMinutes: event.duration_minutes || 60,
      activeSnapshotId: activeSnapshot?.id,
      evaluatedAt: activeSnapshot?.created_at,
      publishedAt: event.published_at || undefined,
      funnel,
      scoreDistribution,
      accuracyDistribution,
      rankingPercentile,
      timing,
      sectionTopic,
      rewards,
      certificates,
      achievements,
      retention,
      operationalHealth,
      dataQuality,
      policyVersion: policy.policyVersion,
    };
  }

  /**
   * Compares two events with strict compatibility rules.
   */
  public static async getCrossEventComparison(
    event1Id: string,
    event2Id: string,
    policy: CompetitionAnomalyPolicy = ADMIN_COMPETITION_INTELLIGENCE_POLICY_V1
  ): Promise<CrossEventComparisonResult> {
    const [e1, e2] = await Promise.all([
      this.getEventCompetitionIntelligence(event1Id, policy),
      this.getEventCompetitionIntelligence(event2Id, policy),
    ]);

    // Comparability Rules Enforcement
    if (policy.comparabilityRules.strictExamMatch && e1.examId !== e2.examId) {
      return {
        compatibilityStatus: "COMPARISON_NOT_COMPARABLE",
        reasonIfNotComparable: `Exam mismatch: Event 1 belongs to "${e1.examTitle || e1.examId}" while Event 2 belongs to "${e2.examTitle || e2.examId}".`,
        event1: e1,
        event2: e2,
      };
    }

    if (policy.comparabilityRules.strictTotalMarksMatch && e1.totalMarks !== e2.totalMarks) {
      return {
        compatibilityStatus: "COMPARISON_NOT_COMPARABLE",
        reasonIfNotComparable: `Maximum marks mismatch: Event 1 is scored out of ${e1.totalMarks} while Event 2 is scored out of ${e2.totalMarks}.`,
        event1: e1,
        event2: e2,
      };
    }

    if (policy.comparabilityRules.requirePublishedStatus && (!e1.isPublished || !e2.isPublished)) {
      return {
        compatibilityStatus: "COMPARISON_NOT_COMPARABLE",
        reasonIfNotComparable: `Both events must be in PUBLISHED status for cross-competition comparability.`,
        event1: e1,
        event2: e2,
      };
    }

    const deltas = {
      turnoutRateDelta: this.roundToTwo(e2.funnel.turnoutRate - e1.funnel.turnoutRate),
      completionRateDelta: this.roundToTwo(e2.funnel.completionRate - e1.funnel.completionRate),
      meanScoreDelta:
        e1.scoreDistribution.meanScore != null && e2.scoreDistribution.meanScore != null
          ? this.roundToTwo(e2.scoreDistribution.meanScore - e1.scoreDistribution.meanScore)
          : 0,
      medianScoreDelta:
        e1.scoreDistribution.medianScore != null && e2.scoreDistribution.medianScore != null
          ? this.roundToTwo(e2.scoreDistribution.medianScore - e1.scoreDistribution.medianScore)
          : 0,
      durationMinutesDelta: this.roundToTwo(e2.timing.medianDurationMinutes - e1.timing.medianDurationMinutes),
      firstTimeRateDelta: this.roundToTwo(e2.retention.firstTimeRate - e1.retention.firstTimeRate),
    };

    return {
      compatibilityStatus: "COMPARABLE",
      event1: e1,
      event2: e2,
      deltas,
    };
  }

  /**
   * Authorized Candidate Drill-Down with Mandatory Audit Logging.
   */
  public static async getCandidateDrillDown(
    eventId: string,
    adminUserId: string
  ): Promise<CandidateDrillDownItem[]> {
    const supabase = createAdminServerSupabaseClient();

    // Log admin audit action
    await (supabase as any).from("admin_audit_logs").insert({
      actor_id: adminUserId,
      actor_email: "admin@couragelibrary.internal",
      action_type: "ADMIN_CANDIDATE_INTELLIGENCE_INSPECT",
      target_entity: "live_test_events",
      target_id: eventId,
      reason: "Admin candidate intelligence drill-down inspection",
      new_value: { timestamp: new Date().toISOString() },
    });

    const { data: activeSnapshot } = await (supabase as any)
      .from("live_test_ranking_snapshots")
      .select("id")
      .eq("event_id", eventId)
      .eq("is_active", true)
      .maybeSingle();

    if (!activeSnapshot) return [];

    const { data: entries } = await (supabase as any)
      .from("live_test_leaderboard_entries")
      .select("*, user_profiles(full_name, email)")
      .eq("snapshot_id", activeSnapshot.id)
      .order("rank", { ascending: true })
      .limit(100);

    const items: CandidateDrillDownItem[] = [];
    for (const e of entries || []) {
      items.push({
        userId: e.user_id,
        fullName: e.user_profiles?.full_name || "Candidate",
        email: e.user_profiles?.email || undefined,
        rank: e.rank,
        score: Number(e.score),
        percentile: Number(e.percentile),
        accuracy: Number(e.accuracy || 0),
        durationMinutes: this.roundToTwo((e.time_spent_seconds || 0) / 60),
        submissionMode: "EXPLICIT",
        submittedAt: e.created_at,
        coinsEarned: 0,
        badgesEarned: [],
      });
    }

    return items;
  }

  /**
   * Helper: Compiles sectional and topic level performance.
   */
  private static async compileSectionTopicIntelligence(
    eventId: string,
    mockTestId?: string
  ): Promise<SectionSubjectTopicIntelligence> {
    const supabase = createAdminServerSupabaseClient();

    if (!mockTestId) {
      return {
        sections: [],
        subjects: [],
        topics: [],
        topicStatus: "TOPIC_DATA_INSUFFICIENT",
        mappedQuestionsRatio: 0,
      };
    }

    const { data: mockSections } = await (supabase as any)
      .from("mock_sections")
      .select("id, name, total_questions")
      .eq("mock_test_id", mockTestId);

    const sections: SectionIntelligenceItem[] = [];
    for (const s of mockSections || []) {
      sections.push({
        sectionId: s.id,
        sectionName: s.name,
        totalQuestions: s.total_questions || 0,
        avgMarks: 0,
        avgAccuracy: 0,
        avgTimeMinutes: 0,
      });
    }

    // Check Question Topic Mappings
    const { data: questions } = await (supabase as any)
      .from("mock_questions")
      .select("id, question_id, questions(topic_id, topics(id, name, subject_id, subjects(id, name)))")
      .eq("mock_test_id", mockTestId);

    const qList = questions || [];
    const totalQ = qList.length;
    let mappedQ = 0;
    const topicMap = new Map<string, { name: string; count: number }>();
    const subjectMap = new Map<string, { name: string; count: number }>();

    for (const q of qList) {
      const qObj = q.questions;
      if (qObj?.topic_id) {
        mappedQ++;
        const tName = qObj.topics?.name || "Topic";
        const tCur = topicMap.get(qObj.topic_id) || { name: tName, count: 0 };
        tCur.count++;
        topicMap.set(qObj.topic_id, tCur);

        if (qObj.topics?.subject_id) {
          const sName = qObj.topics?.subjects?.name || "Subject";
          const sCur = subjectMap.get(qObj.topics.subject_id) || { name: sName, count: 0 };
          sCur.count++;
          subjectMap.set(qObj.topics.subject_id, sCur);
        }
      }
    }

    const mappedQuestionsRatio = totalQ > 0 ? mappedQ / totalQ : 0;
    const topicStatus = mappedQuestionsRatio >= 0.5 ? "TOPIC_DATA_AVAILABLE" : "TOPIC_DATA_INSUFFICIENT";

    const topics: TopicIntelligenceItem[] = Array.from(topicMap.entries()).map(([topicId, val]) => ({
      topicId,
      topicName: val.name,
      totalQuestions: val.count,
      avgAccuracy: 0,
    }));

    const subjects: SubjectIntelligenceItem[] = Array.from(subjectMap.entries()).map(([subjectId, val]) => ({
      subjectId,
      subjectName: val.name,
      totalQuestions: val.count,
      avgAccuracy: 0,
    }));

    return {
      sections,
      subjects,
      topics,
      topicStatus,
      mappedQuestionsRatio,
    };
  }

  // --- STATISTICAL UTILITIES ---

  private static calculateMean(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }

  private static calculateStdDev(values: number[], mean: number): number {
    if (values.length <= 1) return 0;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / (values.length - 1);
    return Math.sqrt(variance);
  }

  private static calculatePercentile(sortedValues: number[], p: number): number {
    if (sortedValues.length === 0) return 0;
    if (sortedValues.length === 1) return sortedValues[0];
    const index = (p / 100) * (sortedValues.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;
    if (upper >= sortedValues.length) return sortedValues[sortedValues.length - 1];
    return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
  }

  private static roundToTwo(num: number): number {
    return Math.round((num + Number.EPSILON) * 100) / 100;
  }
}
