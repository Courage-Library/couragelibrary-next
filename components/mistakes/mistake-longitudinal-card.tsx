"use client";

import React, { useState, useTransition } from "react";
import { AlertCircle, ArrowDownRight, ArrowUpRight, Minus, RefreshCw } from "lucide-react";
import {
  LongitudinalWindowType,
  MistakeLongitudinalOverview,
  TrajectoryState,
  CrossExamPattern,
} from "@/types/mistake-longitudinal-intelligence";
import { fetchLongitudinalOverviewAction } from "@/app/mistakes/actions";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { StatTile } from "@/components/ui/stat-tile";
import { cn } from "@/components/ui/cn";

interface MistakeLongitudinalCardProps {
  initialData: MistakeLongitudinalOverview | null;
}

const WINDOW_LABELS: Record<LongitudinalWindowType, string> = {
  "7D": "7 days",
  "30D": "30 days",
  "90D": "90 days",
  ALL_TIME: "All time",
};

// A falling error rate is good: "IMPROVING" means fewer mistakes.
const TRAJECTORY: Record<TrajectoryState, { tone: BadgeTone; label: string }> = {
  IMPROVING: { tone: "success", label: "Fewer mistakes" },
  DECLINING: { tone: "warning", label: "More mistakes" },
  RECOVERING: { tone: "info", label: "Recovering" },
  RELAPSING: { tone: "danger", label: "Slipping again" },
  STABLE: { tone: "neutral", label: "Steady" },
  INSUFFICIENT_DATA: { tone: "neutral", label: "No trend yet" },
};

const CROSS_EXAM: Record<CrossExamPattern, string> = {
  CONSISTENTLY_STRONG: "Strong in every test type",
  CONTEXT_SPECIFIC: "Depends on the test type",
  CONSISTENTLY_WEAK: "Weak in every test type",
  INSUFFICIENT_DATA: "Only one test type so far",
};

const pct = (rate: number, digits = 0) => `${(rate * 100).toFixed(digits)}%`;

function TrajectoryBadge({ state }: { state: TrajectoryState }) {
  const t = TRAJECTORY[state] ?? TRAJECTORY.INSUFFICIENT_DATA;
  return (
    <Badge tone={t.tone} className="self-start">
      {t.label}
    </Badge>
  );
}

