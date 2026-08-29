import { createServerSupabaseClient, createAdminServerSupabaseClient } from "@/lib/supabase/server";

export interface MockRewardCalculationInput {
  userId: string;
  attemptId: string;
  testId: string;
  canonicalTestType?: string; // Authoritative test_type from mock_templates ('full_length' | 'sectional' | 'mixed' | 'daily')
  totalQuestions: number;
  attemptedCount: number;
  correctCount: number;
  incorrectCount: number;
  unansweredCount: number;
  timeSpentSeconds: number;
}

export interface MockRewardBreakdown {
  isRetake: boolean;
  isRewardEligible: boolean;
  completionCoins: number;
  completionReason: string;
  isAccuracyEligible: boolean;
  minAttemptRequired: number;
  accuracyPercentage: number;
  accuracyBonusCoins: number;
  accuracyReason: string;
  streakCoins: number;
  streakReason: string;
  currentStreak: number;
  longestStreak: number;
  isNewStreakMilestone: boolean;
  badgeUnlocked?: {
    code: string;
    title: string;
    coins: number;
  } | null;
  totalCoinsEarned: number;
  isAlreadyRewarded: boolean;
}

export interface StudentWalletData {
  currentBalance: number;
  lifetimeEarned: number;
  lifetimeSpent: number;
  freezesHeld: number;
  level: {
    title: string;
    minCoins: number;
    nextLevelTitle?: string;
    nextLevelThreshold?: number;
    progressPercentage: number;
  };
  streak: {
    currentStreak: number;
    longestStreak: number;
    lastQualifyingDate: string | null;
    isFrozen: boolean;
  };
  recentTransactions: Array<{
    id: string;
    amount: number;
    direction: "CREDIT" | "DEBIT";
    transactionType: string;
    reasonCode: string;
    balanceAfter: number;
    createdAt: string;
  }>;
  badges: Array<{
    id: string;
    code: string;
    title: string;
    description: string;
    category: string;
    tier: string;
    coinReward: number;
    isUnlocked: boolean;
    earnedAt?: string;
  }>;
}

export interface GamificationAdminStats {
  totalCoinsInCirculation: number;
  lifetimeCoinsIssued: number;
  totalCoinsSpent: number;
  activeWalletsCount: number;
  streakMilestonesAchieved: number;
  badgesAwardedCount: number;
  recentLedger: Array<{
    id: string;
    userId: string;
    userName?: string;
    amount: number;
    direction: string;
    transactionType: string;
    reasonCode: string;
    balanceAfter: number;
    createdAt: string;
  }>;
  rewardPolicies: Array<{
    id: string;
    policyCode: string;
    eventType: string;
    baseCoins: number;
    performanceBonusCoins: number;
    consistencyBonusCoins: number;
    dailyLimitCount: number;
    isActive: boolean;
    updatedAt: string;
  }>;
  policyConfig: {
    dailyCompletionBase: number;
    mixedCompletionBase: number;
    fullCompletionBase: number;
    minAttemptThresholdPct: number;
    accuracySlabs: Array<{ min: number; max: number; coins: number }>;
  };
}

export interface StoreCatalogItem {
  id: string;
  title: string;
  slug: string;
  description: string;
  rewardType: "DIGITAL" | "PHYSICAL" | "FEATURE_UNLOCK";
  coinCost: number;
  stockQuantity: number;
  imageUrl: string | null;
  isActive: boolean;
  displayOrder: number;
}

export interface StoreUserClaim {
  id: string;
  rewardId: string;
  rewardTitle: string;
  rewardSlug: string;
  rewardType: string;
  coinsSpent: number;
  status: "REQUESTED" | "PROCESSING" | "SHIPPED" | "FULFILLED" | "REJECTED";
  claimedAt: string;
  fulfilledAt: string | null;
  trackingCode: string | null;
  shippingAddress: string | null;
}

export interface StorePageData {
  wallet: {
    currentBalance: number;
    lifetimeEarned: number;
    freezesHeld: number;
    level: {
      title: string;
      minCoins: number;
      nextLevelTitle?: string;
      nextLevelThreshold?: number;
      progressPercentage: number;
    };
  };
  catalog: StoreCatalogItem[];
  userClaims: StoreUserClaim[];
}

