"use client";

import { useCoinsEnabled } from "@/lib/coins/flag-context";
import React, { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ChevronDown, ChevronUp } from "lucide-react";
import type { TestResultSummary } from "@/services/assessment.service";
import { QuestionReviewCard } from "@/components/assessment/question-review-card";
import { CandidateSecurityWatermark } from "@/components/assessment/candidate-security-watermark";
import { Button, ButtonLink } from "@/components/ui/button";
import { formatDateShort, formatDuration, formatPercent } from "@/lib/format";
import { REVIEW_FILTERS, filterReview, fmtMarks, reviewCounts, type ReviewFilter, type TakeawayAction } from "@/lib/assessment/result-analysis";
import { cn } from "@/lib/utils";

/**
 * F4 — result & analysis (R1, R3, R4, R5, R10, R12). Mobile-first order:
 *   1 score card (exact server values) · 2 what to do next (ONE primary: the top takeaway's action) · 3 sections
 *   (numbers always visible; bars are decoration) · 4 trend (only with ≥ 2 scored attempts of the same exam) ·
 *   5 question review (All / Wrong / Skipped / Marked) · 6 rank / percentile ONLY when the service returns a standing
 *   (≥ RANK_MIN_COHORT real students; otherwise the section is omitted entirely — never estimated).
 * One accent on the page: the top takeaway's cyan marker.
 */
const PAGE = 5;

