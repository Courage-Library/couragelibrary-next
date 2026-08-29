"use client";

import React, { useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  AdminRewardsStudioData,
  AdminRewardCatalogItem,
  AdminRedemptionRecord,
} from "@/services/gamification.service";
import { updateRewardPolicyAction } from "@/app/admin/gamification/actions";
import { RewardEditorModal } from "@/components/admin/rewards/reward-editor-modal";
import { DeactivateModal } from "@/components/admin/rewards/deactivate-modal";
import { RedemptionDetailModal } from "@/components/admin/rewards/redemption-detail-modal";

interface RewardsStudioViewProps {
  initialData: AdminRewardsStudioData;
}

export function RewardsStudioView({ initialData }: RewardsStudioViewProps) {
  const [activeTab, setActiveTab] = useState<"CATALOG" | "REDEMPTIONS" | "INVENTORY" | "POLICIES">("CATALOG");

  // Local state for interactive mutations
  const [catalog, setCatalog] = useState<AdminRewardCatalogItem[]>(initialData.catalog);
  const [redemptions, setRedemptions] = useState<AdminRedemptionRecord[]>(initialData.redemptions);
  const [kpis, setKpis] = useState(initialData.kpis);

  // Filters for Catalog
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogCategory, setCatalogCategory] = useState("ALL");
  const [catalogStatus, setCatalogStatus] = useState("ALL");
  const [catalogStock, setCatalogStock] = useState("ALL");

  // Filters for Redemptions
  const [redemptionSearch, setRedemptionSearch] = useState("");
  const [redemptionStatusFilter, setRedemptionStatusFilter] = useState("ALL");

  // Modals state
  const [editorModalOpen, setEditorModalOpen] = useState(false);
  const [editingReward, setEditingReward] = useState<AdminRewardCatalogItem | null>(null);

  const [deactivateModalOpen, setDeactivateModalOpen] = useState(false);
  const [deactivatingReward, setDeactivatingReward] = useState<AdminRewardCatalogItem | null>(null);

  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [viewingRedemption, setViewingRedemption] = useState<AdminRedemptionRecord | null>(null);

  // Toast feedback
  const [toastMessage, setToastMessage] = useState<{ text: string; isError?: boolean } | null>(null);

  // Policy editing state
  const [editingPolicy, setEditingPolicy] = useState<{
    policyCode: string;
    baseCoins: number;
    performanceBonusCoins: number;
    consistencyBonusCoins: number;
  } | null>(null);
  const [isPendingPolicy, startPolicyTransition] = useTransition();

  const showToast = (text: string, isError = false) => {
    setToastMessage({ text, isError });
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Filtered Catalog Items
  const filteredCatalog = catalog.filter((item) => {
    const matchesSearch =
      item.title.toLowerCase().includes(catalogSearch.toLowerCase()) ||
      item.description.toLowerCase().includes(catalogSearch.toLowerCase());

    const matchesCategory =
      catalogCategory === "ALL" ||
      (catalogCategory === "PHYSICAL" && item.rewardType === "PHYSICAL") ||
      (catalogCategory === "DIGITAL" && (item.rewardType === "DIGITAL" || item.rewardType === "FEATURE_UNLOCK"));

    const matchesStatus =
      catalogStatus === "ALL" ||
      (catalogStatus === "ACTIVE" && item.isActive) ||
      (catalogStatus === "INACTIVE" && !item.isActive);

    const matchesStock =
      catalogStock === "ALL" ||
      (catalogStock === "IN_STOCK" && (item.stockQuantity === -1 || item.stockQuantity > 10)) ||
      (catalogStock === "LOW_STOCK" && item.stockQuantity > 0 && item.stockQuantity <= 10) ||
      (catalogStock === "OUT_OF_STOCK" && item.stockQuantity === 0);

    return matchesSearch && matchesCategory && matchesStatus && matchesStock;
  });

  // Filtered Redemptions
  const filteredRedemptions = redemptions.filter((claim) => {
    const matchesSearch =
      claim.userName.toLowerCase().includes(redemptionSearch.toLowerCase()) ||
      claim.rewardTitle.toLowerCase().includes(redemptionSearch.toLowerCase()) ||
      claim.id.toLowerCase().includes(redemptionSearch.toLowerCase());

    const matchesStatus =
      redemptionStatusFilter === "ALL" || claim.status === redemptionStatusFilter;

    return matchesSearch && matchesStatus;
  });

  // Handler for successful reward create/edit
  const handleRewardSaved = (savedReward: AdminRewardCatalogItem) => {
    const exists = catalog.some((c) => c.id === savedReward.id);
    if (exists) {
      setCatalog(catalog.map((c) => (c.id === savedReward.id ? savedReward : c)));
      showToast(`Reward "${savedReward.title}" updated successfully.`);
    } else {
      setCatalog([...catalog, savedReward]);
      setKpis({ ...kpis, activeRewardsCount: kpis.activeRewardsCount + 1 });
      showToast(`Reward "${savedReward.title}" created successfully.`);
    }
  };

  // Handler for active toggle
  const handleActiveToggled = (rewardId: string, newStatus: boolean) => {
    setCatalog(
      catalog.map((c) => (c.id === rewardId ? { ...c, isActive: newStatus } : c))
    );
    const updatedActiveCount = catalog.filter((c) =>
      c.id === rewardId ? newStatus : c.isActive
    ).length;
    setKpis({ ...kpis, activeRewardsCount: updatedActiveCount });
    showToast(newStatus ? "Reward activated successfully." : "Reward deactivated successfully.");
  };

  // Handler for redemption update
  const handleRedemptionUpdated = (updated: AdminRedemptionRecord) => {
    setRedemptions(redemptions.map((r) => (r.id === updated.id ? updated : r)));
    const pendingCount = redemptions
      .map((r) => (r.id === updated.id ? updated : r))
      .filter((cl) => cl.status === "REQUESTED" || cl.status === "PROCESSING").length;
    setKpis({ ...kpis, pendingFulfillmentCount: pendingCount });
    showToast(`Redemption status updated to ${updated.status}.`);
  };

  const handleSavePolicy = (policyCode: string) => {
    if (!editingPolicy) return;
    startPolicyTransition(async () => {
      const res = await updateRewardPolicyAction(policyCode, {
        baseCoins: Number(editingPolicy.baseCoins),
        performanceBonusCoins: Number(editingPolicy.performanceBonusCoins),
        consistencyBonusCoins: Number(editingPolicy.consistencyBonusCoins),
      });

      if (res.success) {
        showToast(`Policy ${policyCode} updated successfully.`);
        setEditingPolicy(null);
      } else {
        showToast(res.error || "Failed to update policy", true);
      }
    });
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed bottom-6 right-6 z-50 p-4 rounded-2xl border shadow-xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-3 duration-200 ${
            toastMessage.isError
              ? "bg-rose-50 border-rose-200 text-rose-800"
              : "bg-emerald-50 border-emerald-200 text-emerald-800"
          }`}
        >
          <div
            className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
              toastMessage.isError ? "bg-rose-100 text-rose-600" : "bg-emerald-100 text-emerald-600"
            }`}
          >
            {toastMessage.isError ? (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            )}
          </div>
          <span className="text-xs font-bold">{toastMessage.text}</span>
        </div>
      )}

      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <svg className="w-6 h-6 text-amber-500 fill-amber-400" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" />
            </svg>
            Reward &amp; Store Management
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-1">
            Manage CL Coin rewards, merchandise, inventory, redemption and student benefits.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Link
            href="/store"
            target="_blank"
            className="px-3 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors inline-flex items-center gap-1.5 shadow-2xs"
          >
            <span>Student Store</span>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </Link>

          <button
            type="button"
            onClick={() => {
              setEditingReward(null);
              setEditorModalOpen(true);
            }}
            className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-sm transition-all inline-flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            <span>Create New Reward</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        {/* Circulation */}
        <div className="p-4 bg-white border rounded-2xl border-slate-200/80 shadow-2xs space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono block">
            Circulation
          </span>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-black text-slate-900 font-mono">
              {kpis.totalCoinsInCirculation.toLocaleString()}
            </span>
            <span className="text-[10px] font-bold text-amber-600">CL</span>
          </div>
          <span className="text-[10px] text-slate-500 font-medium block">In student wallets</span>
        </div>

        {/* Lifetime Issued */}
        <div className="p-4 bg-white border rounded-2xl border-slate-200/80 shadow-2xs space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono block">
            Coins Issued
          </span>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-black text-emerald-600 font-mono">
              +{kpis.lifetimeCoinsIssued.toLocaleString()}
            </span>
            <span className="text-[10px] font-bold text-emerald-600">CL</span>
          </div>
          <span className="text-[10px] text-slate-500 font-medium block">Lifetime earned</span>
        </div>

        {/* Lifetime Spent */}
        <div className="p-4 bg-white border rounded-2xl border-slate-200/80 shadow-2xs space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono block">
            Coins Spent
          </span>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-black text-rose-600 font-mono">
              -{kpis.totalCoinsSpent.toLocaleString()}
            </span>
            <span className="text-[10px] font-bold text-rose-600">CL</span>
          </div>
          <span className="text-[10px] text-slate-500 font-medium block">Total redemptions</span>
        </div>

        {/* Active Rewards */}
        <div className="p-4 bg-white border rounded-2xl border-slate-200/80 shadow-2xs space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono block">
            Active Catalog
          </span>
          <span className="text-xl font-black text-blue-600 font-mono block">
            {kpis.activeRewardsCount}
          </span>
          <span className="text-[10px] text-slate-500 font-medium block">Live items in Store</span>
        </div>

        {/* Total Redemptions */}
        <div className="p-4 bg-white border rounded-2xl border-slate-200/80 shadow-2xs space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono block">
            Redemptions
          </span>
          <span className="text-xl font-black text-indigo-600 font-mono block">
            {kpis.totalRedemptionsCount}
          </span>
          <span className="text-[10px] text-slate-500 font-medium block">Total claims made</span>
        </div>

        {/* Pending Fulfillment */}
        <div className="p-4 bg-white border rounded-2xl border-slate-200/80 shadow-2xs space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono block">
            Pending Dispatch
          </span>
          <span className="text-xl font-black text-amber-600 font-mono block">
            {kpis.pendingFulfillmentCount}
          </span>
          <span className="text-[10px] text-slate-500 font-medium block">Needs processing</span>
        </div>
      </div>

      {/* Main Studio Navigation Tabs */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-2">
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setActiveTab("CATALOG")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === "CATALOG"
                ? "bg-slate-900 text-white shadow-xs"
                : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200/80"
            }`}
          >
            Reward Catalog ({catalog.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("REDEMPTIONS")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all relative ${
              activeTab === "REDEMPTIONS"
                ? "bg-slate-900 text-white shadow-xs"
                : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200/80"
            }`}
          >
            <span>Redemptions &amp; Fulfillment</span>
            {kpis.pendingFulfillmentCount > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-amber-500 text-white text-[9px] font-extrabold">
                {kpis.pendingFulfillmentCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("INVENTORY")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === "INVENTORY"
                ? "bg-slate-900 text-white shadow-xs"
                : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200/80"
            }`}
          >
            Inventory Control
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("POLICIES")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === "POLICIES"
                ? "bg-slate-900 text-white shadow-xs"
                : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200/80"
            }`}
          >
            Economy Policies &amp; Ledger
          </button>
        </div>
      </div>

      {/* TAB 1: REWARD CATALOG */}
      {activeTab === "CATALOG" && (
        <div className="space-y-4">
          {/* Search & Filters */}
          <div className="p-4 bg-white border rounded-2xl border-slate-200/80 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <svg className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={catalogSearch}
                onChange={(e) => setCatalogSearch(e.target.value)}
                placeholder="Search rewards by name or description..."
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <select
                value={catalogCategory}
                onChange={(e) => setCatalogCategory(e.target.value)}
                className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-700 focus:outline-none"
              >
                <option value="ALL">All Categories</option>
                <option value="PHYSICAL">Physical Merchandise</option>
                <option value="DIGITAL">Digital &amp; Benefits</option>
              </select>

              <select
                value={catalogStatus}
                onChange={(e) => setCatalogStatus(e.target.value)}
                className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-700 focus:outline-none"
              >
                <option value="ALL">All Statuses</option>
                <option value="ACTIVE">Active (Live)</option>
                <option value="INACTIVE">Inactive (Hidden)</option>
              </select>

              <select
                value={catalogStock}
                onChange={(e) => setCatalogStock(e.target.value)}
                className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-700 focus:outline-none"
              >
                <option value="ALL">All Stock Levels</option>
                <option value="IN_STOCK">In Stock</option>
                <option value="LOW_STOCK">Low Stock (&le;10)</option>
                <option value="OUT_OF_STOCK">Out of Stock</option>
              </select>
            </div>
          </div>

          {/* Catalog Items Table */}
          {filteredCatalog.length === 0 ? (
            <div className="p-12 text-center bg-white border rounded-2xl border-slate-200/80 space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              </div>
              <h3 className="text-base font-bold text-slate-900">No Rewards Found</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                No catalog rewards match your current search or filter criteria. Create your first reward to get started.
              </p>
              <button
                type="button"
                onClick={() => {
                  setEditingReward(null);
                  setEditorModalOpen(true);
                }}
                className="px-4 py-2 text-xs font-bold text-white bg-blue-600 rounded-xl shadow-sm hover:bg-blue-700 transition-colors"
              >
                + Create Reward
              </button>
            </div>
          ) : (
            <div className="bg-white border rounded-2xl border-slate-200/80 overflow-hidden shadow-2xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="px-5 py-3.5">Product &amp; Reward</th>
                      <th className="px-4 py-3.5">Category</th>
                      <th className="px-4 py-3.5">Price</th>
                      <th className="px-4 py-3.5">Inventory</th>
                      <th className="px-4 py-3.5">Redemptions</th>
                      <th className="px-4 py-3.5">Status</th>
                      <th className="px-5 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {filteredCatalog.map((item) => {
                      const isLowStock = item.stockQuantity > 0 && item.stockQuantity <= 10;
                      const isOutOfStock = item.stockQuantity === 0;

                      return (
                        <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden relative shrink-0 flex items-center justify-center">
                                {item.imageUrl ? (
                                  <Image src={item.imageUrl} alt={item.title} fill className="object-cover" />
                                ) : (
                                  <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                  </svg>
                                )}
                              </div>
                              <div>
                                <h4 className="font-bold text-slate-900 text-sm">{item.title}</h4>
                                <p className="text-slate-500 line-clamp-1 max-w-xs text-[11px] mt-0.5">
                                  {item.description}
                                </p>
                                <span className="font-mono text-[10px] text-slate-400 block mt-0.5">
                                  /{item.slug}
                                </span>
                              </div>
                            </div>
                          </td>

                          <td className="px-4 py-4">
                            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-200">
                              {item.rewardType.replace("_", " ")}
                            </span>
                          </td>

                          <td className="px-4 py-4 font-mono">
                            <div className="flex items-center gap-1 font-bold text-amber-700">
                              <svg className="w-3.5 h-3.5 text-amber-600 fill-amber-500 shrink-0" viewBox="0 0 24 24">
                                <circle cx="12" cy="12" r="10" />
                              </svg>
                              <span>{item.coinCost.toLocaleString()} CL</span>
                            </div>
                          </td>

                          <td className="px-4 py-4">
                            {item.stockQuantity === -1 ? (
                              <span className="text-[11px] font-semibold text-slate-600">Unlimited</span>
                            ) : isOutOfStock ? (
                              <span className="px-2 py-0.5 rounded-md bg-rose-100 text-rose-800 font-bold text-[10px]">
                                Out of Stock (0)
                              </span>
                            ) : isLowStock ? (
                              <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 font-bold text-[10px]">
                                Low ({item.stockQuantity} left)
                              </span>
                            ) : (
                              <span className="text-[11px] font-semibold text-slate-800">
                                {item.stockQuantity} in stock
                              </span>
                            )}
                          </td>

                          <td className="px-4 py-4 font-mono font-semibold text-slate-700">
                            {item.totalRedemptions} claim{item.totalRedemptions !== 1 ? "s" : ""}
                          </td>

                          <td className="px-4 py-4">
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                                item.isActive
                                  ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                                  : "bg-slate-100 text-slate-500 border border-slate-200"
                              }`}
                            >
                              {item.isActive ? "Active" : "Inactive"}
                            </span>
                          </td>

                          <td className="px-5 py-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingReward(item);
                                  setEditorModalOpen(true);
                                }}
                                className="px-2.5 py-1 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                              >
                                Edit
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setDeactivatingReward(item);
                                  setDeactivateModalOpen(true);
                                }}
                                className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-colors ${
                                  item.isActive
                                    ? "text-amber-700 bg-amber-50 hover:bg-amber-100"
                                    : "text-emerald-700 bg-emerald-50 hover:bg-emerald-100"
                                }`}
                              >
                                {item.isActive ? "Deactivate" : "Activate"}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: REDEMPTIONS & FULFILLMENT */}
      {activeTab === "REDEMPTIONS" && (
        <div className="space-y-4">
          <div className="p-4 bg-white border rounded-2xl border-slate-200/80 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <svg className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={redemptionSearch}
                onChange={(e) => setRedemptionSearch(e.target.value)}
                placeholder="Search by candidate name or reward..."
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto text-xs pb-1">
              {["ALL", "REQUESTED", "PROCESSING", "SHIPPED", "FULFILLED", "REJECTED"].map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setRedemptionStatusFilter(st)}
                  className={`px-3 py-1 rounded-lg font-bold text-[11px] transition-all ${
                    redemptionStatusFilter === st
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          {filteredRedemptions.length === 0 ? (
            <div className="p-12 text-center bg-white border rounded-2xl border-slate-200/80 space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <h3 className="text-base font-bold text-slate-900">No Redemptions Found</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                No student redemption claims match the selected filter.
              </p>
            </div>
          ) : (
            <div className="bg-white border rounded-2xl border-slate-200/80 overflow-hidden shadow-2xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="px-5 py-3.5">Candidate</th>
                      <th className="px-4 py-3.5">Reward Claimed</th>
                      <th className="px-4 py-3.5">Cost</th>
                      <th className="px-4 py-3.5">Date</th>
                      <th className="px-4 py-3.5">Status</th>
                      <th className="px-5 py-3.5 text-right">Fulfillment</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {filteredRedemptions.map((claim) => (
                      <tr key={claim.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-5 py-4">
                          <p className="font-bold text-slate-900">{claim.userName}</p>
                          <p className="text-slate-500 text-[11px]">{claim.userEmail || claim.userId.slice(0, 12)}</p>
                        </td>

                        <td className="px-4 py-4">
                          <p className="font-bold text-slate-900">{claim.rewardTitle}</p>
                          <span className="text-[10px] text-slate-400 uppercase font-mono">
                            {claim.rewardType}
                          </span>
                        </td>

                        <td className="px-4 py-4 font-mono font-bold text-amber-700">
                          {claim.coinsSpent.toLocaleString()} CL
                        </td>

                        <td className="px-4 py-4 text-slate-500">
                          {new Date(claim.claimedAt).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </td>

                        <td className="px-4 py-4">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                              claim.status === "FULFILLED"
                                ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                                : claim.status === "SHIPPED"
                                ? "bg-blue-100 text-blue-800 border border-blue-200"
                                : claim.status === "PROCESSING"
                                ? "bg-indigo-100 text-indigo-800 border border-indigo-200"
                                : claim.status === "REJECTED"
                                ? "bg-rose-100 text-rose-800 border border-rose-200"
                                : "bg-amber-100 text-amber-800 border border-amber-200"
                            }`}
                          >
                            {claim.status}
                          </span>
                        </td>

                        <td className="px-5 py-4 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setViewingRedemption(claim);
                              setDetailModalOpen(true);
                            }}
                            className="px-3 py-1 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                          >
                            View &amp; Fulfill
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: INVENTORY CONTROL */}
      {activeTab === "INVENTORY" && (
        <div className="space-y-4">
          <div className="bg-white border rounded-2xl border-slate-200/80 overflow-hidden shadow-2xs">
            <div className="p-4 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">Physical Merchandise Inventory &amp; Restock Alerts</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Real-time stock tracking for physical reward items. Low stock threshold alert triggers at &le;10 units.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="px-5 py-3.5">Merchandise Item</th>
                    <th className="px-4 py-3.5">Category</th>
                    <th className="px-4 py-3.5">Current Stock</th>
                    <th className="px-4 py-3.5">Total Redeemed</th>
                    <th className="px-4 py-3.5">Inventory Health</th>
                    <th className="px-5 py-3.5 text-right">Manage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {catalog
                    .filter((c) => c.rewardType === "PHYSICAL")
                    .map((item) => {
                      const isLowStock = item.stockQuantity > 0 && item.stockQuantity <= 10;
                      const isOutOfStock = item.stockQuantity === 0;

                      return (
                        <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="px-5 py-4">
                            <p className="font-bold text-slate-900">{item.title}</p>
                            <p className="text-slate-500 text-[11px]">{item.description}</p>
                          </td>

                          <td className="px-4 py-4 font-semibold text-slate-600">Physical Merchandise</td>

                          <td className="px-4 py-4 font-mono font-bold text-slate-900 text-sm">
                            {item.stockQuantity === -1 ? "Unlimited" : `${item.stockQuantity} units`}
                          </td>

                          <td className="px-4 py-4 font-mono text-slate-700 font-semibold">
                            {item.totalRedemptions} units dispatched
                          </td>

                          <td className="px-4 py-4">
                            <span
                              className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                                isOutOfStock
                                  ? "bg-rose-100 text-rose-800"
                                  : isLowStock
                                  ? "bg-amber-100 text-amber-800"
                                  : "bg-emerald-100 text-emerald-800"
                              }`}
                            >
                              {isOutOfStock ? "Out of Stock" : isLowStock ? "Low Stock Alert" : "Healthy Stock"}
                            </span>
                          </td>

                          <td className="px-5 py-4 text-right">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingReward(item);
                                setEditorModalOpen(true);
                              }}
                              className="px-3 py-1 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                            >
                              Adjust Stock
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: ECONOMY POLICIES & LEDGER */}
      {activeTab === "POLICIES" && (
        <div className="space-y-6">
          {/* Reward Policies Table */}
          <div className="bg-white border rounded-2xl border-slate-200/80 overflow-hidden shadow-2xs">
            <div className="p-4 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">Authoritative Reward Policies</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Database-backed emission rules for mock completion, accuracy slabs, and streaks.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="px-5 py-3.5">Policy Code</th>
                    <th className="px-4 py-3.5">Event Type</th>
                    <th className="px-4 py-3.5">Base Coins</th>
                    <th className="px-4 py-3.5">Performance Bonus</th>
                    <th className="px-4 py-3.5">Streak Bonus</th>
                    <th className="px-5 py-3.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {initialData.rewardPolicies.map((pol) => {
                    const isEditingThis = editingPolicy?.policyCode === pol.policyCode;
                    return (
                      <tr key={pol.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-5 py-4 font-mono font-bold text-slate-900">{pol.policyCode}</td>
                        <td className="px-4 py-4">{pol.eventType}</td>
                        <td className="px-4 py-4 font-mono">
                          {isEditingThis ? (
                            <input
                              type="number"
                              min={0}
                              value={editingPolicy.baseCoins}
                              onChange={(e) =>
                                setEditingPolicy({ ...editingPolicy, baseCoins: Number(e.target.value) })
                              }
                              className="w-16 px-2 py-1 bg-white border border-blue-500 rounded text-xs"
                            />
                          ) : (
                            <span className="font-bold text-amber-700">+{pol.baseCoins} CL</span>
                          )}
                        </td>
                        <td className="px-4 py-4 font-mono">
                          {isEditingThis ? (
                            <input
                              type="number"
                              min={0}
                              value={editingPolicy.performanceBonusCoins}
                              onChange={(e) =>
                                setEditingPolicy({
                                  ...editingPolicy,
                                  performanceBonusCoins: Number(e.target.value),
                                })
                              }
                              className="w-16 px-2 py-1 bg-white border border-blue-500 rounded text-xs"
                            />
                          ) : (
                            <span>Up to +{pol.performanceBonusCoins} CL</span>
                          )}
                        </td>
                        <td className="px-4 py-4 font-mono">
                          {isEditingThis ? (
                            <input
                              type="number"
                              min={0}
                              value={editingPolicy.consistencyBonusCoins}
                              onChange={(e) =>
                                setEditingPolicy({
                                  ...editingPolicy,
                                  consistencyBonusCoins: Number(e.target.value),
                                })
                              }
                              className="w-16 px-2 py-1 bg-white border border-blue-500 rounded text-xs"
                            />
                          ) : (
                            <span>+{pol.consistencyBonusCoins} CL</span>
                          )}
                        </td>
                        <td className="px-5 py-4 text-right">
                          {isEditingThis ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => setEditingPolicy(null)}
                                className="px-2.5 py-1 text-xs font-bold bg-slate-100 rounded-lg text-slate-600"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSavePolicy(pol.policyCode)}
                                disabled={isPendingPolicy}
                                className="px-3 py-1 text-xs font-bold bg-emerald-600 text-white rounded-lg"
                              >
                                Save
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                setEditingPolicy({
                                  policyCode: pol.policyCode,
                                  baseCoins: pol.baseCoins,
                                  performanceBonusCoins: pol.performanceBonusCoins,
                                  consistencyBonusCoins: pol.consistencyBonusCoins,
                                })
                              }
                              className="px-2.5 py-1 text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors"
                            >
                              Edit
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Master Ledger Sample */}
          <div className="bg-white border rounded-2xl border-slate-200/80 overflow-hidden shadow-2xs">
            <div className="p-4 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">Recent Immutable Coin Ledger Transactions</h3>
              <p className="text-xs text-slate-500 mt-0.5">Authoritative financial double-entry records.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="px-5 py-3.5">Candidate</th>
                    <th className="px-4 py-3.5">Amount</th>
                    <th className="px-4 py-3.5">Direction</th>
                    <th className="px-4 py-3.5">Reason Code</th>
                    <th className="px-4 py-3.5">Balance After</th>
                    <th className="px-5 py-3.5">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {initialData.recentLedger.slice(0, 20).map((l) => (
                    <tr key={l.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-5 py-3 font-sans font-medium text-slate-900">
                        {l.userName || l.userId.slice(0, 10)}
                      </td>
                      <td className={`px-4 py-3 font-bold ${l.direction === "CREDIT" ? "text-emerald-600" : "text-rose-600"}`}>
                        {l.direction === "CREDIT" ? `+${l.amount}` : `-${l.amount}`} CL
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${l.direction === "CREDIT" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                          {l.direction}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{l.reasonCode}</td>
                      <td className="px-4 py-3 font-bold text-slate-900">{l.balanceAfter} CL</td>
                      <td className="px-5 py-3 text-slate-400 text-[11px] font-sans">
                        {new Date(l.createdAt).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Reward Editor Modal */}
      <RewardEditorModal
        reward={editingReward}
        isOpen={editorModalOpen}
        onClose={() => {
          setEditorModalOpen(false);
          setEditingReward(null);
        }}
        onSuccess={handleRewardSaved}
      />

      {/* Deactivate Modal */}
      <DeactivateModal
        reward={deactivatingReward}
        isOpen={deactivateModalOpen}
        onClose={() => {
          setDeactivateModalOpen(false);
          setDeactivatingReward(null);
        }}
        onSuccess={handleActiveToggled}
      />

      {/* Redemption Detail Modal */}
      <RedemptionDetailModal
        redemption={viewingRedemption}
        isOpen={detailModalOpen}
        onClose={() => {
          setDetailModalOpen(false);
          setViewingRedemption(null);
        }}
        onSuccess={handleRedemptionUpdated}
      />
    </div>
  );
}