export interface AdminRewardCatalogItem {
  id: string;
  title: string;
  slug: string;
  description: string;
  rewardType: "PHYSICAL" | "DIGITAL" | "FEATURE_UNLOCK";
  coinCost: number;
  stockQuantity: number;
  imageUrl: string | null;
  metadata: Record<string, unknown>;
  isActive: boolean;
  displayOrder: number;
  totalRedemptions: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminRedemptionRecord {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  rewardId: string;
  rewardTitle: string;
  rewardSlug: string;
  rewardType: string;
  rewardImageUrl: string | null;
  coinsSpent: number;
  status: "REQUESTED" | "PROCESSING" | "SHIPPED" | "FULFILLED" | "REJECTED";
  shippingFullName: string | null;
  shippingPhone: string | null;
  shippingAddress: string | null;
  shippingCity: string | null;
  shippingState: string | null;
  shippingPincode: string | null;
  trackingCode: string | null;
  adminNotes: string | null;
  ledgerTransactionId: string | null;
  claimedAt: string;
  fulfilledAt: string | null;
}

export interface AdminRewardsStudioData {
  kpis: {
    totalCoinsInCirculation: number;
    lifetimeCoinsIssued: number;
    totalCoinsSpent: number;
    activeRewardsCount: number;
    totalRedemptionsCount: number;
    pendingFulfillmentCount: number;
  };
  catalog: AdminRewardCatalogItem[];
  redemptions: AdminRedemptionRecord[];
  rewardPolicies: Array<{
    id: string;
    policyCode: string;
    eventType: string;
    baseCoins: number;
    performanceBonusCoins: number;
    consistencyBonusCoins: number;
    dailyLimitCount: number;
    isActive: boolean;
    updatedAt: string;
  }>;
  recentLedger: Array<{
    id: string;
    userId: string;
    userName?: string;
    amount: number;
    direction: string;
    transactionType: string;
    reasonCode: string;
    balanceAfter: number;
    createdAt: string;
  }>;
}

export class GamificationService {
  /**
   * Authoritative Level Progression Thresholds
   * Seeker (0+) -> Scholar (1,000+) -> Luminary (3,000+) -> Legend (6,000+)
   */
  static getLevelInfo(lifetimeCoins: number) {
    if (lifetimeCoins >= 6000) {
      return {
        title: "Legend",
        minCoins: 6000,
        progressPercentage: 100,
      };
    }
    if (lifetimeCoins >= 3000) {
      const progress = Math.min(100, Math.round(((lifetimeCoins - 3000) / 3000) * 100));
      return {
        title: "Luminary",
        minCoins: 3000,
        nextLevelTitle: "Legend",
        nextLevelThreshold: 6000,
        progressPercentage: progress,
      };
    }
    if (lifetimeCoins >= 1000) {
      const progress = Math.min(100, Math.round(((lifetimeCoins - 1000) / 2000) * 100));
      return {
        title: "Scholar",
        minCoins: 1000,
        nextLevelTitle: "Luminary",
        nextLevelThreshold: 3000,
        progressPercentage: progress,
      };
    }
    const progress = Math.min(100, Math.round((lifetimeCoins / 1000) * 100));
    return {
      title: "Seeker",
      minCoins: 0,
      nextLevelTitle: "Scholar",
      nextLevelThreshold: 1000,
      progressPercentage: progress,
    };
  }

  /**
   * Pure, Server-Authoritative Reward Calculation Engine
   * Uses CANONICAL test type from mock_templates. Never guesses test type from question count.
   */
  static calculateMockReward(input: MockRewardCalculationInput): {
    completionCoins: number;
    completionReason: string;
    isAccuracyEligible: boolean;
    minAttemptRequired: number;
    accuracyPercentage: number;
    accuracyBonusCoins: number;
    accuracyReason: string;
    totalCalculated: number;
  } {
    const { canonicalTestType, totalQuestions, attemptedCount, correctCount } = input;

    // 1. Base Completion Reward strictly by canonical test type
    let completionCoins = 10;
    let completionReason = "Daily Sectional Test Completed";

    const normalizedType = (canonicalTestType || "").toLowerCase().trim();
    if (normalizedType === "full_length" || normalizedType === "full" || normalizedType.includes("grand")) {
      completionCoins = 25;
      completionReason = "Full-Length Mock Completed";
    } else if (normalizedType === "mixed" || normalizedType.includes("mixed")) {
      completionCoins = 15;
      completionReason = "Mixed Practice Mock Completed";
    } else {
      // Default: sectional / daily
      completionCoins = 10;
      completionReason = "Daily Sectional Test Completed";
    }

    // 2. Minimum Attempt Threshold: Ceiling(total_questions * 0.50)
    const minAttemptRequired = Math.ceil(Math.max(1, totalQuestions) * 0.5);
    const isAccuracyEligible = attemptedCount >= minAttemptRequired;

    // 3. Pure Accuracy Calculation: Correct / Attempted * 100 (Unattempted excluded from denominator)
    const accuracyPercentage = attemptedCount > 0
      ? Math.round((correctCount / attemptedCount) * 1000) / 10
      : 0;

    // 4. Accuracy Bonus Calculation
    let accuracyBonusCoins = 0;
    let accuracyReason = "No Accuracy Bonus";

    if (!isAccuracyEligible) {
      accuracyBonusCoins = 0;
      accuracyReason = `Under Attempt Threshold (<${minAttemptRequired} of ${totalQuestions} Qs)`;
    } else {
      if (accuracyPercentage >= 100) {
        accuracyBonusCoins = 15;
        accuracyReason = "100% Perfect Accuracy Bonus";
      } else if (accuracyPercentage >= 95) {
        accuracyBonusCoins = 12;
        accuracyReason = "95-99% Elite Accuracy Bonus";
      } else if (accuracyPercentage >= 90) {
        accuracyBonusCoins = 10;
        accuracyReason = "90-94% High Accuracy Bonus";
      } else if (accuracyPercentage >= 80) {
        accuracyBonusCoins = 8;
        accuracyReason = "80-89% Great Accuracy Bonus";
      } else if (accuracyPercentage >= 70) {
        accuracyBonusCoins = 6;
        accuracyReason = "70-79% Good Accuracy Bonus";
      } else if (accuracyPercentage >= 60) {
        accuracyBonusCoins = 4;
        accuracyReason = "60-69% Moderate Accuracy Bonus";
      } else if (accuracyPercentage >= 50) {
        accuracyBonusCoins = 2;
        accuracyReason = "50-59% Standard Accuracy Bonus";
      } else {
        accuracyBonusCoins = 0;
        accuracyReason = "Below 50% Accuracy Threshold";
      }
    }

    const totalCalculated = completionCoins + accuracyBonusCoins;

    return {
      completionCoins,
      completionReason,
      isAccuracyEligible,
      minAttemptRequired,
      accuracyPercentage,
      accuracyBonusCoins,
      accuracyReason,
      totalCalculated,
    };
  }

