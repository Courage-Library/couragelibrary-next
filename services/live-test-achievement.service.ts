/**
 * COURAGE LIBRARY — PHASE 5E.3: ACHIEVEMENTS & BADGES ENGINE SERVICE
 *
 * Server-authoritative achievement evaluation, badge ownership synchronization,
 * evidence logging, errata supersession, and candidate achievements projection.
 */

import { createAdminServerSupabaseClient } from "@/lib/supabase/server";
import {
  LiveAchievementDefinition,
  LiveAchievementAward,
  CandidateAchievementSummary,
  LiveTestAchievementEvaluationResult,
  LiveTestAchievementRevokeResult,
} from "@/types/live-test";

export class LiveTestAchievementService {
  /**
   * Evaluates and awards achievements for all participants of an active event snapshot.
   */
  public static async evaluateLiveEventAchievements(
    eventId: string,
    adminId: string
  ): Promise<LiveTestAchievementEvaluationResult> {
    try {
      const adminSb = await createAdminServerSupabaseClient();
      const { data, error } = await (adminSb.rpc as any)(
        "fn_evaluate_live_test_achievements",
        {
          p_event_id: eventId,
          p_admin_id: adminId,
        }
      );

      if (error) {
        console.error("Error executing fn_evaluate_live_test_achievements:", error);
        return {
          success: false,
          eventId,
          error: error.message,
        };
      }

      const res = data as any;
      return {
        success: res?.success ?? true,
        eventId: res?.eventId || eventId,
        snapshotId: res?.snapshotId,
        evaluatedCandidates: res?.evaluatedCandidates ?? 0,
        newAwardsCount: res?.newAwardsCount ?? 0,
        supersededAwardsCount: res?.supersededAwardsCount ?? 0,
        executionMs: res?.executionMs,
      };
    } catch (err: any) {
      console.error("Failed to evaluate live event achievements:", err);
      return {
        success: false,
        eventId,
        error: err.message || "Failed to evaluate live event achievements",
      };
    }
  }

  /**
   * Revokes an individual achievement award due to disciplinary action or voided attempt.
   */
  public static async revokeAchievementAward(
    awardId: string,
    adminId: string,
    reason: string
  ): Promise<LiveTestAchievementRevokeResult> {
    try {
      const adminSb = await createAdminServerSupabaseClient();
      const { data, error } = await (adminSb.rpc as any)(
        "fn_revoke_live_test_achievement_award",
        {
          p_award_id: awardId,
          p_admin_id: adminId,
          p_reason: reason,
        }
      );

      if (error) {
        console.error("Error executing fn_revoke_live_test_achievement_award:", error);
        return {
          success: false,
          awardId,
          error: error.message,
        };
      }

      const res = data as any;
      return {
        success: res?.success ?? true,
        awardId: res?.awardId || awardId,
        badgeCode: res?.badgeCode,
        userId: res?.userId,
        status: res?.status || "REVOKED",
        badgeRemovedFromUserCollection: res?.badgeRemovedFromUserCollection,
      };
    } catch (err: any) {
      console.error("Failed to revoke achievement award:", err);
      return {
        success: false,
        awardId,
        error: err.message || "Failed to revoke achievement award",
      };
    }
  }

  /**
   * Retrieves candidate's complete achievement summary and badge collection.
   */
  public static async getCandidateAchievements(
    userId: string
  ): Promise<CandidateAchievementSummary> {
    try {
      const adminSb = await createAdminServerSupabaseClient();

      // 1. Fetch user's owned badges from user_badges joined with badges
      const { data: userBadgesData } = await (adminSb as any)
        .from("user_badges")
        .select(`
          id,
          badge_id,
          earned_at,
          badges:badge_id (
            id,
            code,
            title,
            description,
            category,
            tier,
            icon_url
          )
        `)
        .eq("user_id", userId)
        .order("earned_at", { ascending: false });

      // 2. Fetch all awards for this user
      const { data: awardsData } = await (adminSb as any)
        .from("live_test_achievement_awards")
        .select(`
          *,
          live_test_events:live_test_event_id (
            title
          ),
          badges:badge_code (
            title,
            description,
            tier,
            icon_url
          )
        `)
        .eq("user_id", userId)
        .eq("status", "AWARDED")
        .order("awarded_at", { ascending: false });

      const awards = (awardsData || []).map((a: any) => ({
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
        superseded_by_id: a.superseded_by_id,
        revocation_reason: a.revocation_reason,
        revoked_at: a.revoked_at,
        revoked_by: a.revoked_by,
        idempotency_key: a.idempotency_key,
        awarded_at: a.awarded_at,
        created_at: a.created_at,
        updated_at: a.updated_at,
        event_title: a.live_test_events?.title,
        badge_title: a.badges?.title,
        badge_description: a.badges?.description,
        badge_tier: a.badges?.tier,
        badge_icon: a.badges?.icon_url,
      })) as LiveAchievementAward[];

      // Count occurrences per badge code
      const occurrenceCountMap = new Map<string, number>();
      awards.forEach((aw) => {
        occurrenceCountMap.set(
          aw.badge_code,
          (occurrenceCountMap.get(aw.badge_code) || 0) + 1
        );
      });

      const ownedBadges = (userBadgesData || []).map((ub: any) => {
        const b = ub.badges || {};
        return {
          badgeId: ub.badge_id,
          code: b.code || "",
          title: b.title || "Badge",
          description: b.description || "",
          category: b.category || "GENERAL",
          tier: b.tier || "COMMON",
          iconUrl: b.icon_url || null,
          earnedAt: ub.earned_at,
          awardOccurrencesCount: occurrenceCountMap.get(b.code) || 1,
        };
      });

      let podiumCount = 0;
      let nationalMeritCount = 0;
      let personalBestCount = 0;
      let consistencyStreakCount = 0;
      let milestoneCount = 0;

      awards.forEach((a) => {
        if (["PODIUM_GOLD", "PODIUM_SILVER", "PODIUM_BRONZE"].includes(a.badge_code)) {
          podiumCount++;
        } else if (a.badge_code.startsWith("NATIONAL_")) {
          nationalMeritCount++;
        } else if (a.badge_code.startsWith("PERSONAL_BEST_")) {
          personalBestCount++;
        } else if (a.badge_code.startsWith("CONSISTENT_")) {
          consistencyStreakCount++;
        } else if (a.badge_code.startsWith("LIVE_TEST_") || a.badge_code === "FIRST_LIVE_TEST") {
          milestoneCount++;
        }
      });

      return {
        userId,
        totalBadgesEarned: ownedBadges.length,
        totalAwardsCount: awards.length,
        podiumCount,
        nationalMeritCount,
        personalBestCount,
        consistencyStreakCount,
        milestoneCount,
        recentAwards: awards.slice(0, 10),
        ownedBadges,
      };
    } catch (err) {
      console.error("Failed to get candidate achievements:", err);
      return {
        userId,
        totalBadgesEarned: 0,
        totalAwardsCount: 0,
        podiumCount: 0,
        nationalMeritCount: 0,
        personalBestCount: 0,
        consistencyStreakCount: 0,
        milestoneCount: 0,
        recentAwards: [],
        ownedBadges: [],
      };
    }
  }

