import { redirect } from "next/navigation";
import { isCoinsEnabled } from "@/lib/coins/flag";
import { CoinsPaused } from "@/components/coins/coins-paused";
import { Metadata } from "next";
import { GamificationService } from "@/services/gamification.service";
import { StoreViewClient } from "@/components/store/store-view-client";
import { getServerSession } from "@/lib/auth/session";
import { SessionUnavailable } from "@/components/auth/session-unavailable";
import { loginRedirectPath } from "@/lib/auth/safe-redirect";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "CL Rewards Store | Courage Library",
  description: "Turn your consistency into meaningful rewards. Spend earned CL Coins on study gear and preparation enhancements.",
};

export default async function StorePage() {
  // AUTH-1 2a: tri-state session — a Supabase outage shows a retry state, never a login redirect or data
  const session = await getServerSession();
  if (session.state === "error") return <SessionUnavailable />;
  if (session.state === "none") redirect(loginRedirectPath("/store"));
  // BRAND-3 fix 1: coins paused → no balance, no catalogue (nothing is read)
  if (!isCoinsEnabled()) return <CoinsPaused />;
  const user = session.user;

  const storeData = await GamificationService.getStoreData(user.id);

  return (
    <StoreViewClient
      initialWallet={storeData.wallet}
      catalog={storeData.catalog}
      initialUserClaims={storeData.userClaims}
    />
  );
}