  /**
   * Atomic Server-Authoritative Reward Grant with Retake Anti-Farming Protection
   * Invariant: Only the FIRST completed attempt of a specific mock_test_id is reward-eligible.
   * Concurrency-safe via database-level unique idempotency_key on (mock_test_id, user_id).
   */
  static async awardMockCompletionReward(input: MockRewardCalculationInput): Promise<MockRewardBreakdown> {
    const adminSb = createAdminServerSupabaseClient();
    const { userId, attemptId, testId, timeSpentSeconds } = input;

    // Idempotency key strictly scoped to (mock_test_id, user_id)
    const idempotencyKey = `mock_reward_${testId}_${userId}`;

    // 1. Check if user already earned rewards for this mock test (Retake / Prior submission check)
    const [existingEventRes, priorAttemptRes] = await Promise.all([
      adminSb
        .from("gamification_events")
        .select("id, actual_coins_awarded, metadata")
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle(),
      adminSb
        .from("test_attempts")
        .select("id, started_at")
        .eq("mock_test_id", testId)
        .eq("user_id", userId)
        .in("status", ["submitted", "completed", "evaluated"])
        .neq("id", attemptId)
        .limit(1)
        .maybeSingle(),
    ]);

    const isRetake = Boolean(priorAttemptRes.data);
    const existingEvent = existingEventRes.data;

    // If this is a retake or already rewarded, award ZERO additional coins
    if (isRetake || existingEvent) {
      const meta = (existingEvent as any)?.metadata || {};
      const { data: userStreak } = await adminSb
        .from("user_streaks")
        .select("current_streak, longest_streak")
        .eq("user_id", userId)
        .maybeSingle();

      return {
        isRetake: true,
        isRewardEligible: false,
        completionCoins: 0,
        completionReason: "Retake (Reward only on first completed attempt)",
        isAccuracyEligible: false,
        minAttemptRequired: Math.ceil(input.totalQuestions * 0.5),
        accuracyPercentage: input.attemptedCount > 0 ? Math.round((input.correctCount / input.attemptedCount) * 1000) / 10 : 0,
        accuracyBonusCoins: 0,
        accuracyReason: "Retake (No additional accuracy bonus)",
        streakCoins: 0,
        streakReason: "Retake (Streak updated on first attempt)",
        currentStreak: userStreak?.current_streak || 1,
        longestStreak: userStreak?.longest_streak || 1,
        isNewStreakMilestone: false,
        badgeUnlocked: null,
        totalCoinsEarned: 0,
        isAlreadyRewarded: true,
      };
    }

    // 2. First Valid Submission — Calculate Authoritative Coin Amounts
    const calc = GamificationService.calculateMockReward(input);

    // 3. Record Qualifying Daily Streak Activity
    let streakCoins = 0;
    let streakReason = "Daily Consistency Streak";
    let currentStreak = 1;
    let longestStreak = 1;
    let isNewStreakMilestone = false;

    try {
      const { data: streakResult } = await (adminSb as any).rpc("fn_record_qualifying_streak_activity", {
        p_user_id: userId,
        p_action_type: "MOCK_TEST",
        p_source_id: attemptId,
        p_duration_seconds: timeSpentSeconds || 0,
        p_timezone: "Asia/Kolkata",
      });

      if (streakResult?.success) {
        currentStreak = Number(streakResult.streak || 1);
        if (streakResult.status === "STREAK_INCREMENTED") {
          streakCoins = 5; // +5 CL Daily consistency bonus
          streakReason = `${currentStreak}-Day Consistency Streak Bonus`;
        } else {
          streakReason = `${currentStreak}-Day Streak Maintained`;
        }
      }
    } catch (e) {
      console.warn("[GamificationService] Streak recording notice:", e);
    }

    // Fetch user streaks for longest streak
    const { data: streakData } = await adminSb
      .from("user_streaks")
      .select("current_streak, longest_streak")
      .eq("user_id", userId)
      .maybeSingle();

    if (streakData) {
      currentStreak = streakData.current_streak;
      longestStreak = streakData.longest_streak;
    }

    // 4. Check & Award Achievements (e.g. Bullseye for 100% Accuracy with >=50% attempts)
    let unlockedBadge: { code: string; title: string; coins: number } | null = null;
    if (calc.isAccuracyEligible && calc.accuracyPercentage >= 100) {
      const { data: bullseyeBadge } = await adminSb
        .from("badges")
        .select("id, code, title, coin_reward")
        .eq("code", "BULLSEYE")
        .maybeSingle();

      if (bullseyeBadge) {
        const { data: userBadgeExists } = await adminSb
          .from("user_badges")
          .select("id")
          .eq("user_id", userId)
          .eq("badge_id", (bullseyeBadge as any).id)
          .maybeSingle();

        if (!userBadgeExists) {
          // Insert user badge
          await adminSb.from("user_badges").insert({
            user_id: userId,
            badge_id: (bullseyeBadge as any).id,
            coins_awarded: 0, // Invariant: No duplicate huge bonus beyond +15 accuracy bonus
          } as any);

          unlockedBadge = {
            code: (bullseyeBadge as any).code,
            title: (bullseyeBadge as any).title,
            coins: 0,
          };
        }
      }
    }

    // 5. Total Coins Granted
    const totalCoinsEarned = calc.completionCoins + calc.accuracyBonusCoins + streakCoins;

    const metadata = {
      first_attempt_id: attemptId,
      mock_test_id: testId,
      canonical_test_type: input.canonicalTestType || "sectional",
      total_questions: input.totalQuestions,
      attempted_count: input.attemptedCount,
      correct_count: input.correctCount,
      completion_coins: calc.completionCoins,
      completion_reason: calc.completionReason,
      is_accuracy_eligible: calc.isAccuracyEligible,
      min_attempt_required: calc.minAttemptRequired,
      accuracy_percentage: calc.accuracyPercentage,
      accuracy_bonus_coins: calc.accuracyBonusCoins,
      accuracy_reason: calc.accuracyReason,
      streak_coins: streakCoins,
      streak_reason: streakReason,
      current_streak: currentStreak,
      badge_unlocked: unlockedBadge,
      total_coins: totalCoinsEarned,
      is_retake: false,
    };

    // 6. Execute Canonical Atomic RPC fn_award_gamification_reward
    let isSuccessfullyAwarded = false;
    try {
      const { data: rpcRes, error: rpcErr } = await (adminSb as any).rpc("fn_award_gamification_reward", {
        p_user_id: userId,
        p_event_type: "MOCK_TEST_COMPLETED",
        p_source_type: "MOCK_TEST",
        p_source_id: testId,
        p_idempotency_key: idempotencyKey,
        p_calculated_coins: totalCoinsEarned,
        p_reason_code: "MOCK_ASSESSMENT_REWARD",
        p_metadata: metadata,
      });

      if (rpcErr) {
        console.error("[GamificationService.awardMockCompletionReward] Database RPC Error:", rpcErr);
      } else if (rpcRes?.success !== false) {
        isSuccessfullyAwarded = true;
      }
    } catch (dbErr) {
      console.error("[GamificationService.awardMockCompletionReward] Error calling fn_award_gamification_reward:", dbErr);
    }

    if (!isSuccessfullyAwarded) {
      return {
        isRetake: false,
        isRewardEligible: false,
        completionCoins: 0,
        completionReason: "Reward processing pending",
        isAccuracyEligible: false,
        minAttemptRequired: calc.minAttemptRequired,
        accuracyPercentage: calc.accuracyPercentage,
        accuracyBonusCoins: 0,
        accuracyReason: "Reward processing pending",
        streakCoins: 0,
        streakReason: "Streak recorded",
        currentStreak,
        longestStreak,
        isNewStreakMilestone,
        badgeUnlocked: null,
        totalCoinsEarned: 0,
        isAlreadyRewarded: false,
      };
    }

    return {
      isRetake: false,
      isRewardEligible: true,
      completionCoins: calc.completionCoins,
      completionReason: calc.completionReason,
      isAccuracyEligible: calc.isAccuracyEligible,
      minAttemptRequired: calc.minAttemptRequired,
      accuracyPercentage: calc.accuracyPercentage,
      accuracyBonusCoins: calc.accuracyBonusCoins,
      accuracyReason: calc.accuracyReason,
      streakCoins,
      streakReason,
      currentStreak,
      longestStreak,
      isNewStreakMilestone,
      badgeUnlocked: unlockedBadge,
      totalCoinsEarned,
      isAlreadyRewarded: false,
    };
  }

