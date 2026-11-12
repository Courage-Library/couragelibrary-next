import { BookOpen, CheckCircle2, ClipboardList, Clock, FileText } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { SyllabusBrowser, type BrowseSubject, type BrowseTopic } from "@/components/syllabus/syllabus-browser";
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

function TierBadge({ node }: { node: SyllabusReadModelNode }) {
  return node.weightage_tier ? <Badge tone={TIER_TONE[node.weightage_tier]}>{WEIGHTAGE_TIER_LABEL[node.weightage_tier]}</Badge> : null;
}

/** a topic row's header (inside its toggle): name, weightage, subtopic count, expected range, lesson status */
function UnitSummary({ node }: { node: SyllabusReadModelNode }) {
  const range = expectedRange(node);
  const lessons = node.counts.servable_documents > 0;
  return (
    <span className="flex flex-col gap-1">
      <span className="flex flex-wrap items-center gap-2">
        <span className="text-body font-semibold text-fg">{node.title}</span>
        <TierBadge node={node} />
        {!node.is_mandatory && <Badge tone="neutral">Optional</Badge>}
      </span>
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-body-sm text-fg-secondary">
        {node.topics.length > 0 && <span>{plural(node.topics.length, "subtopic", "subtopics")}</span>}
        {range && <span>{range}</span>}
        {lessons ? (
          <span className="inline-flex items-center gap-1 font-medium text-success-700" data-lesson-status="available">
            <CheckCircle2 aria-hidden="true" className="size-4" />
            Lessons available
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 font-medium" data-lesson-status="coming-soon">
            <Clock aria-hidden="true" className="size-4" />
            Coming soon
          </span>
        )}
      </span>
    </span>
  );
}

