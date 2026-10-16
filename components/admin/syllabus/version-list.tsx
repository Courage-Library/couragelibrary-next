"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, FilePlus2, Copy } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { formatDateShort } from "@/lib/format";
import { archiveSyllabusVersionAction, createSyllabusDraftAction } from "@/app/admin/syllabus/actions";
import type { SyllabusVersionRow } from "@/types/syllabus";

const STATUS_TONE = { DRAFT: "warning", PUBLISHED: "success", ARCHIVED: "neutral" } as const;
const SOURCE_LABEL = { MANUAL: "Manual", EXAM_KNOWLEDGE_DRAFT: "Exam Knowledge draft", LEGACY_MIGRATION: "Legacy migration", IMPORT: "Import" } as const;

export function SyllabusVersionList({
  exam,
  cycles,
  versions,
  publishers,
  isAdmin,
  loadError,
}: {
  exam: { id: string; title: string };
  cycles: Array<{ id: string; cycle_year: number }>;
  versions: SyllabusVersionRow[];
  publishers: Record<string, { email: string; at: string }>;
  isAdmin: boolean;
  loadError: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [cycle, setCycle] = useState("");
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<SyllabusVersionRow | null>(null);
  const cycleYear = (id: string | null) => cycles.find((c) => c.id === id)?.cycle_year;
  const published = versions.find((v) => v.status === "PUBLISHED" && v.is_active && (v.exam_cycle_id ?? "") === cycle) ?? null;

  const createDraft = (fromPublished: boolean) =>
    start(async () => {
      setMessage(null);
      const r = await createSyllabusDraftAction(exam.id, cycle || null, fromPublished && published ? published.id : null);
      if (!r.ok) {
        setMessage({ tone: "danger", text: r.message });
        return;
      }
      // navigate outside the transition so a slow load never leaves the buttons pending
      setTimeout(() => router.push(`/admin/syllabus/${r.versionId}`), 0);
    });

  const archive = () =>
    start(async () => {
      if (!archiveTarget) return;
      const r = await archiveSyllabusVersionAction(archiveTarget.id);
      setArchiveTarget(null);
      if (!r.ok) {
        setMessage({ tone: "danger", text: r.message });
        return;
      }
      setMessage({ tone: "success", text: `Version ${archiveTarget.version_number} archived.` });
      setTimeout(() => router.refresh(), 0);
    });

  return (
    <section aria-labelledby="versions-title" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="versions-title" className="text-h2 font-semibold">
          {exam.title}
        </h2>
        <p className="text-body-sm text-fg-secondary">{versions.length} version{versions.length === 1 ? "" : "s"}</p>
      </div>

      {loadError && <Alert tone="danger" title="Versions could not be loaded.">Reload the page. Nothing was changed.</Alert>}
      {message && (
        <Alert tone={message.tone} live>
          {message.text}
        </Alert>
      )}

      <div className="flex flex-wrap items-end gap-3 rounded-card border border-line bg-surface p-4">
        <Field id="new-draft-cycle" label="Cycle for the new draft" className="min-w-56">
          <Select
            value={cycle}
            onChange={(e) => setCycle(e.target.value)}
            options={[{ value: "", label: "All cycles (exam-wide)" }, ...cycles.map((c) => ({ value: c.id, label: `${c.cycle_year} cycle` }))]}
          />
        </Field>
        <Button onClick={() => createDraft(false)} loading={pending} leadingIcon={<FilePlus2 aria-hidden="true" className="size-4" />}>
          New empty draft
        </Button>
        <Button
          variant="secondary"
          onClick={() => createDraft(true)}
          disabled={pending || !published}
          leadingIcon={<Copy aria-hidden="true" className="size-4" />}
        >
          New draft from published
        </Button>
        {!published && <p className="text-body-sm text-fg-secondary">No published version for this cycle yet, so only an empty draft is possible.</p>}
      </div>

      {versions.length === 0 ? (
        <p className="rounded-card border border-dashed border-ink-300 bg-surface p-6 text-body text-fg-secondary">
          No syllabus versions yet. Create a draft to start.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-card border border-line bg-surface">
          <table className="w-full min-w-[48rem] text-left text-body-sm">
            <caption className="sr-only">Syllabus versions of {exam.title}</caption>
            <thead className="bg-surface-sunken text-fg-secondary">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Version</th>
                <th scope="col" className="px-4 py-3 font-medium">Status</th>
                <th scope="col" className="px-4 py-3 font-medium">Source</th>
                <th scope="col" className="px-4 py-3 font-medium">Cycle</th>
                <th scope="col" className="px-4 py-3 font-medium">Published</th>
                <th scope="col" className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {versions.map((v) => {
                const pub = publishers[v.id];
                return (
                  <tr key={v.id}>
                    <th scope="row" className="px-4 py-3 font-medium text-fg">
                      v{v.version_number} <span className="font-normal text-fg-secondary">· {v.version_tag}</span>
                    </th>
                    <td className="px-4 py-3">
                      <Badge tone={STATUS_TONE[v.status]}>{v.status === "PUBLISHED" && v.is_active ? "Published (live)" : v.status.charAt(0) + v.status.slice(1).toLowerCase()}</Badge>
                    </td>
                    <td className="px-4 py-3 text-fg-secondary">{SOURCE_LABEL[v.source_kind] ?? v.source_kind}</td>
                    <td className="px-4 py-3 text-fg-secondary">{cycleYear(v.exam_cycle_id) ?? "All cycles"}</td>
                    <td className="px-4 py-3 text-fg-secondary">
                      {v.published_at ? (
                        <>
                          {formatDateShort(v.published_at)}
                          {pub ? <span className="block">by {pub.email}</span> : null}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <Link
                          href={`/admin/syllabus/${v.id}`}
                          className="focus-ring inline-flex h-9 items-center rounded-control border border-line-control px-3 font-medium text-fg hover:bg-ink-50"
                        >
                          {v.status === "DRAFT" ? "Open editor" : "View"}
                          <span className="sr-only"> version {v.version_number}</span>
                        </Link>
                        {isAdmin && v.status !== "ARCHIVED" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setArchiveTarget(v)}
                            aria-label={`Archive version ${v.version_number}`}
                            leadingIcon={<Archive aria-hidden="true" className="size-4" />}
                          >
                            Archive
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Dialog
        open={archiveTarget !== null}
        onOpenChange={(o) => !o && setArchiveTarget(null)}
        title={`Archive version ${archiveTarget?.version_number ?? ""}?`}
        description={
          archiveTarget?.status === "PUBLISHED"
            ? "Students stop seeing this syllabus until another version is published. Archived versions cannot be edited or restored."
            : "This draft becomes read-only. Archived versions cannot be edited or restored."
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setArchiveTarget(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={archive} loading={pending}>
              Archive
            </Button>
          </>
        }
      />
    </section>
  );
}