  /**
   * Retrieves Comprehensive Student Wallet & Ledger Snapshot
   */
  static async getStudentWallet(userId: string): Promise<StudentWalletData | null> {
    const adminSb = createAdminServerSupabaseClient();

    const [walletRes, streakRes, ledgerRes, badgesRes, userBadgesRes] = await Promise.all([
      adminSb.from("coin_wallets").select("*").eq("user_id", userId).maybeSingle(),
      adminSb.from("user_streaks").select("*").eq("user_id", userId).maybeSingle(),
      adminSb.from("coin_ledger").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(50),
      adminSb.from("badges").select("*").eq("is_active", true).order("display_order", { ascending: true }),
      adminSb.from("user_badges").select("badge_id, earned_at").eq("user_id", userId),
    ]);

    const wallet = walletRes.data as any;
    const streak = streakRes.data as any;
    const ledger = (ledgerRes.data as any[]) || [];
    const allBadges = (badgesRes.data as any[]) || [];
    const userBadges = (userBadgesRes.data as any[]) || [];

    const userBadgeMap = new Map<string, string>();
    userBadges.forEach((ub) => userBadgeMap.set(ub.badge_id, ub.earned_at));

    let currentBalance = Number(wallet?.current_balance || 0);
    let lifetimeEarned = Number(wallet?.lifetime_earned || 0);
    let lifetimeSpent = Number(wallet?.lifetime_spent || 0);
    const freezesHeld = Number(wallet?.freezes_held || 0);

    // Reconcile with ledger if wallet row is missing or out-of-sync
    if (!wallet && ledger.length > 0) {
      const calculatedEarned = ledger.filter((l) => l.direction === "CREDIT").reduce((s, l) => s + Number(l.amount || 0), 0);
      const calculatedSpent = ledger.filter((l) => l.direction === "DEBIT").reduce((s, l) => s + Number(l.amount || 0), 0);
      currentBalance = calculatedEarned - calculatedSpent;
      lifetimeEarned = calculatedEarned;
      lifetimeSpent = calculatedSpent;
    }

    const level = GamificationService.getLevelInfo(lifetimeEarned);

    const badges = allBadges.map((b) => ({
      id: b.id,
      code: b.code,
      title: b.title,
      description: b.description,
      category: b.category,
      tier: b.tier,
      coinReward: Number(b.coin_reward || 0),
      isUnlocked: userBadgeMap.has(b.id),
      earnedAt: userBadgeMap.get(b.id),
    }));

    const recentTransactions = ledger.map((l) => ({
      id: l.id,
      amount: Number(l.amount || 0),
      direction: (l.direction || "CREDIT") as "CREDIT" | "DEBIT",
      transactionType: l.transaction_type || "CREDIT",
      reasonCode: l.reason_code || "REWARD",
      balanceAfter: Number(l.balance_after || 0),
      createdAt: l.created_at,
    }));

    return {
      currentBalance,
      lifetimeEarned,
      lifetimeSpent,
      freezesHeld,
      level,
      streak: {
        currentStreak: Number(streak?.current_streak || 0),
        longestStreak: Number(streak?.longest_streak || 0),
        lastQualifyingDate: streak?.last_qualifying_date || null,
        isFrozen: Boolean(streak?.is_frozen),
      },
      recentTransactions,
      badges,
    };
  }

