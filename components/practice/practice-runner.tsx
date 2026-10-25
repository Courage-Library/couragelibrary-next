"use client";

/**
 * F2 practice runner. The questions arrive WITHOUT keys or explanations (lib/practice/engine PracticeQuestion); each
 * answer is checked on the server (checkPracticeAnswerAction → fn_check_practice_answer), which returns that one
 * question's result + explanation. Rules: one primary action per screen (R4) — "Check answer", then "Next question";
 * progress always visible (R5); result shown by text + icon, never colour alone; feedback about the task (R3); UI in
 * English, question content in the chosen language with an EN/HI toggle only when the other version exists (R9).
 */
import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { BookOpen, CheckCircle2, XCircle } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress";
import { PillButton, PillLink } from "@/components/ui/pill-button";
import { cn } from "@/components/ui/cn";
import { PRACTICE_COPY } from "@/content/practice";
import { takeaways, type ContentLanguage, type PracticeMode, type PracticeQuestion } from "@/lib/practice/engine";
import { checkPracticeAnswerAction, type CheckAnswerResult } from "@/app/practice/actions";
import { ReportQuestionButton } from "./report-question-button";

const C = PRACTICE_COPY.runner;
const E = PRACTICE_COPY.end;

type Checked = Extract<CheckAnswerResult, { ok: true }>;

