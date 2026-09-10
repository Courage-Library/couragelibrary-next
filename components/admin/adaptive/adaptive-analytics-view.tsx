"use client";

import React, { useState, useEffect, useTransition } from "react";
import {
  AdaptiveAnalyticsFilters,
  AdaptiveItemAnalyticsFilters,
  AdaptiveOverviewKPIs,
  CandidateIntelligenceReport,
  CandidateAdaptiveDetail,
  ItemIntelligenceReport,
  ItemQualityFlag,
  CATIntelligenceReport,
  AbilityIntelligenceReport,
  StoppingIntelligenceReport,
  PersonalizationIntelligenceReport,
  AlgorithmComparisonReport,
  AdaptiveHealthReport,
  DataQualityDiagnostics,
  AttemptDiagnosticsReport,
} from "@/services/adaptive/adaptive-types";
import {
  getAdaptiveOverviewAction,
  getCandidateIntelligenceAction,
  getCandidateAdaptiveDetailAction,
  getItemIntelligenceAction,
  getCATIntelligenceAction,
  getAbilityIntelligenceAction,
  getStoppingIntelligenceAction,
  getPersonalizationIntelligenceAction,
  getAlgorithmComparisonAction,
  getAdaptiveHealthAction,
  getDataQualityDiagnosticsAction,
  getAttemptDiagnosticsAction,
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
  Filter,
  Flag,
  Gauge,
  HelpCircle,
  History,
  Info,
  Layers,
  Lock,
  RefreshCw,
  Scale,
  Search,
  Shield,
  ShieldAlert,
  Sliders,
  Sparkles,
  Target,
  TrendingUp,
  UserCheck,
  Users,
  XCircle,
  Zap,
} from "lucide-react";

type AnalyticsSubTab =
  | "overview"
  | "candidates"
  | "items"
  | "cat_ability"
  | "stopping_personalization"
  | "algorithms"
  | "health_diagnostics";

