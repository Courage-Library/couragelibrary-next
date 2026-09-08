import { createAdminServerSupabaseClient } from "@/lib/supabase/server";
import { PremiumEntitlementService, PremiumQuotaKey } from "@/services/premium-entitlement.service";
import type { Json } from "@/types/database";

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export type PremiumConfigDomain = "GLOBAL" | "EXAM" | "TEST_TYPE" | "GENERATOR_POLICY";

export interface GlobalPremiumConfig {
  is_premium_enabled: boolean;
  maintenance_mode: boolean;
  maintenance_message: string;
  emergency_disable_reason: string | null;
}

export interface ExamPremiumConfig {
  exam_id: string;
  exam_title: string;
  exam_slug: string;
  is_enabled: boolean;
}

export interface TestTypePremiumConfig {
  test_type: PremiumQuotaKey;
  label: string;
  is_enabled: boolean;
  is_supported: boolean;
}

export interface GeneratorPolicyConfig {
  dynamic_test_ttl_hours: number;
  min_pool_multiplier: number;
  max_weak_area_ratio: number;
  min_syllabus_ratio: number;
  max_active_dynamic_tests_per_user: number;
}

export interface AdminAuditLogItem {
  id: string;
  actor_id: string | null;
  actor_email: string;
  action_type: string;
  target_entity: string;
  target_id: string | null;
  old_value: Json | null;
  new_value: Json | null;
  reason: string | null;
  created_at: string;
}

export interface PremiumAnalyticsSummary {
  activePremiumCandidates: number;
  totalPremiumEntitlements: number;
  totalPremiumAttempts: number;
  completedPremiumAttempts: number;
  completionRatePct: number;
  quotaUsageByType: Record<string, number>;
  dynamicMocksGenerated: number;
}

export interface PremiumAdminOverview {
  globalConfig: GlobalPremiumConfig;
  generatorPolicy: GeneratorPolicyConfig;
  examConfigs: ExamPremiumConfig[];
  testTypeConfigs: TestTypePremiumConfig[];
  analytics: PremiumAnalyticsSummary;
  recentAuditLogs: AdminAuditLogItem[];
}

export interface CandidateEntitlementInfo {
  id: string;
  entitlementType: string;
  planId: string | null;
  planName: string | null;
  examId: string | null;
  examTitle: string | null;
  startsAt: string;
  expiresAt: string | null;
  isActive: boolean;
  customLimits: Record<string, unknown>;
  createdAt: string;
}

export interface CandidateLookupResult {
  user: {
    id: string;
    email: string;
    fullName?: string;
  };
  entitlements: CandidateEntitlementInfo[];
  quotaSummary: Array<{
    quotaKey: PremiumQuotaKey;
    label: string;
    quotaLimit: number;
    quotaUsed: number;
    quotaRemaining: number;
    isUnlimited: boolean;
  }>;
  totalAttemptsCount: number;
}

// ============================================================================
// SUPPORTED & FUTURE TEST TYPES CONSTANTS
// ============================================================================

export const SUPPORTED_PREMIUM_TEST_TYPES: Array<{ test_type: PremiumQuotaKey; label: string }> = [
  { test_type: "FULL_LENGTH", label: "Full-Length Mocks" },
  { test_type: "PYQ", label: "PYQ Exam Shifts" },
  { test_type: "SECTIONAL", label: "Sectional Tests" },
  { test_type: "TOPIC", label: "Topic Tests" },
  { test_type: "CHALLENGE", label: "Challenge Tests" },
  { test_type: "WEAK_AREA", label: "Weak Area Tests" },
  { test_type: "MISTAKE_REVISION", label: "Mistake Revision Tests" },
  { test_type: "PERSONALIZED", label: "Personalized Mocks" },
];

export const UNSUPPORTED_FUTURE_TEST_TYPES = ["ADAPTIVE", "LIVE"];

// Default Fallback Configurations
const DEFAULT_GLOBAL_CONFIG: GlobalPremiumConfig = {
  is_premium_enabled: true,
  maintenance_mode: false,
  maintenance_message: "Premium practice systems are currently undergoing scheduled maintenance. Daily Mocks remain active.",
  emergency_disable_reason: null,
};

const DEFAULT_POLICY_CONFIG: GeneratorPolicyConfig = {
  dynamic_test_ttl_hours: 48,
  min_pool_multiplier: 3,
  max_weak_area_ratio: 0.70,
  min_syllabus_ratio: 0.30,
  max_active_dynamic_tests_per_user: 5,
};

// ============================================================================
// SERVICE IMPLEMENTATION
// ============================================================================

export class AdminPremiumService {
  /**
   * Helper to write an immutable administrative audit log.
   * Throws an error if audit log creation fails to ensure transactional integrity.
   */
  static async recordAuditLog(params: {
    actorId?: string | null;
    actorEmail: string;
    actionType: string;
    targetEntity: string;
    targetId?: string | null;
    oldValue?: Json | null;
    newValue?: Json | null;
    reason?: string | null;
  }): Promise<void> {
    const supabase = createAdminServerSupabaseClient();
    const { error } = await supabase.from("admin_audit_logs").insert({
      actor_id: params.actorId || null,
      actor_email: params.actorEmail,
      action_type: params.actionType,
      target_entity: params.targetEntity,
      target_id: params.targetId || null,
      old_value: params.oldValue ?? null,
      new_value: params.newValue ?? null,
      reason: params.reason || null,
    });

    if (error) {
      console.error("[AdminAuditLog] Failed to record audit entry:", error.message);
      throw new Error(`Failed to create audit log: ${error.message}`);
    }
  }

