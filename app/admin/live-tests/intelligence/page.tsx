"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  MacroCompetitionIntelligenceOverview,
  CrossEventComparisonResult,
} from "@/types/admin-competition-intelligence";
import {
  getMacroCompetitionOverviewAction,
  getCrossEventComparisonAction,
} from "./actions";

export default function AdminMacroCompetitionIntelligencePage() {
  const [overview, setOverview] = useState<MacroCompetitionIntelligenceOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Comparison State
  const [cmpEvent1, setCmpEvent1] = useState<string>("");
  const [cmpEvent2, setCmpEvent2] = useState<string>("");
  const [comparing, setComparing] = useState(false);
  const [comparisonResult, setComparisonResult] = useState<CrossEventComparisonResult | null>(null);
  const [cmpError, setCmpError] = useState<string | null>(null);

  useEffect(() => {
    loadOverview();
  }, []);

  async function loadOverview() {
    setLoading(true);
    setError(null);
    const res = await getMacroCompetitionOverviewAction();
    if (res.success && res.data) {
      setOverview(res.data);
      if (res.data.recentEvents.length >= 2) {
        setCmpEvent1(res.data.recentEvents[0].id);
        setCmpEvent2(res.data.recentEvents[1].id);
      }
    } else {
      setError(res.error || "Failed to load competition intelligence.");
    }
    setLoading(false);
  }

  async function handleCompare() {
    if (!cmpEvent1 || !cmpEvent2 || cmpEvent1 === cmpEvent2) {
      setCmpError("Please select two distinct events to compare.");
      return;
    }
    setComparing(true);
    setCmpError(null);
    const res = await getCrossEventComparisonAction(cmpEvent1, cmpEvent2);
    if (res.success && res.data) {
      setComparisonResult(res.data);
    } else {
      setCmpError(res.error || "Failed to compare events.");
    }
    setComparing(false);
  }

  if (loading) {
    return (
      <div className="p-8 space-y-6 max-w-7xl mx-auto animate-pulse">
        <div className="h-8 bg-slate-800 rounded w-1/3"></div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="h-28 bg-slate-800 rounded"></div>
          <div className="h-28 bg-slate-800 rounded"></div>
          <div className="h-28 bg-slate-800 rounded"></div>
          <div className="h-28 bg-slate-800 rounded"></div>
        </div>
        <div className="h-96 bg-slate-800 rounded"></div>
      </div>
    );
  }

  if (error || !overview) {
    return (
      <div className="p-8 max-w-7xl mx-auto">
        <div className="bg-red-950/40 border border-red-800 text-red-300 p-6 rounded-xl flex items-center justify-between">
          <span>{error || "Unable to load intelligence data."}</span>
          <button
            onClick={loadOverview}
            className="px-4 py-2 bg-red-800 hover:bg-red-700 text-white rounded-lg text-sm font-medium"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-7xl mx-auto text-slate-100">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-indigo-950 text-indigo-400 border border-indigo-800">
              Phase 5E.5 Admin Intelligence
            </span>
            <span className="px-2.5 py-0.5 text-xs font-medium rounded-full bg-slate-800 text-slate-400">
              Policy v1.0.0
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold mt-1 tracking-tight text-white">
            Competition Intelligence & Cohort Analytics
          </h1>
          <p className="text-slate-400 text-sm mt-0.5">
            Platform-wide competition participation funnels, score distributions, and operational diagnostics.
          </p>
        </div>
        <button
          onClick={loadOverview}
          className="px-4 py-2 text-sm bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors flex items-center gap-2"
        >
          <span>↻</span> Refresh Live Metrics
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-5 rounded-xl bg-slate-900/80 border border-slate-800 shadow-sm">
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">Total Competitions</div>
          <div className="text-2xl md:text-3xl font-bold text-white mt-1">{overview.totalEvents}</div>
          <div className="text-xs text-slate-400 mt-1">{overview.recentEvents.length} Active in last 30 days</div>
        </div>

        <div className="p-5 rounded-xl bg-slate-900/80 border border-slate-800 shadow-sm">
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">Total Registrations</div>
          <div className="text-2xl md:text-3xl font-bold text-indigo-400 mt-1">
            {overview.totalRegistrations.toLocaleString()}
          </div>
          <div className="text-xs text-slate-400 mt-1">
            Turnout Rate: <span className="text-emerald-400 font-semibold">{overview.overallTurnoutRate}%</span>
          </div>
        </div>

        <div className="p-5 rounded-xl bg-slate-900/80 border border-slate-800 shadow-sm">
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">Completed Attempts</div>
          <div className="text-2xl md:text-3xl font-bold text-emerald-400 mt-1">
            {overview.totalSubmissions.toLocaleString()}
          </div>
          <div className="text-xs text-slate-400 mt-1">
            Completion Rate: <span className="text-indigo-400 font-semibold">{overview.overallCompletionRate}%</span>
          </div>
        </div>

        <div className="p-5 rounded-xl bg-slate-900/80 border border-slate-800 shadow-sm">
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">Rewards & Credentials</div>
          <div className="text-2xl md:text-3xl font-bold text-amber-400 mt-1">
            {overview.totalCoinsDisbursed.toLocaleString()} <span className="text-xs font-normal text-slate-400">CL Coins</span>
          </div>
          <div className="text-xs text-slate-400 mt-1">
            {overview.totalCertificatesIssued} Certs • {overview.totalAchievementsAwarded} Badges
          </div>
        </div>
      </div>

      {/* Anomalies Banner if any */}
      {overview.anomaliesSummary.totalAnomaliesTriggered > 0 && (
        <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-800/60 flex items-center justify-between text-amber-300 text-sm">
          <div className="flex items-center gap-3">
            <span className="text-lg">⚠️</span>
            <div>
              <span className="font-semibold">Operational Diagnostics:</span> {overview.anomaliesSummary.totalAnomaliesTriggered} event-level anomalies flagged by Policy V1.
            </div>
          </div>
          <span className="text-xs bg-amber-900/60 px-2.5 py-1 rounded-full border border-amber-700">
            {overview.anomaliesSummary.highDropoutEventsCount} High Dropout
          </span>
        </div>
      )}

      {/* Recent Events Intelligence Table */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="p-5 border-b border-slate-800 flex justify-between items-center">
          <div>
            <h2 className="text-lg font-semibold text-white">Live Competition Intelligence Roster</h2>
            <p className="text-xs text-slate-400">Select any event for deep-dive distribution and funnel intelligence.</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-800/60 text-xs uppercase text-slate-400 border-b border-slate-800">
              <tr>
                <th className="px-5 py-3">Event Title</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Registered</th>
                <th className="px-4 py-3">Turnout (Starts)</th>
                <th className="px-4 py-3">Submissions</th>
                <th className="px-4 py-3">Mean Score</th>
                <th className="px-4 py-3">Health / Anomalies</th>
                <th className="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {overview.recentEvents.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-8 text-center text-slate-500">
                    No live competition events found.
                  </td>
                </tr>
              ) : (
                overview.recentEvents.map((evt) => (
                  <tr key={evt.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-5 py-3.5 font-medium text-white">
                      <div>{evt.title}</div>
                      {evt.examTitle && <div className="text-xs text-indigo-400">{evt.examTitle}</div>}
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${
                          evt.isPublished
                            ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                            : evt.status === "EVALUATED"
                            ? "bg-purple-950 text-purple-300 border border-purple-800"
                            : "bg-slate-800 text-slate-300 border border-slate-700"
                        }`}
                      >
                        {evt.isPublished ? "PUBLISHED" : evt.status === "EVALUATED" ? "ADMIN PREVIEW" : evt.status}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">{evt.registeredCount}</td>
                    <td className="px-4 py-3.5 text-indigo-300 font-medium">{evt.startedCount}</td>
                    <td className="px-4 py-3.5 text-emerald-300 font-medium">{evt.submittedCount}</td>
                    <td className="px-4 py-3.5">
                      {evt.meanScore != null ? (
                        <span className="font-semibold text-white">{evt.meanScore}</span>
                      ) : (
                        <span className="text-slate-500 text-xs italic">N/A</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      {evt.anomalyCount > 0 ? (
                        <span className="px-2 py-0.5 text-xs rounded bg-amber-950 text-amber-400 border border-amber-800">
                          ⚠️ {evt.anomalyCount} Alert{evt.anomalyCount > 1 ? "s" : ""}
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 text-xs rounded bg-emerald-950 text-emerald-400 border border-emerald-800">
                          ✓ Normal
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <Link
                        href={`/admin/live-tests/${evt.id}/intelligence`}
                        className="px-3 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors"
                      >
                        Deep Dive →
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Cross-Event Comparison Section */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-6 shadow-sm space-y-5">
        <div>
          <h2 className="text-lg font-semibold text-white">Strict Cross-Event Comparison Engine</h2>
          <p className="text-xs text-slate-400">
            Compare two competitions under strict compatibility rules (identical exam family, total marks, and published snapshots).
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Baseline Event (E1)</label>
            <select
              value={cmpEvent1}
              onChange={(e) => setCmpEvent1(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">Select Event 1</option>
              {overview.recentEvents.map((evt) => (
                <option key={evt.id} value={evt.id}>
                  {evt.title} ({evt.status})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Comparison Event (E2)</label>
            <select
              value={cmpEvent2}
              onChange={(e) => setCmpEvent2(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">Select Event 2</option>
              {overview.recentEvents.map((evt) => (
                <option key={evt.id} value={evt.id}>
                  {evt.title} ({evt.status})
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={handleCompare}
            disabled={comparing || !cmpEvent1 || !cmpEvent2}
            className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-medium rounded-lg text-sm transition-colors"
          >
            {comparing ? "Evaluating Compatibility..." : "Run Comparison →"}
          </button>
        </div>

        {cmpError && (
          <div className="p-3 bg-red-950/40 border border-red-800 text-red-300 text-xs rounded-lg">
            {cmpError}
          </div>
        )}

        {comparisonResult && (
          <div className="mt-4 border-t border-slate-800 pt-4 space-y-4">
            {comparisonResult.compatibilityStatus === "COMPARISON_NOT_COMPARABLE" ? (
              <div className="p-4 bg-amber-950/40 border border-amber-800 text-amber-300 rounded-xl text-sm">
                <div className="font-semibold mb-1">❌ Incompatible Events for Direct Comparison</div>
                <div>{comparisonResult.reasonIfNotComparable}</div>
              </div>
            ) : (
              <div className="p-5 bg-slate-950/60 border border-slate-800 rounded-xl space-y-4">
                <div className="flex items-center justify-between">
                  <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800">
                    ✓ Valid Comparable Cohorts
                  </span>
                  <span className="text-xs text-slate-400">
                    Delta = Event 2 ({comparisonResult.event2.eventTitle}) vs. Event 1 ({comparisonResult.event1.eventTitle})
                  </span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                  <div className="p-3 bg-slate-900 rounded-lg border border-slate-800">
                    <div className="text-xs text-slate-400">Turnout Rate Delta</div>
                    <div
                      className={`text-lg font-bold mt-1 ${
                        (comparisonResult.deltas?.turnoutRateDelta || 0) >= 0 ? "text-emerald-400" : "text-red-400"
                      }`}
                    >
                      {(comparisonResult.deltas?.turnoutRateDelta || 0) > 0 ? "+" : ""}
                      {comparisonResult.deltas?.turnoutRateDelta}%
                    </div>
                  </div>

                  <div className="p-3 bg-slate-900 rounded-lg border border-slate-800">
                    <div className="text-xs text-slate-400">Completion Rate Delta</div>
                    <div
                      className={`text-lg font-bold mt-1 ${
                        (comparisonResult.deltas?.completionRateDelta || 0) >= 0 ? "text-emerald-400" : "text-red-400"
                      }`}
                    >
                      {(comparisonResult.deltas?.completionRateDelta || 0) > 0 ? "+" : ""}
                      {comparisonResult.deltas?.completionRateDelta}%
                    </div>
                  </div>

                  <div className="p-3 bg-slate-900 rounded-lg border border-slate-800">
                    <div className="text-xs text-slate-400">Mean Score Delta</div>
                    <div
                      className={`text-lg font-bold mt-1 ${
                        (comparisonResult.deltas?.meanScoreDelta || 0) >= 0 ? "text-emerald-400" : "text-amber-400"
                      }`}
                    >
                      {(comparisonResult.deltas?.meanScoreDelta || 0) > 0 ? "+" : ""}
                      {comparisonResult.deltas?.meanScoreDelta} Marks
                    </div>
                  </div>

                  <div className="p-3 bg-slate-900 rounded-lg border border-slate-800">
                    <div className="text-xs text-slate-400">Median Duration Delta</div>
                    <div className="text-lg font-bold text-indigo-400 mt-1">
                      {(comparisonResult.deltas?.durationMinutesDelta || 0) > 0 ? "+" : ""}
                      {comparisonResult.deltas?.durationMinutesDelta} mins
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
