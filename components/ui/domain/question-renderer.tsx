import { useId } from "react";
import { Bookmark, Check, X } from "lucide-react";
import type { OptionItem } from "@/components/assessment/question-options";
import { Badge } from "../badge";
import { cn } from "../cn";

export type QuestionRendererProps = {
  questionNumber: number;
  totalQuestions?: number;
  sectionName?: string;
  /** Existing data shape (TestResultSummary.reviewQuestions / QuestionOptions). */
  questionText: string;
  questionImageUrl?: string | null;
  /** Alt text for the question figure. Authoring will supply it; until then a generic label is used. */
  questionImageAlt?: string;
  optionsType?: string;
  options: OptionItem[];
  selectedOption: string | null;
  /** Review mode only. */
  correctOption?: string;
  /** test: no verdict · review: correct / wrong / skipped */
  mode?: "test" | "review";
  markedForReview?: boolean;
  /** Language of the stem and options (content language is per item). */
  lang?: string;
  className?: string;
};

type OptionState = "idle" | "selected" | "correct" | "wrong" | "correct-unselected";

const OPTION_BOX: Record<OptionState, string> = {
  idle: "border-line-control bg-surface text-fg",
  selected: "border-2 border-answer-selected-border bg-answer-selected-bg text-answer-selected-fg",
  correct: "border-2 border-answer-correct-border bg-answer-correct-bg text-answer-correct-fg",
  "correct-unselected": "border-2 border-answer-correct-border bg-answer-correct-bg text-answer-correct-fg",
  wrong: "border-2 border-answer-wrong-border bg-answer-wrong-bg text-answer-wrong-fg",
};

const LETTER_BOX: Record<OptionState, string> = {
  idle: "border border-line-control bg-surface text-fg-secondary",
  selected: "bg-answer-selected-border text-fg-inverse",
  correct: "bg-success-700 text-fg-inverse",
  "correct-unselected": "bg-success-700 text-fg-inverse",
  wrong: "bg-answer-wrong-border text-fg-inverse",
};

function OptionContent({ option }: { option: OptionItem }) {
  return (
    <>
      {option.text && <span className="text-body">{option.text}</span>}
      {option.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- question media is served from storage
        <img src={option.imageUrl} alt={`Option ${option.key}`} className="max-h-48 w-auto max-w-full rounded-badge object-contain" />
      )}
    </>
  );
}

/**
 * Question display (UX-1a). Test mode renders the options as a native radio group (fieldset + legend);
 * the console wires answer saving in a later phase. Review mode
 * marks right / wrong with an icon AND a text label ("Your answer", "Correct answer"), never colour alone.
 * Interaction (selecting, marking) is wired by the console in a later phase.
 */
export function QuestionRenderer({
  questionNumber,
  totalQuestions,
  sectionName,
  questionText,
  questionImageUrl,
  questionImageAlt,
  optionsType = "text",
  options,
  selectedOption,
  correctOption,
  mode = "test",
  markedForReview = false,
  lang = "en",
  className,
}: QuestionRendererProps) {
  const review = mode === "review";
  const skipped = review && selectedOption === null;
  const uid = useId();
  const headingId = `${uid}-stem`;

  const stateOf = (key: string): OptionState => {
    if (!review) return key === selectedOption ? "selected" : "idle";
    if (key === correctOption) return key === selectedOption ? "correct" : "correct-unselected";
    if (key === selectedOption) return "wrong";
    return "idle";
  };

  return (
    <article lang={lang} aria-labelledby={headingId} className={cn("flex flex-col gap-4 rounded-card border border-line bg-surface p-4 sm:p-6", className)}>
      <header className="flex flex-wrap items-center justify-between gap-2 text-body-sm text-fg-secondary">
        <span className="font-medium">
          Question {questionNumber}
          {totalQuestions ? ` of ${totalQuestions}` : ""}
          {sectionName ? ` · ${sectionName}` : ""}
        </span>
        <span className="flex flex-wrap gap-1.5">
          {markedForReview && (
            <Badge tone="warning" icon={<Bookmark aria-hidden="true" className="size-3" />}>
              Marked for review
            </Badge>
          )}
          {review && skipped && <Badge tone="neutral">Not answered</Badge>}
          {review && !skipped && selectedOption === correctOption && <Badge tone="success">Correct</Badge>}
          {review && !skipped && selectedOption !== correctOption && <Badge tone="danger">Incorrect</Badge>}
        </span>
      </header>

      <div id={headingId} className="whitespace-pre-line text-body-lg text-fg">
        {questionText}
      </div>
      {questionImageUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- question media is served from storage with intrinsic sizes
        <img src={questionImageUrl} alt={questionImageAlt ?? `Figure for question ${questionNumber}`} className="max-h-80 w-auto max-w-full rounded-control border border-line object-contain" />
      )}

      {review ? (
        <ul aria-label={`Options for question ${questionNumber}`} className={cn("grid gap-2", optionsType === "image" ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1")}>
          {options.map((o) => {
            const st = stateOf(o.key);
            const isYours = o.key === selectedOption;
            const isCorrect = o.key === correctOption;
            return (
              <li key={o.key} className={cn("flex min-h-12 items-start gap-3 rounded-control border p-3", OPTION_BOX[st])}>
                <span aria-hidden="true" className={cn("flex size-7 shrink-0 items-center justify-center rounded-full text-body-sm font-semibold", LETTER_BOX[st])}>
                  {o.key}
                </span>
                <span className="sr-only">Option {o.key}: </span>
                <span className="flex min-w-0 flex-1 flex-col gap-2 pt-0.5">
                  <OptionContent option={o} />
                  {(isYours || isCorrect) && (
                    <span className="flex flex-wrap gap-x-3 gap-y-1 text-body-sm font-semibold">
                      {isYours && (
                        <span className="inline-flex items-center gap-1">
                          {isCorrect ? <Check aria-hidden="true" className="size-4" /> : <X aria-hidden="true" className="size-4" />}
                          Your answer
                        </span>
                      )}
                      {isCorrect && (
                        <span className="inline-flex items-center gap-1">
                          {!isYours && <Check aria-hidden="true" className="size-4" />}
                          Correct answer
                        </span>
                      )}
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <fieldset className={cn("grid gap-2", optionsType === "image" ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1")}>
          <legend className="sr-only">Options for question {questionNumber}</legend>
          {options.map((o) => (
            <label
              key={o.key}
              className={cn(
                "group flex min-h-12 cursor-pointer items-start gap-3 rounded-control border p-3",
                OPTION_BOX.idle,
                "hover:border-ink-600 has-[:checked]:border-2 has-[:checked]:border-answer-selected-border has-[:checked]:bg-answer-selected-bg has-[:checked]:text-answer-selected-fg",
                "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus",
              )}
            >
              {/* Native radios: keyboard (arrow keys) and screen-reader support without JavaScript. */}
              <input type="radio" name={`${uid}-answer`} value={o.key} defaultChecked={o.key === selectedOption} className="peer sr-only" />
              <span
                aria-hidden="true"
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full text-body-sm font-semibold",
                  LETTER_BOX.idle,
                  "peer-checked:border-0 peer-checked:bg-answer-selected-border peer-checked:text-fg-inverse",
                )}
              >
                {o.key}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-2 pt-0.5">
                <span className="sr-only">Option {o.key}: </span>
                <OptionContent option={o} />
              </span>
            </label>
          ))}
        </fieldset>
      )}
    </article>
  );
}