export function PracticeRunner(props: {
  setId: string;
  mode: PracticeMode;
  title: string;
  questions: PracticeQuestion[];
  topicNames: Record<string, string>;
  articles: Record<string, string>;
  againHref: string;
  nextTopicHref: string | null;
  chooseHref: string;
}) {
  const { questions } = props;
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<Record<string, string | null>>({});
  const [results, setResults] = useState<Record<string, Checked>>({});
  const [lang, setLang] = useState<Record<string, ContentLanguage>>({});
  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const [pending, start] = useTransition();
  const shownAt = useRef<number>(Date.now());

  const q = questions[index];
  const result = q ? results[q.questionId] : undefined;

  const view = useMemo(() => {
    if (!q) return null;
    const want = lang[q.questionId] ?? q.language;
    const alt = q.alternates.find((a) => a.language === want);
    return alt ? { versionId: alt.versionId, text: alt.text, options: alt.options, language: alt.language } : { versionId: q.versionId, text: q.text, options: q.options, language: q.language };
  }, [q, lang]);

  if (finished || !q || !view) {
    const rows = questions.map((x) => ({ questionId: x.questionId, topicName: x.topicId ? props.topicNames[x.topicId] ?? null : null, isCorrect: results[x.questionId]?.isCorrect ?? false, answered: Boolean(results[x.questionId]) && selected[x.questionId] != null }));
    const correct = rows.filter((r) => r.isCorrect).length;
    return (
      <Card className="flex flex-col gap-4" data-practice-end="">
        <h2 className="text-h2 font-bold text-fg">{E.title}</h2>
        <p className="text-body-lg font-semibold text-fg">{E.score(correct, questions.length)}</p>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-body text-fg-secondary">
          {takeaways(rows).map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center gap-3">
          <PillLink href={props.againHref} variant="accent-on-light">
            {E.again}
          </PillLink>
          {props.nextTopicHref ? (
            <ButtonLink href={props.nextTopicHref} variant="secondary" size="lg" className="min-h-12">
              {E.nextTopic}
            </ButtonLink>
          ) : (
            <ButtonLink href={props.chooseHref} variant="secondary" size="lg" className="min-h-12">
              {E.allTopics}
            </ButtonLink>
          )}
        </div>
      </Card>
    );
  }

  const check = () => {
    setError(null);
    const choice = selected[q.questionId] ?? null;
    if (choice === null) {
      setError(C.unanswered);
      return;
    }
    start(async () => {
      const r = await checkPracticeAnswerAction({ versionId: view.versionId, selected: choice, timeMs: Date.now() - shownAt.current, setId: props.setId, mode: props.mode }).catch(() => ({ ok: false as const, code: "FAILED" as const }));
      if (r.ok) setResults((m) => ({ ...m, [q.questionId]: r }));
      else setError(C.errors[r.code] ?? C.errors.FAILED);
    });
  };
  const next = () => {
    setError(null);
    shownAt.current = Date.now();
    if (index + 1 >= questions.length) setFinished(true);
    else setIndex(index + 1);
  };
  const article = q.topicId ? props.articles[q.topicId] : undefined;
  const isLast = index + 1 >= questions.length;

  return (
    <div className="flex flex-col gap-4" data-practice-question={index + 1}>
      <ProgressBar label={C.progress(index + 1, questions.length)} value={index + 1} max={questions.length} valueText={C.progress(index + 1, questions.length)} />
      <Card className="flex flex-col gap-4">
        {q.alternates.length > 0 && (
          <div role="group" aria-label={C.language} className="flex gap-2">
            {(["en", "hi"] as const).map((l) => (
              <button
                key={l}
                type="button"
                aria-pressed={view.language === l}
                disabled={Boolean(result)}
                onClick={() => setLang((m) => ({ ...m, [q.questionId]: l }))}
                className={cn("focus-ring min-h-12 rounded-control border px-4 text-body-sm font-medium", view.language === l ? "border-2 border-primary-600 bg-primary-50 text-fg" : "border-line-control bg-surface text-fg")}
              >
                {l === "en" ? C.english : C.hindi}
              </button>
            ))}
          </div>
        )}
        <p className="whitespace-pre-line text-body-lg text-fg" lang={view.language}>
          {view.text}
        </p>
        {q.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={q.imageUrl} alt="" className="max-h-80 w-auto rounded-control border border-line" />
        )}
        <fieldset className="flex flex-col gap-2" disabled={Boolean(result) || pending}>
          <legend className="sr-only">{C.progress(index + 1, questions.length)}</legend>
          {view.options.map((o) => {
            const chosen = selected[q.questionId] === o.key;
            const isKey = result?.correctKey === o.key;
            return (
              <label
                key={o.key}
                className={cn(
                  "flex min-h-12 cursor-pointer items-center gap-3 rounded-control border px-4 py-3 text-body has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus",
                  result && isKey ? "border-2 border-success-600 bg-success-50" : result && chosen ? "border-2 border-danger-600 bg-danger-50" : chosen ? "border-2 border-primary-600 bg-primary-50" : "border-line-control bg-surface",
                )}
              >
                <input type="radio" className="sr-only" name={`q-${q.questionId}`} value={o.key} checked={chosen} onChange={() => setSelected((m) => ({ ...m, [q.questionId]: o.key }))} />
                <span className="font-semibold text-fg">{o.key}.</span>
                <span className="flex-1 text-fg" lang={view.language}>
                  {o.text}
                </span>
                {result && isKey && <CheckCircle2 aria-label={C.correct} className="size-5 shrink-0 text-success-700" />}
                {result && chosen && !isKey && <XCircle aria-label={C.incorrect} className="size-5 shrink-0 text-danger-700" />}
              </label>
            );
          })}
        </fieldset>

        {error && (
          <Alert tone="warning" live>
            {error}
          </Alert>
        )}

        {result && (
          <div className="flex flex-col gap-2 rounded-control border border-line bg-surface-sunken p-4" data-practice-result={result.isCorrect ? "correct" : "incorrect"}>
            <p className="flex items-center gap-2 text-body font-semibold text-fg" role="status">
              {result.isCorrect ? <CheckCircle2 aria-hidden="true" className="size-5 text-success-700" /> : <XCircle aria-hidden="true" className="size-5 text-danger-700" />}
              {result.isCorrect ? C.correct : C.incorrect}
              <span className="font-normal text-fg-secondary">· {C.correctAnswer(result.correctKey)}</span>
            </p>
            <h3 className="text-body-sm font-semibold text-fg">{C.explanation}</h3>
            <p className="whitespace-pre-line text-body text-fg-secondary">{result.explanation ?? C.noExplanation}</p>
            {!result.isCorrect && result.savedToMistakes && <p className="text-body-sm text-fg-secondary">{C.savedToDrills}</p>}
            {article && (
              <Link href={article} className="focus-ring inline-flex min-h-12 items-center gap-2 text-body-sm font-medium text-link underline underline-offset-2">
                <BookOpen aria-hidden="true" className="size-4" />
                {C.learnMore}
              </Link>
            )}
          </div>
        )}

        {/* ONE primary action (R4) */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <ReportQuestionButton questionId={q.questionId} questionVersionId={view.versionId} />
          {result ? (
            <PillButton variant="accent-on-light" onClick={next}>
              {isLast ? C.finish : C.next}
            </PillButton>
          ) : (
            <PillButton variant="accent-on-light" onClick={check} disabled={pending}>
              {pending ? C.checking : C.check}
            </PillButton>
          )}
        </div>
      </Card>
    </div>
  );
}