  // ==========================================================================
  // 1. GLOBAL PREMIUM CONTROL
  // ==========================================================================

  /**
   * Read authoritative global Premium status and maintenance configuration.
   */
  static async getGlobalConfig(): Promise<GlobalPremiumConfig> {
    const supabase = createAdminServerSupabaseClient();
    const { data, error } = await supabase
      .from("premium_system_configs")
      .select("config_value")
      .eq("config_key", "GLOBAL_PREMIUM_STATUS")
      .maybeSingle();

    if (error || !data || !data.config_value) {
      return DEFAULT_GLOBAL_CONFIG;
    }

    const val = data.config_value as Record<string, unknown>;
    return {
      is_premium_enabled: typeof val.is_premium_enabled === "boolean" ? val.is_premium_enabled : DEFAULT_GLOBAL_CONFIG.is_premium_enabled,
      maintenance_mode: typeof val.maintenance_mode === "boolean" ? val.maintenance_mode : DEFAULT_GLOBAL_CONFIG.maintenance_mode,
      maintenance_message: typeof val.maintenance_message === "string" ? val.maintenance_message : DEFAULT_GLOBAL_CONFIG.maintenance_message,
      emergency_disable_reason: typeof val.emergency_disable_reason === "string" ? val.emergency_disable_reason : null,
    };
  }

  /**
   * Update global Premium status / maintenance mode with mandatory audit trail.
   */
  static async updateGlobalConfig(params: {
    isPremiumEnabled?: boolean;
    maintenanceMode?: boolean;
    maintenanceMessage?: string;
    emergencyDisableReason?: string | null;
    reason: string;
    actorEmail: string;
    actorId?: string;
  }): Promise<{ success: boolean; config: GlobalPremiumConfig }> {
    if (!params.reason || params.reason.trim().length === 0) {
      throw new Error("A specific reason is required for administrative configuration changes.");
    }

    const currentConfig = await this.getGlobalConfig();
    const updatedConfig: GlobalPremiumConfig = {
      is_premium_enabled: typeof params.isPremiumEnabled === "boolean" ? params.isPremiumEnabled : currentConfig.is_premium_enabled,
      maintenance_mode: typeof params.maintenanceMode === "boolean" ? params.maintenanceMode : currentConfig.maintenance_mode,
      maintenance_message: typeof params.maintenanceMessage === "string" && params.maintenanceMessage.trim().length > 0
        ? params.maintenanceMessage.trim()
        : currentConfig.maintenance_message,
      emergency_disable_reason: params.emergencyDisableReason !== undefined
        ? params.emergencyDisableReason
        : currentConfig.emergency_disable_reason,
    };

    const supabase = createAdminServerSupabaseClient();
    const { error } = await supabase
      .from("premium_system_configs")
      .upsert({
        config_domain: "GLOBAL",
        config_key: "GLOBAL_PREMIUM_STATUS",
        is_enabled: updatedConfig.is_premium_enabled,
        config_value: updatedConfig as unknown as Json,
        updated_by: params.actorId || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "config_key" });

    if (error) {
      throw new Error(`Failed to update global Premium configuration: ${error.message}`);
    }

    let actionType = "PREMIUM_GLOBAL_CONFIG_UPDATED";
    if (currentConfig.is_premium_enabled !== updatedConfig.is_premium_enabled) {
      actionType = updatedConfig.is_premium_enabled ? "PREMIUM_GLOBAL_ENABLED" : "PREMIUM_GLOBAL_DISABLED";
    } else if (currentConfig.maintenance_mode !== updatedConfig.maintenance_mode) {
      actionType = updatedConfig.maintenance_mode ? "PREMIUM_MAINTENANCE_ENABLED" : "PREMIUM_MAINTENANCE_DISABLED";
    }

    await this.recordAuditLog({
      actorId: params.actorId,
      actorEmail: params.actorEmail,
      actionType,
      targetEntity: "premium_system_configs",
      targetId: "GLOBAL_PREMIUM_STATUS",
      oldValue: currentConfig as unknown as Json,
      newValue: updatedConfig as unknown as Json,
      reason: params.reason,
    });

    return { success: true, config: updatedConfig };
  }

  // ==========================================================================
  // 2. EXAM-WISE PREMIUM AVAILABILITY
  // ==========================================================================

