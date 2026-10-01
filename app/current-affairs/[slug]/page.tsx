import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Container } from '@/components/ui/container';
import { CurrentAffairsService } from '@/services/current-affairs.service';
import { ExamMdxArticleRenderer } from '@/components/exams/exam-mdx-article-renderer';
import { CurrentAffairsSourcesCard } from '@/components/current-affairs/current-affairs-sources-card';
import { CurrentAffairsExamBadges } from '@/components/current-affairs/current-affairs-exam-badges';
import { CurrentAffairsLearningCta } from '@/components/current-affairs/current-affairs-learning-cta';
import { CurrentAffairsCard, formatEventDate } from '@/components/current-affairs/current-affairs-card';
import { constructMetadata } from '@/lib/seo/metadata';
import { generateArticleSchema, generateBreadcrumbSchema } from '@/lib/seo/jsonld';
import type { Metadata } from 'next';
import {
  Calendar,
  Layers,
  Sparkles,
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Share2,
  ChevronRight,
  Flame,
} from 'lucide-react';

export const revalidate = 60;

interface ArticleReaderPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: ArticleReaderPageProps): Promise<Metadata> {
  const { slug } = await params;
  const article = await CurrentAffairsService.getBySlug(slug);

  if (!article || article.status !== 'PUBLISHED') {
    return constructMetadata({
      title: 'Current Affairs Article Not Found',
      noIndex: true,
    });
  }

