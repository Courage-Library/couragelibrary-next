"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import { AdminRewardCatalogItem } from "@/services/gamification.service";
import { createRewardAction, updateRewardAction, uploadRewardImageAction } from "@/app/admin/rewards/actions";
import { generateRewardImageBrief, GeneratedImageBrief } from "@/lib/admin/ai-image-brief";

interface RewardEditorModalProps {
  reward: AdminRewardCatalogItem | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (savedReward: AdminRewardCatalogItem) => void;
}

export function RewardEditorModal({
  reward,
  isOpen,
  onClose,
  onSuccess,
}: RewardEditorModalProps) {
  const isEditing = Boolean(reward);

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [rewardType, setRewardType] = useState<string>("PHYSICAL");
  const [coinCost, setCoinCost] = useState<number>(1000);
  const [isUnlimitedStock, setIsUnlimitedStock] = useState<boolean>(false);
  const [stockQuantity, setStockQuantity] = useState<number>(50);
  const [imageUrl, setImageUrl] = useState<string>("");
  const [isActive, setIsActive] = useState<boolean>(true);
  const [displayOrder, setDisplayOrder] = useState<number>(1);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // AI Image Brief State
  const [aiBrief, setAiBrief] = useState<GeneratedImageBrief | null>(null);
  const [copiedType, setCopiedType] = useState<string | null>(null);

  useEffect(() => {
    if (reward) {
      setTitle(reward.title);
      setSlug(reward.slug);
      setDescription(reward.description);
      setRewardType(reward.rewardType);
      setCoinCost(reward.coinCost);
      setIsUnlimitedStock(reward.stockQuantity === -1);
      setStockQuantity(reward.stockQuantity === -1 ? 50 : reward.stockQuantity);
      setImageUrl(reward.imageUrl || "");
      setIsActive(reward.isActive);
      setDisplayOrder(reward.displayOrder);
      setAiBrief(null);
    } else {
      setTitle("");
      setSlug("");
      setDescription("");
      setRewardType("PHYSICAL");
      setCoinCost(1000);
      setIsUnlimitedStock(false);
      setStockQuantity(50);
      setImageUrl("");
      setIsActive(true);
      setDisplayOrder(1);
      setAiBrief(null);
    }
    setErrorMsg(null);
  }, [reward, isOpen]);

  if (!isOpen) return null;

  const handleTitleChange = (val: string) => {
    setTitle(val);
    if (!isEditing) {
      setSlug(
        val
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)+/g, "")
      );
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingImage(true);
    setErrorMsg(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("rewardId", reward?.id || "new");

    const res = await uploadRewardImageAction(formData);
    if (res.success && res.url) {
      setImageUrl(res.url);
    } else {
      setErrorMsg(res.error || "Failed to upload image.");
    }
    setIsUploadingImage(false);
  };

  const handleGenerateAiBrief = () => {
    const brief = generateRewardImageBrief({
      title: title.trim() || "Courage Library Official Reward",
      category: rewardType,
      description: description.trim(),
    });
    setAiBrief(brief);
  };

  const copyToClipboard = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopiedType(type);
    setTimeout(() => setCopiedType(null), 2500);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setErrorMsg("Please enter a reward title.");
      return;
    }
    if (coinCost < 0) {
      setErrorMsg("Coin cost cannot be negative.");
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    const finalStock = isUnlimitedStock ? -1 : Math.max(0, stockQuantity);

    if (isEditing && reward) {
      const res = await updateRewardAction(reward.id, {
        title: title.trim(),
        slug: slug.trim(),
        description: description.trim(),
        rewardType,
        coinCost,
        stockQuantity: finalStock,
        imageUrl: imageUrl.trim() || null,
        isActive,
        displayOrder,
      });

      if (res.success) {
        onSuccess({
          ...reward,
          title: title.trim(),
          slug: slug.trim(),
          description: description.trim(),
          rewardType: rewardType as AdminRewardCatalogItem["rewardType"],
          coinCost,
          stockQuantity: finalStock,
          imageUrl: imageUrl.trim() || null,
          isActive,
          displayOrder,
          updatedAt: new Date().toISOString(),
        });
        onClose();
      } else {
        setErrorMsg(res.error || "Failed to update reward.");
      }
    } else {
      const res = await createRewardAction({
        title: title.trim(),
        slug: slug.trim(),
        description: description.trim(),
        rewardType,
        coinCost,
        stockQuantity: finalStock,
        imageUrl: imageUrl.trim() || null,
        isActive,
        displayOrder,
      });

      if (res.success && res.reward) {
        onSuccess({
          ...res.reward,
          totalRedemptions: 0,
        });
        onClose();
      } else {
        setErrorMsg(res.error || "Failed to create reward.");
      }
    }

    setIsSubmitting(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl overflow-hidden bg-white border shadow-2xl rounded-2xl border-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                {isEditing ? `Edit Reward: ${reward?.title}` : "Create New Reward"}
              </h3>
              <p className="text-xs text-slate-500 font-medium">Configure catalog pricing, inventory, images, and AI briefs.</p>
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

        {/* Form Body */}
        <form onSubmit={handleSave}>
          <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto text-xs">
            {/* Section 1: Basic Details */}
            <div className="space-y-3">
              <h4 className="font-bold uppercase tracking-wider text-slate-700 text-[11px] pb-1 border-b border-slate-100 flex items-center justify-between">
                <span>1. Basic Information</span>
                <span className="text-[10px] text-slate-400 font-mono">Catalog Metadata</span>
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block mb-1 font-semibold text-slate-700">Reward Title *</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => handleTitleChange(e.target.value)}
                    placeholder="e.g. Courage Library Diary"
                    required
                    className="w-full px-3 py-2 bg-white border rounded-xl border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-medium text-slate-900"
                  />
                </div>

                <div>
                  <label className="block mb-1 font-semibold text-slate-700">Catalog Slug *</label>
                  <input
                    type="text"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    placeholder="courage-diary"
                    required
                    className="w-full px-3 py-2 bg-slate-50 border rounded-xl border-slate-200 focus:outline-none font-mono text-[11px] text-slate-700"
                  />
                </div>

                <div>
                  <label className="block mb-1 font-semibold text-slate-700">Reward Category</label>
                  <select
                    value={rewardType}
                    onChange={(e) => setRewardType(e.target.value)}
                    className="w-full px-3 py-2 bg-white border rounded-xl border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 font-semibold text-slate-800"
                  >
                    <option value="PHYSICAL">Physical Merchandise</option>
                    <option value="DIGITAL">Digital Reward</option>
                    <option value="FEATURE_UNLOCK">Feature Unlock / Drill</option>
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="block mb-1 font-semibold text-slate-700">Description</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={2}
                    placeholder="Describe what the student receives and why it motivates preparation..."
                    className="w-full px-3 py-2 bg-white border rounded-xl border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-slate-800"
                  />
                </div>
              </div>
            </div>

            {/* Section 2: Pricing & Inventory */}
            <div className="space-y-3">
              <h4 className="font-bold uppercase tracking-wider text-slate-700 text-[11px] pb-1 border-b border-slate-100 flex items-center justify-between">
                <span>2. Pricing &amp; Stock Inventory</span>
                <span className="text-[10px] text-slate-400 font-mono">Server Authoritative</span>
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block mb-1 font-semibold text-slate-700">Cost (CL Coins) *</label>
                  <div className="relative">
                    <input
                      type="number"
                      min={0}
                      value={coinCost}
                      onChange={(e) => setCoinCost(Number(e.target.value))}
                      required
                      className="w-full px-3 py-2 bg-white border rounded-xl border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 font-bold text-amber-700"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-extrabold text-amber-600 font-mono">
                      CL
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block mb-1 font-semibold text-slate-700">Stock Quantity</label>
                  <input
                    type="number"
                    min={0}
                    disabled={isUnlimitedStock}
                    value={stockQuantity}
                    onChange={(e) => setStockQuantity(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-white border rounded-xl border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 font-semibold disabled:opacity-50"
                  />
                </div>

                <div>
                  <label className="block mb-1 font-semibold text-slate-700">Display Order</label>
                  <input
                    type="number"
                    min={0}
                    value={displayOrder}
                    onChange={(e) => setDisplayOrder(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-white border rounded-xl border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>

                <div className="sm:col-span-3 flex items-center gap-6 pt-1">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={isUnlimitedStock}
                      onChange={(e) => setIsUnlimitedStock(e.target.checked)}
                      className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300"
                    />
                    <span className="font-semibold text-slate-700">Unlimited Digital Stock (-1)</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={isActive}
                      onChange={(e) => setIsActive(e.target.checked)}
                      className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300"
                    />
                    <span className="font-semibold text-slate-700">Active &amp; Redeemable in Store</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Section 3: Product Image Management */}
            <div className="space-y-3">
              <h4 className="font-bold uppercase tracking-wider text-slate-700 text-[11px] pb-1 border-b border-slate-100 flex items-center justify-between">
                <span>3. Product Image &amp; Storage</span>
                <span className="text-[10px] text-slate-400 font-mono">Supabase Storage</span>
              </h4>

              <div className="flex flex-col sm:flex-row items-start gap-4 p-4 rounded-xl border border-slate-200/80 bg-slate-50/40">
                <div className="w-24 h-24 rounded-xl border border-slate-200 bg-white overflow-hidden relative shrink-0 flex items-center justify-center shadow-xs">
                  {imageUrl ? (
                    <Image src={imageUrl} alt={title || "Reward"} fill className="object-cover" />
                  ) : (
                    <div className="text-center p-2 text-slate-400">
                      <svg className="w-6 h-6 mx-auto mb-1 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <span className="text-[9px]">No image</span>
                    </div>
                  )}
                </div>

                <div className="space-y-2.5 flex-1 w-full">
                  <div>
                    <label className="block mb-1 font-semibold text-slate-700">Upload to store-rewards Bucket</label>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={handleImageUpload}
                      disabled={isUploadingImage}
                      className="block w-full text-[11px] text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
                    />
                    {isUploadingImage && (
                      <p className="text-[11px] text-blue-600 font-medium mt-1 animate-pulse">
                        Uploading &amp; optimizing image to Supabase Storage...
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block mb-0.5 font-semibold text-slate-600 text-[10px]">Or Direct Image URL</label>
                    <input
                      type="url"
                      value={imageUrl}
                      onChange={(e) => setImageUrl(e.target.value)}
                      placeholder="https://.../current.webp"
                      className="w-full px-2.5 py-1.5 bg-white border rounded-lg border-slate-200 text-[11px] font-mono text-slate-700"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Section 4: AI Image Brief Generator */}
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                <h4 className="font-bold uppercase tracking-wider text-slate-700 text-[11px]">
                  4. AI Product Photography Brief Generator
                </h4>
                <button
                  type="button"
                  onClick={handleGenerateAiBrief}
                  className="px-2.5 py-1 text-[11px] font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200/80 rounded-lg transition-colors inline-flex items-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  <span>Generate Image Brief</span>
                </button>
              </div>

              {aiBrief ? (
                <div className="p-4 rounded-xl border border-indigo-100 bg-indigo-50/30 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-indigo-900 text-[11px]">Generated Commercial Prompt</span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(aiBrief.positivePrompt, "positive")}
                      className="px-2.5 py-1 text-[10px] font-bold bg-white text-indigo-800 border border-indigo-200 rounded-md hover:bg-indigo-50 transition-colors shadow-2xs"
                    >
                      {copiedType === "positive" ? "✓ Copied to Clipboard!" : "Copy Prompt"}
                    </button>
                  </div>
                  <textarea
                    readOnly
                    value={aiBrief.positivePrompt}
                    rows={4}
                    className="w-full p-2.5 bg-white border border-indigo-200/70 rounded-lg text-[11px] font-mono text-slate-800 leading-relaxed"
                  />

                  <div className="flex items-center justify-between pt-1">
                    <span className="font-bold text-slate-700 text-[10px]">Negative Prompt / Avoid List</span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(aiBrief.negativePrompt, "negative")}
                      className="px-2 py-0.5 text-[10px] font-bold bg-white text-slate-700 border border-slate-200 rounded-md hover:bg-slate-50 transition-colors"
                    >
                      {copiedType === "negative" ? "✓ Copied" : "Copy Avoid List"}
                    </button>
                  </div>
                  <textarea
                    readOnly
                    value={aiBrief.negativePrompt}
                    rows={2}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-[10px] font-mono text-slate-600"
                  />
                </div>
              ) : (
                <p className="text-[11px] text-slate-500 italic">
                  Click &ldquo;Generate Image Brief&rdquo; to create an e-commerce photorealistic studio brief tailored with official Courage Library branding and lighting rules.
                </p>
              )}
            </div>

            {errorMsg && (
              <div className="p-3 text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-xl">
                {errorMsg}
              </div>
            )}
          </div>

          {/* Footer Actions */}
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
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-sm transition-all disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              {isSubmitting ? (
                <>
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>Saving Reward...</span>
                </>
              ) : (
                <span>{isEditing ? "Save Changes" : "Create Reward"}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
