"use client";
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */

import React, { useState, useTransition } from "react";
import {
  GlobalPremiumConfig,
  ExamPremiumConfig,
  TestTypePremiumConfig,
  GeneratorPolicyConfig,
  PremiumAnalyticsSummary,
  AdminAuditLogItem,
  CandidateLookupResult,
} from "@/services/admin-premium.service";
import {
  updateGlobalPremiumConfigAction,
  setExamPremiumAvailabilityAction,
  setTestTypeAvailabilityAction,
  updateGeneratorPolicyAction,
  searchCandidateAction,
  grantPromotionalPassAction,
  revokeEntitlementAction,
  updateCustomLimitsAction,
  toggleTestSeriesStatusAction,
  updateMockCuratedStatusAction,
} from "@/app/admin/premium/actions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import {
  Sparkles,
  Shield,
  Activity,
  Layers,
  Settings,
  UserCheck,
  BookOpen,
  History,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Search,
  Lock,
  Unlock,
  Sliders,
  Calendar,
  Zap,
  HelpCircle,
  Eye,
  X,
  FileCheck2,
} from "lucide-react";

interface Props {
  initialGlobalConfig: GlobalPremiumConfig;
  initialGeneratorPolicy: GeneratorPolicyConfig;
  initialExamConfigs: ExamPremiumConfig[];
  initialTestTypeConfigs: TestTypePremiumConfig[];
  initialAnalytics: PremiumAnalyticsSummary;
  initialAuditLogs: AdminAuditLogItem[];
  initialTestSeries: any[];
  initialCuratedMocks: any[];
}

type TabType =
  | "overview"
  | "global"
  | "exams"
  | "test_types"
  | "policy"
  | "candidates"
  | "curated"
  | "audit";

