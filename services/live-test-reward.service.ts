import { createServerSupabaseClient, createAdminServerSupabaseClient } from "@/lib/supabase/server";
import {
  LiveTestRewardPolicy,
  LiveTestRewardSettlement,
  LiveTestRewardDistributionResult,
  CandidateEventRewardSummary,
} from "@/types/live-test";

export class LiveTestRewardService {
  /**
   * Authoritative default policies in case DB is unseeded.
   */
  public static readonly DEFAULT_GLOBAL_POLICIES: Omit<LiveTestRewardPolicy, "id" | "created_at" | "updated_at">[] = [
    { live_test_event_id: null, policy_code: "GLOBAL_LIVE_POLICY_V1", tier_name: "PODIUM_RANK_1", min_rank: 1, max_rank: 1, min_percentile: null, max_percentile: null, coin_reward: 500, policy_version: 1, is_active: true },
    { live_test_event_id: null, policy_code: "GLOBAL_LIVE_POLICY_V1", tier_name: "PODIUM_RANK_2", min_rank: 2, max_rank: 2, min_percentile: null, max_percentile: null, coin_reward: 300, policy_version: 1, is_active: true },
    { live_test_event_id: null, policy_code: "GLOBAL_LIVE_POLICY_V1", tier_name: "PODIUM_RANK_3", min_rank: 3, max_rank: 3, min_percentile: null, max_percentile: null, coin_reward: 200, policy_version: 1, is_active: true },
    { live_test_event_id: null, policy_code: "GLOBAL_LIVE_POLICY_V1", tier_name: "TOP_10", min_rank: 4, max_rank: 10, min_percentile: null, max_percentile: null, coin_reward: 100, policy_version: 1, is_active: true },
    { live_test_event_id: null, policy_code: "GLOBAL_LIVE_POLICY_V1", tier_name: "TOP_50", min_rank: 11, max_rank: 50, min_percentile: null, max_percentile: null, coin_reward: 50, policy_version: 1, is_active: true },
    { live_test_event_id: null, policy_code: "GLOBAL_LIVE_POLICY_V1", tier_name: "TOP_100", min_rank: 51, max_rank: 100, min_percentile: null, max_percentile: null, coin_reward: 25, policy_version: 1, is_active: true },
    { live_test_event_id: null, policy_code: "GLOBAL_LIVE_POLICY_V1", tier_name: "TOP_1_PERCENT", min_rank: null, max_rank: null, min_percentile: 99.00, max_percentile: 100.00, coin_reward: 30, policy_version: 1, is_active: true },
    { live_test_event_id: null, policy_code: "GLOBAL_LIVE_POLICY_V1", tier_name: "TOP_5_PERCENT", min_rank: null, max_rank: null, min_percentile: 95.00, max_percentile: 98.99, coin_reward: 15, policy_version: 1, is_active: true },
    { live_test_event_id: null, policy_code: "GLOBAL_LIVE_POLICY_V1", tier_name: "TOP_10_PERCENT", min_rank: null, max_rank: null, min_percentile: 90.00, max_percentile: 94.99, coin_reward: 10, policy_version: 1, is_active: true },
    { live_test_event_id: null, policy_code: "GLOBAL_LIVE_POLICY_V1", tier_name: "PARTICIPANT_BASE", min_rank: null, max_rank: null, min_percentile: null, max_percentile: null, coin_reward: 5, policy_version: 1, is_active: true },
  ];

