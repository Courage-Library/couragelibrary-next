import { ANSWER_KEY_UNAVAILABLE } from "@/lib/questions/answer-key";
import { cn } from "@/components/ui/cn";

/**
 * QB-KEY-1: shown wherever a correct answer would be shown but the question version has no valid answer key.
 * Never implies an option is correct; the question is not scored (lib/questions/answer-key.ts).
 */
export function AnswerKeyUnavailableNotice({ className, scored = false }: { className?: string; scored?: boolean }) {
  return (
    <p role="note" className={cn("rounded-control border border-warning-200 bg-warning-50 px-3 py-2 text-body-sm font-medium text-warning-800", className)}>
      {ANSWER_KEY_UNAVAILABLE}.{scored ? "" : " This question was not scored."}
    </p>
  );
}
