"use client";

import React, { useState } from "react";
import { GamificationAdminStats } from "@/services/gamification.service";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Coins,
  TrendingUp,
  ShoppingBag,
  Award,
  ShieldCheck,
  Target,
  Flame,
  Search,
  CheckCircle2,
} from "lucide-react";

interface GamificationManagementViewProps {
  stats: GamificationAdminStats;
}

export function GamificationManagementView({ stats }: GamificationManagementViewProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<string>("ALL");

  const filteredLedger = stats.recentLedger.filter((entry) => {
    const matchesSearch =
      entry.userName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      entry.reasonCode?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      entry.userId?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesFilter =
      filterType === "ALL" ||
      (filterType === "CREDIT" && entry.direction === "CREDIT") ||
      (filterType === "DEBIT" && entry.direction === "DEBIT");

    return matchesSearch && matchesFilter;
  });

  return (
    <div className="space-y-6 pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Coins className="w-6 h-6 text-amber-500" />
            CL Coin Economy &amp; Gamification Studio
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-1">
            Server-authoritative internal reward currency, accuracy slabs, streaks and immutable financial ledger.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="px-3 py-1 bg-emerald-50 text-emerald-800 border-emerald-300 font-mono text-xs font-bold">
            <ShieldCheck className="w-3.5 h-3.5 mr-1" /> Ledger Protected
          </Badge>
        </div>
      </div>

      {/* 1. KPI Economics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* In Circulation */}
        <Card className="p-4 bg-white border-slate-200/90 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider font-mono">In Circulation</span>
            <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center text-amber-600">
              <Coins className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-2xl font-black text-slate-900 font-mono">{stats.totalCoinsInCirculation.toLocaleString()}</span>
            <span className="text-xs font-bold text-amber-600 font-mono">CL</span>
          </div>
          <span className="text-[10px] text-slate-400 font-medium block mt-1">Across {stats.activeWalletsCount} candidate wallets</span>
        </Card>

        {/* Lifetime Issued */}
        <Card className="p-4 bg-white border-slate-200/90 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider font-mono">Lifetime Issued</span>
            <div className="w-8 h-8 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-2xl font-black text-slate-900 font-mono">{stats.lifetimeCoinsIssued.toLocaleString()}</span>
            <span className="text-xs font-bold text-blue-600 font-mono">CL</span>
          </div>
          <span className="text-[10px] text-slate-400 font-medium block mt-1">Total earned via mocks &amp; streaks</span>
        </Card>

        {/* Store Spent */}
        <Card className="p-4 bg-white border-slate-200/90 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider font-mono">Store Redemptions</span>
            <div className="w-8 h-8 rounded-xl bg-rose-100 flex items-center justify-center text-rose-600">
              <ShoppingBag className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-2xl font-black text-slate-900 font-mono">{stats.totalCoinsSpent.toLocaleString()}</span>
            <span className="text-xs font-bold text-rose-600 font-mono">CL</span>
          </div>
          <span className="text-[10px] text-slate-400 font-medium block mt-1">Claimed for physical prep kits &amp; merchandise</span>
        </Card>

        {/* Badges Awarded */}
        <Card className="p-4 bg-white border-slate-200/90 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider font-mono">Badges Unlocked</span>
            <div className="w-8 h-8 rounded-xl bg-purple-100 flex items-center justify-center text-purple-600">
              <Award className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-2xl font-black text-slate-900 font-mono">{stats.badgesAwardedCount}</span>
            <span className="text-xs font-bold text-purple-600 font-mono">Badges</span>
          </div>
          <span className="text-[10px] text-slate-400 font-medium block mt-1">Consistency, precision &amp; volume</span>
        </Card>
      </div>

      {/* 2. Active Reward Policies & Accuracy Slabs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Reward Policies */}
        <Card className="p-5 bg-white border-slate-200/90 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-blue-600" />
              <h2 className="text-sm font-extrabold text-slate-900">Active Test Reward Configuration</h2>
            </div>
            <Badge variant="outline" className="text-[10px] font-bold text-blue-700 bg-blue-50 border-blue-200">
              v1.0 Conservative
            </Badge>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
              <div>
                <span className="text-xs font-bold text-slate-900 block">Daily Sectional Mock</span>
                <span className="text-[11px] text-slate-500 font-medium">Standard daily test completion</span>
              </div>
              <span className="text-xs font-black text-slate-900 font-mono">+{stats.policyConfig.dailyCompletionBase} CL</span>
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
              <div>
                <span className="text-xs font-bold text-slate-900 block">Mixed Practice Mock</span>
                <span className="text-[11px] text-slate-500 font-medium">Multi-subject sectional practice</span>
              </div>
              <span className="text-xs font-black text-slate-900 font-mono">+{stats.policyConfig.mixedCompletionBase} CL</span>
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
              <div>
                <span className="text-xs font-bold text-slate-900 block">Full-Length Grand Mock</span>
                <span className="text-[11px] text-slate-500 font-medium">Complete examination simulation</span>
              </div>
              <span className="text-xs font-black text-slate-900 font-mono">+{stats.policyConfig.fullCompletionBase} CL</span>
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl bg-amber-50/50 border border-amber-200/80">
              <div className="flex items-center gap-2">
                <Flame className="w-4 h-4 text-orange-500 shrink-0" />
                <div>
                  <span className="text-xs font-bold text-amber-950 block">Daily Streak Qualifying Bonus</span>
                  <span className="text-[11px] text-amber-800 font-medium">Awarded on consecutive daily mock activity</span>
                </div>
              </div>
              <span className="text-xs font-black text-amber-950 font-mono">+5 CL</span>
            </div>
          </div>
        </Card>

        {/* Accuracy Slabs */}
        <Card className="p-5 bg-white border-slate-200/90 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <h2 className="text-sm font-extrabold text-slate-900">Accuracy Bonus Slabs</h2>
            </div>
            <span className="text-[10px] font-bold text-slate-500">
              Min Threshold: ≥{stats.policyConfig.minAttemptThresholdPct}% Attempted
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {stats.policyConfig.accuracySlabs.map((slab) => (
              <div
                key={`${slab.min}-${slab.max}`}
                className="p-2.5 rounded-xl border border-slate-100 bg-slate-50/80 text-center"
              >
                <span className="text-[10px] font-bold text-slate-500 block">
                  {slab.min === 100 ? "100%" : `${slab.min}–${slab.max}%`}
                </span>
                <span className="text-sm font-black text-emerald-700 font-mono block mt-0.5">
                  +{slab.coins} CL
                </span>
              </div>
            ))}
          </div>

          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-[11px] text-slate-600 space-y-1">
            <p className="font-semibold text-slate-800">
              <strong>Safety Invariant:</strong> Minimum Attempt Threshold = <code>Ceil(Total Questions × 0.50)</code>
            </p>
            <p className="text-slate-500">
              Unattempted questions never reduce candidate accuracy, but candidates who answer under 50% of the paper receive 0 accuracy bonus to prevent coin farming.
            </p>
          </div>
        </Card>
      </div>

      {/* 3. Immutable Transaction Ledger Audit Table */}
      <Card className="bg-white border-slate-200/90 shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-extrabold text-slate-900">Recent Coin Transactions Audit Ledger</h2>
            <p className="text-[11px] text-slate-500 font-medium">Real-time immutable financial transaction entries</p>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search user or reason..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 pr-3 py-1.5 rounded-lg text-xs bg-slate-50 border border-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500 w-48 sm:w-64"
              />
            </div>

            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              aria-label="Filter transactions by direction"
              className="py-1.5 px-2.5 rounded-lg text-xs bg-slate-50 border border-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500 font-bold text-slate-700"
            >
              <option value="ALL">All Types</option>
              <option value="CREDIT">Credits (+)</option>
              <option value="DEBIT">Debits (-)</option>
            </select>
          </div>
        </div>

        {filteredLedger.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs font-medium">
            No transactions found matching the selected filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-100 text-[11px] font-bold text-slate-500 uppercase tracking-wider font-mono">
                  <th className="py-2.5 px-4">Candidate</th>
                  <th className="py-2.5 px-4">Type</th>
                  <th className="py-2.5 px-4">Reason</th>
                  <th className="py-2.5 px-4">Amount</th>
                  <th className="py-2.5 px-4">Balance After</th>
                  <th className="py-2.5 px-4 text-right">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {filteredLedger.map((entry) => (
                  <tr key={entry.id} className="hover:bg-slate-50/50 transition">
                    <td className="py-2.5 px-4 font-bold text-slate-900">{entry.userName}</td>
                    <td className="py-2.5 px-4">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          entry.direction === "CREDIT"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : "bg-rose-50 text-rose-700 border border-rose-200"
                        }`}
                      >
                        {entry.direction}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-slate-600">{entry.reasonCode}</td>
                    <td className="py-2.5 px-4">
                      <span
                        className={`font-black font-mono ${
                          entry.direction === "CREDIT" ? "text-emerald-700" : "text-rose-600"
                        }`}
                      >
                        {entry.direction === "CREDIT" ? `+${entry.amount}` : `-${entry.amount}`} CL
                      </span>
                    </td>
                    <td className="py-2.5 px-4 font-mono text-slate-700">{entry.balanceAfter} CL</td>
                    <td className="py-2.5 px-4 text-right text-slate-400 font-mono text-[11px]">
                      {new Date(entry.createdAt).toLocaleDateString("en-IN", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