  /**
   * Distributes rank and merit rewards for a published Live Test Event.
   * Follows Model A: Publication Finality with Positive Top-Up Adjustments.
   */
  static async distributeLiveEventRewards(
    eventId: string,
    adminId?: string
  ): Promise<LiveTestRewardDistributionResult> {
    const adminSb = createAdminServerSupabaseClient();
    const startTime = Date.now();

    // 1. Attempt DB RPC execution first
    try {
      const { data: rpcData, error: rpcError } = await (adminSb.rpc as any)(
        "fn_distribute_live_test_rewards",
        {
          p_event_id: eventId,
          p_admin_id: adminId || null,
        }
      );

      if (!rpcError && rpcData && rpcData.success) {
        return {
          success: true,
          eventId: rpcData.event_id,
          snapshotId: rpcData.snapshot_id,
          snapshotVersion: rpcData.snapshot_version,
          processedCount: rpcData.processed_count,
          settledCount: rpcData.settled_count,
          topupCount: rpcData.topup_count,
          protectedCount: rpcData.protected_count,
          unchangedCount: rpcData.unchanged_count,
          skippedCount: rpcData.skipped_count,
          totalCoinsDistributed: rpcData.total_coins_distributed,
          executionMs: rpcData.execution_ms,
        };
      }
    } catch {
      // Fallback to service layer logic if RPC is not present
    }

    // 2. Authoritative Service-Level Execution
    // Validate Event
    const { data: event, error: eventErr } = await (adminSb as any)
      .from("live_test_events")
      .select("id, status, title")
      .eq("id", eventId)
      .maybeSingle();

    if (eventErr || !event) {
      return { success: false, error: "Live test event not found." };
    }

    if (event.status !== "PUBLISHED" && !adminId) {
      return { success: false, error: "Rewards can only be distributed for PUBLISHED events." };
    }

    // Fetch Active Snapshot
    const { data: snapshot } = await (adminSb as any)
      .from("live_test_ranking_snapshots")
      .select("*")
      .eq("live_test_event_id", eventId)
      .eq("is_active", true)
      .order("snapshot_version", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!snapshot) {
      return { success: false, error: "No active ranking snapshot found for this event." };
    }

    const settlementVersion = snapshot.snapshot_version || 1;

    // Fetch Leaderboard Entries
    const { data: entries } = await (adminSb as any)
      .from("live_test_leaderboard_entries")
      .select("*")
      .eq("snapshot_id", snapshot.id)
      .order("rank", { ascending: true });

    if (!entries || entries.length === 0) {
      return {
        success: true,
        eventId,
        snapshotId: snapshot.id,
        snapshotVersion: settlementVersion,
        processedCount: 0,
        settledCount: 0,
        topupCount: 0,
        protectedCount: 0,
        unchangedCount: 0,
        skippedCount: 0,
        totalCoinsDistributed: 0,
        executionMs: Date.now() - startTime,
      };
    }

    // Fetch Policies
    const policies = await this.getRewardPolicies(eventId);

    let settledCount = 0;
    let topupCount = 0;
    let protectedCount = 0;
    let unchangedCount = 0;
    let skippedCount = 0;
    let totalCoinsDistributed = 0;

    for (const entry of entries) {
      // Evaluate matching tier
      const { tierName, coinReward } = this.matchRewardTier(entry.rank, entry.percentile, policies);

      // Check existing settlements for this user on this event
      const { data: priorSettlements } = await (adminSb as any)
        .from("live_test_reward_settlements")
        .select("coins_awarded, settlement_version, settlement_status")
        .eq("live_test_event_id", eventId)
        .eq("user_id", entry.user_id);

      const alreadySettledThisVersion = (priorSettlements || []).some(
        (s: any) => s.settlement_version === settlementVersion
      );

      if (alreadySettledThisVersion) {
        skippedCount++;
        continue;
      }

      const priorCoinsTotal = (priorSettlements || []).reduce(
        (acc: number, s: any) => acc + (s.coins_awarded || 0),
        0
      );

      const idempotencyKey = `LIVE_REWARD_${eventId}_${entry.user_id}_${tierName}_${snapshot.id}_v${settlementVersion}`;

      if (priorCoinsTotal === 0) {
        // Initial Settlement
        if (coinReward > 0) {
          const ledgerRes = await this.creditCoins(
            entry.user_id,
            eventId,
            snapshot.id,
            settlementVersion,
            coinReward,
            tierName,
            idempotencyKey,
            false,
            entry.rank,
            entry.percentile
          );

          await (adminSb as any).from("live_test_reward_settlements").insert({
            live_test_event_id: eventId,
            snapshot_id: snapshot.id,
            user_id: entry.user_id,
            attempt_id: entry.attempt_id,
            reward_tier: tierName,
            coins_awarded: coinReward,
            settlement_version: settlementVersion,
            settlement_status: "SETTLED",
            ledger_id: ledgerRes.ledgerId || null,
            idempotency_key: idempotencyKey,
            metadata: {
              rank: entry.rank,
              percentile: entry.percentile,
              total_score: entry.total_score,
              previous_entitlement: 0,
              current_entitlement: coinReward,
            },
          });

          settledCount++;
          totalCoinsDistributed += coinReward;
        } else {
          await (adminSb as any).from("live_test_reward_settlements").insert({
            live_test_event_id: eventId,
            snapshot_id: snapshot.id,
            user_id: entry.user_id,
            attempt_id: entry.attempt_id,
            reward_tier: tierName,
            coins_awarded: 0,
            settlement_version: settlementVersion,
            settlement_status: "NO_REWARD",
            ledger_id: null,
            idempotency_key: idempotencyKey,
            metadata: { rank: entry.rank, percentile: entry.percentile },
          });
        }
      } else {
        // Subsequent Errata Settlement (Model A)
        if (coinReward > priorCoinsTotal) {
          const delta = coinReward - priorCoinsTotal;
          const ledgerRes = await this.creditCoins(
            entry.user_id,
            eventId,
            snapshot.id,
            settlementVersion,
            delta,
            tierName,
            idempotencyKey,
            true,
            entry.rank,
            entry.percentile
          );

          await (adminSb as any).from("live_test_reward_settlements").insert({
            live_test_event_id: eventId,
            snapshot_id: snapshot.id,
            user_id: entry.user_id,
            attempt_id: entry.attempt_id,
            reward_tier: tierName,
            coins_awarded: delta,
            settlement_version: settlementVersion,
            settlement_status: "TOPPED_UP",
            ledger_id: ledgerRes.ledgerId || null,
            idempotency_key: idempotencyKey,
            metadata: {
              rank: entry.rank,
              percentile: entry.percentile,
              previous_entitlement: priorCoinsTotal,
              current_entitlement: coinReward,
              topup_delta: delta,
            },
          });

          topupCount++;
          totalCoinsDistributed += delta;
        } else if (coinReward < priorCoinsTotal) {
          // Model A: Protected Drop - DO NOT CLAW BACK
          await (adminSb as any).from("live_test_reward_settlements").insert({
            live_test_event_id: eventId,
            snapshot_id: snapshot.id,
            user_id: entry.user_id,
            attempt_id: entry.attempt_id,
            reward_tier: tierName,
            coins_awarded: 0,
            settlement_version: settlementVersion,
            settlement_status: "PROTECTED_DROP",
            ledger_id: null,
            idempotency_key: idempotencyKey,
            metadata: {
              rank: entry.rank,
              percentile: entry.percentile,
              reason: "ERRATA_RANK_DEMOTION_AFTER_PUBLICATION",
              previous_entitlement: priorCoinsTotal,
              current_entitlement: coinReward,
              retained_coins: priorCoinsTotal,
            },
          });

          protectedCount++;
        } else {
          // Unchanged
          await (adminSb as any).from("live_test_reward_settlements").insert({
            live_test_event_id: eventId,
            snapshot_id: snapshot.id,
            user_id: entry.user_id,
            attempt_id: entry.attempt_id,
            reward_tier: tierName,
            coins_awarded: 0,
            settlement_version: settlementVersion,
            settlement_status: "UNCHANGED",
            ledger_id: null,
            idempotency_key: idempotencyKey,
            metadata: {
              rank: entry.rank,
              percentile: entry.percentile,
              retained_coins: priorCoinsTotal,
            },
          });

          unchangedCount++;
        }
      }
    }

    const executionMs = Date.now() - startTime;

    // Audit log
    await (adminSb as any).from("live_test_audit_logs").insert({
      live_test_event_id: eventId,
      action: "REWARDS_DISTRIBUTED",
      actor_id: adminId || null,
      payload: {
        snapshot_id: snapshot.id,
        snapshot_version: settlementVersion,
        processed_count: entries.length,
        settled_count: settledCount,
        topup_count: topupCount,
        protected_count: protectedCount,
        unchanged_count: unchangedCount,
        skipped_count: skippedCount,
        total_coins_distributed: totalCoinsDistributed,
        execution_ms: executionMs,
      },
    });

    return {
      success: true,
      eventId,
      snapshotId: snapshot.id,
      snapshotVersion: settlementVersion,
      processedCount: entries.length,
      settledCount,
      topupCount,
      protectedCount,
      unchangedCount,
      skippedCount,
      totalCoinsDistributed,
      executionMs,
    };
  }

