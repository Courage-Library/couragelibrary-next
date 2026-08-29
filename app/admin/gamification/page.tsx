import React from "react";
import { GamificationService } from "@/services/gamification.service";
import { GamificationManagementView } from "@/components/admin/gamification-management-view";

export default async function AdminGamificationPage() {
  const stats = await GamificationService.getGamificationAdminStats();
  return <GamificationManagementView stats={stats} />;
}
