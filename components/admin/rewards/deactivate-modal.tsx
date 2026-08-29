"use client";

import React, { useState } from "react";
import { AdminRewardCatalogItem } from "@/services/gamification.service";
import { toggleRewardActiveAction } from "@/app/admin/rewards/actions";

interface DeactivateModalProps {
  reward: AdminRewardCatalogItem | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (rewardId: string, newActiveStatus: boolean) => void;
}

export function DeactivateModal({
  reward,
  isOpen,
  onClose,
  onSuccess,
}: DeactivateModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen || !reward) return null;

  const willActivate = !reward.isActive;

  const handleToggle = async () => {
    setIsSubmitting(true);
    setErrorMsg(null);

    const res = await toggleRewardActiveAction(reward.id, willActivate);
    if (res.success) {
      onSuccess(reward.id, willActivate);
      onClose();
    } else {
      setErrorMsg(res.error || "Failed to update reward status");
    }
    setIsSubmitting(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-md overflow-hidden bg-white border shadow-2xl rounded-2xl border-slate-200">
        <div className="p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                willActivate ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
              }`}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                {willActivate ? `Activate ${reward.title}?` : `Deactivate ${reward.title}?`}
              </h3>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                {willActivate
                  ? "This reward will become visible and redeemable in the student Store."
                  : "Students will no longer be able to redeem this reward. Existing claims will remain unaffected."}
              </p>
            </div>
          </div>

          {errorMsg && (
            <div className="p-3 text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-xl">
              {errorMsg}
            </div>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleToggle}
              disabled={isSubmitting}
              className={`px-4 py-2 text-xs font-bold text-white rounded-xl shadow-sm transition-all disabled:opacity-50 ${
                willActivate
                  ? "bg-emerald-600 hover:bg-emerald-700"
                  : "bg-amber-600 hover:bg-amber-700"
              }`}
            >
              {isSubmitting
                ? "Updating..."
                : willActivate
                ? "Activate Reward"
                : "Deactivate Reward"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
