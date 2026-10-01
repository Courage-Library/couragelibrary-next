'use client';

import React from 'react';
import { Search, Filter, Calendar, X } from 'lucide-react';
import { ALL_CURRENT_AFFAIRS_CATEGORIES } from '@/types/current-affairs';

interface Props {
  search: string;
  onSearchChange: (val: string) => void;
  category: string;
  onCategoryChange: (val: string) => void;
  importanceTier: string;
  onImportanceTierChange: (val: string) => void;
  date: string;
  onDateChange: (val: string) => void;
  onReset: () => void;
  totalCount: number;
}

export function CurrentAffairsFilterBar({
  search,
  onSearchChange,
  category,
  onCategoryChange,
  importanceTier,
  onImportanceTierChange,
  date,
  onDateChange,
  onReset,
  totalCount,
}: Props) {
  const hasActiveFilters = search || category !== 'ALL' || importanceTier !== 'ALL' || date;

  return (
    <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs space-y-3">
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by headline or slug..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-9 pr-4 py-1.5 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
          {search && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Dropdowns & Date */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Category */}
          <div className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded-lg border border-slate-200 text-xs">
            <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <select
              value={category}
              onChange={(e) => onCategoryChange(e.target.value)}
              aria-label="Filter by Category"
              className="bg-transparent border-none text-xs text-slate-700 font-medium focus:outline-none cursor-pointer"
            >
              <option value="ALL">All Categories</option>
              {ALL_CURRENT_AFFAIRS_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </div>

          {/* Importance */}
          <div className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded-lg border border-slate-200 text-xs">
            <select
              value={importanceTier}
              onChange={(e) => onImportanceTierChange(e.target.value)}
              aria-label="Filter by Importance"
              className="bg-transparent border-none text-xs text-slate-700 font-medium focus:outline-none cursor-pointer"
            >
              <option value="ALL">All Tiers</option>
              <option value="CRITICAL">Critical</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>
          </div>

          {/* Date */}
          <div className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded-lg border border-slate-200 text-xs">
            <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <input
              type="date"
              value={date}
              onChange={(e) => onDateChange(e.target.value)}
              aria-label="Filter by Date"
              className="bg-transparent border-none text-xs text-slate-700 font-medium focus:outline-none cursor-pointer"
            />
          </div>

          {hasActiveFilters && (
            <button
              onClick={onReset}
              className="px-2.5 py-1 text-xs text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-md transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-100 font-mono">
        <span>Showing {totalCount} matching articles</span>
      </div>
    </div>
  );
}
