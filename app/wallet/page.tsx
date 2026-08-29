import React from "react";
import { redirect } from "next/navigation";
import { GamificationService } from "@/services/gamification.service";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { constructMetadata } from "@/lib/seo/metadata";
import { WalletViewClient, RewardCatalogItem } from "@/components/wallet/wallet-view-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = constructMetadata({
  title: "CL Coins Wallet & Rewards Studio",
  description: "View your CL Coins balance, study streak shields, level progression, and available store reward redemptions.",
});

export default async function WalletPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login?next=/wallet");
  }

  const [wallet, catalogRes] = await Promise.all([
    GamificationService.getStudentWallet(user.id),
    supabase
      .from("reward_catalog")
      .select("id, title, slug, description, reward_type, coin_cost, stock_quantity")
      .eq("is_active", true)
      .order("display_order", { ascending: true }),
  ]);

  if (!wallet) {
    redirect("/dashboard");
  }

  interface DbRewardItem {
    id: string;
    title: string;
    slug: string;
    description: string | null;
    reward_type: "DIGITAL" | "FEATURE_UNLOCK" | "PHYSICAL";
    coin_cost: number;
    stock_quantity: number | null;
  }

  const rawCatalog = (catalogRes.data as unknown as DbRewardItem[]) || [];
  const catalog: RewardCatalogItem[] = rawCatalog.map((item) => ({
    id: item.id,
    title: item.title,
    slug: item.slug,
    description: item.description || "Official Courage Library Reward",
    rewardType: item.reward_type,
    coinCost: Number(item.coin_cost || 0),
    stockQuantity: Number(item.stock_quantity ?? -1),
  }));

  // Fallback defaults if catalog is empty in DB
  if (catalog.length === 0) {
    catalog.push(
      {
        id: "streak-freeze-token",
        title: "Streak Freeze Shield",
        slug: "streak-freeze-token",
        description: "Protects your study streak from a 1-day missed daily practice session.",
        rewardType: "DIGITAL",
        coinCost: 150,
        stockQuantity: -1,
      },
      {
        id: "error-book-pack",
        title: "Error-Book Retest Pack",
        slug: "error-book-retest-pack",
        description: "Generates personalized weakness repair drills from your past mock test mistakes.",
        rewardType: "FEATURE_UNLOCK",
        coinCost: 250,
        stockQuantity: -1,
      },
      {
        id: "courage-bottle",
        title: "Courage Stainless Steel Bottle",
        slug: "courage-bottle",
        description: "Premium insulated Courage Library stainless steel water bottle.",
        rewardType: "PHYSICAL",
        coinCost: 1800,
        stockQuantity: 50,
      },
      {
        id: "courage-diary",
        title: "Courage Scholar Diary & Pen",
        slug: "courage-diary",
        description: "Official Courage Library hardbound revision diary and executive pen.",
        rewardType: "PHYSICAL",
        coinCost: 3000,
        stockQuantity: 50,
      },
      {
        id: "courage-tshirt",
        title: "Courage Aspirant Performance T-Shirt",
        slug: "courage-tshirt",
        description: "High-grade breathable Courage Library preparation apparel.",
        rewardType: "PHYSICAL",
        coinCost: 5000,
        stockQuantity: 50,
      }
    );
  }

  return <WalletViewClient wallet={wallet} catalog={catalog} />;
}
