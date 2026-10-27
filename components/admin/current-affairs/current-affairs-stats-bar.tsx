'use client';

import React from 'react';
import { AdminCurrentAffairsDashboardStats } from '@/types/current-affairs';
import { StudioStatStrip, type StudioStat } from '@/components/admin/studio/studio-page';

interface Props {
  stats: AdminCurrentAffairsDashboardStats | null;
  isLoading: boolean;
  selectedStatus: string;
  onSelectStatus: (status: string) => void;
}

/**
 * Courage Studio stat strip (phase 3 batch 1): each count filters the list (aria-pressed). While the counts are loading
 * or unreadable they show "–" — never a made-up 0 (R12).
 */
export function CurrentAffairsStatsBar({ stats, isLoading, selectedStatus, onSelectStatus }: Props) {
  const v = (n: number | undefined) => (isLoading || !stats ? null : n ?? 0);
  const items: StudioStat[] = [
    { key: 'ALL', label: 'All', value: v(stats?.total), tone: 'muted' },
    { key: 'DRAFT', label: 'Drafts', value: v(stats?.draft), tone: 'teal' },
    { key: 'IN_REVIEW', label: 'In review', value: v(stats?.inReview), tone: 'blue' },
    { key: 'NEEDS_CHANGES', label: 'Needs changes', value: v(stats?.needsChanges), tone: 'orange' },
    { key: 'APPROVED', label: 'Approved', value: v(stats?.approved), tone: 'green' },
    { key: 'COMPILED', label: 'Compiled', value: v(stats?.compiled), tone: 'green' },
    { key: 'PUBLISHED', label: 'Published', value: v(stats?.published), tone: 'green' },
    { key: 'ARCHIVED', label: 'Archived', value: v(stats?.archived), tone: 'muted' },
  ].map((s) => ({ ...s, active: selectedStatus === s.key }) as StudioStat);
  return <StudioStatStrip label="Current affairs by status (select to filter)" stats={items} onSelect={onSelectStatus} />;
}