  /**
   * List all exams along with their configured Premium availability status.
   */
  static async listExamAvailability(): Promise<ExamPremiumConfig[]> {
    const supabase = createAdminServerSupabaseClient();

    const [examsRes, configsRes] = await Promise.all([
      supabase.from("exams").select("id, title, slug, is_active").order("title", { ascending: true }),
      supabase.from("premium_system_configs").select("config_key, is_enabled, config_value").eq("config_domain", "EXAM"),
    ]);

    const examConfigsMap = new Map<string, boolean>();
    (configsRes.data || []).forEach(c => {
      const val = c.config_value as Record<string, unknown>;
      const examId = (val?.exam_id as string) || c.config_key.replace("PREMIUM_EXAM_", "");
      examConfigsMap.set(examId, Boolean(c.is_enabled));
    });

    return (examsRes.data || []).map(exam => ({
      exam_id: exam.id,
      exam_title: exam.title,
      exam_slug: exam.slug,
      is_enabled: examConfigsMap.has(exam.id) ? (examConfigsMap.get(exam.id) ?? true) : exam.is_active,
    }));
  }

  /**
   * Enable or disable Premium for a specific exam with audit logging.
   */
  static async setExamAvailability(params: {
    examId: string;
    isEnabled: boolean;
    reason: string;
    actorEmail: string;
    actorId?: string;
  }): Promise<{ success: boolean; examId: string; isEnabled: boolean }> {
    if (!params.examId) throw new Error("Exam ID is required.");
    if (!params.reason || params.reason.trim().length === 0) {
      throw new Error("Reason is required to update exam availability.");
    }

    const supabase = createAdminServerSupabaseClient();
    const { data: exam, error: examErr } = await supabase
      .from("exams")
      .select("id, title")
      .eq("id", params.examId)
      .maybeSingle();

    if (examErr || !exam) {
      throw new Error("Target exam not found.");
    }

    const configKey = `PREMIUM_EXAM_${params.examId}`;
    const { data: oldConfig } = await supabase
      .from("premium_system_configs")
      .select("is_enabled, config_value")
      .eq("config_key", configKey)
      .maybeSingle();

    const oldState = oldConfig ? { is_enabled: oldConfig.is_enabled, ...(oldConfig.config_value as Record<string, unknown>) } : null;
    const newState = { exam_id: params.examId, is_enabled: params.isEnabled, exam_title: exam.title };

    const { error: upsertErr } = await supabase
      .from("premium_system_configs")
      .upsert({
        config_domain: "EXAM",
        config_key: configKey,
        is_enabled: params.isEnabled,
        config_value: newState as unknown as Json,
        updated_by: params.actorId || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "config_key" });

    if (upsertErr) {
      throw new Error(`Failed to update exam availability: ${upsertErr.message}`);
    }

    await this.recordAuditLog({
      actorId: params.actorId,
      actorEmail: params.actorEmail,
      actionType: params.isEnabled ? "PREMIUM_EXAM_ENABLED" : "PREMIUM_EXAM_DISABLED",
      targetEntity: "premium_system_configs",
      targetId: configKey,
      oldValue: oldState as unknown as Json,
      newValue: newState as unknown as Json,
      reason: params.reason,
    });

    return { success: true, examId: params.examId, isEnabled: params.isEnabled };
  }

  // ==========================================================================
  // 3. TEST-TYPE GOVERNANCE
  // ==========================================================================

  /**
   * List availability of all 8 supported Premium test types.
   */
  static async listTestTypeAvailability(): Promise<TestTypePremiumConfig[]> {
    const supabase = createAdminServerSupabaseClient();
    const { data: configs } = await supabase
      .from("premium_system_configs")
      .select("config_key, is_enabled, config_value")
      .eq("config_domain", "TEST_TYPE");

    const configsMap = new Map<string, boolean>();
    (configs || []).forEach(c => {
      const val = c.config_value as Record<string, unknown>;
      const testType = (val?.test_type as string) || c.config_key.replace("PREMIUM_TEST_TYPE_", "");
      configsMap.set(testType.toUpperCase(), Boolean(c.is_enabled));
    });

    return SUPPORTED_PREMIUM_TEST_TYPES.map(st => ({
      test_type: st.test_type,
      label: st.label,
      is_enabled: configsMap.has(st.test_type) ? (configsMap.get(st.test_type) ?? true) : true,
      is_supported: true,
    }));
  }

