"use client";
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */

import React, { useState, useTransition } from "react";
import {
  type AdaptiveAdminOverview,
  type AdaptiveAlgorithmVersion,
  type AdaptiveTestConfigItem,
  type AdaptiveItemCalibration,
  type AdaptiveAuditLogItem,
  type AdaptiveGlobalStatus,
  type AdaptiveSafetyLimits,
  type AdaptiveEstimatorConfig,
  type AdaptiveEstimatorHealth,
  type AbilityExplorerAttemptItem,
  type AttemptAbilityDetail,
  type CATSelectionConfig,
  type CATHealthTelemetry,
  type ItemInformationExplorerItem,
  type AdminStoppingConfig,
  type AdminStoppingHealth,
  type AdminPersonalizationConfig,
  type AdminPersonalizationHealth,
  type ItemCalibrationDetailView,
  DEFAULT_ESTIMATOR_CONFIG,
  DEFAULT_CAT_CONFIG,
  DEFAULT_STOPPING_CONFIG,
  DEFAULT_PERSONALIZATION_CONFIG,
} from "@/types/admin-adaptive";
import { AdaptiveAnalyticsView } from "./adaptive-analytics-view";
import {
  updateAdaptiveGlobalStatusAction,
  toggleAdaptiveEmergencyAction,
  updateAdaptiveSafetyLimitsAction,
  createAdaptiveAlgorithmVersionAction,
  activateAdaptiveAlgorithmVersionAction,
  saveAdaptiveConfigAction,
  recalibrateItemAction,
  recalibrateBatchAction,
  flagQuestionVersionAction,
  unflagQuestionVersionAction,
  deprecateQuestionVersionAction,
  restoreQuestionVersionAction,
  getItemCalibrationDetailAction,
  updateEstimatorConfigAction,
  getAttemptAbilityDetailAction,
  getCATConfigAction,
  updateCATConfigAction,
  getCATHealthAction,
  getItemInformationExplorerAction,
  getStoppingConfigAction,
  updateStoppingConfigAction,
  getStoppingHealthAction,
  getPersonalizationConfigAction,
  updatePersonalizationConfigAction,
  getPersonalizationHealthAction,
} from "@/app/admin/adaptive/actions";
import { Badge } from "@/components/ui/badge";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  Clock,
  Cpu,
  Database,
  Eye,
  FileCode2,
  Filter,
  Flag,
  Gauge,
  History,
  Info,
  Layers,
  Lock,
  Plus,
  RefreshCw,
  RotateCcw,
  Scale,
  Search,
  Shield,
  ShieldAlert,
  Sliders,
  Sparkles,
  Trash2,
  Undo2,
  Zap,
  Target,
  TrendingUp,
} from "lucide-react";

interface Props {
  initialOverview: AdaptiveAdminOverview;
  initialConfigs: AdaptiveTestConfigItem[];
  initialCalibrations: { items: AdaptiveItemCalibration[]; totalCount: number };
  initialAuditLogs: AdaptiveAuditLogItem[];
  initialEstimatorConfig?: AdaptiveEstimatorConfig;
  initialEstimatorHealth?: AdaptiveEstimatorHealth;
  initialExplorerAttempts?: AbilityExplorerAttemptItem[];
  initialCATConfig?: CATSelectionConfig;
  initialCATHealth?: CATHealthTelemetry;
  initialStoppingConfig?: AdminStoppingConfig;
  initialStoppingHealth?: AdminStoppingHealth;
  initialPersonalizationConfig?: AdminPersonalizationConfig;
  initialPersonalizationHealth?: AdminPersonalizationHealth;
  userEmail: string;
}

type TabType = "overview" | "analytics" | "versions" | "blueprints" | "calibration" | "ability" | "cat" | "stopping" | "personalization" | "safety" | "audit";


