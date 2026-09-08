import { createServerSupabaseClient, createAdminServerSupabaseClient } from "@/lib/supabase/server";

export type PremiumErrorCode =
  | "PREMIUM_REQUIRED"
  | "PREMIUM_EXPIRED"
  | "PREMIUM_NOT_STARTED"
  | "QUOTA_EXHAUSTED"
  | "TEST_UNAVAILABLE"
  | "TEST_ALREADY_STARTED"
  | "TEST_ALREADY_SUBMITTED"
  | "TEST_EXPIRED"
  | "UNAUTHORIZED_TEST_ACCESS";

export type PremiumQuotaKey =
  | "FULL_LENGTH"
  | "PYQ"
  | "SECTIONAL"
  | "TOPIC"
  | "CHALLENGE"
  | "WEAK_AREA"
  | "MISTAKE_REVISION"
  | "PERSONALIZED";

export interface PremiumAccessCheckResult {
  hasAccess: boolean;
  status: "ACTIVE" | "QUOTA_EXHAUSTED" | "PREMIUM_REQUIRED" | "PREMIUM_EXPIRED" | "PREMIUM_NOT_STARTED";
  errorCode?: PremiumErrorCode;
  message?: string;
  entitlementId?: string;
  entitlementType?: string;
  startsAt?: string;
  expiresAt?: string | null;
  quotaKey?: PremiumQuotaKey;
  testType?: string;
  quotaLimit?: number;
  quotaUsed?: number;
  quotaRemaining?: number;
}

export interface PremiumAttemptStartResult {
  success: boolean;
  isNewAttempt?: boolean;
  isExistingAttempt?: boolean;
  isFree?: boolean;
  isPremium?: boolean;
  attemptId?: string;
  status?: string;
  errorCode?: PremiumErrorCode;
  message?: string;
  quotaKey?: PremiumQuotaKey;
  quotaLimit?: number;
  quotaUsed?: number;
  quotaRemaining?: number;
}

export interface QuotaItem {
  quotaKey: PremiumQuotaKey;
  testType: string;
  label: string;
  quotaLimit: number;
  quotaUsed: number;
  quotaRemaining: number;
  isUnlimited: boolean;
}

export class PremiumEntitlementService {
  /**
   * Authoritative read-only check for candidate Premium entitlement & quota.
   */
  static async checkPremiumAccess(
    userId: string,
    examId?: string,
    testType: string = "FULL_LENGTH"
  ): Promise<PremiumAccessCheckResult> {
    const supabase = await createAdminServerSupabaseClient();
    const rpcCall = supabase.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>
    ) => Promise<{ data: unknown; error: { message: string } | null }>;

    const { data, error } = await rpcCall("fn_check_premium_access_and_quota", {
      p_user_id: userId,
      p_exam_id: examId || null,
      p_test_type: testType,
    });

    if (error || !data) {
      return {
        hasAccess: false,
        status: "PREMIUM_REQUIRED",
        errorCode: "PREMIUM_REQUIRED",
        message: error?.message || "Failed to check Premium access",
      };
    }

    const res = data as Record<string, unknown>;
    return {
      hasAccess: Boolean(res.has_access),
      status: (res.status as PremiumAccessCheckResult["status"]) || "PREMIUM_REQUIRED",
      errorCode: res.error_code as PremiumErrorCode | undefined,
      message: res.message as string | undefined,
      entitlementId: res.entitlement_id as string | undefined,
      entitlementType: res.entitlement_type as string | undefined,
      startsAt: res.starts_at as string | undefined,
      expiresAt: res.expires_at as string | null | undefined,
      quotaKey: res.quota_key as PremiumQuotaKey | undefined,
      testType: res.test_type as string | undefined,
      quotaLimit: typeof res.quota_limit === "number" ? res.quota_limit : undefined,
      quotaUsed: typeof res.quota_used === "number" ? res.quota_used : undefined,
      quotaRemaining: typeof res.quota_remaining === "number" ? res.quota_remaining : undefined,
    };
  }

  /**
   * Concurrency-safe atomic attempt starter and quota consumer.
   * Acquires a row lock on user_entitlements to prevent concurrent race condition bypasses.
   */
  static async authorizeAndStartAttempt(
    userId: string,
    mockTestId: string
  ): Promise<PremiumAttemptStartResult> {
    const supabase = await createAdminServerSupabaseClient();
    const rpcCall = supabase.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>
    ) => Promise<{ data: unknown; error: { message: string } | null }>;

    const { data, error } = await rpcCall("fn_authorize_and_start_test_attempt", {
      p_user_id: userId,
      p_mock_test_id: mockTestId,
    });

    if (error || !data) {
      return {
        success: false,
        errorCode: "TEST_UNAVAILABLE",
        message: error?.message || "Failed to start test attempt",
      };
    }

    const res = data as Record<string, unknown>;
    return {
      success: Boolean(res.success),
      isNewAttempt: Boolean(res.is_new_attempt),
      isExistingAttempt: Boolean(res.is_existing_attempt),
      isFree: Boolean(res.is_free),
      isPremium: Boolean(res.is_premium),
      attemptId: res.attempt_id as string | undefined,
      status: res.status as string | undefined,
      errorCode: res.error_code as PremiumErrorCode | undefined,
      message: res.message as string | undefined,
      quotaKey: res.quota_key as PremiumQuotaKey | undefined,
      quotaLimit: typeof res.quota_limit === "number" ? res.quota_limit : undefined,
      quotaUsed: typeof res.quota_used === "number" ? res.quota_used : undefined,
      quotaRemaining: typeof res.quota_remaining === "number" ? res.quota_remaining : undefined,
    };
  }

  /**
   * Returns comprehensive quota breakdown across all 8 supported Premium test types.
   */
  static async getQuotaBreakdown(userId: string, examId?: string): Promise<QuotaItem[]> {
    const testCategories: Array<{ quotaKey: PremiumQuotaKey; testType: string; label: string }> = [
      { quotaKey: "FULL_LENGTH", testType: "full_length", label: "Full-Length Mocks" },
      { quotaKey: "PYQ", testType: "pyq", label: "PYQ Exam Shifts" },
      { quotaKey: "SECTIONAL", testType: "sectional", label: "Sectional Tests" },
      { quotaKey: "TOPIC", testType: "topic", label: "Topic Tests" },
      { quotaKey: "CHALLENGE", testType: "challenge", label: "Challenge Tests" },
      { quotaKey: "WEAK_AREA", testType: "weak_area", label: "Weak Area Tests" },
      { quotaKey: "MISTAKE_REVISION", testType: "mistake_revision", label: "Mistake Revision Tests" },
      { quotaKey: "PERSONALIZED", testType: "personalized", label: "Personalized Mocks" },
    ];

    const results: QuotaItem[] = [];

    for (const item of testCategories) {
      const check = await this.checkPremiumAccess(userId, examId, item.quotaKey);
      const limit = check.quotaLimit ?? 30;
      const used = check.quotaUsed ?? 0;
      const isUnlimited = limit === -1;

      results.push({
        quotaKey: item.quotaKey,
        testType: item.testType,
        label: item.label,
        quotaLimit: limit,
        quotaUsed: used,
        quotaRemaining: isUnlimited ? -1 : Math.max(0, limit - used),
        isUnlimited,
      });
    }

    return results;
  }
}
