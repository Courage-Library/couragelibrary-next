import React from "react";
import { isFeatureEnabled } from "@/config/features";
import { redirect } from "next/navigation";
import Link from "next/link";
import { DashboardService } from "@/services/dashboard.service";
import { Container } from "@/components/ui/legacy/container";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/legacy/card";
import { Badge } from "@/components/ui/legacy/badge";
import { GlassChip } from "@/components/ui/glass";
import { Button } from "@/components/ui/legacy/button";
import { getServerSession } from "@/lib/auth/session";
import { SessionUnavailable } from "@/components/auth/session-unavailable";
import { loginRedirectPath } from "@/lib/auth/safe-redirect";
import { isOnboardingEnabled } from "@/lib/onboarding/flag";
import { getOnboardingState } from "@/lib/onboarding/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { OnboardingCard } from "@/components/onboarding/onboarding-card";
import {
  Flame,
  Coins,
  Target,
  BookOpen,
  CheckCircle2,
  AlertTriangle,
  Zap,
  ArrowRight,
  Clock,
  Swords,
  GraduationCap,
  Layers,
  Lock,
} from "lucide-react";
import { MEMORY_LOCK } from "@/content/memory-lock";
import { isMemoryLockEnabled } from "@/lib/memory-lock/flag";
import { isProEnabled } from "@/config/payments";
import { isCoinsEnabled } from "@/lib/coins/flag";
import { getProEndingSoon } from "@/lib/payments/pro-server";
import { ProEndingBanner } from "@/components/payments/pro-ending-banner";

export const revalidate = 0; // Dynamic server page

