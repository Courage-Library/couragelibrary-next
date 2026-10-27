"use client";

import React, { useRef, useState } from "react";
import Link from "next/link";
import { Wand2, FileJson, ListChecks, BarChart3, ShieldAlert, Target } from "lucide-react";
import { QUESTION_CONTRACT_VERSION } from "@/types/question-factory";
import { StudioPageHeader, studioPrimaryAction } from "@/components/admin/studio/studio-page";
import { cn } from "@/components/ui/cn";
import { GenerateTab } from "./generate-tab";
import { ImportTab } from "./import-tab";
import { ReviewQueueTab } from "./review-queue-tab";
import { CoverageTab } from "./coverage-tab";
import type { FactoryTaxonomy } from "./types";

export type TabKey = "generate" | "import" | "review" | "coverage";

const TABS: Array<{ key: TabKey; label: string; icon: React.ElementType }> = [
  { key: "generate", label: "Generate", icon: Wand2 },
  { key: "import", label: "Import", icon: FileJson },
  { key: "review", label: "Review queue", icon: ListChecks },
  { key: "coverage", label: "Coverage", icon: BarChart3 },
];

interface QuestionFactoryStudioProps {
  taxonomy: FactoryTaxonomy;
  taxonomyError: string | null;
  /** ADMIN-UX-1 phase B: deep link from Today (?tab=review&status=IN_REVIEW) — initial state only */
  initialTab?: TabKey;
  initialStatus?: string;
}

/**
 * Courage Studio template (phase 3 batch 1): Studio header (ONE primary: Start focus review), underline tabs with a real
 * tablist / tabpanel and arrow-key navigation; the tabs themselves are unchanged.
 */
export function QuestionFactoryStudio({ taxonomy, taxonomyError, initialTab = "generate", initialStatus = "" }: QuestionFactoryStudioProps) {
  const [tab, setTab] = useState<TabKey>(initialTab);
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const onKey = (e: React.KeyboardEvent, i: number) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = TABS[(i + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length].key;
    setTab(next);
    refs.current[next]?.focus();
  };

  return (
    <div className="flex flex-col gap-4">
      <StudioPageHeader
        title="Question drafts"
        description="Build a prompt for an external AI, import the result through the five quality gates, review, and publish. Students only ever see published versions."
        meta={<span className="rounded-badge border border-line bg-ink-50 px-2 py-0.5 font-mono text-[12px] text-fg-secondary">{QUESTION_CONTRACT_VERSION}</span>}
        primary={
          <Link href="/admin/review/focus" className={studioPrimaryAction}>
            <Target aria-hidden="true" className="size-4" />
            Start focus review
          </Link>
        }
      />

      {taxonomyError && (
        <p role="alert" className="flex items-center gap-2 rounded-control border border-danger-200 bg-danger-50 px-3 py-2 text-[13px] font-semibold text-danger-800">
          <ShieldAlert aria-hidden="true" className="size-4 shrink-0" /> {taxonomyError}
        </p>
      )}

      <div className="flex flex-wrap gap-1 border-b border-line" role="tablist" aria-label="Question drafts">
        {TABS.map((t, i) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              ref={(el) => {
                refs.current[t.key] = el;
              }}
              id={`qf-tab-${t.key}`}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls="qf-tabpanel"
              tabIndex={active ? 0 : -1}
              onClick={() => setTab(t.key)}
              onKeyDown={(e) => onKey(e, i)}
              className={cn(
                "focus-ring -mb-px inline-flex min-h-11 items-center gap-1.5 border-b-2 px-3 text-[13.5px] font-semibold",
                active ? "border-primary-700 text-fg" : "border-transparent text-fg-secondary hover:text-fg",
              )}
            >
              <Icon aria-hidden="true" className="size-4" /> {t.label}
            </button>
          );
        })}
      </div>

      <div id="qf-tabpanel" role="tabpanel" aria-labelledby={`qf-tab-${tab}`}>
        {tab === "generate" && <GenerateTab taxonomy={taxonomy} />}
        {tab === "import" && <ImportTab />}
        {tab === "review" && <ReviewQueueTab taxonomy={taxonomy} initialStatus={initialStatus} />}
        {tab === "coverage" && <CoverageTab taxonomy={taxonomy} />}
      </div>
    </div>
  );
}
