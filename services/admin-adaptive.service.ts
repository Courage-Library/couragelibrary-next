import { createAdminServerSupabaseClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";
import { AdaptiveAnalyticsService } from "./adaptive/adaptive-analytics.service";
import type {
  AdaptiveAnalyticsFilters,
  AdaptiveItemAnalyticsFilters,
  AdaptiveOverviewKPIs,
  CandidateIntelligenceReport,
  CandidateAdaptiveDetail,
  ItemIntelligenceReport,
  CATIntelligenceReport,
  AbilityIntelligenceReport,
  StoppingIntelligenceReport,
  PersonalizationIntelligenceReport,
  AlgorithmComparisonReport,
  AdaptiveHealthReport,
  DataQualityDiagnostics,
  AttemptDiagnosticsReport,
} from "./adaptive/adaptive-types";


// ============================================================================
// TYPES & CONSTANTS RE-EXPORTED FROM TYPES/ADMIN-ADAPTIVE
// ============================================================================

export * from "@/types/admin-adaptive";
import {
  AdaptiveAlgorithmStatus,
  AdaptiveModelType,
  AdaptiveEstimationMethod,
  AdaptiveCalibrationStatus,
  AdaptiveAlgorithmVersion,
  AdaptiveGlobalStatus,
  AdaptiveSafetyLimits,
  AdaptiveItemCalibration,
  AdaptiveTestConfigItem,
  AdaptiveAuditLogItem,
  AdaptiveEstimatorConfig,
  AdaptiveEstimatorHealth,
  AbilityExplorerAttemptItem,
  AbilityHistoryRecord,
  AttemptAbilityDetail,
  CATSelectionConfig,
  CATHealthTelemetry,
  ItemInformationExplorerItem,
  AdminStoppingConfig,
  AdminStoppingHealth,
  AdminPersonalizationConfig,
  AdminPersonalizationHealth,
  AdaptiveAdminOverview,
  ItemCalibrationDetailView,
  DEFAULT_CAT_CONFIG,
  DEFAULT_STOPPING_CONFIG,
  DEFAULT_PERSONALIZATION_CONFIG,
  DEFAULT_ESTIMATOR_CONFIG,
  DEFAULT_ADAPTIVE_GLOBAL_STATUS,
  DEFAULT_ADAPTIVE_SAFETY_LIMITS,
} from "@/types/admin-adaptive";

// ============================================================================
// SERVICE IMPLEMENTATION
// ============================================================================

export class AdminAdaptiveService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static getClient(): any {
    return createAdminServerSupabaseClient() as any;
  }

  /**
   * Record immutable audit log into public.admin_audit_logs.
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
    const supabase = this.getClient();
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
      console.error("[AdminAdaptiveService] Audit log failure:", error.message);
      throw new Error(`Failed to record audit log: ${error.message}`);
    }
  }

  // ==========================================================================
  // 1. OVERVIEW & HEALTH TELEMETRY
  // ==========================================================================

  static async getOverview(): Promise<AdaptiveAdminOverview> {
    try {
      const supabase = this.getClient();

      const [
        globalStatus,
        safetyLimits,
        algoVersionsRes,
        configsRes,
        attemptsRes,
        calibrationsRes,
        auditLogsRes,
      ] = await Promise.all([
        this.getGlobalStatus(),
        this.getSafetyLimits(),
        supabase
          .from("adaptive_algorithm_versions")
          .select("*")
          .order("created_at", { ascending: false }),
        supabase.from("adaptive_test_configs").select("id, is_active"),
        supabase.from("adaptive_attempt_states").select("id, status"),
        supabase.from("adaptive_item_calibrations").select("id, calibration_status"),
        supabase
          .from("admin_audit_logs")
          .select("*")
          .in("target_entity", [
            "ADAPTIVE_GLOBAL",
            "ADAPTIVE_ALGORITHM",
            "ADAPTIVE_CONFIG",
            "ADAPTIVE_CALIBRATION",
            "ADAPTIVE_SAFETY",
            "ADAPTIVE_EMERGENCY",
          ])
          .order("created_at", { ascending: false })
          .limit(20),
      ]);

      const allAlgorithmVersions: AdaptiveAlgorithmVersion[] = ((algoVersionsRes?.data as any[]) || []).map((v) => ({
        ...v,
        hyperparameters: (v.hyperparameters as Record<string, unknown>) || {},
        exposure_control_config: (v.exposure_control_config as Record<string, unknown>) || {},
        stopping_rule_defaults: (v.stopping_rule_defaults as AdaptiveAlgorithmVersion["stopping_rule_defaults"]) || {
          min_questions: 20,
          max_questions: 50,
          target_se: 0.35,
        },
      }));

      const activeAlgorithmVersion = allAlgorithmVersions.find((v) => v.is_active) || null;

      const configs = (configsRes?.data as any[]) || [];
      const totalConfigsCount = configs.length;
      const activeConfigsCount = configs.filter((c) => c.is_active).length;

      const attempts = (attemptsRes?.data as any[]) || [];
      const totalAdaptiveAttempts = attempts.length;
      const completedAdaptiveAttempts = attempts.filter((a) => a.status === "completed" || a.status === "stopping_rule_met").length;
      const inProgressAdaptiveAttempts = attempts.filter((a) => a.status === "in_progress").length;

      const calibrations = (calibrationsRes?.data as any[]) || [];
      const calibratedItemsCount = calibrations.filter((c) => c.calibration_status === "calibrated").length;
      const uncalibratedItemsCount = calibrations.filter((c) => c.calibration_status === "uncalibrated" || c.calibration_status === "provisional").length;

      const recentAuditLogs: AdaptiveAuditLogItem[] = ((auditLogsRes?.data as any[]) || []).map((l) => ({
        id: l.id,
        actor_id: l.actor_id,
        actor_email: l.actor_email,
        action_type: l.action_type,
        target_entity: l.target_entity,
        target_id: l.target_id,
        old_value: l.old_value,
        new_value: l.new_value,
        reason: l.reason,
        created_at: l.created_at,
      }));

      return {
        globalStatus,
        safetyLimits,
        activeAlgorithmVersion,
        allAlgorithmVersions,
        totalConfigsCount,
        activeConfigsCount,
        totalAdaptiveAttempts,
        completedAdaptiveAttempts,
        inProgressAdaptiveAttempts,
        calibratedItemsCount,
        uncalibratedItemsCount,
        recentAuditLogs,
      };
    } catch {
      return {
        globalStatus: DEFAULT_ADAPTIVE_GLOBAL_STATUS,
        safetyLimits: DEFAULT_ADAPTIVE_SAFETY_LIMITS,
        activeAlgorithmVersion: null,
        allAlgorithmVersions: [],
        totalConfigsCount: 0,
        activeConfigsCount: 0,
        totalAdaptiveAttempts: 0,
        completedAdaptiveAttempts: 0,
        inProgressAdaptiveAttempts: 0,
        calibratedItemsCount: 0,
        uncalibratedItemsCount: 0,
        recentAuditLogs: [],
      };
    }
  }

  // ==========================================================================
  // 2. GLOBAL STATUS & EMERGENCY KILL SWITCH
  // ==========================================================================

  static async getGlobalStatus(): Promise<AdaptiveGlobalStatus> {
    const supabase = this.getClient();
    const { data, error } = await supabase
      .from("adaptive_system_configs")
      .select("config_value")
      .eq("config_key", "GLOBAL_ADAPTIVE_STATUS")
      .maybeSingle();

    if (error || !data || !data.config_value) {
      return DEFAULT_ADAPTIVE_GLOBAL_STATUS;
    }

    const val = data.config_value as Record<string, unknown>;
    return {
      is_adaptive_enabled: typeof val.is_adaptive_enabled === "boolean" ? val.is_adaptive_enabled : DEFAULT_ADAPTIVE_GLOBAL_STATUS.is_adaptive_enabled,
      is_advanced_adaptive_enabled: typeof val.is_advanced_adaptive_enabled === "boolean" ? val.is_advanced_adaptive_enabled : DEFAULT_ADAPTIVE_GLOBAL_STATUS.is_advanced_adaptive_enabled,
      active_algorithm_version: typeof val.active_algorithm_version === "string" ? val.active_algorithm_version : DEFAULT_ADAPTIVE_GLOBAL_STATUS.active_algorithm_version,
      emergency_disabled: typeof val.emergency_disabled === "boolean" ? val.emergency_disabled : DEFAULT_ADAPTIVE_GLOBAL_STATUS.emergency_disabled,
      emergency_disable_reason: typeof val.emergency_disable_reason === "string" ? val.emergency_disable_reason : null,
      fallback_mode: (val.fallback_mode as AdaptiveGlobalStatus["fallback_mode"]) || DEFAULT_ADAPTIVE_GLOBAL_STATUS.fallback_mode,
      maintenance_mode: typeof val.maintenance_mode === "boolean" ? val.maintenance_mode : DEFAULT_ADAPTIVE_GLOBAL_STATUS.maintenance_mode,
      maintenance_message: typeof val.maintenance_message === "string" ? val.maintenance_message : DEFAULT_ADAPTIVE_GLOBAL_STATUS.maintenance_message,
    };
  }

  static async updateGlobalStatus(
    updates: Partial<AdaptiveGlobalStatus>,
    adminContext: { actorId?: string | null; actorEmail: string; reason?: string }
  ): Promise<AdaptiveGlobalStatus> {
    const current = await this.getGlobalStatus();
    const updated: AdaptiveGlobalStatus = {
      ...current,
      ...updates,
    };

    const supabase = this.getClient();
    const { error } = await supabase
      .from("adaptive_system_configs")
      .upsert({
        config_domain: "GLOBAL",
        config_key: "GLOBAL_ADAPTIVE_STATUS",
        is_enabled: updated.is_adaptive_enabled,
        config_value: updated as unknown as Json,
        updated_at: new Date().toISOString(),
      }, { onConflict: "config_key" });

    if (error) {
      throw new Error(`Failed to update global adaptive status: ${error.message}`);
    }

    await this.recordAuditLog({
      actorId: adminContext.actorId,
      actorEmail: adminContext.actorEmail,
      actionType: "UPDATE_GLOBAL_STATUS",
      targetEntity: "ADAPTIVE_GLOBAL",
      targetId: "GLOBAL_ADAPTIVE_STATUS",
      oldValue: current as unknown as Json,
      newValue: updated as unknown as Json,
      reason: adminContext.reason || "Updated global adaptive status",
    });

    return updated;
  }

  static async toggleEmergencyDisable(
    disabled: boolean,
    reason: string,
    adminContext: { actorId?: string | null; actorEmail: string }
  ): Promise<AdaptiveGlobalStatus> {
    if (disabled && (!reason || reason.trim().length < 5)) {
      throw new Error("A valid explanation (minimum 5 characters) is required when activating emergency disable.");
    }

    return this.updateGlobalStatus(
      {
        emergency_disabled: disabled,
        emergency_disable_reason: disabled ? reason.trim() : null,
      },
      {
        actorId: adminContext.actorId,
        actorEmail: adminContext.actorEmail,
        reason: disabled ? `EMERGENCY DISABLE ACTIVATED: ${reason}` : `Emergency disable cleared: ${reason}`,
      }
    );
  }

  // ==========================================================================
  // 3. SAFETY LIMITS & BOUNDARY VALIDATION
  // ==========================================================================

  static async getSafetyLimits(): Promise<AdaptiveSafetyLimits> {
    const supabase = this.getClient();
    const { data, error } = await supabase
      .from("adaptive_system_configs")
      .select("config_value")
      .eq("config_key", "GLOBAL_SAFETY_LIMITS")
      .maybeSingle();

    if (error || !data || !data.config_value) {
      return DEFAULT_ADAPTIVE_SAFETY_LIMITS;
    }

    const val = data.config_value as Record<string, unknown>;
    return {
      absolute_min_questions: typeof val.absolute_min_questions === "number" ? val.absolute_min_questions : DEFAULT_ADAPTIVE_SAFETY_LIMITS.absolute_min_questions,
      absolute_max_questions: typeof val.absolute_max_questions === "number" ? val.absolute_max_questions : DEFAULT_ADAPTIVE_SAFETY_LIMITS.absolute_max_questions,
      max_item_exposure_ceiling: typeof val.max_item_exposure_ceiling === "number" ? val.max_item_exposure_ceiling : DEFAULT_ADAPTIVE_SAFETY_LIMITS.max_item_exposure_ceiling,
      max_theta_drift_per_step: typeof val.max_theta_drift_per_step === "number" ? val.max_theta_drift_per_step : DEFAULT_ADAPTIVE_SAFETY_LIMITS.max_theta_drift_per_step,
      enforce_blueprint_coverage: typeof val.enforce_blueprint_coverage === "boolean" ? val.enforce_blueprint_coverage : DEFAULT_ADAPTIVE_SAFETY_LIMITS.enforce_blueprint_coverage,
      allow_emergency_fallback: typeof val.allow_emergency_fallback === "boolean" ? val.allow_emergency_fallback : DEFAULT_ADAPTIVE_SAFETY_LIMITS.allow_emergency_fallback,
    };
  }

  static async updateSafetyLimits(
    limits: AdaptiveSafetyLimits,
    adminContext: { actorId?: string | null; actorEmail: string; reason?: string }
  ): Promise<AdaptiveSafetyLimits> {
    // Server-side strict validation
    if (limits.absolute_min_questions <= 0) {
      throw new Error("Absolute min questions must be greater than 0.");
    }
    if (limits.absolute_max_questions < limits.absolute_min_questions) {
      throw new Error("Absolute max questions cannot be less than absolute min questions.");
    }
    if (limits.max_item_exposure_ceiling <= 0 || limits.max_item_exposure_ceiling > 1.0) {
      throw new Error("Max item exposure ceiling must be between 0.01 and 1.0.");
    }
    if (limits.max_theta_drift_per_step <= 0 || limits.max_theta_drift_per_step > 3.0) {
      throw new Error("Max theta drift per step must be between 0.1 and 3.0.");
    }

    const current = await this.getSafetyLimits();
    const supabase = this.getClient();
    const { error } = await supabase
      .from("adaptive_system_configs")
      .upsert({
        config_domain: "SAFETY_LIMITS",
        config_key: "GLOBAL_SAFETY_LIMITS",
        is_enabled: true,
        config_value: limits as unknown as Json,
        updated_at: new Date().toISOString(),
      }, { onConflict: "config_key" });

    if (error) {
      throw new Error(`Failed to update safety limits: ${error.message}`);
    }

    await this.recordAuditLog({
      actorId: adminContext.actorId,
      actorEmail: adminContext.actorEmail,
      actionType: "UPDATE_SAFETY_LIMITS",
      targetEntity: "ADAPTIVE_SAFETY",
      targetId: "GLOBAL_SAFETY_LIMITS",
      oldValue: current as unknown as Json,
      newValue: limits as unknown as Json,
      reason: adminContext.reason || "Updated adaptive safety limits",
    });

    return limits;
  }

  // ==========================================================================
  // 4. ALGORITHM VERSION MANAGEMENT & ROLLBACK
  // ==========================================================================

  static async getAlgorithmVersions(): Promise<AdaptiveAlgorithmVersion[]> {
    try {
      const supabase = this.getClient();
      const { data, error } = await supabase
        .from("adaptive_algorithm_versions")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        return [];
      }

      return ((data as any[]) || []).map((v) => ({
        ...v,
        hyperparameters: (v.hyperparameters as Record<string, unknown>) || {},
        exposure_control_config: (v.exposure_control_config as Record<string, unknown>) || {},
        stopping_rule_defaults: (v.stopping_rule_defaults as AdaptiveAlgorithmVersion["stopping_rule_defaults"]) || {
          min_questions: 20,
          max_questions: 50,
          target_se: 0.35,
        },
      }));
    } catch {
      return [];
    }
  }

  static async createAlgorithmVersion(
    params: {
      version_code: string;
      name: string;
      description?: string;
      status?: AdaptiveAlgorithmStatus;
      model_type: AdaptiveModelType;
      estimation_method: AdaptiveEstimationMethod;
      hyperparameters?: Record<string, unknown>;
      exposure_control_config?: Record<string, unknown>;
      stopping_rule_defaults?: { min_questions: number; max_questions: number; target_se: number };
      release_notes?: string;
    },
    adminContext: { actorId?: string | null; actorEmail: string; reason?: string }
  ): Promise<AdaptiveAlgorithmVersion> {
    if (!params.version_code || !/^[a-zA-Z0-9_\-\.]+$/.test(params.version_code)) {
      throw new Error("Invalid version_code. Use alphanumeric characters, dots, dashes, or underscores.");
    }
    if (!params.name || params.name.trim().length < 3) {
      throw new Error("Name must be at least 3 characters.");
    }

    const stoppingRules = params.stopping_rule_defaults || {
      min_questions: 20,
      max_questions: 50,
      target_se: 0.35,
    };

    if (stoppingRules.min_questions <= 0 || stoppingRules.max_questions < stoppingRules.min_questions) {
      throw new Error("Invalid stopping rule defaults: min_questions must be > 0 and <= max_questions.");
    }

    const supabase = this.getClient();
    const newRecord = {
      version_code: params.version_code.trim(),
      name: params.name.trim(),
      description: params.description?.trim() || null,
      status: params.status || "draft",
      model_type: params.model_type,
      estimation_method: params.estimation_method,
      hyperparameters: params.hyperparameters || {
        initial_theta: 0.0,
        step_size: 0.3,
        min_theta: -3.0,
        max_theta: 3.0,
        convergence_threshold: 0.05,
      },
      exposure_control_config: params.exposure_control_config || {
        strategy: "heuristic_balancing",
        max_item_exposure_rate: 0.30,
      },
      stopping_rule_defaults: stoppingRules,
      is_active: false,
      release_notes: params.release_notes?.trim() || null,
    };

    const { data, error } = await supabase
      .from("adaptive_algorithm_versions")
      .insert(newRecord)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create algorithm version: ${error.message}`);
    }

    await this.recordAuditLog({
      actorId: adminContext.actorId,
      actorEmail: adminContext.actorEmail,
      actionType: "CREATE_ALGORITHM_VERSION",
      targetEntity: "ADAPTIVE_ALGORITHM",
      targetId: data.id,
      newValue: data as unknown as Json,
      reason: adminContext.reason || `Created algorithm version ${params.version_code}`,
    });

    return {
      ...data,
      hyperparameters: (data.hyperparameters as Record<string, unknown>) || {},
      exposure_control_config: (data.exposure_control_config as Record<string, unknown>) || {},
      stopping_rule_defaults: data.stopping_rule_defaults as AdaptiveAlgorithmVersion["stopping_rule_defaults"],
    };
  }

  /**
   * Authoritatively activates an algorithm version or rolls back to a previous one.
   * Atomically marks all other versions is_active = false.
   */
  static async activateAlgorithmVersion(
    versionId: string,
    adminContext: { actorId?: string | null; actorEmail: string; reason?: string }
  ): Promise<AdaptiveAlgorithmVersion> {
    const supabase = this.getClient();

    // 1. Fetch target version
    const { data: targetVersion, error: fetchErr } = await supabase
      .from("adaptive_algorithm_versions")
      .select("*")
      .eq("id", versionId)
      .single();

    if (fetchErr || !targetVersion) {
      throw new Error(`Algorithm version not found: ${versionId}`);
    }

    if (targetVersion.status === "archived") {
      throw new Error("Cannot activate an archived algorithm version. Restore it to draft or testing first.");
    }

    // 2. Fetch current active version for audit old value
    const { data: currentActive } = await supabase
      .from("adaptive_algorithm_versions")
      .select("*")
      .eq("is_active", true)
      .maybeSingle();

    // 3. Atomically deactivate all and activate target
    await supabase
      .from("adaptive_algorithm_versions")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .neq("id", versionId);

    const { data: updatedVersion, error: updateErr } = await supabase
      .from("adaptive_algorithm_versions")
      .update({
        is_active: true,
        status: "active",
        activated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", versionId)
      .select()
      .single();

    if (updateErr || !updatedVersion) {
      throw new Error(`Failed to activate version: ${updateErr?.message}`);
    }

    // 4. Update global adaptive system config active_algorithm_version
    await this.updateGlobalStatus(
      { active_algorithm_version: updatedVersion.version_code },
      {
        actorId: adminContext.actorId,
        actorEmail: adminContext.actorEmail,
        reason: `Auto-updated active algorithm pointer to ${updatedVersion.version_code}`,
      }
    );

    // 5. Record audit log
    await this.recordAuditLog({
      actorId: adminContext.actorId,
      actorEmail: adminContext.actorEmail,
      actionType: "ACTIVATE_ALGORITHM_VERSION",
      targetEntity: "ADAPTIVE_ALGORITHM",
      targetId: versionId,
      oldValue: currentActive as unknown as Json,
      newValue: updatedVersion as unknown as Json,
      reason: adminContext.reason || `Activated algorithm version ${updatedVersion.version_code}`,
    });

    return {
      ...updatedVersion,
      hyperparameters: (updatedVersion.hyperparameters as Record<string, unknown>) || {},
      exposure_control_config: (updatedVersion.exposure_control_config as Record<string, unknown>) || {},
      stopping_rule_defaults: updatedVersion.stopping_rule_defaults as AdaptiveAlgorithmVersion["stopping_rule_defaults"],
    };
  }

  // ==========================================================================
  // 5. TEST CONFIGURATION & BLUEPRINT POLICIES
  // ==========================================================================

  static async getAdaptiveConfigs(): Promise<AdaptiveTestConfigItem[]> {
    try {
      const supabase = this.getClient();
      const { data, error } = await supabase
        .from("adaptive_test_configs")
        .select("*, exams:exam_id(title)")
        .order("created_at", { ascending: false });

      if (error) {
        return [];
      }

      return ((data as any[]) || []).map((row) => ({
        id: row.id,
        exam_id: row.exam_id,
        pattern_id: row.pattern_id,
        test_type: row.test_type,
        title: row.title,
        slug: row.slug,
        version: row.version,
        is_active: row.is_active,
        min_questions: row.min_questions,
        max_questions: row.max_questions,
        target_duration_minutes: row.target_duration_minutes,
        difficulty_policy: (row.difficulty_policy as Record<string, unknown>) || {},
        topic_policy: (row.topic_policy as Record<string, unknown>) || {},
        stopping_policy: (row.stopping_policy as Record<string, unknown>) || {},
        selection_policy: (row.selection_policy as Record<string, unknown>) || {},
        metadata: (row.metadata as Record<string, unknown>) || {},
        created_at: row.created_at,
        updated_at: row.updated_at,
        exam_title: (row.exams as { title: string } | null)?.title || "General Exam",
      }));
    } catch {
      return [];
    }
  }

  static async saveAdaptiveConfig(
    config: {
      id?: string;
      exam_id: string;
      pattern_id?: string | null;
      test_type?: string;
      title: string;
      slug: string;
      is_active?: boolean;
      min_questions: number;
      max_questions: number;
      target_duration_minutes: number;
      difficulty_policy?: Record<string, unknown>;
      topic_policy?: Record<string, unknown>;
      stopping_policy?: Record<string, unknown>;
      selection_policy?: Record<string, unknown>;
      metadata?: Record<string, unknown>;
    },
    adminContext: { actorId?: string | null; actorEmail: string; reason?: string }
  ): Promise<AdaptiveTestConfigItem> {
    // Validation
    if (!config.exam_id) throw new Error("exam_id is required.");
    if (!config.title || config.title.trim().length < 3) throw new Error("Title must be at least 3 characters.");
    if (!config.slug || config.slug.trim().length < 2) throw new Error("Slug is required.");
    if (config.min_questions <= 0) throw new Error("min_questions must be > 0.");
    if (config.max_questions < config.min_questions) throw new Error("max_questions must be >= min_questions.");
    if (config.target_duration_minutes <= 0) throw new Error("target_duration_minutes must be > 0.");

    const supabase = this.getClient();

    let oldData: Json | null = null;
    if (config.id) {
      const { data } = await supabase.from("adaptive_test_configs").select("*").eq("id", config.id).single();
      oldData = data as unknown as Json;
    }

    const payload = {
      exam_id: config.exam_id,
      pattern_id: config.pattern_id || null,
      test_type: config.test_type || "ADAPTIVE_FULL_LENGTH",
      title: config.title.trim(),
      slug: config.slug.trim(),
      is_active: config.is_active ?? true,
      min_questions: config.min_questions,
      max_questions: config.max_questions,
      target_duration_minutes: config.target_duration_minutes,
      difficulty_policy: config.difficulty_policy || { initial_difficulty: "medium", step_size: 0.3, min_theta: -3.0, max_theta: 3.0 },
      topic_policy: config.topic_policy || { coverage_mode: "balanced", max_per_topic: 5 },
      stopping_policy: config.stopping_policy || { type: "standard_error_or_length", target_se: 0.35, min_questions: config.min_questions, max_questions: config.max_questions },
      selection_policy: config.selection_policy || { strategy: "max_fisher_information", exploration_rate: 0.1, exposure_control: true },
      metadata: config.metadata || {},
      updated_at: new Date().toISOString(),
    };

    let resultData: AdaptiveTestConfigItem;

    if (config.id) {
      const { data, error } = await supabase
        .from("adaptive_test_configs")
        .update(payload)
        .eq("id", config.id)
        .select()
        .single();
      if (error) throw new Error(`Failed to update config: ${error.message}`);
      resultData = data as unknown as AdaptiveTestConfigItem;
    } else {
      const { data, error } = await supabase
        .from("adaptive_test_configs")
        .insert(payload)
        .select()
        .single();
      if (error) throw new Error(`Failed to create config: ${error.message}`);
      resultData = data as unknown as AdaptiveTestConfigItem;
    }

    await this.recordAuditLog({
      actorId: adminContext.actorId,
      actorEmail: adminContext.actorEmail,
      actionType: config.id ? "UPDATE_ADAPTIVE_CONFIG" : "CREATE_ADAPTIVE_CONFIG",
      targetEntity: "ADAPTIVE_CONFIG",
      targetId: resultData.id,
      oldValue: oldData,
      newValue: resultData as unknown as Json,
      reason: adminContext.reason || `Saved adaptive blueprint ${config.title}`,
    });

    return resultData;
  }

  // ==========================================================================
  // 6. ITEM CALIBRATION EXPLORER
  // ==========================================================================

  static async getItemCalibrations(params?: {
    status?: AdaptiveCalibrationStatus;
    limit?: number;
    offset?: number;
  }): Promise<{ items: AdaptiveItemCalibration[]; totalCount: number }> {
    const supabase = this.getClient();
    const limit = params?.limit || 50;
    const offset = params?.offset || 0;

    let query = supabase
      .from("adaptive_item_calibrations")
      .select("*, question_versions:question_version_id(content_markdown, difficulty)", { count: "exact" });

    if (params?.status) {
      query = query.eq("calibration_status", params.status);
    }

    const { data, count, error } = await query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      // If table is newly created or empty, return safe empty list
      return { items: [], totalCount: 0 };
    }

    const items: AdaptiveItemCalibration[] = ((data as any[]) || []).map((row) => ({
      id: row.id,
      question_version_id: row.question_version_id,
      algorithm_version_id: row.algorithm_version_id,
      difficulty_b: row.difficulty_b,
      discrimination_a: row.discrimination_a,
      guessing_c: row.guessing_c,
      sample_size: row.sample_size,
      reliability_score: row.reliability_score,
      calibration_status: row.calibration_status as AdaptiveCalibrationStatus,
      calibration_method: row.calibration_method,
      calibration_version: row.calibration_version,
      calibrated_at: row.calibrated_at,
      calibration_metadata: (row.calibration_metadata as Record<string, unknown>) || {},
      created_at: row.created_at,
      updated_at: row.updated_at,
      question_text: (row.question_versions as { content_markdown: string } | null)?.content_markdown || "Question item",
    }));

    return { items, totalCount: count || items.length };
  }

  // ==========================================================================
  // 7. AUDIT TRAIL QUERY
  // ==========================================================================

  static async getAuditLogs(params?: { limit?: number; offset?: number }): Promise<AdaptiveAuditLogItem[]> {
    const supabase = this.getClient();
    const limit = params?.limit || 50;
    const offset = params?.offset || 0;

    const { data, error } = await supabase
      .from("admin_audit_logs")
      .select("*")
      .in("target_entity", [
        "ADAPTIVE_GLOBAL",
        "ADAPTIVE_ALGORITHM",
        "ADAPTIVE_CONFIG",
        "ADAPTIVE_CALIBRATION",
        "ADAPTIVE_SAFETY",
        "ADAPTIVE_EMERGENCY",
      ])
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return [];
    }

    return ((data as any[]) || []).map((l) => ({
      id: l.id,
      actor_id: l.actor_id,
      actor_email: l.actor_email,
      action_type: l.action_type,
      target_entity: l.target_entity,
      target_id: l.target_id,
      old_value: l.old_value,
      new_value: l.new_value,
      reason: l.reason,
      created_at: l.created_at,
    }));
  }

  // ==========================================================================
  // 8. ABILITY ESTIMATOR CONFIGURATION & TELEMETRY
  // ==========================================================================

  static async getEstimatorConfig(): Promise<AdaptiveEstimatorConfig> {
    const supabase = this.getClient();
    try {
      const { data } = await supabase
        .from("adaptive_system_configs")
        .select("config_value")
        .eq("config_key", "ESTIMATOR_CONFIG")
        .maybeSingle();

      if (data && data.config_value) {
        return {
          ...DEFAULT_ESTIMATOR_CONFIG,
          ...(data.config_value as Record<string, unknown>),
        };
      }
    } catch {
      // Fallback to default
    }
    return DEFAULT_ESTIMATOR_CONFIG;
  }

  static async updateEstimatorConfig(
    config: Partial<AdaptiveEstimatorConfig>,
    reason: string,
    actorEmail: string = "system"
  ): Promise<AdaptiveEstimatorConfig> {
    if (!reason || reason.trim().length < 5) {
      throw new Error("A valid reason of at least 5 characters is required to update estimator configuration.");
    }

    const current = await this.getEstimatorConfig();
    const updated: AdaptiveEstimatorConfig = {
      ...current,
      ...config,
    };

    // Safety validations
    if (updated.min_theta >= updated.max_theta) {
      throw new Error("min_theta must be strictly less than max_theta.");
    }
    if (updated.min_se <= 0 || updated.max_se <= updated.min_se) {
      throw new Error("Invalid standard error boundaries (min_se > 0 and max_se > min_se).");
    }
    if (updated.regularization_lambda < 0) {
      throw new Error("regularization_lambda must be non-negative.");
    }

    const supabase = this.getClient();
    await supabase.from("adaptive_system_configs").upsert(
      {
        config_key: "ESTIMATOR_CONFIG",
        config_value: updated as any,
        description: "Global configuration for the adaptive ability estimation engine and numerical solver.",
        is_active: true,
        updated_at: new Date().toISOString(),
      } as any,
      { onConflict: "config_key" }
    );

    await this.recordAuditLog({
      actorEmail,
      actionType: "UPDATE_ESTIMATOR_CONFIG",
      targetEntity: "ADAPTIVE_CONFIG",
      targetId: "ESTIMATOR_CONFIG",
      oldValue: current as any,
      newValue: updated as any,
      reason,
    });

    return updated;
  }

  static async getEstimatorHealth(): Promise<AdaptiveEstimatorHealth> {
    const supabase = this.getClient();
    const config = await this.getEstimatorConfig();

    try {
      const { data: history, count } = await supabase
        .from("adaptive_ability_estimation_history")
        .select("theta_after, se_after, converged, iterations", { count: "exact" })
        .order("created_at", { ascending: false })
        .limit(100);

      const totalCount = count || (history ? history.length : 0);

      if (!history || history.length === 0) {
        return {
          active_estimator: config.active_estimator,
          total_estimations_count: 0,
          converged_count: 0,
          convergence_rate: 1.0,
          average_iterations: 1.0,
          average_theta: 0.0,
          average_se: 1.0,
          failed_estimations_count: 0,
        };
      }

      const rows = history as any[];
      const convergedCount = rows.filter((r) => r.converged).length;
      const totalIter = rows.reduce((acc, r) => acc + (r.iterations || 1), 0);
      const totalTheta = rows.reduce((acc, r) => acc + (r.theta_after || 0), 0);
      const totalSe = rows.reduce((acc, r) => acc + (r.se_after || 1), 0);

      return {
        active_estimator: config.active_estimator,
        total_estimations_count: totalCount,
        converged_count: convergedCount,
        convergence_rate: Number((convergedCount / rows.length).toFixed(4)),
        average_iterations: Number((totalIter / rows.length).toFixed(2)),
        average_theta: Number((totalTheta / rows.length).toFixed(2)),
        average_se: Number((totalSe / rows.length).toFixed(2)),
        failed_estimations_count: rows.length - convergedCount,
      };
    } catch {
      return {
        active_estimator: config.active_estimator,
        total_estimations_count: 0,
        converged_count: 0,
        convergence_rate: 1.0,
        average_iterations: 1.0,
        average_theta: 0.0,
        average_se: 1.0,
        failed_estimations_count: 0,
      };
    }
  }

  static async getAbilityExplorerAttempts(params?: { limit?: number; offset?: number }): Promise<AbilityExplorerAttemptItem[]> {
    const supabase = this.getClient();
    const limit = params?.limit || 50;
    const offset = params?.offset || 0;

    try {
      const { data } = await supabase
        .from("adaptive_attempt_states")
        .select(`
          id,
          attempt_id,
          user_id,
          current_theta,
          standard_error,
          questions_served_count,
          correct_answers_count,
          status,
          stopping_reason,
          updated_at,
          test_attempts!inner(
            id,
            mock_tests(
              title
            )
          )
        `)
        .order("updated_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (!data) return [];

      return (data as any[]).map((row) => ({
        id: row.id,
        attempt_id: row.attempt_id,
        user_id: row.user_id,
        exam_title: row.test_attempts?.mock_tests?.title || "Adaptive Mock Test",
        current_theta: Number((row.current_theta || 0).toFixed(2)),
        standard_error: Number((row.standard_error || 1).toFixed(2)),
        questions_served_count: row.questions_served_count || 0,
        correct_answers_count: row.correct_answers_count || 0,
        status: row.status,
        stopping_reason: row.stopping_reason,
        updated_at: row.updated_at,
      }));
    } catch {
      return [];
    }
  }

  static async getAttemptAbilityDetail(attemptId: string): Promise<AttemptAbilityDetail | null> {
    const supabase = this.getClient();

    try {
      const { data: state } = await supabase
        .from("adaptive_attempt_states")
        .select("*")
        .eq("attempt_id", attemptId)
        .maybeSingle();

      if (!state) return null;

      const { data: history } = await supabase
        .from("adaptive_ability_estimation_history")
        .select("*")
        .eq("attempt_id", attemptId)
        .order("step_number", { ascending: true });

      const historyRecords: AbilityHistoryRecord[] = ((history as any[]) || []).map((h) => ({
        id: h.id,
        step_number: h.step_number,
        question_version_id: h.question_version_id,
        theta_before: Number(h.theta_before.toFixed(2)),
        theta_after: Number(h.theta_after.toFixed(2)),
        se_before: Number(h.se_before.toFixed(2)),
        se_after: Number(h.se_after.toFixed(2)),
        difficulty_b: Number(h.difficulty_b.toFixed(2)),
        difficulty_source: h.difficulty_source,
        is_correct: h.is_correct,
        converged: h.converged,
        iterations: h.iterations,
        effective_information: h.effective_information ? Number(h.effective_information.toFixed(4)) : null,
        created_at: h.created_at,
      }));

      return {
        attempt_id: attemptId,
        user_id: state.user_id,
        current_theta: Number(state.current_theta.toFixed(2)),
        standard_error: Number(state.standard_error.toFixed(2)),
        status: state.status,
        questions_served: state.questions_served_count,
        correct_count: state.correct_answers_count,
        history: historyRecords,
      };
    } catch {
      return null;
    }
  }

  // ==========================================================================
  // PHASE 4D.4: CAT ITEM SELECTION ADMIN METHODS
  // ==========================================================================

  static async getCATConfig(): Promise<CATSelectionConfig> {
    const supabase = this.getClient();

    try {
      const { data } = await supabase
        .from("adaptive_system_configs")
        .select("config_value")
        .eq("config_key", "CAT_SELECTION_CONFIG")
        .maybeSingle();

      if (data && data.config_value) {
        return {
          ...DEFAULT_CAT_CONFIG,
          ...(data.config_value as Record<string, unknown>),
          weights: {
            ...DEFAULT_CAT_CONFIG.weights,
            ...((data.config_value as any).weights || {}),
          },
          topic_constraints: {
            ...DEFAULT_CAT_CONFIG.topic_constraints,
            ...((data.config_value as any).topic_constraints || {}),
          },
          exposure_control: {
            ...DEFAULT_CAT_CONFIG.exposure_control,
            ...((data.config_value as any).exposure_control || {}),
          },
        };
      }
    } catch {
      // fallback
    }

    return DEFAULT_CAT_CONFIG;
  }

  static async updateCATConfig(
    config: Record<string, unknown>,
    reason: string,
    actorEmail: string
  ): Promise<CATSelectionConfig> {
    const supabase = this.getClient();

    const weights = (config.weights as any) || DEFAULT_CAT_CONFIG.weights;
    const totalWeight =
      Number(weights.fisher_information || 0) +
      Number(weights.content_balancing || 0) +
      Number(weights.exploration_value || 0) +
      Number(weights.mistake_bonus || 0) +
      Number(weights.exposure_control || 0);

    if (Math.abs(totalWeight - 1.0) > 0.05) {
      throw new Error(`Total weights sum must be approximately 1.0 (current sum: ${totalWeight.toFixed(2)})`);
    }

    const { data: oldConfig } = await supabase
      .from("adaptive_system_configs")
      .select("config_value")
      .eq("config_key", "CAT_SELECTION_CONFIG")
      .maybeSingle();

    const newConfigValue: CATSelectionConfig = {
      selection_strategy: (config.selection_strategy as string) || "max_fisher_information",
      weights: {
        fisher_information: Number(weights.fisher_information || 0.40),
        content_balancing: Number(weights.content_balancing || 0.25),
        exploration_value: Number(weights.exploration_value || 0.15),
        mistake_bonus: Number(weights.mistake_bonus || 0.10),
        exposure_control: Number(weights.exposure_control || 0.10),
      },
      topic_constraints: {
        max_consecutive_streak: Number((config.topic_constraints as any)?.max_consecutive_streak || 3),
        max_per_topic: Number((config.topic_constraints as any)?.max_per_topic || 5),
        enforce_blueprint: (config.topic_constraints as any)?.enforce_blueprint ?? true,
      },
      exposure_control: {
        enabled: (config.exposure_control as any)?.enabled ?? true,
        max_exposure_ceiling: Number((config.exposure_control as any)?.max_exposure_ceiling || 50),
        penalty_rate: Number((config.exposure_control as any)?.penalty_rate || 0.02),
      },
      tie_breaking: (config.tie_breaking as string) || "deterministic_hash_or_id",
    };

    const { error: upsertError } = await supabase
      .from("adaptive_system_configs")
      .upsert({
        config_key: "CAT_SELECTION_CONFIG",
        config_value: newConfigValue as any,
        description: "Global configuration for CAT 1PL Maximum Information item selection.",
        updated_at: new Date().toISOString(),
      });

    if (upsertError) {
      throw new Error(`Failed to save CAT configuration: ${upsertError.message}`);
    }

    await this.recordAuditLog({
      actorEmail,
      actionType: "UPDATE_CAT_CONFIG",
      targetEntity: "adaptive_system_configs",
      targetId: "CAT_SELECTION_CONFIG",
      oldValue: (oldConfig?.config_value as any) || null,
      newValue: newConfigValue as any,
      reason,
    });

    return newConfigValue;
  }

  static async getCATHealth(): Promise<CATHealthTelemetry> {
    const supabase = this.getClient();

    try {
      const { data: decisions } = await supabase
        .from("adaptive_question_decisions")
        .select("question_version_id, selection_strategy, decision_metadata")
        .limit(500);

      const decisionRows = (decisions as any[]) || [];
      const totalDecisions = decisionRows.length;
      const strategyDistribution: Record<string, number> = {};
      const exposureCounts: Record<string, number> = {};
      let totalCandidatesEval = 0;
      let streakMitigated = 0;

      for (const d of decisionRows) {
        const strat = d.selection_strategy || "max_fisher_information";
        strategyDistribution[strat] = (strategyDistribution[strat] || 0) + 1;
        exposureCounts[d.question_version_id] = (exposureCounts[d.question_version_id] || 0) + 1;

        if (d.decision_metadata && typeof d.decision_metadata === "object") {
          totalCandidatesEval += Number(d.decision_metadata.total_candidates_evaluated || 0);
          if (
            d.decision_metadata.strategy_applied === "CAT_FALLBACK_STREAK_RELAXED" ||
            (d.decision_metadata.score_breakdown && d.decision_metadata.score_breakdown.repetition_penalty > 0)
          ) {
            streakMitigated++;
          }
        }
      }

      const exposureValues = Object.values(exposureCounts);
      const uniqueItems = exposureValues.length;
      const maxExposure = exposureValues.length > 0 ? Math.max(...exposureValues) : 0;
      const avgExposure = exposureValues.length > 0
        ? Number((exposureValues.reduce((a, b) => a + b, 0) / uniqueItems).toFixed(1))
        : 0;
      const avgCandidates = totalDecisions > 0
        ? Number((totalCandidatesEval / totalDecisions).toFixed(1))
        : 0;

      return {
        active_strategy: "CAT 1PL Maximum Information",
        total_decisions_count: totalDecisions,
        strategy_distribution: strategyDistribution,
        average_candidates_evaluated: avgCandidates,
        max_exposure_recorded: maxExposure,
        average_item_exposure: avgExposure,
        unique_items_served: uniqueItems,
        streak_violations_mitigated: streakMitigated,
      };
    } catch {
      return {
        active_strategy: "CAT 1PL Maximum Information",
        total_decisions_count: 0,
        strategy_distribution: {},
        average_candidates_evaluated: 0,
        max_exposure_recorded: 0,
        average_item_exposure: 0,
        unique_items_served: 0,
        streak_violations_mitigated: 0,
      };
    }
  }

  static async getItemInformationExplorer(
    targetTheta: number = 0.0,
    limit: number = 50
  ): Promise<ItemInformationExplorerItem[]> {
    const supabase = this.getClient();

    try {
      const { data: qvs } = await supabase
        .from("question_versions")
        .select(`
          id,
          difficulty,
          questions(
            question_text,
            canonical_topic_id,
            topics(
              name
            )
          )
        `)
        .eq("is_current", true)
        .limit(limit);

      if (!qvs) return [];

      const qvIds = (qvs as any[]).map((q) => q.id);
      let calibMap: Record<string, { status: string; difficulty_b: number | null }> = {};
      let expMap: Record<string, number> = {};

      if (qvIds.length > 0) {
        const { data: calibs } = await (supabase as any)
          .from("adaptive_item_calibrations")
          .select("question_version_id, calibration_status, difficulty_b")
          .in("question_version_id", qvIds);

        if (calibs) {
          for (const c of calibs) {
            calibMap[c.question_version_id] = {
              status: c.calibration_status,
              difficulty_b: c.difficulty_b,
            };
          }
        }

        const { data: decisions } = await (supabase as any)
          .from("adaptive_question_decisions")
          .select("question_version_id")
          .in("question_version_id", qvIds);

        if (decisions) {
          for (const d of decisions) {
            expMap[d.question_version_id] = (expMap[d.question_version_id] || 0) + 1;
          }
        }
      }

      const items: ItemInformationExplorerItem[] = [];

      for (const qv of qvs as any[]) {
        const calib = calibMap[qv.id];
        let diffB = 0.0;
        let diffTier = qv.difficulty || "medium";

        if (calib && typeof calib.difficulty_b === "number") {
          diffB = calib.difficulty_b;
          diffTier = diffB < -0.8 ? "easy" : diffB > 0.8 ? "hard" : "medium";
        } else {
          diffTier = (qv.difficulty as any) || "medium";
          diffB = diffTier === "easy" ? -1.0 : diffTier === "hard" ? 1.0 : 0.0;
        }

        const diff = targetTheta - diffB;
        const clampedDiff = Math.max(-15, Math.min(15, diff));
        const p = 1 / (1 + Math.exp(-clampedDiff));
        const info = p * (1 - p);
        const normInfo = Math.min(1.0, info / 0.25);

        items.push({
          question_version_id: qv.id,
          question_text: qv.questions?.question_text || "Question Text",
          topic_name: qv.questions?.topics?.name || "General",
          difficulty_tier: diffTier,
          difficulty_b: Number(diffB.toFixed(2)),
          calibration_status: calib?.status || "uncalibrated",
          fisher_information: Number(info.toFixed(4)),
          normalized_information: Number(normInfo.toFixed(4)),
          exposure_count: expMap[qv.id] || 0,
        });
      }

      items.sort((a, b) => b.fisher_information - a.fisher_information);
      return items;
    } catch {
      return [];
    }
  }


  // ==========================================================================
  // PHASE 4D.5: STOPPING & PERSONALIZATION ADMIN METHODS
  // ==========================================================================

  static async getStoppingConfig(): Promise<AdminStoppingConfig> {
    const supabase = this.getClient();

    try {
      const { data } = await supabase
        .from("adaptive_system_configs")
        .select("config_value")
        .eq("config_key", "STOPPING_CONFIG")
        .maybeSingle();

      if (data && data.config_value) {
        return {
          ...DEFAULT_STOPPING_CONFIG,
          ...(data.config_value as Record<string, unknown>),
        };
      }
    } catch {
      // fallback
    }

    return DEFAULT_STOPPING_CONFIG;
  }

  static async updateStoppingConfig(
    config: Record<string, unknown>,
    reason: string,
    actorEmail: string
  ): Promise<AdminStoppingConfig> {
    const supabase = this.getClient();

    const minQ = Number(config.min_questions ?? DEFAULT_STOPPING_CONFIG.min_questions);
    const maxQ = Number(config.max_questions ?? DEFAULT_STOPPING_CONFIG.max_questions);
    const targetSe = Number(config.target_se ?? DEFAULT_STOPPING_CONFIG.target_se);

    if (minQ <= 0 || maxQ <= 0 || minQ > maxQ) {
      throw new Error("min_questions must be greater than 0 and less than or equal to max_questions.");
    }
    if (targetSe <= 0 || targetSe > 1.0) {
      throw new Error("target_se must be strictly between 0 and 1.0.");
    }

    const { data: oldConfig } = await supabase
      .from("adaptive_system_configs")
      .select("config_value")
      .eq("config_key", "STOPPING_CONFIG")
      .maybeSingle();

    const newConfigValue: AdminStoppingConfig = {
      min_questions: minQ,
      max_questions: maxQ,
      target_se: targetSe,
      diminishing_info_threshold: Number(config.diminishing_info_threshold ?? DEFAULT_STOPPING_CONFIG.diminishing_info_threshold),
      diminishing_info_window: Number(config.diminishing_info_window ?? DEFAULT_STOPPING_CONFIG.diminishing_info_window),
      enforce_blueprint: config.enforce_blueprint !== false,
      enforce_topic_coverage: config.enforce_topic_coverage !== false,
      allow_early_stopping: config.allow_early_stopping !== false,
    };

    const { error: upsertError } = await supabase
      .from("adaptive_system_configs")
      .upsert({
        config_key: "STOPPING_CONFIG",
        config_value: newConfigValue as any,
        description: "Global configuration for server-authoritative psychometric stopping rules and diminishing information detection.",
        updated_at: new Date().toISOString(),
      });

    if (upsertError) {
      throw new Error(`Failed to save stopping configuration: ${upsertError.message}`);
    }

    await this.recordAuditLog({
      actorEmail,
      actionType: "UPDATE_STOPPING_CONFIG",
      targetEntity: "adaptive_system_configs",
      targetId: "STOPPING_CONFIG",
      oldValue: (oldConfig?.config_value as any) || null,
      newValue: newConfigValue as any,
      reason,
    });

    return newConfigValue;
  }

  static async getStoppingHealth(): Promise<AdminStoppingHealth> {
    const supabase = this.getClient();

    try {
      const { data: attempts } = await supabase
        .from("adaptive_attempt_states")
        .select("questions_served_count, standard_error, status, stopping_reason")
        .in("status", ["stopping_rule_met", "completed", "terminated"]);

      const rows = (attempts as any[]) || [];
      let totalCompleted = 0;
      let maxQCount = 0;
      let targetSeCount = 0;
      let blueprintCount = 0;
      let noItemsCount = 0;
      let expiryCount = 0;
      let diminishingCount = 0;
      let sumQuestions = 0;
      let sumSe = 0;

      for (const row of rows) {
        totalCompleted++;
        sumQuestions += Number(row.questions_served_count || 0);
        sumSe += Number(row.standard_error || 1.0);

        const r = row.stopping_reason;
        if (r === "MAX_QUESTIONS_REACHED") maxQCount++;
        else if (r === "TARGET_SE_ACHIEVED" || r === "TARGET_PRECISION_ACHIEVED") targetSeCount++;
        else if (r === "BLUEPRINT_INCOMPLETE") blueprintCount++;
        else if (r === "NO_ELIGIBLE_ITEMS" || r === "POOL_EXHAUSTED") noItemsCount++;
        else if (r === "ATTEMPT_EXPIRED" || r === "TIME_EXPIRED") expiryCount++;
        else if (r === "DIMINISHING_INFORMATION") diminishingCount++;
      }

      const avgQuestions = totalCompleted > 0 ? Number((sumQuestions / totalCompleted).toFixed(1)) : 0;
      const avgSe = totalCompleted > 0 ? Number((sumSe / totalCompleted).toFixed(2)) : 0;

      return {
        total_completed_attempts: totalCompleted,
        stopped_by_max_questions: maxQCount,
        stopped_by_target_se: targetSeCount,
        stopped_by_blueprint: blueprintCount,
        stopped_by_no_eligible_items: noItemsCount,
        stopped_by_expiry: expiryCount,
        stopped_by_diminishing_info: diminishingCount,
        average_questions_served: avgQuestions,
        average_final_se: avgSe,
      };
    } catch {
      return {
        total_completed_attempts: 0,
        stopped_by_max_questions: 0,
        stopped_by_target_se: 0,
        stopped_by_blueprint: 0,
        stopped_by_no_eligible_items: 0,
        stopped_by_expiry: 0,
        stopped_by_diminishing_info: 0,
        average_questions_served: 0,
        average_final_se: 0,
      };
    }
  }

  static async getPersonalizationConfig(): Promise<AdminPersonalizationConfig> {
    const supabase = this.getClient();

    try {
      const { data } = await supabase
        .from("adaptive_system_configs")
        .select("config_value")
        .eq("config_key", "PERSONALIZATION_CONFIG")
        .maybeSingle();

      if (data && data.config_value) {
        return {
          ...DEFAULT_PERSONALIZATION_CONFIG,
          ...(data.config_value as Record<string, unknown>),
          weights: {
            ...DEFAULT_PERSONALIZATION_CONFIG.weights,
            ...((data.config_value as any).weights || {}),
          },
        };
      }
    } catch {
      // fallback
    }

    return DEFAULT_PERSONALIZATION_CONFIG;
  }

  static async updatePersonalizationConfig(
    config: Record<string, unknown>,
    reason: string,
    actorEmail: string
  ): Promise<AdminPersonalizationConfig> {
    const supabase = this.getClient();

    const maxInfluence = Math.min(0.40, Math.max(0.0, Number(config.max_influence ?? DEFAULT_PERSONALIZATION_CONFIG.max_influence)));
    const weights = (config.weights as any) || DEFAULT_PERSONALIZATION_CONFIG.weights;
    const totalWeight =
      Number(weights.weak_area || 0) +
      Number(weights.mistake_vault || 0) +
      Number(weights.exploration || 0) +
      Number(weights.subject_balance || 0);

    if (Math.abs(totalWeight - 1.0) > 0.05) {
      throw new Error(`Total personalization weights sum must be approximately 1.0 (current sum: ${totalWeight.toFixed(2)})`);
    }

    const { data: oldConfig } = await supabase
      .from("adaptive_system_configs")
      .select("config_value")
      .eq("config_key", "PERSONALIZATION_CONFIG")
      .maybeSingle();

    const newConfigValue: AdminPersonalizationConfig = {
      enabled: config.enabled !== false,
      max_influence: maxInfluence,
      weights: {
        weak_area: Number(weights.weak_area || 0.35),
        mistake_vault: Number(weights.mistake_vault || 0.25),
        exploration: Number(weights.exploration || 0.20),
        subject_balance: Number(weights.subject_balance || 0.20),
      },
      recency_window_attempts: Number(config.recency_window_attempts ?? DEFAULT_PERSONALIZATION_CONFIG.recency_window_attempts),
      cold_start_threshold_questions: Number(config.cold_start_threshold_questions ?? DEFAULT_PERSONALIZATION_CONFIG.cold_start_threshold_questions),
      warm_start_enabled: config.warm_start_enabled !== false,
    };

    const { error: upsertError } = await supabase
      .from("adaptive_system_configs")
      .upsert({
        config_key: "PERSONALIZATION_CONFIG",
        config_value: newConfigValue as any,
        description: "Global configuration for bounded educational personalization, topic weakness reinforcement, and exploration balancing.",
        updated_at: new Date().toISOString(),
      });

    if (upsertError) {
      throw new Error(`Failed to save personalization configuration: ${upsertError.message}`);
    }

    await this.recordAuditLog({
      actorEmail,
      actionType: "UPDATE_PERSONALIZATION_CONFIG",
      targetEntity: "adaptive_system_configs",
      targetId: "PERSONALIZATION_CONFIG",
      oldValue: (oldConfig?.config_value as any) || null,
      newValue: newConfigValue as any,
      reason,
    });

    return newConfigValue;
  }

  static async getPersonalizationHealth(): Promise<AdminPersonalizationHealth> {
    const supabase = this.getClient();

    try {
      const { data: decisions } = await supabase
        .from("adaptive_question_decisions")
        .select("decision_metadata")
        .limit(500);

      const rows = (decisions as any[]) || [];
      let totalPersonalized = 0;
      let weakAreaBoosts = 0;
      let mistakeReinforced = 0;
      let explorationCount = 0;

      for (const row of rows) {
        totalPersonalized++;
        const meta = row.decision_metadata;
        if (meta && typeof meta === "object") {
          if (meta.score_breakdown) {
            if (meta.score_breakdown.mistake_bonus > 0) mistakeReinforced++;
            if (meta.score_breakdown.exploration_score > 0.5) explorationCount++;
            if (meta.score_breakdown.topic_priority_score > 0.5) weakAreaBoosts++;
          }
        }
      }

      const { count: coldCount } = await supabase
        .from("user_adaptive_profiles")
        .select("id", { count: "exact", head: true })
        .lt("total_adaptive_questions_answered", 5);

      const { count: warmCount } = await supabase
        .from("user_adaptive_profiles")
        .select("id", { count: "exact", head: true })
        .gte("total_adaptive_questions_answered", 5);

      return {
        total_personalized_attempts: totalPersonalized,
        weak_area_boosted_decisions: weakAreaBoosts,
        mistake_reinforced_decisions: mistakeReinforced,
        exploration_decisions: explorationCount,
        cold_starts_count: coldCount || 0,
        warm_starts_count: warmCount || 0,
      };
    } catch {
      return {
        total_personalized_attempts: 0,
        weak_area_boosted_decisions: 0,
        mistake_reinforced_decisions: 0,
        exploration_decisions: 0,
        cold_starts_count: 0,
        warm_starts_count: 0,
      };
    }
  }

  // ==========================================================================
  // 12. PHASE 4D.6: ADAPTIVE ANALYTICS & ADMIN INTELLIGENCE
  // ==========================================================================

  static async getAdaptiveOverview(filters?: AdaptiveAnalyticsFilters): Promise<AdaptiveOverviewKPIs> {
    const analytics = new AdaptiveAnalyticsService(this.getClient());
    return analytics.getAdaptiveOverview(filters);
  }

  static async getCandidateIntelligence(filters?: AdaptiveAnalyticsFilters): Promise<CandidateIntelligenceReport> {
    const analytics = new AdaptiveAnalyticsService(this.getClient());
    return analytics.getCandidateIntelligence(filters);
  }

  static async getCandidateAdaptiveDetail(userId: string, examId?: string): Promise<CandidateAdaptiveDetail | null> {
    const analytics = new AdaptiveAnalyticsService(this.getClient());
    return analytics.getCandidateAdaptiveDetail(userId, examId);
  }

  static async getItemIntelligence(filters?: AdaptiveItemAnalyticsFilters): Promise<ItemIntelligenceReport> {
    const analytics = new AdaptiveAnalyticsService(this.getClient());
    return analytics.getItemIntelligence(filters);
  }

  static async getCATIntelligence(filters?: AdaptiveAnalyticsFilters): Promise<CATIntelligenceReport> {
    const analytics = new AdaptiveAnalyticsService(this.getClient());
    return analytics.getCATIntelligence(filters);
  }

  static async getAbilityIntelligence(filters?: AdaptiveAnalyticsFilters): Promise<AbilityIntelligenceReport> {
    const analytics = new AdaptiveAnalyticsService(this.getClient());
    return analytics.getAbilityIntelligence(filters);
  }

  static async getStoppingIntelligence(filters?: AdaptiveAnalyticsFilters): Promise<StoppingIntelligenceReport> {
    const analytics = new AdaptiveAnalyticsService(this.getClient());
    return analytics.getStoppingIntelligence(filters);
  }

  static async getPersonalizationIntelligence(filters?: AdaptiveAnalyticsFilters): Promise<PersonalizationIntelligenceReport> {
    const analytics = new AdaptiveAnalyticsService(this.getClient());
    return analytics.getPersonalizationIntelligence(filters);
  }

  static async getAlgorithmComparison(filters?: AdaptiveAnalyticsFilters): Promise<AlgorithmComparisonReport> {
    const analytics = new AdaptiveAnalyticsService(this.getClient());
    return analytics.getAlgorithmComparison(filters);
  }

  static async getAdaptiveHealth(filters?: AdaptiveAnalyticsFilters): Promise<AdaptiveHealthReport> {
    const analytics = new AdaptiveAnalyticsService(this.getClient());
    return analytics.getAdaptiveHealth(filters);
  }

  static async getDataQualityDiagnostics(): Promise<DataQualityDiagnostics> {
    const analytics = new AdaptiveAnalyticsService(this.getClient());
    return analytics.getDataQualityDiagnostics();
  }

  static async getAttemptDiagnostics(attemptId: string): Promise<AttemptDiagnosticsReport | null> {
    const analytics = new AdaptiveAnalyticsService(this.getClient());
    return analytics.getAttemptDiagnostics(attemptId);
  }
}

