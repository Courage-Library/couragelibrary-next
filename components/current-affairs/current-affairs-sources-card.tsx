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
    label: 'Tier 1 — Official government / statutory',
    badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    icon: Building2,
  },
  TIER_2: {
    label: 'Tier 2 — Intergovernmental / public institution',
    badgeClass: 'bg-blue-100 text-blue-800 border-blue-300',
    icon: ShieldCheck,
  },
  TIER_3: {
    label: 'Tier 3 — Reputable national media',
    badgeClass: 'bg-indigo-100 text-indigo-800 border-indigo-300',
    icon: Newspaper,
  },
  TIER_4: {
    label: 'Tier 4 — Secondary (blogs, social media, coaching)',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-300',
    icon: FileText,
  },
};

export const CurrentAffairsSourcesCard: React.FC<CurrentAffairsSourcesCardProps> = ({ sources }) => {
  if (!sources || sources.length === 0) return null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-5 md:p-6 my-8">
      <div className="flex items-center gap-2.5 mb-4">
        <FileText aria-hidden="true" className="w-5 h-5 text-fg-secondary shrink-0" />
        <h3 className="text-base font-bold text-slate-900">Sources</h3>
      </div>
      {/* UX-2b.H2 (E-5): the real process (admin-current-affairs.service: validation gates, staff approval, publish) */}
      <p className="text-xs text-fg-secondary mb-4">
        Every published item passes automated checks and a review by our staff before it goes live. Its sources are listed
        below by tier.
      </p>

      <div className="space-y-3">
        {sources.map((source, index) => {
          const tierInfo = TIER_CONFIG[source.tier] || TIER_CONFIG.TIER_3;
          const TierIcon = tierInfo.icon;

          return (
            <div
              key={source.id || index}
              className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 p-3.5 rounded-xl bg-white border border-slate-200/80 shadow-sm"
            >
              <div className="space-y-1.5 min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${tierInfo.badgeClass}`}
                  >
                    <TierIcon className="w-3 h-3" />
                    {tierInfo.label}
                  </span>
                  <span className="text-xs font-bold text-slate-700">
                    {source.publisher}
                  </span>
                </div>

                <h4 className="text-sm font-semibold text-slate-900 break-words">
                  {source.title}
                </h4>

                {source.citationContext && (
                  <p className="text-xs text-slate-600 italic">
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
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors"
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