export function ResultViewClient({ data }: { data: TestResultSummary }) {
  const { result, test, standing, security, sections, reviewQuestions, analysis, rewards } = data;
  const [filter, setFilter] = useState<ReviewFilter>("all");
  const coinsEnabled = useCoinsEnabled();
  const [section, setSection] = useState<string>("all");
  const [expanded, setExpanded] = useState(false);
  const reviewRef = useRef<HTMLElement>(null);

  const counts = useMemo(() => reviewCounts(reviewQuestions), [reviewQuestions]);
  const filtered = useMemo(
    () => filterReview(reviewQuestions, filter).filter((q) => section === "all" || q.sectionName === section),
    [reviewQuestions, filter, section]
  );
  const visible = expanded || filtered.length <= PAGE ? filtered : filtered.slice(0, PAGE);
  const sectionNames = useMemo(() => [...new Set(reviewQuestions.map((q) => q.sectionName))], [reviewQuestions]);

  const showFilter = (f: ReviewFilter) => {
    setFilter(f);
    setSection("all");
    setExpanded(false);
    reviewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const scorePct = result.maxScore > 0 ? (result.totalScore / result.maxScore) * 100 : 0;
  const timeLimit = test.durationMinutes > 0 ? ` of ${formatDuration(test.durationMinutes * 60)}` : "";
  const [top, ...rest] = analysis.takeaways;

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-canvas py-6 sm:py-10">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 sm:px-6">
        <div className="flex flex-col gap-2">
          <Link href="/mock-tests" prefetch={false} className="focus-ring inline-flex min-h-12 w-fit items-center gap-1.5 text-body-sm font-medium text-fg-secondary hover:text-fg">
            <ArrowLeft aria-hidden="true" className="size-4" /> Mock tests
          </Link>
          <h1 className="text-h1 font-bold text-fg">{test.title}</h1>
          <p className="text-body-sm text-fg-secondary">
            Submitted {security.timestamp} · {test.totalQuestions} questions · {fmtMarks(test.totalMarks)} marks
          </p>
        </div>

        {/* 1. Score card — exact server values */}
        <section aria-labelledby="score-title" className="relative overflow-hidden rounded-card border border-line bg-surface p-4 sm:p-6" data-result-section="score">
          <CandidateSecurityWatermark examTitle={test.title} maskedCandidateId={security.maskedId} attemptIdShort={security.attemptIdShort} timestamp={security.timestamp} isLighter />
          <div className="relative z-10 flex flex-col gap-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 id="score-title" className="text-body font-medium text-fg-secondary">
                  Your score
                </h2>
                <p className="text-display font-bold tabular-nums text-fg">
                  {fmtMarks(result.totalScore)} <span className="text-h3 font-semibold text-fg-secondary">/ {fmtMarks(result.maxScore)}</span>
                </p>
                <p className="text-body-sm text-fg-secondary tabular-nums">{formatPercent(scorePct)} of the maximum</p>
              </div>
              <div className="text-right">
                <p className="text-body-sm font-medium text-fg-secondary">Accuracy</p>
                <p className="text-h2 font-bold tabular-nums text-fg">{formatPercent(result.accuracyPercentage)}</p>
                <p className="text-caption text-fg-secondary">correct of attempted</p>
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3" data-score-facts="">
              {[
                ["Attempted", `${result.attemptedCount} of ${result.totalQuestions}`],
                ["Correct", String(result.correctCount)],
                ["Wrong", String(result.incorrectCount)],
                ["Skipped", String(result.unansweredCount)],
                ["Negative marks lost", analysis.negativeMarksLost > 0 ? `−${fmtMarks(analysis.negativeMarksLost)}` : "0"],
                ["Time used", `${formatDuration(result.timeSpentSeconds)}${timeLimit}`],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-line bg-surface px-3 py-2">
                  <dt className="text-caption font-medium text-fg-secondary">{label}</dt>
                  <dd className="text-h3 font-semibold tabular-nums text-fg">{value}</dd>
                </div>
              ))}
            </dl>
            {/* BRAND-3 fix 1: no coin line while COINS_ENABLED is off */}
            {coinsEnabled && rewards && rewards.totalCoinsEarned > 0 && <p className="text-body-sm text-fg-secondary" data-coin-ui="">CL Coins earned for this test: +{rewards.totalCoinsEarned}</p>}
          </div>
        </section>

        {/* 2. What to do next — task-focused (R3); ONE primary action (R4) */}
        {top && (
          <section aria-labelledby="next-title" className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 sm:p-6" data-result-section="next">
            <h2 id="next-title" className="text-h2 font-bold text-fg">
              What to do next
            </h2>
            <ol className="flex flex-col gap-3" data-takeaways="">
              <li className="flex flex-col gap-3 rounded-xl border border-line border-l-4 border-l-accent-500 bg-surface p-3" data-takeaway={top.kind}>
                <p className="text-body text-fg">{top.text}</p>
                {top.action && <ActionControl action={top.action} primary onFilter={showFilter} />}
              </li>
              {rest.map((t, i) => (
                <li key={i} className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-3" data-takeaway={t.kind}>
                  <p className="text-body text-fg">{t.text}</p>
                  {t.action && <ActionControl action={t.action} onFilter={showFilter} />}
                </li>
              ))}
            </ol>
          </section>
        )}

        {/* 3. Section breakdown — numbers visible; the bar is decoration (not colour-only) */}
        {sections.length > 0 && (
          <section aria-labelledby="sections-title" className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 sm:p-6" data-result-section="sections">
            <h2 id="sections-title" className="text-h2 font-bold text-fg">
              By section
            </h2>
            <ul className="flex flex-col gap-4">
              {sections.map((s) => {
                const pct = s.maxScore > 0 ? Math.min(100, Math.max(0, (s.sectionScore / s.maxScore) * 100)) : 0;
                return (
                  <li key={s.id ?? s.sectionName} className="flex flex-col gap-1.5">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <h3 className="text-body font-semibold text-fg">{s.sectionName}</h3>
                      <span className="text-body font-semibold tabular-nums text-fg">
                        {fmtMarks(s.sectionScore)} / {fmtMarks(s.maxScore)}
                      </span>
                    </div>
                    <div aria-hidden="true" className="h-3 w-full overflow-hidden rounded-full bg-ink-100">
                      <div className="h-full rounded-full bg-primary-700" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="text-body-sm text-fg-secondary tabular-nums">
                      Accuracy {formatPercent(s.accuracyPercentage)} · {s.correctCount} correct, {s.incorrectCount} wrong, {s.unansweredCount} skipped
                      {s.timeSpentSeconds ? ` · ${formatDuration(s.timeSpentSeconds)}` : ""}
                    </p>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* 4. Trend — only with ≥ 2 scored attempts of the same exam (abandoned attempts never appear) */}
        {analysis.trend && (
          <section aria-labelledby="trend-title" className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 sm:p-6" data-result-section="trend">
            <h2 id="trend-title" className="text-h2 font-bold text-fg">
              Your attempts of this exam
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-left text-body-sm">
                <caption className="sr-only">Score and accuracy of your scored attempts, oldest first</caption>
                <thead>
                  <tr className="border-b border-line text-fg-secondary">
                    <th scope="col" className="py-2 pr-3 font-medium">Date</th>
                    <th scope="col" className="py-2 pr-3 font-medium">Mock</th>
                    <th scope="col" className="py-2 pr-3 font-medium">Score</th>
                    <th scope="col" className="py-2 font-medium">Accuracy</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.trend.map((p) => (
                    <tr key={p.attemptId} className={cn("border-b border-line last:border-0", p.isCurrent && "bg-primary-50")}>
                      <td className="py-2 pr-3 tabular-nums text-fg">{formatDateShort(p.submittedAt)}</td>
                      <td className="py-2 pr-3 text-fg">
                        {p.mockTitle}
                        {p.isCurrent && <span className="ml-1 font-semibold">(this attempt)</span>}
                      </td>
                      <td className="py-2 pr-3">
                        <span className="tabular-nums text-fg">
                          {fmtMarks(p.score)} / {fmtMarks(p.maxScore)} ({formatPercent(p.scorePct)})
                        </span>
                        <span aria-hidden="true" className="mt-1 block h-1.5 w-full max-w-32 overflow-hidden rounded-full bg-ink-100">
                          <span className="block h-full rounded-full bg-primary-700" style={{ width: `${Math.min(100, Math.max(0, p.scorePct))}%` }} />
                        </span>
                      </td>
                      <td className="py-2 tabular-nums text-fg">{formatPercent(p.accuracy)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* 5. Question review */}
        <section ref={reviewRef} aria-labelledby="review-title" className="flex scroll-mt-4 flex-col gap-4" data-result-section="review">
          <h2 id="review-title" className="text-h2 font-bold text-fg">
            Question review
          </h2>
          <div role="group" aria-label="Show questions" className="grid grid-cols-2 gap-1 rounded-xl bg-ink-100 p-1 sm:grid-cols-4" data-review-filters="">
            {REVIEW_FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                aria-pressed={filter === f.value}
                onClick={() => {
                  setFilter(f.value);
                  setExpanded(false);
                }}
                className={cn("focus-ring min-h-12 rounded-lg px-2 text-body-sm font-semibold", filter === f.value ? "bg-surface text-fg shadow-xs" : "text-fg-secondary hover:text-fg")}
              >
                {f.label} ({counts[f.value]})
              </button>
            ))}
          </div>
          {sectionNames.length > 1 && (
            <div className="flex flex-col gap-1">
              <label htmlFor="review-section" className="text-body-sm font-medium text-fg-secondary">
                Section
              </label>
              <select
                id="review-section"
                value={section}
                onChange={(e) => {
                  setSection(e.target.value);
                  setExpanded(false);
                }}
                className="focus-ring min-h-12 rounded-lg border border-line-control bg-surface px-3 text-body text-fg sm:max-w-xs"
              >
                <option value="all">All sections</option>
                {sectionNames.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
          )}
          <p className="text-body-sm text-fg-secondary" aria-live="polite">
            Showing {visible.length} of {filtered.length} {filtered.length === 1 ? "question" : "questions"}
          </p>
          {filtered.length === 0 ? (
            <p className="rounded-card border border-line bg-surface p-6 text-center text-body text-fg-secondary">No questions in this view.</p>
          ) : (
            <div className="flex flex-col gap-4">
              {visible.map((q) => (
                <QuestionReviewCard
                  key={q.mockQuestionId}
                  questionOrder={q.questionOrder}
                  sectionName={q.sectionName}
                  questionText={q.questionText}
                  questionImageUrl={q.questionImageUrl}
                  optionsType={q.optionsType}
                  options={q.options}
                  selectedOption={q.selectedOption}
                  correctOption={q.correctOption}
                  isCorrect={q.isCorrect}
                  isMarked={q.isMarked}
                  marksAwarded={q.marksAwarded}
                  explanation={q.explanation}
                  topicName={q.topicName}
                  topicSlug={q.topicSlug}
                  timeSpentSeconds={q.timeSpentSeconds}
                  learningSlug={q.learningSlug}
                  learningDocTitle={q.learningDocTitle}
                  hasPublishedLearning={q.hasPublishedLearning}
                  questionId={q.questionId}
                  questionVersionId={q.questionVersionId}
                  canAddToMemoryLock={analysis.memoryLockEnabled}
                  correction={q.correction ?? null}
                />
              ))}
            </div>
          )}
          {filtered.length > PAGE && (
            <Button variant="secondary" size="lg" className="min-h-12 self-center" onClick={() => setExpanded((v) => !v)} trailingIcon={expanded ? <ChevronUp aria-hidden="true" className="size-4" /> : <ChevronDown aria-hidden="true" className="size-4" />}>
              {expanded ? "Show fewer" : `Show all ${filtered.length}`}
            </Button>
          )}
        </section>

        {/* 6. Rank / percentile — only when computed from ≥ RANK_MIN_COHORT real students (R12); otherwise omitted */}
        {standing && (
          <section aria-labelledby="standing-title" className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 sm:p-6" data-result-section="standing">
            <h2 id="standing-title" className="text-h2 font-bold text-fg">
              Your standing
            </h2>
            <dl className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-line px-3 py-2">
                <dt className="text-caption font-medium text-fg-secondary">Rank</dt>
                <dd className="text-h3 font-semibold tabular-nums text-fg">
                  {standing.rank} of {standing.n}
                </dd>
              </div>
              <div className="rounded-xl border border-line px-3 py-2">
                <dt className="text-caption font-medium text-fg-secondary">Percentile</dt>
                <dd className="text-h3 font-semibold tabular-nums text-fg">{standing.percentile}</dd>
              </div>
            </dl>
            <p className="text-body-sm text-fg-secondary">
              Based on the first attempts of {standing.n} students who took this mock. You scored higher than {standing.percentile}% of the others.
            </p>
            <ButtonLink href={`/mock-tests/${test.id}/leaderboard`} variant="ghost" size="lg" className="min-h-12 self-start" trailingIcon={<ArrowRight aria-hidden="true" className="size-4" />}>
              Leaderboard
            </ButtonLink>
          </section>
        )}
      </div>
    </div>
  );
}

function ActionControl({ action, primary = false, onFilter }: { action: TakeawayAction; primary?: boolean; onFilter: (f: ReviewFilter) => void }) {
  const variant = primary ? "primary" : "ghost";
  if (action.kind === "practice") {
    return (
      <ButtonLink href={action.href} variant={variant} size="lg" className="min-h-12 self-start" data-takeaway-action={primary ? "primary" : "secondary"} trailingIcon={<ArrowRight aria-hidden="true" className="size-4" />}>
        {action.label}
      </ButtonLink>
    );
  }
  return (
    <Button variant={variant} size="lg" className="min-h-12 self-start" data-takeaway-action={primary ? "primary" : "secondary"} onClick={() => onFilter(action.filter)}>
      {action.label}
    </Button>
  );
}
