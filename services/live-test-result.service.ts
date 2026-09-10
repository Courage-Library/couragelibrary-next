import { createServerSupabaseClient, createAdminServerSupabaseClient } from "@/lib/supabase/server";
import {
  LiveTestRankingSnapshot,
  LiveTestLeaderboardEntry,
  LiveTestEvaluationResult,
  LiveTestPublicationResult,
  LiveTestCandidateScorecard,
  LiveEventStatus,
} from "@/types/live-test";
import { MistakeService } from "@/services/mistake.service";
import { GamificationService } from "@/services/gamification.service";

export class LiveTestResultService {
  /**
   * Executes authoritative batch evaluation of a Live Test Event via Migration 47 RPC fn_evaluate_live_test_event.
   * On completion, feeds wrong answers to Mistake Vault and triggers CL Coin completion rewards.
   */
  static async evaluateLiveEvent(
    eventId: string,
    actorId: string
  ): Promise<LiveTestEvaluationResult> {
    const adminSb = createAdminServerSupabaseClient();

    const { data, error } = await (adminSb.rpc as any)("fn_evaluate_live_test_event", {
      p_event_id: eventId,
      p_actor_id: actorId,
    });

    if (error || !data) {
      return {
        success: false,
        error: error?.message || "Evaluation RPC failed.",
      };
    }

    const res = data as any;
    if (!res.success) {
      return {
        success: false,
        code: res.code,
        error: res.message || "Evaluation failed.",
      };
    }

    // Background asynchronous bridges: Mistake Vault & CL Coin completion rewards
    // Executed non-blocking so RPC response is instantaneous
    this.syncMistakesAndRewards(eventId).catch((err) => {
      console.error("[LiveTestResultService.evaluateLiveEvent] Background sync notice:", err);
    });

    return {
      success: true,
      eventId: res.event_id,
      status: res.status,
      snapshotId: res.snapshot_id,
      snapshotVersion: res.snapshot_version,
      evaluatedCount: res.evaluated_count,
      highestScore: Number(res.highest_score || 0),
      averageScore: Number(res.average_score || 0),
    };
  }

  /**
   * Internal worker to synchronize Mistake Vault and CL Coin completion rewards post-evaluation.
   */
  private static async syncMistakesAndRewards(eventId: string): Promise<void> {
    const adminSb = createAdminServerSupabaseClient();

    // 1. Fetch Event & Mock Test Details
    const { data: eventData } = await (adminSb as any)
      .from("live_test_events")
      .select("id, mock_test_id, mock_tests(id, total_questions, total_marks, mock_templates(test_type))")
      .eq("id", eventId)
      .maybeSingle();

    if (!eventData || !eventData.mock_test_id) return;
    const mt = eventData.mock_tests;
    const testType = mt?.mock_templates?.test_type || "full_length";

    // 2. Fetch all evaluated attempts for this event's mock test
    const { data: attempts } = await (adminSb as any)
      .from("test_attempts")
      .select("id, user_id, started_at, submitted_at, time_taken_seconds, status, test_results(total_score, max_score, accuracy_percentage, correct_count, incorrect_count, unanswered_count, attempted_count)")
      .eq("mock_test_id", eventData.mock_test_id)
      .in("status", ["submitted", "auto_submitted", "completed", "evaluated"]);

    if (!attempts || attempts.length === 0) return;

    // 3. Process each candidate attempt
    for (const att of attempts) {
      const tr = Array.isArray(att.test_results) ? att.test_results[0] : att.test_results;
      if (!tr) continue;

      // Award CL Coin Completion Reward (non-blocking)
      try {
        await GamificationService.awardMockCompletionReward({
          userId: att.user_id,
          attemptId: att.id,
          testId: eventData.mock_test_id,
          canonicalTestType: testType,
          totalQuestions: mt.total_questions,
          attemptedCount: tr.attempted_count,
          correctCount: tr.correct_count,
          incorrectCount: tr.incorrect_count,
          unansweredCount: tr.unanswered_count,
          timeSpentSeconds: att.time_taken_seconds || 0,
        });
      } catch (err) {
        console.warn(`[syncMistakesAndRewards] Coin reward skipped for ${att.id}:`, err);
      }

      // Record incorrect answers into Mistake Vault
      try {
        const { data: wrongAnswers } = await (adminSb as any)
          .from("attempt_answers")
          .select("mock_question_id, selected_option_key, time_spent_seconds, mock_questions(question_version_id, question_versions(question_id, question_options(id, option_key)))")
          .eq("attempt_id", att.id)
          .eq("is_correct", false);

        if (wrongAnswers && wrongAnswers.length > 0) {
          const mistakesPayload = wrongAnswers.map((w: any) => {
            const qv = w.mock_questions?.question_versions;
            const canonicalQuestionId = qv?.question_id;
            const selectedOpt = (qv?.question_options || []).find((o: any) => o.option_key === w.selected_option_key);
            return {
              questionId: canonicalQuestionId || w.mock_question_id,
              selectedOptionId: selectedOpt?.id || null,
              responseTimeSeconds: w.time_spent_seconds || 0,
              cognitiveTypeId: "UNCLASSIFIED",
            };
          }).filter((m: any) => m.questionId);

          if (mistakesPayload.length > 0) {
            await MistakeService.recordExamMistakes({
              userId: att.user_id,
              attemptId: att.id,
              mistakes: mistakesPayload,
            });
          }
        }
      } catch (err) {
        console.warn(`[syncMistakesAndRewards] Mistake sync skipped for ${att.id}:`, err);
      }
    }
  }

