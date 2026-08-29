import { redirect } from "next/navigation";
import { Metadata } from "next";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { GamificationService } from "@/services/gamification.service";
import { StoreViewClient } from "@/components/store/store-view-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "CL Rewards Store | Courage Library",
  description: "Turn your consistency into meaningful rewards. Spend earned CL Coins on study gear and preparation enhancements.",
};

export default async function StorePage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login?redirectTo=/store");
  }

  const storeData = await GamificationService.getStoreData(user.id);

  return (
    <StoreViewClient
      initialWallet={storeData.wallet}
      catalog={storeData.catalog}
      initialUserClaims={storeData.userClaims}
    />
  );
}
