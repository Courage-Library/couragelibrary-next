'use client';

import React from 'react';
import { ExternalLink, ShieldCheck, Building2, Newspaper, FileText, CheckCircle } from 'lucide-react';
import { CurrentAffairsSourceTier } from '@/types/current-affairs';

interface SourceItem {
  id: string;
  title: string;
  publisher: string;
  url: string;
  tier: CurrentAffairsSourceTier;
  citationContext?: string | null;
}

interface CurrentAffairsSourcesCardProps {
  sources: SourceItem[];
}

const TIER_CONFIG: Record<
  CurrentAffairsSourceTier,
  { label: string; badgeClass: string; icon: React.ComponentType<{ className?: string }> }
> = {
  TIER_1: {
    label: 'Tier 1 — Official Govt / Statutory',
    badgeClass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800',
    icon: Building2,
  },
  TIER_2: {
    label: 'Tier 2 — Institutional / Multilateral',
    badgeClass: 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border-blue-300 dark:border-blue-800',
    icon: ShieldCheck,
  },
  TIER_3: {
    label: 'Tier 3 — Verified National Press',
    badgeClass: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 border-indigo-300 dark:border-indigo-800',
    icon: Newspaper,
  },
  TIER_4: {
    label: 'Tier 4 — Secondary Reference',
    badgeClass: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-300 dark:border-slate-700',
    icon: FileText,
  },
};

export const CurrentAffairsSourcesCard: React.FC<CurrentAffairsSourcesCardProps> = ({ sources }) => {
  if (!sources || sources.length === 0) return null;

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 p-5 md:p-6 my-8">
      <div className="flex items-center gap-2.5 mb-4">
        <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
        <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
          Verified Sources &amp; Fact Provenance
        </h3>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
        Every event point is audited against authoritative government, statutory, or verified national journalistic sources.
      </p>

      <div className="space-y-3">
        {sources.map((source, index) => {
          const tierInfo = TIER_CONFIG[source.tier] || TIER_CONFIG.TIER_3;
          const TierIcon = tierInfo.icon;

          return (
            <div
              key={source.id || index}
              className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm"
            >
              <div className="space-y-1.5 min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${tierInfo.badgeClass}`}
                  >
                    <TierIcon className="w-3 h-3" />
                    {tierInfo.label}
                  </span>
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    {source.publisher}
                  </span>
                </div>

                <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 break-words">
                  {source.title}
                </h4>

                {source.citationContext && (
                  <p className="text-xs text-slate-600 dark:text-slate-400 italic">
                    &ldquo;{source.citationContext}&rdquo;
                  </p>
                )}
              </div>

              {source.url && (
                <div className="shrink-0 pt-1 sm:pt-0">
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 dark:hover:bg-blue-900/60 transition-colors"
                  >
                    <span>Inspect Source</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