  /**
   * Atomically activates a specified ranking snapshot and transitions event to PUBLISHED status.
   */
  static async publishLiveEventResults(
    eventId: string,
    snapshotVersion: number,
    actorId: string,
    reason: string
  ): Promise<LiveTestPublicationResult> {
    const adminSb = createAdminServerSupabaseClient();

    const { data, error } = await (adminSb.rpc as any)("fn_publish_live_test_results", {
      p_event_id: eventId,
      p_snapshot_version: snapshotVersion,
      p_actor_id: actorId,
      p_reason: reason,
    });

    if (error || !data) {
      return {
        success: false,
        error: error?.message || "Publication RPC failed.",
      };
    }

    const res = data as any;
    if (!res.success) {
      return {
        success: false,
        code: res.code,
        error: res.message || "Publication failed.",
      };
    }

    // Phase 5E.1: Background Asynchronous Post-Publication Reward Settlement
    // Executed non-blocking so publication response is instantaneous
    import("@/services/live-test-reward.service").then(({ LiveTestRewardService }) => {
      LiveTestRewardService.distributeLiveEventRewards(eventId, actorId).catch((err) => {
        console.error("[LiveTestResultService.publishLiveEventResults] Background reward settlement notice:", err);
      });
    }).catch(() => {});

    // Phase 5E.2: Background Asynchronous Post-Publication Certificate Issuance
    import("@/services/live-test-certificate.service").then(({ LiveTestCertificateService }) => {
      LiveTestCertificateService.generateLiveEventCertificates(eventId, actorId).catch((err) => {
        console.error("[LiveTestResultService.publishLiveEventResults] Background certificate generation notice:", err);
      });
    }).catch(() => {});

    // Phase 5E.3: Background Asynchronous Post-Publication Achievement Evaluation
    import("@/services/live-test-achievement.service").then(({ LiveTestAchievementService }) => {
      LiveTestAchievementService.evaluateLiveEventAchievements(eventId, actorId).catch((err) => {
        console.error("[LiveTestResultService.publishLiveEventResults] Background achievement evaluation notice:", err);
      });
    }).catch(() => {});

    return {
      success: true,
      eventId: res.event_id,
      status: res.status,
      activeSnapshotVersion: res.active_snapshot_version,
      snapshotId: res.snapshot_id,
      totalParticipants: res.total_participants,
    };
  }

  /**
   * Recalculates results (e.g. after question errata adjustments) by generating a new snapshot version in staging.
   */
  static async recalculateLiveEventResults(
    eventId: string,
    actorId: string,
    reason: string
  ): Promise<LiveTestEvaluationResult> {
    return this.evaluateLiveEvent(eventId, actorId);
  }