  const cleanDescription = (article.summaryMd || '')
    .replace(/[#*`_\[\]()]/g, '')
    .trim()
    .slice(0, 160);

  const keywords = [
    article.category.replace('_', ' '),
    'Daily Current Affairs',
    'General Awareness',
    'UPSC Current Affairs',
    'SSC CGL Current Affairs',
    ...article.examMappings.map((em) => em.examTitle),
  ].filter(Boolean);

  return constructMetadata({
    title: `${article.headline} — Current Affairs`,
    description: cleanDescription || `Exam-oriented analysis and key takeaways for ${article.headline}.`,
    canonicalUrl: `/current-affairs/${article.slug}`,
    keywords,
    ogType: 'article',
    publishedTime: article.publishedAt || undefined,
    modifiedTime: article.publishedAt || undefined,
  });
}

export default async function CurrentAffairsArticleReaderPage({ params }: ArticleReaderPageProps) {
  const { slug } = await params;
  const article = await CurrentAffairsService.getBySlug(slug);

  if (!article || article.status !== 'PUBLISHED') {
    notFound();
  }

  const formattedEventDate = formatEventDate(article.newsDate);

  const cleanDescription = (article.summaryMd || '')
    .replace(/[#*`_\[\]()]/g, '')
    .trim()
    .slice(0, 160);

  // Structured Data (NewsArticle & Breadcrumbs)
  const articleSchema = generateArticleSchema({
    headline: article.headline,
    description: cleanDescription || article.headline,
    url: `/current-affairs/${article.slug}`,
    datePublished: article.publishedAt || new Date().toISOString(),
    dateModified: article.publishedAt || new Date().toISOString(),
    articleType: 'NewsArticle',
  });

  const breadcrumbSchema = generateBreadcrumbSchema([
    { label: 'Home', href: '/' },
    { label: 'Current Affairs', href: '/current-affairs' },
    { label: formattedEventDate, href: `/current-affairs/date/${article.newsDate}` },
    { label: article.headline, href: `/current-affairs/${article.slug}` },
  ]);

  return (
    <div className="min-h-screen bg-slate-50/50 dark:bg-slate-950 py-8 md:py-12">
      {/* JSON-LD Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
      <Container className="max-w-4xl space-y-8">
        {/* Breadcrumb Navigation */}
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 overflow-x-auto whitespace-nowrap pb-1">
          <Link href="/" className="hover:text-blue-600 transition-colors">
            Home
          </Link>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <Link href="/current-affairs" className="hover:text-blue-600 transition-colors">
            Current Affairs
          </Link>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <Link
            href={`/current-affairs/date/${article.newsDate}`}
            className="hover:text-blue-600 transition-colors"
          >
            {formattedEventDate}
          </Link>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span className="text-slate-800 dark:text-slate-200 font-semibold truncate max-w-[200px] sm:max-w-xs">
            {article.headline}
          </span>
        </nav>

        {/* Back Link */}
        <div>
          <Link
            href={`/current-affairs/date/${article.newsDate}`}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-blue-600 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to {formattedEventDate} Intelligence Feed</span>
          </Link>
        </div>

        {/* Article Main Header */}
        <header className="space-y-4 pt-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800 dark:bg-blue-950/70 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
              {article.category.replace('_', ' ')}
            </span>

            {article.importanceTier === 'CRITICAL' && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-200 border border-rose-300">
                <Flame className="w-3.5 h-3.5 text-rose-600 animate-pulse" />
                CRITICAL EVENT
              </span>
            )}
            {article.importanceTier === 'HIGH' && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-200 border border-amber-300">
                HIGH YIELD
              </span>
            )}

            <div className="flex items-center text-xs text-slate-500 dark:text-slate-400 font-medium ml-auto">
              <Calendar className="w-3.5 h-3.5 mr-1 text-slate-400" />
              <span>Event Date: {formattedEventDate}</span>
            </div>
          </div>

          <h1 className="text-2xl md:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100 leading-tight">
            {article.headline}
          </h1>
        </header>

        {/* Key Takeaways & Exam Summary Callout */}
        {article.keyTakeaways && article.keyTakeaways.length > 0 && (
          <section
            aria-labelledby="key-takeaways-heading"
            className="rounded-2xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/50 dark:bg-amber-950/20 p-5 md:p-6 shadow-sm"
          >
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              <h2 id="key-takeaways-heading" className="text-base font-bold text-amber-900 dark:text-amber-200">
                Key Exam Takeaways
              </h2>
            </div>
            <ul className="space-y-2 text-sm text-slate-800 dark:text-slate-200">
              {article.keyTakeaways.map((point, idx) => (
                <li key={idx} className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Important Facts Section (if present) */}
        {article.importantFacts && article.importantFacts.length > 0 && (
          <section
            aria-labelledby="important-facts-heading"
            className="rounded-2xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/30 dark:bg-blue-950/20 p-5 md:p-6 shadow-sm"
          >
            <h2 id="important-facts-heading" className="text-sm font-bold uppercase tracking-wider text-blue-900 dark:text-blue-300 mb-3">
              Important Memorization Points
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {article.importantFacts.map((fact, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-xs font-medium text-slate-800 dark:text-slate-200"
                >
                  {fact}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Structured Analysis Body via ExamMdxArticleRenderer */}
        <article className="prose prose-slate dark:prose-invert max-w-none pt-2">
          <ExamMdxArticleRenderer content={article.summaryMd} />
        </article>

        {/* Exam Applicability Badges */}
        {article.examMappings && article.examMappings.length > 0 && (
          <CurrentAffairsExamBadges
            examMappings={article.examMappings}
            examRelevanceNotes={article.examRelevanceNotes}
          />
        )}

        {/* Learning Unit & Question CTAs */}
        <CurrentAffairsLearningCta
          learningUnits={article.relatedLearningUnits}
          questions={article.relatedQuestions}
        />

        {/* Verified Sources & Fact Provenance */}
        {article.sources && article.sources.length > 0 && (
          <CurrentAffairsSourcesCard sources={article.sources} />
        )}

        {/* Related Articles in Same Category */}
        {article.relatedArticles && article.relatedArticles.length > 0 && (
          <section aria-labelledby="related-articles-heading" className="pt-8 border-t border-slate-200 dark:border-slate-800 space-y-4">
            <h2 id="related-articles-heading" className="text-lg font-bold text-slate-900 dark:text-slate-100">
              Related {article.category.replace('_', ' ')} Intelligence
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {article.relatedArticles.map((rel) => (
                <Link
                  key={rel.id}
                  href={`/current-affairs/${rel.slug}`}
                  className="group block p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-blue-400 dark:hover:border-blue-500 transition-colors shadow-sm"
                >
                  <div className="flex items-center justify-between gap-2 text-xs text-slate-500 mb-1.5">
                    <span>{formatEventDate(rel.newsDate)}</span>
                    <span className="font-semibold text-blue-600 dark:text-blue-400">{rel.category.replace('_', ' ')}</span>
                  </div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 group-hover:text-blue-600 transition-colors line-clamp-2">
                    {rel.headline}
                  </h3>
                </Link>
              ))}
            </div>
          </section>
        )}
      </Container>
    </div>
  );
}
