"use server";

import { revalidatePath } from "next/cache";
import { AdminService } from "@/services/admin.service";
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
  const { isAdmin } = await AdminService.checkIsAdminOrStaff();
  if (!isAdmin) return { success: false, error: "Unauthorized. Admin privileges required." };

  const result = await GamificationService.adminCreateReward(input);
  if (result.success) {
    revalidatePath("/admin/rewards");
    revalidatePath("/admin/gamification");
    revalidatePath("/store");
    revalidatePath("/wallet");
  }
  return result;
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
  const { isAdmin } = await AdminService.checkIsAdminOrStaff();
  if (!isAdmin) return { success: false, error: "Unauthorized. Admin privileges required." };

  const result = await GamificationService.adminUpdateReward(id, updates);
  if (result.success) {
    revalidatePath("/admin/rewards");
    revalidatePath("/admin/gamification");
    revalidatePath("/store");
    revalidatePath("/wallet");
  }
  return result;
}

/**
 * Server Action: Toggle active status of a reward
 */
export async function toggleRewardActiveAction(
  id: string,
  isActive: boolean
): Promise<{ success: boolean; error?: string }> {
  const { isAdmin } = await AdminService.checkIsAdminOrStaff();
  if (!isAdmin) return { success: false, error: "Unauthorized. Admin privileges required." };

  const result = await GamificationService.adminToggleRewardActive(id, isActive);
  if (result.success) {
    revalidatePath("/admin/rewards");
    revalidatePath("/admin/gamification");
    revalidatePath("/store");
    revalidatePath("/wallet");
  }
  return result;
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
  const { isAdmin } = await AdminService.checkIsAdminOrStaff();
  if (!isAdmin) return { success: false, error: "Unauthorized. Admin privileges required." };

  const result = await GamificationService.adminUpdateRedemptionStatus(claimId, updates);
  if (result.success) {
    revalidatePath("/admin/rewards");
    revalidatePath("/store");
  }
  return result;
}

/**
 * Server Action: Upload & Optimize Reward Product Image to Supabase Storage
 */
export async function uploadRewardImageAction(
  formData: FormData
): Promise<{ success: boolean; url?: string; error?: string }> {
  const { isAdmin } = await AdminService.checkIsAdminOrStaff();
  if (!isAdmin) return { success: false, error: "Unauthorized. Admin privileges required." };

  const file = formData.get("file") as File;
  const rewardId = (formData.get("rewardId") as string) || "new";

  if (!file) return { success: false, error: "No image file provided." };

  const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/svg+xml"];
  if (!allowedTypes.includes(file.type)) {
    return { success: false, error: "Invalid file type. Please upload a PNG, JPEG, or WebP image." };
  }

  // Max 5MB
  if (file.size > 5 * 1024 * 1024) {
    return { success: false, error: "Image file exceeds maximum allowed size (5 MB)." };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminServerSupabaseClient() as any;
  const ext = file.name.split(".").pop() || "webp";
  const filename = `${rewardId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const path = `rewards/${filename}`;

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const { error: uploadErr } = await supabase.storage
    .from("store-rewards")
    .upload(path, buffer, {
      contentType: file.type,
      upsert: true,
    });

  if (uploadErr) {
    console.error("[uploadRewardImageAction] Storage error:", uploadErr);
    return { success: false, error: `Failed to upload image: ${uploadErr.message}` };
  }

  const { data: urlData } = supabase.storage.from("store-rewards").getPublicUrl(path);
  const publicUrl = urlData?.publicUrl;

  revalidatePath("/admin/rewards");
  revalidatePath("/store");

  return {
    success: true,
    url: publicUrl,
  };
}
