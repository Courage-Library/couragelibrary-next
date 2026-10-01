import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Container } from '@/components/ui/container';
import { CurrentAffairsService } from '@/services/current-affairs.service';
import { CurrentAffairsFeedContainer } from '@/components/current-affairs/current-affairs-feed-container';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  Archive,
  Layers,
} from 'lucide-react';
import { CurrentAffairsCategory } from '@/types/current-affairs';
import { constructMetadata } from '@/lib/seo/metadata';
import type { Metadata } from 'next';

export const revalidate = 60;

interface MonthArchivePageProps {
  params: Promise<{ month: string }>;
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export async function generateMetadata({ params }: MonthArchivePageProps): Promise<Metadata> {
  const { month } = await params;
  const monthRegex = /^(\d{4})-(\d{2})$/;
  const match = month.match(monthRegex);
  if (!match) {
    return constructMetadata({ title: 'Invalid Month', noIndex: true });
  }

  const year = parseInt(match[1], 10);
  const monthNum = parseInt(match[2], 10);
  if (monthNum < 1 || monthNum > 12) {
    return constructMetadata({ title: 'Invalid Month', noIndex: true });
  }

  const monthTitle = `${MONTH_NAMES[monthNum - 1]} ${year}`;
  const feed = await CurrentAffairsService.getMonthlyFeed(year, monthNum);

  // If there are 0 published events for this historical month, noIndex empty pages
  const noIndex = feed.totalArticles === 0;

  return constructMetadata({
    title: `Current Affairs — ${monthTitle}`,
    description: `Explore ${feed.totalArticles} exam-oriented current affairs event(s) across ${monthTitle}. Fact-checked news intelligence and syllabus mappings for government exam aspirants.`,
    canonicalUrl: `/current-affairs/month/${month}`,
    keywords: [`Current Affairs ${monthTitle}`, `Monthly Current Affairs ${month}`, 'Government Exam Intelligence'],
    noIndex,
    ogType: 'website',
  });
}

export default async function CurrentAffairsMonthlyArchivePage({ params }: MonthArchivePageProps) {
  const { month } = await params;

  // Validate YYYY-MM
  const monthRegex = /^(\d{4})-(\d{2})$/;
  const match = month.match(monthRegex);
  if (!match) {
    notFound();
  }

  const year = parseInt(match[1], 10);
  const monthNum = parseInt(match[2], 10);

  if (monthNum < 1 || monthNum > 12) {
    notFound();
  }

  const monthlyFeed = await CurrentAffairsService.getMonthlyFeed(year, monthNum);
  const monthTitle = `${MONTH_NAMES[monthNum - 1]} ${year}`;

  // Calculate prev and next months
  const prevMonthNum = monthNum === 1 ? 12 : monthNum - 1;
  const prevYear = monthNum === 1 ? year - 1 : year;
  const prevSlug = `${prevYear}-${String(prevMonthNum).padStart(2, '0')}`;

  const nextMonthNum = monthNum === 12 ? 1 : monthNum + 1;
  const nextYear = monthNum === 12 ? year + 1 : year;
  const nextSlug = `${nextYear}-${String(nextMonthNum).padStart(2, '0')}`;

  const todayDate = CurrentAffairsService.getTodayDateStr();
  const currentMonthSlug = todayDate.substring(0, 7);
  const hasNextMonth = month < currentMonthSlug;

  const categoryCounts = monthlyFeed.categoryBreakdown as Record<CurrentAffairsCategory, number>;

  return (
    <div className="min-h-screen bg-slate-50/50 dark:bg-slate-950 py-8 md:py-12">
      <Container className="space-y-8">
        {/* Top Breadcrumbs */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Link
            href="/current-affairs"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Current Affairs Hub</span>
          </Link>

          {/* Month Pager */}
          <div className="flex items-center gap-2">
            <Link
              href={`/current-affairs/month/${prevSlug}`}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>{MONTH_NAMES[prevMonthNum - 1]} {prevYear}</span>
            </Link>

            {hasNextMonth && (
              <Link
                href={`/current-affairs/month/${nextSlug}`}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 transition-colors"
              >
                <span>{MONTH_NAMES[nextMonthNum - 1]} {nextYear}</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            )}
          </div>
        </div>

        {/* Page Header */}
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 text-xs font-bold text-blue-600 dark:text-blue-400">
            <Archive className="w-4 h-4" />
            <span>MONTHLY HISTORICAL ARCHIVE</span>
          </div>

          <h1 className="text-2xl md:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
            Current Affairs — {monthTitle}
          </h1>

          <p className="text-sm text-slate-600 dark:text-slate-300">
            Comprehensive repository of {monthlyFeed.totalArticles} published event{monthlyFeed.totalArticles === 1 ? '' : 's'} across {monthTitle}.
          </p>
        </div>

        {/* Monthly Feed List */}
        <section aria-labelledby="monthly-articles-heading" className="space-y-6 pt-2">
          <h2 id="monthly-articles-heading" className="sr-only">
            Articles for {monthTitle}
          </h2>

          <CurrentAffairsFeedContainer
            articles={monthlyFeed.articles}
            categoryCounts={categoryCounts}
            emptyTitle={`No events recorded in ${monthTitle}`}
            emptyDescription="No published Current Affairs items were found for this month."
          />
        </section>
      </Container>
    </div>
  );
}
