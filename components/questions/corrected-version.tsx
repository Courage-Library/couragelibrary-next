import { RefreshCw } from "lucide-react";
import { CORRECTED_NOTICE, type VersionSnapshot } from "@/lib/questions/correction-core";

/**
 * MISTAKE-VERSION-1: shown under the ANSWERED version when a newer published version of the question exists — the
 * corrected stem, options and key. Text + icon (never colour alone). The answered version above stays exactly as the
 * student saw it.
 */
export function CorrectedVersion({ correction }: { correction: VersionSnapshot }) {
  return (
    <section aria-label={CORRECTED_NOTICE} className="space-y-2 rounded-card border border-primary-200 bg-primary-50 p-4" data-question-corrected="">
      <p className="flex items-center gap-2 text-body-sm font-semibold text-primary-800">
        <RefreshCw aria-hidden="true" className="size-4 shrink-0" />
        {CORRECTED_NOTICE}
      </p>
      <p className="text-body-sm text-fg-secondary">You answered the version above. This is the corrected question and its answer:</p>
      <p className="whitespace-pre-wrap text-body font-semibold text-fg">{correction.questionText}</p>
      <ul className="space-y-1.5">
        {correction.options.map((o) => {
          const right = correction.correctOptionKey !== null && o.key === correction.correctOptionKey;
          return (
            <li key={o.key} className={right ? "flex items-start gap-2 rounded-control border border-success-600 bg-surface p-2 text-body-sm font-semibold text-fg" : "flex items-start gap-2 rounded-control border border-line bg-surface p-2 text-body-sm text-fg"}>
              <span className="font-bold">{o.key}</span>
              <span className="flex-1">{o.text}</span>
              {right && <span className="text-caption font-semibold text-success-700">Correct answer</span>}
            </li>
          );
        })}
      </ul>
      {correction.correctOptionKey === null && <p className="text-body-sm text-fg-secondary">The corrected version has no answer key yet.</p>}
      {correction.explanation && <p className="whitespace-pre-wrap text-body-sm text-fg-secondary">{correction.explanation}</p>}
    </section>
  );
}
