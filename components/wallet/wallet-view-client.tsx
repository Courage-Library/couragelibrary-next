"use client";

import React, { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { StudentWalletData, StreakRecoveryEligibility, StreakRecoveryResult, StoreCatalogItem } from "@/services/gamification.service";
import { StreakRecoveryModal } from "@/components/gamification/streak-recovery-modal";
import { RedeemModal } from "@/components/store/redeem-modal";
import { Container } from "@/components/ui/container";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Coins,
  Flame,
  Award,
  TrendingUp,
  ShoppingBag,
  ShieldCheck,
  ArrowLeft,
  Search,
} from "lucide-react";

export interface RewardCatalogItem {
  id: string;
  title: string;
  slug: string;
  description: string;
  rewardType: "DIGITAL" | "FEATURE_UNLOCK" | "PHYSICAL";
  coinCost: number;
  stockQuantity: number;
  imageUrl?: string | null;
  isActive?: boolean;
  displayOrder?: number;
}

interface WalletViewClientProps {
  wallet: StudentWalletData;
  catalog: RewardCatalogItem[];
  streakEligibility?: StreakRecoveryEligibility;
}

export function WalletViewClient({ wallet: initialWallet, catalog, streakEligibility: initialEligibility }: WalletViewClientProps) {
  const [wallet, setWallet] = useState<StudentWalletData>(initialWallet);
  const [eligibility, setEligibility] = useState<StreakRecoveryEligibility | null>(initialEligibility || null);
  const [isRecoveryModalOpen, setIsRecoveryModalOpen] = useState(false);
  const [selectedReward, setSelectedReward] = useState<StoreCatalogItem | null>(null);
  const [isRedeemModalOpen, setIsRedeemModalOpen] = useState(false);
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});
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

  const getRewardIcon = (slug: string) => {
    if (slug.includes("freeze")) {
      return (
        <svg className="w-7 h-7 text-sky-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      );
    }
    if (slug.includes("error") || slug.includes("retest") || slug.includes("drill")) {
      return (
        <svg className="w-7 h-7 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      );
    }
    if (slug.includes("bottle")) {
      return (
        <svg className="w-7 h-7 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
      );
    }
    if (slug.includes("diary") || slug.includes("kit")) {
      return (
        <svg className="w-7 h-7 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
      );
    }
    return (
      <svg className="w-7 h-7 text-violet-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
      </svg>
    );
  };

  const handleRedeemItemClick = (item: RewardCatalogItem) => {
    setSelectedReward({
      id: item.id,
      title: item.title,
      slug: item.slug,
      description: item.description,
      rewardType: item.rewardType as "DIGITAL" | "PHYSICAL" | "FEATURE_UNLOCK",
      coinCost: item.coinCost,
      stockQuantity: item.stockQuantity,
      imageUrl: item.imageUrl || null,
      isActive: true,
      displayOrder: item.displayOrder ?? 0,
    });
    setIsRedeemModalOpen(true);
  };

  const handleRedeemRewardSuccess = (remainingBalance: number) => {
    setWallet((prev) => ({
      ...prev,
      currentBalance: remainingBalance,
    }));
    setIsRedeemModalOpen(false);
  };

  const handleRecoverySuccess = (result: StreakRecoveryResult) => {
    setWallet((prev) => ({
      ...prev,
      freezesHeld: result.remainingShields,
      streak: {
        ...prev.streak,
        currentStreak: result.preservedStreak,
        isFrozen: true,
      },
    }));

    setEligibility((prev) => (prev ? {
      ...prev,
      isEligible: false,
      isAlreadyProtected: true,
      freezesHeld: result.remainingShields,
    } : null));
  };

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

          <Card className="p-5 bg-white border border-slate-200 shadow-2xs space-y-3">
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

            <p className="text-xs text-slate-600 font-medium">
              Streak freeze shields protect your active study streak when a daily study session is missed.
            </p>

            {/* Streak Recovery Action / Status */}
            {eligibility?.isEligible ? (
              <div className="p-3 bg-blue-50/80 border border-blue-200/80 rounded-xl space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="space-y-0.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-blue-800 font-mono block">
                      Missed Day Detected
                    </span>
                    <p className="text-xs font-bold text-slate-900">{eligibility.formattedMissedDate || eligibility.missedDate}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsRecoveryModalOpen(true)}
                    className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-xs shrink-0"
                  >
                    Restore Streak
                  </button>
                </div>
              </div>
            ) : eligibility?.isAlreadyProtected ? (
              <div className="p-2.5 bg-emerald-50 border border-emerald-200/80 rounded-xl flex items-center justify-between text-xs text-emerald-900">
                <span className="font-medium">🛡️ {eligibility.formattedMissedDate || eligibility.missedDate} is protected</span>
                <span className="text-[10px] font-bold uppercase tracking-wider font-mono text-emerald-700">Protected</span>
              </div>
            ) : wallet.freezesHeld === 0 ? (
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="text-slate-500 font-medium">0 / 2 Shields Available</span>
                <Link
                  href="/store"
                  className="font-bold text-blue-600 hover:text-blue-700 transition-colors inline-flex items-center gap-1"
                >
                  <span>Get a Streak Freeze</span>
                  <span>&rarr;</span>
                </Link>
              </div>
            ) : (
              <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-500 font-medium">
                Your streak is currently safe. Maintain it by completing daily practice tests.
              </div>
            )}
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

        {/* 4. Featured Store Rewards (Top 3 Priority) */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-amber-600" />
                Courage Library Reward Store
              </h2>
              <p className="text-xs text-slate-500 font-medium">Featured rewards available for direct redemption</p>
            </div>
            <Link
              href="/store"
              className="text-xs font-bold text-amber-700 hover:text-amber-800 transition-colors inline-flex items-center gap-1 bg-amber-50 px-3 py-1.5 rounded-xl border border-amber-200/80"
            >
              <span>Explore Full Store</span>
              <span>→</span>
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {catalog.slice(0, 3).map((item) => {
              const cost = item.coinCost;
              const canAfford = wallet.currentBalance >= cost;
              const isStreakFreeze = item.slug === "streak-freeze-token";
              const isMaxFreezeHeld = isStreakFreeze && wallet.freezesHeld >= 2;
              const isOutOfStock = item.stockQuantity !== -1 && item.stockQuantity <= 0;

              return (
                <div
                  key={item.id}
                  className="flex flex-col justify-between bg-white border rounded-2xl border-slate-200/90 shadow-xs hover:shadow-md transition-all overflow-hidden group"
                >
                  {/* 4:3 Artwork Container */}
                  <div className="relative w-full aspect-[4/3] bg-slate-900/[0.03] border-b border-slate-100 rounded-t-2xl overflow-hidden">
                    {item.imageUrl && !failedImages[item.id] ? (
                      <Image
                        src={item.imageUrl}
                        alt={item.title}
                        fill
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        className="object-cover group-hover:scale-105 transition-transform duration-300"
                        onError={() => {
                          setFailedImages((prev) => ({ ...prev, [item.id]: true }));
                        }}
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center text-slate-400 p-4 w-full h-full">
                        {getRewardIcon(item.slug)}
                      </div>
                    )}
                  </div>

                  {/* Card Body */}
                  <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-mono">
                          {item.rewardType.replace("_", " ")}
                        </span>
                        <div className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-800 font-black text-xs border border-amber-500/20">
                          <svg className="w-3 h-3 text-amber-600 fill-amber-500" viewBox="0 0 24 24">
                            <circle cx="12" cy="12" r="10" />
                          </svg>
                          <span>{cost.toLocaleString()} CL</span>
                        </div>
                      </div>

                      <h3 className="text-sm font-bold text-slate-900 leading-snug">
                        {item.title}
                      </h3>

                      <p className="text-xs text-slate-600 leading-relaxed line-clamp-2 min-h-[32px]">
                        {item.description}
                      </p>
                    </div>

                    {/* Redeem Action */}
                    <div className="pt-2.5 border-t border-slate-100">
                      {isOutOfStock ? (
                        <button
                          type="button"
                          disabled
                          className="w-full py-2 rounded-xl text-xs font-bold text-slate-400 bg-slate-100 cursor-not-allowed select-none"
                        >
                          Out of Stock
                        </button>
                      ) : isMaxFreezeHeld ? (
                        <button
                          type="button"
                          disabled
                          className="w-full py-2 rounded-xl text-xs font-bold text-slate-400 bg-slate-100 cursor-not-allowed select-none"
                        >
                          Max Shields Held (2/2)
                        </button>
                      ) : canAfford ? (
                        <button
                          type="button"
                          onClick={() => handleRedeemItemClick(item)}
                          className="w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 transition-all shadow-xs active:scale-[0.98]"
                        >
                          <svg className="w-3.5 h-3.5 text-amber-400 fill-amber-400" viewBox="0 0 24 24">
                            <circle cx="12" cy="12" r="10" />
                          </svg>
                          <span>Redeem Reward</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled
                          className="w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold text-slate-400 bg-slate-100/90 border border-slate-200/80 cursor-not-allowed select-none opacity-80"
                        >
                          <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                          </svg>
                          <span>Need {(cost - wallet.currentBalance).toLocaleString()} more CL</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
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

      {/* Streak Freeze Recovery Modal */}
      <StreakRecoveryModal
        isOpen={isRecoveryModalOpen}
        onClose={() => setIsRecoveryModalOpen(false)}
        eligibility={eligibility}
        onSuccess={handleRecoverySuccess}
      />

      {/* Store Reward Redemption Modal */}
      <RedeemModal
        reward={selectedReward}
        currentBalance={wallet.currentBalance}
        isOpen={isRedeemModalOpen}
        onClose={() => setIsRedeemModalOpen(false)}
        onSuccess={handleRedeemRewardSuccess}
      />
    </div>
  );
}
