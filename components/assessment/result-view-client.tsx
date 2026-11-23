"use client";

import "@/components/result/result-ux.css";
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, BookOpen, ChevronDown, ChevronLeft, ChevronRight, Dumbbell } from "lucide-react";
import type { TestResultSummary } from "@/services/assessment.service";
import { useCoinsEnabled } from "@/lib/coins/flag-context";
import { QuestionReviewCard } from "@/components/assessment/question-review-card";
import { CandidateSecurityWatermark } from "@/components/assessment/candidate-security-watermark";
import { JumpBar } from "@/components/result/jump-bar";
import { TrendChart } from "@/components/result/trend-chart";
import { formatDateShort } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  UX_FILTERS,
  fmtClock,
  fmtDelta,
  fmtNum,
  fmtPct,
  fmtScore,
  fmtShort,
  learnHref,
  nextSteps,
  nextWrong,
  parseReviewQuery,
  practiceTopicHref,
  questionState,
  scoreDelta,
  sectionPace,
  statusChip,
  uxCounts,
  uxFilter,
  verdict,
  weakTopics,
  type UxFilter,
} from "@/lib/assessment/result-ux";

/**
 * RESULT-UX-1 — the mock result page (owner spec docs/design/RESULT_UX_V1_SPEC.md, 23 Nov 2026). Presentation only:
 * every number comes from the server-loaded, owner-scoped result (RESULT-SEC-1); every derived value from the pure,
 * unit-gated functions in lib/assessment/result-ux.ts. Order: jump bar → summary → next 3 steps → weak topics + sections
 * → question review → past attempts (collapsed). Phones: jump chips, a bottom bar above the student nav ("Review N
 * mistakes"), and a one-question review mode (the student nav is hidden there; Prev · 1 / N · Next wrong).
 * cl-* tokens only; no emoji (line icons + ▲ ▼ ✓ ✕ ›).
 */
type Q = TestResultSummary["reviewQuestions"][number];

const card = "rounded-2xl border border-cl-line bg-cl-white p-4 sm:p-5";
const h2 = "font-heading text-h3 font-semibold text-cl-charcoal";
const btn = "focus-ring inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full px-4 text-body-sm font-semibold whitespace-nowrap";
const btnPrimary = `${btn} bg-cl-blue text-cl-white hover:bg-cl-blue-hover`;
const btnSoft = `${btn} bg-cl-blue-tint text-cl-blue-text hover:bg-cl-blue-line`;
const btnOutline = `${btn} border-[1.5px] border-cl-line bg-cl-white text-cl-charcoal hover:bg-cl-cloud`;