  /**
   * Enable or disable a specific Premium test type.
   * Explicitly blocks activation of unsupported future types (ADAPTIVE, LIVE).
   */
  static async setTestTypeAvailability(params: {
    testType: string;
    isEnabled: boolean;
    reason: string;
    actorEmail: string;
    actorId?: string;
  }): Promise<{ success: boolean; testType: string; isEnabled: boolean }> {
    const normalizedType = params.testType.toUpperCase().trim();

    if (UNSUPPORTED_FUTURE_TEST_TYPES.includes(normalizedType)) {
      throw new Error(`Test type "${normalizedType}" is a future architectural capability and cannot be enabled yet.`);
    }

    const isSupported = SUPPORTED_PREMIUM_TEST_TYPES.some(st => st.test_type === normalizedType);
    if (!isSupported) {
      throw new Error(`Invalid test type "${params.testType}".`);
    }

    if (!params.reason || params.reason.trim().length === 0) {
      throw new Error("Reason is required to modify test-type availability.");
    }

    const configKey = `PREMIUM_TEST_TYPE_${normalizedType}`;
    const supabase = createAdminServerSupabaseClient();

    const { data: oldConfig } = await supabase
      .from("premium_system_configs")
      .select("is_enabled, config_value")
      .eq("config_key", configKey)
      .maybeSingle();

    const oldState = oldConfig ? { is_enabled: oldConfig.is_enabled, ...(oldConfig.config_value as Record<string, unknown>) } : null;
    const newState = { test_type: normalizedType, is_enabled: params.isEnabled };

    const { error: upsertErr } = await supabase
      .from("premium_system_configs")
      .upsert({
        config_domain: "TEST_TYPE",
        config_key: configKey,
        is_enabled: params.isEnabled,
        config_value: newState as unknown as Json,
        updated_by: params.actorId || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "config_key" });

    if (upsertErr) {
      throw new Error(`Failed to update test-type availability: ${upsertErr.message}`);
    }

    await this.recordAuditLog({
      actorId: params.actorId,
      actorEmail: params.actorEmail,
      actionType: params.isEnabled ? "PREMIUM_TEST_TYPE_ENABLED" : "PREMIUM_TEST_TYPE_DISABLED",
      targetEntity: "premium_system_configs",
      targetId: configKey,
      oldValue: oldState as unknown as Json,
      newValue: newState as unknown as Json,
      reason: params.reason,
    });

    return { success: true, testType: normalizedType, isEnabled: params.isEnabled };
  }

  // ==========================================================================
  // 4. GENERATOR POLICY MANAGEMENT
  // ==========================================================================

  /**
   * Read authoritative generator policy constraints.
   */
  static async getGeneratorPolicy(): Promise<GeneratorPolicyConfig> {
    const supabase = createAdminServerSupabaseClient();
    const { data, error } = await supabase
      .from("premium_system_configs")
      .select("config_value")
      .eq("config_key", "DEFAULT_GENERATOR_POLICY")
      .maybeSingle();

    if (error || !data || !data.config_value) {
      return DEFAULT_POLICY_CONFIG;
    }

    const val = data.config_value as Record<string, unknown>;
    return {
      dynamic_test_ttl_hours: typeof val.dynamic_test_ttl_hours === "number" ? val.dynamic_test_ttl_hours : DEFAULT_POLICY_CONFIG.dynamic_test_ttl_hours,
      min_pool_multiplier: typeof val.min_pool_multiplier === "number" ? val.min_pool_multiplier : DEFAULT_POLICY_CONFIG.min_pool_multiplier,
      max_weak_area_ratio: typeof val.max_weak_area_ratio === "number" ? val.max_weak_area_ratio : DEFAULT_POLICY_CONFIG.max_weak_area_ratio,
      min_syllabus_ratio: typeof val.min_syllabus_ratio === "number" ? val.min_syllabus_ratio : DEFAULT_POLICY_CONFIG.min_syllabus_ratio,
      max_active_dynamic_tests_per_user: typeof val.max_active_dynamic_tests_per_user === "number" ? val.max_active_dynamic_tests_per_user : DEFAULT_POLICY_CONFIG.max_active_dynamic_tests_per_user,
    };
  }

  /**
   * Update dynamic generator policy constraints with strict validation.
   */
  static async updateGeneratorPolicy(params: {
    policy: Partial<GeneratorPolicyConfig>;
    reason: string;
    actorEmail: string;
    actorId?: string;
  }): Promise<{ success: boolean; policy: GeneratorPolicyConfig }> {
    if (!params.reason || params.reason.trim().length === 0) {
      throw new Error("Reason is required to update generator policy.");
    }

    const currentPolicy = await this.getGeneratorPolicy();
    const p = params.policy;

    // Strict validation
    if (p.dynamic_test_ttl_hours !== undefined) {
      if (typeof p.dynamic_test_ttl_hours !== "number" || p.dynamic_test_ttl_hours <= 0 || p.dynamic_test_ttl_hours > 720) {
        throw new Error("Dynamic test TTL must be between 1 and 720 hours (30 days).");
      }
    }
    if (p.min_pool_multiplier !== undefined) {
      if (typeof p.min_pool_multiplier !== "number" || p.min_pool_multiplier < 1 || p.min_pool_multiplier > 20) {
        throw new Error("Minimum pool multiplier must be between 1 and 20.");
      }
    }
    if (p.max_weak_area_ratio !== undefined) {
      if (typeof p.max_weak_area_ratio !== "number" || p.max_weak_area_ratio < 0 || p.max_weak_area_ratio > 1.0) {
        throw new Error("Maximum weak area ratio must be between 0.0 and 1.0.");
      }
    }
    if (p.min_syllabus_ratio !== undefined) {
      if (typeof p.min_syllabus_ratio !== "number" || p.min_syllabus_ratio < 0 || p.min_syllabus_ratio > 1.0) {
        throw new Error("Minimum syllabus ratio must be between 0.0 and 1.0.");
      }
    }
    if (p.max_active_dynamic_tests_per_user !== undefined) {
      if (typeof p.max_active_dynamic_tests_per_user !== "number" || p.max_active_dynamic_tests_per_user < 1 || p.max_active_dynamic_tests_per_user > 50) {
        throw new Error("Max active dynamic tests per user must be between 1 and 50.");
      }
    }

    const updatedPolicy: GeneratorPolicyConfig = {
      dynamic_test_ttl_hours: p.dynamic_test_ttl_hours ?? currentPolicy.dynamic_test_ttl_hours,
      min_pool_multiplier: p.min_pool_multiplier ?? currentPolicy.min_pool_multiplier,
      max_weak_area_ratio: p.max_weak_area_ratio ?? currentPolicy.max_weak_area_ratio,
      min_syllabus_ratio: p.min_syllabus_ratio ?? currentPolicy.min_syllabus_ratio,
      max_active_dynamic_tests_per_user: p.max_active_dynamic_tests_per_user ?? currentPolicy.max_active_dynamic_tests_per_user,
    };

    const supabase = createAdminServerSupabaseClient();
    const { error: upsertErr } = await supabase
      .from("premium_system_configs")
      .upsert({
        config_domain: "GENERATOR_POLICY",
        config_key: "DEFAULT_GENERATOR_POLICY",
        is_enabled: true,
        config_value: updatedPolicy as unknown as Json,
        updated_by: params.actorId || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "config_key" });

    if (upsertErr) {
      throw new Error(`Failed to update generator policy: ${upsertErr.message}`);
    }

    await this.recordAuditLog({
      actorId: params.actorId,
      actorEmail: params.actorEmail,
      actionType: "PREMIUM_GENERATOR_POLICY_UPDATED",
      targetEntity: "premium_system_configs",
      targetId: "DEFAULT_GENERATOR_POLICY",
      oldValue: currentPolicy as unknown as Json,
      newValue: updatedPolicy as unknown as Json,
      reason: params.reason,
    });

    return { success: true, policy: updatedPolicy };
  }

