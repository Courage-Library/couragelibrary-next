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
import { ONBOARDING_COPY as C } from "@/content/onboarding";
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
  // F0-a: what the server actually deactivated (only goals shown pre-selected and explicitly unticked)
  const [removed, setRemoved] = useState<string[]>([]);
  const hadGoals = initial.examIds.length > 0;
  const [pending, startTransition] = useTransition();
  const a = s.answers;
  const onPlan = s.step > TOTAL_STEPS;

  const finish = (override: Partial<OnboardingAnswers> = {}) => {
    setError(null);
    if (Object.keys(override).length) dispatch({ type: "set", patch: override });
    const answers: OnboardingAnswers = { ...a, examDate: dateKnown ? a.examDate : null, ...override };
    const v = validateAnswers(answers, { today, allowedExamIds: exams.map((e) => e.id) });
    if (!v.ok) {
      setError(v.field === "examDate" ? C.steps.timing.datePast : C.error);
      return;
    }
    startTransition(async () => {
      const r = await saveOnboardingAction(v.value);
      if (r.ok) {
        setRemoved(r.removed ?? []);
        dispatch({ type: "next" });
      }
      else setError(C.error);
    });
  };

  const skipAll = () => startTransition(async () => {
    const r = await skipOnboardingAction(next);
    if (r && !r.ok) setError(C.error);
  });

  if (onPlan) {
    const plan = buildPlan({ ...a, examDate: dateKnown ? a.examDate : null }, exams);
    const primaryLabel = plan.primary.kind === "practice" ? C.plan.start : plan.primary.kind === "exam" && plan.exam ? C.plan.openExam(plan.exam.title) : C.plan.browseExams;
    return (
      <Container className="flex max-w-2xl flex-col gap-6 py-10">
        <h1 className="text-h1 font-bold text-fg">{C.plan.title}</h1>
        <Card className="flex flex-col gap-3">
          <p className="text-body-lg font-semibold text-fg">{C.plan.daily(plan.setSize)}</p>
          {plan.exam ? (
            <p className="text-body text-fg-secondary">{plan.exam.firstSection ? C.plan.from(plan.exam.firstSection, plan.exam.title) : C.plan.fromExam(plan.exam.title)}</p>
          ) : (
            <p className="text-body text-fg-secondary">{C.plan.noExam}</p>
          )}
          {plan.primary.kind === "exam" && <p className="text-body-sm text-fg-secondary">{C.plan.practiceNotReady}</p>}
          {removed.length > 0 && (
            <p className="text-body-sm font-medium text-fg">
              {C.plan.removed(removed.map((id) => exams.find((e) => e.id.toLowerCase() === id.toLowerCase())?.title ?? "—").join(", "))}
            </p>
          )}
        </Card>
        <div className="flex flex-col items-start gap-3">
          <PillLink href={plan.primary.href}>
            {primaryLabel}
          </PillLink>
          <div className="flex flex-wrap gap-4 text-body-sm">
            <Link href={next} className="focus-ring inline-flex min-h-12 items-center rounded-control text-link underline underline-offset-2">
              {C.plan.later}
            </Link>
            <button type="button" onClick={() => dispatch({ type: "back" })} className="focus-ring inline-flex min-h-12 items-center rounded-control text-link underline underline-offset-2">
              {C.plan.edit}
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
        <p className="text-body-sm font-semibold text-fg-secondary">{C.pageTitle}</p>
        <ProgressBar label={progress} value={s.step} max={TOTAL_STEPS} valueText={progress} showValue={false} />
      </div>

      <Card className="flex flex-col gap-4">
        {s.step === 1 && (
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2"><span className="text-h2 font-bold text-fg">{C.steps.language.title}</span></legend>
            <div role="radiogroup" className="flex flex-col gap-2">
              {LANGUAGES.map((l) => (
                <Option key={l} selected={a.language === l} onSelect={() => dispatch({ type: "set", patch: { language: l } })}>
                  {C.steps.language.options[l]}
                </Option>
              ))}
            </div>
            <p className="text-body-sm text-fg-secondary">{C.steps.language.note}</p>
          </fieldset>
        )}

        {s.step === 2 && (
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2"><span className="text-h2 font-bold text-fg">{C.steps.exams.title}</span></legend>
            <p className="text-body-sm text-fg-secondary">{a.examIds.length >= MAX_EXAMS ? C.steps.exams.max : C.steps.exams.note}</p>
            {hadGoals && <p className="text-body-sm text-fg-secondary">{C.steps.exams.existing}</p>}
            {exams.length === 0 ? (
              <p className="text-body text-fg">{C.steps.exams.none}</p>
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
              <legend className="mb-2"><span className="text-h2 font-bold text-fg">{C.steps.timing.title}</span></legend>
              <div role="radiogroup" className="flex flex-col gap-2">
                <Option selected={dateKnown} onSelect={() => setDateKnown(true)}>
                  {C.steps.timing.known}
                </Option>
                <Option selected={!dateKnown} onSelect={() => { setDateKnown(false); dispatch({ type: "set", patch: { examDate: null } }); }}>
                  {C.steps.timing.unknown}
                </Option>
              </div>
              {dateKnown && (
                <label className="flex flex-col gap-1 text-body-sm font-medium text-fg">
                  <span>{C.steps.timing.dateLabel}</span>
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
              <legend className="mb-2"><span className="text-h3 font-semibold text-fg">{C.steps.timing.attemptTitle}</span></legend>
              <div role="radiogroup" className="flex flex-col gap-2">
                {ATTEMPTS.map((t) => (
                  <Option key={t} selected={a.attempt === t} onSelect={() => dispatch({ type: "set", patch: { attempt: t } })}>
                    {C.steps.timing.attempts[t]}
                  </Option>
                ))}
              </div>
            </fieldset>
          </div>
        )}

        {s.step === 4 && (
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2"><span className="text-h2 font-bold text-fg">{C.steps.time.title}</span></legend>
            <div role="radiogroup" className="grid grid-cols-2 gap-2">
              {DAILY_MINUTES.map((m) => {
                const label = C.steps.time.minutes(m);
                return (
                  <Option key={m} selected={a.dailyMinutes === m} onSelect={() => dispatch({ type: "set", patch: { dailyMinutes: m } })}>
                    {label}
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
            {C.back}
          </Button>
          <Button size="lg" className="min-h-12" loading={pending} onClick={isLast ? () => finish() : () => dispatch({ type: "next" })}>
            {isLast ? C.finish : C.next}
          </Button>
        </div>
        <div className="flex flex-wrap gap-4 text-body-sm">
          <button
            type="button"
            disabled={pending}
            onClick={() => (isLast ? finish({ dailyMinutes: null }) : dispatch({ type: "skipStep" }))}
            className="focus-ring inline-flex min-h-12 items-center rounded-control text-link underline underline-offset-2"
          >
            {C.skipStep}
          </button>
          <button type="button" disabled={pending} onClick={skipAll} className="focus-ring inline-flex min-h-12 items-center rounded-control text-fg-secondary underline underline-offset-2">
            {C.skipAll}
          </button>
        </div>
      </Card>
    </Container>
  );
}
