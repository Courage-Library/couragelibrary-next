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
        <div className="h-8 bg-slate-200 rounded w-1/3"></div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="h-28 bg-slate-100 rounded-xl border border-slate-200"></div>
          <div className="h-28 bg-slate-100 rounded-xl border border-slate-200"></div>
          <div className="h-28 bg-slate-100 rounded-xl border border-slate-200"></div>
          <div className="h-28 bg-slate-100 rounded-xl border border-slate-200"></div>
        </div>
        <div className="h-96 bg-slate-100 rounded-xl border border-slate-200"></div>
      </div>
    );
  }

  if (error || !overview) {
    return (
      <div className="p-8 max-w-7xl mx-auto">
        <div className="bg-red-50 border border-red-200 text-red-700 p-6 rounded-xl flex items-center justify-between">
          <span>{error || "Unable to load intelligence data."}</span>
          <button
            onClick={loadOverview}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium shadow-xs"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-7xl mx-auto text-slate-900">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
              Phase 5E.5 Admin Intelligence
            </span>
            <span className="px-2.5 py-0.5 text-xs font-medium rounded-full bg-slate-100 text-slate-600 border border-slate-200">
              Policy v1.0.0
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold mt-1 tracking-tight text-slate-900">
            Competition Intelligence &amp; Cohort Analytics
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Platform-wide competition participation funnels, score distributions, and operational diagnostics.
          </p>
        </div>
        <button
          onClick={loadOverview}
          className="px-4 py-2 text-sm bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg shadow-xs transition-colors flex items-center gap-2 font-medium"
        >
          <span>↻</span> Refresh Live Metrics
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-5 rounded-xl bg-white border border-slate-200/80 shadow-xs">
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Competitions</div>
          <div className="text-2xl md:text-3xl font-bold text-slate-900 mt-1">{overview.totalEvents}</div>
          <div className="text-xs text-slate-500 mt-1">{overview.recentEvents.length} Active in last 30 days</div>
        </div>

        <div className="p-5 rounded-xl bg-white border border-slate-200/80 shadow-xs">
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Registrations</div>
          <div className="text-2xl md:text-3xl font-bold text-indigo-600 mt-1">
            {overview.totalRegistrations.toLocaleString()}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Turnout Rate: <span className="text-emerald-600 font-semibold">{overview.overallTurnoutRate}%</span>
          </div>
        </div>

        <div className="p-5 rounded-xl bg-white border border-slate-200/80 shadow-xs">
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Completed Attempts</div>
          <div className="text-2xl md:text-3xl font-bold text-emerald-600 mt-1">
            {overview.totalSubmissions.toLocaleString()}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Completion Rate: <span className="text-indigo-600 font-semibold">{overview.overallCompletionRate}%</span>
          </div>
        </div>

        <div className="p-5 rounded-xl bg-white border border-slate-200/80 shadow-xs">
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Rewards &amp; Credentials</div>
          <div className="text-2xl md:text-3xl font-bold text-amber-600 mt-1">
            {overview.totalCoinsDisbursed.toLocaleString()} <span className="text-xs font-normal text-slate-500">CL Coins</span>
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {overview.totalCertificatesIssued} Certs • {overview.totalAchievementsAwarded} Badges
          </div>
        </div>
      </div>

      {/* Anomalies Banner if any */}
      {overview.anomaliesSummary.totalAnomaliesTriggered > 0 && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-between text-amber-900 text-sm shadow-xs">
          <div className="flex items-center gap-3">
            <span className="text-lg">⚠️</span>
            <div>
              <span className="font-semibold">Operational Diagnostics:</span> {overview.anomaliesSummary.totalAnomaliesTriggered} event-level anomalies flagged by Policy V1.
            </div>
          </div>
          <span className="text-xs bg-amber-100 text-amber-800 px-2.5 py-1 rounded-full border border-amber-300 font-medium">
            {overview.anomaliesSummary.highDropoutEventsCount} High Dropout
          </span>
        </div>
      )}

      {/* Recent Events Intelligence Table */}
      <div className="bg-white border border-slate-200/80 rounded-xl overflow-hidden shadow-xs">
        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Live Competition Intelligence Roster</h2>
            <p className="text-xs text-slate-500">Select any event for deep-dive distribution and funnel intelligence.</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-700">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500 border-b border-slate-200">
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
            <tbody className="divide-y divide-slate-100">
              {overview.recentEvents.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-8 text-center text-slate-400">
                    No live competition events found.
                  </td>
                </tr>
              ) : (
                overview.recentEvents.map((evt) => (
                  <tr key={evt.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-5 py-3.5 font-medium text-slate-900">
                      <div>{evt.title}</div>
                      {evt.examTitle && <div className="text-xs text-indigo-600 font-normal">{evt.examTitle}</div>}
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${
                          evt.isPublished
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : evt.status === "EVALUATED"
                            ? "bg-purple-50 text-purple-700 border border-purple-200"
                            : "bg-slate-100 text-slate-700 border border-slate-200"
                        }`}
                      >
                        {evt.isPublished ? "PUBLISHED" : evt.status === "EVALUATED" ? "ADMIN PREVIEW" : evt.status}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-slate-700">{evt.registeredCount}</td>
                    <td className="px-4 py-3.5 text-indigo-600 font-semibold">{evt.startedCount}</td>
                    <td className="px-4 py-3.5 text-emerald-600 font-semibold">{evt.submittedCount}</td>
                    <td className="px-4 py-3.5">
                      {evt.meanScore != null ? (
                        <span className="font-semibold text-slate-900">{evt.meanScore}</span>
                      ) : (
                        <span className="text-slate-400 text-xs italic">N/A</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      {evt.anomalyCount > 0 ? (
                        <span className="px-2 py-0.5 text-xs rounded bg-amber-50 text-amber-700 border border-amber-200 font-medium">
                          ⚠️ {evt.anomalyCount} Alert{evt.anomalyCount > 1 ? "s" : ""}
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 text-xs rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium">
                          ✓ Normal
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <Link
                        href={`/admin/live-tests/${evt.id}/intelligence`}
                        className="px-3 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow-xs transition-colors"
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
      <div className="bg-white border border-slate-200/80 rounded-xl p-6 shadow-xs space-y-5">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Strict Cross-Event Comparison Engine</h2>
          <p className="text-xs text-slate-500">
            Compare two competitions under strict compatibility rules (identical exam family, total marks, and published snapshots).
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Baseline Event (E1)</label>
            <select
              value={cmpEvent1}
              onChange={(e) => setCmpEvent1(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 shadow-xs"
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
            <label className="block text-xs font-medium text-slate-700 mb-1">Comparison Event (E2)</label>
            <select
              value={cmpEvent2}
              onChange={(e) => setCmpEvent2(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 shadow-xs"
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
            className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-100 disabled:text-slate-400 text-white font-medium rounded-lg text-sm transition-colors shadow-xs"
          >
            {comparing ? "Evaluating Compatibility..." : "Run Comparison →"}
          </button>
        </div>

        {cmpError && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg">
            {cmpError}
          </div>
        )}

        {comparisonResult && (
          <div className="mt-4 border-t border-slate-100 pt-4 space-y-4">
            {comparisonResult.compatibilityStatus === "COMPARISON_NOT_COMPARABLE" ? (
              <div className="p-4 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl text-sm">
                <div className="font-semibold mb-1">❌ Incompatible Events for Direct Comparison</div>
                <div>{comparisonResult.reasonIfNotComparable}</div>
              </div>
            ) : (
              <div className="p-5 bg-slate-50 border border-slate-200 rounded-xl space-y-4">
                <div className="flex items-center justify-between">
                  <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                    ✓ Valid Comparable Cohorts
                  </span>
                  <span className="text-xs text-slate-500">
                    Delta = Event 2 ({comparisonResult.event2.eventTitle}) vs. Event 1 ({comparisonResult.event1.eventTitle})
                  </span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                  <div className="p-3 bg-white rounded-lg border border-slate-200 shadow-xs">
                    <div className="text-xs text-slate-500">Turnout Rate Delta</div>
                    <div
                      className={`text-lg font-bold mt-1 ${
                        (comparisonResult.deltas?.turnoutRateDelta || 0) >= 0 ? "text-emerald-600" : "text-red-600"
                      }`}
                    >
                      {(comparisonResult.deltas?.turnoutRateDelta || 0) > 0 ? "+" : ""}
                      {comparisonResult.deltas?.turnoutRateDelta}%
                    </div>
                  </div>

                  <div className="p-3 bg-white rounded-lg border border-slate-200 shadow-xs">
                    <div className="text-xs text-slate-500">Completion Rate Delta</div>
                    <div
                      className={`text-lg font-bold mt-1 ${
                        (comparisonResult.deltas?.completionRateDelta || 0) >= 0 ? "text-emerald-600" : "text-red-600"
                      }`}
                    >
                      {(comparisonResult.deltas?.completionRateDelta || 0) > 0 ? "+" : ""}
                      {comparisonResult.deltas?.completionRateDelta}%
                    </div>
                  </div>

                  <div className="p-3 bg-white rounded-lg border border-slate-200 shadow-xs">
                    <div className="text-xs text-slate-500">Mean Score Delta</div>
                    <div
                      className={`text-lg font-bold mt-1 ${
                        (comparisonResult.deltas?.meanScoreDelta || 0) >= 0 ? "text-emerald-600" : "text-amber-600"
                      }`}
                    >
                      {(comparisonResult.deltas?.meanScoreDelta || 0) > 0 ? "+" : ""}
                      {comparisonResult.deltas?.meanScoreDelta} Marks
                    </div>
                  </div>

                  <div className="p-3 bg-white rounded-lg border border-slate-200 shadow-xs">
                    <div className="text-xs text-slate-500">Median Duration Delta</div>
                    <div className="text-lg font-bold text-indigo-600 mt-1">
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
