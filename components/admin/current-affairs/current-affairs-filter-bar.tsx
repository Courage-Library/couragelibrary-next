'use client';

import React from 'react';
import { Search, X } from 'lucide-react';
import { ALL_CURRENT_AFFAIRS_CATEGORIES } from '@/types/current-affairs';
import { StudioField, studioControl, studioQuietAction } from '@/components/admin/studio/studio-page';

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

/** Courage Studio filter bar (phase 3 batch 1): visible labels on every control, ≥ 40 px targets, a live result count. */
export function CurrentAffairsFilterBar({ search, onSearchChange, category, onCategoryChange, importanceTier, onImportanceTierChange, date, onDateChange, onReset, totalCount }: Props) {
  const hasActiveFilters = search || category !== 'ALL' || importanceTier !== 'ALL' || date;
  return (
    <section aria-label="Filter current affairs" className="flex flex-wrap items-end gap-3 rounded-card border border-line bg-surface p-[14px]">
      <StudioField label="Search" htmlFor="ca-search" className="min-w-[14rem] flex-1">
        <div className="relative">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
          <input id="ca-search" type="search" placeholder="Headline or slug" value={search} onChange={(e) => onSearchChange(e.target.value)} className={`${studioControl} pl-9`} />
        </div>
      </StudioField>
      <StudioField label="Category" htmlFor="ca-category">
        <select id="ca-category" value={category} onChange={(e) => onCategoryChange(e.target.value)} className={studioControl}>
          <option value="ALL">All categories</option>
          {ALL_CURRENT_AFFAIRS_CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {cat.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
      </StudioField>
      <StudioField label="Importance" htmlFor="ca-importance">
        <select id="ca-importance" value={importanceTier} onChange={(e) => onImportanceTierChange(e.target.value)} className={studioControl}>
          <option value="ALL">All tiers</option>
          <option value="CRITICAL">Critical</option>
          <option value="HIGH">High</option>
          <option value="MEDIUM">Medium</option>
          <option value="LOW">Low</option>
        </select>
      </StudioField>
      <StudioField label="Date" htmlFor="ca-date">
        <input id="ca-date" type="date" value={date} onChange={(e) => onDateChange(e.target.value)} className={studioControl} />
      </StudioField>
      <div className="flex min-h-10 items-center gap-2">
        {hasActiveFilters && (
          <button type="button" onClick={onReset} className={studioQuietAction}>
            <X aria-hidden="true" className="size-4" />
            Clear filters
          </button>
        )}
        <p className="text-[13px] text-fg-secondary" aria-live="polite">
          {totalCount} {totalCount === 1 ? 'article' : 'articles'}
        </p>
      </div>
    </section>
  );
}
