"use server";


import { guardAdminAction, sanitizeActionResult } from "@/lib/auth/require-admin";
import { revalidatePath } from "next/cache";
import { GamificationService } from "@/services/gamification.service";

export async function updateRewardPolicyAction(
  policyCode: string,
  updates: {
    baseCoins?: number;
    performanceBonusCoins?: number;
    consistencyBonusCoins?: number;
  }
) {
  const __auth = await guardAdminAction(); /* SEC-1D: admin only */
  if (!__auth.ok) return __auth;

  const result = await GamificationService.updateRewardPolicy(policyCode, updates);
  if (result.success) {
    revalidatePath("/admin/gamification");
  }
  return sanitizeActionResult("updateRewardPolicyAction", await (result));
}