  // ==========================================================================
  // 5. USER-SPECIFIC PREMIUM ACCESS
  // ==========================================================================

  /**
   * Search for a candidate by email or UUID to inspect and administer Premium access.
   */
  static async searchCandidate(emailOrId: string): Promise<CandidateLookupResult> {
    const trimmed = emailOrId.trim();
    if (!trimmed) throw new Error("Please provide a candidate email address or user ID.");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = createAdminServerSupabaseClient() as any;

    // 1. Fetch user list from auth to resolve email reliably
    const { data: authData } = await supabase.auth.admin.listUsers();
    const allUsers = authData?.users || [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const targetUser = allUsers.find((u: any) =>
      u.email?.toLowerCase() === trimmed.toLowerCase() || u.id === trimmed
    );

    if (!targetUser) {
      throw new Error(`Candidate "${trimmed}" was not found in the platform directory.`);
    }

    // 2. Fetch user profile
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("id, full_name")
      .eq("id", targetUser.id)
      .maybeSingle();

    // 3. Query active & historical entitlements
    const { data: rawEntitlements } = await supabase
      .from("user_entitlements")
      .select(`
        id,
        entitlement_type,
        plan_id,
        exam_id,
        starts_at,
        expires_at,
        is_active,
        custom_limits,
        created_at,
        subscription_plans ( name ),
        exams ( title )
      `)
      .eq("user_id", targetUser.id)
      .order("created_at", { ascending: false });

    // Format entitlements
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const entitlements: CandidateEntitlementInfo[] = (rawEntitlements || []).map((raw: any) => ({
      id: raw.id,
      entitlementType: raw.entitlement_type,
      planId: raw.plan_id,
      planName: raw.subscription_plans?.name || null,
      examId: raw.exam_id,
      examTitle: raw.exams?.title || null,
      startsAt: raw.starts_at,
      expiresAt: raw.expires_at,
      isActive: Boolean(raw.is_active),
      customLimits: (raw.custom_limits as Record<string, unknown>) || {},
      createdAt: raw.created_at,
    }));

    // 4. Calculate live quota breakdown across all 8 supported test types
    const quotaSummary = await PremiumEntitlementService.getQuotaBreakdown(targetUser.id);

    // 5. Get total attempts count
    const { count: attemptsCount } = await supabase
      .from("test_attempts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", targetUser.id);

    return {
      user: {
        id: targetUser.id,
        email: targetUser.email || "No Email",
        fullName: profile?.full_name || targetUser.user_metadata?.full_name || undefined,
      },
      entitlements,
      quotaSummary,
      totalAttemptsCount: attemptsCount || 0,
    };
  }

  /**
   * Grant a candidate a promotional Premium pass using the standard PROMOTIONAL_PASS entitlement type.
   */
  static async grantPromotionalPass(params: {
    userId: string;
    examId?: string | null;
    durationDays: number;
    customLimits?: Record<string, number>;
    reason: string;
    actorEmail: string;
    actorId?: string;
  }): Promise<{ success: boolean; entitlementId: string }> {
    if (!params.userId) throw new Error("User ID is required.");
    if (!params.durationDays || params.durationDays <= 0) {
      throw new Error("Duration must be at least 1 day.");
    }
    if (!params.reason || params.reason.trim().length === 0) {
      throw new Error("Reason is required to grant promotional access.");
    }

    const supabase = createAdminServerSupabaseClient();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + params.durationDays * 24 * 60 * 60 * 1000);

    const entitlementPayload = {
      user_id: params.userId,
      entitlement_type: "PROMOTIONAL_PASS",
      exam_id: params.examId || null,
      starts_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      is_active: true,
      custom_limits: (params.customLimits || {}) as unknown as Json,
    };

    const { data: newEntitlement, error: insertErr } = await supabase
      .from("user_entitlements")
      .insert(entitlementPayload)
      .select("id")
      .single();

    if (insertErr || !newEntitlement) {
      throw new Error(`Failed to grant promotional entitlement: ${insertErr?.message || "Unknown error"}`);
    }

    await this.recordAuditLog({
      actorId: params.actorId,
      actorEmail: params.actorEmail,
      actionType: "PROMOTIONAL_PASS_GRANTED",
      targetEntity: "user_entitlements",
      targetId: newEntitlement.id,
      oldValue: null,
      newValue: {
        ...entitlementPayload,
        duration_days: params.durationDays,
      } as unknown as Json,
      reason: params.reason,
    });

    return { success: true, entitlementId: newEntitlement.id };
  }

