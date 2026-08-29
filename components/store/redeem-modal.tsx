"use client";

import React, { useState } from "react";
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
  const canAfford = currentBalance >= cost;

  const handleConfirm = async () => {
    if (!canAfford) {
      setErrorMsg(`Insufficient CL Coins. You need ${(cost - currentBalance).toLocaleString()} more CL.`);
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
      <div className="relative w-full max-w-lg overflow-hidden bg-white border shadow-2xl rounded-2xl border-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/70">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-amber-100 text-amber-700">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-slate-900">Confirm Reward Redemption</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1 text-slate-400 transition-colors rounded-lg hover:text-slate-600 hover:bg-slate-100 disabled:opacity-50"
            aria-label="Close dialog"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* Reward Summary Card */}
          <div className="p-4 border rounded-xl bg-slate-50/50 border-slate-200/80">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-bold tracking-wider uppercase text-amber-700">
                  {reward.rewardType.replace("_", " ")} REWARD
                </div>
                <h4 className="text-base font-bold text-slate-900">{reward.title}</h4>
                <p className="mt-1 text-xs text-slate-600 leading-relaxed">{reward.description}</p>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/10 text-amber-700 font-black text-sm shrink-0 border border-amber-500/20">
                <svg className="w-4 h-4 text-amber-600 fill-amber-500" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" />
                </svg>
                {cost.toLocaleString()} CL
              </div>
            </div>
          </div>

          {/* Balance Calculation Table */}
          <div className="p-3.5 rounded-xl border border-slate-100 bg-slate-50 text-xs space-y-2">
            <div className="flex items-center justify-between text-slate-600">
              <span>Your Current Balance</span>
              <span className="font-semibold text-slate-900">{currentBalance.toLocaleString()} CL</span>
            </div>
            <div className="flex items-center justify-between text-slate-600">
              <span>Reward Cost</span>
              <span className="font-semibold text-amber-700">- {cost.toLocaleString()} CL</span>
            </div>
            <div className="pt-2 border-t border-slate-200 flex items-center justify-between font-bold text-sm">
              <span className="text-slate-800">Remaining Balance After</span>
              <span className={balanceAfter >= 0 ? "text-emerald-600" : "text-rose-600"}>
                {balanceAfter.toLocaleString()} CL
              </span>
            </div>
          </div>

          {/* Physical Delivery Form */}
          {isPhysical && (
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
            className="inline-flex items-center gap-2 px-5 py-2 text-xs font-bold text-white transition-all bg-gradient-to-r from-amber-600 to-amber-700 rounded-xl shadow-sm hover:from-amber-700 hover:to-amber-800 disabled:opacity-50 disabled:pointer-events-none"
          >
            {isSubmitting ? (
              <>
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>Processing...</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                <span>Confirm Redemption</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
