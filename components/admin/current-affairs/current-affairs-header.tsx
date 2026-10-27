'use client';

import React from 'react';
import { Plus, Sparkles, Wand2, RefreshCw, ListChecks } from 'lucide-react';
import { StudioPageHeader, studioPrimaryAction, studioQuietAction } from '@/components/admin/studio/studio-page';

interface Props {
  onOpenCreate: () => void;
  onOpenImport: () => void;
  onOpenPrompt: () => void;
  onOpenQuiz?: () => void;
  onRefresh: () => void;
  isRefreshing: boolean;
}

/** Courage Studio template (phase 3 batch 1): title + one line; ONE primary ("New current affair"); quiet secondary actions. */
export function CurrentAffairsHeader({ onOpenCreate, onOpenImport, onOpenPrompt, onOpenQuiz, onRefresh, isRefreshing }: Props) {
  return (
    <StudioPageHeader
      title="Current affairs"
      description="Daily news for students: write or import, review, compile and publish."
      actions={
        <>
          <button type="button" onClick={onRefresh} disabled={isRefreshing} className={studioQuietAction} aria-label="Refresh the list and counts">
            <RefreshCw aria-hidden="true" className={`size-4 ${isRefreshing ? 'motion-safe:animate-spin' : ''}`} />
            Refresh
          </button>
          {onOpenQuiz && (
            <button type="button" onClick={onOpenQuiz} className={studioQuietAction}>
              <ListChecks aria-hidden="true" className="size-4" />
              Daily 10Q quiz
            </button>
          )}
          <button type="button" onClick={onOpenPrompt} className={studioQuietAction}>
            <Wand2 aria-hidden="true" className="size-4" />
            Prompt generator
          </button>
          <button type="button" onClick={onOpenImport} className={studioQuietAction}>
            <Sparkles aria-hidden="true" className="size-4" />
            Import from AI
          </button>
        </>
      }
      primary={
        <button type="button" onClick={onOpenCreate} className={studioPrimaryAction}>
          <Plus aria-hidden="true" className="size-4" />
          New current affair
        </button>
      }
    />
  );
}