  /**
   * Evaluates active reward policies and returns the highest qualifying tier.
   */
  public static matchRewardTier(
    rank: number,
    percentile: number,
    policies: LiveTestRewardPolicy[]
  ): { tierName: string; coinReward: number } {
    let bestTier = "NO_REWARD";
    let bestCoins = 0;

    for (const policy of policies) {
      if (!policy.is_active) continue;

      // Exact Rank Match
      if (policy.min_rank !== null && policy.max_rank !== null) {
        if (rank >= policy.min_rank && rank <= policy.max_rank) {
          if (policy.coin_reward > bestCoins) {
            bestCoins = policy.coin_reward;
            bestTier = policy.tier_name;
          }
        }
      }
      // Percentile Range Match
      else if (policy.min_percentile !== null && policy.max_percentile !== null) {
        if (percentile >= Number(policy.min_percentile) && percentile <= Number(policy.max_percentile)) {
          if (policy.coin_reward > bestCoins) {
            bestCoins = policy.coin_reward;
            bestTier = policy.tier_name;
          }
        }
      }
      // Participant Base
      else if (policy.tier_name === "PARTICIPANT_BASE") {
        if (policy.coin_reward > bestCoins) {
          bestCoins = policy.coin_reward;
          bestTier = policy.tier_name;
        }
      }
    }

    return { tierName: bestTier, coinReward: bestCoins };
  }

