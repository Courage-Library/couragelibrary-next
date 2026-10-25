import React from 'react';
import Link from 'next/link';
import { Container } from '@/components/ui/legacy/container';
import { CurrentAffairsService } from '@/services/current-affairs.service';
import { CurrentAffairsDailyQuizCard } from '@/components/current-affairs/current-affairs-daily-quiz-card';
import { CurrentAffairsFeedContainer } from '@/components/current-affairs/current-affairs-feed-container';
import {
  Calendar,
  Archive,
  ArrowRight,
  Flame,
  Layers,
  History,
  TrendingUp,
} from 'lucide-react';
import { formatEventDate } from '@/lib/current-affairs/format-event-date';
import { dailyQuizShape } from '@/lib/current-affairs/daily-quiz';
import { constructMetadata } from '@/lib/seo/metadata';

export const revalidate = 60; // ISR cache revalidation every 60 seconds

export const metadata = constructMetadata({
  title: 'Current Affairs for Government Exams',
  description:
    'Daily current affairs for Indian government exams: each event with its key facts, sources and the exams it matters for. Practice with the daily quiz when one is published.',
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
  // F7 (R12): the quiz card states only the published mock's own facts
  const quizShape = dailyQuiz.status === 'ALREADY_PUBLISHED' ? await dailyQuizShape(dailyQuiz.mockTestId) : null;
  // newest PUBLISHED news date other than today (recentArticles: status PUBLISHED, ordered by news_date desc)
  const latestPublishedDate =
    recentArticles.map((a) => String(a.newsDate || '').slice(0, 10)).find((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && d !== todayDate) || null;

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
    <div className="min-h-screen bg-canvas py-8 md:py-12">
      <Container className="space-y-10">
        {/* Hub Hero Header */}
        <div className="space-y-4 max-w-3xl">
          <h1 className="text-h1 font-bold text-fg">
            Current Affairs
          </h1>

          <p className="text-base md:text-lg text-fg-secondary leading-relaxed">
            Daily current affairs for government exams. Each event comes with its key facts, its sources and the exams it
            matters for, and you can practice with the daily quiz when one is published.
          </p>
        </div>

        {/* Daily 10Q Quiz Section: only when today's quiz mock is published (UX-2b.H, H-5) */}
        {dailyQuiz.status === 'ALREADY_PUBLISHED' && (
          <section aria-labelledby="daily-quiz-heading">
            <CurrentAffairsDailyQuizCard dateStr={todayDate} dailyQuiz={dailyQuiz} shape={quizShape} />
          </section>
        )}

        {/* Date Jump Navigation Strip */}
        <nav aria-label="Recent days" className="flex items-center gap-2 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex items-center gap-1.5 text-body-sm font-semibold text-fg-secondary mr-2 shrink-0">
            <History aria-hidden="true" className="w-4 h-4" />
            <span>Days:</span>
          </div>

          {pastDays.map((pd) => {
            const isToday = pd.date === todayDate;
            return (
              <Link
                key={pd.date}
                href={isToday ? '/current-affairs' : `/current-affairs/date/${pd.date}`}
                aria-current={isToday ? 'page' : undefined}
                className={`focus-ring inline-flex min-h-12 shrink-0 items-center rounded-control border px-3 text-body-sm font-semibold ${
                  isToday ? 'border-2 border-primary-600 bg-primary-50 text-fg' : 'border-line bg-surface text-fg hover:bg-ink-50'
                }`}
              >
                {pd.label}
              </Link>
            );
          })}

          <Link
            href={`/current-affairs/month/${monthSlug}`}
            className="focus-ring shrink-0 inline-flex min-h-12 items-center gap-1 rounded-control border border-line bg-surface px-3 text-body-sm font-semibold text-fg hover:bg-ink-50"
          >
            <Archive aria-hidden="true" className="w-4 h-4" />
            <span>Monthly archive</span>
          </Link>
        </nav>

        {/* Today's Intelligence Feed */}
        <section aria-labelledby="today-feed-heading" className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <h2 id="today-feed-heading" className="text-h2 font-bold text-fg">
                Today&apos;s current affairs
              </h2>
            </div>
            <span className="text-body-sm text-fg-secondary">
              {formatEventDate(todayDate)} • {todayFeed.totalArticles} Event{todayFeed.totalArticles === 1 ? '' : 's'}
            </span>
          </div>

          {todayFeed.articles.length > 0 ? (
            <CurrentAffairsFeedContainer
              articles={todayFeed.articles}
              categoryCounts={categoryCounts}
              emptyTitle="No events today match this filter"
              emptyDescription="Try selecting another category or clear your search."
            />
          ) : (
            // UX-2b.H (H-3): say only what is true. The latest published day comes from recentArticles, which the
            // service already reads from PUBLISHED articles only, newest news_date first (no new query).
            <div className="rounded-card border border-dashed border-line bg-surface p-8 text-center space-y-3">
              <Calendar aria-hidden="true" className="w-8 h-8 text-fg-muted mx-auto" />
              <h3 className="text-h3 font-semibold text-fg">
                No current affairs published for {formatEventDate(todayDate)} yet.
              </h3>
              {latestPublishedDate ? (
                <p className="text-body text-fg-secondary">
                  <Link
                    href={`/current-affairs/date/${latestPublishedDate}`}
                    className="font-medium text-link underline underline-offset-2 hover:text-primary-700"
                  >
                    Read the latest published day: {formatEventDate(latestPublishedDate)}
                  </Link>
                </p>
              ) : (
                <p className="text-body text-fg-secondary">Nothing has been published yet. Check back later.</p>
              )}
            </div>
          )}
        </section>

        {/* Recent Events Section */}
        {recentArticles.length > 0 && (
          <section aria-labelledby="recent-feed-heading" className="space-y-6 pt-6 border-t border-line">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <TrendingUp aria-hidden="true" className="w-5 h-5 text-primary-700" />
                <h2 id="recent-feed-heading" className="text-h2 font-bold text-fg">
                  Recently published
                </h2>
              </div>
              <Link
                href={`/current-affairs/month/${monthSlug}`}
                className="focus-ring inline-flex min-h-12 items-center gap-1 text-body-sm font-semibold text-link hover:underline"
              >
                <span>Monthly archive</span>
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