  /**
   * Revoke/expire a candidate's active entitlement.
   */
  static async revokeEntitlement(params: {
    entitlementId: string;
    reason: string;
    actorEmail: string;
    actorId?: string;
  }): Promise<{ success: boolean }> {
    if (!params.entitlementId) throw new Error("Entitlement ID is required.");
    if (!params.reason || params.reason.trim().length === 0) {
      throw new Error("Reason is required to revoke an entitlement.");
    }

    const supabase = createAdminServerSupabaseClient();
    const { data: oldEnt, error: fetchErr } = await supabase
      .from("user_entitlements")
      .select("*")
      .eq("id", params.entitlementId)
      .maybeSingle();

    if (fetchErr || !oldEnt) {
      throw new Error("Target entitlement not found.");
    }

    const nowIso = new Date().toISOString();
    const { error: updateErr } = await supabase
      .from("user_entitlements")
      .update({
        is_active: false,
        expires_at: nowIso,
        updated_at: nowIso,
      })
      .eq("id", params.entitlementId);

    if (updateErr) {
      throw new Error(`Failed to revoke entitlement: ${updateErr.message}`);
    }

    await this.recordAuditLog({
      actorId: params.actorId,
      actorEmail: params.actorEmail,
      actionType: "ENTITLEMENT_REVOKED",
      targetEntity: "user_entitlements",
      targetId: params.entitlementId,
      oldValue: oldEnt as unknown as Json,
      newValue: { is_active: false, expires_at: nowIso } as unknown as Json,
      reason: params.reason,
    });

    return { success: true };
  }

