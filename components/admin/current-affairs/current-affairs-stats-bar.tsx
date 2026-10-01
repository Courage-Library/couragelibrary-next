'use client';

import React from 'react';
import { AdminCurrentAffairsDashboardStats } from '@/types/current-affairs';
import {
  FileText,
  Clock,
  CheckCircle2,
  Cpu,
  Globe2,
  Archive,
  AlertCircle,
  Layers,
} from 'lucide-react';

interface Props {
  stats: AdminCurrentAffairsDashboardStats | null;
  isLoading: boolean;
  selectedStatus: string;
  onSelectStatus: (status: string) => void;
}

export function CurrentAffairsStatsBar({
  stats,
  isLoading,
  selectedStatus,
  onSelectStatus,
}: Props) {
  const cards = [
    {
      id: 'ALL',
      label: 'Total Items',
      count: stats?.total || 0,
      icon: Layers,
      color: 'text-slate-700 bg-slate-100',
      activeBorder: 'border-slate-800 bg-slate-50',
    },
    {
      id: 'DRAFT',
      label: 'Drafts',
      count: stats?.draft || 0,
      icon: FileText,
      color: 'text-amber-700 bg-amber-50',
      activeBorder: 'border-amber-500 bg-amber-50/50',
    },
    {
      id: 'IN_REVIEW',
      label: 'In Review',
      count: stats?.inReview || 0,
      icon: Clock,
      color: 'text-blue-700 bg-blue-50',
      activeBorder: 'border-blue-500 bg-blue-50/50',
    },
    {
      id: 'APPROVED',
      label: 'Approved',
      count: stats?.approved || 0,
      icon: CheckCircle2,
      color: 'text-emerald-700 bg-emerald-50',
      activeBorder: 'border-emerald-500 bg-emerald-50/50',
    },
    {
      id: 'COMPILED',
      label: 'Compiled',
      count: stats?.compiled || 0,
      icon: Cpu,
      color: 'text-purple-700 bg-purple-50',
      activeBorder: 'border-purple-500 bg-purple-50/50',
    },
    {
      id: 'PUBLISHED',
      label: 'Published',
      count: stats?.published || 0,
      icon: Globe2,
      color: 'text-indigo-700 bg-indigo-50',
      activeBorder: 'border-indigo-500 bg-indigo-50/50',
    },
    {
      id: 'NEEDS_CHANGES',
      label: 'Needs Changes',
      count: stats?.needsChanges || 0,
      icon: AlertCircle,
      color: 'text-rose-700 bg-rose-50',
      activeBorder: 'border-rose-500 bg-rose-50/50',
    },
    {
      id: 'ARCHIVED',
      label: 'Archived',
      count: stats?.archived || 0,
      icon: Archive,
      color: 'text-slate-500 bg-slate-100',
      activeBorder: 'border-slate-500 bg-slate-100/50',
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
      {cards.map((card) => {
        const Icon = card.icon;
        const isSelected = selectedStatus === card.id;

        return (
          <button
            key={card.id}
            onClick={() => onSelectStatus(card.id)}
            className={`p-3 rounded-xl border text-left transition-all relative overflow-hidden ${
              isSelected
                ? `${card.activeBorder} shadow-xs ring-1 ring-blue-500`
                : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-slate-500 truncate block">
                {card.label}
              </span>
              <div className={`w-5 h-5 rounded-md flex items-center justify-center ${card.color}`}>
                <Icon className="w-3 h-3" />
              </div>
            </div>
            <div className="mt-1.5 text-lg font-bold text-slate-900 font-mono">
              {isLoading ? (
                <span className="inline-block w-6 h-5 bg-slate-200 animate-pulse rounded" />
              ) : (
                card.count
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
