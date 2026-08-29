"use server";

import { revalidatePath } from "next/cache";
import { AdminService } from "@/services/admin.service";
import { GamificationService } from "@/services/gamification.service";

export async function updateRewardPolicyAction(
  policyCode: string,
  updates: {
    baseCoins?: number;
    performanceBonusCoins?: number;
    consistencyBonusCoins?: number;
  }
) {
  const { isAdmin } = await AdminService.checkIsAdminOrStaff();
  if (!isAdmin) {
    return { success: false, error: "Unauthorized. Staff or Admin privileges required." };
  }

  const result = await GamificationService.updateRewardPolicy(policyCode, updates);
  if (result.success) {
    revalidatePath("/admin/gamification");
  }
  return result;
}