/** "Your progress over time" (insights accordion). Every ratio shows "—" when its denominator is empty. */
export function MistakeLongitudinalCard({ initialData }: MistakeLongitudinalCardProps) {
  const [data, setData] = useState<MistakeLongitudinalOverview | null>(initialData);
  const [activeWindow, setActiveWindow] = useState<LongitudinalWindowType>(initialData?.window?.windowType || "30D");
  const [isPending, startTransition] = useTransition();
  const [loadError, setLoadError] = useState(false);

  const handleWindowChange = (windowType: LongitudinalWindowType) => {
    if (windowType === activeWindow && data) return;
    setActiveWindow(windowType);
    setLoadError(false);

    startTransition(async () => {
      const result = await fetchLongitudinalOverviewAction(windowType);
      if (result.success && result.data) {
        setData(result.data);
      } else {
        setLoadError(true);
      }
    });
  };

  if (!data || (data.totalActiveMistakes === 0 && (data.relapseRecovery?.totalMasteredCount ?? 0) === 0)) {
    return <p className="text-body-sm text-fg-secondary">Your progress appears here once you have mistakes to revise.</p>;
  }

  const overall = data.overallNormalizedMetric;
  const topTrajectory: TrajectoryState =
    data.topWeaknesses?.[0]?.trajectory ||
    data.topicTrajectories?.[0]?.trajectory ||
    (overall?.isSufficient ? "STABLE" : "INSUFFICIENT_DATA");

  const crossExam = data.crossExamIntelligence;
  const topTopics = data.topicTrajectories?.slice(0, 3) || [];
  const reasons = data.cognitiveDistribution?.filter((c) => c.activeMistakeCount > 0) || [];

  // display only: the calculation stays in the service; an empty denominator is shown as "—"
  const masteredCount = data.recoverySummary?.totalMasteredCount ?? data.relapseRecovery?.totalMasteredCount ?? 0;
  const relapseCount = data.recoverySummary?.totalRelapsedCount ?? data.relapseRecovery?.totalRelapseCount ?? 0;
  const relapseRate = data.relapseRecovery?.relapseRate ?? (masteredCount > 0 ? relapseCount / masteredCount : 0);
  const retentionPct = Math.max(0, Math.min(100, Math.round((1 - relapseRate) * 100)));
  const hasErrorRate = overall?.rate !== null && overall?.rate !== undefined && overall.isSufficient;
  const hasContexts = Boolean(crossExam && crossExam.contextsAttempted > 0);

  return (
    <div className="flex flex-col gap-4" aria-busy={isPending || undefined}>
      <p className="text-body-sm text-fg-secondary">
        How your mistakes change over time, where they happen, and whether mastered questions stay mastered.
      </p>

      <div role="group" aria-label="Time period" className="flex w-fit flex-wrap gap-1 rounded-control bg-surface-sunken p-1">
        {(["7D", "30D", "90D", "ALL_TIME"] as LongitudinalWindowType[]).map((w) => (
          <button
            key={w}
            type="button"
            onClick={() => handleWindowChange(w)}
            disabled={isPending}
            aria-pressed={activeWindow === w}
            className={cn(
              "focus-ring h-11 rounded-control px-3 text-body-sm font-medium transition-colors duration-120 ease-standard disabled:cursor-wait",
              activeWindow === w ? "bg-surface text-fg shadow-e1" : "text-fg-secondary hover:text-fg",
            )}
          >
            {WINDOW_LABELS[w]}
          </button>
        ))}
      </div>
      {loadError && (
        <p role="alert" className="flex items-center gap-2 text-body-sm text-danger-700">
          <AlertCircle aria-hidden="true" className="size-4" /> Could not load this period. Try again.
        </p>
      )}

      <div className="grid grid-cols-1 gap-3">
        <StatTile
          label="Error rate"
          value={hasErrorRate ? pct(overall!.rate as number, 1) : null}
          hint={
            <span className="flex flex-col gap-1">
              <span>
                {hasErrorRate
                  ? `${overall!.numerator} wrong out of ${overall!.denominator} questions`
                  : "Answer more questions to see your error rate"}
              </span>
              <TrajectoryBadge state={topTrajectory} />
            </span>
          }
        />
        <StatTile
          label="Test types with mistakes"
          value={hasContexts ? `${crossExam!.contextsWithErrors} of ${crossExam!.contextsAttempted}` : null}
          hint={hasContexts ? CROSS_EXAM[crossExam!.crossExamPattern] ?? CROSS_EXAM.INSUFFICIENT_DATA : "Take mocks or drills to see this"}
        />
        <StatTile
          label="Stayed mastered"
          value={masteredCount > 0 ? `${retentionPct}%` : null}
          hint={
            masteredCount === 0
              ? "Master a mistake to see your retention"
              : relapseCount === 0
                ? `All ${masteredCount} mastered ${masteredCount === 1 ? "question" : "questions"} stayed mastered`
                : `${relapseCount} of ${masteredCount} mastered questions went wrong again`
          }
        />
      </div>

      <div className="flex flex-col gap-2">
        <h4 className="text-body-sm font-semibold text-fg">Topics changing most</h4>
        {topTopics.length === 0 ? (
          <p className="text-body-sm text-fg-secondary">No topic has changed much in this period.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {topTopics.map((t) => {
              const d = t.deltaErrorRate;
              return (
                <li key={t.topicId} className="flex items-start justify-between gap-3 py-2">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-body-sm font-medium text-fg">{t.topicName}</span>
                    <span className="text-caption text-fg-secondary">
                      {t.subjectName} · {t.activeMistakeCount} to revise
                      {t.hasActiveRelapse ? " · wrong again after mastering" : ""}
                    </span>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-body-sm font-semibold tabular-nums text-fg">
                      {t.recentMetric.rate !== null ? pct(t.recentMetric.rate) : "—"}
                    </span>
                    <span className="inline-flex items-center gap-1 text-caption">
                      {d === null ? (
                        <span className="text-fg-secondary">First period</span>
                      ) : d < 0 ? (
                        <span className="inline-flex items-center gap-1 text-success-700">
                          <ArrowDownRight aria-hidden="true" className="size-3.5" /> down {pct(Math.abs(d))}
                        </span>
                      ) : d > 0 ? (
                        <span className="inline-flex items-center gap-1 text-warning-700">
                          <ArrowUpRight aria-hidden="true" className="size-3.5" /> up {pct(d)}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-fg-secondary">
                          <Minus aria-hidden="true" className="size-3.5" /> no change
                        </span>
                      )}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <h4 className="text-body-sm font-semibold text-fg">Reasons in this period</h4>
        {reasons.length === 0 ? (
          <p className="text-body-sm text-fg-secondary">No reasons recorded in this period.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {reasons.slice(0, 4).map((c) => {
              const share = Math.round(c.proportionOfActiveMistakes * 100);
              return (
                <li key={c.cognitiveTypeId} className="flex flex-col gap-1">
                  <span className="flex items-center justify-between gap-2 text-body-sm">
                    <span className="truncate font-medium text-fg">{c.cognitiveTypeName}</span>
                    <span className="shrink-0 tabular-nums text-fg-secondary">
                      {c.activeMistakeCount} ({share}%)
                    </span>
                  </span>
                  <span aria-hidden="true" className="h-1.5 w-full overflow-hidden rounded-full bg-ink-200">
                    <span className="block h-full rounded-full bg-primary-700" style={{ width: `${Math.max(4, share)}%` }} />
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {isPending && (
        <p className="flex items-center gap-2 text-body-sm text-fg-secondary" aria-live="polite">
          <RefreshCw aria-hidden="true" className="size-4" /> Loading {WINDOW_LABELS[activeWindow]}…
        </p>
      )}
    </div>
  );
}
