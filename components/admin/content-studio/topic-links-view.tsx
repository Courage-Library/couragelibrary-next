"use client";

/**
 * F6 admin: topics ↔ study notes. Plain English; every control ≥ 48 px; results announced politely. Uses the audited
 * server actions only (createLearningUnitAction, relinkLearningUnitTopicAction).
 */
import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/layout";
import { createLearningUnitAction, relinkLearningUnitTopicAction } from "@/app/admin/content/actions";

type Unit = { id: string; title: string; slug: string; isActive: boolean; documents: number; published: number };
type Topic = { id: string; name: string; sectionName: string | null; units: Unit[] };

const field = "focus-ring min-h-12 rounded-control border border-line-control bg-surface px-3 text-body text-fg";

function message(r: unknown): string {
  if (r && typeof r === "object" && (r as { success?: unknown }).success === true) return "Saved.";
  const e = r && typeof r === "object" ? (r as { error?: unknown }).error : null;
  return typeof e === "string" && e ? e : "Could not save. Please try again.";
}

export function TopicLinksView({ topics }: { topics: Topic[] }) {
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? topics.filter((t) => t.name.toLowerCase().includes(q) || (t.sectionName ?? "").toLowerCase().includes(q)) : topics;
  }, [topics, query]);

  return (
    <Container className="flex max-w-5xl flex-col gap-6 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-h1 font-bold text-fg">Topics and study notes</h1>
        <p className="text-body text-fg-secondary">
          Each study unit belongs to one topic; its published articles are what students see under &quot;Learn more&quot;. Move a unit to fix a wrong link — nothing is copied.
        </p>
      </header>
      <div className="flex flex-col gap-1">
        <label htmlFor="topic-search" className="text-body-sm font-medium text-fg">
          Find a topic
        </label>
        <input id="topic-search" className={field} value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <ul className="flex flex-col gap-4" data-topic-links="">
        {shown.map((t) => (
          <li key={t.id} className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4">
            <div>
              <h2 className="text-h3 font-semibold text-fg">{t.name}</h2>
              {t.sectionName && <p className="text-body-sm text-fg-secondary">{t.sectionName}</p>}
            </div>
            {t.units.length === 0 ? (
              <p className="text-body-sm text-fg-secondary">No study unit yet.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {t.units.map((u) => (
                  <UnitRow key={u.id} unit={u} topics={topics} currentTopicId={t.id} />
                ))}
              </ul>
            )}
            <AddUnit topicId={t.id} />
          </li>
        ))}
      </ul>
    </Container>
  );
}

function UnitRow({ unit, topics, currentTopicId }: { unit: Unit; topics: Topic[]; currentTopicId: string }) {
  const [target, setTarget] = useState(currentTopicId);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const id = `move-${unit.id}`;
  return (
    <li className="flex flex-col gap-2 rounded-control border border-line p-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-body font-medium text-fg">{unit.title}</p>
        <p className="text-body-sm text-fg-secondary">
          {unit.slug} · {unit.published} of {unit.documents} articles published{unit.isActive ? "" : " · inactive"}
        </p>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={id} className="text-body-sm font-medium text-fg">
          Move to topic
        </label>
        <div className="flex gap-2">
          <select id={id} className={field} value={target} onChange={(e) => setTarget(e.target.value)}>
            {topics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.sectionName ? `${t.sectionName} — ${t.name}` : t.name}
              </option>
            ))}
          </select>
          <Button variant="secondary" className="min-h-12" disabled={pending || target === currentTopicId} onClick={() => start(async () => setNote(message(await relinkLearningUnitTopicAction(unit.id, target))))}>
            Move
          </Button>
        </div>
        <span role="status" className="text-body-sm text-fg-secondary">
          {note}
        </span>
      </div>
    </li>
  );
}

function AddUnit({ topicId }: { topicId: string }) {
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-col gap-2 border-t border-line pt-3 sm:flex-row sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => setNote(message(await createLearningUnitAction({ topicId, title, slug, unitType: "CONCEPT_LESSON" }))));
      }}
    >
      <div className="flex flex-1 flex-col gap-1">
        <label htmlFor={`title-${topicId}`} className="text-body-sm font-medium text-fg">
          New study unit title
        </label>
        <input id={`title-${topicId}`} className={field} value={title} onChange={(e) => setTitle(e.target.value)} required />
      </div>
      <div className="flex flex-1 flex-col gap-1">
        <label htmlFor={`slug-${topicId}`} className="text-body-sm font-medium text-fg">
          Slug (lowercase, hyphens)
        </label>
        <input id={`slug-${topicId}`} className={field} value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} pattern="[a-z0-9]+(-[a-z0-9]+)*" required />
      </div>
      <Button type="submit" variant="secondary" className="min-h-12" disabled={pending}>
        Add study unit
      </Button>
      <span role="status" className="text-body-sm text-fg-secondary">
        {note}
      </span>
    </form>
  );
}
