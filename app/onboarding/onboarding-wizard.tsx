"use client";

import { useReducer, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Container } from "@/components/ui/layout";
import { ProgressBar } from "@/components/ui/progress";
import { PillLink } from "@/components/ui/pill-button";
import { cn } from "@/components/ui/cn";
import { ONBOARDING_COPY as C, type Bilingual } from "@/content/onboarding";
import {
  ATTEMPTS,
  DAILY_MINUTES,
  LANGUAGES,
  MAX_EXAMS,
  TOTAL_STEPS,
  buildPlan,
  initWizard,
  validateAnswers,
  wizardReducer,
  type OnboardingAnswers,
  type PlanExam,
} from "@/lib/onboarding/schema";
import { saveOnboardingAction, skipOnboardingAction } from "./actions";

/** Hindi line (lang="hi": Devanagari face, line-height 1.7) above the English line — design rule R9. */
function Bi({ b, className, as: Tag = "span" }: { b: Bilingual; className?: string; as?: "span" | "p" | "h1" | "h2" }) {
  return (
    <Tag className={cn("flex flex-col", className)}>
      <span lang="hi">{b.hi}</span>
      <span>{b.en}</span>
    </Tag>
  );
}

/** A large, single-select or multi-select option (≥ 48 px; state shown by check icon + border, never colour alone). */
function Option({ selected, onSelect, children, disabled, role = "radio" }: { selected: boolean; onSelect: () => void; children: ReactNode; disabled?: boolean; role?: "radio" | "checkbox" }) {
  return (
    <button
      type="button"
      role={role}
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "focus-ring flex min-h-12 w-full items-center justify-between gap-3 rounded-control border px-4 py-3 text-left text-body",
        selected ? "border-2 border-brand bg-primary-50 font-semibold text-fg" : "border-line-control bg-surface text-fg hover:bg-ink-50",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      <span>{children}</span>
      {selected && <Check aria-hidden="true" className="size-5 shrink-0 text-brand" />}
    </button>
  );
}