  /**
   * Helper to credit coins to coin_wallets and record immutable coin_ledger entry.
   */
  private static async creditCoins(
    userId: string,
    eventId: string,
    snapshotId: string,
    settlementVersion: number,
    amount: number,
    tierName: string,
    idempotencyKey: string,
    isTopup: boolean,
    rank: number,
    percentile: number
  ): Promise<{ ledgerId: string | null }> {
    const adminSb = createAdminServerSupabaseClient();

    // 1. Upsert wallet
    await (adminSb as any)
      .from("coin_wallets")
      .upsert({ user_id: userId, current_balance: 0, lifetime_earned: 0, lifetime_spent: 0 }, { onConflict: "user_id" });

    // 2. Fetch current wallet
    const { data: wallet } = await (adminSb as any)
      .from("coin_wallets")
      .select("current_balance, lifetime_earned")
      .eq("user_id", userId)
      .maybeSingle();

    const curBal = Number(wallet?.current_balance || 0);
    const curEarned = Number(wallet?.lifetime_earned || 0);
    const newBal = curBal + amount;
    const newEarned = curEarned + amount;

    // 3. Insert into coin_ledger
    const { data: ledger, error: ledgerErr } = await (adminSb as any)
      .from("coin_ledger")
      .insert({
        user_id: userId,
        transaction_type: "CREDIT",
        amount,
        direction: "CREDIT",
        balance_after: newBal,
        source_type: "LIVE_TEST_EVENT",
        source_id: eventId,
        reason_code: isTopup ? "LIVE_RANK_REWARD_TOPUP" : `LIVE_RANK_REWARD_${tierName}`,
        idempotency_key: `ledger_${idempotencyKey}`,
        metadata: {
          event_id: eventId,
          snapshot_id: snapshotId,
          snapshot_version: settlementVersion,
          rank,
          percentile,
          reward_tier: tierName,
          is_topup: isTopup,
        },
      })
      .select("id")
      .maybeSingle();

    if (ledgerErr) {
      console.warn("[LiveTestRewardService.creditCoins] Ledger insert warning:", ledgerErr.message);
    }

    // 4. Update wallet cache
    await (adminSb as any)
      .from("coin_wallets")
      .update({
        current_balance: newBal,
        lifetime_earned: newEarned,
        last_transaction_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);

    return { ledgerId: ledger?.id || null };
  }

  /**
   * Fetches active reward policies for an event, falling back to global defaults.
   */
  static async getRewardPolicies(eventId?: string): Promise<LiveTestRewardPolicy[]> {
    const adminSb = createAdminServerSupabaseClient();

    let query = (adminSb as any)
      .from("live_test_reward_policies")
      .select("*")
      .eq("is_active", true);

    if (eventId) {
      query = query.or(`live_test_event_id.eq.${eventId},live_test_event_id.is.null`);
    } else {
      query = query.is("live_test_event_id", null);
    }

    const { data: policies } = await query;

    if (!policies || policies.length === 0) {
      return this.DEFAULT_GLOBAL_POLICIES.map((p, idx) => ({
        ...p,
        id: `default-policy-${idx}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));
    }

    // Prefer event-specific policies over global defaults
    const eventSpecific = (policies as LiveTestRewardPolicy[]).filter((p) => p.live_test_event_id === eventId);
    if (eventSpecific.length > 0) {
      return eventSpecific;
    }

    return policies as LiveTestRewardPolicy[];
  }

  /**
   * Retrieves full reward summary for a candidate on a Live Test Event.
   */
  static async getCandidateRewardSummary(
    eventId: string,
    overrideUserId?: string
  ): Promise<CandidateEventRewardSummary | null> {
    let userId = overrideUserId;
    if (!userId) {
      try {
        const supabase = await createServerSupabaseClient();
        const { data: { user } } = await supabase.auth.getUser();
        userId = user?.id;
      } catch {
        // Outside auth context
      }
    }

    if (!userId) return null;

    const adminSb = createAdminServerSupabaseClient();

    // 1. Fetch settlements
    const { data: settlements } = await (adminSb as any)
      .from("live_test_reward_settlements")
      .select("*")
      .eq("live_test_event_id", eventId)
      .eq("user_id", userId)
      .order("settlement_version", { ascending: false });

    // 2. Fetch Leaderboard Entry
    const { data: entry } = await (adminSb as any)
      .from("live_test_leaderboard_entries")
      .select("rank, percentile, attempt_id")
      .eq("live_test_event_id", eventId)
      .eq("user_id", userId)
      .maybeSingle();

    // 3. Fetch completion reward event if any
    const { data: compEvent } = await (adminSb as any)
      .from("gamification_events")
      .select("actual_coins_awarded")
      .eq("source_type", "MOCK_TEST")
      .eq("user_id", userId)
      .maybeSingle();

    const rankCoins = (settlements || []).reduce(
      (acc: number, s: any) => acc + (s.coins_awarded || 0),
      0
    );
    const completionCoins = compEvent?.actual_coins_awarded || 0;
    const latestSettlement = settlements && settlements.length > 0 ? settlements[0] : null;

    return {
      eventId,
      userId,
      completionCoins,
      rankCoins,
      totalCoinsEarned: completionCoins + rankCoins,
      latestSettlementStatus: latestSettlement?.settlement_status || null,
      rewardTier: latestSettlement?.reward_tier || null,
      rank: entry?.rank || null,
      percentile: entry?.percentile || null,
      isSettled: Boolean(latestSettlement),
      settlements: (settlements as LiveTestRewardSettlement[]) || [],
    };
  }

  /**
   * Retrieves all reward settlements for an event (Admin View).
   */
  static async getEventRewardSettlements(
    eventId: string,
    options: { limit?: number; offset?: number } = {}
  ): Promise<{ settlements: LiveTestRewardSettlement[]; totalCount: number }> {
    const adminSb = createAdminServerSupabaseClient();
    const limit = options.limit || 50;
    const offset = options.offset || 0;

    const { data, count, error } = await (adminSb as any)
      .from("live_test_reward_settlements")
      .select("*", { count: "exact" })
      .eq("live_test_event_id", eventId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return { settlements: [], totalCount: 0 };
    }

    return {
      settlements: (data as LiveTestRewardSettlement[]) || [],
      totalCount: count || 0,
    };
  }
}
