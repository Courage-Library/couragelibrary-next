"use client";

import React, { useState } from "react";
import Image from "next/image";
import { StoreCatalogItem } from "@/services/gamification.service";

interface RedeemModalProps {
  reward: StoreCatalogItem | null;
  currentBalance: number;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (remainingBalance: number, claimId: string, rewardTitle: string) => void;
}

export function RedeemModal({
  reward,
  currentBalance,
  isOpen,
  onClose,
  onSuccess,
}: RedeemModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [stateName, setStateName] = useState("");
  const [pincode, setPincode] = useState("");

  if (!isOpen || !reward) return null;

  const cost = reward.coinCost;
  const balanceAfter = currentBalance - cost;
  const isPhysical = reward.rewardType === "PHYSICAL";
  const isStreakFreeze = reward.slug.includes("freeze");
  const isRetestDrill = reward.slug.includes("retest") || reward.slug.includes("drill");
  const canAfford = currentBalance >= cost;
  const neededCoins = Math.max(0, cost - currentBalance);

  const handleConfirm = async () => {
    if (!canAfford) {
      setErrorMsg(`Insufficient CL Coins. You need ${neededCoins.toLocaleString()} more CL.`);
      return;
    }

    if (isPhysical) {
      if (!fullName.trim() || !phone.trim() || !address.trim() || !pincode.trim()) {
        setErrorMsg("Please complete all required delivery address fields.");
        return;
      }
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/store/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rewardId: reward.id,
          shippingDetails: isPhysical
            ? {
                fullName: fullName.trim(),
                phone: phone.trim(),
                address: address.trim(),
                city: city.trim(),
                state: stateName.trim(),
                pincode: pincode.trim(),
              }
            : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMsg(data.error || "Redemption failed. Please try again.");
        setIsSubmitting(false);
        return;
      }

      onSuccess(data.remainingBalance ?? balanceAfter, data.claimId || "", reward.title);
    } catch {
      setErrorMsg("Network error occurred. Please check your connection and try again.");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl overflow-hidden bg-white border shadow-2xl rounded-2xl border-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/70">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-amber-100 text-amber-700">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Reward Details &amp; Redemption</h3>
              <p className="text-xs text-slate-500 font-medium">Review reward specifics, eligibility, and confirm redemption.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 text-slate-400 transition-colors rounded-lg hover:text-slate-600 hover:bg-slate-100 disabled:opacity-50"
            aria-label="Close dialog"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* Prominent Large 4:3 Reward Artwork */}
          <div className="relative w-full aspect-[4/3] bg-slate-900/[0.04] rounded-xl border border-slate-200 overflow-hidden flex items-center justify-center p-3">
            {reward.imageUrl && !imageError ? (
              <Image
                src={reward.imageUrl}
                alt={reward.title}
                fill
                sizes="(max-width: 640px) 100vw, 550px"
                className="object-contain p-2"
                priority
                onError={() => {
                  console.warn(`[RedeemModal] Failed to load reward image for "${reward.title}": ${reward.imageUrl}`);
                  setImageError(true);
                }}
              />
            ) : (
              <div className="flex flex-col items-center justify-center text-slate-400 p-4">
                <svg className="w-16 h-16 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              </div>
            )}
          </div>

          {/* Reward Header & Cost */}
          <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100">
            <div>
              <span className="text-[10px] font-bold tracking-wider uppercase px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-700 font-mono inline-block mb-1">
                {reward.rewardType.replace("_", " ")} REWARD
              </span>
              <h4 className="text-lg font-bold text-slate-900 leading-snug">{reward.title}</h4>
            </div>
            <div className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-amber-500/10 text-amber-800 font-black text-sm shrink-0 border border-amber-500/20">
              <svg className="w-4 h-4 text-amber-600 fill-amber-500" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" />
              </svg>
              <span>{cost.toLocaleString()} CL</span>
            </div>
          </div>

          {/* Section: About This Reward */}
          <div className="space-y-1.5">
            <h5 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 font-mono">
              About This Reward
            </h5>
            <p className="text-xs text-slate-700 leading-relaxed">
              {reward.description}
            </p>
          </div>

          {/* Section: How It Works & Rules */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2 text-xs">
            <h5 className="text-[11px] font-bold uppercase tracking-wider text-slate-700 font-mono">
              How It Works &amp; Rules
            </h5>
            <ul className="space-y-1.5 text-slate-600 text-[11px] leading-relaxed">
              {isStreakFreeze ? (
                <>
                  <li className="flex items-start gap-2">
                    <span className="text-sky-600 font-bold">•</span>
                    <span><strong>1 Shield = 1 Missed Day:</strong> Protects one eligible missed study day and preserves your active streak.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-sky-600 font-bold">•</span>
                    <span><strong>Max 2 Shields:</strong> You can hold a maximum of <strong>2 shields</strong> simultaneously in your wallet.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-sky-600 font-bold">•</span>
                    <span><strong>Preserves Streak:</strong> Keeps your streak count safe. Does not count as a study session or advance streak count until your next qualifying test.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-sky-600 font-bold">•</span>
                    <span><strong>Single-Use Recovery:</strong> Each shield is consumed upon activation to protect the eligible missed day.</span>
                  </li>
                </>
              ) : isRetestDrill ? (
                <>
                  <li className="flex items-start gap-2">
                    <span className="text-indigo-600 font-bold">•</span>
                    <span><strong>Diagnostic Unlock:</strong> Provides immediate full-length mistake analysis and drill generation.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-indigo-600 font-bold">•</span>
                    <span><strong>Targeted Practice:</strong> Focuses specifically on weak topics identified during recent mock exams.</span>
                  </li>
                </>
              ) : isPhysical ? (
                <>
                  <li className="flex items-start gap-2">
                    <span className="text-emerald-600 font-bold">•</span>
                    <span><strong>Premium Merchandise:</strong> Official Courage Library study gear crafted for dedicated students.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-emerald-600 font-bold">•</span>
                    <span><strong>Free Express Shipping:</strong> Dispatched within 2–4 business days with end-to-end SMS &amp; web tracking.</span>
                  </li>
                </>
              ) : (
                <>
                  <li className="flex items-start gap-2">
                    <span className="text-amber-600 font-bold">•</span>
                    <span><strong>Instant Activation:</strong> Applied to your Courage Library account immediately upon confirmation.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-amber-600 font-bold">•</span>
                    <span><strong>Server Verified:</strong> Authoritative deduction from your CL Coin ledger.</span>
                  </li>
                </>
              )}
            </ul>
          </div>

          {/* Section: Your Redemption (Balance Shown ONLY HERE) */}
          <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-3 text-xs shadow-2xs">
            <h5 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 font-mono flex items-center justify-between">
              <span>Your Redemption Accounting</span>
              <span className="text-[10px] text-amber-700 font-extrabold font-mono">CL Ledger</span>
            </h5>

            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between text-slate-600">
                <span>Available Balance</span>
                <span className="font-bold text-slate-900 font-mono">{currentBalance.toLocaleString()} CL</span>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span>Reward Cost</span>
                <span className="font-bold text-amber-700 font-mono">- {cost.toLocaleString()} CL</span>
              </div>

              {canAfford ? (
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between font-bold text-sm">
                  <span className="text-slate-800">Remaining Balance After</span>
                  <span className="text-emerald-600 font-mono font-black">
                    {balanceAfter.toLocaleString()} CL
                  </span>
                </div>
              ) : (
                <div className="mt-2 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-[11px] space-y-1">
                  <div className="flex items-center justify-between font-bold">
                    <span className="flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                      <span>Insufficient Balance</span>
                    </span>
                    <span className="font-mono">Need {neededCoins.toLocaleString()} more CL</span>
                  </div>
                  <p className="text-[10px] text-rose-600">
                    Earn more CL Coins by taking daily practice tests, keeping your streak alive, and maintaining high accuracy.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Physical Delivery Form */}
          {isPhysical && canAfford && (
            <div className="pt-2 space-y-3 border-t border-slate-100">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <h5 className="text-xs font-bold uppercase tracking-wider text-slate-700">Delivery Address Details</h5>
              </div>

              <div className="grid grid-cols-2 gap-2.5 text-xs">
                <div>
                  <label className="block mb-1 font-medium text-slate-700">Full Name *</label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Candidate Name"
                    className="w-full px-3 py-2 border rounded-lg border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                    disabled={isSubmitting}
                  />
                </div>
                <div>
                  <label className="block mb-1 font-medium text-slate-700">Phone Number *</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="10-digit mobile"
                    className="w-full px-3 py-2 border rounded-lg border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                    disabled={isSubmitting}
                  />
                </div>
                <div className="col-span-2">
                  <label className="block mb-1 font-medium text-slate-700">Street / Flat / House Address *</label>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Complete residential address"
                    className="w-full px-3 py-2 border rounded-lg border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                    disabled={isSubmitting}
                  />
                </div>
                <div>
                  <label className="block mb-1 font-medium text-slate-700">City / Town</label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="City"
                    className="w-full px-3 py-2 border rounded-lg border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                    disabled={isSubmitting}
                  />
                </div>
                <div>
                  <label className="block mb-1 font-medium text-slate-700">State / UT</label>
                  <input
                    type="text"
                    value={stateName}
                    onChange={(e) => setStateName(e.target.value)}
                    placeholder="State"
                    className="w-full px-3 py-2 border rounded-lg border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                    disabled={isSubmitting}
                  />
                </div>
                <div>
                  <label className="block mb-1 font-medium text-slate-700">PIN Code *</label>
                  <input
                    type="text"
                    value={pincode}
                    onChange={(e) => setPincode(e.target.value)}
                    placeholder="6-digit PIN"
                    className="w-full px-3 py-2 border rounded-lg border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                    disabled={isSubmitting}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Error Message Alert */}
          {errorMsg && (
            <div className="p-3 text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2">
              <svg className="w-4 h-4 shrink-0 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50/70">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isSubmitting || !canAfford}
            className="inline-flex items-center gap-2 px-5 py-2 text-xs font-bold text-white transition-all bg-slate-900 hover:bg-slate-800 rounded-xl shadow-sm disabled:opacity-50 disabled:pointer-events-none"
          >
            {isSubmitting ? (
              <>
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>Processing...</span>
              </>
            ) : canAfford ? (
              <>
                <svg className="w-4 h-4 text-amber-400 fill-amber-400" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" />
                </svg>
                <span>Confirm Redemption</span>
              </>
            ) : (
              <span>Locked</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