export function OnboardingWizard({ exams, initial, next, today }: { exams: PlanExam[]; initial: OnboardingAnswers; next: string; today: string }) {
  const [s, dispatch] = useReducer(wizardReducer, initial, initWizard);
  const [dateKnown, setDateKnown] = useState<boolean>(initial.examDate !== null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const a = s.answers;
  const onPlan = s.step > TOTAL_STEPS;

  const finish = (override: Partial<OnboardingAnswers> = {}) => {
    setError(null);
    if (Object.keys(override).length) dispatch({ type: "set", patch: override });
    const answers: OnboardingAnswers = { ...a, examDate: dateKnown ? a.examDate : null, ...override };
    const v = validateAnswers(answers, { today, allowedExamIds: exams.map((e) => e.id) });
    if (!v.ok) {
      setError(v.field === "examDate" ? `${C.steps.timing.datePast.hi} ${C.steps.timing.datePast.en}` : `${C.error.hi} ${C.error.en}`);
      return;
    }
    startTransition(async () => {
      const r = await saveOnboardingAction(v.value);
      if (r.ok) dispatch({ type: "next" });
      else setError(`${C.error.hi} ${C.error.en}`);
    });
  };

  const skipAll = () => startTransition(async () => {
    const r = await skipOnboardingAction(next);
    if (r && !r.ok) setError(`${C.error.hi} ${C.error.en}`);
  });

  if (onPlan) {
    const plan = buildPlan({ ...a, examDate: dateKnown ? a.examDate : null }, exams);
    const primaryLabel: Bilingual = plan.primary.kind === "practice" ? C.plan.start : plan.primary.kind === "exam" && plan.exam ? C.plan.openExam(plan.exam.title) : C.plan.browseExams;
    return (
      <Container className="flex max-w-2xl flex-col gap-6 py-10">
        <Bi as="h1" b={C.plan.title} className="text-h1 font-bold text-fg" />
        <Card className="flex flex-col gap-3">
          <Bi as="p" b={C.plan.daily(plan.setSize)} className="text-body-lg font-semibold text-fg" />
          {plan.exam ? (
            <Bi as="p" b={plan.exam.firstSection ? C.plan.from(plan.exam.firstSection, plan.exam.title) : C.plan.fromExam(plan.exam.title)} className="text-body text-fg-secondary" />
          ) : (
            <Bi as="p" b={C.plan.noExam} className="text-body text-fg-secondary" />
          )}
          {plan.primary.kind === "exam" && <Bi as="p" b={C.plan.practiceNotReady} className="text-body-sm text-fg-secondary" />}
        </Card>
        <div className="flex flex-col items-start gap-3">
          <PillLink href={plan.primary.href}>
            {primaryLabel.en} · <span lang="hi">{primaryLabel.hi}</span>
          </PillLink>
          <div className="flex flex-wrap gap-4 text-body-sm">
            <Link href={next} className="focus-ring inline-flex min-h-12 items-center rounded-control text-link underline underline-offset-2">
              {C.plan.later.en} · <span lang="hi">{C.plan.later.hi}</span>
            </Link>
            <button type="button" onClick={() => dispatch({ type: "back" })} className="focus-ring inline-flex min-h-12 items-center rounded-control text-link underline underline-offset-2">
              {C.plan.edit.en} · <span lang="hi">{C.plan.edit.hi}</span>
            </button>
          </div>
        </div>
      </Container>
    );
  }

  const progress = C.progress(s.step, TOTAL_STEPS);
  const isLast = s.step === TOTAL_STEPS;
  return (
    <Container className="flex max-w-2xl flex-col gap-6 py-10" data-onboarding-step={s.step}>
      <div className="flex flex-col gap-2">
        <Bi as="p" b={C.pageTitle} className="text-body-sm font-semibold text-fg-secondary" />
        <ProgressBar label={`${progress.en} · ${progress.hi}`} value={s.step} max={TOTAL_STEPS} valueText={progress.en} showValue={false} />
      </div>

      <Card className="flex flex-col gap-4">
        {s.step === 1 && (
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2"><Bi b={C.steps.language.title} className="text-h2 font-bold text-fg" /></legend>
            <div role="radiogroup" className="flex flex-col gap-2">
              {LANGUAGES.map((l) => (
                <Option key={l} selected={a.language === l} onSelect={() => dispatch({ type: "set", patch: { language: l } })}>
                  <span lang="hi">{C.steps.language.options[l].hi}</span> · {C.steps.language.options[l].en}
                </Option>
              ))}
            </div>
            <Bi as="p" b={C.steps.language.note} className="text-body-sm text-fg-secondary" />
          </fieldset>
        )}

        {s.step === 2 && (
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2"><Bi b={C.steps.exams.title} className="text-h2 font-bold text-fg" /></legend>
            <Bi as="p" b={a.examIds.length >= MAX_EXAMS ? C.steps.exams.max : C.steps.exams.note} className="text-body-sm text-fg-secondary" />
            {exams.length === 0 ? (
              <Bi as="p" b={C.steps.exams.none} className="text-body text-fg" />
            ) : (
              <div className="flex flex-col gap-2">
                {exams.map((e) => {
                  const selected = a.examIds.includes(e.id);
                  return (
                    <Option key={e.id} role="checkbox" selected={selected} disabled={!selected && a.examIds.length >= MAX_EXAMS} onSelect={() => dispatch({ type: "toggleExam", examId: e.id })}>
                      {e.title}
                    </Option>
                  );
                })}
              </div>
            )}
          </fieldset>
        )}

        {s.step === 3 && (
          <div className="flex flex-col gap-5">
            <fieldset className="flex flex-col gap-3">
              <legend className="mb-2"><Bi b={C.steps.timing.title} className="text-h2 font-bold text-fg" /></legend>
              <div role="radiogroup" className="flex flex-col gap-2">
                <Option selected={dateKnown} onSelect={() => setDateKnown(true)}>
                  <span lang="hi">{C.steps.timing.known.hi}</span> · {C.steps.timing.known.en}
                </Option>
                <Option selected={!dateKnown} onSelect={() => { setDateKnown(false); dispatch({ type: "set", patch: { examDate: null } }); }}>
                  <span lang="hi">{C.steps.timing.unknown.hi}</span> · {C.steps.timing.unknown.en}
                </Option>
              </div>
              {dateKnown && (
                <label className="flex flex-col gap-1 text-body-sm font-medium text-fg">
                  <span><span lang="hi">{C.steps.timing.dateLabel.hi}</span> · {C.steps.timing.dateLabel.en}</span>
                  <input
                    type="date"
                    min={today}
                    value={a.examDate ?? ""}
                    onChange={(ev) => dispatch({ type: "set", patch: { examDate: ev.target.value || null } })}
                    className="focus-ring min-h-12 rounded-control border border-line-control bg-surface px-3 text-body text-fg"
                  />
                </label>
              )}
            </fieldset>
            <fieldset className="flex flex-col gap-3">
              <legend className="mb-2"><Bi b={C.steps.timing.attemptTitle} className="text-h3 font-semibold text-fg" /></legend>
              <div role="radiogroup" className="flex flex-col gap-2">
                {ATTEMPTS.map((t) => (
                  <Option key={t} selected={a.attempt === t} onSelect={() => dispatch({ type: "set", patch: { attempt: t } })}>
                    <span lang="hi">{C.steps.timing.attempts[t].hi}</span> · {C.steps.timing.attempts[t].en}
                  </Option>
                ))}
              </div>
            </fieldset>
          </div>
        )}

        {s.step === 4 && (
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2"><Bi b={C.steps.time.title} className="text-h2 font-bold text-fg" /></legend>
            <div role="radiogroup" className="grid grid-cols-2 gap-2">
              {DAILY_MINUTES.map((m) => {
                const label = C.steps.time.minutes(m);
                return (
                  <Option key={m} selected={a.dailyMinutes === m} onSelect={() => dispatch({ type: "set", patch: { dailyMinutes: m } })}>
                    <span lang="hi">{label.hi}</span> · {label.en}
                  </Option>
                );
              })}
            </div>
          </fieldset>
        )}

        {error && (
          <Alert tone="danger" live>
            {error}
          </Alert>
        )}

        {/* ONE primary action (R4); Back keeps every answer; any step can be skipped */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <Button variant="secondary" size="lg" className="min-h-12" disabled={s.step === 1 || pending} onClick={() => dispatch({ type: "back" })}>
            {C.back.en} · <span lang="hi">{C.back.hi}</span>
          </Button>
          <Button size="lg" className="min-h-12" loading={pending} onClick={isLast ? () => finish() : () => dispatch({ type: "next" })}>
            {isLast ? C.finish.en : C.next.en} · <span lang="hi">{isLast ? C.finish.hi : C.next.hi}</span>
          </Button>
        </div>
        <div className="flex flex-wrap gap-4 text-body-sm">
          <button
            type="button"
            disabled={pending}
            onClick={() => (isLast ? finish({ dailyMinutes: null }) : dispatch({ type: "skipStep" }))}
            className="focus-ring inline-flex min-h-12 items-center rounded-control text-link underline underline-offset-2"
          >
            {C.skipStep.en} · <span lang="hi">{C.skipStep.hi}</span>
          </button>
          <button type="button" disabled={pending} onClick={skipAll} className="focus-ring inline-flex min-h-12 items-center rounded-control text-fg-secondary underline underline-offset-2">
            {C.skipAll.en} · <span lang="hi">{C.skipAll.hi}</span>
          </button>
        </div>
      </Card>
    </Container>
  );
}