export function AdaptiveAnalyticsView({ userEmail }: { userEmail: string }) {
  const [subTab, setSubTab] = useState<AnalyticsSubTab>("overview");
  const [timeWindow, setTimeWindow] = useState<"today" | "7d" | "30d" | "90d" | "all">("all");
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Analytics Datasets
  const [overview, setOverview] = useState<AdaptiveOverviewKPIs | null>(null);
  const [candidates, setCandidates] = useState<CandidateIntelligenceReport | null>(null);
  const [items, setItems] = useState<ItemIntelligenceReport | null>(null);
  const [cat, setCat] = useState<CATIntelligenceReport | null>(null);
  const [ability, setAbility] = useState<AbilityIntelligenceReport | null>(null);
  const [stopping, setStopping] = useState<StoppingIntelligenceReport | null>(null);
  const [personalization, setPersonalization] = useState<PersonalizationIntelligenceReport | null>(null);
  const [algorithmComparison, setAlgorithmComparison] = useState<AlgorithmComparisonReport | null>(null);
  const [health, setHealth] = useState<AdaptiveHealthReport | null>(null);
  const [dataQuality, setDataQuality] = useState<DataQualityDiagnostics | null>(null);

  // Drilldown states
  const [selectedCandidate, setSelectedCandidate] = useState<CandidateAdaptiveDetail | null>(null);
  const [candidateDetailLoading, setCandidateDetailLoading] = useState(false);
  const [itemQualityFilter, setItemQualityFilter] = useState<ItemQualityFlag | "ALL">("ALL");
  const [itemSearch, setItemSearch] = useState("");
  const [attemptSearchId, setAttemptSearchId] = useState("");
  const [attemptDiagnostics, setAttemptDiagnostics] = useState<AttemptDiagnosticsReport | null>(null);
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false);

  // Fetch data on mount or time filter change
  const loadAnalytics = () => {
    startTransition(async () => {
      setErrorMessage(null);
      const filters: AdaptiveAnalyticsFilters = { dateRange: timeWindow };

      try {
        const [
          overviewRes,
          candidatesRes,
          itemsRes,
          catRes,
          abilityRes,
          stoppingRes,
          persRes,
          algoRes,
          healthRes,
          qualityRes,
        ] = await Promise.all([
          getAdaptiveOverviewAction(filters as Record<string, unknown>),
          getCandidateIntelligenceAction(filters as Record<string, unknown>),
          getItemIntelligenceAction({ dateRange: timeWindow, qualityFlag: itemQualityFilter, search: itemSearch } as Record<string, unknown>),
          getCATIntelligenceAction(filters as Record<string, unknown>),
          getAbilityIntelligenceAction(filters as Record<string, unknown>),
          getStoppingIntelligenceAction(filters as Record<string, unknown>),
          getPersonalizationIntelligenceAction(filters as Record<string, unknown>),
          getAlgorithmComparisonAction(filters as Record<string, unknown>),
          getAdaptiveHealthAction(filters as Record<string, unknown>),
          getDataQualityDiagnosticsAction(),
        ]);

        if (overviewRes.success && overviewRes.data) setOverview(overviewRes.data as AdaptiveOverviewKPIs);
        if (candidatesRes.success && candidatesRes.data) setCandidates(candidatesRes.data as CandidateIntelligenceReport);
        if (itemsRes.success && itemsRes.data) setItems(itemsRes.data as ItemIntelligenceReport);
        if (catRes.success && catRes.data) setCat(catRes.data as CATIntelligenceReport);
        if (abilityRes.success && abilityRes.data) setAbility(abilityRes.data as AbilityIntelligenceReport);
        if (stoppingRes.success && stoppingRes.data) setStopping(stoppingRes.data as StoppingIntelligenceReport);
        if (persRes.success && persRes.data) setPersonalization(persRes.data as PersonalizationIntelligenceReport);
        if (algoRes.success && algoRes.data) setAlgorithmComparison(algoRes.data as AlgorithmComparisonReport);
        if (healthRes.success && healthRes.data) setHealth(healthRes.data as AdaptiveHealthReport);
        if (qualityRes.success && qualityRes.data) setDataQuality(qualityRes.data as DataQualityDiagnostics);
      } catch (err: unknown) {
        setErrorMessage(err instanceof Error ? err.message : "Failed to load adaptive analytics.");
      }
    });
  };

  useEffect(() => {
    loadAnalytics();
  }, [timeWindow, itemQualityFilter]);

  const handleInspectCandidate = (userId: string) => {
    setCandidateDetailLoading(true);
    startTransition(async () => {
      const res = await getCandidateAdaptiveDetailAction(userId);
      setCandidateDetailLoading(false);
      if (res.success && res.data) {
        setSelectedCandidate(res.data as CandidateAdaptiveDetail);
      }
    });
  };

  const handleInspectAttempt = () => {
    if (!attemptSearchId.trim()) return;
    setDiagnosticsLoading(true);
    startTransition(async () => {
      const res = await getAttemptDiagnosticsAction(attemptSearchId.trim());
      setDiagnosticsLoading(false);
      if (res.success && res.data) {
        setAttemptDiagnostics(res.data as AttemptDiagnosticsReport);
      } else {
        setAttemptDiagnostics(null);
        setErrorMessage(res.error || "Attempt state not found for diagnostics.");
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Analytics Top Control Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-xl bg-slate-900 border border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-950 border border-emerald-800 flex items-center justify-center text-emerald-400">
            <BarChart3 className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              Adaptive Analytics &amp; Admin Intelligence
              <Badge variant="outline" className="text-[10px] bg-emerald-950 text-emerald-300 border-emerald-800 font-mono">
                Phase 4D.6
              </Badge>
            </h2>
            <p className="text-xs text-slate-400">
              Observational telemetry, psychometric distributions, item drift detection, and attempt explainability.
            </p>
          </div>
        </div>

        {/* Global Filters */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg p-0.5 text-xs">
            {(["today", "7d", "30d", "90d", "all"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTimeWindow(t)}
                className={`px-2.5 py-1 rounded-md capitalize font-medium transition ${
                  timeWindow === t ? "bg-blue-600 text-white font-semibold" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {t === "all" ? "All Time" : t}
              </button>
            ))}
          </div>

          <button
            onClick={loadAnalytics}
            disabled={isPending}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition flex items-center justify-center"
            title="Refresh Intelligence Data"
          >
            <RefreshCw className={`w-4 h-4 ${isPending ? "animate-spin text-blue-400" : ""}`} />
          </button>
        </div>
      </div>

      {errorMessage && (
        <div className="p-3 rounded-lg bg-rose-950/80 border border-rose-800 text-rose-300 text-xs font-medium flex items-center justify-between">
          <span>{errorMessage}</span>
          <button onClick={() => setErrorMessage(null)} className="text-slate-400 hover:text-white">✕</button>
        </div>
      )}

      {/* Sub Navigation */}
      <div className="flex items-center gap-1 border-b border-slate-800 pb-2 overflow-x-auto text-xs">
        <button
          onClick={() => setSubTab("overview")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition ${
            subTab === "overview" ? "bg-slate-800 text-blue-400 font-bold border border-slate-700" : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <Activity className="w-3.5 h-3.5" /> Executive Overview
        </button>
        <button
          onClick={() => setSubTab("candidates")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition ${
            subTab === "candidates" ? "bg-slate-800 text-blue-400 font-bold border border-slate-700" : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <Users className="w-3.5 h-3.5" /> Candidate Intelligence
        </button>
        <button
          onClick={() => setSubTab("items")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition ${
            subTab === "items" ? "bg-slate-800 text-blue-400 font-bold border border-slate-700" : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <Scale className="w-3.5 h-3.5" /> Item Calibration &amp; Drift
        </button>
        <button
          onClick={() => setSubTab("cat_ability")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition ${
            subTab === "cat_ability" ? "bg-slate-800 text-blue-400 font-bold border border-slate-700" : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <Target className="w-3.5 h-3.5" /> CAT &amp; Ability
        </button>
        <button
          onClick={() => setSubTab("stopping_personalization")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition ${
            subTab === "stopping_personalization" ? "bg-slate-800 text-blue-400 font-bold border border-slate-700" : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <Lock className="w-3.5 h-3.5" /> Stopping &amp; Personalization
        </button>
        <button
          onClick={() => setSubTab("algorithms")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition ${
            subTab === "algorithms" ? "bg-slate-800 text-blue-400 font-bold border border-slate-700" : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <Cpu className="w-3.5 h-3.5" /> Algorithm Comparison
        </button>
        <button
          onClick={() => setSubTab("health_diagnostics")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition ${
            subTab === "health_diagnostics" ? "bg-slate-800 text-blue-400 font-bold border border-slate-700" : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <ShieldAlert className="w-3.5 h-3.5" /> Health &amp; Attempt Diagnostics
        </button>
      </div>

      {/* SUB-TAB 1: EXECUTIVE OVERVIEW */}
      {subTab === "overview" && overview && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-[11px] font-semibold text-slate-400 block uppercase tracking-wider">Total Attempts</span>
              <span className="text-xl font-bold text-white mt-1 block">{overview.totalAttempts}</span>
              <span className="text-[10px] text-slate-500 mt-0.5 block">{overview.inProgressAttempts} in progress</span>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-[11px] font-semibold text-slate-400 block uppercase tracking-wider">Completion Rate</span>
              <span className="text-xl font-bold text-emerald-400 mt-1 block">{overview.completionRate}%</span>
              <span className="text-[10px] text-slate-500 mt-0.5 block">{overview.completedAttempts} completed</span>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-[11px] font-semibold text-slate-400 block uppercase tracking-wider">Avg Questions</span>
              <span className="text-xl font-bold text-blue-400 mt-1 block">{overview.avgQuestionsPerAttempt}</span>
              <span className="text-[10px] text-slate-500 mt-0.5 block">Median: {overview.medianQuestionsPerAttempt}</span>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-[11px] font-semibold text-slate-400 block uppercase tracking-wider">Avg Final θ</span>
              <span className="text-xl font-bold text-indigo-400 mt-1 block">{overview.avgFinalTheta}</span>
              <span className="text-[10px] text-slate-500 mt-0.5 block">[-3, +3] scale</span>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-[11px] font-semibold text-slate-400 block uppercase tracking-wider">Avg Final SE</span>
              <span className="text-xl font-bold text-amber-400 mt-1 block">{overview.avgFinalSE}</span>
              <span className="text-[10px] text-slate-500 mt-0.5 block">Median: {overview.medianFinalSE}</span>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-[11px] font-semibold text-slate-400 block uppercase tracking-wider">CAT Fallback Rate</span>
              <span className={`text-xl font-bold mt-1 block ${overview.fallbackRate > 20 ? "text-amber-400" : "text-emerald-400"}`}>
                {overview.fallbackRate}%
              </span>
              <span className="text-[10px] text-slate-500 mt-0.5 block">Cold start: {overview.coldStartRate}%</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Stopping Reasons Distribution */}
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
              <h3 className="text-xs font-bold text-white mb-3 flex items-center gap-2">
                <Lock className="w-3.5 h-3.5 text-blue-400" /> Terminal Stopping Distribution
              </h3>
              {Object.keys(overview.stoppingDistribution).length === 0 ? (
                <p className="text-xs text-slate-500 italic">No completed attempts recorded in this time window.</p>
              ) : (
                <div className="space-y-2">
                  {Object.entries(overview.stoppingDistribution).map(([reason, count]) => {
                    const pct = Math.round((count / (overview.completedAttempts || 1)) * 100);
                    return (
                      <div key={reason} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="font-mono text-slate-300">{reason}</span>
                          <span className="text-slate-400">{count} ({pct}%)</span>
                        </div>
                        <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                          <div className="bg-blue-500 h-full rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Selection Strategy Split */}
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
              <h3 className="text-xs font-bold text-white mb-3 flex items-center gap-2">
                <Sliders className="w-3.5 h-3.5 text-emerald-400" /> Item Selection Strategy Split
              </h3>
              {Object.keys(overview.selectionStrategyDistribution).length === 0 ? (
                <p className="text-xs text-slate-500 italic">No question selection decisions recorded.</p>
              ) : (
                <div className="space-y-2">
                  {Object.entries(overview.selectionStrategyDistribution).map(([strategy, count]) => {
                    return (
                      <div key={strategy} className="flex items-center justify-between p-2 rounded-lg bg-slate-950 border border-slate-800/80">
                        <span className="text-xs font-mono text-slate-300">{strategy}</span>
                        <Badge variant="outline" className="text-xs font-mono font-bold bg-slate-800 text-slate-200">
                          {count} decisions
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 2: CANDIDATE INTELLIGENCE */}
      {subTab === "candidates" && candidates && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-[11px] font-semibold text-slate-400 block uppercase">Total Candidates Tracked</span>
              <span className="text-xl font-bold text-white mt-1 block">{candidates.totalCandidates}</span>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-[11px] font-semibold text-slate-400 block uppercase">Active in Window</span>
              <span className="text-xl font-bold text-emerald-400 mt-1 block">{candidates.activeCandidates}</span>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-[11px] font-semibold text-slate-400 block uppercase">Avg Attempts / Candidate</span>
              <span className="text-xl font-bold text-blue-400 mt-1 block">{candidates.avgAttemptsPerCandidate}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Ability Distribution */}
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
              <h3 className="text-xs font-bold text-white mb-3">Overall Ability (θ) Distribution</h3>
              <div className="space-y-2">
                {candidates.thetaDistribution.map((b) => (
                  <div key={b.range} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-mono text-slate-300">{b.range}</span>
                      <span className="text-slate-400">{b.count} ({b.percentage}%)</span>
                    </div>
                    <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-indigo-500 h-full rounded-full" style={{ width: `${b.percentage}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* SE Distribution */}
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
              <h3 className="text-xs font-bold text-white mb-3">Standard Error (SE) Precision Profile</h3>
              <div className="space-y-2">
                {candidates.seDistribution.map((b) => (
                  <div key={b.range} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-mono text-slate-300">{b.range}</span>
                      <span className="text-slate-400">{b.count} ({b.percentage}%)</span>
                    </div>
                    <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${b.percentage}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Top Weakest Topics Hotspots */}
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
            <h3 className="text-xs font-bold text-white mb-3 flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" /> Candidate Weak Area Hotspots (Lowest Mastery)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {candidates.weakestTopics.map((t) => (
                <div key={t.topicId} className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-slate-300 truncate max-w-[180px]">{t.topicName}</span>
                    <Badge variant="destructive" className="text-[10px] font-mono bg-rose-950 text-rose-300 border-rose-800 font-bold">
                      {Math.round(t.averageMastery * 100)}% mastery
                    </Badge>
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1 block">Assessed across {t.candidateCount} candidates</span>
                </div>
              ))}
            </div>
          </div>

          {/* Candidates Summary Table */}
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
            <h3 className="text-xs font-bold text-white mb-3">Candidate Longitudinal Profiles</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-medium">
                    <th className="py-2 px-3">Candidate ID</th>
                    <th className="py-2 px-3">Attempts</th>
                    <th className="py-2 px-3">Ability (θ)</th>
                    <th className="py-2 px-3">Standard Error</th>
                    <th className="py-2 px-3">Completion %</th>
                    <th className="py-2 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {candidates.candidateSummaries.map((c) => (
                    <tr key={c.userId} className="hover:bg-slate-800/30">
                      <td className="py-2.5 px-3 font-mono text-slate-300">{c.userId.slice(0, 12)}...</td>
                      <td className="py-2.5 px-3 text-slate-300">{c.attemptsCount}</td>
                      <td className="py-2.5 px-3 font-mono font-bold text-blue-400">{c.currentTheta}</td>
                      <td className="py-2.5 px-3 font-mono text-slate-400">{c.standardError}</td>
                      <td className="py-2.5 px-3">
                        <span className={`font-semibold ${c.completionRate >= 80 ? "text-emerald-400" : "text-amber-400"}`}>
                          {c.completionRate}%
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          onClick={() => handleInspectCandidate(c.userId)}
                          className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition"
                        >
                          Inspect
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Candidate Detail Modal */}
          {selectedCandidate && (
            <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 max-w-2xl w-full max-h-[85vh] overflow-y-auto space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div>
                    <h3 className="text-sm font-bold text-white">Candidate Adaptive Longitudinal Profile</h3>
                    <p className="text-xs font-mono text-slate-400">{selectedCandidate.userId}</p>
                  </div>
                  <button onClick={() => setSelectedCandidate(null)} className="text-slate-400 hover:text-white">✕</button>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Overall Ability (θ)</span>
                    <span className="text-base font-bold text-blue-400">{selectedCandidate.overallTheta}</span>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Standard Error</span>
                    <span className="text-base font-bold text-amber-400">{selectedCandidate.standardError}</span>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Total Questions</span>
                    <span className="text-base font-bold text-white">{selectedCandidate.totalQuestionsAnswered}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-white">Topic Mastery Vector</h4>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {Object.entries(selectedCandidate.topicMasteries).map(([tid, data]) => (
                      <div key={tid} className="p-2 rounded bg-slate-950 border border-slate-800 flex justify-between">
                        <span className="font-mono text-slate-300 truncate max-w-[160px]">{tid}</span>
                        <span className="font-bold text-blue-400">{Math.round(data.mastery * 100)}%</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-white">Recent Attempt History</h4>
                  <div className="space-y-1.5 text-xs">
                    {selectedCandidate.attemptHistory.map((h) => (
                      <div key={h.attemptId} className="p-2 rounded bg-slate-950 border border-slate-800 flex items-center justify-between">
                        <div>
                          <span className="font-bold text-white block">{h.examTitle}</span>
                          <span className="text-[10px] text-slate-500">{new Date(h.startedAt).toLocaleDateString()} • {h.questionsCount} questions</span>
                        </div>
                        <div className="text-right font-mono">
                          <span className="text-blue-400 font-bold block">θ: {h.finalTheta} (SE: {h.finalSE})</span>
                          <span className="text-[10px] text-slate-400">{h.stoppingReason || h.status}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB 3: ITEM INTELLIGENCE & QUALITY FLAGS */}
      {subTab === "items" && items && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-[10px] font-semibold text-slate-400 block uppercase">Total Bank</span>
              <span className="text-lg font-bold text-white">{items.totalItems}</span>
            </div>
            <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-[10px] font-semibold text-slate-400 block uppercase">Calibrated</span>
              <span className="text-lg font-bold text-emerald-400">{items.calibratedItems}</span>
            </div>
            <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-[10px] font-semibold text-slate-400 block uppercase">Provisional</span>
              <span className="text-lg font-bold text-blue-400">{items.provisionalItems}</span>
            </div>
            <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-[10px] font-semibold text-slate-400 block uppercase">Uncalibrated</span>
              <span className="text-lg font-bold text-slate-400">{items.uncalibratedItems}</span>
            </div>
            <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-[10px] font-semibold text-slate-400 block uppercase">Flagged</span>
              <span className="text-lg font-bold text-rose-400">{items.flaggedItems}</span>
            </div>
            <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-[10px] font-semibold text-slate-400 block uppercase">Deprecated</span>
              <span className="text-lg font-bold text-slate-500">{items.deprecatedItems}</span>
            </div>
            <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-[10px] font-semibold text-slate-400 block uppercase">Quality Alerts</span>
              <span className="text-lg font-bold text-amber-400">{items.itemsWithAlertsCount}</span>
            </div>
          </div>

          {/* Quality Filter Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg bg-slate-900 border border-slate-800">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-semibold">Filter Flag:</span>
              <select
                value={itemQualityFilter}
                onChange={(e) => setItemQualityFilter(e.target.value as ItemQualityFlag | "ALL")}
                className="bg-slate-950 border border-slate-800 rounded-md px-2.5 py-1 text-xs text-white"
              >
                <option value="ALL">All Items</option>
                <option value="LOW_SAMPLE">Low Sample (&lt; 10)</option>
                <option value="HIGH_EXPOSURE">High Exposure (&gt; 50)</option>
                <option value="UNSTABLE_RESPONSE_RATE">Unstable Response Rate</option>
                <option value="CALIBRATION_DRIFT">Calibration Drift</option>
                <option value="FLAGGED">Flagged Items</option>
                <option value="DEPRECATED">Deprecated Items</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={itemSearch}
                onChange={(e) => setItemSearch(e.target.value)}
                placeholder="Search question text or ID..."
                className="bg-slate-950 border border-slate-800 rounded-md px-2.5 py-1 text-xs text-white w-56"
              />
              <button
                onClick={loadAnalytics}
                className="px-3 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold"
              >
                Search
              </button>
            </div>
          </div>

          {/* Items Table */}
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-medium">
                  <th className="py-2 px-3">Item Snippet</th>
                  <th className="py-2 px-3">Static Tier</th>
                  <th className="py-2 px-3">Calibrated b</th>
                  <th className="py-2 px-3">Empirical p</th>
                  <th className="py-2 px-3">Sample (N)</th>
                  <th className="py-2 px-3">Reliability</th>
                  <th className="py-2 px-3">Status</th>
                  <th className="py-2 px-3">Quality Flags</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {items.items.map((row) => (
                  <tr key={row.questionId} className="hover:bg-slate-800/30">
                    <td className="py-2.5 px-3 max-w-[240px]">
                      <span className="font-mono text-[10px] text-slate-500 block">{row.questionId.slice(0, 8)}...</span>
                      <span className="text-slate-300 truncate block">{row.questionTextSnippet || "No snippet available"}</span>
                    </td>
                    <td className="py-2.5 px-3 font-mono capitalize">{row.staticTier}</td>
                    <td className="py-2.5 px-3 font-mono font-bold text-blue-400">{row.calibratedB}</td>
                    <td className="py-2.5 px-3 font-mono">{row.empiricalPValue}</td>
                    <td className="py-2.5 px-3 font-mono">{row.sampleSize}</td>
                    <td className="py-2.5 px-3 font-mono text-emerald-400">{row.reliabilityScore}</td>
                    <td className="py-2.5 px-3">
                      <Badge variant="outline" className="text-[10px] font-mono capitalize">
                        {row.calibrationStatus}
                      </Badge>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex flex-wrap gap-1">
                        {row.qualityFlags.length === 0 ? (
                          <span className="text-[10px] text-emerald-500 font-semibold">OPTIMAL</span>
                        ) : (
                          row.qualityFlags.map((f) => (
                            <Badge
                              key={f}
                              variant="destructive"
                              className="text-[9px] font-mono px-1 py-0 bg-amber-950 text-amber-300 border-amber-800"
                            >
                              {f}
                            </Badge>
                          ))
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUB-TAB 4: CAT & ABILITY INTELLIGENCE */}
      {subTab === "cat_ability" && cat && ability && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* CAT Selection Breakdown */}
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
              <h3 className="text-xs font-bold text-white mb-3 flex items-center gap-2">
                <Sliders className="w-3.5 h-3.5 text-blue-400" /> Information Selection Breakdown
              </h3>
              <div className="space-y-2">
                {cat.strategyBreakdown.map((s) => (
                  <div key={s.strategy} className="p-2 rounded-lg bg-slate-950 border border-slate-800 flex justify-between text-xs">
                    <span className="font-mono text-slate-300">{s.strategy}</span>
                    <span className="font-mono font-bold text-blue-400">{s.count} ({s.percentage}%)</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 pt-3 border-t border-slate-800 flex justify-between text-xs">
                <span className="text-slate-400">Avg Fisher Information: <strong className="text-white">{cat.avgSelectedInformation}</strong></span>
                <span className="text-slate-400">Median Info: <strong className="text-white">{cat.medianSelectedInformation}</strong></span>
              </div>
            </div>

            {/* Ability Estimation Convergence */}
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
              <h3 className="text-xs font-bold text-white mb-3 flex items-center gap-2">
                <Target className="w-3.5 h-3.5 text-emerald-400" /> Ability Estimation Convergence
              </h3>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">Convergence Rate</span>
                  <span className="text-lg font-bold text-emerald-400">{ability.convergenceRate}%</span>
                </div>
                <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">Avg Step Δθ</span>
                  <span className="text-lg font-bold text-blue-400">{ability.avgStepDeltaTheta}</span>
                </div>
              </div>
              <div className="space-y-1.5 text-xs">
                {ability.thetaBuckets.map((b) => (
                  <div key={b.bucket} className="flex justify-between font-mono">
                    <span className="text-slate-400">{b.bucket}</span>
                    <span className="text-slate-300">{b.count} ({b.percentage}%)</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 5: STOPPING & PERSONALIZATION */}
      {subTab === "stopping_personalization" && stopping && personalization && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Stopping Rules */}
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
              <h3 className="text-xs font-bold text-white mb-3 flex items-center gap-2">
                <Lock className="w-3.5 h-3.5 text-blue-400" /> Stopping Rules Telemetry
              </h3>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">Early Stopping Rate</span>
                  <span className="text-lg font-bold text-emerald-400">{stopping.earlyStoppingRate}%</span>
                </div>
                <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">Target SE Met Rate</span>
                  <span className="text-lg font-bold text-blue-400">{stopping.targetSESatisfactionRate}%</span>
                </div>
              </div>
              <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Continuation Gates Encountered</h4>
              <div className="space-y-1.5 text-xs">
                {stopping.continuationGatesEncountered.map((g) => (
                  <div key={g.gate} className="p-2 rounded bg-slate-950 border border-slate-800 flex justify-between font-mono">
                    <span className="text-slate-300">{g.gate}</span>
                    <span className="text-amber-400 font-bold">{g.count} times</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Personalization */}
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
              <h3 className="text-xs font-bold text-white mb-3 flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-indigo-400" /> Bounded Personalization Signals
              </h3>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">Cold Start Rate</span>
                  <span className="text-lg font-bold text-slate-300">{personalization.coldStartRate}%</span>
                </div>
                <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">Avg Influence Score</span>
                  <span className="text-lg font-bold text-indigo-400">{personalization.avgPersonalizationInfluence}</span>
                </div>
              </div>
              <div className="space-y-2 text-xs">
                <div className="p-2 rounded bg-slate-950 border border-slate-800 flex justify-between">
                  <span className="text-slate-300">Weak Area Boosts Applied</span>
                  <span className="font-mono font-bold text-blue-400">{personalization.weakAreaBoostsApplied}</span>
                </div>
                <div className="p-2 rounded bg-slate-950 border border-slate-800 flex justify-between">
                  <span className="text-slate-300">Mistake Vault Reinforcements</span>
                  <span className="font-mono font-bold text-emerald-400">{personalization.mistakeReinforcementsApplied}</span>
                </div>
                <div className="p-2 rounded bg-slate-950 border border-slate-800 flex justify-between">
                  <span className="text-slate-300">Exploration Decisions</span>
                  <span className="font-mono font-bold text-amber-400">{personalization.explorationDecisionsCount}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 6: ALGORITHM COMPARISON */}
      {subTab === "algorithms" && algorithmComparison && (
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
          <h3 className="text-xs font-bold text-white flex items-center gap-2">
            <Cpu className="w-3.5 h-3.5 text-blue-400" /> Algorithm Version Performance Matrix
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-medium">
                  <th className="py-2 px-3">Algorithm Version</th>
                  <th className="py-2 px-3">Model Type</th>
                  <th className="py-2 px-3">Status</th>
                  <th className="py-2 px-3">Attempts</th>
                  <th className="py-2 px-3">Completion %</th>
                  <th className="py-2 px-3">Avg Questions</th>
                  <th className="py-2 px-3">Avg Final θ</th>
                  <th className="py-2 px-3">Avg Final SE</th>
                  <th className="py-2 px-3">Target SE %</th>
                  <th className="py-2 px-3">Fallback %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {algorithmComparison.algorithms.map((a) => (
                  <tr key={a.versionSlug} className="hover:bg-slate-800/30">
                    <td className="py-2.5 px-3 font-mono font-bold text-blue-400">{a.versionSlug}</td>
                    <td className="py-2.5 px-3 font-mono text-slate-400">{a.algorithmType}</td>
                    <td className="py-2.5 px-3">
                      <Badge variant="outline" className="text-[10px] font-mono capitalize">
                        {a.lifecycleStatus}
                      </Badge>
                    </td>
                    <td className="py-2.5 px-3 text-slate-300">{a.attemptCount}</td>
                    <td className="py-2.5 px-3 font-semibold text-emerald-400">{a.completionRate}%</td>
                    <td className="py-2.5 px-3">{a.avgQuestionsPerAttempt}</td>
                    <td className="py-2.5 px-3 font-mono">{a.avgFinalTheta}</td>
                    <td className="py-2.5 px-3 font-mono">{a.avgFinalSE}</td>
                    <td className="py-2.5 px-3 font-semibold text-blue-400">{a.targetSEAttainmentRate}%</td>
                    <td className="py-2.5 px-3">{a.catFallbackRate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUB-TAB 7: HEALTH & ATTEMPT DIAGNOSTICS */}
      {subTab === "health_diagnostics" && health && (
        <div className="space-y-6">
          {/* Health KPIs */}
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-white flex items-center gap-2">
                <Shield className="w-3.5 h-3.5 text-blue-400" /> System Health Status
              </h3>
              <Badge
                variant="outline"
                className={`font-mono text-xs font-bold ${
                  health.overallStatus === "GREEN"
                    ? "bg-emerald-950 text-emerald-300 border-emerald-800"
                    : health.overallStatus === "YELLOW"
                    ? "bg-amber-950 text-amber-300 border-amber-800"
                    : "bg-rose-950 text-rose-300 border-rose-800"
                }`}
              >
                STATUS: {health.overallStatus}
              </Badge>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {health.kpis.map((k) => (
                <div key={k.name} className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-300">{k.name}</span>
                    <Badge
                      variant="outline"
                      className={`text-[9px] font-mono ${
                        k.status === "GREEN" ? "text-emerald-400" : k.status === "YELLOW" ? "text-amber-400" : "text-rose-400"
                      }`}
                    >
                      {k.status}
                    </Badge>
                  </div>
                  <span className="text-lg font-bold text-white mt-1 block">
                    {k.value} {k.unit}
                  </span>
                  <span className="text-[10px] text-slate-500 mt-0.5 block">{k.description}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Data Quality */}
          {dataQuality && (
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-white flex items-center gap-2">
                  <Database className="w-3.5 h-3.5 text-emerald-400" /> Database &amp; Referential Integrity
                </h3>
                <span className="text-xs font-bold text-emerald-400">Score: {dataQuality.integrityScore}/100</span>
              </div>
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs space-y-1">
                {dataQuality.diagnosticsDetails.map((d, i) => (
                  <p key={i} className="text-slate-300 font-mono">• {d}</p>
                ))}
              </div>
            </div>
          )}

          {/* Attempt Diagnostics Inspector */}
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
            <h3 className="text-xs font-bold text-white flex items-center gap-2">
              <Search className="w-3.5 h-3.5 text-blue-400" /> Attempt Explainability &amp; Step Inspector
            </h3>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={attemptSearchId}
                onChange={(e) => setAttemptSearchId(e.target.value)}
                placeholder="Enter Attempt ID or State ID..."
                className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white w-80 font-mono"
              />
              <button
                onClick={handleInspectAttempt}
                disabled={diagnosticsLoading}
                className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition flex items-center gap-1.5"
              >
                {diagnosticsLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
                Inspect Attempt
              </button>
            </div>

            {attemptDiagnostics && (
              <div className="space-y-4 pt-3 border-t border-slate-800">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-2.5 rounded bg-slate-950 border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Attempt ID</span>
                    <span className="text-xs font-mono font-bold text-white truncate block">{attemptDiagnostics.attemptId}</span>
                  </div>
                  <div className="p-2.5 rounded bg-slate-950 border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Final Ability (θ) / SE</span>
                    <span className="text-xs font-mono font-bold text-blue-400">{attemptDiagnostics.finalTheta} (SE: {attemptDiagnostics.finalSE})</span>
                  </div>
                  <div className="p-2.5 rounded bg-slate-950 border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Status</span>
                    <Badge variant="outline" className="text-[10px] font-mono capitalize">{attemptDiagnostics.status}</Badge>
                  </div>
                  <div className="p-2.5 rounded bg-slate-950 border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Stopping Reason</span>
                    <span className="text-xs font-mono text-amber-400 truncate block">{attemptDiagnostics.stoppingReason || "N/A"}</span>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400 font-medium">
                        <th className="py-2 px-2">Step</th>
                        <th className="py-2 px-2">Question Snippet</th>
                        <th className="py-2 px-2">Strategy</th>
                        <th className="py-2 px-2">Item b / a</th>
                        <th className="py-2 px-2">Fisher Info</th>
                        <th className="py-2 px-2">θ (Before → After)</th>
                        <th className="py-2 px-2">SE (Before → After)</th>
                        <th className="py-2 px-2">Result</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      {attemptDiagnostics.steps.map((s) => (
                        <tr key={s.stepNumber} className="hover:bg-slate-800/30">
                          <td className="py-2 px-2 font-bold text-white">{s.stepNumber}</td>
                          <td className="py-2 px-2 max-w-[200px] truncate font-sans text-slate-300">{s.questionTextSnippet}</td>
                          <td className="py-2 px-2 text-[10px] text-slate-400">{s.selectionStrategy}</td>
                          <td className="py-2 px-2 text-blue-400">{s.itemDifficultyB} / {s.itemDiscriminationA}</td>
                          <td className="py-2 px-2 text-emerald-400">{s.itemInformation}</td>
                          <td className="py-2 px-2 text-slate-300">{s.thetaBefore} → <strong className="text-blue-400">{s.thetaAfter}</strong></td>
                          <td className="py-2 px-2 text-slate-300">{s.seBefore} → <strong className="text-amber-400">{s.seAfter}</strong></td>
                          <td className="py-2 px-2">
                            {s.isCorrect === true ? (
                              <span className="text-emerald-400 font-bold">CORRECT</span>
                            ) : s.isCorrect === false ? (
                              <span className="text-rose-400 font-bold">INCORRECT</span>
                            ) : (
                              <span className="text-slate-500">PENDING</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
