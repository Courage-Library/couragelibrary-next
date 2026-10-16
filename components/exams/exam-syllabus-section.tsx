import { BookOpen, ClipboardList, FileText } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateShort, formatNumber } from "@/lib/format";
import { WEIGHTAGE_TIER_LABEL, type SyllabusReadModel, type SyllabusReadModelNode } from "@/types/syllabus";

const TIER_TONE = { HIGH_YIELD: "primary", CORE: "info", MODERATE: "neutral", LOW: "neutral", OPTIONAL: "neutral" } as const;

/** "8–10 questions" / "At least 8" / "Up to 10"; null when nothing is known (never shown as 0). */
function expectedRange(n: SyllabusReadModelNode): string | null {
  const lo = n.expected_questions_min;
  const hi = n.expected_questions_max;
  if (lo === null && hi === null) return null;
  if (lo !== null && hi !== null) return lo === hi ? `${lo} question${lo === 1 ? "" : "s"} expected` : `${lo}–${hi} questions expected`;
  return lo !== null ? `At least ${lo} questions expected` : `Up to ${hi} questions expected`;
}

function plural(n: number, one: string, many: string) {
  return `${formatNumber(n)} ${n === 1 ? one : many}`;
}

function Unit({ node }: { node: SyllabusReadModelNode }) {
  const range = expectedRange(node);
  return (
    <li className="flex flex-col gap-2 rounded-control border border-line bg-surface p-3">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-body font-semibold text-fg">{node.title}</h4>
        {node.weightage_tier && <Badge tone={TIER_TONE[node.weightage_tier]}>{WEIGHTAGE_TIER_LABEL[node.weightage_tier]}</Badge>}
        {!node.is_mandatory && <Badge tone="neutral">Optional</Badge>}
      </div>
      {node.description && <p className="text-body-sm text-fg-secondary">{node.description}</p>}
      {range && <p className="text-body-sm text-fg-secondary">{range}</p>}
      {node.topics.length > 0 && (
        <ul className="flex flex-col gap-1" aria-label={`Topics in ${node.title}`}>
          {node.topics.map((t) => (
            <li key={t.topic_id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-body-sm">
              <span className="font-medium text-fg">{t.name}</span>
              <span className="flex flex-wrap gap-x-3 text-fg-secondary">
                <span className="inline-flex items-center gap-1">
                  <ClipboardList aria-hidden="true" className="size-4" />
                  {t.published_questions > 0 ? plural(t.published_questions, "practice question", "practice questions") : "Questions coming soon"}
                </span>
                <span className="inline-flex items-center gap-1">
                  <FileText aria-hidden="true" className="size-4" />
                  {t.servable_documents > 0 ? plural(t.servable_documents, "lesson", "lessons") : "Lessons coming soon"}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function Group({ node, byParent, level }: { node: SyllabusReadModelNode; byParent: Map<string | null, SyllabusReadModelNode[]>; level: number }) {
  const children = byParent.get(node.id) ?? [];
  const units = children.filter((c) => c.kind === "UNIT");
  const groups = children.filter((c) => c.kind !== "UNIT");
  const range = expectedRange(node);
  const Heading = (level <= 1 ? "h3" : "h4") as "h3" | "h4";
  return (
    <details open={level <= 1} className="group rounded-card border border-line bg-surface">
      <summary className="focus-ring flex min-h-12 cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 rounded-card px-4 py-3 hover:bg-ink-50 [&::-webkit-details-marker]:hidden">
        <Heading className="flex-1 text-body-lg font-semibold text-fg">{node.title}</Heading>
        {node.weightage_tier && <Badge tone={TIER_TONE[node.weightage_tier]}>{WEIGHTAGE_TIER_LABEL[node.weightage_tier]}</Badge>}
        <span className="text-body-sm text-fg-secondary">
          {plural(node.counts.topics, "topic", "topics")}
          {range ? ` · ${range}` : ""}
        </span>
      </summary>
      <div className="flex flex-col gap-3 border-t border-line p-3">
        {node.description && <p className="px-1 text-body-sm text-fg-secondary">{node.description}</p>}
        {units.length > 0 && (
          <ul className="flex flex-col gap-2">
            {units.map((u) => (
              <Unit key={u.id} node={u} />
            ))}
          </ul>
        )}
        {groups.map((g) => (
          <Group key={g.id} node={g} byParent={byParent} level={level + 1} />
        ))}
      </div>
    </details>
  );
}

/**
 * GAP2-4b: the exam hub's syllabus section, rendered from the canonical read model only.
 * NO_SYLLABUS → "Syllabus coming soon" (no fake topics or counts); UNAVAILABLE → honest notice; AVAILABLE → the
 * published PAPER / SECTION / UNIT tree with weightage, expected range (only when known) and live topic counts.
 */
export function ExamSyllabusSection({ syllabus, examTitle }: { syllabus: SyllabusReadModel; examTitle: string }) {
  if (syllabus.state === "NO_SYLLABUS") {
    return (
      <EmptyState
        icon={<BookOpen />}
        title="Syllabus coming soon"
        description={`We are preparing the topic-wise syllabus for ${examTitle}. The exam pattern and official notice are available meanwhile.`}
      />
    );
  }
  if (syllabus.state === "UNAVAILABLE") {
    return (
      <Alert tone="warning" title="The syllabus could not be loaded right now.">
        Please refresh the page in a moment.
      </Alert>
    );
  }
  const byParent = new Map<string | null, SyllabusReadModelNode[]>();
  for (const n of syllabus.nodes) byParent.set(n.parent_id, [...(byParent.get(n.parent_id) ?? []), n]);
  const roots = byParent.get(null) ?? [];
  const rootUnits = roots.filter((r) => r.kind === "UNIT");
  const rootGroups = roots.filter((r) => r.kind !== "UNIT");
  return (
    <div className="flex flex-col gap-3">
      <p className="text-body-sm text-fg-secondary">
        {plural(syllabus.totals.topics, "topic", "topics")} · {plural(syllabus.totals.published_questions, "practice question", "practice questions")} ·{" "}
        {plural(syllabus.totals.servable_documents, "lesson", "lessons")} · Updated {formatDateShort(syllabus.version.published_at)}
      </p>
      {rootGroups.map((g) => (
        <Group key={g.id} node={g} byParent={byParent} level={1} />
      ))}
      {rootUnits.length > 0 && (
        <ul className="flex flex-col gap-2">
          {rootUnits.map((u) => (
            <Unit key={u.id} node={u} />
          ))}
        </ul>
      )}
    </div>
  );
}
