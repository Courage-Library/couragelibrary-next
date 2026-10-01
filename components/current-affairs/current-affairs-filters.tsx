'use client';

import React from 'react';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import {
  CurrentAffairsCategory,
  CurrentAffairsImportanceTier,
  ALL_CURRENT_AFFAIRS_CATEGORIES,
} from '@/types/current-affairs';

interface CurrentAffairsFiltersProps {
  selectedCategory: CurrentAffairsCategory | 'ALL';
  onCategoryChange: (category: CurrentAffairsCategory | 'ALL') => void;
  selectedImportance?: CurrentAffairsImportanceTier | 'ALL';
  onImportanceChange?: (tier: CurrentAffairsImportanceTier | 'ALL') => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  categoryCounts?: Record<CurrentAffairsCategory, number>;
  totalCount?: number;
}

const CATEGORY_DISPLAY_NAMES: Record<CurrentAffairsCategory, string> = {
  NATIONAL: 'National',
  INTERNATIONAL: 'International',
  ECONOMY: 'Economy',
  DEFENCE: 'Defence',
  SCIENCE_TECH: 'Science & Tech',
  ENVIRONMENT: 'Environment',
  GOVT_SCHEMES: 'Govt Schemes',
  SPORTS: 'Sports',
  AWARDS_HONOURS: 'Awards & Honours',
  PERSONS_IN_NEWS: 'Persons in News',
  IMPORTANT_DAYS: 'Important Days',
  STATE_SPECIFIC: 'State Specific',
};

export const CurrentAffairsFilters: React.FC<CurrentAffairsFiltersProps> = ({
  selectedCategory,
  onCategoryChange,
  selectedImportance = 'ALL',
  onImportanceChange,
  searchQuery,
  onSearchChange,
  categoryCounts,
  totalCount,
}) => {
  return (
    <div className="space-y-4 mb-6">
      {/* Search & Importance Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        {/* Search input */}
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search events, topics, keywords..."
            className="w-full pl-10 pr-9 py-2 rounded-xl text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              aria-label="Clear search"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Importance Tier Filter */}
        {onImportanceChange && (
          <div className="flex items-center gap-2 shrink-0">
            <SlidersHorizontal className="w-4 h-4 text-slate-400" />
            <select
              value={selectedImportance}
              onChange={(e) => onImportanceChange(e.target.value as CurrentAffairsImportanceTier | 'ALL')}
              className="px-3 py-2 rounded-xl text-xs font-semibold bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="ALL">All Importance</option>
              <option value="CRITICAL">Critical Only</option>
              <option value="HIGH">High Yield</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Standard</option>
            </select>
          </div>
        )}
      </div>

      {/* Category Pills Scrolling Container */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-800 no-scrollbar">
        <button
          onClick={() => onCategoryChange('ALL')}
          className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all ${
            selectedCategory === 'ALL'
              ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
              : 'bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
          }`}
        >
          All {totalCount !== undefined && `(${totalCount})`}
        </button>

        {ALL_CURRENT_AFFAIRS_CATEGORIES.map((cat) => {
          const count = categoryCounts ? categoryCounts[cat] : undefined;
          const isSelected = selectedCategory === cat;
          return (
            <button
              key={cat}
              onClick={() => onCategoryChange(cat)}
              className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-medium transition-all ${
                isSelected
                  ? 'bg-blue-600 text-white font-semibold shadow-sm shadow-blue-500/20'
                  : 'bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {CATEGORY_DISPLAY_NAMES[cat]}
              {count !== undefined && count > 0 && (
                <span className={`ml-1.5 text-[11px] opacity-80 ${isSelected ? 'text-blue-100' : 'text-slate-500'}`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
