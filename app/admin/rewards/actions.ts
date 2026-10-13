"use server";


import { guardAdminAction, dbFailure, sanitizeActionResult } from "@/lib/auth/require-admin";
import { revalidatePath } from "next/cache";
import { GamificationService, AdminRewardCatalogItem } from "@/services/gamification.service";
import { createAdminServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Server Action: Create new reward in catalog
 */
export async function createRewardAction(input: {
  title: string;
  slug?: string;
  description?: string;
  rewardType: string;
  coinCost: number;
  stockQuantity?: number;
  imageUrl?: string | null;
  isActive?: boolean;
  displayOrder?: number;
  metadata?: Record<string, unknown>;
}): Promise<{ success: boolean; reward?: AdminRewardCatalogItem; error?: string }> {
  const __auth = await guardAdminAction() /* SEC-1B Q1: admin only */;
  if (!__auth.ok) return __auth;

  const result = await GamificationService.adminCreateReward(input);
  if (result.success) {
    revalidatePath("/admin/rewards");
    revalidatePath("/admin/gamification");
    revalidatePath("/store");
    revalidatePath("/wallet");
  }
  return sanitizeActionResult("createRewardAction", await (result));
}

/**
 * Server Action: Update existing reward in catalog
 */
export async function updateRewardAction(
  id: string,
  updates: Partial<{
    title: string;
    slug: string;
    description: string;
    rewardType: string;
    coinCost: number;
    stockQuantity: number;
    imageUrl: string | null;
    isActive: boolean;
    displayOrder: number;
    metadata: Record<string, unknown>;
  }>
): Promise<{ success: boolean; error?: string }> {
  const __auth1 = await guardAdminAction() /* SEC-1B Q1: admin only */;
  if (!__auth1.ok) return __auth1;

  const result = await GamificationService.adminUpdateReward(id, updates);
  if (result.success) {
    revalidatePath("/admin/rewards");
    revalidatePath("/admin/gamification");
    revalidatePath("/store");
    revalidatePath("/wallet");
  }
  return sanitizeActionResult("updateRewardAction", await (result));
}

/**
 * Server Action: Toggle active status of a reward
 */
export async function toggleRewardActiveAction(
  id: string,
  isActive: boolean
): Promise<{ success: boolean; error?: string }> {
  const __auth2 = await guardAdminAction() /* SEC-1B Q1: admin only */;
  if (!__auth2.ok) return __auth2;

  const result = await GamificationService.adminToggleRewardActive(id, isActive);
  if (result.success) {
    revalidatePath("/admin/rewards");
    revalidatePath("/admin/gamification");
    revalidatePath("/store");
    revalidatePath("/wallet");
  }
  return sanitizeActionResult("toggleRewardActiveAction", await (result));
}

/**
 * Server Action: Update fulfillment status of a redemption claim
 */
export async function updateRedemptionStatusAction(
  claimId: string,
  updates: {
    status: string;
    trackingCode?: string;
    adminNotes?: string;
  }
): Promise<{ success: boolean; error?: string }> {
  const __auth3 = await guardAdminAction() /* SEC-1B Q1: admin only */;
  if (!__auth3.ok) return __auth3;

  const result = await GamificationService.adminUpdateRedemptionStatus(claimId, updates);
  if (result.success) {
    revalidatePath("/admin/rewards");
    revalidatePath("/store");
  }
  return sanitizeActionResult("updateRedemptionStatusAction", await (result));
}

/**
 * Server Action: Upload & Optimize Reward Product Image to Supabase Storage
 */
export async function uploadRewardImageAction(
  formData: FormData
): Promise<{ success: boolean; url?: string; size?: number; format?: string; error?: string }> {
  const __auth4 = await guardAdminAction() /* SEC-1B Q1: admin only */;
  if (!__auth4.ok) return __auth4;

  const file = formData.get("file") as File;
  const rewardId = (formData.get("rewardId") as string) || "new";

  if (!file) return { success: false, error: "No image file provided." };

  const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/svg+xml"];
  if (!allowedTypes.includes(file.type)) {
    return { success: false, error: "Unsupported image format. Please upload a WebP, PNG, or JPEG image." };
  }

  // Max 10MB source limit
  if (file.size > 10 * 1024 * 1024) {
    return { success: false, error: "Image file exceeds maximum allowed limit (10 MB)." };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminServerSupabaseClient() as any;
  const ext = file.name.split(".").pop() || (file.type === "image/webp" ? "webp" : "png");
  const filename = `${rewardId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const path = `rewards/${filename}`;

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const { error: uploadErr } = await supabase.storage
    .from("store-rewards")
    .upload(path, buffer, {
      contentType: file.type,
      cacheControl: "public, max-age=31536000, immutable",
      upsert: true,
    });

  if (uploadErr) {
    console.error("[uploadRewardImageAction] Storage error:", uploadErr);
    return dbFailure("uploadRewardImageAction", uploadErr);
  }

  const { data: urlData } = supabase.storage.from("store-rewards").getPublicUrl(path);
  const publicUrl = urlData?.publicUrl;

  revalidatePath("/admin/rewards");
  revalidatePath("/store");

  return {
    success: true,
    url: publicUrl,
    size: file.size,
    format: file.type,
  };
}
