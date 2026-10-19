'use client';

import React from 'react';
import Link from 'next/link';
import { formatEventDate } from '@/lib/current-affairs/format-event-date';
import {
  Calendar,
  Layers,
  BookOpen,
  HelpCircle,
  FileText,
  ChevronRight,
  Flame,
} from 'lucide-react';
import {
  CurrentAffairsFeedItem,
  CurrentAffairsCategory,
  CurrentAffairsImportanceTier,
} from '@/types/current-affairs';

interface CurrentAffairsCardProps {
  article: CurrentAffairsFeedItem;
  showSnippet?: boolean;
}

const CATEGORY_COLORS: Record<CurrentAffairsCategory, { bg: string; text: string; border: string }> = {
  NATIONAL: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  INTERNATIONAL: { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' },
  ECONOMY: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  DEFENCE: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
  SCIENCE_TECH: { bg: 'bg-cyan-50', text: 'text-cyan-700', border: 'border-cyan-200' },
  ENVIRONMENT: { bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-200' },
  GOVT_SCHEMES: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  SPORTS: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
  AWARDS_HONOURS: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
  PERSONS_IN_NEWS: { bg: 'bg-pink-50', text: 'text-pink-700', border: 'border-pink-200' },
  IMPORTANT_DAYS: { bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200' },
  STATE_SPECIFIC: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' },
};

const IMPORTANCE_BADGES: Record<CurrentAffairsImportanceTier, { label: string; className: string }> = {
  CRITICAL: { label: 'CRITICAL', className: 'bg-rose-100 text-rose-800 border-rose-300' },
  HIGH: { label: 'HIGH YIELD', className: 'bg-amber-100 text-amber-800 border-amber-300' },
  MEDIUM: { label: 'MEDIUM', className: 'bg-slate-100 text-slate-700 border-slate-200' },
  LOW: { label: 'STANDARD', className: 'bg-slate-50 text-slate-600 border-slate-200' },
};


export const CurrentAffairsCard: React.FC<CurrentAffairsCardProps> = ({
  article,
  showSnippet = true,
}) => {
  const catStyle = CATEGORY_COLORS[article.category] || CATEGORY_COLORS.NATIONAL;
  const impBadge = IMPORTANCE_BADGES[article.importanceTier] || IMPORTANCE_BADGES.MEDIUM;
  const formattedDate = formatEventDate(article.newsDate);

  return (
    <article className="group relative flex flex-col justify-between rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm hover:shadow-md transition-all duration-200 hover:border-blue-400/50">
      <div>
        {/* Top Badges */}
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${catStyle.bg} ${catStyle.text} ${catStyle.border}`}
            >
              {article.category.replace('_', ' ')}
            </span>

            {article.importanceTier === 'CRITICAL' && (
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border ${impBadge.className}`}>
                <Flame className="w-3 h-3 text-rose-600 animate-pulse" />
                {impBadge.label}
              </span>
            )}
            {article.importanceTier === 'HIGH' && (
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${impBadge.className}`}>
                {impBadge.label}
              </span>
            )}
          </div>

          <div className="flex items-center text-xs text-slate-500 font-medium">
            <Calendar className="w-3.5 h-3.5 mr-1 text-slate-400" />
            <time dateTime={article.newsDate}>{formattedDate}</time>
          </div>
        </div>

        {/* Headline */}
        <h3 className="text-base font-bold text-slate-900 group-hover:text-blue-600 transition-colors line-clamp-2 mb-2 leading-snug">
          <Link href={`/current-affairs/${article.slug}`} className="focus:outline-none focus:ring-2 focus:ring-blue-500 rounded">
            <span className="absolute inset-0" aria-hidden="true" />
            {article.headline}
          </Link>
        </h3>

        {/* Takeaway / Summary Snippet */}
        {showSnippet && (
          <div className="text-xs text-slate-600 line-clamp-3 mb-4 space-y-1">
            {article.keyTakeaways && article.keyTakeaways.length > 0 ? (
              <ul className="list-disc pl-4 space-y-0.5 text-slate-600">
                {article.keyTakeaways.slice(0, 2).map((point, idx) => (
                  <li key={idx} className="line-clamp-1">
                    {point}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="line-clamp-2">{article.summaryMd.replace(/[#*`_]/g, '')}</p>
            )}
          </div>
        )}
      </div>

      {/* Footer Metrics & CTA */}
      <div className="pt-3 mt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
        <div className="flex items-center gap-3">
          {article.sourcesCount > 0 && (
            <span className="inline-flex items-center gap-1" title={`${article.sourcesCount} ${article.sourcesCount === 1 ? 'source' : 'sources'}`}>
              <FileText aria-hidden="true" className="w-3.5 h-3.5 text-fg-secondary" />
              <span>{article.sourcesCount}</span>
              <span className="sr-only">{article.sourcesCount === 1 ? 'source' : 'sources'}</span>
            </span>
          )}

          {article.mappedQuestionsCount > 0 && (
            <span className="inline-flex items-center gap-1 text-blue-600 font-medium" title={`${article.mappedQuestionsCount} Practice Questions`}>
              <HelpCircle className="w-3.5 h-3.5" />
              <span>{article.mappedQuestionsCount}Q</span>
            </span>
          )}

          {article.mappedLearningUnitsCount > 0 && (
            <span className="inline-flex items-center gap-1 text-purple-600 font-medium" title="Linked to Core Learning Resource">
              <BookOpen className="w-3.5 h-3.5" />
              <span>Learn</span>
            </span>
          )}
        </div>

        <span className="inline-flex items-center gap-0.5 font-semibold text-blue-600 group-hover:translate-x-0.5 transition-transform">
          Read Analysis
          <ChevronRight className="w-3.5 h-3.5" />
        </span>
      </div>
    </article>
  );
};
