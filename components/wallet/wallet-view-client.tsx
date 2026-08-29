"use client";

import React, { useState } from "react";
import Link from "next/link";
import { StudentWalletData } from "@/services/gamification.service";
import { Container } from "@/components/ui/container";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Coins,
  Flame,
  Award,
  TrendingUp,
  ShoppingBag,
  ShieldCheck,
  ArrowLeft,
  Search,
  Lock,
  Package,
} from "lucide-react";

export interface RewardCatalogItem {
  id: string;
  title: string;
  slug: string;
  description: string;
  rewardType: "DIGITAL" | "FEATURE_UNLOCK" | "PHYSICAL";
  coinCost: number;
  stockQuantity: number;
}

interface WalletViewClientProps {
  wallet: StudentWalletData;
  catalog: RewardCatalogItem[];
}

export function WalletViewClient({ wallet, catalog }: WalletViewClientProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<string>("ALL");

  const filteredTransactions = wallet.recentTransactions.filter((tx) => {
    const matchesSearch =
      tx.reasonCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tx.transactionType.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesFilter =
      filterType === "ALL" ||
      (filterType === "CREDIT" && tx.direction === "CREDIT") ||
      (filterType === "DEBIT" && tx.direction === "DEBIT");

    return matchesSearch && matchesFilter;
  });

  return (
    <div className="py-8 sm:py-12 bg-slate-50/70 min-h-[calc(100vh-4rem)]">
      <Container className="max-w-5xl space-y-8">
        {/* Header & Breadcrumb */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/mock-tests"
            prefetch={false}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-900 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Mock Tests
          </Link>
          <Badge variant="indigo" className="text-xs font-extrabold uppercase tracking-wide">
            <ShieldCheck className="w-3.5 h-3.5 mr-1" /> Verified CL Wallet
          </Badge>
        </div>

        {/* 1. Main Wallet Balance & Level Card */}
        <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white shadow-xl space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-indigo-900/60">
            <div className="space-y-2">
              <span className="text-xs font-bold uppercase tracking-widest text-indigo-300 font-mono flex items-center gap-1.5">
                <Coins className="w-4 h-4 text-amber-400 fill-amber-400" />
                Current Balance
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl sm:text-5xl font-black text-white font-mono">
                  {wallet.currentBalance.toLocaleString()}
                </span>
                <span className="text-lg font-bold text-amber-400 font-mono">CL Coins</span>
              </div>
              <p className="text-xs text-slate-300 font-medium">
                Server-authoritative internal reward currency earned via disciplined study &amp; assessments.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4 sm:gap-6 bg-white/5 p-4 rounded-2xl border border-white/10">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block font-mono">Lifetime Earned</span>
                <span className="text-xl font-black text-emerald-400 font-mono mt-0.5 block">
                  +{wallet.lifetimeEarned.toLocaleString()} CL
                </span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block font-mono">Redeemed</span>
                <span className="text-xl font-black text-rose-300 font-mono mt-0.5 block">
                  -{wallet.lifetimeSpent.toLocaleString()} CL
                </span>
              </div>
            </div>
          </div>

          {/* Level Progression */}
          <div className="space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="font-bold text-slate-300 flex items-center gap-1.5">
                <Award className="w-4 h-4 text-amber-400" />
                Rank Level: <strong className="text-amber-300">{wallet.level.title}</strong>
              </span>
              <span className="font-bold text-slate-400 font-mono">
                {wallet.level.nextLevelTitle
                  ? `${wallet.lifetimeEarned} / ${wallet.level.nextLevelThreshold} CL to ${wallet.level.nextLevelTitle}`
                  : "Maximum Rank Achieved"}
              </span>
            </div>
            <div className="w-full h-2.5 bg-indigo-950/80 rounded-full overflow-hidden border border-indigo-800/60">
              <div
                className="h-full bg-gradient-to-r from-amber-400 to-amber-500 rounded-full transition-all"
                style={{ width: `${wallet.level.progressPercentage}%` }}
              />
            </div>
          </div>
        </div>

        {/* 2. Consistency & Streak Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="p-5 bg-white border border-slate-200 shadow-2xs space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-orange-100 flex items-center justify-center text-orange-600">
                  <Flame className="w-4 h-4 text-orange-500 fill-orange-500" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900">Study Streak</h3>
                  <span className="text-[11px] text-slate-500 font-medium">Daily practice consistency</span>
                </div>
              </div>
              <span className="text-lg font-black text-orange-600 font-mono">
                {wallet.streak.currentStreak} Days
              </span>
            </div>
            <p className="text-xs text-slate-600 font-medium pt-1">
              Maintain your daily practice streak by submitting the daily mock test. Longest streak: <strong>{wallet.streak.longestStreak} days</strong>.
            </p>
          </Card>

          <Card className="p-5 bg-white border border-slate-200 shadow-2xs space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600">
                  <ShieldCheck className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900">Streak Freeze Shields</h3>
                  <span className="text-[11px] text-slate-500 font-medium">Missed study day protection</span>
                </div>
              </div>
              <span className="text-lg font-black text-blue-700 font-mono">
                {wallet.freezesHeld} / 2 Held
              </span>
            </div>
            <p className="text-xs text-slate-600 font-medium pt-1">
              Streak freeze shields automatically protect your active streak when a daily study window is missed.
            </p>
          </Card>
        </div>

        {/* 3. Ways to Earn CL Coins */}
        <Card className="p-6 bg-white border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <TrendingUp className="w-4 h-4 text-blue-600" />
            <h2 className="text-sm font-extrabold text-slate-900">How to Earn CL Coins</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
              <div className="flex items-center justify-between font-bold text-slate-900">
                <span>Daily Sectional</span>
                <span className="text-emerald-700 font-mono font-black">+10 CL</span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium">Complete Monday–Thursday daily sectional tests</p>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
              <div className="flex items-center justify-between font-bold text-slate-900">
                <span>Mixed Practice</span>
                <span className="text-emerald-700 font-mono font-black">+15 CL</span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium">Complete Friday &amp; Saturday mixed subject mocks</p>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
              <div className="flex items-center justify-between font-bold text-slate-900">
                <span>Full-Length Mock</span>
                <span className="text-emerald-700 font-mono font-black">+25 CL</span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium">Complete Sunday national full-length simulation</p>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
              <div className="flex items-center justify-between font-bold text-slate-900">
                <span>Accuracy Bonus</span>
                <span className="text-blue-700 font-mono font-black">Up to +15 CL</span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium">Attempt $\ge 50\%$ questions with high accuracy</p>
            </div>
          </div>
        </Card>

        {/* 4. Store Rewards Catalog */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-amber-600" />
              Courage Library Reward Store
            </h2>
            <Link
              href="/store"
              className="text-xs font-bold text-amber-700 hover:text-amber-800 transition-colors flex items-center gap-1"
            >
              <span>Explore Full Store</span>
              <span>→</span>
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {catalog.map((item) => {
              const canAfford = wallet.currentBalance >= item.coinCost;
              return (
                <Card
                  key={item.id}
                  className={`p-5 rounded-3xl border transition-all flex flex-col justify-between space-y-4 ${
                    canAfford ? "bg-white border-amber-200/80 shadow-xs" : "bg-white border-slate-200 opacity-90 shadow-2xs"
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Badge
                        variant={item.rewardType === "PHYSICAL" ? "default" : "outline"}
                        className="text-[10px] font-bold"
                      >
                        {item.rewardType === "PHYSICAL" ? "Physical Kit" : item.rewardType === "FEATURE_UNLOCK" ? "Unlock" : "Digital"}
                      </Badge>
                      <span className="text-sm font-black text-amber-600 font-mono">
                        {item.coinCost.toLocaleString()} CL
                      </span>
                    </div>

                    <h3 className="text-sm font-black text-slate-900">{item.title}</h3>
                    <p className="text-xs text-slate-500 font-medium leading-relaxed">{item.description}</p>
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                    {canAfford ? (
                      <Link href="/store" className="w-full">
                        <Button size="sm" className="w-full text-xs font-bold bg-amber-500 hover:bg-amber-600 text-slate-950">
                          <Package className="w-3.5 h-3.5 mr-1" /> Redeem in Store
                        </Button>
                      </Link>
                    ) : (
                      <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
                        <Lock className="w-3 h-3" /> Need {(item.coinCost - wallet.currentBalance).toLocaleString()} more CL
                      </span>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        </div>

        {/* 5. Immutable Ledger Audit Table */}
        <Card className="bg-white border border-slate-200 shadow-2xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-extrabold text-slate-900">Recent Coin Transactions</h2>
              <p className="text-[11px] text-slate-500 font-medium">Immutable financial double-entry ledger records</p>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search reason or type..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 pr-3 py-1.5 rounded-lg text-xs bg-slate-50 border border-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500 w-40 sm:w-56"
                />
              </div>

              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                aria-label="Filter transactions"
                className="py-1.5 px-2.5 rounded-lg text-xs bg-slate-50 border border-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500 font-bold text-slate-700"
              >
                <option value="ALL">All</option>
                <option value="CREDIT">Credits (+)</option>
                <option value="DEBIT">Debits (-)</option>
              </select>
            </div>
          </div>

          {filteredTransactions.length === 0 ? (
            <div className="p-10 text-center text-slate-400 text-xs font-medium">
              No transactions recorded yet. Complete today&apos;s mock test to earn your first CL Coins.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-100 text-[11px] font-bold text-slate-500 uppercase tracking-wider font-mono">
                    <th className="py-2.5 px-4">Type</th>
                    <th className="py-2.5 px-4">Reason</th>
                    <th className="py-2.5 px-4">Amount</th>
                    <th className="py-2.5 px-4">Balance After</th>
                    <th className="py-2.5 px-4 text-right">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {filteredTransactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-slate-50/50 transition">
                      <td className="py-2.5 px-4">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            tx.direction === "CREDIT"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : "bg-rose-50 text-rose-700 border border-rose-200"
                          }`}
                        >
                          {tx.direction}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-slate-800">{tx.reasonCode}</td>
                      <td className="py-2.5 px-4">
                        <span
                          className={`font-black font-mono ${
                            tx.direction === "CREDIT" ? "text-emerald-700" : "text-rose-600"
                          }`}
                        >
                          {tx.direction === "CREDIT" ? `+${tx.amount}` : `-${tx.amount}`} CL
                        </span>
                      </td>
                      <td className="py-2.5 px-4 font-mono text-slate-700">{tx.balanceAfter} CL</td>
                      <td className="py-2.5 px-4 text-right text-slate-400 font-mono text-[11px]">
                        {new Date(tx.createdAt).toLocaleDateString("en-IN", {
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
      </Container>
    </div>
  );
}
