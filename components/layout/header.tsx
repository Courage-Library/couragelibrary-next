import React from "react";
import Link from "next/link";
import { siteConfig } from "@/config/site";
import { Container } from "@/components/ui/container";
import { UserNav } from "@/components/layout/user-nav";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function Header() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  let coins = 0;
  let streak = 0;

  if (user) {
    const [walletRes, streakRes] = await Promise.all([
      supabase.from("coin_wallets").select("current_balance").eq("user_id", user.id).maybeSingle(),
      supabase.from("user_streaks").select("current_streak").eq("user_id", user.id).maybeSingle(),
    ]);
    const walletData = walletRes.data as { current_balance: number } | null;
    const streakData = streakRes.data as { current_streak: number } | null;
    coins = walletData?.current_balance || 0;
    streak = streakData?.current_streak || 0;
  }

  const userData = user ? {
    email: user.email,
    fullName: user.user_metadata?.full_name || user.email?.split("@")[0],
  } : null;

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200/80 bg-white/90 backdrop-blur-md">
      <Container className="flex h-16 items-center justify-between">
        {/* Logo & Main Nav */}
        <div className="flex items-center gap-6">
          <Link href={user ? "/dashboard" : "/"} className="flex items-center gap-2.5 font-bold text-slate-900 group">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white font-extrabold shadow-sm transition-transform group-hover:scale-105">
              CL
            </div>
            <span className="text-xl font-extrabold tracking-tight bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-900 bg-clip-text text-transparent">
              {siteConfig.name}
            </span>
          </Link>

          {user && (
            <nav className="hidden md:flex items-center gap-1 text-sm font-medium text-slate-600">
              <Link href="/dashboard" className="px-3 py-1.5 rounded-lg hover:bg-slate-100 hover:text-slate-900 transition-colors">
                Dashboard
              </Link>
              <Link href="/pricing" className="px-3 py-1.5 rounded-lg hover:bg-slate-100 hover:text-slate-900 transition-colors font-bold text-amber-600">
                PRO Pricing
              </Link>
              <Link href="/community" className="px-3 py-1.5 rounded-lg hover:bg-slate-100 hover:text-slate-900 transition-colors">
                Community
              </Link>
              <Link href="/articles" className="px-3 py-1.5 rounded-lg hover:bg-slate-100 hover:text-slate-900 transition-colors">
                Articles
              </Link>
              <Link href="/courses" className="px-3 py-1.5 rounded-lg hover:bg-slate-100 hover:text-slate-900 transition-colors">
                Courses
              </Link>
              <Link href="/mock-tests" className="px-3 py-1.5 rounded-lg hover:bg-slate-100 hover:text-slate-900 transition-colors">
                Mock Tests
              </Link>
              <Link href="/practice" className="px-3 py-1.5 rounded-lg hover:bg-slate-100 hover:text-slate-900 transition-colors">
                Practice
              </Link>
              <Link href="/mistakes" className="px-3 py-1.5 rounded-lg hover:bg-slate-100 hover:text-slate-900 transition-colors">
                Mistakes
              </Link>
              <Link href="/flashcards" className="px-3 py-1.5 rounded-lg hover:bg-slate-100 hover:text-slate-900 transition-colors">
                Flashcards
              </Link>
              <Link href="/battles" className="px-3 py-1.5 rounded-lg hover:bg-slate-100 hover:text-slate-900 transition-colors">
                1v1 Battles
              </Link>
              <Link href="/descriptive" className="px-3 py-1.5 rounded-lg hover:bg-slate-100 hover:text-slate-900 transition-colors">
                Descriptive
              </Link>
              <Link href="/institutes" className="px-3 py-1.5 rounded-lg hover:bg-slate-100 hover:text-slate-900 transition-colors">
                Institutes
              </Link>
              <Link href="/billing" className="px-3 py-1.5 rounded-lg hover:bg-slate-100 hover:text-slate-900 transition-colors">
                Billing
              </Link>
            </nav>
          )}
        </div>

        {/* User Navigation Area */}
        <UserNav user={userData} coins={coins} streak={streak} />
      </Container>
    </header>
  );
}