export default async function DashboardPage() {
  // AUTH-1 2a: tri-state session first — a Supabase outage shows a retry state, never a login redirect
  const authSession = await getServerSession();
  if (authSession.state === "error") return <SessionUnavailable />;
  if (authSession.state === "none") redirect(loginRedirectPath("/dashboard"));

  const data = await DashboardService.getStudentDashboardData();
  // F0 (#76): one dismissible card while onboarding is not completed (flag off / state unknown → no card)
  const onboarding = isOnboardingEnabled() ? (await getOnboardingState(await createServerSupabaseClient())).status : null;
  const showOnboardingCard = onboarding !== null && !onboarding.completed;
  // F9-B: Pro ending within 7 days (flag off → never queried)
  const proEnding = isProEnabled() ? await getProEndingSoon(authSession.user.id) : null;

  if (!data.user) {
    // the service's own read can still fail transiently after the session check passed
    return <SessionUnavailable />;
  }

  return (
    <div className="py-8 bg-slate-50/50 min-h-[calc(100vh-4rem)]">
      <Container className="space-y-8">
        {showOnboardingCard && <OnboardingCard />}
        {proEnding && <ProEndingBanner endsAt={proEnding.endsAt} daysLeft={proEnding.daysLeft} />}
        {/* Welcome Header */}
        {/* BRAND-2 (#72): hero gradient header; its chips are the only glass on the dashboard */}
        <div className="hero-gradient flex flex-col md:flex-row md:items-center md:justify-between gap-4 rounded-hero p-6 sm:p-8">
          <div className="space-y-2">
            <GlassChip>Candidate Hub</GlassChip>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Welcome back, {data.user.fullName}!
            </h1>
            <p className="text-hero-fg-muted text-sm max-w-xl">
              Consistent daily practice builds rank. Complete today&apos;s recommendations to maintain your streak!
            </p>
          </div>
          <div className="glass-dark flex items-center gap-4 p-4 rounded-sheet">
            <div className="text-center px-3">
              <div className="flex items-center justify-center gap-1 text-hero-accent-text font-black text-xl">
                <Flame className="w-5 h-5 fill-current" />
                {data.streak?.current_streak || 0}
              </div>
              <span className="text-caption text-hero-fg-muted font-medium">Day Streak</span>
            </div>
            {/* BRAND-3 fix 1: no coin balance while COINS_ENABLED is off (the streak stays) */}
            {isCoinsEnabled() && (
              <>
                <div className="w-px h-8 bg-hero-fg-muted/30" />
                <div className="text-center px-3" data-coin-ui="">
                  <div className="flex items-center justify-center gap-1 text-hero-accent-text font-black text-xl">
                    <Coins className="w-5 h-5 fill-current" />
                    {data.wallet?.current_balance || 0}
                  </div>
                  <span className="text-caption text-hero-fg-muted font-medium">Coins</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Quick Action Hub */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
          <Link href="/mock-tests" className="group">
            <Card className="p-4 hover:border-blue-300 hover:shadow-md transition-all h-full flex flex-col justify-between">
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                <Target className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-sm text-slate-900">Take Mock Test</h4>
                <p className="text-xs text-slate-500 mt-0.5">Timed mock tests</p>
              </div>
            </Card>
          </Link>
          <Link href="/practice" className="group">
            <Card className="p-4 hover:border-indigo-300 hover:shadow-md transition-all h-full flex flex-col justify-between">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                <Zap className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-sm text-slate-900">Custom Practice</h4>
                <p className="text-xs text-slate-500 mt-0.5">Topic & difficulty filters</p>
              </div>
            </Card>
          </Link>
          <Link href="/mistakes" className="group">
            <Card className="p-4 hover:border-red-300 hover:shadow-md transition-all h-full flex flex-col justify-between">
              <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-sm text-slate-900">Mistake Vault</h4>
                  {data.mistakesCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded-md bg-red-100 text-red-700 text-[10px] font-bold">
                      {data.mistakesCount}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-0.5">Remediation drills</p>
              </div>
            </Card>
          </Link>
          {/* Memory Lock (F5): ONE real link to /memory-lock when MEMORY_LOCK_ENABLED (migration 095 applied); until then a
              plain, non-interactive card — no link, no dead link; the visible "Coming soon" says it is not available yet */}
          {isMemoryLockEnabled() ? (
          <Link href="/memory-lock" className="group" data-memory-lock-card="" data-memory-lock-live="">
            <Card className="p-4 h-full flex flex-col justify-between hover:border-primary-300 hover:shadow-md transition-all">
              <div className="w-10 h-10 rounded-xl bg-primary-50 text-primary-700 flex items-center justify-center mb-3">
                <Lock aria-hidden="true" className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-sm text-slate-900">{MEMORY_LOCK.name}</h4>
                <p className="text-xs text-slate-500 mt-0.5">{MEMORY_LOCK.tagline}</p>
              </div>
            </Card>
          </Link>
          ) : (
          <div data-memory-lock-card="">
            <Card className="p-4 h-full flex flex-col justify-between">
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="w-10 h-10 rounded-xl bg-primary-50 text-primary-700 flex items-center justify-center">
                  <Lock aria-hidden="true" className="w-5 h-5" />
                </div>
                <span className="px-1.5 py-0.5 rounded-md border border-primary-200 bg-primary-50 text-primary-800 text-caption font-medium">
                  {MEMORY_LOCK.comingSoon}
                </span>
              </div>
              <div>
                <h4 className="font-bold text-sm text-slate-900">{MEMORY_LOCK.name}</h4>
                <p className="text-xs text-slate-500 mt-0.5">{MEMORY_LOCK.tagline}</p>
              </div>
            </Card>
          </div>
          )}
          {isFeatureEnabled("BATTLES") && (
          <Link href="/battles" className="group">
            <Card className="p-4 hover:border-accent-300 hover:shadow-md transition-all h-full flex flex-col justify-between">
              <div className="w-10 h-10 rounded-xl bg-accent-50 text-accent-700 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                <Swords className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-sm text-slate-900">1v1 Quiz Battle</h4>
                <p className="text-xs text-slate-500 mt-0.5">Live multiplayer challenge</p>
              </div>
            </Card>
          </Link>
          )}
        </div>

        {/* Main Content Grid */}
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Left Column (2 Cols) */}
          <div className="lg:col-span-2 space-y-8">
            {/* Daily Recommended Tasks */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    Daily Recommended Tasks
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Study tasks suggested for you today
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                {data.dailyRecommendations.length === 0 ? (
                  <div className="text-center py-6 text-fg-secondary space-y-2">
                    <BookOpen className="w-8 h-8 mx-auto opacity-50" />
                    <p className="text-xs">No study tasks for today.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {data.dailyRecommendations.map((task) => (
                      <div
                        key={task.id}
                        className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100 hover:border-slate-200 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-7 h-7 rounded-lg bg-white flex items-center justify-center text-slate-400 shadow-2xs border border-slate-200">
                            {task.is_completed ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            ) : (
                              <Clock className="w-3.5 h-3.5" />
                            )}
                          </div>
                          <div>
                            <p className="text-xs font-bold text-slate-800">{task.task_title}</p>
                            <span className="text-[10px] text-slate-400 font-medium">
                              {task.task_type} â€¢ ~{task.estimated_minutes} mins
                            </span>
                          </div>
                        </div>
                        <Button size="sm" variant="outline" className="text-xs h-7">
                          Start
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Topic Mastery Heatmap */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Layers className="w-4 h-4 text-indigo-600" />
                    Topic Mastery Matrix
                  </CardTitle>
                  <CardDescription className="text-xs">
                    How well you know each topic, and how ready you are
                  </CardDescription>
                </div>
                <Link href="/practice" className="text-xs text-blue-600 font-semibold hover:underline flex items-center gap-1">
                  View All <ArrowRight className="w-3 h-3" />
                </Link>
              </CardHeader>
              <CardContent>
                {data.topicMastery.length === 0 ? (
                  <div className="text-center py-6 text-fg-secondary space-y-2">
                    <Layers className="w-8 h-8 mx-auto opacity-50" />
                    <p className="text-xs">Practice questions to build your topic mastery profile.</p>
                  </div>
                ) : (
                  <div className="grid sm:grid-cols-2 gap-3">
                    {data.topicMastery.map((tm) => (
                      <div key={tm.id} className="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-slate-800 truncate max-w-[150px]">{tm.topic_name}</span>
                          <span className="font-mono font-bold text-blue-600">{tm.mastery_percentage}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary-700 rounded-full transition-all"
                            style={{ width: `${Math.min(100, tm.mastery_percentage)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Column (1 Col) */}
          <div className="space-y-8">
            {/* Enrolled Batches */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <GraduationCap className="w-4 h-4 text-blue-600" />
                  Institutional Batches
                </CardTitle>
                <CardDescription className="text-xs">
                  Coaching batches you belong to
                </CardDescription>
              </CardHeader>
              <CardContent>
                {data.enrolledBatches.length === 0 ? (
                  <div className="text-center py-4 text-fg-secondary text-xs">
                    Not currently enrolled in an institutional cohort.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {data.enrolledBatches.map((b) => (
                      <div key={b.id} className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                        <div>
                          <p className="text-xs font-bold text-slate-900">{b.batch_name}</p>
                          <span className="text-[10px] text-slate-400">{b.institute_name}</span>
                        </div>
                        <Badge variant="indigo" className="text-[10px]">
                          {b.role}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Recent Learning Activity */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="w-4 h-4 text-slate-600" />
                  Recent Activity
                </CardTitle>
                <CardDescription className="text-xs">
                  What you studied recently
                </CardDescription>
              </CardHeader>
              <CardContent>
                {data.recentActivity.length === 0 ? (
                  <div className="text-center py-4 text-fg-secondary text-xs">
                    No recent activity recorded.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {data.recentActivity.map((act) => (
                      <div key={act.id} className="flex items-center justify-between text-xs border-b border-slate-100 pb-2 last:border-0 last:pb-0">
                        <div>
                          <p className="font-semibold text-slate-800">{act.event_type.replace(/_/g, " ")}</p>
                          <span className="text-[10px] text-slate-400">
                            {new Date(act.occurred_at).toLocaleDateString()}
                          </span>
                        </div>
                        <span className="font-mono text-slate-500 text-[10px]">
                          {Math.round(act.time_spent_seconds / 60)}m
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </Container>
    </div>
  );
}