/** the topic's body: its description and subtopics with practice + lesson counts */
function UnitBody({ node }: { node: SyllabusReadModelNode }) {
  return (
    <div className="flex flex-col gap-2">
      {node.description && <p className="text-body-sm text-fg-secondary">{node.description}</p>}
      {node.topics.length > 0 && (
        <ul className="flex flex-col divide-y divide-line" aria-label={`Subtopics in ${node.title}`}>
          {node.topics.map((t) => (
            <li key={t.topic_id} className="flex flex-col gap-1 py-2 text-body-sm sm:flex-row sm:flex-wrap sm:items-baseline sm:justify-between sm:gap-x-3">
              <span className="font-medium text-fg">{t.name}</span>
              <span className="flex flex-wrap gap-x-3 gap-y-1 text-fg-secondary">
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
    </div>
  );
}

/** a subject's intro: only what its tab and the topic count do not already say (parent sections, weightage, expected
 * questions, description); nothing when none of it is known */
function GroupIntro({ node, trail }: { node: SyllabusReadModelNode; trail: string[] }) {
  const range = expectedRange(node);
  if (!trail.length && !node.weightage_tier && !range && !node.description) return null;
  return (
    <div className="flex flex-col gap-1 px-1">
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-body-sm text-fg-secondary">
        {trail.length > 0 && <span className="font-semibold text-fg">{[...trail, node.title].join(" › ")}</span>}
        <TierBadge node={node} />
        {range && <span>{range} in {node.title}</span>}
      </p>
      {node.description && <p className="text-body-sm text-fg-secondary">{node.description}</p>}
    </div>
  );
}

/**
 * GAP2-4b: the exam hub's syllabus section, rendered from the canonical read model only.
 * NO_SYLLABUS → "Syllabus coming soon" (no fake topics or counts); UNAVAILABLE → honest notice; AVAILABLE → the
 * published tree with weightage, expected range (only when known) and live topic counts.
 * SYLLABUS-UI-1: browsed through the shared SyllabusBrowser — one tab per subject (a PAPER / SECTION holding units; a
 * paper's name is prefixed when there are several papers), each unit a collapsible topic row (subtopics inside, lesson
 * status "Lessons available" / "Coming soon"), search, rail / jump sheet. keepMounted: the whole tree stays in the server
 * HTML (crawlable; the hub smoke reads every PAPER and SECTION title from it).
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
  const sorted = [...syllabus.nodes].sort((a, b) => a.order - b.order);
  const byId = new Map(sorted.map((n) => [n.id, n]));
  const byParent = new Map<string | null, SyllabusReadModelNode[]>();
  for (const n of sorted) byParent.set(n.parent_id, [...(byParent.get(n.parent_id) ?? []), n]);
  const papers = sorted.filter((n) => n.kind === "PAPER");
  const paperOf = (n: SyllabusReadModelNode): SyllabusReadModelNode | null => {
    let cur: SyllabusReadModelNode | undefined = n;
    for (let hop = 0; cur && hop < 8; hop++) {
      if (cur.kind === "PAPER") return cur;
      cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
    }
    return null;
  };

  // subjects: every group that directly holds units, in tree order; units at the root form one "Other topics" subject
  const subjects: BrowseSubject[] = [];
  const topics: BrowseTopic[] = [];
  /** the group titles between the paper and this group (a section inside a section) */
  const trailOf = (g: SyllabusReadModelNode): string[] => {
    const out: string[] = [];
    let cur = g.parent_id ? byId.get(g.parent_id) : undefined;
    for (let hop = 0; cur && cur.kind !== "PAPER" && hop < 8; hop++) {
      out.unshift(cur.title);
      cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
    }
    return out;
  };
  const walk = (parent: string | null) => {
    const kids = byParent.get(parent) ?? [];
    const units = kids.filter((k) => k.kind === "UNIT");
    const self = parent ? byId.get(parent) : undefined;
    // an empty section still gets its tab (its title stays on the page)
    const emptySection = Boolean(self && self.kind !== "PAPER" && kids.length === 0);
    if (units.length || emptySection) {
      const group = parent ? byId.get(parent) : undefined;
      const paper = group ? paperOf(group) : null;
      const sid = group?.id ?? "root";
      const label = !group ? "Other topics" : papers.length > 1 && paper && paper.id !== group.id ? `${paper.title} · ${group.title}` : group.title;
      subjects.push({ id: sid, label, intro: group ? <GroupIntro node={group} trail={trailOf(group)} /> : undefined });
      for (const u of units) {
        const hasBody = u.topics.length > 0 || Boolean(u.description);
        topics.push({
          id: u.id,
          subjectId: sid,
          name: u.title,
          terms: u.topics.map((t) => t.name),
          summary: <UnitSummary node={u} />,
          body: hasBody ? <UnitBody node={u} /> : undefined,
        });
      }
    }
    for (const g of kids.filter((k) => k.kind !== "UNIT")) walk(g.id);
  };
  walk(null);

  return (
    <div className="flex flex-col gap-3" data-exam-syllabus="">
      <p className="text-body-sm text-fg-secondary">
        {plural(syllabus.totals.topics, "topic", "topics")} · {plural(syllabus.totals.published_questions, "practice question", "practice questions")} ·{" "}
        {plural(syllabus.totals.servable_documents, "lesson", "lessons")} · Updated {formatDateShort(syllabus.version.published_at)}
      </p>
      {papers.length > 0 && (
        <ul className="flex flex-col gap-1" aria-label="Papers">
          {papers.map((p) => {
            const range = expectedRange(p);
            return (
              <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-body-sm text-fg-secondary">
                <span className="text-body font-semibold text-fg">{p.title}</span>
                <TierBadge node={p} />
                {range && <span>{range}</span>}
                {p.description && <span>{p.description}</span>}
              </li>
            );
          })}
        </ul>
      )}
      {subjects.length > 0 ? (
        <SyllabusBrowser storageKey={`exam-syllabus:${syllabus.version.id}`} label="Syllabus" subjects={subjects} topics={topics} keepMounted />
      ) : (
        <p className="text-body-sm text-fg-secondary">The topics of this syllabus are being added.</p>
      )}
    </div>
  );
}
