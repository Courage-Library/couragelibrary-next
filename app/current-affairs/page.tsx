import React from 'react';
import Link from 'next/link';
import { Container } from '@/components/ui/container';
import { CurrentAffairsService } from '@/services/current-affairs.service';
import { CurrentAffairsDailyQuizCard } from '@/components/current-affairs/current-affairs-daily-quiz-card';
import { CurrentAffairsFeedContainer } from '@/components/current-affairs/current-affairs-feed-container';
import {
  Calendar,
  Sparkles,
  Archive,
  ArrowRight,
  Flame,
  Layers,
  History,
  TrendingUp,
} from 'lucide-react';
import { formatEventDate } from '@/components/current-affairs/current-affairs-card';
import { constructMetadata } from '@/lib/seo/metadata';

export const revalidate = 60; // ISR cache revalidation every 60 seconds

export const metadata = constructMetadata({
  title: 'Current Affairs — Exam-Oriented Daily Intelligence & Daily 10Q Quiz',
  description:
    'Curated, fact-checked daily Current Affairs intelligence mapped to competitive exam syllabi (UPSC, SSC, Banking, State PSC). Read structured event breakdowns, verified provenance, and evaluate your recall with the Daily 10Q Quiz.',
  canonicalUrl: '/current-affairs',
  keywords: [
    'Daily Current Affairs',
    'Current Affairs Quiz',
    'UPSC Current Affairs',
    'SSC CGL Current Affairs',
    'Banking General Awareness',
    'Courage Library Current Affairs',
  ],
  ogType: 'website',
});

export default async function CurrentAffairsHubPage() {
  const hubData = await CurrentAffairsService.getHubData();
  const { todayDate, todayFeed, recentArticles, categoryCounts, dailyQuiz } = hubData;

  const istYear = parseInt(todayDate.split('-')[0], 10);
  const istMonth = parseInt(todayDate.split('-')[1], 10);
  const monthSlug = `${istYear}-${String(istMonth).padStart(2, '0')}`;

  // Calculate past 7 days for quick date jump
  const pastDays: Array<{ date: string; label: string }> = [];
  const todayObj = new Date(todayDate);
  for (let i = 0; i < 7; i++) {
    const d = new Date(todayObj.getTime() - i * 86400000);
    const dateStr = d.toISOString().split('T')[0];
    const label = i === 0 ? 'Today' : i === 1 ? 'Yesterday' : formatEventDate(dateStr);
    pastDays.push({ date: dateStr, label });
  }

  return (
    <div className="min-h-screen bg-slate-50/50 dark:bg-slate-950 py-8 md:py-12">
      <Container className="space-y-10">
        {/* Hub Hero Header */}
        <div className="space-y-4 max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800 dark:bg-blue-950/70 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
            <Sparkles className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span>EXAM-ORIENTED EVENT INTELLIGENCE</span>
          </div>

          <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
            Current Affairs
          </h1>

          <p className="text-base md:text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
            Curated, fact-checked daily news intelligence mapped to competitive exam syllabi.
            Read structured event breakdowns, verified provenance, and evaluate your recall with the Daily 10Q Quiz.
          </p>
        </div>

        {/* Daily 10Q Quiz Section */}
        <section aria-labelledby="daily-quiz-heading">
          <CurrentAffairsDailyQuizCard dateStr={todayDate} dailyQuiz={dailyQuiz} />
        </section>

        {/* Date Jump Navigation Strip */}
        <nav aria-label="Recent Date Navigation" className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase text-slate-400 dark:text-slate-500 mr-2 shrink-0">
            <History className="w-3.5 h-3.5" />
            <span>Daily Feeds:</span>
          </div>

          {pastDays.map((pd) => {
            const isToday = pd.date === todayDate;
            return (
              <Link
                key={pd.date}
                href={isToday ? '/current-affairs' : `/current-affairs/date/${pd.date}`}
                className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                  isToday
                    ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-800'
                    : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-slate-300'
                }`}
              >
                {pd.label}
              </Link>
            );
          })}

          <Link
            href={`/current-affairs/month/${monthSlug}`}
            className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 hover:bg-slate-200 transition-colors border border-transparent"
          >
            <Archive className="w-3.5 h-3.5" />
            <span>Monthly Archive</span>
          </Link>
        </nav>

        {/* Today's Intelligence Feed */}
        <section aria-labelledby="today-feed-heading" className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <h2 id="today-feed-heading" className="text-xl md:text-2xl font-bold text-slate-900 dark:text-slate-100">
                Today&apos;s Published Intelligence
              </h2>
            </div>
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {formatEventDate(todayDate)} • {todayFeed.totalArticles} Event{todayFeed.totalArticles === 1 ? '' : 's'}
            </span>
          </div>

          {todayFeed.articles.length > 0 ? (
            <CurrentAffairsFeedContainer
              articles={todayFeed.articles}
              categoryCounts={categoryCounts}
              emptyTitle="No today's events matching filter"
              emptyDescription="Try selecting another category or clear your search."
            />
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-8 text-center space-y-2">
              <Calendar className="w-8 h-8 text-slate-400 mx-auto" />
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">
                Today&apos;s Events Being Processed
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                Articles for {formatEventDate(todayDate)} are undergoing 5-gate fact verification. Explore recent high-yield intelligence below.
              </p>
            </div>
          )}
        </section>

        {/* Recent Events Section */}
        {recentArticles.length > 0 && (
          <section aria-labelledby="recent-feed-heading" className="space-y-6 pt-6 border-t border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <TrendingUp className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                <h2 id="recent-feed-heading" className="text-xl md:text-2xl font-bold text-slate-900 dark:text-slate-100">
                  Recent High-Yield Intelligence
                </h2>
              </div>
              <Link
                href={`/current-affairs/month/${monthSlug}`}
                className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
              >
                <span>Browse Monthly Archives</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <CurrentAffairsFeedContainer
              articles={recentArticles}
              categoryCounts={categoryCounts}
            />
          </section>
        )}
      </Container>
    </div>
  );
}
