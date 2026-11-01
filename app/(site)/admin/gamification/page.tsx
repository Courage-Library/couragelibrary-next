import React from "react";
import { GamificationService } from "@/services/gamification.service";
import { GamificationManagementView } from "@/components/admin/gamification-management-view";
import { requireAdminPage } from "@/lib/auth/require-admin";

export const dynamic = "force-dynamic";

export default async function AdminGamificationPage() {
  await requireAdminPage({ path: "/admin/gamification" }); // SEC-1D: admin only
  const stats = await GamificationService.getGamificationAdminStats();
  return <GamificationManagementView stats={stats} />;
}
