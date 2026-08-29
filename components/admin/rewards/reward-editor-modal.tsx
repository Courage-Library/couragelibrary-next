"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import { AdminRewardCatalogItem } from "@/services/gamification.service";
import { createRewardAction, updateRewardAction, uploadRewardImageAction } from "@/app/admin/rewards/actions";
import { generateRewardImageBrief } from "@/lib/admin/ai-image-brief";
import { optimizeRewardImage, formatBytes, OptimizationResult } from "@/lib/client/reward-image-optimizer";

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
  const [uploadPhase, setUploadPhase] = useState<"idle" | "preparing" | "uploading" | "saving" | "success" | "error">("idle");
  const [uploadMetrics, setUploadMetrics] = useState<OptimizationResult | null>(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const localPreviewRef = React.useRef<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // AI Image Brief State
  const [promptText, setPromptText] = useState<string>("");
  const [copiedPrompt, setCopiedPrompt] = useState<boolean>(false);

  useEffect(() => {
    if (localPreviewRef.current) {
      URL.revokeObjectURL(localPreviewRef.current);
      localPreviewRef.current = null;
    }
    setLocalPreviewUrl(null);
    setUploadMetrics(null);
    setUploadPhase("idle");

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
      setPromptText("");
      setCopiedPrompt(false);
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
      setPromptText("");
      setCopiedPrompt(false);
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

    if (!file.type.startsWith("image/")) {
      setErrorMsg("Unsupported file type. Please select an image file (PNG, WebP, or JPEG).");
      return;
    }

    setIsUploadingImage(true);
    setErrorMsg(null);
    setUploadPhase("preparing");

    try {
      // Step 1: Instant Client-side Optimization & Zero-latency preview
      const optResult = await optimizeRewardImage(file);
      if (localPreviewRef.current) {
        URL.revokeObjectURL(localPreviewRef.current);
      }
      localPreviewRef.current = optResult.previewUrl;
      setLocalPreviewUrl(optResult.previewUrl);
      setUploadMetrics(optResult);

      // Step 2: Upload optimized WebP/PNG asset to Supabase Storage
      setUploadPhase("uploading");
      const formData = new FormData();
      formData.append("file", optResult.file);
      formData.append("rewardId", reward?.id || "new");

      const res = await uploadRewardImageAction(formData);
      if (res.success && res.url) {
        setImageUrl(res.url);
        setUploadPhase("success");
      } else {
        setUploadPhase("error");
        setErrorMsg(res.error || "Upload failed. Please try again.");
      }
    } catch (err: unknown) {
      console.error("[handleImageUpload] Optimization/upload error:", err);
      setUploadPhase("error");
      setErrorMsg(err instanceof Error ? err.message : "Failed to process and upload image.");
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleGenerateAiBrief = () => {
    const brief = generateRewardImageBrief({
      title: title.trim() || "Courage Library Official Reward",
      category: rewardType,
      description: description.trim(),
    });
    setPromptText(brief.prompt);
  };

  const handleCopyPrompt = () => {
    if (!promptText) return;
    navigator.clipboard.writeText(promptText);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2500);
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
                {/* Image Preview Box */}
                <div className="w-24 h-24 rounded-xl border border-slate-200 bg-white overflow-hidden relative shrink-0 flex items-center justify-center shadow-xs">
                  {localPreviewUrl || imageUrl ? (
                    <Image
                      src={localPreviewUrl || imageUrl}
                      alt={title || "Reward"}
                      fill
                      unoptimized={Boolean(localPreviewUrl)}
                      className="object-cover"
                    />
                  ) : (
                    <div className="text-center p-2 text-slate-400">
                      <svg className="w-6 h-6 mx-auto mb-1 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <span className="text-[9px]">No image</span>
                    </div>
                  )}

                  {/* Upload Overlay */}
                  {isUploadingImage && (
                    <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-2xs flex items-center justify-center">
                      <svg className="w-5 h-5 text-white animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
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
                      disabled={isUploadingImage || isSubmitting}
                      className="block w-full text-[11px] text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-50 cursor-pointer"
                    />

                    {/* Dynamic Upload Status */}
                    {uploadPhase === "preparing" && (
                      <p className="text-[11px] text-blue-600 font-semibold mt-1.5 flex items-center gap-1.5 animate-pulse">
                        <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        <span>Preparing &amp; optimizing image to WebP...</span>
                      </p>
                    )}
                    {uploadPhase === "uploading" && (
                      <p className="text-[11px] text-indigo-600 font-semibold mt-1.5 flex items-center gap-1.5 animate-pulse">
                        <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        <span>Uploading optimized asset to Supabase Storage...</span>
                      </p>
                    )}
                    {uploadPhase === "success" && (
                      <p className="text-[11px] text-emerald-700 font-bold mt-1.5 flex items-center gap-1">
                        <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                        <span>Image optimized and uploaded successfully!</span>
                      </p>
                    )}

                    {/* File Metrics Chips */}
                    {uploadMetrics && (
                      <div className="mt-2 p-2.5 rounded-lg bg-white border border-slate-200 text-[10px] space-y-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold text-slate-500">
                            Original:{" "}
                            <strong className="text-slate-800 font-mono">
                              {uploadMetrics.originalType.replace("image/", "").toUpperCase()} · {uploadMetrics.originalWidth}×{uploadMetrics.originalHeight} · {formatBytes(uploadMetrics.originalSize)}
                            </strong>
                          </span>
                          <span className="font-semibold text-emerald-700">
                            Optimized:{" "}
                            <strong className="text-emerald-900 font-mono">
                              {uploadMetrics.optimizedType.replace("image/", "").toUpperCase()} · {uploadMetrics.targetWidth}×{uploadMetrics.targetHeight} · {formatBytes(uploadMetrics.optimizedSize)}
                            </strong>
                          </span>
                        </div>
                        <div className="flex items-center justify-between pt-0.5 text-slate-500 border-t border-slate-100">
                          <span>
                            Reduction:{" "}
                            <strong className="text-indigo-600 font-mono">
                              {Math.max(0, Math.round((1 - uploadMetrics.optimizedSize / uploadMetrics.originalSize) * 100))}% smaller
                            </strong>{" "}
                            ({uploadMetrics.durationMs}ms)
                          </span>
                          {uploadMetrics.hasTransparency && (
                            <span className="text-sky-700 font-semibold bg-sky-50 px-1.5 py-0.2 rounded border border-sky-200">
                              Alpha Transparency Preserved
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block mb-0.5 font-semibold text-slate-600 text-[10px]">Or Direct Image URL</label>
                    <input
                      type="url"
                      value={imageUrl}
                      onChange={(e) => setImageUrl(e.target.value)}
                      placeholder="https://.../current.webp"
                      disabled={isUploadingImage}
                      className="w-full px-2.5 py-1.5 bg-white border rounded-lg border-slate-200 text-[11px] font-mono text-slate-700 disabled:opacity-50"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Section 4: AI Image Brief Generator */}
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <h4 className="font-bold uppercase tracking-wider text-slate-700 text-[11px]">
                    4. AI Image Generation Prompt (Canonical 4:3 Master Specification)
                  </h4>
                </div>
                <button
                  type="button"
                  onClick={handleGenerateAiBrief}
                  className="px-2.5 py-1 text-[11px] font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200/80 rounded-lg transition-colors inline-flex items-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  <span>{promptText ? "Regenerate Prompt" : "Generate Image Brief"}</span>
                </button>
              </div>

              {/* Standard Specification Banner */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-[10px]">
                <div className="flex flex-col">
                  <span className="font-semibold text-slate-500 uppercase tracking-wider text-[9px]">Aspect Ratio</span>
                  <span className="font-bold text-slate-800">4:3 Master</span>
                </div>
                <div className="flex flex-col">
                  <span className="font-semibold text-slate-500 uppercase tracking-wider text-[9px]">Canonical Asset</span>
                  <span className="font-bold text-slate-800">1600 × 1200 px</span>
                </div>
                <div className="flex flex-col">
                  <span className="font-semibold text-slate-500 uppercase tracking-wider text-[9px]">Hero Occupancy</span>
                  <span className="font-bold text-slate-800">65%–75% Canvas</span>
                </div>
                <div className="flex flex-col">
                  <span className="font-semibold text-slate-500 uppercase tracking-wider text-[9px]">Safe Margins</span>
                  <span className="font-bold text-slate-800">10%–12% Margin</span>
                </div>
              </div>

              {promptText ? (
                <div className="p-4 rounded-xl border border-indigo-100 bg-indigo-50/30 space-y-3">
                  {/* Official Logo Reference Card */}
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-white border border-indigo-100 shadow-2xs">
                    <div className="w-10 h-10 rounded-lg bg-slate-50 border border-slate-200 shrink-0 flex items-center justify-center overflow-hidden p-1">
                      <Image
                        src="/images/logo.png"
                        alt="Courage Library Official Logo"
                        width={32}
                        height={32}
                        className="object-contain"
                      />
                    </div>
                    <div className="space-y-0.5 flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold text-slate-900">Official Courage Library Logo Reference</span>
                        <span className="px-1.5 py-0.2 text-[9px] font-extrabold bg-blue-50 text-blue-700 rounded-md border border-blue-200">
                          Branding Reference
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-600 leading-normal">
                        Recommended: attach this official Courage Library logo image when generating the image for accurate branding. If no logo is attached, the prompt instructs the AI model to keep the branding area clean without fabricating fake logos.
                      </p>
                    </div>
                  </div>

                  {/* Single Unified Prompt Area */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="font-bold text-indigo-950 text-[11px] flex items-center gap-1.5">
                        <span>One Single Copy-Paste-Ready AI Image Prompt</span>
                        <span className="text-[10px] font-normal text-indigo-600 font-mono">(Editable)</span>
                      </label>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleGenerateAiBrief}
                          className="px-2.5 py-1 text-[10px] font-bold text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-colors inline-flex items-center gap-1"
                        >
                          <svg className="w-3 h-3 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                          <span>Regenerate</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleCopyPrompt}
                          className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all shadow-2xs inline-flex items-center gap-1.5 ${
                            copiedPrompt
                              ? "bg-emerald-600 text-white border border-emerald-700 ring-2 ring-emerald-500/20"
                              : "bg-indigo-600 text-white hover:bg-indigo-700 border border-indigo-700"
                          }`}
                        >
                          {copiedPrompt ? (
                            <>
                              <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                              <span>Prompt copied.</span>
                            </>
                          ) : (
                            <>
                              <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                              </svg>
                              <span>Copy Prompt</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                    <textarea
                      value={promptText}
                      onChange={(e) => setPromptText(e.target.value)}
                      rows={9}
                      className="w-full p-3 bg-white border border-indigo-200/80 rounded-xl text-[11px] font-mono text-slate-800 leading-relaxed focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 shadow-2xs"
                      placeholder="Unified image generation prompt..."
                    />
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 text-center space-y-1.5">
                  <p className="text-[11px] font-medium text-slate-600">
                    Click &ldquo;Generate Image Brief&rdquo; to create ONE comprehensive, copy-paste-ready prompt.
                  </p>
                  <p className="text-[10px] text-slate-400">
                    Includes product architecture, realistic material physics, 1:1 (1600 × 1600) framing, official logo handling, and embedded quality restrictions in a single copyable block.
                  </p>
                </div>
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