  /**
   * Disqualifies/invalids an attempt and records audit reason.
   */
  static async voidLiveAttempt(
    attemptId: string,
    actorId: string,
    reason: string
  ): Promise<{ success: boolean; error?: string }> {
    const adminSb = createAdminServerSupabaseClient();

    const { data, error } = await (adminSb.rpc as any)("fn_void_live_test_attempt", {
      p_attempt_id: attemptId,
      p_actor_id: actorId,
      p_reason: reason,
    });

    if (error || !data) {
      return { success: false, error: error?.message || "Void attempt RPC failed." };
    }

    return { success: (data as any).success, error: (data as any).message };
  }

  /**
   * Retrieves candidate scorecard with complete pre-publication isolation protection.
   * If event is NOT PUBLISHED, no scores, ranks, percentiles, or question solutions are exposed.
   */
  static async getCandidateScorecard(
    slugOrId: string,
    overrideUserId?: string
  ): Promise<LiveTestCandidateScorecard | null> {
    let userId = overrideUserId;
    if (!userId) {
      try {
        const supabase = await createServerSupabaseClient();
        const { data: { user } } = await supabase.auth.getUser();
        userId = user?.id;
      } catch {
        // Outside request context
      }
    }

    const adminSb = createAdminServerSupabaseClient();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slugOrId);

    // Fetch live test event
    const eventQuery = (adminSb as any).from("live_test_events").select("*");
    if (isUuid) {
      eventQuery.eq("id", slugOrId);
    } else {
      eventQuery.eq("slug", slugOrId);
    }

    const { data: event } = await eventQuery.maybeSingle();
    if (!event) return null;

    const isPublished = event.status === "PUBLISHED";

    // Fetch mock test structure
    const { data: mockTest } = await (adminSb as any)
      .from("mock_tests")
      .select("id, title, total_questions, total_marks, duration_minutes")
      .eq("id", event.mock_test_id)
      .maybeSingle();

    const baseResponse: LiveTestCandidateScorecard = {
      isPublished,
      statusMessage: isPublished
        ? "Official All-India Results Published"
        : "Your submission has been securely recorded. Results will be available after official publication.",
      resultPublishAt: event.result_publish_at || null,
      event: {
        id: event.id,
        title: event.title,
        slug: event.slug,
        status: event.status as LiveEventStatus,
        totalQuestions: mockTest?.total_questions || event.duration_minutes || 0,
        totalMarks: Number(mockTest?.total_marks || 0),
        durationMinutes: event.duration_minutes,
      },
    };

    // Pre-publication security barrier: return only metadata & acknowledgment
    if (!isPublished || !userId) {
      return baseResponse;
    }

