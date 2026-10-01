'use client';

import React, { useState, useMemo } from 'react';
import {
  CurrentAffairsFeedItem,
  CurrentAffairsCategory,
  CurrentAffairsImportanceTier,
} from '@/types/current-affairs';
import { CurrentAffairsCard } from './current-affairs-card';
import { CurrentAffairsFilters } from './current-affairs-filters';
import { Layers, Newspaper } from 'lucide-react';

interface CurrentAffairsFeedContainerProps {
  articles: CurrentAffairsFeedItem[];
  categoryCounts?: Record<CurrentAffairsCategory, number>;
  emptyTitle?: string;
  emptyDescription?: string;
}

export const CurrentAffairsFeedContainer: React.FC<CurrentAffairsFeedContainerProps> = ({
  articles,
  categoryCounts,
  emptyTitle = 'No events found',
  emptyDescription = 'Try selecting another category or clearing your search filter.',
}) => {
  const [selectedCategory, setSelectedCategory] = useState<CurrentAffairsCategory | 'ALL'>('ALL');
  const [selectedImportance, setSelectedImportance] = useState<CurrentAffairsImportanceTier | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredArticles = useMemo(() => {
    return articles.filter((item) => {
      // Category filter
      if (selectedCategory !== 'ALL' && item.category !== selectedCategory) {
        return false;
      }

      // Importance filter
      if (selectedImportance !== 'ALL' && item.importanceTier !== selectedImportance) {
        return false;
      }

      // Search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const inHeadline = item.headline.toLowerCase().includes(query);
        const inSummary = item.summaryMd.toLowerCase().includes(query);
        const inTakeaways = (item.keyTakeaways || []).some((t) => t.toLowerCase().includes(query));
        if (!inHeadline && !inSummary && !inTakeaways) {
          return false;
        }
      }

      return true;
    });
  }, [articles, selectedCategory, selectedImportance, searchQuery]);

  return (
    <div className="space-y-6">
      <CurrentAffairsFilters
        selectedCategory={selectedCategory}
        onCategoryChange={setSelectedCategory}
        selectedImportance={selectedImportance}
        onImportanceChange={setSelectedImportance}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        categoryCounts={categoryCounts}
        totalCount={articles.length}
      />

      {filteredArticles.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredArticles.map((article) => (
            <CurrentAffairsCard key={article.id} article={article} />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 p-12 text-center">
          <Newspaper className="w-10 h-10 text-slate-400 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-1">
            {emptyTitle}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
            {emptyDescription}
          </p>
          {(selectedCategory !== 'ALL' || selectedImportance !== 'ALL' || searchQuery) && (
            <button
              onClick={() => {
                setSelectedCategory('ALL');
                setSelectedImportance('ALL');
                setSearchQuery('');
              }}
              className="mt-4 px-4 py-2 rounded-xl text-xs font-semibold bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 hover:bg-blue-100 transition-colors"
            >
              Reset Filters
            </button>
          )}
        </div>
      )}
    </div>
  );
};