export function AdminAdaptiveManager({
  initialOverview,
  initialConfigs,
  initialCalibrations,
  initialAuditLogs,
  initialEstimatorConfig,
  initialEstimatorHealth,
  initialExplorerAttempts,
  initialCATConfig,
  initialCATHealth,
  initialStoppingConfig,
  initialStoppingHealth,
  initialPersonalizationConfig,
  initialPersonalizationHealth,
  userEmail,
}: Props) {
  const [activeTab, setActiveTab] = useState<TabType>("overview");
  const [overview, setOverview] = useState<AdaptiveAdminOverview>(initialOverview);
  const [configs, setConfigs] = useState<AdaptiveTestConfigItem[]>(initialConfigs);
  const [calibrations, setCalibrations] = useState(initialCalibrations);
  const [auditLogs, setAuditLogs] = useState<AdaptiveAuditLogItem[]>(initialAuditLogs);
  const [estimatorConfig, setEstimatorConfig] = useState<AdaptiveEstimatorConfig>(
    initialEstimatorConfig || DEFAULT_ESTIMATOR_CONFIG
  );
  const [estimatorHealth, setEstimatorHealth] = useState<AdaptiveEstimatorHealth | undefined>(
    initialEstimatorHealth
  );
  const [explorerAttempts, setExplorerAttempts] = useState<AbilityExplorerAttemptItem[]>(
    initialExplorerAttempts || []
  );
  const [selectedAbilityDetail, setSelectedAbilityDetail] = useState<AttemptAbilityDetail | null>(null);
  const [isLoadingAbilityDetail, setIsLoadingAbilityDetail] = useState(false);
  const [abilitySearch, setAbilitySearch] = useState("");
  const [isEditingEstimator, setIsEditingEstimator] = useState(false);
  const [estimatorForm, setEstimatorForm] = useState<AdaptiveEstimatorConfig>(
    initialEstimatorConfig || DEFAULT_ESTIMATOR_CONFIG
  );
  const [estimatorReason, setEstimatorReason] = useState("");

  const [isPending, startTransition] = useTransition();
  const [actionMessage, setActionMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Calibration Bank Filter & Search State
  const [calibrationStatusFilter, setCalibrationStatusFilter] = useState<string>("all");
  const [calibrationSearch, setCalibrationSearch] = useState<string>("");
  const [selectedItemDetail, setSelectedItemDetail] = useState<ItemCalibrationDetailView | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState<boolean>(false);

  // Status Action Modal State (Flag / Deprecate / Restore)
  const [statusModal, setStatusModal] = useState<{
    open: boolean;
    type: "flag" | "unflag" | "deprecate" | "restore";
    questionVersionId: string;
    reason: string;
  }>({
    open: false,
    type: "flag",
    questionVersionId: "",
    reason: "",
  });

  // Emergency dialog state
  const [emergencyReason, setEmergencyReason] = useState("");
  const [showEmergencyModal, setShowEmergencyModal] = useState(false);

  // Create version modal state
  const [showCreateVersionModal, setShowCreateVersionModal] = useState(false);
  const [newVersionCode, setNewVersionCode] = useState("");
  const [newVersionName, setNewVersionName] = useState("");
  const [newVersionDesc, setNewVersionDesc] = useState("");
  const [newVersionNotes, setNewVersionNotes] = useState("");

  const showFeedback = (type: "success" | "error", text: string) => {
    setActionMessage({ type, text });
    setTimeout(() => setActionMessage(null), 5000);
  };


  const [catConfig, setCATConfig] = useState<CATSelectionConfig>(
    initialCATConfig || DEFAULT_CAT_CONFIG
  );
  const [catHealth, setCATHealth] = useState<CATHealthTelemetry | undefined>(initialCATHealth);
  const [catForm, setCATForm] = useState<CATSelectionConfig>(
    initialCATConfig || DEFAULT_CAT_CONFIG
  );
  const [isEditingCAT, setIsEditingCAT] = useState(false);
  const [catReason, setCATReason] = useState("");
  const [explorerTheta, setExplorerTheta] = useState<number>(0.0);
  const [explorerItems, setExplorerItems] = useState<ItemInformationExplorerItem[]>([]);
  const [isLoadingExplorer, setIsLoadingExplorer] = useState(false);

  const handleSaveCATConfig = (e: React.FormEvent) => {
    e.preventDefault();
    if (!catReason || catReason.trim().length < 5) {
      showFeedback("error", "A reason of at least 5 characters is required to update CAT selection configuration.");
      return;
    }
    startTransition(async () => {
      const res = await updateCATConfigAction(catForm as any, catReason);
      if (res.success && res.data) {
        setCATConfig(res.data as CATSelectionConfig);
        setIsEditingCAT(false);
        setCATReason("");
        showFeedback("success", "CAT Selection configuration saved successfully.");
      } else {
        showFeedback("error", res.error || "Failed to update CAT configuration.");
      }
    });
  };

  const handleExploreItems = (theta: number) => {
    setExplorerTheta(theta);
    setIsLoadingExplorer(true);
    startTransition(async () => {
      const res = await getItemInformationExplorerAction(theta, 50);
      setIsLoadingExplorer(false);
      if (res.success && res.data) {
        setExplorerItems(res.data as ItemInformationExplorerItem[]);
      } else {
        showFeedback("error", res.error || "Failed to load item information explorer.");
      }
    });
  };


  // Stopping Policy State
  const [stoppingConfig, setStoppingConfig] = useState<AdminStoppingConfig>(
    initialStoppingConfig || DEFAULT_STOPPING_CONFIG
  );
  const [stoppingHealth, setStoppingHealth] = useState<AdminStoppingHealth | undefined>(initialStoppingHealth);
  const [stoppingForm, setStoppingForm] = useState<AdminStoppingConfig>(
    initialStoppingConfig || DEFAULT_STOPPING_CONFIG
  );
  const [isEditingStopping, setIsEditingStopping] = useState(false);
  const [stoppingReason, setStoppingReason] = useState("");

  // Personalization Policy State
  const [personalizationConfig, setPersonalizationConfig] = useState<AdminPersonalizationConfig>(
    initialPersonalizationConfig || DEFAULT_PERSONALIZATION_CONFIG
  );
  const [personalizationHealth, setPersonalizationHealth] = useState<AdminPersonalizationHealth | undefined>(
    initialPersonalizationHealth
  );
  const [personalizationForm, setPersonalizationForm] = useState<AdminPersonalizationConfig>(
    initialPersonalizationConfig || DEFAULT_PERSONALIZATION_CONFIG
  );
  const [isEditingPersonalization, setIsEditingPersonalization] = useState(false);
  const [personalizationReason, setPersonalizationReason] = useState("");

  const handleSaveStoppingConfig = (e: React.FormEvent) => {
    e.preventDefault();
    if (!stoppingReason || stoppingReason.trim().length < 5) {
      showFeedback("error", "A reason of at least 5 characters is required to update stopping configuration.");
      return;
    }
    startTransition(async () => {
      const res = await updateStoppingConfigAction(stoppingForm as any, stoppingReason);
      if (res.success && res.data) {
        setStoppingConfig(res.data as AdminStoppingConfig);
        setIsEditingStopping(false);
        setStoppingReason("");
        showFeedback("success", "Stopping policy configuration saved successfully.");
      } else {
        showFeedback("error", res.error || "Failed to update stopping configuration.");
      }
    });
  };

  const handleSavePersonalizationConfig = (e: React.FormEvent) => {
    e.preventDefault();
    if (!personalizationReason || personalizationReason.trim().length < 5) {
      showFeedback("error", "A reason of at least 5 characters is required to update personalization configuration.");
      return;
    }
    startTransition(async () => {
      const res = await updatePersonalizationConfigAction(personalizationForm as any, personalizationReason);
      if (res.success && res.data) {
        setPersonalizationConfig(res.data as AdminPersonalizationConfig);
        setIsEditingPersonalization(false);
        setPersonalizationReason("");
        showFeedback("success", "Personalization policy configuration saved successfully.");
      } else {
        showFeedback("error", res.error || "Failed to update personalization configuration.");
      }
    });
  };

  // Ability Estimator Handlers
  const handleSaveEstimatorConfig = (e: React.FormEvent) => {
    e.preventDefault();
    if (!estimatorReason || estimatorReason.trim().length < 5) {
      showFeedback("error", "A reason of at least 5 characters is required to update estimator configuration.");
      return;
    }
    startTransition(async () => {
      const res = await updateEstimatorConfigAction(estimatorForm as any, estimatorReason);
      if (res.success && res.data) {
        setEstimatorConfig(res.data as AdaptiveEstimatorConfig);
        setIsEditingEstimator(false);
        setEstimatorReason("");
        showFeedback("success", "Ability Estimator configuration saved successfully.");
      } else {
        showFeedback("error", res.error || "Failed to update estimator configuration.");
      }
    });
  };

  const handleInspectAbilityDetail = (attemptId: string) => {
    setIsLoadingAbilityDetail(true);
    startTransition(async () => {
      const res = await getAttemptAbilityDetailAction(attemptId);
      setIsLoadingAbilityDetail(false);
      if (res.success && res.data) {
        setSelectedAbilityDetail(res.data as AttemptAbilityDetail);
      } else {
        showFeedback("error", res.error || "Failed to fetch attempt ability detail.");
      }
    });
  };

  // 1. Toggle Global Adaptive Switch
  const handleToggleGlobalAdaptive = (enabled: boolean) => {
    startTransition(async () => {
      const res = await updateAdaptiveGlobalStatusAction(
        { is_adaptive_enabled: enabled },
        `${enabled ? "Enabled" : "Disabled"} global adaptive engine`
      );
      if (res.success && res.data) {
        setOverview((prev) => ({
          ...prev,
          globalStatus: res.data as AdaptiveGlobalStatus,
        }));
        showFeedback("success", `Global Adaptive Engine is now ${enabled ? "ACTIVE" : "PAUSED"}.`);
      } else {
        showFeedback("error", res.error || "Failed to update global adaptive status.");
      }
    });
  };

  // 2. Toggle Advanced Adaptive Switch
  const handleToggleAdvancedAdaptive = (enabled: boolean) => {
    startTransition(async () => {
      const res = await updateAdaptiveGlobalStatusAction(
        { is_advanced_adaptive_enabled: enabled },
        `${enabled ? "Enabled" : "Disabled"} advanced IRT/CAT engine`
      );
      if (res.success && res.data) {
        setOverview((prev) => ({
          ...prev,
          globalStatus: res.data as AdaptiveGlobalStatus,
        }));
        showFeedback("success", `Advanced CAT mode is now ${enabled ? "ENABLED" : "DISABLED"}.`);
      } else {
        showFeedback("error", res.error || "Failed to update advanced adaptive status.");
      }
    });
  };

  // 3. Emergency Disable Kill-Switch
  const handleEmergencyToggle = (disabled: boolean) => {
    if (disabled && (!emergencyReason || emergencyReason.trim().length < 5)) {
      showFeedback("error", "Emergency disable requires an explanation (at least 5 characters).");
      return;
    }

    startTransition(async () => {
      const res = await toggleAdaptiveEmergencyAction(disabled, emergencyReason || "Admin reset");
      if (res.success && res.data) {
        setOverview((prev) => ({
          ...prev,
          globalStatus: res.data as AdaptiveGlobalStatus,
        }));
        setShowEmergencyModal(false);
        setEmergencyReason("");
        showFeedback("success", disabled ? "EMERGENCY DISABLE ENGAGED." : "Emergency disable successfully cleared.");
      } else {
        showFeedback("error", res.error || "Failed to toggle emergency disable.");
      }
    });
  };

  // 4. Activate / Rollback Algorithm Version
  const handleActivateVersion = (versionId: string, versionCode: string) => {
    startTransition(async () => {
      const res = await activateAdaptiveAlgorithmVersionAction(
        versionId,
        `Activated algorithm version ${versionCode}`
      );
      if (res.success && res.data) {
        const updatedVersion = res.data as AdaptiveAlgorithmVersion;
        setOverview((prev) => ({
          ...prev,
          activeAlgorithmVersion: updatedVersion,
          allAlgorithmVersions: prev.allAlgorithmVersions.map((v) => ({
            ...v,
            is_active: v.id === updatedVersion.id,
            status: v.id === updatedVersion.id ? "active" : v.status === "active" ? "deprecated" : v.status,
          })),
          globalStatus: {
            ...prev.globalStatus,
            active_algorithm_version: updatedVersion.version_code,
          },
        }));
        showFeedback("success", `Version ${versionCode} is now authoritatively ACTIVE.`);
      } else {
        showFeedback("error", res.error || "Failed to activate version.");
      }
    });
  };

  // 5. Create Algorithm Version
  const handleCreateVersion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVersionCode.trim() || !newVersionName.trim()) {
      showFeedback("error", "Version code and name are required.");
      return;
    }

    startTransition(async () => {
      const res = await createAdaptiveAlgorithmVersionAction(
        {
          version_code: newVersionCode.trim(),
          name: newVersionName.trim(),
          description: newVersionDesc.trim() || undefined,
          status: "draft",
          model_type: "heuristic_v1",
          estimation_method: "proxy_heuristic",
          release_notes: newVersionNotes.trim() || undefined,
        },
        `Created algorithm version ${newVersionCode}`
      );

      if (res.success && res.data) {
        const created = res.data as AdaptiveAlgorithmVersion;
        setOverview((prev) => ({
          ...prev,
          allAlgorithmVersions: [created, ...prev.allAlgorithmVersions],
        }));
        setShowCreateVersionModal(false);
        setNewVersionCode("");
        setNewVersionName("");
        setNewVersionDesc("");
        setNewVersionNotes("");
        showFeedback("success", `Algorithm version ${created.version_code} created as Draft.`);
      } else {
        showFeedback("error", res.error || "Failed to create algorithm version.");
      }
    });
  };

  // 6. Recalibrate Single Item
  const handleRecalibrateSingle = (questionVersionId: string) => {
    startTransition(async () => {
      const res = await recalibrateItemAction(questionVersionId, "Admin single item recalculation");
      if (res.success && res.data) {
        const result = res.data as any;
        setCalibrations((prev) => ({
          ...prev,
          items: prev.items.map((it) =>
            it.question_version_id === questionVersionId
              ? {
                  ...it,
                  difficulty_b: result.difficulty_b,
                  sample_size: result.sample_size,
                  reliability_score: result.reliability_score,
                  calibration_status: result.calibration_status,
                  calibrated_at: result.calculated_at,
                }
              : it
          ),
        }));
        showFeedback("success", `Recalibrated: ${result.sample_size} responses (Status: ${result.calibration_status}).`);
        // Refresh detail modal if open
        if (selectedItemDetail?.question_version_id === questionVersionId) {
          handleOpenItemDetail(questionVersionId);
        }
      } else {
        showFeedback("error", res.error || "Failed to recalibrate item.");
      }
    });
  };

  // 7. Recalibrate Batch
  const handleRecalibrateBatch = (itemsToRecalibrate: AdaptiveItemCalibration[]) => {
    if (itemsToRecalibrate.length === 0) {
      showFeedback("error", "No items selected to recalibrate.");
      return;
    }

    const ids = itemsToRecalibrate.slice(0, 50).map((i) => i.question_version_id);
    startTransition(async () => {
      const res = await recalibrateBatchAction(ids, `Batch recalibrated ${ids.length} items`);
      if (res.success && res.data) {
        showFeedback("success", `Batch completed: ${(res.data as any).processedCount} items recalibrated.`);
      } else {
        showFeedback("error", res.error || "Failed to execute batch recalibration.");
      }
    });
  };

  // 8. Open Item Detail Modal
  const handleOpenItemDetail = async (questionVersionId: string) => {
    setIsLoadingDetail(true);
    setSelectedItemDetail(null);
    try {
      const res = await getItemCalibrationDetailAction(questionVersionId);
      if (res.success && res.data) {
        setSelectedItemDetail(res.data as ItemCalibrationDetailView);
      } else {
        showFeedback("error", res.error || "Failed to load item detail.");
      }
    } catch {
      showFeedback("error", "Failed to load item calibration detail.");
    } finally {
      setIsLoadingDetail(false);
    }
  };

  // 9. Execute Status Mutation (Flag / Deprecate / Restore)
  const handleExecuteStatusChange = () => {
    const { type, questionVersionId, reason } = statusModal;
    if (!reason || reason.trim().length < 5) {
      showFeedback("error", "A valid reason (minimum 5 characters) is required.");
      return;
    }

    startTransition(async () => {
      let res;
      if (type === "flag") {
        res = await flagQuestionVersionAction(questionVersionId, reason);
      } else if (type === "unflag") {
        res = await unflagQuestionVersionAction(questionVersionId, reason);
      } else if (type === "deprecate") {
        res = await deprecateQuestionVersionAction(questionVersionId, reason);
      } else {
        res = await restoreQuestionVersionAction(questionVersionId, reason);
      }

      if (res.success) {
        const newStatus = type === "flag" ? "flagged" : type === "deprecate" ? "deprecated" : "uncalibrated";
        setCalibrations((prev) => ({
          ...prev,
          items: prev.items.map((it) =>
            it.question_version_id === questionVersionId ? { ...it, calibration_status: newStatus as any } : it
          ),
        }));
        setStatusModal({ open: false, type: "flag", questionVersionId: "", reason: "" });
        showFeedback("success", res.message || "Item status updated.");
        if (selectedItemDetail?.question_version_id === questionVersionId) {
          handleOpenItemDetail(questionVersionId);
        }
      } else {
        showFeedback("error", res.error || "Failed to update item status.");
      }
    });
  };

  // Filtered calibrations
  const filteredCalibrations = calibrations.items.filter((item) => {
    if (calibrationStatusFilter !== "all" && item.calibration_status !== calibrationStatusFilter) {
      return false;
    }
    if (calibrationSearch.trim()) {
      const query = calibrationSearch.toLowerCase().trim();
      const matchId = item.question_version_id.toLowerCase().includes(query);
      const matchText = (item.question_text || "").toLowerCase().includes(query);
      return matchId || matchText;
    }
    return true;
  });

  const { globalStatus, safetyLimits, activeAlgorithmVersion, allAlgorithmVersions } = overview;

  return (
    <div className="space-y-6">
      {/* Top Banner & Title */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white border border-slate-200/80 rounded-xl shadow-xs p-5 shadow-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">Adaptive Testing Control Center</h1>
                <Badge variant="indigo" className="text-[10px] uppercase font-mono px-2 py-0.5 bg-blue-50 text-blue-700 border-blue-200 font-bold">
                  Phase 4D.2
                </Badge>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Computerized Adaptive Testing (CAT) algorithm management, evidence-backed difficulty calibration, and safety controls.
              </p>
            </div>
          </div>
        </div>

        {/* Status Indicators */}
        <div className="flex items-center gap-3">
          {globalStatus.emergency_disabled ? (
            <Badge variant="destructive" className="px-3 py-1 text-xs font-mono font-bold bg-rose-50 text-rose-700 border-rose-200 flex items-center gap-1.5 animate-pulse">
              <ShieldAlert className="w-3.5 h-3.5" /> EMERGENCY KILLED
            </Badge>
          ) : globalStatus.is_adaptive_enabled ? (
            <Badge variant="success" className="px-3 py-1 text-xs font-mono font-bold bg-emerald-50 text-emerald-700 border-emerald-200 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" /> ENGINE ACTIVE
            </Badge>
          ) : (
            <Badge variant="outline" className="px-3 py-1 text-xs font-mono font-bold bg-amber-50 text-amber-800 border-amber-200 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" /> ENGINE PAUSED
            </Badge>
          )}

          <Badge variant="outline" className="px-3 py-1 text-xs font-mono bg-slate-100 text-slate-700 border-slate-200">
            Active: <span className="font-bold text-blue-400 ml-1">{activeAlgorithmVersion?.version_code || globalStatus.active_algorithm_version}</span>
          </Badge>
        </div>
      </div>

      {/* Emergency Notice Banner if Active */}
      {globalStatus.emergency_disabled && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-bold text-slate-900">Emergency Disable is Currently ACTIVE</h3>
              <p className="text-xs text-rose-300 mt-0.5">
                Reason: {globalStatus.emergency_disable_reason || "Unspecified administrator emergency shutdown."}
              </p>
              <p className="text-[11px] text-rose-400 mt-1">
                New Advanced Adaptive attempts are blocked. Existing in-flight attempts safely fallback to {globalStatus.fallback_mode}.
              </p>
            </div>
          </div>
          <button
            onClick={() => handleEmergencyToggle(false)}
            disabled={isPending}
            className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shrink-0 transition"
          >
            Clear Emergency Disable
          </button>
        </div>
      )}

      {/* Action Notification Toast */}
      {actionMessage && (
        <div
          className={`p-3 rounded-lg text-xs font-semibold flex items-center justify-between border ${
            actionMessage.type === "success"
              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
              : "bg-rose-950/80 text-rose-300 border-rose-800"
          }`}
        >
          <span>{actionMessage.text}</span>
          <button onClick={() => setActionMessage(null)} className="text-slate-400 hover:text-slate-900 ml-2 text-xs">
            ✕
          </button>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex items-center gap-1 border-b border-slate-200 pb-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab("overview")}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition ${
            activeTab === "overview"
              ? "bg-blue-600 text-white font-semibold shadow-xs"
              : "text-slate-400 hover:text-slate-900 hover:bg-slate-800"
          }`}
        >
          <Activity className="w-3.5 h-3.5" /> Overview &amp; Health
        </button>
        <button
          onClick={() => setActiveTab("analytics")}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition ${
            activeTab === "analytics"
              ? "bg-blue-600 text-white font-semibold shadow-xs"
              : "text-slate-400 hover:text-slate-900 hover:bg-slate-800"
          }`}
        >
          <BarChart3 className="w-3.5 h-3.5" /> Analytics &amp; Intelligence
        </button>
        <button
          onClick={() => setActiveTab("versions")}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition ${
            activeTab === "versions"
              ? "bg-blue-600 text-white font-semibold shadow-xs"
              : "text-slate-400 hover:text-slate-900 hover:bg-slate-800"
          }`}
        >
          <Cpu className="w-3.5 h-3.5" /> Algorithm Versions
        </button>
        <button
          onClick={() => setActiveTab("blueprints")}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition ${
            activeTab === "blueprints"
              ? "bg-blue-600 text-white font-semibold shadow-xs"
              : "text-slate-400 hover:text-slate-900 hover:bg-slate-800"
          }`}
        >
          <Layers className="w-3.5 h-3.5" /> Blueprints &amp; Policies ({configs.length})
        </button>
        <button
          onClick={() => setActiveTab("calibration")}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition ${
            activeTab === "calibration"
              ? "bg-blue-600 text-white font-semibold shadow-xs"
              : "text-slate-400 hover:text-slate-900 hover:bg-slate-800"
          }`}
        >
          <Scale className="w-3.5 h-3.5" /> Calibration Bank ({calibrations.totalCount})
        </button>
        <button
          onClick={() => setActiveTab("ability")}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition ${
            activeTab === "ability"
              ? "bg-blue-600 text-white font-semibold shadow-xs"
              : "text-slate-400 hover:text-slate-900 hover:bg-slate-800"
          }`}
        >
          <Target className="w-3.5 h-3.5" /> Ability Estimation
        </button>

        <button
          onClick={() => {
            setActiveTab("cat");
            if (explorerItems.length === 0) {
              handleExploreItems(0.0);
            }
          }}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors flex items-center gap-1.5 ${
            activeTab === "cat"
              ? "bg-surface-elevated text-brand-primary shadow-sm font-semibold"
              : "text-text-secondary hover:text-text-primary hover:bg-surface-elevated/50"
          }`}
        >
          <Sliders className="w-4 h-4" />
          CAT Selection
        </button>


        <button
          onClick={() => setActiveTab("stopping")}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors flex items-center gap-1.5 ${
            activeTab === "stopping"
              ? "bg-surface-elevated text-brand-primary shadow-sm font-semibold"
              : "text-text-secondary hover:text-text-primary hover:bg-surface-elevated/50"
          }`}
        >
          <Lock className="w-4 h-4" />
          Stopping Policy
        </button>
        <button
          onClick={() => setActiveTab("personalization")}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors flex items-center gap-1.5 ${
            activeTab === "personalization"
              ? "bg-surface-elevated text-brand-primary shadow-sm font-semibold"
              : "text-text-secondary hover:text-text-primary hover:bg-surface-elevated/50"
          }`}
        >
          <Sparkles className="w-4 h-4" />
          Personalization
        </button>

        <button
          onClick={() => setActiveTab("safety")}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition ${
            activeTab === "safety"
              ? "bg-blue-600 text-white font-semibold shadow-xs"
              : "text-slate-400 hover:text-slate-900 hover:bg-slate-800"
          }`}
        >
          <Shield className="w-3.5 h-3.5" /> Safety &amp; Emergency
        </button>
        <button
          onClick={() => setActiveTab("audit")}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition ${
            activeTab === "audit"
              ? "bg-blue-600 text-white font-semibold shadow-xs"
              : "text-slate-400 hover:text-slate-900 hover:bg-slate-800"
          }`}
        >
          <History className="w-3.5 h-3.5" /> Audit Trail ({auditLogs.length})
        </button>
      </div>

      {/* ==================================================================== */}
      {/* TAB 1: OVERVIEW & HEALTH TELEMETRY */}
      {/* ==================================================================== */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200/80 rounded-xl shadow-xs p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400">Total Adaptive Sessions</span>
                <Gauge className="w-4 h-4 text-blue-400" />
              </div>
              <p className="text-2xl font-bold text-slate-900 mt-2">{overview.totalAdaptiveAttempts}</p>
              <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-1">
                <span className="text-emerald-400 font-semibold">{overview.completedAdaptiveAttempts} completed</span>
                <span>•</span>
                <span className="text-amber-400">{overview.inProgressAdaptiveAttempts} active</span>
              </div>
            </div>

            <div className="bg-white border border-slate-200/80 rounded-xl shadow-xs p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400">Active Blueprints</span>
                <Layers className="w-4 h-4 text-indigo-400" />
              </div>
              <p className="text-2xl font-bold text-slate-900 mt-2">{overview.activeConfigsCount}</p>
              <p className="text-[11px] text-slate-500 mt-1">out of {overview.totalConfigsCount} total blueprints</p>
            </div>

            <div className="bg-white border border-slate-200/80 rounded-xl shadow-xs p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400">Question Item Calibration</span>
                <Scale className="w-4 h-4 text-amber-400" />
              </div>
              <p className="text-2xl font-bold text-slate-900 mt-2">{overview.calibratedItemsCount}</p>
              <p className="text-[11px] text-slate-500 mt-1">
                <span className="text-slate-400 font-semibold">{overview.uncalibratedItemsCount}</span> uncalibrated baseline items
              </p>
            </div>

            <div className="bg-white border border-slate-200/80 rounded-xl shadow-xs p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400">Engine Version</span>
                <Cpu className="w-4 h-4 text-emerald-400" />
              </div>
              <p className="text-lg font-bold text-slate-900 mt-2 font-mono truncate">
                {activeAlgorithmVersion?.version_code || "v1_heuristic"}
              </p>
              <p className="text-[11px] text-emerald-400 mt-1 font-medium">Production Verified</p>
            </div>
          </div>

          <div className="bg-white border border-slate-200/80 rounded-xl shadow-xs p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Adaptive Mock Engine Control</h3>
                <p className="text-xs text-slate-500">Manage candidate access to Computerized Adaptive Mock exams.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-900">Global Adaptive Testing</span>
                    {globalStatus.is_adaptive_enabled ? (
                      <Badge variant="success" className="text-[9px] px-1.5 py-0 bg-emerald-50 text-emerald-700 border-emerald-200">
                        ACTIVE
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-slate-800 text-slate-400">
                        PAUSED
                      </Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Controls candidate ability to launch step-by-step adaptive mock tests.
                  </p>
                </div>
                <button
                  onClick={() => handleToggleGlobalAdaptive(!globalStatus.is_adaptive_enabled)}
                  disabled={isPending}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                    globalStatus.is_adaptive_enabled
                      ? "bg-white hover:bg-slate-50 text-slate-700 border border-slate-200"
                      : "bg-blue-600 hover:bg-blue-700 text-white"
                  }`}
                >
                  {globalStatus.is_adaptive_enabled ? "Pause Engine" : "Activate Engine"}
                </button>
              </div>

              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-900">Advanced CAT / IRT Mode</span>
                    {globalStatus.is_advanced_adaptive_enabled ? (
                      <Badge variant="indigo" className="text-[9px] px-1.5 py-0 bg-purple-50 text-purple-700 border-purple-200">
                        ENABLED
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-slate-800 text-slate-400">
                        DISABLED (v1 Fallback)
                      </Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Switch between v1 Heuristic Stepper and Advanced IRT engine.
                  </p>
                </div>
                <button
                  onClick={() => handleToggleAdvancedAdaptive(!globalStatus.is_advanced_adaptive_enabled)}
                  disabled={isPending}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                    globalStatus.is_advanced_adaptive_enabled
                      ? "bg-purple-900/60 hover:bg-purple-800 text-purple-200 border border-purple-700"
                      : "bg-white hover:bg-slate-50 text-slate-700 border border-slate-200"
                  }`}
                >
                  {globalStatus.is_advanced_adaptive_enabled ? "Disable Advanced" : "Enable Advanced"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 1.5: PHASE 4D.6 ADAPTIVE ANALYTICS & ADMIN INTELLIGENCE */}
      {/* ==================================================================== */}
      {activeTab === "analytics" && (
        <AdaptiveAnalyticsView userEmail={userEmail} />
      )}

      {/* ==================================================================== */}
      {/* TAB 2: ALGORITHM VERSIONS & ROLLBACK */}
      {/* ==================================================================== */}
      {activeTab === "versions" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Adaptive Algorithm Version Registry</h3>
              <p className="text-xs text-slate-500">
                Track, validate, and activate versioned CAT algorithm blueprints with instant rollback.
              </p>
            </div>
            <button
              onClick={() => setShowCreateVersionModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition"
            >
              <Plus className="w-3.5 h-3.5" /> Register Algorithm Version
            </button>
          </div>

          <div className="bg-white border border-slate-200/80 rounded-xl shadow-xs overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 text-slate-500 border-b border-slate-200 font-mono text-[11px] uppercase">
                <tr>
                  <th className="p-3.5">Version Code</th>
                  <th className="p-3.5">Name / Model</th>
                  <th className="p-3.5">Estimation</th>
                  <th className="p-3.5">Status</th>
                  <th className="p-3.5">Created</th>
                  <th className="p-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {allAlgorithmVersions.map((v) => (
                  <tr key={v.id} className={v.is_active ? "bg-blue-50/50" : ""}>
                    <td className="p-3.5 font-mono font-bold text-slate-900 flex items-center gap-2">
                      <span>{v.version_code}</span>
                      {v.is_active && (
                        <Badge variant="indigo" className="text-[9px] px-1.5 py-0 bg-blue-50 text-blue-700 border-blue-200 font-mono">
                          ACTIVE
                        </Badge>
                      )}
                    </td>
                    <td className="p-3.5">
                      <div className="font-semibold text-slate-200">{v.name}</div>
                      <div className="text-[11px] font-mono text-slate-400">{v.model_type}</div>
                    </td>
                    <td className="p-3.5 font-mono text-[11px] text-slate-400">{v.estimation_method}</td>
                    <td className="p-3.5">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-mono font-semibold uppercase ${
                          v.status === "active"
                            ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                            : v.status === "testing"
                            ? "bg-purple-950 text-purple-300 border border-purple-800"
                            : v.status === "deprecated"
                            ? "bg-amber-950 text-amber-300 border border-amber-800"
                            : "bg-slate-100 text-slate-600 border border-slate-200"
                        }`}
                      >
                        {v.status}
                      </span>
                    </td>
                    <td className="p-3.5 text-slate-400 text-[11px]">
                      {new Date(v.created_at).toLocaleDateString()}
                    </td>
                    <td className="p-3.5 text-right">
                      {v.is_active ? (
                        <span className="text-[11px] font-semibold text-blue-400 font-mono">CURRENTLY ACTIVE</span>
                      ) : (
                        <button
                          onClick={() => handleActivateVersion(v.id, v.version_code)}
                          disabled={isPending || v.status === "archived"}
                          className="px-2.5 py-1 rounded bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-[11px] font-semibold border border-slate-200 transition"
                        >
                          {v.status === "deprecated" ? "Rollback & Activate" : "Activate"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 3: BLUEPRINTS & POLICIES */}
      {/* ==================================================================== */}
      {activeTab === "blueprints" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Adaptive Test Blueprints &amp; Policies</h3>
              <p className="text-xs text-slate-500">
                Configure exam-specific length, duration, topic distribution, and stopping policies.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {configs.map((c) => (
              <div key={c.id} className="bg-white border border-slate-200/80 rounded-xl shadow-xs p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-bold text-slate-900">{c.title}</h4>
                    {c.is_active ? (
                      <Badge variant="success" className="text-[9px] px-1.5 py-0 bg-emerald-50 text-emerald-700 border-emerald-200">
                        ACTIVE
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-slate-800 text-slate-400">
                        INACTIVE
                      </Badge>
                    )}
                  </div>
                  <span className="text-xs font-mono text-slate-400">{c.exam_title}</span>
                </div>

                <div className="grid grid-cols-3 gap-2 p-3 rounded-lg bg-slate-50 border border-slate-200 text-center">
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase font-mono block">Questions</span>
                    <span className="text-xs font-bold text-slate-900 font-mono">
                      {c.min_questions} – {c.max_questions}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase font-mono block">Duration</span>
                    <span className="text-xs font-bold text-slate-900 font-mono">{c.target_duration_minutes} min</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase font-mono block">Version</span>
                    <span className="text-xs font-bold text-slate-900 font-mono">v{c.version}</span>
                  </div>
                </div>

                <div className="space-y-1 text-[11px] text-slate-400">
                  <div className="flex justify-between">
                    <span>Stopping Rule:</span>
                    <span className="font-mono text-slate-300">
                      {(c.stopping_policy as { type?: string })?.type || "standard_error_or_length"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Selection Strategy:</span>
                    <span className="font-mono text-slate-300">
                      {(c.selection_policy as { strategy?: string })?.strategy || "max_fisher_information"}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 4: CALIBRATION BANK EXPLORER & MANAGEMENT */}
      {/* ==================================================================== */}
      {activeTab === "calibration" && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Psychometric Item Calibration Bank</h3>
              <p className="text-xs text-slate-500">
                Review empirical difficulty ($b$), sample sizes, confidence, and stability.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleRecalibrateBatch(filteredCalibrations)}
                disabled={isPending || filteredCalibrations.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Recalibrate Filtered ({Math.min(50, filteredCalibrations.length)})
              </button>
            </div>
          </div>

          {/* Transparency Alert */}
          <div className="bg-white border border-slate-200/80 rounded-xl shadow-xs p-4 text-xs text-slate-500 flex items-start gap-3">
            <Scale className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-slate-900">Calibration Transparency Guarantee:</span>
              <p className="mt-0.5 text-slate-400">
                All parameters ($b$, confidence, stability) reflect genuine candidate response evidence.
                Discrimination ($a$) and pseudo-guessing ($c$) are strictly non-fabricated (`NULL`).
              </p>
            </div>
          </div>

          {/* Filters & Search Toolbar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white border border-slate-200/80 rounded-xl shadow-xs p-3">
            <div className="flex items-center gap-2 flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-500 shrink-0" />
              <input
                type="text"
                placeholder="Search question text or version ID..."
                value={calibrationSearch}
                onChange={(e) => setCalibrationSearch(e.target.value)}
                className="bg-transparent text-xs text-slate-900 placeholder-slate-500 focus:outline-hidden w-full"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-400 font-mono">Status:</span>
              <select
                value={calibrationStatusFilter}
                onChange={(e) => setCalibrationStatusFilter(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-xs text-slate-200 focus:outline-hidden"
              >
                <option value="all">All Statuses ({calibrations.items.length})</option>
                <option value="uncalibrated">Uncalibrated (n &lt; 20)</option>
                <option value="provisional">Provisional (20 &le; n &lt; 100)</option>
                <option value="calibrated">Calibrated (n &ge; 100)</option>
                <option value="flagged">Flagged (Unstable)</option>
                <option value="deprecated">Deprecated</option>
              </select>
            </div>
          </div>

          {/* Calibrations Table */}
          {filteredCalibrations.length === 0 ? (
            <div className="p-8 text-center bg-white border border-slate-200/80 rounded-xl shadow-xs text-slate-400 text-xs">
              <Database className="w-8 h-8 text-slate-600 mx-auto mb-2" />
              <p className="font-semibold text-slate-300">No items match the active filter criteria.</p>
              <p className="text-slate-500 mt-1">Adjust search query or status filter to see item records.</p>
            </div>
          ) : (
            <div className="bg-white border border-slate-200/80 rounded-xl shadow-xs overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/80 text-slate-500 border-b border-slate-200 font-mono text-[11px] uppercase">
                  <tr>
                    <th className="p-3.5">Question Item</th>
                    <th className="p-3.5">Sample (N)</th>
                    <th className="p-3.5">Difficulty (b)</th>
                    <th className="p-3.5">Status</th>
                    <th className="p-3.5">Calibrated At</th>
                    <th className="p-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {filteredCalibrations.map((item) => (
                    <tr key={item.id || item.question_version_id}>
                      <td className="p-3.5 max-w-xs">
                        <div className="font-mono text-[11px] text-slate-400">{item.question_version_id.slice(0, 8)}...</div>
                        <div className="text-slate-300 truncate text-[11px] mt-0.5">{item.question_text}</div>
                      </td>
                      <td className="p-3.5 font-mono">{item.sample_size}</td>
                      <td className="p-3.5 font-mono">
                        {item.difficulty_b !== null && item.difficulty_b !== undefined ? item.difficulty_b.toFixed(2) : "—"}
                      </td>
                      <td className="p-3.5">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-mono font-semibold uppercase ${
                            item.calibration_status === "calibrated"
                              ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                              : item.calibration_status === "provisional"
                              ? "bg-blue-950 text-blue-300 border border-blue-800"
                              : item.calibration_status === "flagged"
                              ? "bg-rose-950 text-rose-300 border border-rose-800"
                              : item.calibration_status === "deprecated"
                              ? "bg-amber-950 text-amber-300 border border-amber-800"
                              : "bg-slate-100 text-slate-600 border border-slate-200"
                          }`}
                        >
                          {item.calibration_status}
                        </span>
                      </td>
                      <td className="p-3.5 text-slate-400 text-[11px]">
                        {item.calibrated_at ? new Date(item.calibrated_at).toLocaleDateString() : "Uncalibrated Baseline"}
                      </td>
                      <td className="p-3.5 text-right space-x-1">
                        <button
                          onClick={() => handleOpenItemDetail(item.question_version_id)}
                          className="px-2 py-1 rounded bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-[11px] font-semibold border border-slate-200 transition inline-flex items-center gap-1"
                        >
                          <Eye className="w-3 h-3" /> Inspect
                        </button>
                        <button
                          onClick={() => handleRecalibrateSingle(item.question_version_id)}
                          disabled={isPending}
                          className="px-2 py-1 rounded bg-blue-950/60 hover:bg-blue-900 text-blue-300 text-[11px] font-semibold border border-blue-800 transition inline-flex items-center gap-1"
                        >
                          <RefreshCw className="w-3 h-3" /> Recalibrate
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB: ABILITY ESTIMATION ENGINE */}
      {/* ==================================================================== */}
      {activeTab === "ability" && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Adaptive Ability Estimation Engine</h3>
              <p className="text-xs text-slate-500">
                Regularized 1PL / Rasch maximum a posteriori (MAP) estimation with bounded Newton-Raphson numerical optimization.
              </p>
            </div>
            <button
              onClick={() => {
                setEstimatorForm(estimatorConfig);
                setIsEditingEstimator(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition cursor-pointer"
            >
              <Sliders className="w-3.5 h-3.5" /> Configure Ability Estimator
            </button>
          </div>

          {/* Telemetry KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200/80 rounded-xl shadow-xs p-4">
              <span className="text-xs font-medium text-slate-500 block">Active Estimator</span>
              <p className="text-sm font-bold text-slate-900 font-mono mt-2 truncate">{estimatorConfig.active_estimator}</p>
              <p className="text-[11px] text-emerald-400 mt-1 font-medium">Regularized 1PL MAP</p>
            </div>
            <div className="bg-white border border-slate-200/80 rounded-xl shadow-xs p-4">
              <span className="text-xs font-medium text-slate-500 block">Convergence Rate</span>
              <p className="text-2xl font-bold text-slate-900 mt-1">
                {estimatorHealth ? (estimatorHealth.convergence_rate * 100).toFixed(1) + "%" : "100.0%"}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                Avg {estimatorHealth?.average_iterations || 1.0} iterations / step
              </p>
            </div>
            <div className="bg-white border border-slate-200/80 rounded-xl shadow-xs p-4">
              <span className="text-xs font-medium text-slate-500 block">Regularization (λ)</span>
              <p className="text-2xl font-bold text-slate-900 mt-1 font-mono">{estimatorConfig.regularization_lambda}</p>
              <p className="text-[11px] text-slate-500 mt-1">Bounds: [{estimatorConfig.min_theta}, +{estimatorConfig.max_theta}]</p>
            </div>
            <div className="bg-white border border-slate-200/80 rounded-xl shadow-xs p-4">
              <span className="text-xs font-medium text-slate-500 block">Warm-Start Policy</span>
              <p className="text-lg font-bold text-slate-900 mt-1">
                {estimatorConfig.warm_start_enabled ? (
                  <span className="text-emerald-400">ENABLED</span>
                ) : (
                  <span className="text-slate-400">COLD PRIOR (0.0)</span>
                )}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                Bounds: [{estimatorConfig.warm_start_min}, +{estimatorConfig.warm_start_max}]
              </p>
            </div>
          </div>

          {/* Ability Explorer Table */}
          <div className="bg-white border border-slate-200/80 rounded-xl shadow-xs overflow-hidden">
            <div className="p-3.5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-50/60">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-blue-400" />
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider font-mono">Candidate Ability Explorer</h4>
              </div>
              <div className="flex items-center gap-2">
                <Search className="w-3.5 h-3.5 text-slate-500" />
                <input
                  type="text"
                  placeholder="Filter by attempt ID or user..."
                  value={abilitySearch}
                  onChange={(e) => setAbilitySearch(e.target.value)}
                  className="bg-white border border-slate-200/80 shadow-xs rounded-md px-2 py-1 text-xs text-slate-900 placeholder-slate-500 focus:outline-hidden"
                />
              </div>
            </div>

            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 text-slate-500 border-b border-slate-200 font-mono text-[11px] uppercase">
                <tr>
                  <th className="p-3.5">Attempt ID</th>
                  <th className="p-3.5">Exam</th>
                  <th className="p-3.5">Ability (θ)</th>
                  <th className="p-3.5">Standard Error (SE)</th>
                  <th className="p-3.5">Questions Served</th>
                  <th className="p-3.5">Status</th>
                  <th className="p-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {explorerAttempts
                  .filter((a) => !abilitySearch || a.attempt_id.includes(abilitySearch) || a.user_id.includes(abilitySearch))
                  .length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-slate-500">
                      No adaptive attempt states recorded yet.
                    </td>
                  </tr>
                ) : (
                  explorerAttempts
                    .filter((a) => !abilitySearch || a.attempt_id.includes(abilitySearch) || a.user_id.includes(abilitySearch))
                    .map((a) => (
                      <tr key={a.id}>
                        <td className="p-3.5 font-mono text-[11px] text-slate-400">{a.attempt_id.slice(0, 8)}...</td>
                        <td className="p-3.5 text-slate-300 font-medium truncate max-w-xs">{a.exam_title || "Adaptive Mock"}</td>
                        <td className="p-3.5 font-mono font-bold text-slate-900">
                          <span className={a.current_theta >= 0 ? "text-emerald-400" : "text-amber-400"}>
                            {a.current_theta >= 0 ? "+" + a.current_theta.toFixed(2) : a.current_theta.toFixed(2)}
                          </span>
                        </td>
                        <td className="p-3.5 font-mono text-slate-300">±{a.standard_error.toFixed(2)}</td>
                        <td className="p-3.5 font-mono">
                          {a.questions_served_count} ({a.correct_answers_count} correct)
                        </td>
                        <td className="p-3.5">
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold uppercase bg-slate-100 text-slate-700 border-slate-200">
                            {a.status}
                          </span>
                        </td>
                        <td className="p-3.5 text-right">
                          <button
                            onClick={() => handleInspectAbilityDetail(a.attempt_id)}
                            disabled={isLoadingAbilityDetail}
                            className="px-2.5 py-1 rounded bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-semibold transition inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Eye className="w-3 h-3 text-blue-400" /> Trajectory
                          </button>
                        </td>
                      </tr>
                    ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      
      {/* ==================================================================== */}
      {/* TAB: CAT SELECTION ENGINE */}
      {/* ==================================================================== */}
      {activeTab === "cat" && (
        <div className="space-y-6">
          {/* Header Card */}
          <div className="bg-white border border-slate-200/80 rounded-xl p-6 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold text-slate-900">CAT Maximum Information Selection Engine</h2>
                  <Badge variant="success" className="text-xs">
                    1PL Rasch Active
                  </Badge>
                </div>
                <p className="text-sm text-slate-500 mt-1">
                  Information-theoretic item selection maximizing Fisher Information I(θ) = P(1-P) with multi-objective content balancing, topic anti-fatigue streaks, and exposure regulation.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="indigo" className="font-mono text-xs px-2 py-1">
                  I_max = 0.25 (at θ = b)
                </Badge>
              </div>
            </div>

            {/* Health & Telemetry Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                <span className="text-xs text-slate-500">Decisions Recorded</span>
                <p className="text-xl font-bold text-slate-900 mt-0.5">
                  {catHealth?.total_decisions_count || 0}
                </p>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                <span className="text-xs text-slate-500">Unique Items Served</span>
                <p className="text-xl font-bold text-slate-900 mt-0.5">
                  {catHealth?.unique_items_served || 0}
                </p>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                <span className="text-xs text-slate-500">Avg. Item Exposure</span>
                <p className="text-xl font-bold text-slate-900 mt-0.5">
                  {catHealth?.average_item_exposure || 0}x
                </p>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                <span className="text-xs text-slate-500">Streak Mitigations</span>
                <p className="text-xl font-bold text-slate-900 mt-0.5">
                  {catHealth?.streak_violations_mitigated || 0}
                </p>
              </div>
            </div>
          </div>

          {/* Configuration Form */}
          <div className="bg-white border border-slate-200/80 rounded-xl p-6 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                <Sliders className="w-4 h-4 text-emerald-400" />
                Multi-Objective Scoring Weights &amp; Constraints
              </h3>
              {!isEditingCAT ? (
                <button
                  onClick={() => {
                    setCATForm(catConfig);
                    setIsEditingCAT(true);
                  }}
                  className="px-3 py-1.5 text-xs font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-500 transition-colors"
                >
                  Edit Configuration
                </button>
              ) : (
                <button
                  onClick={() => setIsEditingCAT(false)}
                  className="px-3 py-1.5 text-xs font-semibold bg-white text-slate-700 rounded-lg hover:bg-slate-50 border border-slate-200 transition-colors"
                >
                  Cancel
                </button>
              )}
            </div>

            <form onSubmit={handleSaveCATConfig} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Fisher Information Weight (w_info)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    disabled={!isEditingCAT}
                    value={catForm.weights.fisher_information}
                    onChange={(e) =>
                      setCATForm({
                        ...catForm,
                        weights: { ...catForm.weights, fisher_information: parseFloat(e.target.value) || 0 },
                      })
                    }
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 disabled:bg-slate-50 disabled:opacity-60"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Content Balancing Weight (w_content)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    disabled={!isEditingCAT}
                    value={catForm.weights.content_balancing}
                    onChange={(e) =>
                      setCATForm({
                        ...catForm,
                        weights: { ...catForm.weights, content_balancing: parseFloat(e.target.value) || 0 },
                      })
                    }
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 disabled:bg-slate-50 disabled:opacity-60"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Exploration Weight (w_expl)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    disabled={!isEditingCAT}
                    value={catForm.weights.exploration_value}
                    onChange={(e) =>
                      setCATForm({
                        ...catForm,
                        weights: { ...catForm.weights, exploration_value: parseFloat(e.target.value) || 0 },
                      })
                    }
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 disabled:bg-slate-50 disabled:opacity-60"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Mistake Vault Bonus Weight (w_mistake)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    disabled={!isEditingCAT}
                    value={catForm.weights.mistake_bonus}
                    onChange={(e) =>
                      setCATForm({
                        ...catForm,
                        weights: { ...catForm.weights, mistake_bonus: parseFloat(e.target.value) || 0 },
                      })
                    }
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 disabled:bg-slate-50 disabled:opacity-60"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Exposure Regulation Weight (w_exposure)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    disabled={!isEditingCAT}
                    value={catForm.weights.exposure_control}
                    onChange={(e) =>
                      setCATForm({
                        ...catForm,
                        weights: { ...catForm.weights, exposure_control: parseFloat(e.target.value) || 0 },
                      })
                    }
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 disabled:bg-slate-50 disabled:opacity-60"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Max Consecutive Topic Streak
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="1"
                    max="10"
                    disabled={!isEditingCAT}
                    value={catForm.topic_constraints.max_consecutive_streak}
                    onChange={(e) =>
                      setCATForm({
                        ...catForm,
                        topic_constraints: {
                          ...catForm.topic_constraints,
                          max_consecutive_streak: parseInt(e.target.value) || 3,
                        },
                      })
                    }
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 disabled:bg-slate-50 disabled:opacity-60"
                  />
                </div>
              </div>

              {isEditingCAT && (
                <div className="pt-3 border-t border-slate-200 space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">
                      Change Reason (Required for Audit Trail)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g., Calibrate exploration weight for general ability exam"
                      value={catReason}
                      onChange={(e) => setCATReason(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setIsEditingCAT(false)}
                      className="px-4 py-2 text-xs font-semibold bg-white text-slate-700 rounded-lg border border-slate-200"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isPending}
                      className="px-4 py-2 text-xs font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-500 disabled:opacity-50"
                    >
                      {isPending ? "Saving..." : "Save CAT Configuration"}
                    </button>
                  </div>
                </div>
              )}
            </form>
          </div>

          {/* Interactive Item Information Explorer */}
          <div className="bg-white border border-slate-200/80 rounded-xl p-6 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
              <div>
                <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                  <Target className="w-4 h-4 text-emerald-400" />
                  Item Information Explorer
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Simulate candidate ability θ to visualize item information curves I(θ) and CAT rankings across the question bank.
                </p>
              </div>

              <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 px-4 py-2 rounded-lg">
                <span className="text-xs font-semibold text-slate-300">Simulate θ:</span>
                <input
                  type="range"
                  min="-3.0"
                  max="3.0"
                  step="0.25"
                  value={explorerTheta}
                  onChange={(e) => handleExploreItems(parseFloat(e.target.value))}
                  className="w-36 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-600"
                />
                <span className="font-mono text-sm font-bold text-emerald-400 w-12 text-right">
                  {explorerTheta > 0 ? `+${explorerTheta.toFixed(2)}` : explorerTheta.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Item Information Table */}
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/80 text-slate-500 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3">Rank</th>
                    <th className="py-2.5 px-3">Topic</th>
                    <th className="py-2.5 px-3">Question Prompt</th>
                    <th className="py-2.5 px-3">Difficulty (b)</th>
                    <th className="py-2.5 px-3">Tier</th>
                    <th className="py-2.5 px-3">Fisher Info I(θ)</th>
                    <th className="py-2.5 px-3">Normalized Score</th>
                    <th className="py-2.5 px-3">Exposure</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {isLoadingExplorer ? (
                    <tr>
                      <td colSpan={8} className="py-6 text-center text-slate-500">
                        Simulating item information rankings...
                      </td>
                    </tr>
                  ) : explorerItems.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-6 text-center text-slate-500">
                        No items found in explorer pool.
                      </td>
                    </tr>
                  ) : (
                    explorerItems.map((item, idx) => (
                      <tr key={item.question_version_id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-2 px-3 font-mono font-bold text-slate-400">#{idx + 1}</td>
                        <td className="py-2 px-3 font-medium text-slate-300">{item.topic_name}</td>
                        <td className="py-2 px-3 max-w-xs truncate text-slate-900" title={item.question_text}>
                          {item.question_text}
                        </td>
                        <td className="py-2 px-3 font-mono font-semibold">
                          {item.difficulty_b > 0 ? `+${item.difficulty_b.toFixed(2)}` : item.difficulty_b.toFixed(2)}
                        </td>
                        <td className="py-2 px-3">
                          <Badge
                            variant={
                              item.difficulty_tier === "easy"
                                ? "success"
                                : item.difficulty_tier === "hard"
                                ? "error"
                                : "indigo"
                            }
                            className="text-[10px] uppercase"
                          >
                            {item.difficulty_tier}
                          </Badge>
                        </td>
                        <td className="py-2 px-3 font-mono font-bold text-emerald-400">
                          {item.fisher_information.toFixed(4)}
                        </td>
                        <td className="py-2 px-3 font-mono">
                          {(item.normalized_information * 100).toFixed(1)}%
                        </td>
                        <td className="py-2 px-3 text-slate-400 font-mono">{item.exposure_count}x</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      
      {/* ==================================================================== */}
      {/* TAB: ADVANCED STOPPING POLICY */}
      {/* ==================================================================== */}
      {activeTab === "stopping" && (
        <div className="space-y-6">
          {/* Header Card */}
          <div className="bg-white border border-slate-200/80 rounded-xl p-6 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold text-slate-900">Advanced Psychometric Stopping Policy</h2>
                  <Badge variant="success" className="text-xs">
                    Deterministic Precedence Active
                  </Badge>
                </div>
                <p className="text-sm text-slate-500 mt-1">
                  Server-authoritative stopping rules evaluating minimum questions, hard upper limits, target Standard Error precision (SE ≤ {stoppingConfig.target_se}), blueprint quota satisfaction, and diminishing information contributions.
                </p>
              </div>
            </div>

            {/* Health & Telemetry */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                <span className="text-xs text-slate-500">Completed Attempts</span>
                <p className="text-xl font-bold text-slate-900 mt-0.5">
                  {stoppingHealth?.total_completed_attempts || 0}
                </p>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                <span className="text-xs text-slate-500">Target SE Stops</span>
                <p className="text-xl font-bold text-emerald-400 mt-0.5">
                  {stoppingHealth?.stopped_by_target_se || 0}
                </p>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                <span className="text-xs text-slate-500">Max Question Stops</span>
                <p className="text-xl font-bold text-amber-400 mt-0.5">
                  {stoppingHealth?.stopped_by_max_questions || 0}
                </p>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                <span className="text-xs text-slate-500">Avg. Final SE</span>
                <p className="text-xl font-bold text-slate-900 mt-0.5">
                  {stoppingHealth?.average_final_se ? stoppingHealth.average_final_se.toFixed(2) : "0.35"}
                </p>
              </div>
            </div>
          </div>

          {/* Stopping Configuration Form */}
          <div className="bg-white border border-slate-200/80 rounded-xl p-6 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                <Lock className="w-4 h-4 text-emerald-400" />
                Stopping Rules &amp; Thresholds Configuration
              </h3>
              {!isEditingStopping ? (
                <button
                  onClick={() => {
                    setStoppingForm(stoppingConfig);
                    setIsEditingStopping(true);
                  }}
                  className="px-3 py-1.5 text-xs font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-500 transition-colors"
                >
                  Edit Stopping Rules
                </button>
              ) : (
                <button
                  onClick={() => setIsEditingStopping(false)}
                  className="px-3 py-1.5 text-xs font-semibold bg-white text-slate-700 rounded-lg hover:bg-slate-50 border border-slate-200 transition-colors"
                >
                  Cancel
                </button>
              )}
            </div>

            <form onSubmit={handleSaveStoppingConfig} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Minimum Questions (Continuation Gate)
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="5"
                    max="100"
                    disabled={!isEditingStopping}
                    value={stoppingForm.min_questions}
                    onChange={(e) =>
                      setStoppingForm({ ...stoppingForm, min_questions: parseInt(e.target.value) || 20 })
                    }
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 disabled:bg-slate-50 disabled:opacity-60"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Maximum Questions (Hard Ceiling)
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="10"
                    max="200"
                    disabled={!isEditingStopping}
                    value={stoppingForm.max_questions}
                    onChange={(e) =>
                      setStoppingForm({ ...stoppingForm, max_questions: parseInt(e.target.value) || 50 })
                    }
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 disabled:bg-slate-50 disabled:opacity-60"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Target Standard Error (SE Threshold)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.10"
                    max="0.80"
                    disabled={!isEditingStopping}
                    value={stoppingForm.target_se}
                    onChange={(e) =>
                      setStoppingForm({ ...stoppingForm, target_se: parseFloat(e.target.value) || 0.35 })
                    }
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 disabled:bg-slate-50 disabled:opacity-60"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Diminishing Info Threshold
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max="0.25"
                    disabled={!isEditingStopping}
                    value={stoppingForm.diminishing_info_threshold}
                    onChange={(e) =>
                      setStoppingForm({
                        ...stoppingForm,
                        diminishing_info_threshold: parseFloat(e.target.value) || 0.05,
                      })
                    }
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 disabled:bg-slate-50 disabled:opacity-60"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Diminishing Info Window (Steps)
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="3"
                    max="15"
                    disabled={!isEditingStopping}
                    value={stoppingForm.diminishing_info_window}
                    onChange={(e) =>
                      setStoppingForm({
                        ...stoppingForm,
                        diminishing_info_window: parseInt(e.target.value) || 5,
                      })
                    }
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 disabled:bg-slate-50 disabled:opacity-60"
                  />
                </div>

                <div className="flex items-center gap-4 pt-4">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-300">
                    <input
                      type="checkbox"
                      disabled={!isEditingStopping}
                      checked={stoppingForm.enforce_blueprint}
                      onChange={(e) =>
                        setStoppingForm({ ...stoppingForm, enforce_blueprint: e.target.checked })
                      }
                      className="rounded bg-white border-slate-300 text-emerald-600"
                    />
                    Enforce Blueprint Quotas
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-300">
                    <input
                      type="checkbox"
                      disabled={!isEditingStopping}
                      checked={stoppingForm.enforce_topic_coverage}
                      onChange={(e) =>
                        setStoppingForm({ ...stoppingForm, enforce_topic_coverage: e.target.checked })
                      }
                      className="rounded bg-white border-slate-300 text-emerald-600"
                    />
                    Enforce Topic Coverage
                  </label>
                </div>
              </div>

              {isEditingStopping && (
                <div className="pt-3 border-t border-slate-200 space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">
                      Change Reason (Required for Audit Trail)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g., Adjust target precision threshold for high-stakes test"
                      value={stoppingReason}
                      onChange={(e) => setStoppingReason(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setIsEditingStopping(false)}
                      className="px-4 py-2 text-xs font-semibold bg-white text-slate-700 rounded-lg border border-slate-200"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isPending}
                      className="px-4 py-2 text-xs font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-500 disabled:opacity-50"
                    >
                      {isPending ? "Saving..." : "Save Stopping Policy"}
                    </button>
                  </div>
                </div>
              )}
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB: PERSONALIZATION POLICY */}
      {/* ==================================================================== */}
      {activeTab === "personalization" && (
        <div className="space-y-6">
          {/* Header Card */}
          <div className="bg-white border border-slate-200/80 rounded-xl p-6 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold text-slate-900">Bounded Educational Personalization Policy</h2>
                  <Badge variant="indigo" className="text-xs">
                    Max Influence: {(personalizationConfig.max_influence * 100).toFixed(0)}%
                  </Badge>
                </div>
                <p className="text-sm text-slate-500 mt-1">
                  Modulates candidate topic priorities, weak-area reinforcement, exploration rate, and Mistake Vault integration without displacing CAT Fisher Information as the primary psychometric anchor.
                </p>
              </div>
            </div>

            {/* Health & Telemetry */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                <span className="text-xs text-slate-500">Personalized Attempts</span>
                <p className="text-xl font-bold text-slate-900 mt-0.5">
                  {personalizationHealth?.total_personalized_attempts || 0}
                </p>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                <span className="text-xs text-slate-500">Weak-Area Boosts</span>
                <p className="text-xl font-bold text-amber-400 mt-0.5">
                  {personalizationHealth?.weak_area_boosted_decisions || 0}
                </p>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                <span className="text-xs text-slate-500">Mistake Reinforcements</span>
                <p className="text-xl font-bold text-emerald-400 mt-0.5">
                  {personalizationHealth?.mistake_reinforced_decisions || 0}
                </p>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                <span className="text-xs text-slate-500">Exploration Decisions</span>
                <p className="text-xl font-bold text-indigo-400 mt-0.5">
                  {personalizationHealth?.exploration_decisions || 0}
                </p>
              </div>
            </div>
          </div>

          {/* Personalization Configuration Form */}
          <div className="bg-white border border-slate-200/80 rounded-xl p-6 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-400" />
                Personalization Weights &amp; Bounds Configuration
              </h3>
              {!isEditingPersonalization ? (
                <button
                  onClick={() => {
                    setPersonalizationForm(personalizationConfig);
                    setIsEditingPersonalization(true);
                  }}
                  className="px-3 py-1.5 text-xs font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-500 transition-colors"
                >
                  Edit Personalization
                </button>
              ) : (
                <button
                  onClick={() => setIsEditingPersonalization(false)}
                  className="px-3 py-1.5 text-xs font-semibold bg-white text-slate-700 rounded-lg hover:bg-slate-50 border border-slate-200 transition-colors"
                >
                  Cancel
                </button>
              )}
            </div>

            <form onSubmit={handleSavePersonalizationConfig} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Max Personalization Influence (Cap: 0.40)
                  </label>
                  <input
                    type="number"
                    step="0.05"
                    min="0"
                    max="0.40"
                    disabled={!isEditingPersonalization}
                    value={personalizationForm.max_influence}
                    onChange={(e) =>
                      setPersonalizationForm({
                        ...personalizationForm,
                        max_influence: parseFloat(e.target.value) || 0.40,
                      })
                    }
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 disabled:bg-slate-50 disabled:opacity-60"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Weak-Area Weight
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    disabled={!isEditingPersonalization}
                    value={personalizationForm.weights.weak_area}
                    onChange={(e) =>
                      setPersonalizationForm({
                        ...personalizationForm,
                        weights: {
                          ...personalizationForm.weights,
                          weak_area: parseFloat(e.target.value) || 0.35,
                        },
                      })
                    }
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 disabled:bg-slate-50 disabled:opacity-60"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Mistake Vault Weight
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    disabled={!isEditingPersonalization}
                    value={personalizationForm.weights.mistake_vault}
                    onChange={(e) =>
                      setPersonalizationForm({
                        ...personalizationForm,
                        weights: {
                          ...personalizationForm.weights,
                          mistake_vault: parseFloat(e.target.value) || 0.25,
                        },
                      })
                    }
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 disabled:bg-slate-50 disabled:opacity-60"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Exploration Weight
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    disabled={!isEditingPersonalization}
                    value={personalizationForm.weights.exploration}
                    onChange={(e) =>
                      setPersonalizationForm({
                        ...personalizationForm,
                        weights: {
                          ...personalizationForm.weights,
                          exploration: parseFloat(e.target.value) || 0.20,
                        },
                      })
                    }
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 disabled:bg-slate-50 disabled:opacity-60"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Subject Balance Weight
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    disabled={!isEditingPersonalization}
                    value={personalizationForm.weights.subject_balance}
                    onChange={(e) =>
                      setPersonalizationForm({
                        ...personalizationForm,
                        weights: {
                          ...personalizationForm.weights,
                          subject_balance: parseFloat(e.target.value) || 0.20,
                        },
                      })
                    }
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 disabled:bg-slate-50 disabled:opacity-60"
                  />
                </div>

                <div className="flex items-center gap-4 pt-4">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-300">
                    <input
                      type="checkbox"
                      disabled={!isEditingPersonalization}
                      checked={personalizationForm.enabled}
                      onChange={(e) =>
                        setPersonalizationForm({ ...personalizationForm, enabled: e.target.checked })
                      }
                      className="rounded bg-white border-slate-300 text-emerald-600"
                    />
                    Enable Personalization
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-300">
                    <input
                      type="checkbox"
                      disabled={!isEditingPersonalization}
                      checked={personalizationForm.warm_start_enabled}
                      onChange={(e) =>
                        setPersonalizationForm({ ...personalizationForm, warm_start_enabled: e.target.checked })
                      }
                      className="rounded bg-white border-slate-300 text-emerald-600"
                    />
                    Enable Warm Start
                  </label>
                </div>
              </div>

              {isEditingPersonalization && (
                <div className="pt-3 border-t border-slate-200 space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">
                      Change Reason (Required for Audit Trail)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g., Calibrate weak-area weighting for learning phase"
                      value={personalizationReason}
                      onChange={(e) => setPersonalizationReason(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setIsEditingPersonalization(false)}
                      className="px-4 py-2 text-xs font-semibold bg-white text-slate-700 rounded-lg border border-slate-200"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isPending}
                      className="px-4 py-2 text-xs font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-500 disabled:opacity-50"
                    >
                      {isPending ? "Saving..." : "Save Personalization Policy"}
                    </button>
                  </div>
                </div>
              )}
            </form>
          </div>
        </div>
      )}

      {/* TAB 5: SAFETY & EMERGENCY CONTROLS */}
      {/* ==================================================================== */}
      {activeTab === "safety" && (
        <div className="space-y-6">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Adaptive Safety &amp; Emergency Controls</h3>
            <p className="text-xs text-slate-500">
              Server-authoritative boundary constraints, drift limits, and instant emergency kill-switch.
            </p>
          </div>

          <div className="p-5 rounded-xl bg-rose-50 border border-rose-200 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-rose-100 border border-rose-300 flex items-center justify-center text-rose-700">
                <ShieldAlert className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900">Emergency Kill-Switch</h4>
                <p className="text-xs text-rose-700">
                  Immediately blocks new advanced adaptive attempts while gracefully concluding in-flight tests.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-rose-200">
              <span className="text-xs text-slate-300">
                Current Status:{" "}
                <span className="font-bold text-slate-900">
                  {globalStatus.emergency_disabled ? "EMERGENCY ENGAGED" : "NORMAL OPERATION"}
                </span>
              </span>
              <button
                onClick={() => {
                  if (globalStatus.emergency_disabled) {
                    handleEmergencyToggle(false);
                  } else {
                    setShowEmergencyModal(true);
                  }
                }}
                disabled={isPending}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition ${
                  globalStatus.emergency_disabled
                    ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                    : "bg-rose-600 hover:bg-rose-700 text-white shadow-xs"
                }`}
              >
                {globalStatus.emergency_disabled ? "Clear Emergency Disable" : "Engage Emergency Kill-Switch"}
              </button>
            </div>
          </div>

          <div className="bg-white border border-slate-200/80 rounded-xl shadow-xs p-5 space-y-4">
            <h4 className="text-sm font-bold text-slate-900">Global Safety Boundaries</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-slate-500 block">Question Length Boundaries</span>
                <span className="text-sm font-bold text-slate-900 font-mono">
                  Min: {safetyLimits.absolute_min_questions} / Max: {safetyLimits.absolute_max_questions}
                </span>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-slate-500 block">Max Exposure Rate Ceiling</span>
                <span className="text-sm font-bold text-slate-900 font-mono">
                  {(safetyLimits.max_item_exposure_ceiling * 100).toFixed(0)}%
                </span>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-slate-500 block">Max Ability ($\theta$) Drift per Step</span>
                <span className="text-sm font-bold text-slate-900 font-mono">
                  ±{safetyLimits.max_theta_drift_per_step.toFixed(1)}
                </span>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-slate-500 block">Fallback Policy</span>
                <span className="text-sm font-bold text-slate-900 font-mono">
                  {safetyLimits.allow_emergency_fallback ? "Heuristic v1 Fallback" : "Strict Termination"}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 6: AUDIT TRAIL */}
      {/* ==================================================================== */}
      {activeTab === "audit" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Administrative Audit Trail</h3>
              <p className="text-xs text-slate-500">
                Immutable record of all adaptive configuration mutations, version activations, and calibration events.
              </p>
            </div>
            <Badge variant="outline" className="text-xs font-mono bg-slate-100 text-slate-700 border-slate-200">
              <Shield className="w-3 h-3 mr-1 text-blue-400 inline" /> Trigger Protected
            </Badge>
          </div>

          <div className="bg-white border border-slate-200/80 rounded-xl shadow-xs overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 text-slate-500 border-b border-slate-200 font-mono text-[11px] uppercase">
                <tr>
                  <th className="p-3.5">Timestamp</th>
                  <th className="p-3.5">Action</th>
                  <th className="p-3.5">Target Entity</th>
                  <th className="p-3.5">Actor</th>
                  <th className="p-3.5">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {auditLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-slate-500">
                      No administrative audit events recorded yet.
                    </td>
                  </tr>
                ) : (
                  auditLogs.map((log) => (
                    <tr key={log.id}>
                      <td className="p-3.5 font-mono text-[11px] text-slate-400">
                        {new Date(log.created_at).toLocaleString()}
                      </td>
                      <td className="p-3.5 font-mono font-bold text-blue-400">{log.action_type}</td>
                      <td className="p-3.5 font-mono text-[11px] text-slate-300">{log.target_entity}</td>
                      <td className="p-3.5 text-slate-400 truncate max-w-[150px]">{log.actor_email}</td>
                      <td className="p-3.5 text-slate-300">{log.reason || "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Attempt Ability Trajectory Modal */}
      {selectedAbilityDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-50/80 backdrop-blur-xs p-4">
          <div className="bg-white border border-slate-200/80 rounded-xl shadow-xs max-w-3xl w-full p-5 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <Target className="w-5 h-5 text-blue-400" />
                <h3 className="text-base font-bold text-slate-900">Adaptive Ability Trajectory</h3>
              </div>
              <button
                onClick={() => setSelectedAbilityDetail(null)}
                className="text-slate-400 hover:text-slate-900 text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-slate-500 block">Final Theta (θ)</span>
                <span className="text-lg font-bold text-slate-900 font-mono mt-1 block">
                  {selectedAbilityDetail.current_theta >= 0 ? "+" + selectedAbilityDetail.current_theta.toFixed(2) : selectedAbilityDetail.current_theta.toFixed(2)}
                </span>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-slate-500 block">Standard Error</span>
                <span className="text-lg font-bold text-slate-900 font-mono mt-1 block">
                  ±{selectedAbilityDetail.standard_error.toFixed(2)}
                </span>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-slate-500 block">Steps Answered</span>
                <span className="text-lg font-bold text-slate-900 font-mono mt-1 block">
                  {selectedAbilityDetail.questions_served}
                </span>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-slate-500 block">Correctness</span>
                <span className="text-lg font-bold text-emerald-400 font-mono mt-1 block">
                  {selectedAbilityDetail.correct_count} / {selectedAbilityDetail.questions_served}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-300 font-mono uppercase">Step-by-Step Estimation History</h4>
              <div className="bg-slate-50 border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 font-mono text-[10px] uppercase">
                    <tr>
                      <th className="p-2.5">Step</th>
                      <th className="p-2.5">Item b (Diff)</th>
                      <th className="p-2.5">Source</th>
                      <th className="p-2.5">Result</th>
                      <th className="p-2.5">θ Transition</th>
                      <th className="p-2.5">SE Transition</th>
                      <th className="p-2.5">Iter</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {selectedAbilityDetail.history.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-4 text-center text-slate-500">
                          No step estimation history snapshots recorded for this attempt.
                        </td>
                      </tr>
                    ) : (
                      selectedAbilityDetail.history.map((h) => (
                        <tr key={h.id}>
                          <td className="p-2.5 font-mono font-bold text-slate-400">#{h.step_number}</td>
                          <td className="p-2.5 font-mono text-slate-900">{h.difficulty_b.toFixed(2)}</td>
                          <td className="p-2.5 font-mono text-[10px] text-slate-400">{h.difficulty_source}</td>
                          <td className="p-2.5">
                            {h.is_correct ? (
                              <span className="text-emerald-400 font-semibold">CORRECT</span>
                            ) : (
                              <span className="text-rose-400 font-semibold">INCORRECT</span>
                            )}
                          </td>
                          <td className="p-2.5 font-mono text-slate-200">
                            {h.theta_before.toFixed(2)} → <span className="font-bold text-slate-900">{h.theta_after.toFixed(2)}</span>
                          </td>
                          <td className="p-2.5 font-mono text-slate-400">
                            ±{h.se_before.toFixed(2)} → ±{h.se_after.toFixed(2)}
                          </td>
                          <td className="p-2.5 font-mono text-slate-400">{h.iterations}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Estimator Configuration Modal */}
      {isEditingEstimator && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-50/80 backdrop-blur-xs p-4">
          <div className="bg-white border border-slate-200/80 rounded-xl shadow-xs max-w-lg w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900">Configure Ability Estimator</h3>
              <button
                onClick={() => setIsEditingEstimator(false)}
                className="text-slate-400 hover:text-slate-900 text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEstimatorConfig} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-500 block mb-1 font-mono">Regularization Lambda (λ)</label>
                  <input
                    type="number"
                    step="0.05"
                    value={estimatorForm.regularization_lambda}
                    onChange={(e) => setEstimatorForm({ ...estimatorForm, regularization_lambda: parseFloat(e.target.value) || 0.2 })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-900 font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="text-slate-500 block mb-1 font-mono">Max Iterations</label>
                  <input
                    type="number"
                    value={estimatorForm.max_iterations}
                    onChange={(e) => setEstimatorForm({ ...estimatorForm, max_iterations: parseInt(e.target.value, 10) || 25 })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-900 font-mono"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-500 block mb-1 font-mono">Min Theta (θ)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={estimatorForm.min_theta}
                    onChange={(e) => setEstimatorForm({ ...estimatorForm, min_theta: parseFloat(e.target.value) || -3.0 })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-900 font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="text-slate-500 block mb-1 font-mono">Max Theta (θ)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={estimatorForm.max_theta}
                    onChange={(e) => setEstimatorForm({ ...estimatorForm, max_theta: parseFloat(e.target.value) || 3.0 })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-900 font-mono"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-500 block mb-1 font-mono">Min SE Bound</label>
                  <input
                    type="number"
                    step="0.05"
                    value={estimatorForm.min_se}
                    onChange={(e) => setEstimatorForm({ ...estimatorForm, min_se: parseFloat(e.target.value) || 0.10 })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-900 font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="text-slate-500 block mb-1 font-mono">Convergence Tol</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={estimatorForm.convergence_tolerance}
                    onChange={(e) => setEstimatorForm({ ...estimatorForm, convergence_tolerance: parseFloat(e.target.value) || 0.0001 })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-900 font-mono"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-500 block mb-1 font-mono">Administrative Reason (Required, min 5 chars)</label>
                <input
                  type="text"
                  placeholder="Reason for modifying estimator parameters..."
                  value={estimatorReason}
                  onChange={(e) => setEstimatorReason(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-900"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsEditingEstimator(false)}
                  className="px-3 py-1.5 rounded-lg text-slate-400 hover:text-slate-900 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold cursor-pointer"
                >
                  Save Configuration
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Item Detail & Calibration Inspection Modal */}
      {selectedItemDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-50/80 backdrop-blur-xs p-4">
          <div className="bg-white border border-slate-200/80 rounded-xl shadow-xs max-w-2xl w-full p-5 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <Scale className="w-5 h-5 text-blue-400" />
                <h3 className="text-base font-bold text-slate-900">Item Calibration Inspection</h3>
              </div>
              <button
                onClick={() => setSelectedItemDetail(null)}
                className="text-slate-400 hover:text-slate-900 text-sm"
              >
                ✕
              </button>
            </div>

            {/* Question Text */}
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
              <span className="text-[10px] text-slate-500 uppercase font-mono block">Question Version ID: {selectedItemDetail.question_version_id}</span>
              <p className="text-xs text-slate-900 mt-1 font-medium">{selectedItemDetail.question_text}</p>
            </div>

            {/* Psychometric Metrics Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-[10px] text-slate-500 uppercase font-mono block">Difficulty (b)</span>
                <span className="text-sm font-bold text-blue-400 font-mono">
                  {selectedItemDetail.difficulty_b !== null ? selectedItemDetail.difficulty_b.toFixed(2) : "Uncalibrated"}
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-[10px] text-slate-500 uppercase font-mono block">Sample Size (N)</span>
                <span className="text-sm font-bold text-slate-900 font-mono">{selectedItemDetail.sample_size}</span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-[10px] text-slate-500 uppercase font-mono block">Accuracy Rate</span>
                <span className="text-sm font-bold text-emerald-400 font-mono">
                  {(selectedItemDetail.accuracy_rate * 100).toFixed(1)}%
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-[10px] text-slate-500 uppercase font-mono block">Confidence</span>
                <span className="text-sm font-bold text-purple-400 font-mono">
                  {(selectedItemDetail.confidence_score * 100).toFixed(0)}%
                </span>
              </div>
            </div>

            {/* Parameter Non-Fabrication Confirmation */}
            <div className="p-3 rounded-lg bg-slate-50/80 border border-slate-200 text-[11px] text-slate-400 flex items-center justify-between">
              <div>
                <span>Discrimination (a): <strong className="text-slate-300 font-mono">NULL</strong></span>
                <span className="mx-2">•</span>
                <span>Pseudo-guessing (c): <strong className="text-slate-300 font-mono">NULL</strong></span>
              </div>
              <Badge variant="outline" className="text-[9px] font-mono bg-slate-800 text-slate-300">
                Non-Fabricated
              </Badge>
            </div>

            {/* Calibration Timeline */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-blue-400" /> Calibration Snapshot History ({selectedItemDetail.history.length})
              </h4>
              <div className="bg-slate-50 border border-slate-200 rounded-lg max-h-40 overflow-y-auto divide-y divide-slate-100 text-xs">
                {selectedItemDetail.history.length === 0 ? (
                  <p className="p-3 text-center text-slate-500 text-[11px]">No previous calibration snapshots recorded.</p>
                ) : (
                  selectedItemDetail.history.map((h) => (
                    <div key={h.id} className="p-2.5 flex items-center justify-between text-[11px]">
                      <div>
                        <span className="font-mono text-slate-400">{new Date(h.calculated_at).toLocaleString()}</span>
                        <div className="text-slate-300 mt-0.5">{h.reason || "Automatic recalculation"}</div>
                      </div>
                      <Badge variant="outline" className="text-[9px] font-mono">
                        {h.previous_status || "none"} &rarr; {h.new_status}
                      </Badge>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Action Bar */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-200">
              <div className="flex items-center gap-2">
                <button
                  onClick={() =>
                    setStatusModal({
                      open: true,
                      type: selectedItemDetail.calibration_status === "flagged" ? "unflag" : "flag",
                      questionVersionId: selectedItemDetail.question_version_id,
                      reason: "",
                    })
                  }
                  className="px-2.5 py-1.5 rounded bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-semibold border border-slate-200 inline-flex items-center gap-1"
                >
                  <Flag className="w-3 h-3" />
                  {selectedItemDetail.calibration_status === "flagged" ? "Clear Flag" : "Flag Item"}
                </button>

                <button
                  onClick={() =>
                    setStatusModal({
                      open: true,
                      type: selectedItemDetail.calibration_status === "deprecated" ? "restore" : "deprecate",
                      questionVersionId: selectedItemDetail.question_version_id,
                      reason: "",
                    })
                  }
                  className="px-2.5 py-1.5 rounded bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-semibold border border-slate-200 inline-flex items-center gap-1"
                >
                  {selectedItemDetail.calibration_status === "deprecated" ? (
                    <>
                      <Undo2 className="w-3 h-3" /> Restore
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-3 h-3 text-rose-400" /> Deprecate
                    </>
                  )}
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleRecalibrateSingle(selectedItemDetail.question_version_id)}
                  disabled={isPending}
                  className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold inline-flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Recalibrate Now
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Status Change Modal (Flag / Deprecate / Restore) */}
      {statusModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-50/80 backdrop-blur-xs p-4">
          <div className="bg-white border border-slate-200/80 rounded-xl shadow-xs max-w-md w-full p-5 space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-slate-900 capitalize">{statusModal.type} Item Calibration</h3>
            <p className="text-xs text-slate-300">
              Provide a clear administrative explanation for this status change. All actions are logged immutably.
            </p>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Mandatory Explanation / Reason:</label>
              <textarea
                value={statusModal.reason}
                onChange={(e) => setStatusModal({ ...statusModal, reason: e.target.value })}
                placeholder="State why this item is being updated (e.g. content ambiguity, syllabus drift)..."
                rows={3}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs text-slate-900 focus:outline-hidden"
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                onClick={() => setStatusModal({ ...statusModal, open: false })}
                className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteStatusChange}
                disabled={isPending || statusModal.reason.trim().length < 5}
                className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-slate-900 text-xs font-bold"
              >
                Confirm Status Change
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Emergency Modal */}
      {showEmergencyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-50/80 backdrop-blur-xs p-4">
          <div className="bg-white border border-rose-200 rounded-xl shadow-xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-400">
              <ShieldAlert className="w-6 h-6" />
              <h3 className="text-base font-bold text-slate-900">Engage Emergency Disable</h3>
            </div>
            <p className="text-xs text-slate-300">
              Activating emergency disable will immediately halt new advanced adaptive test creation. Existing attempts will safely finish or fallback.
            </p>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Mandatory Explanation / Reason:</label>
              <textarea
                value={emergencyReason}
                onChange={(e) => setEmergencyReason(e.target.value)}
                placeholder="Explain why the engine is being emergency disabled (e.g. unexpected theta drift, question pool anomaly)..."
                rows={3}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs text-slate-900 focus:outline-hidden focus:border-rose-500"
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                onClick={() => setShowEmergencyModal(false)}
                className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={() => handleEmergencyToggle(true)}
                disabled={isPending || emergencyReason.trim().length < 5}
                className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-slate-900 text-xs font-bold"
              >
                Engage Kill-Switch
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Version Modal */}
      {showCreateVersionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-50/80 backdrop-blur-xs p-4">
          <form onSubmit={handleCreateVersion} className="bg-white border border-slate-200/80 rounded-xl shadow-xs max-w-lg w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900">Register Algorithm Version</h3>
              <button type="button" onClick={() => setShowCreateVersionModal(false)} className="text-slate-400 hover:text-slate-900 text-xs">
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-300">Version Code *</label>
                <input
                  type="text"
                  value={newVersionCode}
                  onChange={(e) => setNewVersionCode(e.target.value)}
                  placeholder="e.g. v2_brm_cat"
                  required
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs text-slate-900"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-300">Display Name *</label>
                <input
                  type="text"
                  value={newVersionName}
                  onChange={(e) => setNewVersionName(e.target.value)}
                  placeholder="e.g. Adaptive v2.0 Beta"
                  required
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs text-slate-900"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-300">Description</label>
              <input
                type="text"
                value={newVersionDesc}
                onChange={(e) => setNewVersionDesc(e.target.value)}
                placeholder="Brief summary of algorithm changes..."
                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs text-slate-900"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-300">Release Notes</label>
              <textarea
                value={newVersionNotes}
                onChange={(e) => setNewVersionNotes(e.target.value)}
                placeholder="Detailed release notes and validation criteria..."
                rows={3}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs text-slate-900"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowCreateVersionModal(false)}
                className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold"
              >
                Register Version
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
