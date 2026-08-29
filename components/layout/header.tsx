import React from "react";
import { Container } from "@/components/ui/container";
import { MainNav } from "@/components/layout/main-nav";
import { HeaderControls } from "@/components/layout/header-controls";
import { BrandLogo } from "@/components/brand/logo";
import { createServerSupabaseClient, createAdminServerSupabaseClient } from "@/lib/supabase/server";
import { AdminService } from "@/services/admin.service";

export async function Header() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  let coins = 0;
  let streak = 0;
  let isAdmin = false;

  if (user) {
    const adminSb = createAdminServerSupabaseClient();
    const [walletRes, streakRes, adminRes] = await Promise.all([
      adminSb.from("coin_wallets").select("current_balance").eq("user_id", user.id).maybeSingle(),
      adminSb.from("user_streaks").select("current_streak").eq("user_id", user.id).maybeSingle(),
      AdminService.checkIsAdminOrStaff(),
    ]);

    const walletData = walletRes.data as { current_balance: number } | null;
    const streakData = streakRes.data as { current_streak: number } | null;
    coins = Number(walletData?.current_balance || 0);
    streak = Number(streakData?.current_streak || 0);
    isAdmin = adminRes.isAdmin;
  }

  const userData = user ? {
    email: user.email,
    fullName: user.user_metadata?.full_name || user.email?.split("@")[0],
    isAdmin,
  } : null;

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200/80 bg-white/90 backdrop-blur-md">
      <Container className="flex h-16 items-center justify-between gap-4">
        {/* Left: Brand Logo */}
        <div className="flex items-center shrink-0">
          <BrandLogo href={user ? "/dashboard" : "/"} size="md" />
        </div>

        {/* Center: Primary Navigation (Centered) */}
        <div className="hidden lg:flex items-center justify-center flex-1">
          <MainNav isAuthenticated={!!user} />
        </div>

        {/* Right: Right Navigation Controls & Mobile Menu */}
        <div className="flex items-center gap-3 shrink-0">
          <HeaderControls user={userData} coins={coins} streak={streak} />
        </div>
      </Container>
    </header>
  );
}