export function ResultViewClient({ data }: { data: TestResultSummary }) {
  const { result, test, standing, security, sections, reviewQuestions, analysis, rewards } = data;
  const coinsEnabled = useCoinsEnabled();
  const params = useSearchParams();

  // ---- derived values (pure, gated) ----
  const counts = useMemo(() => uxCounts(reviewQuestions), [reviewQuestions]);
  const sectionNames = useMemo(() => [...new Set(reviewQuestions.map((q) => q.sectionName))], [reviewQuestions]);
  const group = analysis.trendGroup ?? null;
  const delta = scoreDelta(group);
  const pace = useMemo(() => sectionPace(sections, { durationMinutes: test.durationMinutes, totalQuestions: test.totalQuestions }), [sections, test.durationMinutes, test.totalQuestions]);
  const weak = useMemo(() => weakTopics(reviewQuestions), [reviewQuestions]);
  const practiceIds = useMemo(() => new Set(analysis.practiceTopicIds ?? []), [analysis.practiceTopicIds]);
  const idealSeconds = test.durationMinutes > 0 && test.totalQuestions > 0 ? Math.round((test.durationMinutes * 60) / test.totalQuestions) : null;
  const steps = nextSteps({ weak, wrongCount: counts.wrong, practiceEnabled: Boolean(analysis.practiceEnabled), practiceTopicIds: practiceIds, examSlug: analysis.examSlug, idealSeconds });
  const line = verdict({ delta: delta?.delta ?? null, accuracy: result.accuracyPercentage, attempted: result.attemptedCount, pace: pace.rows });
  const pastPoints = group && group.points.length > 1 ? group.points : null;

  // ---- review state lives in the URL (?filter=&section=&review=1&q=) ----
  const { filter, section } = parseReviewQuery(params, counts, sectionNames);
  const reviewMode = params.get("review") === "1";
  const filtered = useMemo(() => uxFilter(reviewQuestions, filter, section), [reviewQuestions, filter, section]);
  const setQuery = useCallback((patch: Record<string, string | null>, push = false) => {
    const u = new URL(window.location.href);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) u.searchParams.delete(k);
      else u.searchParams.set(k, v);
    }
    window.history[push ? "pushState" : "replaceState"](null, "", `${u.pathname}${u.search}${u.hash}`);
  }, []);

  // ---- phone review mode: back returns to the summary at the same scroll position; the student nav is hidden ----
  const savedScroll = useRef<number | null>(null);
  const pushedReview = useRef(false);
  const openReview = (f: UxFilter) => {
    savedScroll.current = window.scrollY;
    const list = uxFilter(reviewQuestions, f, null);
    pushedReview.current = true;
    setQuery({ review: "1", filter: f, section: null, q: list[0] ? String(list[0].questionOrder) : null }, true);
    window.scrollTo(0, 0);
  };
  const closeReview = () => {
    if (pushedReview.current) {
      pushedReview.current = false;
      window.history.back();
    } else setQuery({ review: null, q: null });
  };
  useEffect(() => {
    const el = document.documentElement;
    if (reviewMode) el.setAttribute("data-result-review", "");
    else el.removeAttribute("data-result-review");
    return () => el.removeAttribute("data-result-review");
  }, [reviewMode]);
  useLayoutEffect(() => {
    if (!reviewMode && savedScroll.current !== null) {
      window.scrollTo(0, savedScroll.current);
      savedScroll.current = null;
    }
  }, [reviewMode]);

  const jump = [
    { id: "summary", label: "Summary" },
    ...(steps.length ? [{ id: "next-steps", label: "Next steps" }] : []),
    { id: "weak-topics", label: "Weak topics" },
    ...(sections.length ? [{ id: "sections", label: "Sections" }] : []),
    { id: "review", label: "Question review" },
    ...(pastPoints ? [{ id: "past-attempts", label: "Past attempts" }] : []),
  ];

  return (
    <div className="min-h-[calc(100dvh-4rem)] bg-cl-cloud pb-[112px] lg:pb-16" data-result-ux="v1">
      {reviewMode && (
        <ReviewMode
          list={filtered}
          counts={counts}
          filter={filter}
          current={Number(params.get("q")) || filtered[0]?.questionOrder || null}
          onFilter={(f) => {
            const l = uxFilter(reviewQuestions, f, null);
            setQuery({ filter: f, section: null, q: l[0] ? String(l[0].questionOrder) : null });
          }}
          onGo={(order) => {
            setQuery({ q: String(order) });
            window.scrollTo(0, 0);
          }}
          onBack={closeReview}
          memoryLockEnabled={analysis.memoryLockEnabled}
        />
      )}

      <div className={cn("mx-auto flex max-w-[1320px] flex-col gap-5 px-4 pt-5 sm:px-6 lg:pt-7", reviewMode && "max-lg:hidden")}>
        <div className="flex flex-col gap-1">
          <Link href="/mock-tests" prefetch={false} className="focus-ring inline-flex min-h-11 w-fit items-center gap-1.5 text-body-sm font-medium text-cl-slate hover:text-cl-charcoal">
            <ArrowLeft aria-hidden="true" className="size-4" /> Mock tests
          </Link>
          <h1 className="font-heading text-h2 font-semibold text-cl-charcoal sm:text-h1">{test.title}</h1>
        </div>

        <JumpBar items={jump} />

        {/* ======================= 2–4 SUMMARY ======================= */}
        <section id="summary" aria-labelledby="summary-title" className={cn(card, "relative scroll-mt-36 overflow-hidden")} data-result-section="summary">
          <CandidateSecurityWatermark examTitle={test.title} maskedCandidateId={security.maskedId} attemptIdShort={security.attemptIdShort} timestamp={security.timestamp} isLighter />
          <h2 id="summary-title" className="sr-only">
            Summary
          </h2>
          <div className="relative z-10 grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[1.15fr_1fr] lg:gap-6">
            <div className="min-w-0">
              <p className="text-body-sm text-cl-slate" data-result-meta="">
                Submitted {security.timestamp} · {test.durationMinutes} min · {test.totalQuestions} questions
                <span className="lg:hidden"> · Time used {fmtClock(result.timeSpentSeconds)}</span>
              </p>
              <p className="mt-2 font-heading text-[40px] leading-none font-bold tracking-tight text-cl-charcoal tabular-nums lg:text-[54px]" data-score="">
                {fmtNum(result.totalScore)} <span className="text-h3 font-semibold text-cl-silver lg:text-h2">/ {fmtNum(result.maxScore)}</span>
              </p>
              {delta && (
                <p
                  className={cn(
                    "mt-3 inline-flex min-h-7 items-center gap-1.5 rounded-full px-2.5 text-body-sm font-semibold tabular-nums",
                    delta.delta > 0 ? "bg-cl-state-answered-tint text-cl-result-green-text" : delta.delta < 0 ? "bg-cl-coral-tint text-cl-coral-text" : "bg-cl-cloud text-cl-slate",
                  )}
                  data-delta={delta.delta > 0 ? "up" : delta.delta < 0 ? "down" : "same"}
                >
                  <span aria-hidden="true">{delta.delta > 0 ? "▲" : delta.delta < 0 ? "▼" : ""}</span>
                  {fmtDelta(delta.delta)} {delta.label} ({fmtNum(delta.previous)})
                </p>
              )}
              <p className="mt-3 text-body text-cl-charcoal" data-verdict="">
                {line}
              </p>
              <dl className="mt-4 grid grid-cols-4 gap-1.5 lg:grid-cols-5 lg:gap-2" data-tiles="">
                <Tile value={String(result.correctCount)} label="Correct" tone="green" />
                <Tile value={String(result.incorrectCount)} label={analysis.negativeMarksLost > 0 ? `Wrong · ${fmtNum(-analysis.negativeMarksLost)}` : "Wrong"} tone="coral" />
                <Tile value={String(result.unansweredCount)} label="Skipped · 0 marks" />
                <Tile value={fmtPct(result.accuracyPercentage)} label="Accuracy" />
                <Tile value={fmtClock(result.timeSpentSeconds)} label="Time used" className="max-lg:hidden" />
              </dl>
              {coinsEnabled && rewards && rewards.totalCoinsEarned > 0 && (
                <p className="mt-3 text-body-sm text-cl-slate" data-coin-ui="">
                  CL Coins earned for this test: +{rewards.totalCoinsEarned}
                </p>
              )}
            </div>
            <div className="flex min-w-0 flex-col gap-3 lg:border-l lg:border-cl-line lg:pl-6" data-trend="">
              <h3 className="font-heading text-body font-semibold text-cl-charcoal">Your trend</h3>
              <TrendChart group={group} />
              {standing ? (
                <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-cl-line px-3 py-2 text-body-sm text-cl-charcoal" data-standing="">
                  <span>
                    Rank <strong className="tabular-nums">{standing.rank}</strong> of {standing.n} · percentile <strong className="tabular-nums">{standing.percentile}</strong>
                  </span>
                  <Link href={`/mock-tests/${test.id}/leaderboard`} className="focus-ring inline-flex min-h-11 items-center gap-1 font-semibold text-cl-blue-text">
                    Leaderboard <ArrowRight aria-hidden="true" className="size-4" />
                  </Link>
                </div>
              ) : (
                <p className="mt-auto rounded-xl border border-dashed border-cl-mist bg-cl-cloud px-3 py-2 text-caption text-cl-slate" data-rank-note="">
                  Rank &amp; percentile appear once enough students take this mock
                </p>
              )}
            </div>
          </div>
        </section>

        {/* ======================= 5 NEXT 3 STEPS ======================= */}
        {steps.length > 0 && (
          <section id="next-steps" aria-labelledby="steps-title" className={cn(card, "scroll-mt-36")} data-result-section="next-steps">
            <div className="mb-3 flex items-baseline gap-2">
              <h2 id="steps-title" className={h2}>
                Your next {steps.length === 3 ? "3 steps" : steps.length === 1 ? "step" : `${steps.length} steps`}
              </h2>
              <span className="text-caption text-cl-slate max-sm:hidden">based on this attempt</span>
            </div>
            <ol className="grid grid-cols-[minmax(0,1fr)] gap-0 lg:grid-cols-3 lg:gap-3" data-next-steps="">
              {steps.map((s, i) => (
                <li key={s.kind} className="min-w-0 border-cl-line max-lg:border-t max-lg:first:border-t-0 lg:rounded-2xl lg:border lg:p-4" data-step={s.kind}>
                  <div className="hidden h-full flex-col gap-2 lg:flex">
                    <span aria-hidden="true" className="flex size-7 items-center justify-center rounded-lg bg-cl-blue-tint text-body-sm font-bold text-cl-blue-text">
                      {i + 1}
                    </span>
                    <p className="font-semibold text-cl-charcoal">{s.title}</p>
                    <p className="text-body-sm text-cl-slate">{s.detail}</p>
                    <Link href={s.href} className={cn(i === 0 ? btnPrimary : btnSoft, "mt-auto self-start")}>
                      {s.cta}
                    </Link>
                  </div>
                  <Link href={s.href} className="focus-ring flex min-h-12 items-center gap-3 py-2 text-body-sm lg:hidden">
                    <span aria-hidden="true" className="flex size-6 shrink-0 items-center justify-center rounded-md bg-cl-blue-tint text-caption font-bold text-cl-blue-text">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium text-cl-charcoal">{s.title}</span>
                    <span className="shrink-0 font-semibold text-cl-blue-text">Open ›</span>
                  </Link>
                </li>
              ))}
            </ol>
          </section>
        )}

        {/* ======================= 6 WEAK TOPICS + 7 SECTIONS ======================= */}
        <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-2">
          <section id="weak-topics" aria-labelledby="weak-title" className={cn(card, "scroll-mt-36")} data-result-section="weak-topics">
            <div className="mb-2 flex items-baseline gap-2">
              <h2 id="weak-title" className={h2}>
                Weak topics
              </h2>
              <span className="text-caption text-cl-slate">accuracy in this attempt</span>
            </div>
            {weak.length === 0 ? (
              <p className="py-2 text-body-sm text-cl-slate" data-weak-empty="">
                Answer more questions to see your weak topics.
              </p>
            ) : (
              <ul data-weak-topics="">
                {weak.map((t) => (
                  <li key={t.topicId} className="grid grid-cols-[minmax(0,1fr)] gap-y-2 border-t border-cl-line py-3 first:border-t-0 sm:grid-cols-[minmax(0,1fr)_110px_auto] sm:items-center sm:gap-x-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-cl-charcoal">{t.topicName}</p>
                      <p className="text-caption text-cl-slate tabular-nums">
                        {t.correct} / {t.attempted} correct · {t.sectionName}
                      </p>
                    </div>
                    <div aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-cl-cloud">
                      <div className="h-full rounded-full bg-cl-coral" style={{ width: `${Math.max(4, t.accuracy)}%` }} />
                    </div>
                    <div className="flex gap-1.5">
                      {t.learningSlug && (
                        <Link href={learnHref(t.learningSlug)} className={cn(btnOutline, "px-3")} aria-label={`Learn ${t.topicName}`}>
                          <BookOpen aria-hidden="true" className="size-4" /> Learn
                        </Link>
                      )}
                      {analysis.practiceEnabled && practiceIds.has(t.topicId) && (
                        <Link href={practiceTopicHref(t.topicId, analysis.examSlug)} className={cn(btnSoft, "px-3")} aria-label={`Practice ${t.topicName}`}>
                          <Dumbbell aria-hidden="true" className="size-4" /> Practice
                        </Link>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {sections.length > 0 && (
            <section id="sections" aria-labelledby="sections-title" className={cn(card, "scroll-mt-36")} data-result-section="sections">
              <div className="mb-2 flex items-baseline gap-2">
                <h2 id="sections-title" className={h2}>
                  Sections
                </h2>
                <span className="text-caption text-cl-slate">score · accuracy{pace.showTime ? " · time" : ""}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[300px] border-collapse text-body-sm tabular-nums" data-sections-table="">
                  <caption className="sr-only">Score, accuracy{pace.showTime ? ", time and pace" : ""} per section</caption>
                  <thead>
                    <tr className="text-left text-caption text-cl-slate">
                      <th scope="col" className="pr-3 pb-2 font-medium">Section</th>
                      <th scope="col" className="pr-3 pb-2 font-medium">Score</th>
                      <th scope="col" className="pr-3 pb-2 font-medium">Accuracy</th>
                      {pace.showTime && (
                        <>
                          <th scope="col" className="pr-3 pb-2 font-medium max-sm:hidden">Time</th>
                          <th scope="col" className="pb-2 font-medium">Pace / question</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {pace.rows.map((s) => (
                      <tr key={s.sectionName} className="border-t border-cl-line">
                        <th scope="row" className="py-2.5 pr-3 text-left font-semibold text-cl-charcoal">{s.sectionName}</th>
                        <td className="py-2.5 pr-3 whitespace-nowrap text-cl-charcoal">{fmtScore(s.sectionScore, s.maxScore)}</td>
                        <td className="py-2.5 pr-3 text-cl-charcoal">{fmtPct(s.accuracyPercentage)}</td>
                        {pace.showTime && (
                          <>
                            <td className="py-2.5 pr-3 text-cl-charcoal max-sm:hidden">{s.timeSpentSeconds ? fmtClock(s.timeSpentSeconds) : "—"}</td>
                            <td className="py-2.5 whitespace-nowrap">
                              {s.pace ? (
                                <span className={cn("rounded-full px-2 py-0.5 text-caption font-semibold", s.pace === "too slow" ? "bg-cl-coral-tint text-cl-coral-text" : "bg-cl-state-answered-tint text-cl-result-green-text")} data-pace={s.pace}>
                                  {fmtShort(s.secondsPerQuestion!)} · {s.pace}
                                </span>
                              ) : (
                                <span className="text-cl-slate">—</span>
                              )}
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>

        {/* ======================= 8–11 QUESTION REVIEW ======================= */}
        <ReviewList
          questions={reviewQuestions}
          filtered={filtered}
          counts={counts}
          filter={filter}
          section={section}
          sectionNames={sectionNames}
          setQuery={setQuery}
          memoryLockEnabled={analysis.memoryLockEnabled}
        />

        {/* ======================= 12 PAST ATTEMPTS (collapsed) ======================= */}
        {pastPoints && <PastAttempts points={pastPoints} label={`${group!.examTitle ? `${group!.examTitle} ` : ""}${group!.kindLabel} mocks`} />}
      </div>

      {/* phone bottom bar (summary view): stacked ON the student nav, one layer below it — its 36 px bottom zone takes the
          nav's raised centre button (it pokes up to 32 px above the nav), so the button never sits under it; only with
          wrong answers */}
      {!reviewMode && counts.wrong > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(68px+env(safe-area-inset-bottom,0px))] z-[29] border-t border-cl-line bg-cl-white px-4 pt-2 pb-9 lg:hidden" data-result-bar="summary">
          <button type="button" onClick={() => openReview("wrong")} className={cn(btnPrimary, "min-h-12 w-full")}>
            Review {counts.wrong} {counts.wrong === 1 ? "mistake" : "mistakes"}
          </button>
        </div>
      )}
    </div>
  );
}

function Tile({ value, label, tone, className }: { value: string; label: string; tone?: "green" | "coral"; className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-col-reverse rounded-xl border border-cl-line bg-cl-white px-2 py-2 lg:px-3", className)}>
      <dt className="text-caption leading-tight text-cl-slate">{label}</dt>
      <dd className={cn("font-heading text-body-lg font-semibold tabular-nums lg:text-h3", tone === "green" ? "text-cl-result-green-text" : tone === "coral" ? "text-cl-coral-text" : "text-cl-charcoal")}>{value}</dd>
    </div>
  );
}

// ----------------------------------------------------------------------------------------------- filters
function FilterBar({ counts, filter, onFilter, compact = false }: { counts: Record<UxFilter, number>; filter: UxFilter; onFilter: (f: UxFilter) => void; compact?: boolean }) {
  const order: UxFilter[] = compact ? ["wrong", "skipped", "correct", "all"] : ["all", "wrong", "skipped", "correct"];
  return (
    <div role="group" aria-label="Show questions" className="flex gap-0.5 overflow-x-auto rounded-full bg-cl-white p-0.5 ring-1 ring-cl-line [scrollbar-width:none]" data-review-filters="">
      {order.map((v) => {
        const f = UX_FILTERS.find((x) => x.value === v)!;
        return (
          <button
            key={v}
            type="button"
            aria-pressed={filter === v}
            onClick={() => onFilter(v)}
            className={cn("focus-ring inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-body-sm font-medium whitespace-nowrap", filter === v ? "bg-cl-charcoal text-cl-white" : "text-cl-slate hover:text-cl-charcoal")}
            data-filter={v}
          >
            {f.label}{" "}
            <span className="tabular-nums" data-filter-count={v}>
              {counts[v]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ----------------------------------------------------------------------------------------------- review list
function ReviewList({
  questions,
  filtered,
  counts,
  filter,
  section,
  sectionNames,
  setQuery,
  memoryLockEnabled,
}: {
  questions: Q[];
  filtered: Q[];
  counts: Record<UxFilter, number>;
  filter: UxFilter;
  section: string | null;
  sectionNames: string[];
  setQuery: (p: Record<string, string | null>, push?: boolean) => void;
  memoryLockEnabled: boolean;
}) {
  const firstOrder = filtered[0]?.questionOrder ?? null;
  const [open, setOpen] = useState<Set<number>>(() => new Set(firstOrder !== null ? [firstOrder] : []));
  const listKey = `${filter}|${section ?? ""}`;
  const lastKey = useRef(listKey);
  useEffect(() => {
    if (lastKey.current !== listKey) {
      lastKey.current = listKey;
      setOpen(new Set(firstOrder !== null ? [firstOrder] : []));
    }
  }, [listKey, firstOrder]);
  const toggle = (order: number) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(order)) n.delete(order);
      else n.add(order);
      return n;
    });
  const goNextWrong = (from: number) => {
    const nw = nextWrong(filtered, from);
    if (!nw || nw.questionOrder === from) return;
    setOpen((s) => {
      const n = new Set(s);
      n.delete(from);
      n.add(nw.questionOrder);
      return n;
    });
    requestAnimationFrame(() => {
      const el = document.getElementById(`rq-${nw.questionOrder}`);
      el?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      el?.focus({ preventScroll: true });
    });
  };

  return (
    <section id="review" aria-labelledby="review-title" className="flex scroll-mt-36 flex-col gap-3" data-result-section="review">
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 id="review-title" className={h2}>
          Question review
        </h2>
        <span className="text-caption text-cl-slate">{questions.length} questions</span>
      </div>
      <div className="flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center">
        <FilterBar counts={counts} filter={filter} onFilter={(f) => setQuery({ filter: f })} />
        {sectionNames.length > 1 && (
          <div role="group" aria-label="Section" className="flex gap-1 overflow-x-auto [scrollbar-width:none]" data-section-filter="">
            {[null, ...sectionNames].map((s) => (
              <button
                key={s ?? "all"}
                type="button"
                aria-pressed={section === s}
                onClick={() => setQuery({ section: s })}
                className={cn("focus-ring inline-flex min-h-11 shrink-0 items-center rounded-full border px-3 text-body-sm font-medium whitespace-nowrap", section === s ? "border-cl-blue-line bg-cl-blue-tint text-cl-blue-text" : "border-cl-line bg-cl-white text-cl-slate hover:text-cl-charcoal")}
              >
                {s ?? "All sections"}
              </button>
            ))}
          </div>
        )}
      </div>
      <p className="sr-only" aria-live="polite">
        Showing {filtered.length} {filtered.length === 1 ? "question" : "questions"}
      </p>
      {filtered.length === 0 ? (
        <p className={cn(card, "text-center text-body text-cl-slate")}>No questions in this view.</p>
      ) : (
        <ol className="flex flex-col gap-2" data-review-list="">
          {filtered.map((q) => {
            const isOpen = open.has(q.questionOrder);
            const st = questionState(q);
            const nw = nextWrong(filtered, q.questionOrder);
            return (
              <li key={q.mockQuestionId} id={`rq-${q.questionOrder}`} tabIndex={-1} className="scroll-mt-36 outline-none">
                {isOpen ? (
                  <QuestionReviewCard
                    {...cardProps(q, memoryLockEnabled)}
                    headingId={`rq-h-${q.questionOrder}`}
                    onCollapse={() => toggle(q.questionOrder)}
                    onNextWrong={nw && nw.questionOrder !== q.questionOrder ? () => goNextWrong(q.questionOrder) : null}
                  />
                ) : (
                  <button
                    type="button"
                    aria-expanded="false"
                    onClick={() => toggle(q.questionOrder)}
                    className="focus-ring flex min-h-12 w-full items-center gap-2.5 rounded-xl border border-cl-line bg-cl-white px-3.5 py-2 text-left text-body-sm"
                    data-review-row={st}
                  >
                    <span className="shrink-0 font-semibold text-cl-charcoal tabular-nums">Q {q.questionOrder}</span>
                    <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-caption font-semibold", st === "wrong" ? "bg-cl-coral-tint text-cl-coral-text" : st === "correct" ? "bg-cl-state-answered-tint text-cl-result-green-text" : "bg-cl-cloud text-cl-slate")}>
                      {statusChip(q)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-cl-charcoal">{q.questionText}</span>
                    <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-cl-silver" />
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function cardProps(q: Q, memoryLockEnabled: boolean) {
  return {
    questionOrder: q.questionOrder,
    sectionName: q.sectionName,
    questionText: q.questionText,
    questionImageUrl: q.questionImageUrl,
    optionsType: q.optionsType,
    options: q.options,
    selectedOption: q.selectedOption,
    correctOption: q.correctOption,
    isCorrect: q.isCorrect,
    marksAwarded: q.marksAwarded,
    explanation: q.explanation,
    topicName: q.topicName,
    timeSpentSeconds: q.timeSpentSeconds,
    learningSlug: q.learningSlug,
    questionId: q.questionId,
    questionVersionId: q.questionVersionId,
    canAddToMemoryLock: memoryLockEnabled,
    correction: q.correction ?? null,
  };
}

// ----------------------------------------------------------------------------------------------- phone review mode
function ReviewMode({
  list,
  counts,
  filter,
  current,
  onFilter,
  onGo,
  onBack,
  memoryLockEnabled,
}: {
  list: Q[];
  counts: Record<UxFilter, number>;
  filter: UxFilter;
  current: number | null;
  onFilter: (f: UxFilter) => void;
  onGo: (order: number) => void;
  onBack: () => void;
  memoryLockEnabled: boolean;
}) {
  const idx = Math.max(0, list.findIndex((q) => q.questionOrder === current));
  const q = list[idx];
  const prev = idx > 0 ? list[idx - 1] : null;
  const wrongNav = filter === "wrong" || filter === "all";
  const next = wrongNav ? (list.slice(idx + 1).find((x) => questionState(x) === "wrong") ?? null) : idx < list.length - 1 ? list[idx + 1] : null;
  const label = UX_FILTERS.find((f) => f.value === filter)!.label;
  const headRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headRef.current?.focus({ preventScroll: true });
  }, [current]);
  return (
    <div className="mx-auto flex max-w-[720px] flex-col gap-3 px-4 pt-3 pb-[calc(88px+env(safe-area-inset-bottom,0px))] lg:hidden" data-review-mode="">
      <div className="flex items-center gap-2">
        <button type="button" onClick={onBack} className="focus-ring -ml-2 inline-flex min-h-11 items-center gap-1 rounded-full px-2 text-body-sm font-semibold text-cl-charcoal" data-review-back="">
          <ChevronLeft aria-hidden="true" className="size-5" /> Review · {label} ({counts[filter]})
        </button>
        <span className="ml-auto text-body-sm font-semibold text-cl-slate tabular-nums" data-review-counter="">
          {list.length ? `${idx + 1} / ${list.length}` : "0 / 0"}
        </span>
      </div>
      <FilterBar counts={counts} filter={filter} onFilter={onFilter} compact />
      <h2 ref={headRef} tabIndex={-1} className="sr-only">
        {q ? `Question ${q.questionOrder}, ${idx + 1} of ${list.length}` : "No questions in this view"}
      </h2>
      {q ? <QuestionReviewCard {...cardProps(q, memoryLockEnabled)} headingId={`rm-h-${q.questionOrder}`} /> : <p className={cn(card, "text-center text-body text-cl-slate")}>No questions in this view.</p>}
      <div className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-2 border-t border-cl-line bg-cl-white px-4 pt-2 pb-[calc(8px+env(safe-area-inset-bottom,0px))]" data-result-bar="review">
        <button type="button" disabled={!prev} onClick={() => prev && onGo(prev.questionOrder)} className={cn(btnOutline, "min-h-12 flex-1 disabled:opacity-50")} data-review-prev="">
          <ChevronLeft aria-hidden="true" className="size-4" /> Prev
        </button>
        <span className="min-w-14 text-center text-body-sm font-semibold text-cl-slate tabular-nums" aria-hidden="true">
          {list.length ? `${idx + 1} / ${list.length}` : ""}
        </span>
        <button type="button" disabled={!next} onClick={() => next && onGo(next.questionOrder)} className={cn(btnPrimary, "min-h-12 flex-1 disabled:opacity-50")} data-review-next="">
          {wrongNav ? "Next wrong" : "Next"} <ChevronRight aria-hidden="true" className="size-4" />
        </button>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------------------------- past attempts
function PastAttempts({ points, label }: { points: NonNullable<TestResultSummary["analysis"]["trendGroup"]>["points"]; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <section id="past-attempts" aria-labelledby="past-title" className={cn(card, "scroll-mt-36")} data-result-section="past-attempts">
      <h2 id="past-title" className="m-0">
        <button type="button" aria-expanded={open} aria-controls="past-list" onClick={() => setOpen((v) => !v)} className="focus-ring flex min-h-11 w-full items-center gap-2 rounded-lg text-left">
          <span className={h2}>Past attempts</span>
          <span className="text-caption text-cl-slate">
            {label} · {points.length}
          </span>
          <span className="ml-auto inline-flex items-center gap-1 text-body-sm font-semibold text-cl-blue-text">
            {open ? "Hide" : "Show"} <ChevronDown aria-hidden="true" className={cn("size-4 motion-safe:transition-transform", open && "rotate-180")} />
          </span>
        </button>
      </h2>
      <ol id="past-list" hidden={!open} className="mt-2" data-past-attempts="">
        {[...points].reverse().map((p) => (
          <li key={p.attemptId} className={cn("flex flex-wrap items-center gap-x-3 gap-y-0.5 border-t border-cl-line py-2.5 text-body-sm first:border-t-0", p.isCurrent && "font-semibold")}>
            <span className="text-cl-slate tabular-nums">{formatDateShort(p.submittedAt)}</span>
            <span className="min-w-0 flex-1 truncate text-cl-charcoal">
              {p.mockTitle}
              {p.isCurrent ? " (this attempt)" : ""}
            </span>
            <span className="text-cl-charcoal tabular-nums">
              {fmtPct(p.pct)} <span className="text-cl-slate">({fmtScore(p.score, p.maxScore)})</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
