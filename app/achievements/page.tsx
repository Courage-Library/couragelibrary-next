import React from "react";
import Link from "next/link";
import { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { LiveTestAchievementService } from "@/services/live-test-achievement.service";
import {
  Trophy,
  Award,
  Medal,
  Zap,
  TrendingUp,
  Flame,
  ShieldCheck,
  Calendar,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Achievements & Badges | Courage Library",
  description: "View your earned badges, podium standings, personal best records, and exam streaks.",
};

export default async function CandidateAchievementsPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/achievements");
  }

  const summary = await LiveTestAchievementService.getCandidateAchievements(user.id);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-6">
          <div>
            <div className="flex items-center gap-2 text-amber-400 mb-1">
              <Sparkles className="w-5 h-5" />
              <span className="text-xs font-bold uppercase tracking-wider">
                Candidate Honors & Achievements
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              Trophy Room & Badges
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Server-verified achievements, national rankings, podium honors, and consistency streaks.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/certificates">
              <Button
                variant="outline"
                size="sm"
                className="bg-slate-900 border-slate-700 text-slate-200 hover:bg-slate-800"
              >
                <Award className="w-4 h-4 mr-1.5 text-amber-400" />
                Certificates
              </Button>
            </Link>
            <Link href="/live-tests">
              <Button
                variant="outline"
                size="sm"
                className="bg-slate-900 border-slate-700 text-slate-200 hover:bg-slate-800"
              >
                Browse Live Tests
                <ArrowRight className="w-4 h-4 ml-1.5" />
              </Button>
            </Link>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 text-center">
            <Award className="w-5 h-5 text-indigo-400 mx-auto mb-1.5" />
            <span className="text-[11px] font-semibold text-slate-400 block">Badges Owned</span>
            <span className="text-xl sm:text-2xl font-black text-white">
              {summary.totalBadgesEarned}
            </span>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 text-center">
            <Trophy className="w-5 h-5 text-amber-400 mx-auto mb-1.5" />
            <span className="text-[11px] font-semibold text-slate-400 block">Podium Finishes</span>
            <span className="text-xl sm:text-2xl font-black text-amber-400">
              {summary.podiumCount}
            </span>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 text-center">
            <Medal className="w-5 h-5 text-blue-400 mx-auto mb-1.5" />
            <span className="text-[11px] font-semibold text-slate-400 block">National Merit</span>
            <span className="text-xl sm:text-2xl font-black text-blue-400">
              {summary.nationalMeritCount}
            </span>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 text-center">
            <TrendingUp className="w-5 h-5 text-emerald-400 mx-auto mb-1.5" />
            <span className="text-[11px] font-semibold text-slate-400 block">Personal Bests</span>
            <span className="text-xl sm:text-2xl font-black text-emerald-400">
              {summary.personalBestCount}
            </span>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 text-center">
            <Flame className="w-5 h-5 text-orange-400 mx-auto mb-1.5" />
            <span className="text-[11px] font-semibold text-slate-400 block">Exam Streaks</span>
            <span className="text-xl sm:text-2xl font-black text-orange-400">
              {summary.consistencyStreakCount}
            </span>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 text-center">
            <Zap className="w-5 h-5 text-purple-400 mx-auto mb-1.5" />
            <span className="text-[11px] font-semibold text-slate-400 block">Total Awards</span>
            <span className="text-xl sm:text-2xl font-black text-purple-400">
              {summary.totalAwardsCount}
            </span>
          </div>
        </div>

        {/* Badges Collection Showcase */}
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Award className="w-5 h-5 text-indigo-400" />
            My Badge Collection ({summary.ownedBadges.length})
          </h2>

          {summary.ownedBadges.length === 0 ? (
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-10 text-center max-w-lg mx-auto space-y-3">
              <Trophy className="w-12 h-12 text-slate-600 mx-auto" />
              <h3 className="text-base font-bold text-white">No Badges Unlocked Yet</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Take your first All-India Live Mock Test to unlock the <strong>Live Test Pioneer</strong> badge, climb the national leaderboard, and earn rare honors.
              </p>
              <Link href="/live-tests" className="inline-block mt-2">
                <Button size="sm" className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold">
                  Take a Live Test
                </Button>
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {summary.ownedBadges.map((badge) => {
                const earnedDate = new Date(badge.earnedAt).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                });

                const tierColors: Record<string, string> = {
                  PLATINUM: "from-cyan-500/20 to-indigo-500/10 border-cyan-500/30 text-cyan-300",
                  GOLD: "from-amber-500/20 to-yellow-500/10 border-amber-500/30 text-amber-300",
                  SILVER: "from-slate-400/20 to-slate-500/10 border-slate-400/30 text-slate-300",
                  BRONZE: "from-amber-700/20 to-amber-800/10 border-amber-700/30 text-amber-400",
                  COMMON: "from-slate-800 to-slate-900 border-slate-700 text-slate-400",
                };

                const cardStyle = tierColors[badge.tier] || tierColors.COMMON;

                return (
                  <div
                    key={badge.badgeId}
                    className={`bg-gradient-to-br ${cardStyle} border rounded-2xl p-5 shadow-lg space-y-3 relative overflow-hidden`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="w-10 h-10 rounded-xl bg-slate-950/70 border border-white/10 flex items-center justify-center shrink-0">
                          {badge.category === "PODIUM" ? (
                            <Trophy className="w-5 h-5 text-amber-400" />
                          ) : badge.category === "NATIONAL" ? (
                            <Medal className="w-5 h-5 text-blue-400" />
                          ) : badge.category === "PERSONAL_BEST" ? (
                            <TrendingUp className="w-5 h-5 text-emerald-400" />
                          ) : badge.category === "CONSISTENCY" ? (
                            <Flame className="w-5 h-5 text-orange-400" />
                          ) : (
                            <Award className="w-5 h-5 text-indigo-400" />
                          )}
                        </div>
                        <div>
                          <h3 className="font-bold text-sm text-white leading-tight">
                            {badge.title}
                          </h3>
                          <span className="text-[10px] font-bold uppercase tracking-wider opacity-75">
                            {badge.tier} Tier
                          </span>
                        </div>
                      </div>

                      {badge.awardOccurrencesCount > 1 && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-white/10 border border-white/20 text-white shrink-0">
                          ×{badge.awardOccurrencesCount}
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-slate-300/90 leading-relaxed">
                      {badge.description}
                    </p>

                    <div className="border-t border-white/10 pt-2 flex items-center justify-between text-[10px] text-slate-400">
                      <span>Unlocked {earnedDate}</span>
                      <span className="flex items-center gap-1 text-emerald-400">
                        <ShieldCheck className="w-3 h-3" />
                        Verified
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent Awards Ledger */}
        {summary.recentAwards.length > 0 && (
          <div className="space-y-4 pt-4 border-t border-slate-800">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Calendar className="w-5 h-5 text-slate-400" />
              Recent Achievement Evidence Ledger
            </h2>

            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl divide-y divide-slate-800 overflow-hidden">
              {summary.recentAwards.map((award) => {
                const awardDate = new Date(award.awarded_at).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                });

                return (
                  <div key={award.id} className="p-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-center">
                        <Award className="w-4 h-4 text-amber-400" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-white">
                          {award.badge_title || award.badge_code}
                        </h4>
                        <span className="text-xs text-slate-400">
                          {award.event_title ? `in ${award.event_title}` : "Milestone Achievement"}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 text-xs">
                      {award.achieved_rank && (
                        <span className="text-amber-400 font-bold">
                          Rank #{award.achieved_rank}
                        </span>
                      )}
                      {award.achieved_percentile && (
                        <span className="text-indigo-400 font-bold">
                          {award.achieved_percentile}%ile
                        </span>
                      )}
                      <span className="text-slate-500 font-mono text-[11px]">
                        {awardDate}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