    // Fetch candidate's attempt
    const { data: attempt } = await (adminSb as any)
      .from("test_attempts")
      .select("id, started_at, submitted_at, time_taken_seconds, status")
      .eq("mock_test_id", event.mock_test_id)
      .eq("user_id", userId)
      .in("status", ["submitted", "auto_submitted", "completed", "evaluated"])
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!attempt) {
      return baseResponse;
    }

    // Fetch active ranking snapshot, candidate leaderboard entry, rewards, certificate, and achievements
    const [snapshotRes, entryRes, testResultRes, sectionsRes, questionsRes, answersRes, settlementsRes, compRewardRes, certRes, awardsRes] = await Promise.all([
      (adminSb as any)
        .from("live_test_ranking_snapshots")
        .select("*")
        .eq("live_test_event_id", event.id)
        .eq("is_active", true)
        .maybeSingle(),
      (adminSb as any)
        .from("live_test_leaderboard_entries")
        .select("*")
        .eq("live_test_event_id", event.id)
        .eq("user_id", userId)
        .maybeSingle(),
      (adminSb as any)
        .from("test_results")
        .select("*")
        .eq("attempt_id", attempt.id)
        .maybeSingle(),
      (adminSb as any)
        .from("mock_sections")
        .select("id, section_name, marks_per_question, negative_mark")
        .eq("mock_test_id", event.mock_test_id),
      (adminSb as any)
        .from("mock_questions")
        .select("id, question_order, mock_section_id, marks, negative_mark, mock_sections(section_name), question_versions(id, question_text, question_image_url, options_type, question_options(id, option_key, option_text, option_image_url, order_index), question_answers(correct_option_key, explanation_md), questions(canonical_topic_id, topics(name, slug)))")
        .eq("mock_test_id", event.mock_test_id)
        .order("question_order", { ascending: true }),
      (adminSb as any)
        .from("attempt_answers")
        .select("mock_question_id, selected_option_key, is_correct, evaluated_marks, time_spent_seconds")
        .eq("attempt_id", attempt.id),
      (adminSb as any)
        .from("live_test_reward_settlements")
        .select("coins_awarded, reward_tier, settlement_status, settlement_version")
        .eq("live_test_event_id", event.id)
        .eq("user_id", userId)
        .order("settlement_version", { ascending: false }),
      (adminSb as any)
        .from("gamification_events")
        .select("actual_coins_awarded")
        .eq("source_type", "MOCK_TEST")
        .eq("source_id", event.mock_test_id)
        .eq("user_id", userId)
        .maybeSingle(),
      (adminSb as any)
        .from("live_test_certificates")
        .select("id, certificate_number, verification_code, certificate_type, status, issued_at")
        .eq("live_test_event_id", event.id)
        .eq("user_id", userId)
        .eq("status", "ISSUED")
        .order("issued_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      (adminSb as any)
        .from("live_test_achievement_awards")
        .select("*, badges:badge_code(title, description, tier, icon_url)")
        .eq("live_test_event_id", event.id)
        .eq("user_id", userId)
        .eq("status", "AWARDED")
        .order("awarded_at", { ascending: false }),
    ]);

    const snapshot = snapshotRes.data as LiveTestRankingSnapshot | null;
    const entry = entryRes.data as LiveTestLeaderboardEntry | null;
    const tr = testResultRes.data as any;
    const cert = certRes?.data as any;
    const awardsData = (awardsRes?.data as any[]) || [];

    if (!tr && !entry) {
      return baseResponse;
    }

    const totalParticipants = snapshot?.total_participants || entry?.rank || 1;
    const candidateRank = entry?.rank || tr?.rank || 1;
    const candidatePercentile = entry?.percentile ?? tr?.percentile ?? 50.0;

    baseResponse.scorecard = {
      attemptId: attempt.id,
      totalScore: Number(entry?.total_score ?? tr?.total_score ?? 0),
      maxScore: Number(entry?.max_score ?? tr?.max_score ?? mockTest?.total_marks ?? 0),
      accuracyPercentage: Number(entry?.accuracy_percentage ?? tr?.accuracy_percentage ?? 0),
      correctCount: entry?.correct_count ?? tr?.correct_count ?? 0,
      incorrectCount: entry?.incorrect_count ?? tr?.incorrect_count ?? 0,
      unansweredCount: entry?.unanswered_count ?? tr?.unanswered_count ?? 0,
      timeSpentSeconds: entry?.time_spent_seconds ?? tr?.time_spent_seconds ?? attempt.time_taken_seconds ?? 0,
      rank: candidateRank,
      percentile: Number(candidatePercentile),
      rankedCandidates: totalParticipants,
      submittedAt: attempt.submitted_at || new Date().toISOString(),
    };

    // Populate reward summary
    const settlements = (settlementsRes?.data as any[]) || [];
    const rankCoins = settlements.reduce((acc, s) => acc + (s.coins_awarded || 0), 0);
    const completionCoins = compRewardRes?.data?.actual_coins_awarded || 0;
    const latestSettlement = settlements.length > 0 ? settlements[0] : null;

    baseResponse.reward = {
      completionCoins,
      rankCoins,
      totalCoins: completionCoins + rankCoins,
      rewardTier: latestSettlement?.reward_tier || null,
      status: latestSettlement?.settlement_status || (completionCoins > 0 ? "SETTLED" : null),
    };

    // Populate certificate summary
    if (cert) {
      baseResponse.certificate = {
        id: cert.id,
        certificateNumber: cert.certificate_number,
        verificationCode: cert.verification_code,
        certificateType: cert.certificate_type,
        status: cert.status,
        issuedAt: cert.issued_at,
      };
    } else {
      baseResponse.certificate = null;
    }

    // Populate achievements summary
    baseResponse.achievements = awardsData.map((a: any) => ({
      id: a.id,
      user_id: a.user_id,
      badge_code: a.badge_code,
      definition_id: a.definition_id,
      live_test_event_id: a.live_test_event_id,
      snapshot_id: a.snapshot_id,
      attempt_id: a.attempt_id,
      evidence_json: a.evidence_json || {},
      achieved_rank: a.achieved_rank,
      achieved_percentile: a.achieved_percentile,
      achieved_score: a.achieved_score,
      status: a.status,
      idempotency_key: a.idempotency_key,
      awarded_at: a.awarded_at,
      created_at: a.created_at,
      updated_at: a.updated_at,
      badge_title: a.badges?.title,
      badge_description: a.badges?.description,
      badge_tier: a.badges?.tier,
      badge_icon: a.badges?.icon_url,
    }));

    // Review questions & solutions
    const answersList = (answersRes.data as any[]) || [];
    const answersMap = new Map<string, any>();
    answersList.forEach((a) => answersMap.set(a.mock_question_id, a));

    const rawQuestions = (questionsRes.data as any[]) || [];
    baseResponse.reviewQuestions = rawQuestions.map((mq: any) => {
      const qv = mq.question_versions;
      const ans = answersMap.get(mq.id);
      const opts = (qv?.question_options || [])
        .sort((a: any, b: any) => (a.order_index || 0) - (b.order_index || 0))
        .map((o: any) => ({
          key: o.option_key,
          text: o.option_text || "",
          imageUrl: o.option_image_url || null,
        }));

      const qa = Array.isArray(qv?.question_answers) ? qv?.question_answers[0] : qv?.question_answers;
      return {
        mockQuestionId: mq.id,
        questionOrder: mq.question_order,
        sectionName: mq.mock_sections?.section_name || "General",
        questionText: qv?.question_text || "",
        questionImageUrl: qv?.question_image_url || null,
        optionsType: qv?.options_type || "text",
        options: opts,
        selectedOption: ans?.selected_option_key || null,
        correctOption: qa?.correct_option_key || "A",
        isCorrect: ans?.is_correct ?? false,
        marksAwarded: Number(ans?.evaluated_marks || 0),
        explanation: qa?.explanation_md || null,
        topicName: qv?.questions?.topics?.name || null,
        timeSpentSeconds: ans?.time_spent_seconds ? Number(ans.time_spent_seconds) : undefined,
      };
    });

    // Security watermark
    baseResponse.securityWatermark = {
      maskedId: `User#${userId.slice(0, 6).toUpperCase()}`,
      attemptIdShort: attempt.id.slice(0, 8),
      timestamp: new Date().toISOString().replace("T", " ").slice(0, 19) + " IST",
    };

    return baseResponse;
  }

  /**
   * Retrieves official All-India Leaderboard for a published live test event.
   */
  static async getLiveTestLeaderboard(
    eventIdOrSlug: string,
    page: number = 1,
    limit: number = 50,
    currentUserId?: string
  ): Promise<{
    entries: LiveTestLeaderboardEntry[];
    total: number;
    snapshot: LiveTestRankingSnapshot | null;
    currentUserEntry?: LiveTestLeaderboardEntry | null;
  }> {
    const adminSb = createAdminServerSupabaseClient();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(eventIdOrSlug);

    // 1. Fetch Event
    const eventQuery = (adminSb as any).from("live_test_events").select("id, status");
    if (isUuid) {
      eventQuery.eq("id", eventIdOrSlug);
    } else {
      eventQuery.eq("slug", eventIdOrSlug);
    }
    const { data: event } = await eventQuery.maybeSingle();

    if (!event || event.status !== "PUBLISHED") {
      return { entries: [], total: 0, snapshot: null, currentUserEntry: null };
    }

    // 2. Fetch Active Snapshot
    const { data: snapshot } = await (adminSb as any)
      .from("live_test_ranking_snapshots")
      .select("*")
      .eq("live_test_event_id", event.id)
      .eq("is_active", true)
      .maybeSingle();

    if (!snapshot) {
      return { entries: [], total: 0, snapshot: null, currentUserEntry: null };
    }

    const offset = Math.max(0, (page - 1) * limit);

    // 3. Fetch Leaderboard Entries
    const { data: entriesData, count } = await (adminSb as any)
      .from("live_test_leaderboard_entries")
      .select("*, user_profiles(display_name, avatar_url)", { count: "exact" })
      .eq("snapshot_id", snapshot.id)
      .order("rank", { ascending: true })
      .order("time_spent_seconds", { ascending: true })
      .range(offset, offset + limit - 1);

    const rawEntries = (entriesData as any[]) || [];
    const entries: LiveTestLeaderboardEntry[] = rawEntries.map((r: any) => {
      const rawName = r.user_profiles?.display_name || "Aspirant";
      const maskedName = rawName.length > 2
        ? rawName[0] + "*".repeat(Math.min(5, rawName.length - 2)) + rawName[rawName.length - 1]
        : rawName[0] + "*";

      return {
        id: r.id,
        snapshot_id: r.snapshot_id,
        live_test_event_id: r.live_test_event_id,
        user_id: r.user_id,
        attempt_id: r.attempt_id,
        rank: r.rank,
        dense_rank: r.dense_rank,
        percentile: Number(r.percentile),
        total_score: Number(r.total_score),
        max_score: Number(r.max_score),
        accuracy_percentage: Number(r.accuracy_percentage),
        correct_count: r.correct_count,
        incorrect_count: r.incorrect_count,
        unanswered_count: r.unanswered_count,
        time_spent_seconds: r.time_spent_seconds,
        is_public: r.is_public,
        userName: rawName,
        maskedName,
        userAvatar: r.user_profiles?.avatar_url || null,
        isCurrentUser: currentUserId ? r.user_id === currentUserId : false,
        created_at: r.created_at,
      };
    });

    // 4. Fetch Current User Entry if not present in current page
    let currentUserEntry: LiveTestLeaderboardEntry | null = null;
    if (currentUserId) {
      const found = entries.find((e) => e.user_id === currentUserId);
      if (found) {
        currentUserEntry = found;
      } else {
        const { data: userEntryData } = await (adminSb as any)
          .from("live_test_leaderboard_entries")
          .select("*, user_profiles(display_name, avatar_url)")
          .eq("snapshot_id", snapshot.id)
          .eq("user_id", currentUserId)
          .maybeSingle();

        if (userEntryData) {
          const rawName = userEntryData.user_profiles?.display_name || "You";
          currentUserEntry = {
            id: userEntryData.id,
            snapshot_id: userEntryData.snapshot_id,
            live_test_event_id: userEntryData.live_test_event_id,
            user_id: userEntryData.user_id,
            attempt_id: userEntryData.attempt_id,
            rank: userEntryData.rank,
            dense_rank: userEntryData.dense_rank,
            percentile: Number(userEntryData.percentile),
            total_score: Number(userEntryData.total_score),
            max_score: Number(userEntryData.max_score),
            accuracy_percentage: Number(userEntryData.accuracy_percentage),
            correct_count: userEntryData.correct_count,
            incorrect_count: userEntryData.incorrect_count,
            unanswered_count: userEntryData.unanswered_count,
            time_spent_seconds: userEntryData.time_spent_seconds,
            is_public: userEntryData.is_public,
            userName: rawName,
            maskedName: rawName,
            userAvatar: userEntryData.user_profiles?.avatar_url || null,
            isCurrentUser: true,
            created_at: userEntryData.created_at,
          };
        }
      }
    }

    return {
      entries,
      total: count || snapshot.total_participants,
      snapshot,
      currentUserEntry,
    };
  }

  /**
   * Retrieves summary of all ranking snapshots for admin inspection.
   */
  static async getAdminResultsSummary(eventId: string): Promise<{
    event: any;
    snapshots: LiveTestRankingSnapshot[];
    activeSnapshot: LiveTestRankingSnapshot | null;
  }> {
    const adminSb = createAdminServerSupabaseClient();

    const [eventRes, snapshotsRes] = await Promise.all([
      (adminSb as any).from("live_test_events").select("*").eq("id", eventId).maybeSingle(),
      (adminSb as any)
        .from("live_test_ranking_snapshots")
        .select("*")
        .eq("live_test_event_id", eventId)
        .order("snapshot_version", { ascending: false }),
    ]);

    const snapshots = (snapshotsRes.data as LiveTestRankingSnapshot[]) || [];
    const activeSnapshot = snapshots.find((s) => s.is_active) || null;

    return {
      event: eventRes.data || null,
      snapshots,
      activeSnapshot,
    };
  }
}