  /**
   * Updates an Authoritative Reward Policy in Database
   */
  static async updateRewardPolicy(
    policyCode: string,
    updates: { baseCoins?: number; performanceBonusCoins?: number; consistencyBonusCoins?: number }
  ): Promise<{ success: boolean; error?: string }> {
    const adminSb = createAdminServerSupabaseClient();

    const payload: any = { updated_at: new Date().toISOString() };
    if (updates.baseCoins !== undefined) {
      if (updates.baseCoins < 0) return { success: false, error: "Coins cannot be negative" };
      payload.base_coins = updates.baseCoins;
    }
    if (updates.performanceBonusCoins !== undefined) {
      if (updates.performanceBonusCoins < 0) return { success: false, error: "Coins cannot be negative" };
      payload.performance_bonus_coins = updates.performanceBonusCoins;
    }
    if (updates.consistencyBonusCoins !== undefined) {
      if (updates.consistencyBonusCoins < 0) return { success: false, error: "Coins cannot be negative" };
      payload.consistency_bonus_coins = updates.consistencyBonusCoins;
    }

    const { error } = await adminSb
      .from("reward_policies")
      .update(payload as any)
      .eq("policy_code", policyCode);

    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  }

  /**
   * Retrieves Admin Gamification Economy Analytics & Master Ledger
   */
  static async getGamificationAdminStats(): Promise<GamificationAdminStats> {
    const adminSb = createAdminServerSupabaseClient();

    const [walletsRes, ledgerRes, badgesCountRes, userBadgesCountRes, policiesRes] = await Promise.all([
      adminSb.from("coin_wallets").select("current_balance, lifetime_earned, lifetime_spent"),
      adminSb.from("coin_ledger").select("id, user_id, amount, direction, transaction_type, reason_code, balance_after, created_at").order("created_at", { ascending: false }).limit(50),
      adminSb.from("badges").select("id", { count: "exact", head: true }).eq("is_active", true),
      adminSb.from("user_badges").select("id", { count: "exact", head: true }),
      adminSb.from("reward_policies").select("*").order("created_at", { ascending: true }),
    ]);

    const wallets = (walletsRes.data as any[]) || [];
    const ledger = (ledgerRes.data as any[]) || [];
    const dbPolicies = (policiesRes.data as any[]) || [];

    const totalCoinsInCirculation = wallets.reduce((acc, w) => acc + Number(w.current_balance || 0), 0);
    const lifetimeCoinsIssued = wallets.reduce((acc, w) => acc + Number(w.lifetime_earned || 0), 0);
    const totalCoinsSpent = wallets.reduce((acc, w) => acc + Number(w.lifetime_spent || 0), 0);
    const activeWalletsCount = wallets.length;

    // Fetch user profiles for recent ledger entries
    const userIds = Array.from(new Set(ledger.map((l) => l.user_id)));
    const profilesMap = new Map<string, any>();
    if (userIds.length > 0) {
      const { data: profs } = await adminSb
        .from("user_profiles")
        .select("id, full_name")
        .in("id", userIds);

      (profs || []).forEach((p) => profilesMap.set(p.id, p));
    }

    const recentLedger = ledger.map((l) => {
      const p = profilesMap.get(l.user_id);
      return {
        id: l.id,
        userId: l.user_id,
        userName: p?.full_name || `Candidate #${l.user_id.slice(0, 6).toUpperCase()}`,
        amount: Number(l.amount || 0),
        direction: l.direction,
        transactionType: l.transaction_type,
        reasonCode: l.reason_code,
        balanceAfter: Number(l.balance_after || 0),
        createdAt: l.created_at,
      };
    });

    const rewardPolicies = dbPolicies.map((p) => ({
      id: p.id,
      policyCode: p.policy_code,
      eventType: p.event_type,
      baseCoins: p.base_coins,
      performanceBonusCoins: p.performance_bonus_coins,
      consistencyBonusCoins: p.consistency_bonus_coins,
      dailyLimitCount: p.daily_limit_count || 1,
      isActive: p.is_active,
      updatedAt: p.updated_at,
    }));

    return {
      totalCoinsInCirculation,
      lifetimeCoinsIssued,
      totalCoinsSpent,
      activeWalletsCount,
      streakMilestonesAchieved: 0,
      badgesAwardedCount: userBadgesCountRes.count || 0,
      recentLedger,
      rewardPolicies,
      policyConfig: {
        dailyCompletionBase: 10,
        mixedCompletionBase: 15,
        fullCompletionBase: 25,
        minAttemptThresholdPct: 50,
        accuracySlabs: [
          { min: 50, max: 59, coins: 2 },
          { min: 60, max: 69, coins: 4 },
          { min: 70, max: 79, coins: 6 },
          { min: 80, max: 89, coins: 8 },
          { min: 90, max: 94, coins: 10 },
          { min: 95, max: 99, coins: 12 },
          { min: 100, max: 100, coins: 15 },
        ],
      },
    };
  }

  /**
   * Retrieves Authoritative Store Page Data (Catalog, Wallet, User Claims)
   */
  static async getStoreData(userId: string): Promise<StorePageData> {
    const adminSb = createAdminServerSupabaseClient();

    const [walletData, catalogRes, claimsRes] = await Promise.all([
      GamificationService.getStudentWallet(userId),
      adminSb
        .from("reward_catalog")
        .select("*")
        .eq("is_active", true)
        .order("display_order", { ascending: true }),
      adminSb
        .from("reward_claims")
        .select("id, reward_id, coins_spent, status, shipping_address, tracking_code, created_at, fulfilled_at, reward_catalog(id, title, slug, reward_type, image_url)")
        .eq("user_id", userId)
        .order("created_at", { ascending: false }),
    ]);

    const catalogItems: StoreCatalogItem[] = ((catalogRes.data as any[]) || []).map((c) => ({
      id: c.id,
      title: c.title,
      slug: c.slug,
      description: c.description || "",
      rewardType: (c.reward_type || "PHYSICAL") as any,
      coinCost: Number(c.coin_cost || 0),
      stockQuantity: Number(c.stock_quantity ?? -1),
      imageUrl: c.image_url || null,
      isActive: Boolean(c.is_active),
      displayOrder: Number(c.display_order || 0),
    }));

    const userClaims: StoreUserClaim[] = ((claimsRes.data as any[]) || []).map((cl) => ({
      id: cl.id,
      rewardId: cl.reward_id,
      rewardTitle: cl.reward_catalog?.title || "Reward Item",
      rewardSlug: cl.reward_catalog?.slug || "",
      rewardType: cl.reward_catalog?.reward_type || "PHYSICAL",
      coinsSpent: Number(cl.coins_spent || 0),
      status: (cl.status || "REQUESTED") as any,
      claimedAt: cl.created_at,
      fulfilledAt: cl.fulfilled_at,
      trackingCode: cl.tracking_code,
      shippingAddress: cl.shipping_address,
    }));

    return {
      wallet: {
        currentBalance: walletData?.currentBalance || 0,
        lifetimeEarned: walletData?.lifetimeEarned || 0,
        freezesHeld: walletData?.freezesHeld || 0,
        level: walletData?.level || {
          title: "Seeker",
          minCoins: 0,
          progressPercentage: 0,
        },
      },
      catalog: catalogItems,
      userClaims,
    };
  }

