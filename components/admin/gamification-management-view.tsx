"use client";

import React, { useState, useTransition } from "react";
import { GamificationAdminStats } from "@/services/gamification.service";
import { updateRewardPolicyAction } from "@/app/admin/gamification/actions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Coins,
  TrendingUp,
  ShoppingBag,
  Award,
  ShieldCheck,
  Flame,
  Search,
  CheckCircle2,
  Settings,
  Save,
  Check,
  AlertCircle,
} from "lucide-react";

interface GamificationManagementViewProps {
  stats: GamificationAdminStats;
}

export function GamificationManagementView({ stats }: GamificationManagementViewProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<string>("ALL");
  const [isPending, startTransition] = useTransition();

  // Local state for editing policies
  const [editingPolicy, setEditingPolicy] = useState<{
    policyCode: string;
    baseCoins: number;
    performanceBonusCoins: number;
    consistencyBonusCoins: number;
  } | null>(null);

  const [statusMessage, setStatusMessage] = useState<{ text: string; isError?: boolean } | null>(null);

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

  const handleSavePolicy = (policyCode: string) => {
    if (!editingPolicy) return;
    setStatusMessage(null);

    startTransition(async () => {
      const res = await updateRewardPolicyAction(policyCode, {
        baseCoins: Number(editingPolicy.baseCoins),
        performanceBonusCoins: Number(editingPolicy.performanceBonusCoins),
        consistencyBonusCoins: Number(editingPolicy.consistencyBonusCoins),
      });

      if (res.success) {
        setStatusMessage({ text: `Policy ${policyCode} updated successfully in database.` });
        setEditingPolicy(null);
      } else {
        setStatusMessage({ text: res.error || "Failed to update policy", isError: true });
      }
    });
  };

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
            Server-authoritative internal reward currency, database reward policies, accuracy slabs, streaks and immutable financial ledger.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="px-3 py-1 bg-emerald-50 text-emerald-800 border-emerald-300 font-mono text-xs font-bold">
            <ShieldCheck className="w-3.5 h-3.5 mr-1" /> Ledger Protected
          </Badge>
        </div>
      </div>

      {statusMessage && (
        <div
          className={`p-3.5 rounded-2xl border text-xs font-bold flex items-center gap-2 ${
            statusMessage.isError
              ? "bg-rose-50 border-rose-200 text-rose-800"
              : "bg-emerald-50 border-emerald-200 text-emerald-800"
          }`}
        >
          {statusMessage.isError ? (
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          ) : (
            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

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

      {/* 2. Database Reward Policies Management & Accuracy Slabs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Database Policies Editor */}
        <Card className="p-5 bg-white border-slate-200/90 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Settings className="w-4 h-4 text-blue-600" />
              <h2 className="text-sm font-extrabold text-slate-900">Database Reward Policies Catalog</h2>
            </div>
            <Badge variant="outline" className="text-[10px] font-bold text-blue-700 bg-blue-50 border-blue-200">
              `reward_policies` Live
            </Badge>
          </div>

          <div className="space-y-3">
            {stats.rewardPolicies.map((pol) => {
              const isEditing = editingPolicy?.policyCode === pol.policyCode;
              return (
                <div
                  key={pol.id}
                  className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 space-y-2.5 transition"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-slate-900 block font-mono">{pol.policyCode}</span>
                      <span className="text-[10px] text-slate-500 font-medium">{pol.eventType}</span>
                    </div>

                    {!isEditing ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setEditingPolicy({
                            policyCode: pol.policyCode,
                            baseCoins: pol.baseCoins,
                            performanceBonusCoins: pol.performanceBonusCoins,
                            consistencyBonusCoins: pol.consistencyBonusCoins,
                          })
                        }
                        className="text-xs font-bold text-blue-600 hover:text-blue-700 hover:bg-blue-50 h-7 px-2.5"
                      >
                        Edit Policy
                      </Button>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <Button
                          size="sm"
                          variant="default"
                          disabled={isPending}
                          onClick={() => handleSavePolicy(pol.policyCode)}
                          className="text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white h-7 px-2.5"
                        >
                          <Save className="w-3 h-3 mr-1" />
                          Save
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditingPolicy(null)}
                          className="text-xs font-bold text-slate-500 h-7 px-2"
                        >
                          Cancel
                        </Button>
                      </div>
                    )}
                  </div>

                  {!isEditing ? (
                    <div className="grid grid-cols-3 gap-2 pt-1 border-t border-slate-200/60 text-[11px]">
                      <div>
                        <span className="text-slate-400 font-bold block text-[10px]">Base</span>
                        <strong className="text-slate-900 font-mono">+{pol.baseCoins} CL</strong>
                      </div>
                      <div>
                        <span className="text-slate-400 font-bold block text-[10px]">Perf Bonus</span>
                        <strong className="text-blue-700 font-mono">+{pol.performanceBonusCoins} CL</strong>
                      </div>
                      <div>
                        <span className="text-slate-400 font-bold block text-[10px]">Streak Bonus</span>
                        <strong className="text-amber-700 font-mono">+{pol.consistencyBonusCoins} CL</strong>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-2 pt-1 border-t border-slate-200/60">
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 block mb-1">Base Coins</label>
                        <input
                          type="number"
                          min="0"
                          value={editingPolicy.baseCoins}
                          onChange={(e) =>
                            setEditingPolicy({ ...editingPolicy, baseCoins: parseInt(e.target.value) || 0 })
                          }
                          className="w-full text-xs font-mono font-bold px-2 py-1 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 block mb-1">Perf Bonus</label>
                        <input
                          type="number"
                          min="0"
                          value={editingPolicy.performanceBonusCoins}
                          onChange={(e) =>
                            setEditingPolicy({ ...editingPolicy, performanceBonusCoins: parseInt(e.target.value) || 0 })
                          }
                          className="w-full text-xs font-mono font-bold px-2 py-1 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 block mb-1">Streak Bonus</label>
                        <input
                          type="number"
                          min="0"
                          value={editingPolicy.consistencyBonusCoins}
                          onChange={(e) =>
                            setEditingPolicy({ ...editingPolicy, consistencyBonusCoins: parseInt(e.target.value) || 0 })
                          }
                          className="w-full text-xs font-mono font-bold px-2 py-1 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>

        {/* Accuracy Slabs & Safety Invariants */}
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

          <div className="p-3.5 rounded-2xl bg-amber-50/60 border border-amber-200/80 text-[11px] text-amber-950 space-y-1.5">
            <div className="flex items-center gap-1.5 font-bold text-amber-900">
              <Flame className="w-4 h-4 text-orange-500 shrink-0" />
              <span>Safety &amp; Anti-Farming Invariants</span>
            </div>
            <p className="text-[11px] text-amber-800 leading-relaxed">
              • <strong>First Attempt Rule:</strong> Only the first completed attempt of any mock test qualifies for completion &amp; accuracy rewards. Retakes yield 0 CL.
            </p>
            <p className="text-[11px] text-amber-800 leading-relaxed">
              • <strong>Attempt Threshold:</strong> <code>Ceil(Total Questions × 0.50)</code> must be attempted to unlock accuracy bonuses.
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
                placeholder="Search candidate or reason..."
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
