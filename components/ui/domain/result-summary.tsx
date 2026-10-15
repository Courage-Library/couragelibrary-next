import type { TestResultSummary } from "@/services/assessment.service";
import { ProgressRing } from "../progress";
import { StatTile } from "../stat-tile";
import { formatDuration, formatPercent, formatScore } from "@/lib/format";

export type ResultSummaryProps = {
  /** Existing data shape from AssessmentService (only the parts the summary needs). */
  data: Pick<TestResultSummary, "result" | "test" | "sections">;
  /** Retake: difference vs the best previous score. */
  previousBest?: number | null;
  headingLevel?: 2 | 3;
};

/**
 * Score hero + accuracy ring + attempt breakdown + section table. The table is the text alternative
 * for the visual parts. Percentile / rank appear only when the service provides them (never estimated).
 */
export function ResultSummary({ data, previousBest = null, headingLevel = 2 }: ResultSummaryProps) {
  const { result, test, sections } = data;
  const H = `h${headingLevel}` as "h2" | "h3";
  const delta = previousBest == null ? null : result.totalScore - previousBest;
  return (
    <section aria-labelledby="result-summary-title" className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4 sm:flex-row sm:items-center sm:p-6">
        <div className="flex flex-1 flex-col gap-1">
          <H id="result-summary-title" className="text-body font-medium text-fg-secondary">
            {test.title}: your score
          </H>
          <p className="text-display font-bold tabular-nums text-fg">{formatScore(result.totalScore, result.maxScore)}</p>
          <p className="text-body-sm text-fg-secondary">
            {result.percentile != null && <>Percentile {formatPercent(result.percentile).replace("%", "")} · </>}
            {result.rank != null && <>Rank {result.rank} · </>}
            Time {formatDuration(result.timeSpentSeconds)} of {test.durationMinutes} min
          </p>
          {delta != null && (
            <p className={delta >= 0 ? "text-body-sm font-medium text-success-700" : "text-body-sm font-medium text-danger-700"}>
              {delta >= 0 ? `+${Number(delta.toFixed(2))}` : Number(delta.toFixed(2))} vs your best
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <ProgressRing label="Accuracy" value={result.accuracyPercentage} valueText={`${formatPercent(result.accuracyPercentage)} accuracy`} size={88} />
          <span className="text-body-sm text-fg-secondary">Accuracy</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Attempted" value={`${result.attemptedCount} / ${result.totalQuestions}`} />
        <StatTile label="Correct" value={result.correctCount} />
        <StatTile label="Wrong" value={result.incorrectCount} />
        <StatTile label="Skipped" value={result.unansweredCount} />
      </div>

      {sections.length > 0 && (
        <div className="overflow-x-auto rounded-card border border-line bg-surface">
          <table className="w-full min-w-[32rem] text-left text-body-sm">
            <caption className="sr-only">Section-wise result</caption>
            <thead className="bg-surface-sunken text-fg-secondary">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Section</th>
                <th scope="col" className="px-4 py-3 font-medium">Score</th>
                <th scope="col" className="px-4 py-3 font-medium">Correct</th>
                <th scope="col" className="px-4 py-3 font-medium">Wrong</th>
                <th scope="col" className="px-4 py-3 font-medium">Accuracy</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {sections.map((s) => (
                <tr key={s.id ?? s.sectionName}>
                  <th scope="row" className="px-4 py-3 font-medium text-fg">{s.sectionName}</th>
                  <td className="px-4 py-3 tabular-nums">{formatScore(s.sectionScore, s.maxScore)}</td>
                  <td className="px-4 py-3 tabular-nums">{s.correctCount}</td>
                  <td className="px-4 py-3 tabular-nums">{s.incorrectCount}</td>
                  <td className="px-4 py-3 tabular-nums">{formatPercent(s.accuracyPercentage)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
