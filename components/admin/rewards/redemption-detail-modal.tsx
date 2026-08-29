"use client";

import React, { useState } from "react";
import Image from "next/image";
import { AdminRedemptionRecord } from "@/services/gamification.service";
import { updateRedemptionStatusAction } from "@/app/admin/rewards/actions";

interface RedemptionDetailModalProps {
  redemption: AdminRedemptionRecord | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (updated: AdminRedemptionRecord) => void;
}

export function RedemptionDetailModal({
  redemption,
  isOpen,
  onClose,
  onSuccess,
}: RedemptionDetailModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [status, setStatus] = useState<string>(redemption?.status || "REQUESTED");
  const [trackingCode, setTrackingCode] = useState<string>(redemption?.trackingCode || "");
  const [adminNotes, setAdminNotes] = useState<string>(redemption?.adminNotes || "");

  // Update local state when redemption changes
  React.useEffect(() => {
    if (redemption) {
      setStatus(redemption.status);
      setTrackingCode(redemption.trackingCode || "");
      setAdminNotes(redemption.adminNotes || "");
      setErrorMsg(null);
    }
  }, [redemption]);

  if (!isOpen || !redemption) return null;

  const isPhysical = redemption.rewardType === "PHYSICAL";

  const handleUpdate = async () => {
    setIsSubmitting(true);
    setErrorMsg(null);

    const res = await updateRedemptionStatusAction(redemption.id, {
      status,
      trackingCode: trackingCode.trim() || undefined,
      adminNotes: adminNotes.trim() || undefined,
    });

    if (res.success) {
      onSuccess({
        ...redemption,
        status: status as AdminRedemptionRecord["status"],
        trackingCode: trackingCode.trim() || null,
        adminNotes: adminNotes.trim() || null,
        fulfilledAt: status === "FULFILLED" ? new Date().toISOString() : redemption.fulfilledAt,
      });
      onClose();
    } else {
      setErrorMsg(res.error || "Failed to update redemption status");
    }
    setIsSubmitting(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl overflow-hidden bg-white border shadow-2xl rounded-2xl border-slate-200">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/70">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Redemption Claim Details</h3>
              <p className="text-[11px] font-mono text-slate-400">Claim ID: {redemption.id.slice(0, 18)}...</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
            aria-label="Close modal"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto text-xs">
          {/* Reward & Candidate Overview */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl border border-slate-200/80 bg-slate-50/50">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Student Details
              </span>
              <p className="font-bold text-slate-900 text-sm">{redemption.userName}</p>
              <p className="text-slate-600">{redemption.userEmail || "No email available"}</p>
              <p className="text-[10px] font-mono text-slate-400 mt-1">User ID: {redemption.userId.slice(0, 13)}...</p>
            </div>

            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Claimed Reward
              </span>
              <div className="flex items-center gap-2.5">
                {redemption.rewardImageUrl ? (
                  <div className="w-10 h-10 rounded-lg overflow-hidden border border-slate-200 relative shrink-0">
                    <Image src={redemption.rewardImageUrl} alt={redemption.rewardTitle} fill className="object-cover" />
                  </div>
                ) : null}
                <div>
                  <p className="font-bold text-slate-900">{redemption.rewardTitle}</p>
                  <div className="flex items-center gap-1.5 mt-0.5 text-amber-700 font-bold">
                    <svg className="w-3.5 h-3.5 text-amber-600 fill-amber-500" viewBox="0 0 24 24">
                      <circle cx="12" cy="12" r="10" />
                    </svg>
                    <span>{redemption.coinsSpent.toLocaleString()} CL Coins</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Delivery Details (If Physical) */}
          {isPhysical && (
            <div className="p-4 rounded-xl border border-slate-200/80 bg-slate-50/30 space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                Shipping &amp; Delivery Address
              </span>
              <div className="grid grid-cols-2 gap-2 text-slate-700">
                <div>
                  <span className="text-slate-400 block text-[10px]">Recipient Name</span>
                  <span className="font-semibold">{redemption.shippingFullName || redemption.userName}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Phone Number</span>
                  <span className="font-semibold">{redemption.shippingPhone || "Not provided"}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-slate-400 block text-[10px]">Street Address</span>
                  <span className="font-semibold">{redemption.shippingAddress || "Not provided"}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">City / State</span>
                  <span className="font-semibold">
                    {redemption.shippingCity || "N/A"}, {redemption.shippingState || "N/A"}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">PIN Code</span>
                  <span className="font-semibold">{redemption.shippingPincode || "N/A"}</span>
                </div>
              </div>
            </div>
          )}

          {/* Fulfillment Status Management */}
          <div className="space-y-3 pt-2 border-t border-slate-100">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Fulfillment Status &amp; Tracking
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block mb-1 font-semibold text-slate-700">Order Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-semibold bg-white border rounded-xl border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  disabled={isSubmitting}
                >
                  <option value="REQUESTED">REQUESTED (Pending Review)</option>
                  <option value="PROCESSING">PROCESSING (In Packaging)</option>
                  <option value="SHIPPED">SHIPPED (In Transit)</option>
                  <option value="FULFILLED">FULFILLED (Delivered / Completed)</option>
                  <option value="REJECTED">REJECTED (Cancelled)</option>
                </select>
              </div>

              <div>
                <label className="block mb-1 font-semibold text-slate-700">Courier / Tracking Code</label>
                <input
                  type="text"
                  value={trackingCode}
                  onChange={(e) => setTrackingCode(e.target.value)}
                  placeholder="e.g. DELHIVERY-19823902"
                  className="w-full px-3 py-2 text-xs bg-white border rounded-xl border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  disabled={isSubmitting}
                />
              </div>

              <div className="col-span-1 sm:col-span-2">
                <label className="block mb-1 font-semibold text-slate-700">Internal Admin Notes</label>
                <textarea
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  rows={2}
                  placeholder="Add packaging notes or dispatch remarks..."
                  className="w-full px-3 py-2 text-xs bg-white border rounded-xl border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  disabled={isSubmitting}
                />
              </div>
            </div>
          </div>

          {errorMsg && (
            <div className="p-3 text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-xl">
              {errorMsg}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-end gap-2.5 px-6 py-4 border-t border-slate-100 bg-slate-50/70">
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
            onClick={handleUpdate}
            disabled={isSubmitting}
            className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-sm transition-all disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            {isSubmitting ? "Updating..." : "Save Fulfillment Status"}
          </button>
        </div>
      </div>
    </div>
  );
}
