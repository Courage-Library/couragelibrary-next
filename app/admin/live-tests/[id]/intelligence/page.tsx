"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  EventCompetitionIntelligence,
  CandidateDrillDownItem,
} from "@/types/admin-competition-intelligence";
import {
  getEventCompetitionIntelligenceAction,
  getCandidateDrillDownAction,
} from "../../intelligence/actions";

export default function AdminEventCompetitionIntelligenceDeepDivePage() {
  const params = useParams();
  const eventId = params?.id as string;

  const [intel, setIntel] = useState<EventCompetitionIntelligence | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<
    "funnel" | "scores" | "sections" | "rewards" | "health" | "drilldown"
  >("funnel");

  // Candidate Drill-Down State
  const [drillDownList, setDrillDownList] = useState<CandidateDrillDownItem[]>([]);
  const [drillDownLoading, setDrillDownLoading] = useState(false);
  const [drillDownError, setDrillDownError] = useState<string | null>(null);

  useEffect(() => {
    if (eventId) {
      loadEventIntelligence();
    }
  }, [eventId]);

  async function loadEventIntelligence() {
    setLoading(true);
    setError(null);
    const res = await getEventCompetitionIntelligenceAction(eventId);
    if (res.success && res.data) {
      setIntel(res.data);
    } else {
      setError(res.error || "Failed to load event intelligence.");
    }
    setLoading(false);
  }

  async function loadDrillDown() {
    setDrillDownLoading(true);
    setDrillDownError(null);
    const res = await getCandidateDrillDownAction(eventId);
    if (res.success && res.data) {
      setDrillDownList(res.data);
    } else {
      setDrillDownError(res.error || "Failed to load candidate drill-down (insufficient role).");
    }
    setDrillDownLoading(false);
  }

  function handleTabChange(tab: typeof activeTab) {
    setActiveTab(tab);
    if (tab === "drilldown" && drillDownList.length === 0) {
      loadDrillDown();
    }
  }

  if (loading) {
    return (
      <div className="p-8 space-y-6 max-w-7xl mx-auto animate-pulse">
        <div className="h-8 bg-slate-800 rounded w-1/3"></div>
        <div className="h-20 bg-slate-800 rounded"></div>
        <div className="h-96 bg-slate-800 rounded"></div>
      </div>
    );
  }

  if (error || !intel) {
    return (
      <div className="p-8 max-w-7xl mx-auto">
        <div className="bg-red-950/40 border border-red-800 text-red-300 p-6 rounded-xl flex items-center justify-between">
          <span>{error || "Event intelligence data unavailable."}</span>
          <Link
            href="/admin/live-tests/intelligence"
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm font-medium"
          >
            ← Back to Intelligence Hub
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto text-slate-100">
      {/* Navigation & Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Link
              href="/admin/live-tests/intelligence"
              className="text-xs text-indigo-400 hover:underline font-medium"
            >
              ← Intelligence Hub
            </Link>
            <span className="text-slate-600">•</span>
            <span className="text-xs text-slate-400">{intel.examTitle || "Live Competition"}</span>
          </div>
          <div className="flex items-center gap-3 mt-1">
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white">{intel.eventTitle}</h1>
            <span
              className={`px-2.5 py-0.5 rounded text-xs font-semibold ${
                intel.isPublished
                  ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                  : intel.status === "EVALUATED"
                  ? "bg-purple-950 text-purple-300 border border-purple-800"
                  : "bg-slate-800 text-slate-300 border border-slate-700"
              }`}
            >
              {intel.isPublished ? "PUBLISHED" : intel.status === "EVALUATED" ? "ADMIN PREVIEW" : intel.status}
            </span>
          </div>
        </div>

        <button
          onClick={loadEventIntelligence}
          className="px-4 py-2 text-sm bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors flex items-center gap-2"
        >
          <span>↻</span> Refresh Telemetry
        </button>
      </div>

      {/* Primary KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
          <div className="text-xs text-slate-400">Total Registered</div>
          <div className="text-xl font-bold text-white mt-0.5">{intel.funnel.registeredCount}</div>
          <div className="text-xs text-slate-500">Turnout: {intel.funnel.turnoutRate}%</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
          <div className="text-xs text-slate-400">Attempts Started</div>
          <div className="text-xl font-bold text-indigo-400 mt-0.5">{intel.funnel.startedCount}</div>
          <div className="text-xs text-slate-500">Completion: {intel.funnel.completionRate}%</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
          <div className="text-xs text-slate-400">Evaluated & Ranked</div>
          <div className="text-xl font-bold text-emerald-400 mt-0.5">{intel.funnel.rankedCount}</div>
          <div className="text-xs text-slate-500">
            {intel.rankingPercentile.privacySuppressed ? "Cohort < 5" : `Ties: ${intel.rankingPercentile.tiedRankFrequency}%`}
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
          <div className="text-xs text-slate-400">Mean / Median Score</div>
          <div className="text-xl font-bold text-amber-400 mt-0.5">
            {intel.scoreDistribution.meanScore != null ? `${intel.scoreDistribution.meanScore} / ${intel.scoreDistribution.medianScore}` : "Suppressed"}
          </div>
          <div className="text-xs text-slate-500">Max Marks: {intel.totalMarks}</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
          <div className="text-xs text-slate-400">Median Duration</div>
          <div className="text-xl font-bold text-sky-400 mt-0.5">{intel.timing.medianDurationMinutes} mins</div>
          <div className="text-xs text-slate-500">Utilization: {intel.timing.timeUtilizationRate}%</div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex border-b border-slate-800 gap-2 overflow-x-auto text-sm">
        <button
          onClick={() => handleTabChange("funnel")}
          className={`px-4 py-2.5 font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === "funnel"
              ? "border-indigo-500 text-indigo-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          1. Participation Funnel
        </button>

        <button
          onClick={() => handleTabChange("scores")}
          className={`px-4 py-2.5 font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === "scores"
              ? "border-indigo-500 text-indigo-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          2. Score & Rank Distributions
        </button>

        <button
          onClick={() => handleTabChange("sections")}
          className={`px-4 py-2.5 font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === "sections"
              ? "border-indigo-500 text-indigo-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          3. Section & Topic Diagnostics
        </button>

        <button
          onClick={() => handleTabChange("rewards")}
          className={`px-4 py-2.5 font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === "rewards"
              ? "border-indigo-500 text-indigo-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          4. Rewards & Credentials
        </button>

        <button
          onClick={() => handleTabChange("health")}
          className={`px-4 py-2.5 font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === "health"
              ? "border-indigo-500 text-indigo-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          5. Health & Diagnostics ({intel.operationalHealth.anomalies.filter((a) => a.triggered).length})
        </button>

        <button
          onClick={() => handleTabChange("drilldown")}
          className={`px-4 py-2.5 font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === "drilldown"
              ? "border-indigo-500 text-indigo-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          6. Candidate Drill-Down
        </button>
      </div>

      {/* TAB 1: FUNNEL */}
      {activeTab === "funnel" && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-6 space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-white">7-Stage Competition Participation Funnel</h2>
            <p className="text-xs text-slate-400">
              Deterministic stage-by-stage candidate progression and attendance dynamics.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-6 gap-3 text-center">
            <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl">
              <div className="text-xs text-slate-400 font-medium">1. Registered</div>
              <div className="text-2xl font-bold text-white mt-1">{intel.funnel.registeredCount}</div>
              <div className="text-xs text-indigo-400 mt-1">100% Base</div>
            </div>

            <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl">
              <div className="text-xs text-slate-400 font-medium">2. Started</div>
              <div className="text-2xl font-bold text-indigo-400 mt-1">{intel.funnel.startedCount}</div>
              <div className="text-xs text-emerald-400 mt-1">{intel.funnel.turnoutRate}% Turnout</div>
            </div>

            <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl">
              <div className="text-xs text-slate-400 font-medium">3. Submitted</div>
              <div className="text-2xl font-bold text-emerald-400 mt-1">{intel.funnel.submittedCount}</div>
              <div className="text-xs text-emerald-400 mt-1">{intel.funnel.completionRate}% of Started</div>
            </div>

            <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl">
              <div className="text-xs text-slate-400 font-medium">4. Evaluated</div>
              <div className="text-2xl font-bold text-purple-400 mt-1">{intel.funnel.evaluatedCount}</div>
              <div className="text-xs text-slate-400 mt-1">Active Snapshot</div>
            </div>

            <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl">
              <div className="text-xs text-slate-400 font-medium">5. Ranked</div>
              <div className="text-2xl font-bold text-amber-400 mt-1">{intel.funnel.rankedCount}</div>
              <div className="text-xs text-slate-400 mt-1">National Roster</div>
            </div>

            <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl">
              <div className="text-xs text-slate-400 font-medium">6. Published</div>
              <div className="text-2xl font-bold text-teal-400 mt-1">{intel.funnel.publishedCount}</div>
              <div className="text-xs text-teal-400 mt-1">{intel.isPublished ? "100% Released" : "Pending Release"}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-slate-800 text-sm">
            <div className="p-4 bg-slate-950 rounded-lg border border-slate-800">
              <div className="text-xs text-slate-400">Dropout Rate</div>
              <div className="text-lg font-bold text-amber-400 mt-1">{intel.funnel.dropoutRate}%</div>
              <div className="text-xs text-slate-500 mt-1">Candidates who started but did not submit</div>
            </div>

            <div className="p-4 bg-slate-950 rounded-lg border border-slate-800">
              <div className="text-xs text-slate-400">Timer Expiry Rate</div>
              <div className="text-lg font-bold text-sky-400 mt-1">{intel.funnel.expiryRate}%</div>
              <div className="text-xs text-slate-500 mt-1">Auto-submitted on test deadline expiry</div>
            </div>

            <div className="p-4 bg-slate-950 rounded-lg border border-slate-800">
              <div className="text-xs text-slate-400">Early Exit Rate (&lt; 15 mins)</div>
              <div className="text-lg font-bold text-indigo-400 mt-1">{intel.funnel.earlyDropoutRate}%</div>
              <div className="text-xs text-slate-500 mt-1">{intel.timing.earlyExitCount} candidates submitted early</div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: SCORES & RANKS */}
      {activeTab === "scores" && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-6 space-y-6">
          {intel.scoreDistribution.privacySuppressed ? (
            <div className="p-6 bg-slate-950 border border-slate-800 rounded-xl text-center space-y-2">
              <span className="text-2xl">🔒</span>
              <h3 className="text-base font-semibold text-amber-400">Cohort Distribution Suppressed for Privacy</h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                In accordance with Policy V1, continuous distribution statistics are suppressed for cohorts smaller than 5 candidates to prevent individual score reverse-engineering.
              </p>
            </div>
          ) : (
            <>
              <div>
                <h2 className="text-lg font-semibold text-white">Score & Accuracy Distribution Statistics</h2>
                <p className="text-xs text-slate-400">
                  Descriptive statistics across all {intel.funnel.rankedCount} ranked candidates in active snapshot.
                </p>
              </div>

              {/* Statistics Grid */}
              <div className="grid grid-cols-2 md:grid-cols-6 gap-3 text-center">
                <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
                  <div className="text-xs text-slate-400">Mean Score</div>
                  <div className="text-xl font-bold text-white mt-1">{intel.scoreDistribution.meanScore}</div>
                </div>

                <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
                  <div className="text-xs text-slate-400">Median Score (P50)</div>
                  <div className="text-xl font-bold text-indigo-400 mt-1">{intel.scoreDistribution.medianScore}</div>
                </div>

                <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
                  <div className="text-xs text-slate-400">Std Deviation (σ)</div>
                  <div className="text-xl font-bold text-sky-400 mt-1">{intel.scoreDistribution.stdDev}</div>
                </div>

                <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
                  <div className="text-xs text-slate-400">IQR (Q3 - Q1)</div>
                  <div className="text-xl font-bold text-amber-400 mt-1">{intel.scoreDistribution.iqr}</div>
                </div>

                <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
                  <div className="text-xs text-slate-400">Min / Max Score</div>
                  <div className="text-xl font-bold text-emerald-400 mt-1">
                    {intel.scoreDistribution.minScore} / {intel.scoreDistribution.maxScore}
                  </div>
                </div>

                <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
                  <div className="text-xs text-slate-400">Skewness Index</div>
                  <div className="text-xl font-bold text-purple-400 mt-1">{intel.scoreDistribution.skewness}</div>
                </div>
              </div>

              {/* Score Bands Histogram Table */}
              <div>
                <h3 className="text-sm font-semibold text-slate-200 mb-3">10 Equidistant Score Bands</h3>
                <div className="space-y-2">
                  {intel.scoreDistribution.scoreBands.map((band, idx) => (
                    <div key={idx} className="flex items-center gap-3 text-xs">
                      <span className="w-24 text-slate-400 font-mono">{band.label} Marks</span>
                      <div className="flex-1 bg-slate-950 h-5 rounded overflow-hidden border border-slate-800 flex">
                        <div
                          className="bg-indigo-600 h-full rounded transition-all duration-500"
                          style={{ width: `${Math.max(1, band.percentage)}%` }}
                        ></div>
                      </div>
                      <span className="w-16 text-right font-medium text-white">{band.count} ({band.percentage}%)</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Deciles & Elite Thresholds */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-800">
                <div>
                  <h3 className="text-sm font-semibold text-slate-200 mb-3">Decile Score Cutoffs</h3>
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                      <tr>
                        <th className="p-2">Decile</th>
                        <th className="p-2">Mark Cutoff</th>
                        <th className="p-2 text-right">Candidates &ge; Cutoff</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {intel.rankingPercentile.deciles.map((d) => (
                        <tr key={d.percentile}>
                          <td className="p-2 font-medium text-indigo-400">{d.percentile}th Percentile</td>
                          <td className="p-2 font-bold text-white">{d.markCutoff} Marks</td>
                          <td className="p-2 text-right">{d.candidateCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-slate-200">Elite Performance Thresholds</h3>
                  <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-3 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">Top 1% Elite Cutoff (P99):</span>
                      <span className="font-bold text-amber-400 text-sm">{intel.rankingPercentile.eliteThresholds.top1PercentScore} Marks</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">Top 5% Cutoff (P95):</span>
                      <span className="font-bold text-emerald-400 text-sm">{intel.rankingPercentile.eliteThresholds.top5PercentScore} Marks</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">Top 10% Cutoff (P90):</span>
                      <span className="font-bold text-indigo-400 text-sm">{intel.rankingPercentile.eliteThresholds.top10PercentScore} Marks</span>
                    </div>
                  </div>

                  <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-1 text-xs">
                    <div className="text-slate-400 font-medium">Tied Ranks Analysis</div>
                    <div className="text-white">
                      <span className="font-bold text-sky-400">{intel.rankingPercentile.tiedRankCount}</span> candidates ({intel.rankingPercentile.tiedRankFrequency}%) share tied rankings.
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* TAB 3: SECTIONS & TOPICS */}
      {activeTab === "sections" && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-6 space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-white">Sectional & Topic Performance Diagnostics</h2>
            <p className="text-xs text-slate-400">
              Breakdown of question attempts and topic coverage across examination structure.
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-200 mb-3">Sections Structure</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {intel.sectionTopic.sections.length === 0 ? (
                <div className="text-xs text-slate-500 italic col-span-3">No sections defined for this test.</div>
              ) : (
                intel.sectionTopic.sections.map((sec) => (
                  <div key={sec.sectionId} className="p-4 bg-slate-950 rounded-xl border border-slate-800">
                    <div className="font-semibold text-white text-sm">{sec.sectionName}</div>
                    <div className="text-xs text-slate-400 mt-1">{sec.totalQuestions} Questions</div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-800">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-200">Topic Coverage Status</h3>
              <span
                className={`px-2.5 py-0.5 rounded text-xs font-medium ${
                  intel.sectionTopic.topicStatus === "TOPIC_DATA_AVAILABLE"
                    ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                    : "bg-amber-950 text-amber-400 border border-amber-800"
                }`}
              >
                {intel.sectionTopic.topicStatus} ({Math.round(intel.sectionTopic.mappedQuestionsRatio * 100)}% Mapped)
              </span>
            </div>

            {intel.sectionTopic.topicStatus === "TOPIC_DATA_INSUFFICIENT" ? (
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl text-xs text-amber-300">
                ⚠️ Less than 50% of questions in this competition are mapped to authoritative topic taxonomies. Topic-level aggregations are withheld to prevent misleading diagnostics.
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {intel.sectionTopic.topics.map((t) => (
                  <div key={t.topicId} className="p-3 bg-slate-950 rounded-lg border border-slate-800 text-xs">
                    <div className="font-medium text-white">{t.topicName}</div>
                    <div className="text-slate-400 mt-0.5">{t.totalQuestions} Questions</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: REWARDS & CREDENTIALS */}
      {activeTab === "rewards" && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-6 space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-white">Rewards, Certificates & Achievements</h2>
            <p className="text-xs text-slate-400">
              Downstream settlement telemetry from certified Phases 5E.1, 5E.2, and 5E.3.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Rewards Card */}
            <div className="p-5 bg-slate-950 rounded-xl border border-slate-800 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-xs font-semibold text-slate-400 uppercase">Phase 5E.1 Rewards</span>
                <span className="text-xs text-amber-400 font-medium">{intel.rewards.settlementStatus}</span>
              </div>
              <div className="text-2xl font-bold text-amber-400">{intel.rewards.totalCoinsDisbursed} <span className="text-xs text-slate-400">Coins</span></div>
              <div className="text-xs space-y-1 text-slate-400">
                <div>Podium Top Finisher Coins: <span className="text-white">{intel.rewards.podiumCoinsDisbursed}</span></div>
                <div>Participation Coins: <span className="text-white">{intel.rewards.participationCoinsDisbursed}</span></div>
                <div>Settled: <span className="text-emerald-400">{intel.rewards.settledCount}</span> • Pending: <span className="text-amber-400">{intel.rewards.pendingCount}</span></div>
              </div>
            </div>

            {/* Certificates Card */}
            <div className="p-5 bg-slate-950 rounded-xl border border-slate-800 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-xs font-semibold text-slate-400 uppercase">Phase 5E.2 Certificates</span>
                <span className="text-xs text-indigo-400 font-medium">{intel.certificates.totalCertificatesIssued} Issued</span>
              </div>
              <div className="text-2xl font-bold text-indigo-400">{intel.certificates.totalCertificatesIssued}</div>
              <div className="text-xs space-y-1 text-slate-400">
                <div>Merit: <span className="text-amber-400 font-medium">{intel.certificates.tierCounts.merit}</span></div>
                <div>Excellence: <span className="text-indigo-300 font-medium">{intel.certificates.tierCounts.excellence}</span></div>
                <div>Participation: <span className="text-slate-300">{intel.certificates.tierCounts.participation}</span></div>
                <div>Public Verification Scans: <span className="text-white">{intel.certificates.verificationScanCount}</span></div>
              </div>
            </div>

            {/* Achievements Card */}
            <div className="p-5 bg-slate-950 rounded-xl border border-slate-800 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-xs font-semibold text-slate-400 uppercase">Phase 5E.3 Achievements</span>
                <span className="text-xs text-emerald-400 font-medium">{intel.achievements.totalAchievementsAwarded} Badges</span>
              </div>
              <div className="text-2xl font-bold text-emerald-400">{intel.achievements.totalAchievementsAwarded}</div>
              <div className="text-xs space-y-1 text-slate-400">
                <div>Rank-based: <span className="text-white">{intel.achievements.categoryCounts.rankBased}</span></div>
                <div>Accuracy-based: <span className="text-white">{intel.achievements.categoryCounts.accuracyBased}</span></div>
                <div>Speed & Streak: <span className="text-white">{intel.achievements.categoryCounts.speedBased + intel.achievements.categoryCounts.streakBased}</span></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: HEALTH & ANOMALIES */}
      {activeTab === "health" && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-6 space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-lg font-semibold text-white">Operational Health & Deterministic Anomaly Model</h2>
              <p className="text-xs text-slate-400">
                Evaluated against Policy V1 thresholds to detect operational delays and cohort skew.
              </p>
            </div>
            <span
              className={`px-3 py-1 rounded-full text-xs font-semibold ${
                intel.operationalHealth.isHealthy
                  ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                  : "bg-red-950 text-red-400 border border-red-800"
              }`}
            >
              {intel.operationalHealth.isHealthy ? "✓ System Healthy" : "⚠️ Operational Alerts"}
            </span>
          </div>

          <div className="space-y-3">
            {intel.operationalHealth.anomalies.map((anom) => (
              <div
                key={anom.code}
                className={`p-4 rounded-xl border flex items-start justify-between gap-4 ${
                  anom.triggered
                    ? anom.severity === "CRITICAL"
                      ? "bg-red-950/40 border-red-800 text-red-200"
                      : "bg-amber-950/40 border-amber-800 text-amber-200"
                    : "bg-slate-950 border-slate-800 text-slate-300"
                }`}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">{anom.label}</span>
                    <span className="text-xs font-mono text-slate-400">[{anom.code}]</span>
                  </div>
                  <div className="text-xs mt-1 text-slate-400">{anom.description}</div>
                </div>

                <div className="text-right whitespace-nowrap">
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-bold ${
                      anom.triggered
                        ? anom.severity === "CRITICAL"
                          ? "bg-red-800 text-white"
                          : "bg-amber-800 text-white"
                        : "bg-emerald-950 text-emerald-400 border border-emerald-800"
                    }`}
                  >
                    {anom.triggered ? `TRIGGERED (${anom.value} > ${anom.threshold})` : "NORMAL"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 6: CANDIDATE DRILL-DOWN */}
      {activeTab === "drilldown" && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-6 space-y-5">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-lg font-semibold text-white">Authorized Candidate Telemetry Drill-Down</h2>
              <p className="text-xs text-slate-400">
                Detailed attempt inspector for administrators. All drill-downs are logged in admin_audit_logs.
              </p>
            </div>
            <span className="text-xs bg-indigo-950 text-indigo-300 border border-indigo-800 px-2.5 py-1 rounded">
              Audited Inspection Mode
            </span>
          </div>

          {drillDownError && (
            <div className="p-4 bg-red-950/40 border border-red-800 text-red-300 rounded-xl text-xs">
              {drillDownError}
            </div>
          )}

          {drillDownLoading ? (
            <div className="p-8 text-center text-slate-400 animate-pulse text-sm">
              Loading audited candidate roster...
            </div>
          ) : drillDownList.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-sm">
              No evaluated candidate records found for active snapshot.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 uppercase">
                  <tr>
                    <th className="p-3">Rank</th>
                    <th className="p-3">Candidate</th>
                    <th className="p-3">Score</th>
                    <th className="p-3">Percentile</th>
                    <th className="p-3">Accuracy</th>
                    <th className="p-3">Duration</th>
                    <th className="p-3">Mode</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {drillDownList.map((c) => (
                    <tr key={c.userId} className="hover:bg-slate-800/40">
                      <td className="p-3 font-bold text-amber-400">#{c.rank}</td>
                      <td className="p-3 font-medium text-white">
                        <div>{c.fullName}</div>
                        {c.email && <div className="text-slate-500 text-[10px]">{c.email}</div>}
                      </td>
                      <td className="p-3 font-bold text-white">{c.score}</td>
                      <td className="p-3 text-indigo-400">{c.percentile}%ile</td>
                      <td className="p-3 text-emerald-400">{c.accuracy}%</td>
                      <td className="p-3 text-slate-400">{c.durationMinutes} mins</td>
                      <td className="p-3">
                        <span className="px-1.5 py-0.5 bg-slate-800 rounded text-[10px]">
                          {c.submissionMode}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
