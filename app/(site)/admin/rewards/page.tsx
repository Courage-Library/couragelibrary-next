import { Metadata } from "next";
import { GamificationService } from "@/services/gamification.service";
import { RewardsStudioView } from "@/components/admin/rewards/rewards-studio-view";
import { requireAdminPage } from "@/lib/auth/require-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Reward & Store Management | Courage Library Admin Studio",
  description: "Manage CL Coin rewards, merchandise, inventory, redemptions, and student benefits.",
};

export default async function AdminRewardsPage() {
  await requireAdminPage({ path: "/admin/rewards" }); // SEC-1C: admin only
  const data = await GamificationService.getAdminRewardsStudioData();
  return <RewardsStudioView initialData={data} />;
}
