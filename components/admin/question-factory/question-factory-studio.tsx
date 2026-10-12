"use client";

import React, { useState } from "react";
import { Factory, Wand2, FileJson, ListChecks, BarChart3, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { QUESTION_CONTRACT_VERSION } from "@/types/question-factory";
import { GenerateTab } from "./generate-tab";
import { ImportTab } from "./import-tab";
import { ReviewQueueTab } from "./review-queue-tab";
import { CoverageTab } from "./coverage-tab";
import type { FactoryTaxonomy } from "./types";

type TabKey = "generate" | "import" | "review" | "coverage";

const TABS: Array<{ key: TabKey; label: string; icon: React.ElementType }> = [
  { key: "generate", label: "Generate", icon: Wand2 },
  { key: "import", label: "Import", icon: FileJson },
  { key: "review", label: "Review Queue", icon: ListChecks },
  { key: "coverage", label: "Coverage", icon: BarChart3 },
];

interface QuestionFactoryStudioProps {
  taxonomy: FactoryTaxonomy;
  taxonomyError: string | null;
}

export function QuestionFactoryStudio({ taxonomy, taxonomyError }: QuestionFactoryStudioProps) {
  const [tab, setTab] = useState<TabKey>("generate");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Factory className="w-5 h-5 text-blue-600" /> Question Factory
          </h1>
          <p className="text-xs text-slate-500 max-w-2xl">
            Context → prompt → external AI (untrusted) → five gates → DRAFT → human review → atomic publish.
            Candidates only ever see PUBLISHED versions.
          </p>
        </div>
        <Badge variant="indigo" className="font-mono text-[10px]">
          {QUESTION_CONTRACT_VERSION}
        </Badge>
      </div>

      {taxonomyError && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 shrink-0" /> {taxonomyError}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 border-b border-slate-200 pb-2" role="tablist">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.key)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                active ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <Icon className="w-3.5 h-3.5" /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === "generate" && <GenerateTab taxonomy={taxonomy} />}
      {tab === "import" && <ImportTab />}
      {tab === "review" && <ReviewQueueTab taxonomy={taxonomy} />}
      {tab === "coverage" && <CoverageTab taxonomy={taxonomy} />}
    </div>
  );
}