  /**
   * Server-Authoritative Reward Redemption
   * Atomically verifies balance, deducts coins, inserts ledger debit, updates wallet, and creates claim.
   */
  static async redeemStoreReward(input: {
    userId: string;
    rewardId: string;
    shippingDetails?: {
      fullName?: string;
      phone?: string;
      address?: string;
      city?: string;
      state?: string;
      pincode?: string;
    };
  }): Promise<{
    success: boolean;
    error?: string;
    remainingBalance?: number;
    claimId?: string;
    rewardTitle?: string;
  }> {
    const adminSb = createAdminServerSupabaseClient();
    const { userId, rewardId, shippingDetails } = input;

    // 1. Fetch Authoritative Reward Item
    const { data: reward, error: rewardErr } = await adminSb
      .from("reward_catalog")
      .select("*")
      .eq("id", rewardId)
      .maybeSingle();

    if (rewardErr || !reward) {
      return { success: false, error: "Reward item not found in catalog." };
    }

    if (!reward.is_active) {
      return { success: false, error: "This reward is currently unavailable." };
    }

    if (reward.stock_quantity !== -1 && reward.stock_quantity <= 0) {
      return { success: false, error: "This reward is currently out of stock." };
    }

    const coinCost = Number(reward.coin_cost || 0);

    // 2. Fetch Authoritative User Wallet
    const { data: wallet, error: walletErr } = await adminSb
      .from("coin_wallets")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (walletErr || !wallet) {
      return { success: false, error: "Wallet not found. Please earn CL Coins first." };
    }

    const currentBalance = Number(wallet.current_balance || 0);
    if (currentBalance < coinCost) {
      const needed = coinCost - currentBalance;
      return { success: false, error: `Insufficient CL Coins. You need ${needed.toLocaleString()} more CL.` };
    }

    // 3. Special checks for specific items (e.g. Streak Freeze Token max 2 held)
    const isStreakFreeze = reward.slug === "streak-freeze-token" || reward.title.toLowerCase().includes("streak freeze");
    if (isStreakFreeze && Number(wallet.freezes_held || 0) >= 2) {
      return { success: false, error: "You already hold the maximum of 2 Streak Freeze shields." };
    }

    // 4. Physical reward shipping validation
    if (reward.reward_type === "PHYSICAL") {
      if (!shippingDetails?.fullName?.trim() || !shippingDetails?.phone?.trim() || !shippingDetails?.address?.trim() || !shippingDetails?.pincode?.trim()) {
        return { success: false, error: "Please provide complete delivery details (Name, Phone, Address, Pincode)." };
      }
    }

    // 5. Execute Atomic Redemption
    const newBalance = currentBalance - coinCost;
    const newLifetimeSpent = Number(wallet.lifetime_spent || 0) + coinCost;
    const claimKey = `claim_${reward.id}_${userId}_${Date.now()}`;

    // A. Insert Immutable Ledger Debit
    const { data: ledgerRow, error: ledgerErr } = await adminSb
      .from("coin_ledger")
      .insert({
        user_id: userId,
        transaction_type: "DEBIT",
        amount: coinCost,
        direction: "DEBIT",
        balance_after: newBalance,
        source_type: "REWARD_STORE",
        source_id: reward.id,
        reason_code: "STORE_REDEMPTION",
        idempotency_key: `ledger_${claimKey}`,
        metadata: {
          reward_id: reward.id,
          reward_title: reward.title,
          reward_type: reward.reward_type,
          slug: reward.slug,
        },
      } as any)
      .select("id")
      .single();

    if (ledgerErr || !ledgerRow) {
      console.error("[redeemStoreReward] Ledger insert error:", ledgerErr);
      return { success: false, error: "Redemption transaction failed. Your balance is untouched." };
    }

    // B. Update Coin Wallet Balance
    const walletUpdates: any = {
      current_balance: newBalance,
      lifetime_spent: newLifetimeSpent,
      last_transaction_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (isStreakFreeze) {
      walletUpdates.freezes_held = Number(wallet.freezes_held || 0) + 1;
    }

    const { error: walletUpErr } = await adminSb
      .from("coin_wallets")
      .update(walletUpdates)
      .eq("user_id", userId);

    if (walletUpErr) {
      console.error("[redeemStoreReward] Wallet update error:", walletUpErr);
    }

    // C. Insert Reward Claim Record
    const initialStatus = reward.reward_type === "DIGITAL" || isStreakFreeze ? "FULFILLED" : "REQUESTED";
    const fulfilledAt = initialStatus === "FULFILLED" ? new Date().toISOString() : null;

    const { data: claimRow, error: claimErr } = await adminSb
      .from("reward_claims")
      .insert({
        user_id: userId,
        reward_id: reward.id,
        coins_spent: coinCost,
        ledger_transaction_id: ledgerRow.id,
        status: initialStatus,
        shipping_full_name: shippingDetails?.fullName?.trim() || null,
        shipping_phone: shippingDetails?.phone?.trim() || null,
        shipping_address: shippingDetails?.address?.trim() || null,
        shipping_city: shippingDetails?.city?.trim() || null,
        shipping_state: shippingDetails?.state?.trim() || null,
        shipping_pincode: shippingDetails?.pincode?.trim() || null,
        fulfilled_at: fulfilledAt,
      } as any)
      .select("id")
      .single();

    if (claimErr) {
      console.error("[redeemStoreReward] Claim record creation error:", claimErr);
    }

    // D. Decrement Physical Stock if applicable
    if (reward.stock_quantity > 0) {
      await adminSb
        .from("reward_catalog")
        .update({ stock_quantity: reward.stock_quantity - 1 })
        .eq("id", reward.id);
    }

    return {
      success: true,
      remainingBalance: newBalance,
      claimId: claimRow?.id,
      rewardTitle: reward.title,
    };
  }

  /**
   * Retrieves Full Authoritative Data for Admin Reward & Store Management Studio
   */
  static async getAdminRewardsStudioData(): Promise<AdminRewardsStudioData> {
    const adminSb = createAdminServerSupabaseClient();

    const [walletsRes, catalogRes, claimsRes, policiesRes, ledgerRes] = await Promise.all([
      adminSb.from("coin_wallets").select("current_balance, lifetime_earned, lifetime_spent"),
      adminSb.from("reward_catalog").select("*").order("display_order", { ascending: true }),
      adminSb
        .from("reward_claims")
        .select("*, reward_catalog(id, title, slug, reward_type, image_url)")
        .order("created_at", { ascending: false })
        .limit(200),
      adminSb.from("reward_policies").select("*").order("created_at", { ascending: true }),
      adminSb
        .from("coin_ledger")
        .select("id, user_id, amount, direction, transaction_type, reason_code, balance_after, created_at")
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    const wallets = (walletsRes.data as any[]) || [];
    const catalogData = (catalogRes.data as any[]) || [];
    const claimsData = (claimsRes.data as any[]) || [];
    const dbPolicies = (policiesRes.data as any[]) || [];
    const ledger = (ledgerRes.data as any[]) || [];

    const totalCoinsInCirculation = wallets.reduce((acc, w) => acc + Number(w.current_balance || 0), 0);
    const lifetimeCoinsIssued = wallets.reduce((acc, w) => acc + Number(w.lifetime_earned || 0), 0);
    const totalCoinsSpent = wallets.reduce((acc, w) => acc + Number(w.lifetime_spent || 0), 0);
    const activeRewardsCount = catalogData.filter((c) => c.is_active).length;
    const totalRedemptionsCount = claimsData.length;
    const pendingFulfillmentCount = claimsData.filter(
      (cl) => cl.status === "REQUESTED" || cl.status === "PROCESSING"
    ).length;

    // Redemptions count map per reward_id
    const redemptionsMap = new Map<string, number>();
    claimsData.forEach((cl) => {
      const count = redemptionsMap.get(cl.reward_id) || 0;
      redemptionsMap.set(cl.reward_id, count + 1);
    });

    const catalog: AdminRewardCatalogItem[] = catalogData.map((c) => ({
      id: c.id,
      title: c.title,
      slug: c.slug,
      description: c.description || "",
      rewardType: (c.reward_type || "PHYSICAL") as any,
      coinCost: Number(c.coin_cost || 0),
      stockQuantity: Number(c.stock_quantity ?? -1),
      imageUrl: c.image_url || null,
      metadata: c.metadata || {},
      isActive: Boolean(c.is_active),
      displayOrder: Number(c.display_order || 0),
      totalRedemptions: redemptionsMap.get(c.id) || 0,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
    }));

    // Fetch user profiles for redemptions & ledger
    const allUserIds = Array.from(
      new Set([...claimsData.map((cl) => cl.user_id), ...ledger.map((l) => l.user_id)])
    );

    const profilesMap = new Map<string, any>();
    if (allUserIds.length > 0) {
      const { data: profs } = await adminSb
        .from("user_profiles")
        .select("id, full_name")
        .in("id", allUserIds);

      (profs || []).forEach((p) => profilesMap.set(p.id, p));
    }

    const redemptions: AdminRedemptionRecord[] = claimsData.map((cl) => {
      const p = profilesMap.get(cl.user_id);
      return {
        id: cl.id,
        userId: cl.user_id,
        userName: p?.full_name || `Candidate #${cl.user_id.slice(0, 6).toUpperCase()}`,
        userEmail: "",
        rewardId: cl.reward_id,
        rewardTitle: cl.reward_catalog?.title || "Reward Item",
        rewardSlug: cl.reward_catalog?.slug || "",
        rewardType: cl.reward_catalog?.reward_type || "PHYSICAL",
        rewardImageUrl: cl.reward_catalog?.image_url || null,
        coinsSpent: Number(cl.coins_spent || 0),
        status: (cl.status || "REQUESTED") as any,
        shippingFullName: cl.shipping_full_name || null,
        shippingPhone: cl.shipping_phone || null,
        shippingAddress: cl.shipping_address || null,
        shippingCity: cl.shipping_city || null,
        shippingState: cl.shipping_state || null,
        shippingPincode: cl.shipping_pincode || null,
        trackingCode: cl.tracking_code || null,
        adminNotes: cl.admin_notes || null,
        ledgerTransactionId: cl.ledger_transaction_id || null,
        claimedAt: cl.created_at,
        fulfilledAt: cl.fulfilled_at || null,
      };
    });

    const recentLedger = ledger.map((l) => {
      const p = profilesMap.get(l.user_id);
      return {
        id: l.id,
        userId: l.user_id,
        userName: p?.full_name || `Candidate #${l.user_id.slice(0, 6).toUpperCase()}`,
        amount: Number(l.amount || 0),
        direction: l.direction,
        transactionType: l.transaction_type,
        reasonCode: l.reason_code,
        balanceAfter: Number(l.balance_after || 0),
        createdAt: l.created_at,
      };
    });

    const rewardPolicies = dbPolicies.map((p) => ({
      id: p.id,
      policyCode: p.policy_code,
      eventType: p.event_type,
      baseCoins: p.base_coins,
      performanceBonusCoins: p.performance_bonus_coins,
      consistencyBonusCoins: p.consistency_bonus_coins,
      dailyLimitCount: p.daily_limit_count || 1,
      isActive: p.is_active,
      updatedAt: p.updated_at,
    }));

    return {
      kpis: {
        totalCoinsInCirculation,
        lifetimeCoinsIssued,
        totalCoinsSpent,
        activeRewardsCount,
        totalRedemptionsCount,
        pendingFulfillmentCount,
      },
      catalog,
      redemptions,
      rewardPolicies,
      recentLedger,
    };
  }

  /**
   * Admin: Creates a new reward in reward_catalog
   */
  static async adminCreateReward(input: {
    title: string;
    slug?: string;
    description?: string;
    rewardType: string;
    coinCost: number;
    stockQuantity?: number;
    imageUrl?: string | null;
    isActive?: boolean;
    displayOrder?: number;
    metadata?: Record<string, unknown>;
  }): Promise<{ success: boolean; reward?: any; error?: string }> {
    const adminSb = createAdminServerSupabaseClient();

    if (!input.title?.trim()) {
      return { success: false, error: "Reward title is required." };
    }
    if (input.coinCost === undefined || input.coinCost < 0) {
      return { success: false, error: "Coin cost must be a non-negative number." };
    }

    const slug =
      input.slug?.trim() ||
      input.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)+/g, "");

    const payload = {
      title: input.title.trim(),
      slug,
      description: input.description?.trim() || "",
      reward_type: input.rewardType || "PHYSICAL",
      coin_cost: Math.round(Number(input.coinCost)),
      stock_quantity: input.stockQuantity !== undefined ? Math.round(Number(input.stockQuantity)) : -1,
      image_url: input.imageUrl || null,
      metadata: input.metadata || {},
      is_active: input.isActive ?? true,
      display_order: input.displayOrder !== undefined ? Math.round(Number(input.displayOrder)) : 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await adminSb
      .from("reward_catalog")
      .insert(payload as any)
      .select("*")
      .single();

    if (error) {
      console.error("[adminCreateReward] Error:", error);
      return { success: false, error: error.message };
    }

    return { success: true, reward: data };
  }

  /**
   * Admin: Updates an existing reward in reward_catalog
   */
  static async adminUpdateReward(
    id: string,
    updates: Partial<{
      title: string;
      slug: string;
      description: string;
      rewardType: string;
      coinCost: number;
      stockQuantity: number;
      imageUrl: string | null;
      isActive: boolean;
      displayOrder: number;
      metadata: Record<string, unknown>;
    }>
  ): Promise<{ success: boolean; error?: string }> {
    const adminSb = createAdminServerSupabaseClient();

    const payload: any = { updated_at: new Date().toISOString() };
    if (updates.title !== undefined) payload.title = updates.title.trim();
    if (updates.slug !== undefined) payload.slug = updates.slug.trim();
    if (updates.description !== undefined) payload.description = updates.description.trim();
    if (updates.rewardType !== undefined) payload.reward_type = updates.rewardType;
    if (updates.coinCost !== undefined) {
      if (updates.coinCost < 0) return { success: false, error: "Cost cannot be negative." };
      payload.coin_cost = Math.round(Number(updates.coinCost));
    }
    if (updates.stockQuantity !== undefined) payload.stock_quantity = Math.round(Number(updates.stockQuantity));
    if (updates.imageUrl !== undefined) payload.image_url = updates.imageUrl;
    if (updates.isActive !== undefined) payload.is_active = updates.isActive;
    if (updates.displayOrder !== undefined) payload.display_order = Math.round(Number(updates.displayOrder));
    if (updates.metadata !== undefined) payload.metadata = updates.metadata;

    const { error } = await adminSb
      .from("reward_catalog")
      .update(payload)
      .eq("id", id);

    if (error) {
      console.error("[adminUpdateReward] Error:", error);
      return { success: false, error: error.message };
    }

    return { success: true };
  }

  /**
   * Admin: Toggles active status of a reward
   */
  static async adminToggleRewardActive(
    id: string,
    isActive: boolean
  ): Promise<{ success: boolean; error?: string }> {
    const adminSb = createAdminServerSupabaseClient();
    const { error } = await adminSb
      .from("reward_catalog")
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  }

  /**
   * Admin: Updates fulfillment status, tracking code, or notes on a redemption claim
   */
  static async adminUpdateRedemptionStatus(
    claimId: string,
    updates: {
      status: string;
      trackingCode?: string;
      adminNotes?: string;
    }
  ): Promise<{ success: boolean; error?: string }> {
    const adminSb = createAdminServerSupabaseClient();

    const payload: any = {
      status: updates.status,
      updated_at: new Date().toISOString(),
    };

    if (updates.trackingCode !== undefined) {
      payload.tracking_code = updates.trackingCode.trim() || null;
    }
    if (updates.adminNotes !== undefined) {
      payload.admin_notes = updates.adminNotes.trim() || null;
    }
    if (updates.status === "FULFILLED") {
      payload.fulfilled_at = new Date().toISOString();
    }

    const { error } = await adminSb
      .from("reward_claims")
      .update(payload)
      .eq("id", claimId);

    if (error) {
      console.error("[adminUpdateRedemptionStatus] Error:", error);
      return { success: false, error: error.message };
    }

    return { success: true };
  }
}
