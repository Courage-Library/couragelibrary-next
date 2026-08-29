import { Metadata } from "next";
import { GamificationService } from "@/services/gamification.service";
import { RewardsStudioView } from "@/components/admin/rewards/rewards-studio-view";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Reward & Store Management | Courage Library Admin Studio",
  description: "Manage CL Coin rewards, merchandise, inventory, redemptions, and student benefits.",
};

export default async function AdminRewardsPage() {
  const data = await GamificationService.getAdminRewardsStudioData();
  return <RewardsStudioView initialData={data} />;
}