  /**
   * Retrieves achievements unlocked by a candidate in a specific event.
   */
  public static async getCandidateEventAchievements(
    eventId: string,
    userId: string
  ): Promise<LiveAchievementAward[]> {
    try {
      const adminSb = await createAdminServerSupabaseClient();
      const { data } = await (adminSb as any)
        .from("live_test_achievement_awards")
        .select(`
          *,
          badges:badge_code (
            title,
            description,
            tier,
            icon_url
          )
        `)
        .eq("live_test_event_id", eventId)
        .eq("user_id", userId)
        .eq("status", "AWARDED")
        .order("awarded_at", { ascending: false });

      return (data || []).map((a: any) => ({
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
        superseded_by_id: a.superseded_by_id,
        revocation_reason: a.revocation_reason,
        revoked_at: a.revoked_at,
        revoked_by: a.revoked_by,
        idempotency_key: a.idempotency_key,
        awarded_at: a.awarded_at,
        created_at: a.created_at,
        updated_at: a.updated_at,
        badge_title: a.badges?.title,
        badge_description: a.badges?.description,
        badge_tier: a.badges?.tier,
        badge_icon: a.badges?.icon_url,
      })) as LiveAchievementAward[];
    } catch (err) {
      console.error("Failed to get candidate event achievements:", err);
      return [];
    }
  }

  /**
   * Retrieves all achievement awards issued for an event.
   */
  public static async getEventAchievementAwards(
    eventId: string
  ): Promise<LiveAchievementAward[]> {
    try {
      const adminSb = await createAdminServerSupabaseClient();
      const { data } = await (adminSb as any)
        .from("live_test_achievement_awards")
        .select(`
          *,
          badges:badge_code (
            title,
            description,
            tier,
            icon_url
          )
        `)
        .eq("live_test_event_id", eventId)
        .order("awarded_at", { ascending: false });

      return (data || []).map((a: any) => ({
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
        superseded_by_id: a.superseded_by_id,
        revocation_reason: a.revocation_reason,
        revoked_at: a.revoked_at,
        revoked_by: a.revoked_by,
        idempotency_key: a.idempotency_key,
        awarded_at: a.awarded_at,
        created_at: a.created_at,
        updated_at: a.updated_at,
        badge_title: a.badges?.title,
        badge_description: a.badges?.description,
        badge_tier: a.badges?.tier,
        badge_icon: a.badges?.icon_url,
      })) as LiveAchievementAward[];
    } catch (err) {
      console.error("Failed to get event achievement awards:", err);
      return [];
    }
  }

  /**
   * Retrieves all active achievement definitions.
   */
  public static async getAchievementDefinitions(): Promise<LiveAchievementDefinition[]> {
    try {
      const adminSb = await createAdminServerSupabaseClient();
      const { data } = await (adminSb as any)
        .from("live_test_achievement_definitions")
        .select(`
          *,
          badges:badge_code (
            title,
            description,
            tier,
            icon_url
          )
        `)
        .order("priority", { ascending: true });

      return (data || []).map((d: any) => ({
        id: d.id,
        badge_code: d.badge_code,
        category: d.category,
        condition_type: d.condition_type,
        condition_config: d.condition_config || {},
        is_repeatable: d.is_repeatable,
        scope: d.scope,
        priority: d.priority,
        policy_version: d.policy_version,
        is_active: d.is_active,
        created_at: d.created_at,
        updated_at: d.updated_at,
        badge_title: d.badges?.title,
        badge_description: d.badges?.description,
        badge_tier: d.badges?.tier,
        badge_icon: d.badges?.icon_url,
      })) as LiveAchievementDefinition[];
    } catch (err) {
      console.error("Failed to get achievement definitions:", err);
      return [];
    }
  }
}
