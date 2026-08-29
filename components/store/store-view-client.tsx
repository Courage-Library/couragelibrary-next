"use client";

import React, { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { StoreCatalogItem, StoreUserClaim } from "@/services/gamification.service";
import { RedeemModal } from "@/components/store/redeem-modal";

interface StoreViewClientProps {
  initialWallet: {
    currentBalance: number;
    lifetimeEarned: number;
    freezesHeld: number;
    level: {
      title: string;
      minCoins: number;
      nextLevelTitle?: string;
      nextLevelThreshold?: number;
      progressPercentage: number;
    };
  };
  catalog: StoreCatalogItem[];
  initialUserClaims: StoreUserClaim[];
}

export function StoreViewClient({
  initialWallet,
  catalog,
  initialUserClaims,
}: StoreViewClientProps) {
  const [balance, setBalance] = useState(initialWallet.currentBalance);
  const [userClaims, setUserClaims] = useState<StoreUserClaim[]>(initialUserClaims);
  const [activeCategory, setActiveCategory] = useState<string>("ALL");
  const [selectedReward, setSelectedReward] = useState<StoreCatalogItem | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [successNotice, setSuccessNotice] = useState<{ title: string; coinsSpent: number } | null>(null);

  const categories = [
    { key: "ALL", label: "All Rewards" },
    { key: "PHYSICAL", label: "Physical Rewards" },
    { key: "DIGITAL", label: "Digital Rewards" },
  ];

  const filteredCatalog = catalog.filter((item) => {
    if (activeCategory === "ALL") return true;
    if (activeCategory === "PHYSICAL") return item.rewardType === "PHYSICAL";
    if (activeCategory === "DIGITAL") return item.rewardType === "DIGITAL" || item.rewardType === "FEATURE_UNLOCK";
    return true;
  });

  const handleRedeemClick = (item: StoreCatalogItem) => {
    setSelectedReward(item);
    setIsModalOpen(true);
  };

  const handleRedeemSuccess = (remainingBalance: number, claimId: string, rewardTitle: string) => {
    const cost = selectedReward ? selectedReward.coinCost : 0;
    setBalance(remainingBalance);
    setIsModalOpen(false);
    setSuccessNotice({ title: rewardTitle, coinsSpent: cost });

    if (selectedReward) {
      const newClaim: StoreUserClaim = {
        id: claimId || `claim_${Date.now()}`,
        rewardId: selectedReward.id,
        rewardTitle: selectedReward.title,
        rewardSlug: selectedReward.slug,
        rewardType: selectedReward.rewardType,
        coinsSpent: cost,
        status: selectedReward.rewardType === "DIGITAL" ? "FULFILLED" : "REQUESTED",
        claimedAt: new Date().toISOString(),
        fulfilledAt: selectedReward.rewardType === "DIGITAL" ? new Date().toISOString() : null,
        trackingCode: null,
        shippingAddress: null,
      };
      setUserClaims([newClaim, ...userClaims]);
    }
  };

  const getRewardIcon = (slug: string) => {
    if (slug.includes("freeze")) {
      return (
        <svg className="w-8 h-8 text-sky-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      );
    }
    if (slug.includes("retest") || slug.includes("drill")) {
      return (
        <svg className="w-8 h-8 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      );
    }
    if (slug.includes("bottle")) {
      return (
        <svg className="w-8 h-8 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
      );
    }
    if (slug.includes("diary") || slug.includes("kit")) {
      return (
        <svg className="w-8 h-8 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
      );
    }
    return (
      <svg className="w-8 h-8 text-violet-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
      </svg>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50/50 py-8">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        {/* Success Banner */}
        {successNotice && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between shadow-sm animate-in fade-in duration-200">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <h4 className="text-sm font-bold text-emerald-900">Reward Redeemed Successfully!</h4>
                <p className="text-xs text-emerald-700">
                  {successNotice.title} has been claimed ({successNotice.coinsSpent.toLocaleString()} CL spent).
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Link
                href="/wallet"
                className="px-3.5 py-1.5 text-xs font-bold text-emerald-800 bg-emerald-100/80 hover:bg-emerald-200 rounded-xl transition-colors"
              >
                View Wallet
              </Link>
              <button
                type="button"
                onClick={() => setSuccessNotice(null)}
                className="p-1 text-emerald-500 hover:text-emerald-700 transition-colors"
                aria-label="Dismiss notification"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Store Hero Card */}
        <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 md:p-8 shadow-sm">
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2 max-w-xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 text-amber-800 border border-amber-500/20 text-xs font-bold uppercase tracking-wider">
                <svg className="w-3.5 h-3.5 text-amber-600 fill-amber-500" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" />
                </svg>
                CL Rewards Store
              </div>
              <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">
                Turn your consistency into meaningful rewards.
              </h1>
              <p className="text-sm text-slate-600 leading-relaxed">
                Earn CL Coins through daily mock tests, high accuracy, and study streaks. Spend on physical study gear and preparation enhancements.
              </p>
            </div>

            {/* Prominent Balance Snapshot */}
            <div className="flex flex-col sm:flex-row md:flex-col gap-3 p-5 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 text-white shadow-md md:min-w-[240px]">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400">Available Balance</span>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-amber-400 border border-slate-700">
                  {initialWallet.level.title}
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                <svg className="w-6 h-6 text-amber-400 fill-amber-400 shrink-0" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" />
                </svg>
                <span className="text-3xl font-black tracking-tight text-white">{balance.toLocaleString()}</span>
                <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">CL</span>
              </div>
              <div className="pt-2 border-t border-slate-700/80 flex items-center justify-between">
                <Link
                  href="/wallet"
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-400 hover:text-amber-300 transition-colors"
                >
                  <span>View Wallet</span>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
                {initialWallet.freezesHeld > 0 && (
                  <span className="text-[11px] text-slate-300 font-medium">
                    🛡️ {initialWallet.freezesHeld}/2 Shields
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Category Filter Tabs */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {categories.map((cat) => (
              <button
                key={cat.key}
                type="button"
                onClick={() => setActiveCategory(cat.key)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  activeCategory === cat.key
                    ? "bg-slate-900 text-white shadow-sm"
                    : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200/80"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
          <span className="text-xs text-slate-500 font-medium hidden sm:inline-block">
            {filteredCatalog.length} reward{filteredCatalog.length !== 1 ? "s" : ""} available
          </span>
        </div>

        {/* Reward Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCatalog.map((item) => {
            const cost = item.coinCost;
            const canAfford = balance >= cost;
            const needed = cost - balance;
            const progress = Math.min(100, Math.round((balance / cost) * 100));
            const isStreakFreeze = item.slug === "streak-freeze-token";
            const isMaxFreezeHeld = isStreakFreeze && initialWallet.freezesHeld >= 2;
            const isOutOfStock = item.stockQuantity !== -1 && item.stockQuantity <= 0;

            return (
              <div
                key={item.id}
                className="flex flex-col justify-between p-6 bg-white border rounded-2xl border-slate-200/90 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group"
              >
                <div>
                  {/* Top Bar: Icon + Price Tag */}
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="w-14 h-14 rounded-2xl bg-slate-50 border border-slate-100 overflow-hidden relative shrink-0 flex items-center justify-center p-0.5 group-hover:scale-105 transition-transform">
                      {item.imageUrl ? (
                        <Image src={item.imageUrl} alt={item.title} fill className="object-cover" />
                      ) : (
                        getRewardIcon(item.slug)
                      )}
                    </div>
                    <div className="flex flex-col items-end">
                      <div className="flex items-center gap-1 px-3 py-1 rounded-full bg-amber-500/10 text-amber-800 font-black text-sm border border-amber-500/20">
                        <svg className="w-3.5 h-3.5 text-amber-600 fill-amber-500" viewBox="0 0 24 24">
                          <circle cx="12" cy="12" r="10" />
                        </svg>
                        {cost.toLocaleString()} CL
                      </div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-1">
                        {item.rewardType.replace("_", " ")}
                      </span>
                    </div>
                  </div>

                  {/* Title & Description */}
                  <h3 className="text-base font-bold text-slate-900 leading-snug">{item.title}</h3>
                  <p className="mt-1.5 text-xs text-slate-600 leading-relaxed min-h-[36px]">
                    {item.description}
                  </p>
                </div>

                {/* Bottom Action Area */}
                <div className="pt-4 mt-4 border-t border-slate-100 space-y-3">
                  {/* Affordable vs Locked State */}
                  {canAfford && !isMaxFreezeHeld && !isOutOfStock ? (
                    <button
                      type="button"
                      onClick={() => handleRedeemClick(item)}
                      className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 transition-all shadow-sm active:scale-[0.98]"
                    >
                      <svg className="w-4 h-4 text-amber-400 fill-amber-400" viewBox="0 0 24 24">
                        <circle cx="12" cy="12" r="10" />
                      </svg>
                      <span>Redeem Reward</span>
                    </button>
                  ) : isMaxFreezeHeld ? (
                    <div className="space-y-1 text-center">
                      <button
                        type="button"
                        disabled
                        className="w-full px-4 py-2.5 rounded-xl text-xs font-bold text-slate-400 bg-slate-100 cursor-not-allowed"
                      >
                        Max Shields Held (2/2)
                      </button>
                      <p className="text-[11px] text-slate-500">Use a shield before claiming another</p>
                    </div>
                  ) : isOutOfStock ? (
                    <button
                      type="button"
                      disabled
                      className="w-full px-4 py-2.5 rounded-xl text-xs font-bold text-slate-400 bg-slate-100 cursor-not-allowed"
                    >
                      Out of Stock
                    </button>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-semibold text-slate-500">Need {needed.toLocaleString()} more CL</span>
                        <span className="font-bold text-slate-700">{progress}%</span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-amber-500 rounded-full transition-all duration-300"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <button
                        type="button"
                        disabled
                        className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-slate-400 bg-slate-50 border border-slate-200/80 cursor-not-allowed"
                      >
                        <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                        <span>Locked</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* My Rewards Section */}
        <div className="pt-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">My Rewards</h2>
              <p className="text-xs text-slate-500">Your previously claimed preparation rewards and delivery statuses</p>
            </div>
            <span className="text-xs font-semibold text-slate-500">
              {userClaims.length} Claim{userClaims.length !== 1 ? "s" : ""}
            </span>
          </div>

          {userClaims.length === 0 ? (
            <div className="p-8 text-center bg-white border rounded-2xl border-slate-200/80 space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              </div>
              <h4 className="text-sm font-bold text-slate-900">You haven&apos;t redeemed a reward yet</h4>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Keep preparing with consistency. Your daily mock test scores and streaks earn CL Coins to redeem rewards here.
              </p>
              <div className="pt-2">
                <Link
                  href="/mock-tests"
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-colors shadow-sm"
                >
                  <span>Explore Mock Tests</span>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </Link>
              </div>
            </div>
          ) : (
            <div className="bg-white border rounded-2xl border-slate-200/80 divide-y divide-slate-100 overflow-hidden">
              {userClaims.map((claim) => {
                const isFulfilled = claim.status === "FULFILLED";
                const isProcessing = claim.status === "PROCESSING" || claim.status === "SHIPPED";

                return (
                  <div key={claim.id} className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/50 transition-colors">
                    <div className="flex items-center gap-3.5">
                      <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0">
                        {getRewardIcon(claim.rewardSlug)}
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-900">{claim.rewardTitle}</h4>
                        <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500">
                          <span>{new Date(claim.claimedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
                          <span>•</span>
                          <span className="font-semibold text-amber-700">{claim.coinsSpent.toLocaleString()} CL</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span
                        className={`text-xs font-bold px-3 py-1 rounded-full ${
                          isFulfilled
                            ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                            : isProcessing
                            ? "bg-sky-100 text-sky-800 border border-sky-200"
                            : "bg-amber-100 text-amber-800 border border-amber-200"
                        }`}
                      >
                        {claim.status}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Redemption Confirmation Modal */}
      <RedeemModal
        reward={selectedReward}
        currentBalance={balance}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={handleRedeemSuccess}
      />
    </div>
  );
}