export function AdminPremiumManager({
  initialGlobalConfig,
  initialGeneratorPolicy,
  initialExamConfigs,
  initialTestTypeConfigs,
  initialAnalytics,
  initialAuditLogs,
  initialTestSeries,
  initialCuratedMocks,
}: Props) {
  const [activeTab, setActiveTab] = useState<TabType>("overview");
  const [isPending, startTransition] = useTransition();

  // State slices
  const [globalConfig, setGlobalConfig] = useState<GlobalPremiumConfig>(initialGlobalConfig);
  const [generatorPolicy, setGeneratorPolicy] = useState<GeneratorPolicyConfig>(initialGeneratorPolicy);
  const [examConfigs, setExamConfigs] = useState<ExamPremiumConfig[]>(initialExamConfigs);
  const [testTypeConfigs, setTestTypeConfigs] = useState<TestTypePremiumConfig[]>(initialTestTypeConfigs);
  const [analytics, setAnalytics] = useState<PremiumAnalyticsSummary>(initialAnalytics);
  const [auditLogs, setAuditLogs] = useState<AdminAuditLogItem[]>(initialAuditLogs);
  const [testSeries, setTestSeries] = useState<any[]>(initialTestSeries);
  const [curatedMocks, setCuratedMocks] = useState<any[]>(initialCuratedMocks);

  // Global form states
  const [maintenanceMessage, setMaintenanceMessage] = useState(globalConfig.maintenance_message);
  const [globalReason, setGlobalReason] = useState("");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Policy form state
  const [policyForm, setPolicyForm] = useState<GeneratorPolicyConfig>(generatorPolicy);
  const [policyReason, setPolicyReason] = useState("");

  // Exam search state
  const [examSearch, setExamSearch] = useState("");

  // Candidate search & management state
  const [candidateQuery, setCandidateQuery] = useState("");
  const [candidateData, setCandidateData] = useState<CandidateLookupResult | null>(null);
  const [candidateLoading, setCandidateLoading] = useState(false);
  const [candidateError, setCandidateError] = useState<string | null>(null);

  // Modals state
  const [showGrantModal, setShowGrantModal] = useState(false);
  const [grantDurationDays, setGrantDurationDays] = useState(30);
  const [grantReason, setGrantReason] = useState("");
  const [selectedAuditLog, setSelectedAuditLog] = useState<AdminAuditLogItem | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    description: string;
    onConfirm: () => void;
  } | null>(null);

  // Quota edit state
  const [editQuotaEntitlementId, setEditQuotaEntitlementId] = useState<string | null>(null);
  const [quotaEdits, setQuotaEdits] = useState<Record<string, number>>({});
  const [quotaReason, setQuotaReason] = useState("");

  // ==========================================================================
  // HANDLERS: GLOBAL CONTROLS
  // ==========================================================================

  const handleToggleGlobalPremium = (newStatus: boolean) => {
    const actionDesc = newStatus ? "Enable Premium Ecosystem" : "Emergency Disable Premium";
    setConfirmModal({
      title: `${actionDesc}?`,
      description: newStatus
        ? "Enabling Premium will restore dynamic test generation and candidate attempt starts across all entitled users."
        : "Disabling Premium will block NEW test generation and NEW attempt starts. In-progress attempts remain finishable, historical results remain accessible, and Daily Mock remains active.",
      onConfirm: () => {
        setConfirmModal(null);
        startTransition(async () => {
          setFeedback(null);
          const res = await updateGlobalPremiumConfigAction({
            isPremiumEnabled: newStatus,
            reason: globalReason.trim() || `Admin manually toggled Premium to ${newStatus ? "ENABLED" : "DISABLED"}`,
          });
          if (res.success && res.data) {
            setGlobalConfig(res.data as GlobalPremiumConfig);
            setFeedback({ type: "success", message: res.message || "Global Premium status updated." });
            setGlobalReason("");
          } else {
            setFeedback({ type: "error", message: res.error || "Failed to update global status." });
          }
        });
      },
    });
  };

  const handleToggleMaintenance = (newMaintenance: boolean) => {
    setConfirmModal({
      title: `${newMaintenance ? "Activate" : "Deactivate"} Maintenance Mode?`,
      description: newMaintenance
        ? "Candidates will see the maintenance notice and cannot generate new dynamic mocks. In-progress attempts remain finishable."
        : "Maintenance mode will be deactivated and full candidate operations restored.",
      onConfirm: () => {
        setConfirmModal(null);
        startTransition(async () => {
          setFeedback(null);
          const res = await updateGlobalPremiumConfigAction({
            maintenanceMode: newMaintenance,
            maintenanceMessage: maintenanceMessage,
            reason: globalReason.trim() || `Admin manually toggled maintenance mode to ${newMaintenance ? "ON" : "OFF"}`,
          });
          if (res.success && res.data) {
            setGlobalConfig(res.data as GlobalPremiumConfig);
            setFeedback({ type: "success", message: res.message || "Maintenance mode updated." });
            setGlobalReason("");
          } else {
            setFeedback({ type: "error", message: res.error || "Failed to update maintenance mode." });
          }
        });
      },
    });
  };

  const handleSaveMaintenanceMessage = () => {
    if (!globalReason.trim()) {
      setFeedback({ type: "error", message: "Please provide a reason for updating the maintenance message." });
      return;
    }
    startTransition(async () => {
      setFeedback(null);
      const res = await updateGlobalPremiumConfigAction({
        maintenanceMessage: maintenanceMessage,
        reason: globalReason.trim(),
      });
      if (res.success && res.data) {
        setGlobalConfig(res.data as GlobalPremiumConfig);
        setFeedback({ type: "success", message: "Maintenance message updated successfully." });
        setGlobalReason("");
      } else {
        setFeedback({ type: "error", message: res.error || "Failed to update maintenance message." });
      }
    });
  };

  // ==========================================================================
  // HANDLERS: EXAM CONTROLS
  // ==========================================================================

  const handleToggleExam = (examId: string, currentEnabled: boolean, examTitle: string) => {
    const newStatus = !currentEnabled;
    const action = newStatus ? "Enable" : "Disable";
    setConfirmModal({
      title: `${action} Premium for ${examTitle}?`,
      description: newStatus
        ? `Candidates with active entitlements for ${examTitle} will be able to access Premium mocks.`
        : `Premium mocks for ${examTitle} will be disabled. Daily Mocks will remain active.`,
      onConfirm: () => {
        setConfirmModal(null);
        startTransition(async () => {
          setFeedback(null);
          const res = await setExamPremiumAvailabilityAction({
            examId,
            isEnabled: newStatus,
            reason: `Admin toggled exam availability for ${examTitle} to ${newStatus ? "ENABLED" : "DISABLED"}`,
          });
          if (res.success) {
            setExamConfigs((prev) =>
              prev.map((e) => (e.exam_id === examId ? { ...e, is_enabled: newStatus } : e))
            );
            setFeedback({ type: "success", message: res.message || "Exam availability updated." });
          } else {
            setFeedback({ type: "error", message: res.error || "Failed to update exam availability." });
          }
        });
      },
    });
  };

  // ==========================================================================
  // HANDLERS: TEST TYPE GOVERNANCE
  // ==========================================================================

  const handleToggleTestType = (testType: string, currentEnabled: boolean, label: string) => {
    const newStatus = !currentEnabled;
    startTransition(async () => {
      setFeedback(null);
      const res = await setTestTypeAvailabilityAction({
        testType,
        isEnabled: newStatus,
        reason: `Admin toggled test-type governance for ${label} to ${newStatus ? "ENABLED" : "DISABLED"}`,
      });
      if (res.success) {
        setTestTypeConfigs((prev) =>
          prev.map((t) => (t.test_type === testType ? { ...t, is_enabled: newStatus } : t))
        );
        setFeedback({ type: "success", message: res.message || "Test type governance updated." });
      } else {
        setFeedback({ type: "error", message: res.error || "Failed to update test type governance." });
      }
    });
  };

  // ==========================================================================
  // HANDLERS: GENERATOR POLICY
  // ==========================================================================

  const handleSavePolicy = () => {
    if (!policyReason.trim()) {
      setFeedback({ type: "error", message: "Please provide a reason for updating the generator policy." });
      return;
    }
    startTransition(async () => {
      setFeedback(null);
      const res = await updateGeneratorPolicyAction({
        policy: policyForm,
        reason: policyReason.trim(),
      });
      if (res.success && res.data) {
        setGeneratorPolicy(res.data as GeneratorPolicyConfig);
        setFeedback({ type: "success", message: "Generator policy updated successfully." });
        setPolicyReason("");
      } else {
        setFeedback({ type: "error", message: res.error || "Failed to update generator policy." });
      }
    });
  };

  // ==========================================================================
  // HANDLERS: CANDIDATE SEARCH & GRANTS
  // ==========================================================================

  const handleSearchCandidate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!candidateQuery.trim()) return;
    setCandidateLoading(true);
    setCandidateError(null);
    setCandidateData(null);

    const res = await searchCandidateAction(candidateQuery.trim());
    setCandidateLoading(false);
    if (res.success && res.data) {
      setCandidateData(res.data as CandidateLookupResult);
    } else {
      setCandidateError(res.error || "No candidate matched your search query.");
    }
  };

  const handleGrantPromotionalPass = () => {
    if (!candidateData || !grantReason.trim()) {
      setFeedback({ type: "error", message: "Reason is required to grant promotional access." });
      return;
    }
    startTransition(async () => {
      setFeedback(null);
      const res = await grantPromotionalPassAction({
        userId: candidateData.user.id,
        durationDays: grantDurationDays,
        reason: grantReason.trim(),
      });
      setShowGrantModal(false);
      if (res.success) {
        setFeedback({ type: "success", message: "Promotional access granted successfully." });
        setGrantReason("");
        // Refresh candidate data
        const refreshed = await searchCandidateAction(candidateData.user.id);
        if (refreshed.success && refreshed.data) {
          setCandidateData(refreshed.data as CandidateLookupResult);
        }
      } else {
        setFeedback({ type: "error", message: res.error || "Failed to grant promotional access." });
      }
    });
  };

  const handleRevokeEntitlement = (entitlementId: string) => {
    setConfirmModal({
      title: "Revoke Candidate Entitlement?",
      description: "This will deactivate future Premium access for this candidate. Historical attempts and scorecards remain intact.",
      onConfirm: () => {
        setConfirmModal(null);
        startTransition(async () => {
          setFeedback(null);
          const res = await revokeEntitlementAction({
            entitlementId,
            reason: "Admin manually revoked entitlement from Candidate Management panel",
          });
          if (res.success) {
            setFeedback({ type: "success", message: "Entitlement revoked successfully." });
            if (candidateData) {
              const refreshed = await searchCandidateAction(candidateData.user.id);
              if (refreshed.success && refreshed.data) {
                setCandidateData(refreshed.data as CandidateLookupResult);
              }
            }
          } else {
            setFeedback({ type: "error", message: res.error || "Failed to revoke entitlement." });
          }
        });
      },
    });
  };

  const handleSaveCustomLimits = () => {
    if (!editQuotaEntitlementId || !quotaReason.trim()) {
      setFeedback({ type: "error", message: "Reason is required to update custom quota limits." });
      return;
    }
    startTransition(async () => {
      setFeedback(null);
      const res = await updateCustomLimitsAction({
        entitlementId: editQuotaEntitlementId,
        customLimits: quotaEdits,
        reason: quotaReason.trim(),
      });
      setEditQuotaEntitlementId(null);
      if (res.success) {
        setFeedback({ type: "success", message: "Custom quota limits updated successfully." });
        setQuotaReason("");
        if (candidateData) {
          const refreshed = await searchCandidateAction(candidateData.user.id);
          if (refreshed.success && refreshed.data) {
            setCandidateData(refreshed.data as CandidateLookupResult);
          }
        }
      } else {
        setFeedback({ type: "error", message: res.error || "Failed to update custom limits." });
      }
    });
  };

  // ==========================================================================
  // HANDLERS: CURATED SERIES & MOCKS
  // ==========================================================================

  const handleToggleSeries = (seriesId: string, currentActive: boolean, title: string) => {
    const newActive = !currentActive;
    startTransition(async () => {
      setFeedback(null);
      const res = await toggleTestSeriesStatusAction({
        seriesId,
        isActive: newActive,
        reason: `Admin toggled series "${title}" status to ${newActive ? "ACTIVE" : "INACTIVE"}`,
      });
      if (res.success) {
        setTestSeries((prev) =>
          prev.map((s) => (s.id === seriesId ? { ...s, is_active: newActive } : s))
        );
        setFeedback({ type: "success", message: res.message || "Test series updated." });
      } else {
        setFeedback({ type: "error", message: res.error || "Failed to update test series." });
      }
    });
  };

  const handleToggleMockFeatured = (mockTestId: string, currentFeatured: boolean, title: string) => {
    const newFeatured = !currentFeatured;
    startTransition(async () => {
      setFeedback(null);
      const res = await updateMockCuratedStatusAction({
        mockTestId,
        isFeatured: newFeatured,
        reason: `Admin ${newFeatured ? "featured" : "unfeatured"} mock "${title}"`,
      });
      if (res.success) {
        setCuratedMocks((prev) =>
          prev.map((m) =>
            m.id === mockTestId
              ? { ...m, generation_metadata: { ...(m.generation_metadata || {}), is_featured: newFeatured } }
              : m
          )
        );
        setFeedback({ type: "success", message: "Mock test featuring updated." });
      } else {
        setFeedback({ type: "error", message: res.error || "Failed to update mock test." });
      }
    });
  };

  // Filtered exams list
  const filteredExams = examConfigs.filter((e) =>
    e.exam_title.toLowerCase().includes(examSearch.toLowerCase().trim()) ||
    e.exam_slug.toLowerCase().includes(examSearch.toLowerCase().trim())
  );

  return (
    <div className="space-y-6 max-w-7xl pb-16">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                Premium Control Center
                <Badge variant={globalConfig.is_premium_enabled ? "success" : "destructive"} className="text-[10px] uppercase font-mono">
                  {globalConfig.is_premium_enabled ? "System Live" : "Emergency Disabled"}
                </Badge>
                {globalConfig.maintenance_mode && (
                  <Badge variant="warning" className="text-[10px] uppercase font-mono">
                    Maintenance Active
                  </Badge>
                )}
              </h1>
              <p className="text-xs text-slate-500 font-medium">
                SaaS governance, dynamic generator policies, exam availability, user entitlements, and audit trail.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.location.reload()}
            disabled={isPending}
            className="text-xs font-bold border-slate-200 hover:bg-slate-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isPending ? "animate-spin" : ""}`} />
            Refresh State
          </Button>
        </div>
      </div>

      {/* Global Feedback Banner */}
      {feedback && (
        <Alert
          variant={feedback.type === "success" ? "success" : "error"}
          className="animate-in fade-in duration-200"
        >
          {feedback.message}
        </Alert>
      )}

      {/* Navigation Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-slate-200 text-xs font-bold scrollbar-none">
        {[
          { id: "overview", label: "Overview & KPIs", icon: Activity },
          { id: "global", label: "Global Status", icon: Shield },
          { id: "exams", label: "Exam Availability", icon: BookOpen },
          { id: "test_types", label: "Test Governance", icon: Layers },
          { id: "policy", label: "Generator Policy", icon: Sliders },
          { id: "candidates", label: "Candidate Access", icon: UserCheck },
          { id: "curated", label: "Curated Content", icon: FileCheck2 },
          { id: "audit", label: "Audit Explorer", icon: History },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id as TabType);
                setFeedback(null);
              }}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl transition whitespace-nowrap ${
                isActive
                  ? "bg-slate-900 text-white shadow-xs"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ==================================================================== */}
      {/* TAB 1: OVERVIEW & KPIS */}
      {/* ==================================================================== */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* Top Metric Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
            <Card className="p-4 bg-white border-slate-200">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono">
                Active Premium Users
              </span>
              <p className="text-2xl font-black text-slate-900 mt-1">
                {analytics.activePremiumCandidates}
              </p>
              <span className="text-[10px] text-emerald-600 font-bold">PRO &amp; Passes Active</span>
            </Card>

            <Card className="p-4 bg-white border-slate-200">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono">
                Total Entitlements
              </span>
              <p className="text-2xl font-black text-slate-900 mt-1">
                {analytics.totalPremiumEntitlements}
              </p>
              <span className="text-[10px] text-slate-400 font-medium">All-time issued</span>
            </Card>

            <Card className="p-4 bg-white border-slate-200">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono">
                Premium Attempts
              </span>
              <p className="text-2xl font-black text-slate-900 mt-1">
                {analytics.totalPremiumAttempts}
              </p>
              <span className="text-[10px] text-blue-600 font-bold">Non-free mock starts</span>
            </Card>

            <Card className="p-4 bg-white border-slate-200">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono">
                Completion Rate
              </span>
              <p className="text-2xl font-black text-slate-900 mt-1">
                {analytics.completionRatePct}%
              </p>
              <span className="text-[10px] text-slate-400 font-medium">{analytics.completedPremiumAttempts} completed</span>
            </Card>

            <Card className="p-4 bg-white border-slate-200">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono">
                Dynamic Generated
              </span>
              <p className="text-2xl font-black text-slate-900 mt-1">
                {analytics.dynamicMocksGenerated}
              </p>
              <span className="text-[10px] text-amber-600 font-bold">Dynamic instances</span>
            </Card>
          </div>

          {/* Quota Consumption Breakdown */}
          <Card className="p-5 bg-white border-slate-200 space-y-4">
            <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
              <Activity className="w-4 h-4 text-indigo-600" />
              Consumed Quota Starts by Test Category
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {Object.entries(analytics.quotaUsageByType).map(([key, count]) => (
                <div key={key} className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/50 flex flex-col justify-between">
                  <span className="text-[11px] font-bold text-slate-600 uppercase font-mono">{key}</span>
                  <div className="mt-2 flex items-baseline justify-between">
                    <span className="text-lg font-black text-slate-900">{count}</span>
                    <span className="text-[10px] text-slate-400 font-medium">Starts</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 2: GLOBAL STATUS & EMERGENCY CONTROLS */}
      {/* ==================================================================== */}
      {activeTab === "global" && (
        <div className="space-y-6 max-w-4xl">
          <Card className="p-6 bg-white border-slate-200 space-y-6">
            <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <Shield className="w-5 h-5 text-indigo-600" />
              Global System Governance &amp; Emergency Controls
            </h2>

            {/* Global Master Toggle */}
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between">
              <div>
                <h3 className="font-extrabold text-slate-900 text-sm">Master Premium System</h3>
                <p className="text-xs text-slate-500 mt-0.5 max-w-lg">
                  When enabled, candidates can generate dynamic tests and start Premium mocks. Disabling blocks new starts while preserving in-progress attempts and Daily Mocks.
                </p>
              </div>
              <Button
                variant={globalConfig.is_premium_enabled ? "destructive" : "default"}
                size="sm"
                onClick={() => handleToggleGlobalPremium(!globalConfig.is_premium_enabled)}
                disabled={isPending}
                className="font-bold shrink-0"
              >
                {globalConfig.is_premium_enabled ? "Emergency Disable" : "Enable Premium"}
              </Button>
            </div>

            {/* Maintenance Mode Toggle */}
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between">
              <div>
                <h3 className="font-extrabold text-slate-900 text-sm">Maintenance Mode</h3>
                <p className="text-xs text-slate-500 mt-0.5 max-w-lg">
                  Displays the candidate maintenance notice on the Premium hub. Dynamic generation is paused until maintenance concludes.
                </p>
              </div>
              <Button
                variant={globalConfig.maintenance_mode ? "outline" : "default"}
                size="sm"
                onClick={() => handleToggleMaintenance(!globalConfig.maintenance_mode)}
                disabled={isPending}
                className="font-bold shrink-0"
              >
                {globalConfig.maintenance_mode ? "Deactivate Maintenance" : "Activate Maintenance"}
              </Button>
            </div>

            {/* Maintenance Message Field */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700">
                Candidate-Facing Maintenance Notice Message
              </label>
              <textarea
                rows={3}
                value={maintenanceMessage}
                onChange={(e) => setMaintenanceMessage(e.target.value)}
                className="w-full p-3 rounded-xl border border-slate-200 text-xs font-medium focus:outline-hidden focus:border-indigo-500 bg-white"
                placeholder="Enter message displayed to candidates during maintenance..."
              />
            </div>

            {/* Mandatory Reason */}
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <label className="block text-xs font-bold text-slate-700">
                Administrative Audit Reason (Mandatory for Updates)
              </label>
              <input
                type="text"
                value={globalReason}
                onChange={(e) => setGlobalReason(e.target.value)}
                placeholder="e.g. Scheduled database maintenance window / hotfix deployment"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium focus:outline-hidden focus:border-indigo-500 bg-white"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="default"
                size="sm"
                onClick={handleSaveMaintenanceMessage}
                disabled={isPending || !globalReason.trim()}
                className="font-bold bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                Save Maintenance Notice
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 3: EXAM AVAILABILITY */}
      {/* ==================================================================== */}
      {activeTab === "exams" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={examSearch}
                onChange={(e) => setExamSearch(e.target.value)}
                placeholder="Filter exams by title or slug..."
                className="w-full pl-9 pr-3 py-2 text-xs font-medium rounded-xl border border-slate-200 bg-white focus:outline-hidden focus:border-indigo-500"
              />
            </div>
            <Badge variant="indigo" className="text-xs">
              {filteredExams.length} Exams
            </Badge>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {filteredExams.map((exam) => (
              <Card key={exam.exam_id} className="p-4 bg-white border-slate-200 flex items-center justify-between">
                <div>
                  <h3 className="font-extrabold text-slate-900 text-sm">{exam.exam_title}</h3>
                  <span className="text-[10px] text-slate-400 font-mono">{exam.exam_slug}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={exam.is_enabled ? "success" : "neutral"} className="text-[10px]">
                    {exam.is_enabled ? "ENABLED" : "DISABLED"}
                  </Badge>
                  <Button
                    variant={exam.is_enabled ? "outline" : "default"}
                    size="sm"
                    onClick={() => handleToggleExam(exam.exam_id, exam.is_enabled, exam.exam_title)}
                    disabled={isPending}
                    className="text-xs font-bold"
                  >
                    {exam.is_enabled ? "Disable" : "Enable"}
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 4: TEST-TYPE GOVERNANCE */}
      {/* ==================================================================== */}
      {activeTab === "test_types" && (
        <div className="space-y-4 max-w-4xl">
          <div className="grid sm:grid-cols-2 gap-3.5">
            {testTypeConfigs.map((tt) => (
              <Card key={tt.test_type} className="p-4 bg-white border-slate-200 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-extrabold text-slate-900 text-sm">{tt.label}</h3>
                    <Badge variant={tt.is_enabled ? "success" : "neutral"} className="text-[9px] font-mono">
                      {tt.is_enabled ? "ACTIVE" : "PAUSED"}
                    </Badge>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono">Key: {tt.test_type}</span>
                </div>

                <Button
                  variant={tt.is_enabled ? "outline" : "default"}
                  size="sm"
                  onClick={() => handleToggleTestType(tt.test_type, tt.is_enabled, tt.label)}
                  disabled={isPending}
                  className="text-xs font-bold"
                >
                  {tt.is_enabled ? "Pause" : "Activate"}
                </Button>
              </Card>
            ))}

            {/* Future Capabilities - Coming Soon */}
            {["ADAPTIVE", "LIVE"].map((future) => (
              <Card key={future} className="p-4 bg-slate-50 border-slate-200 flex items-center justify-between opacity-60">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-extrabold text-slate-600 text-sm">{future === "ADAPTIVE" ? "Adaptive Testing" : "Live Exam Events"}</h3>
                    <Badge variant="neutral" className="text-[9px] font-mono">
                      Coming Soon
                    </Badge>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono">Future Architectural Feature</span>
                </div>
                <Button variant="outline" size="sm" disabled className="text-xs font-bold opacity-50">
                  Locked
                </Button>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 5: GENERATOR POLICY */}
      {/* ==================================================================== */}
      {activeTab === "policy" && (
        <div className="space-y-6 max-w-3xl">
          <Card className="p-6 bg-white border-slate-200 space-y-5">
            <div>
              <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <Sliders className="w-5 h-5 text-indigo-600" />
                Dynamic Generator Policy &amp; Guardrails
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Set authoritative bounds for dynamic test assembly, question pool multipliers, and TTL cleanup.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Dynamic Test TTL (Hours: 1–720)
                </label>
                <input
                  type="number"
                  min={1}
                  max={720}
                  value={policyForm.dynamic_test_ttl_hours}
                  onChange={(e) => setPolicyForm({ ...policyForm, dynamic_test_ttl_hours: parseInt(e.target.value, 10) || 48 })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold bg-white"
                />
                <span className="text-[10px] text-slate-400">Hours before unattempted dynamic mock expires</span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Minimum Pool Multiplier (1–20x)
                </label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={policyForm.min_pool_multiplier}
                  onChange={(e) => setPolicyForm({ ...policyForm, min_pool_multiplier: parseInt(e.target.value, 10) || 3 })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold bg-white"
                />
                <span className="text-[10px] text-slate-400">Required available question pool size multiplier</span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Max Weak Area Ratio (0–100%)
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={Math.round(policyForm.max_weak_area_ratio * 100)}
                  onChange={(e) => setPolicyForm({ ...policyForm, max_weak_area_ratio: (parseInt(e.target.value, 10) || 70) / 100 })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold bg-white"
                />
                <span className="text-[10px] text-slate-400">Maximum percentage of questions sourced from weak areas</span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Max Active Dynamic Tests / User (1–50)
                </label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={policyForm.max_active_dynamic_tests_per_user}
                  onChange={(e) => setPolicyForm({ ...policyForm, max_active_dynamic_tests_per_user: parseInt(e.target.value, 10) || 5 })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold bg-white"
                />
                <span className="text-[10px] text-slate-400">Concurrency limit on un-submitted dynamic tests</span>
              </div>
            </div>

            <div className="space-y-2 pt-3 border-t border-slate-100">
              <label className="block text-xs font-bold text-slate-700">
                Audit Reason for Policy Changes
              </label>
              <input
                type="text"
                value={policyReason}
                onChange={(e) => setPolicyReason(e.target.value)}
                placeholder="e.g. Increased pool multiplier for strict duplicate protection"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium bg-white"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="default"
                size="sm"
                onClick={handleSavePolicy}
                disabled={isPending || !policyReason.trim()}
                className="font-bold bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                Save Generator Policy
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 6: CANDIDATE ACCESS MANAGEMENT */}
      {/* ==================================================================== */}
      {activeTab === "candidates" && (
        <div className="space-y-6 max-w-4xl">
          {/* Candidate Search Bar */}
          <Card className="p-4 bg-white border-slate-200">
            <form onSubmit={handleSearchCandidate} className="flex gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={candidateQuery}
                  onChange={(e) => setCandidateQuery(e.target.value)}
                  placeholder="Search candidate by email or User ID..."
                  className="w-full pl-9 pr-3 py-2 text-xs font-medium rounded-xl border border-slate-200 bg-slate-50 focus:outline-hidden focus:border-indigo-500"
                />
              </div>
              <Button type="submit" variant="default" size="sm" isLoading={candidateLoading} className="font-bold bg-slate-900 text-white">
                Lookup Candidate
              </Button>
            </form>
          </Card>

          {candidateError && <Alert variant="error">{candidateError}</Alert>}

          {/* Candidate Detail Card */}
          {candidateData && (
            <Card className="p-6 bg-white border-slate-200 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-slate-100">
                <div>
                  <h2 className="text-base font-extrabold text-slate-900">{candidateData.user.fullName || "Candidate"}</h2>
                  <span className="text-xs text-slate-500 font-mono">{candidateData.user.email}</span>
                  <span className="text-[10px] text-slate-400 block font-mono">ID: {candidateData.user.id}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="indigo" className="text-xs font-mono">
                    {candidateData.totalAttemptsCount} Test Attempts
                  </Badge>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => setShowGrantModal(true)}
                    className="font-bold bg-indigo-600 hover:bg-indigo-700 text-white text-xs"
                  >
                    Grant Promotional Pass
                  </Button>
                </div>
              </div>

              {/* Active & Historical Entitlements */}
              <div className="space-y-3">
                <h3 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider font-mono">
                  Entitlements &amp; Subscription Passes
                </h3>
                {candidateData.entitlements.length === 0 ? (
                  <p className="text-xs text-slate-400 py-3 text-center">No active or historical entitlements found for this candidate.</p>
                ) : (
                  <div className="space-y-2">
                    {candidateData.entitlements.map((ent) => (
                      <div key={ent.id} className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-xs text-slate-900 font-mono">{ent.entitlementType}</span>
                            <Badge variant={ent.isActive ? "success" : "neutral"} className="text-[9px]">
                              {ent.isActive ? "ACTIVE" : "EXPIRED"}
                            </Badge>
                            {ent.planName && <Badge variant="outline" className="text-[9px]">{ent.planName}</Badge>}
                          </div>
                          <span className="text-[10px] text-slate-500 block mt-1">
                            Starts: {new Date(ent.startsAt).toLocaleDateString()} | Expires: {ent.expiresAt ? new Date(ent.expiresAt).toLocaleDateString() : "Never"}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setEditQuotaEntitlementId(ent.id);
                              setQuotaEdits(ent.customLimits as Record<string, number>);
                            }}
                            className="text-[11px] font-bold"
                          >
                            Edit Quotas
                          </Button>
                          {ent.isActive && (
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleRevokeEntitlement(ent.id)}
                              className="text-[11px] font-bold"
                            >
                              Revoke
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Live Quota Breakdown */}
              <div className="space-y-3 pt-3 border-t border-slate-100">
                <h3 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider font-mono">
                  Real-time Quota Breakdown (All 8 Categories)
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {candidateData.quotaSummary.map((q) => (
                    <div key={q.quotaKey} className="p-3 rounded-xl border border-slate-200 bg-white">
                      <span className="text-[10px] font-bold text-slate-500 uppercase font-mono block truncate">{q.label}</span>
                      <div className="mt-1 flex items-baseline justify-between">
                        <span className="text-sm font-black text-slate-900">
                          {q.isUnlimited ? "Unlimited" : `${q.quotaUsed} / ${q.quotaLimit}`}
                        </span>
                        <span className="text-[9px] text-slate-400 font-medium">
                          {q.isUnlimited ? "∞" : `${q.quotaRemaining} left`}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          )}

          {/* Grant Modal */}
          {showGrantModal && candidateData && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
              <Card className="max-w-md w-full p-6 bg-white border-slate-200 space-y-4 shadow-xl">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-extrabold text-slate-900">Grant Promotional Pass</h3>
                  <button onClick={() => setShowGrantModal(false)} className="text-slate-400 hover:text-slate-600">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-xs text-slate-500">
                  Granting promotional pass to <strong className="text-slate-800">{candidateData.user.email}</strong>.
                </p>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Duration (Days)</label>
                    <input
                      type="number"
                      min={1}
                      value={grantDurationDays}
                      onChange={(e) => setGrantDurationDays(parseInt(e.target.value, 10) || 30)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Administrative Reason (Mandatory)</label>
                    <input
                      type="text"
                      value={grantReason}
                      onChange={(e) => setGrantReason(e.target.value)}
                      placeholder="e.g. VIP Student / Bug compensation pass"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" size="sm" onClick={() => setShowGrantModal(false)}>
                    Cancel
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={handleGrantPromotionalPass}
                    disabled={isPending || !grantReason.trim()}
                    className="font-bold bg-indigo-600 hover:bg-indigo-700 text-white"
                  >
                    Confirm Grant
                  </Button>
                </div>
              </Card>
            </div>
          )}

          {/* Edit Quotas Modal */}
          {editQuotaEntitlementId && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
              <Card className="max-w-md w-full p-6 bg-white border-slate-200 space-y-4 shadow-xl">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-extrabold text-slate-900">Edit Custom Quotas</h3>
                  <button onClick={() => setEditQuotaEntitlementId(null)} className="text-slate-400 hover:text-slate-600">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                  {["FULL_LENGTH", "PYQ", "SECTIONAL", "TOPIC", "CHALLENGE", "WEAK_AREA", "MISTAKE_REVISION", "PERSONALIZED"].map((key) => (
                    <div key={key} className="flex items-center justify-between gap-3">
                      <span className="text-xs font-bold text-slate-700 font-mono">{key}</span>
                      <input
                        type="number"
                        placeholder="Default"
                        value={quotaEdits[key] !== undefined ? quotaEdits[key] : ""}
                        onChange={(e) => {
                          const val = e.target.value === "" ? undefined : parseInt(e.target.value, 10);
                          const next = { ...quotaEdits };
                          if (val === undefined) delete next[key];
                          else next[key] = val;
                          setQuotaEdits(next);
                        }}
                        className="w-24 px-2 py-1 rounded-lg border border-slate-200 text-xs font-semibold text-right"
                      />
                    </div>
                  ))}
                </div>

                <div className="space-y-1.5 pt-2 border-t border-slate-100">
                  <label className="block text-xs font-bold text-slate-700">Audit Reason</label>
                  <input
                    type="text"
                    value={quotaReason}
                    onChange={(e) => setQuotaReason(e.target.value)}
                    placeholder="e.g. Quota boost for exam month"
                    className="w-full px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-medium"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" size="sm" onClick={() => setEditQuotaEntitlementId(null)}>
                    Cancel
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={handleSaveCustomLimits}
                    disabled={isPending || !quotaReason.trim()}
                    className="font-bold bg-indigo-600 hover:bg-indigo-700 text-white"
                  >
                    Save Quotas
                  </Button>
                </div>
              </Card>
            </div>
          )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 7: CURATED CONTENT & SERIES */}
      {/* ==================================================================== */}
      {activeTab === "curated" && (
        <div className="space-y-6">
          {/* Test Series Table */}
          <Card className="p-6 bg-white border-slate-200 space-y-4">
            <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <FileCheck2 className="w-5 h-5 text-indigo-600" />
              Premium Test Series Directory
            </h2>
            {testSeries.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6">No test series found.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {testSeries.map((s) => (
                  <div key={s.id} className="py-3 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-extrabold text-sm text-slate-900">{s.title}</h3>
                        <Badge variant={s.is_active ? "success" : "neutral"} className="text-[9px]">
                          {s.is_active ? "ACTIVE" : "INACTIVE"}
                        </Badge>
                        <Badge variant="outline" className="text-[9px] font-mono">{s.series_type}</Badge>
                      </div>
                      <span className="text-xs text-slate-500 font-medium">Exam: {s.exams?.title || "Platform-wide"}</span>
                    </div>

                    <Button
                      variant={s.is_active ? "outline" : "default"}
                      size="sm"
                      onClick={() => handleToggleSeries(s.id, s.is_active, s.title)}
                      disabled={isPending}
                      className="text-xs font-bold"
                    >
                      {s.is_active ? "Deactivate" : "Activate"}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Curated Mocks Table */}
          <Card className="p-6 bg-white border-slate-200 space-y-4">
            <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-indigo-600" />
              Curated Premium Mock Tests
            </h2>
            {curatedMocks.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6">No curated mocks found.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {curatedMocks.map((m) => {
                  const isFeatured = Boolean(m.generation_metadata?.is_featured);
                  return (
                    <div key={m.id} className="py-3 flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-extrabold text-sm text-slate-900">{m.title}</h3>
                          <Badge variant={m.lifecycle_status === "PUBLISHED" ? "success" : "neutral"} className="text-[9px]">
                            {m.lifecycle_status || "PUBLISHED"}
                          </Badge>
                          {isFeatured && <Badge variant="warning" className="text-[9px]">FEATURED</Badge>}
                        </div>
                        <span className="text-xs text-slate-500 font-medium">
                          Template: {m.mock_templates?.title || "Standard Mock"}
                        </span>
                      </div>

                      <Button
                        variant={isFeatured ? "outline" : "default"}
                        size="sm"
                        onClick={() => handleToggleMockFeatured(m.id, isFeatured, m.title)}
                        disabled={isPending}
                        className="text-xs font-bold"
                      >
                        {isFeatured ? "Unfeature" : "Feature Mock"}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 8: AUDIT EXPLORER */}
      {/* ==================================================================== */}
      {activeTab === "audit" && (
        <Card className="p-6 bg-white border-slate-200 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <History className="w-5 h-5 text-indigo-600" />
              Administrative Audit Explorer (Immutable Trail)
            </h2>
            <Badge variant="indigo" className="text-xs font-mono">
              {auditLogs.length} Events Logged
            </Badge>
          </div>

          {auditLogs.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-8">No audit logs recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 uppercase font-mono text-[10px]">
                    <th className="py-2.5 px-3">Timestamp</th>
                    <th className="py-2.5 px-3">Administrator</th>
                    <th className="py-2.5 px-3">Action Type</th>
                    <th className="py-2.5 px-3">Target Entity</th>
                    <th className="py-2.5 px-3">Reason</th>
                    <th className="py-2.5 px-3 text-right">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {auditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/60 transition">
                      <td className="py-2.5 px-3 text-slate-500 font-mono text-[11px] whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-slate-800">{log.actor_email}</td>
                      <td className="py-2.5 px-3">
                        <Badge variant="outline" className="text-[10px] font-mono">{log.action_type}</Badge>
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 font-mono">{log.target_entity}</td>
                      <td className="py-2.5 px-3 text-slate-600 max-w-xs truncate">{log.reason || "N/A"}</td>
                      <td className="py-2.5 px-3 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedAuditLog(log)}
                          className="text-[10px] py-0.5 px-2 font-bold"
                        >
                          <Eye className="w-3 h-3 mr-1" /> Inspect
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Audit Log Detail Dialog */}
          {selectedAuditLog && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
              <Card className="max-w-xl w-full p-6 bg-white border-slate-200 space-y-4 shadow-2xl">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-900">{selectedAuditLog.action_type}</h3>
                    <span className="text-[11px] text-slate-500 font-mono">
                      {new Date(selectedAuditLog.created_at).toLocaleString()} by {selectedAuditLog.actor_email}
                    </span>
                  </div>
                  <button onClick={() => setSelectedAuditLog(null)} className="text-slate-400 hover:text-slate-600">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div>
                  <span className="text-[11px] font-bold text-slate-700">Reason:</span>
                  <p className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-lg mt-1 border border-slate-100">
                    {selectedAuditLog.reason || "No operational reason provided."}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-[10px] font-bold text-slate-500 uppercase font-mono">Old State</span>
                    <pre className="text-[10px] bg-slate-900 text-slate-200 p-2.5 rounded-lg overflow-x-auto max-h-40 mt-1">
                      {JSON.stringify(selectedAuditLog.old_value, null, 2) || "null"}
                    </pre>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-500 uppercase font-mono">New State</span>
                    <pre className="text-[10px] bg-slate-900 text-slate-200 p-2.5 rounded-lg overflow-x-auto max-h-40 mt-1">
                      {JSON.stringify(selectedAuditLog.new_value, null, 2) || "null"}
                    </pre>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <Button variant="default" size="sm" onClick={() => setSelectedAuditLog(null)} className="font-bold">
                    Close
                  </Button>
                </div>
              </Card>
            </div>
          )}
        </Card>
      )}

      {/* Confirmation Modal */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <Card className="max-w-md w-full p-6 bg-white border-slate-200 space-y-4 shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-2.5 text-amber-600">
              <AlertTriangle className="w-5 h-5" />
              <h3 className="text-base font-extrabold text-slate-900">{confirmModal.title}</h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">{confirmModal.description}</p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setConfirmModal(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={confirmModal.onConfirm}
                className="font-bold text-white shadow-xs"
              >
                Confirm Action
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