  /**
   * Update custom quota overrides on an existing entitlement.
   */
  static async updateCustomLimits(params: {
    entitlementId: string;
    customLimits: Record<string, number>;
    reason: string;
    actorEmail: string;
    actorId?: string;
  }): Promise<{ success: boolean }> {
    if (!params.entitlementId) throw new Error("Entitlement ID is required.");
    if (!params.reason || params.reason.trim().length === 0) {
      throw new Error("Reason is required to update custom limits.");
    }

    const supabase = createAdminServerSupabaseClient();
    const { data: oldEnt, error: fetchErr } = await supabase
      .from("user_entitlements")
      .select("id, user_id, custom_limits")
      .eq("id", params.entitlementId)
      .maybeSingle();

    if (fetchErr || !oldEnt) {
      throw new Error("Target entitlement not found.");
    }

    const { error: updateErr } = await supabase
      .from("user_entitlements")
      .update({
        custom_limits: params.customLimits as unknown as Json,
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.entitlementId);

    if (updateErr) {
      throw new Error(`Failed to update custom limits: ${updateErr.message}`);
    }

    await this.recordAuditLog({
      actorId: params.actorId,
      actorEmail: params.actorEmail,
      actionType: "ENTITLEMENT_CUSTOM_LIMITS_UPDATED",
      targetEntity: "user_entitlements",
      targetId: params.entitlementId,
      oldValue: { custom_limits: oldEnt.custom_limits } as unknown as Json,
      newValue: { custom_limits: params.customLimits } as unknown as Json,
      reason: params.reason,
    });

    return { success: true };
  }

  // ==========================================================================
  // 6. CURATED SERIES / MOCK GOVERNANCE
  // ==========================================================================

  /**
   * List Premium test series.
   */
  static async listPremiumTestSeries(examId?: string): Promise<any[]> {
    const supabase = createAdminServerSupabaseClient();
    let query = supabase
      .from("test_series")
      .select(`
        id,
        title,
        series_type,
        exam_id,
        is_premium,
        is_active,
        display_order,
        metadata,
        created_at,
        exams ( title, slug )
      `)
      .order("display_order", { ascending: true });

    if (examId) {
      query = query.eq("exam_id", examId);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(`Failed to fetch test series: ${error.message}`);
    }
    return data || [];
  }

  /**
   * Toggle activation status of a test series.
   */
  static async toggleTestSeriesStatus(params: {
    seriesId: string;
    isActive: boolean;
    reason: string;
    actorEmail: string;
    actorId?: string;
  }): Promise<{ success: boolean }> {
    if (!params.seriesId) throw new Error("Series ID is required.");
    if (!params.reason || params.reason.trim().length === 0) {
      throw new Error("Reason is required to update series status.");
    }

    const supabase = createAdminServerSupabaseClient();
    const { data: oldSeries, error: fetchErr } = await supabase
      .from("test_series")
      .select("id, title, is_active")
      .eq("id", params.seriesId)
      .maybeSingle();

    if (fetchErr || !oldSeries) {
      throw new Error("Test series not found.");
    }

    const { error: updateErr } = await supabase
      .from("test_series")
      .update({
        is_active: params.isActive,
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.seriesId);

    if (updateErr) {
      throw new Error(`Failed to update test series: ${updateErr.message}`);
    }

    await this.recordAuditLog({
      actorId: params.actorId,
      actorEmail: params.actorEmail,
      actionType: params.isActive ? "TEST_SERIES_ACTIVATED" : "TEST_SERIES_DEACTIVATED",
      targetEntity: "test_series",
      targetId: params.seriesId,
      oldValue: { is_active: oldSeries.is_active } as unknown as Json,
      newValue: { is_active: params.isActive } as unknown as Json,
      reason: params.reason,
    });

    return { success: true };
  }

  /**
   * List curated Premium mock tests (non-dynamic) for review and publishing.
   */
  static async listCuratedPremiumMocks(examId?: string): Promise<any[]> {
    const supabase = createAdminServerSupabaseClient();
    const query = supabase
      .from("mock_tests")
      .select(`
        id,
        title,
        slug,
        is_free,
        is_dynamic,
        lifecycle_status,
        generation_metadata,
        created_at,
        mock_templates (
          id,
          title,
          test_type,
          exam_id,
          exams ( title )
        )
      `)
      .eq("is_dynamic", false)
      .order("created_at", { ascending: false });

    const { data, error } = await query;
    if (error) {
      throw new Error(`Failed to fetch curated mocks: ${error.message}`);
    }

    let results = data || [];
    if (examId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      results = results.filter((m: any) => m.mock_templates?.exam_id === examId);
    }

    return results;
  }

  /**
   * Update curated mock lifecycle status (`DRAFT`, `PUBLISHED`, `ARCHIVED`) and featuring metadata.
   */
  static async updateMockCuratedStatus(params: {
    mockTestId: string;
    lifecycleStatus?: "DRAFT" | "PUBLISHED" | "ARCHIVED";
    isFeatured?: boolean;
    curatedBadge?: string | null;
    reason: string;
    actorEmail: string;
    actorId?: string;
  }): Promise<{ success: boolean }> {
    if (!params.mockTestId) throw new Error("Mock test ID is required.");
    if (!params.reason || params.reason.trim().length === 0) {
      throw new Error("Reason is required to update curated mock status.");
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = createAdminServerSupabaseClient() as any;
    const { data: oldMock, error: fetchErr } = await supabase
      .from("mock_tests")
      .select("id, title, lifecycle_status, generation_metadata")
      .eq("id", params.mockTestId)
      .maybeSingle();

    if (fetchErr || !oldMock) {
      throw new Error("Target mock test not found.");
    }

    const currentMeta = (oldMock.generation_metadata as Record<string, unknown>) || {};
    const updatedMeta: Record<string, unknown> = {
      ...currentMeta,
      ...(params.isFeatured !== undefined ? { is_featured: params.isFeatured } : {}),
      ...(params.curatedBadge !== undefined ? { curated_badge: params.curatedBadge } : {}),
    };

    const updatePayload: Record<string, unknown> = {
      generation_metadata: updatedMeta,
      updated_at: new Date().toISOString(),
    };

    if (params.lifecycleStatus) {
      updatePayload.lifecycle_status = params.lifecycleStatus;
    }

    const { error: updateErr } = await supabase
      .from("mock_tests")
      .update(updatePayload)
      .eq("id", params.mockTestId);

    if (updateErr) {
      throw new Error(`Failed to update mock test status: ${updateErr.message}`);
    }

    await this.recordAuditLog({
      actorId: params.actorId,
      actorEmail: params.actorEmail,
      actionType: "CURATED_MOCK_STATUS_UPDATED",
      targetEntity: "mock_tests",
      targetId: params.mockTestId,
      oldValue: {
        lifecycle_status: oldMock.lifecycle_status,
        generation_metadata: oldMock.generation_metadata,
      } as unknown as Json,
      newValue: {
        lifecycle_status: params.lifecycleStatus || oldMock.lifecycle_status,
        generation_metadata: updatedMeta,
      } as unknown as Json,
      reason: params.reason,
    });

    return { success: true };
  }

  // ==========================================================================
  // 7. PREMIUM ANALYTICS SERVICE
  // ==========================================================================

  /**
   * Derive live Premium ecosystem analytics without adding new analytics tables.
   * Strictly filters active candidates by entitlement_type IN ('PRO_SUBSCRIPTION', 'PROMOTIONAL_PASS').
   */
  static async getPremiumAnalytics(): Promise<PremiumAnalyticsSummary> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = createAdminServerSupabaseClient() as any;
    const nowIso = new Date().toISOString();

    const [activeEntitlementsRes, totalEntitlementsRes, attemptsRes, dynamicMocksRes] = await Promise.all([
      // A. Active Premium Candidates
      supabase
        .from("user_entitlements")
        .select("user_id")
        .in("entitlement_type", ["PRO_SUBSCRIPTION", "PROMOTIONAL_PASS"])
        .eq("is_active", true)
        .lte("starts_at", nowIso)
        .or(`expires_at.is.null,expires_at.gt.${nowIso}`),

      // B. Total Premium Entitlements
      supabase
        .from("user_entitlements")
        .select("id", { count: "exact", head: true })
        .in("entitlement_type", ["PRO_SUBSCRIPTION", "PROMOTIONAL_PASS"]),

      // C. Premium Test Attempts (started, submitted, completed)
      supabase
        .from("test_attempts")
        .select(`
          id,
          status,
          mock_tests!inner (
            is_free,
            mock_templates ( test_type )
          )
        `)
        .eq("mock_tests.is_free", false),

      // D. Dynamic Mock Instances Generated
      supabase
        .from("mock_tests")
        .select("id", { count: "exact", head: true })
        .eq("is_dynamic", true),
    ]);

    // Compute unique active candidate count
    const uniqueActiveUserIds = new Set<string>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (activeEntitlementsRes.data || []).forEach((e: any) => {
      if (e.user_id) uniqueActiveUserIds.add(e.user_id);
    });

    // Compute test starts, completions, and quota usage breakdown
    const attempts = attemptsRes.data || [];
    const totalAttempts = attempts.length;
    let completedCount = 0;
    const quotaUsageMap: Record<string, number> = {
      FULL_LENGTH: 0,
      PYQ: 0,
      SECTIONAL: 0,
      TOPIC: 0,
      CHALLENGE: 0,
      WEAK_AREA: 0,
      MISTAKE_REVISION: 0,
      PERSONALIZED: 0,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    attempts.forEach((att: any) => {
      if (["submitted", "completed", "auto_submitted"].includes(att.status)) {
        completedCount++;
      }
      const rawType = att.mock_tests?.mock_templates?.test_type || "FULL_LENGTH";
      const normKey = rawType.toUpperCase();
      if (quotaUsageMap[normKey] !== undefined) {
        quotaUsageMap[normKey]++;
      } else {
        quotaUsageMap.FULL_LENGTH++;
      }
    });

    const completionRate = totalAttempts > 0 ? Math.round((completedCount / totalAttempts) * 100) : 0;

    return {
      activePremiumCandidates: uniqueActiveUserIds.size,
      totalPremiumEntitlements: totalEntitlementsRes.count || 0,
      totalPremiumAttempts: totalAttempts,
      completedPremiumAttempts: completedCount,
      completionRatePct: completionRate,
      quotaUsageByType: quotaUsageMap,
      dynamicMocksGenerated: dynamicMocksRes.count || 0,
    };
  }

  // ==========================================================================
  // 8. AUDIT LOG EXPLORER SERVICE
  // ==========================================================================

  /**
   * Query immutable administrative audit logs with filtering and pagination.
   */
  static async listAuditLogs(params: {
    actorEmail?: string;
    actionType?: string;
    targetEntity?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<{ logs: AdminAuditLogItem[]; totalCount: number }> {
    const supabase = createAdminServerSupabaseClient();
    const limit = Math.min(params.limit || 50, 100);
    const offset = params.offset || 0;

    let query = supabase
      .from("admin_audit_logs")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (params.actorEmail) {
      query = query.ilike("actor_email", `%${params.actorEmail.trim()}%`);
    }
    if (params.actionType) {
      query = query.eq("action_type", params.actionType.trim());
    }
    if (params.targetEntity) {
      query = query.eq("target_entity", params.targetEntity.trim());
    }

    const { data, count, error } = await query;
    if (error) {
      throw new Error(`Failed to fetch audit logs: ${error.message}`);
    }

    return {
      logs: (data || []) as AdminAuditLogItem[],
      totalCount: count || 0,
    };
  }

  // ==========================================================================
  // 9. CONSOLIDATED ADMIN READ MODEL
  // ==========================================================================

  /**
   * Consolidated overview read model for the future Premium Admin Control Center.
   */
  static async getPremiumAdminOverview(): Promise<PremiumAdminOverview> {
    const [globalConfig, generatorPolicy, examConfigs, testTypeConfigs, analytics, recentLogs] = await Promise.all([
      this.getGlobalConfig(),
      this.getGeneratorPolicy(),
      this.listExamAvailability(),
      this.listTestTypeAvailability(),
      this.getPremiumAnalytics(),
      this.listAuditLogs({ limit: 10 }),
    ]);

    return {
      globalConfig,
      generatorPolicy,
      examConfigs,
      testTypeConfigs,
      analytics,
      recentAuditLogs: recentLogs.logs,
    };
  }
}
