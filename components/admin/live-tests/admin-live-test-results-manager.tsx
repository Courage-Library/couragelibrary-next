"use client";
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */

import React, { useState } from "react";
import Link from "next/link";
import {
  LiveTestEvent,
  LiveTestRankingSnapshot,
  LiveTestLeaderboardEntry,
} from "@/types/live-test";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  evaluateLiveEventAction,
  publishLiveEventResultsAction,
  recalculateLiveEventResultsAction,
  voidLiveAttemptAction,
  distributeLiveEventRewardsAction,
} from "@/app/admin/live-tests/actions";
import {
  ArrowLeft,
  Trophy,
  Play,
  Send,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Users,
  Award,
  Clock,
  ShieldAlert,
  Coins,
} from "lucide-react";

interface AdminLiveTestResultsManagerProps {
  event: LiveTestEvent;
  snapshots: LiveTestRankingSnapshot[];
  activeSnapshot: LiveTestRankingSnapshot | null;
  leaderboardEntries: LiveTestLeaderboardEntry[];
}

export function AdminLiveTestResultsManager({
  event: initialEvent,
  snapshots: initialSnapshots,
  activeSnapshot: initialActiveSnapshot,
  leaderboardEntries: initialEntries,
}: AdminLiveTestResultsManagerProps) {
  const [event, setEvent] = useState(initialEvent);
  const [snapshots, setSnapshots] = useState(initialSnapshots);
  const [activeSnapshot, setActiveSnapshot] = useState(initialActiveSnapshot);
  const [entries, setEntries] = useState(initialEntries);

  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Distribute Rewards Action
  const handleDistributeRewards = async () => {
    const confirmSettle = window.confirm(
      `Are you sure you want to distribute CL Coin rewards for "${event.title}" under the active snapshot? This will credit wallets idempotently.`
    );
    if (!confirmSettle) return;

    setIsLoading(true);
    setStatusMessage(null);
    try {
      const res = await distributeLiveEventRewardsAction(event.id);
      if (res.success) {
        setStatusMessage({
          type: "success",
          text: `Rewards successfully distributed! Settled: ${res.settledCount}, Top-ups: ${res.topupCount}, Protected drops: ${res.protectedCount}, Total Coins: +${res.totalCoinsDistributed} CL.`,
        });
      } else {
        setStatusMessage({ type: "error", text: res.error || "Reward distribution failed." });
      }
    } catch (err: any) {
      setStatusMessage({ type: "error", text: err?.message || "Error distributing rewards." });
    } finally {
      setIsLoading(false);
    }
  };

  // Evaluate Live Event Action
  const handleEvaluate = async () => {
    setIsLoading(true);
    setStatusMessage(null);
    try {
      const res = await evaluateLiveEventAction(event.id);
      if (res.success) {
        setStatusMessage({
          type: "success",
          text: `Evaluation successful! Evaluated ${res.evaluatedCount} candidates. Status: RESULTS_READY (Snapshot v${res.snapshotVersion}).`,
        });
        window.location.reload();
      } else {
        setStatusMessage({ type: "error", text: res.error || "Evaluation failed." });
      }
    } catch (err: any) {
      setStatusMessage({ type: "error", text: err?.message || "Unexpected evaluation error." });
    } finally {
      setIsLoading(false);
    }
  };

  // Publish Live Event Results Action
  const handlePublish = async () => {
    if (!snapshots || snapshots.length === 0) {
      setStatusMessage({ type: "error", text: "No ranking snapshot available to publish." });
      return;
    }
    const latestVersion = snapshots[0].snapshot_version;
    const confirmPublish = window.confirm(
      `Are you sure you want to officially PUBLISH results for snapshot v${latestVersion}? Candidates will immediately see their scores, ranks, and percentiles.`
    );
    if (!confirmPublish) return;

    setIsLoading(true);
    setStatusMessage(null);
    try {
      const res = await publishLiveEventResultsAction(
        event.id,
        latestVersion,
        "Official admin publication sign-off"
      );
      if (res.success) {
        setStatusMessage({
          type: "success",
          text: `Results officially PUBLISHED! Active snapshot version is v${latestVersion}.`,
        });
        window.location.reload();
      } else {
        setStatusMessage({ type: "error", text: res.error || "Publication failed." });
      }
    } catch (err: any) {
      setStatusMessage({ type: "error", text: err?.message || "Unexpected publication error." });
    } finally {
      setIsLoading(false);
    }
  };

  // Recalculate Live Event Results Action (Errata)
  const handleRecalculate = async () => {
    const reason = window.prompt(
      "Enter justification for recalculation (e.g., Question 14 answer key corrected):"
    );
    if (!reason || reason.trim().length < 5) {
      setStatusMessage({ type: "error", text: "A valid reason (minimum 5 characters) is required for recalculation." });
      return;
    }

    setIsLoading(true);
    setStatusMessage(null);
    try {
      const res = await recalculateLiveEventResultsAction(event.id, reason);
      if (res.success) {
        setStatusMessage({
          type: "success",
          text: `Recalculation complete! Staged Snapshot v${res.snapshotVersion}. Review below before publishing.`,
        });
        window.location.reload();
      } else {
        setStatusMessage({ type: "error", text: res.error || "Recalculation failed." });
      }
    } catch (err: any) {
      setStatusMessage({ type: "error", text: err?.message || "Unexpected recalculation error." });
    } finally {
      setIsLoading(false);
    }
  };

  // Void/Disqualify Attempt Action
  const handleVoidAttempt = async (attemptId: string) => {
    const reason = window.prompt("Enter justification for candidate disqualification:");
    if (!reason || reason.trim().length < 5) return;

    setIsLoading(true);
    try {
      const res = await voidLiveAttemptAction(attemptId, reason);
      if (res.success) {
        setStatusMessage({ type: "success", text: "Candidate attempt invalidated successfully." });
        window.location.reload();
      } else {
        setStatusMessage({ type: "error", text: res.error || "Failed to void attempt." });
      }
    } catch (err: any) {
      setStatusMessage({ type: "error", text: err?.message || "Error voiding attempt." });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Top Breadcrumb & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <Link
            href="/admin/live-tests"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 mb-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Live Tests
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-black text-slate-900">{event.title}</h1>
            <Badge variant="outline" className="font-mono text-xs font-bold">
              {event.status}
            </Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Event ID: {event.id} &bull; Slug: {event.slug}
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            onClick={handleEvaluate}
            disabled={isLoading}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl gap-2 shadow-sm"
          >
            <Play className="w-3.5 h-3.5" /> Run Batch Evaluation
          </Button>

          <Button
            onClick={handlePublish}
            disabled={isLoading || snapshots.length === 0 || event.status === "PUBLISHED"}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl gap-2 shadow-sm"
          >
            <Send className="w-3.5 h-3.5" /> Publish Results
          </Button>

          <Button
            onClick={handleRecalculate}
            disabled={isLoading}
            variant="outline"
            className="border-slate-300 text-slate-700 hover:bg-slate-100 font-bold text-xs rounded-xl gap-2"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Recalculate (Errata)
          </Button>

          <Button
            onClick={handleDistributeRewards}
            disabled={isLoading || !activeSnapshot || event.status !== "PUBLISHED"}
            className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl gap-2 shadow-sm"
          >
            <Coins className="w-3.5 h-3.5" /> Settle Rewards
          </Button>

          <Link href={`/admin/live-tests/${event.id}/intelligence`}>
            <Button
              variant="outline"
              className="border-indigo-300 text-indigo-700 hover:bg-indigo-50 font-bold text-xs rounded-xl gap-2"
            >
              <Trophy className="w-3.5 h-3.5" /> Intelligence Analytics →
            </Button>
          </Link>
        </div>
      </div>

      {/* Status Notice */}
      {statusMessage && (
        <div
          className={`p-4 rounded-xl text-xs font-medium flex items-center gap-2 ${
            statusMessage.type === "success"
              ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
              : "bg-rose-50 text-rose-800 border border-rose-200"
          }`}
        >
          {statusMessage.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-rose-600" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Metrics Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <div className="text-xs font-semibold text-slate-500 mb-1 flex items-center justify-between">
            <span>Ranked Candidates</span>
            <Users className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-2xl font-black text-slate-900">
            {activeSnapshot?.total_participants ?? snapshots[0]?.total_participants ?? 0}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Started: {event.current_started_count} &bull; Submitted: {event.current_submitted_count}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <div className="text-xs font-semibold text-slate-500 mb-1 flex items-center justify-between">
            <span>Highest Score</span>
            <Trophy className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-black text-slate-900">
            {activeSnapshot?.highest_score ?? snapshots[0]?.highest_score ?? "0.00"}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Top candidate performance</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <div className="text-xs font-semibold text-slate-500 mb-1 flex items-center justify-between">
            <span>Average Score</span>
            <Award className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-slate-900">
            {activeSnapshot?.average_score ?? snapshots[0]?.average_score ?? "0.00"}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Cohort mean score</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <div className="text-xs font-semibold text-slate-500 mb-1 flex items-center justify-between">
            <span>Active Snapshot</span>
            <Clock className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-black text-slate-900">
            {activeSnapshot ? `v${activeSnapshot.snapshot_version}` : "None (Draft)"}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Total versions: {snapshots.length}
          </div>
        </div>
      </div>

      {/* Snapshot History Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900">Ranking Snapshot History</h2>
          <span className="text-xs font-mono text-slate-500">{snapshots.length} Snapshots</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 text-slate-500 font-mono text-[10px] uppercase border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">Version</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Participants</th>
                <th className="px-4 py-3 text-right">High Score</th>
                <th className="px-4 py-3 text-right">Avg Score</th>
                <th className="px-4 py-3 text-right">Computed At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {snapshots.map((s) => (
                <tr key={s.id} className={s.is_active ? "bg-emerald-50/50 font-semibold" : ""}>
                  <td className="px-4 py-3 font-mono font-bold">v{s.snapshot_version}</td>
                  <td className="px-4 py-3">
                    {s.is_active ? (
                      <Badge className="bg-emerald-500 text-white text-[10px]">PUBLIC / ACTIVE</Badge>
                    ) : (
                      <Badge variant="neutral" className="text-[10px]">Staged</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">{s.total_participants}</td>
                  <td className="px-4 py-3 text-right font-mono">{s.highest_score}</td>
                  <td className="px-4 py-3 text-right font-mono">{s.average_score}</td>
                  <td className="px-4 py-3 text-right font-mono text-slate-500">
                    {new Date(s.computed_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Candidate Inspection & Disqualification Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900">Top Candidates & Management</h2>
          <span className="text-xs font-mono text-slate-500">Showing {entries.length} entries</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 text-slate-500 font-mono text-[10px] uppercase border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">Rank</th>
                <th className="px-4 py-3">User ID</th>
                <th className="px-4 py-3 text-right">Score</th>
                <th className="px-4 py-3 text-right">Accuracy</th>
                <th className="px-4 py-3 text-right">Percentile</th>
                <th className="px-4 py-3 text-right">Time (s)</th>
                <th className="px-4 py-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {entries.map((e) => (
                <tr key={e.id} className="hover:bg-slate-50/80">
                  <td className="px-4 py-3 font-mono font-bold text-indigo-600">#{e.rank}</td>
                  <td className="px-4 py-3 font-mono text-[11px] text-slate-600 truncate max-w-[150px]">
                    {e.user_id}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-slate-900">{e.total_score}</td>
                  <td className="px-4 py-3 text-right font-mono">{e.accuracy_percentage}%</td>
                  <td className="px-4 py-3 text-right font-mono text-emerald-600">{e.percentile}%</td>
                  <td className="px-4 py-3 text-right font-mono">{e.time_spent_seconds}</td>
                  <td className="px-4 py-3 text-center">
                    <Button
                      onClick={() => handleVoidAttempt(e.attempt_id)}
                      variant="ghost"
                      size="sm"
                      className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 text-[11px] font-bold h-7 px-2"
                    >
                      <ShieldAlert className="w-3 h-3 mr-1" /> Disqualify
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
