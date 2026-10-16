"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileCheck2, FileUp } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/input";
import { importSyllabusDraftAction, previewSyllabusImportAction, type SyllabusImportPreview } from "@/app/admin/syllabus/actions";
import { IMPORT_MAX_BYTES, type ImportError } from "@/lib/syllabus/import-contract";
import type { SyllabusVersionRow } from "@/types/syllabus";

const TIER_LABEL = { HIGH_YIELD: "High yield", CORE: "Core", MODERATE: "Moderate", LOW: "Low", OPTIONAL: "Optional" } as const;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function range(min: number | null, max: number | null) {
  if (min === null && max === null) return null;
  if (min === max) return `${min} questions`;
  return `${min ?? "?"}–${max ?? "?"} questions`;
}

/**
 * SYL-IMPORT-1: "Import draft" — paste or upload a contract_version 1 JSON file (docs/syllabus/IMPORT_CONTRACT.md),
 * validate it on the server (preview: tree, counts, mapped / missing topics, errors) and create ONE DRAFT. Nothing
 * is written until "Create draft"; it stays disabled while there are errors, missing topics or an existing draft.
 */
export function SyllabusImportDraft({
  exam,
  cycles,
  versions,
}: {
  exam: { id: string; slug: string; title: string };
  cycles: Array<{ id: string; cycle_year: number }>;
  versions: SyllabusVersionRow[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [text, setText] = useState("");
  const [previewedText, setPreviewedText] = useState<string | null>(null);
  const [preview, setPreview] = useState<SyllabusImportPreview | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [serverErrors, setServerErrors] = useState<ImportError[]>([]);

  const cycleId = (year: number | null) => (year === null ? null : cycles.find((c) => c.cycle_year === year)?.id ?? null);
  const payload = preview?.payload ?? null;
  const draftExists =
    payload !== null && versions.some((v) => v.status === "DRAFT" && (v.exam_cycle_id ?? null) === cycleId(payload.cycle_year));
  const stale = previewedText !== text;
  const canCreate = Boolean(preview?.valid) && !draftExists && !stale && !pending;

  const onFile = async (file: File | undefined) => {
    setMessage(null);
    if (!file) return;
    if (file.size > IMPORT_MAX_BYTES) {
      setMessage(`The file is larger than 256 KB (${file.size} bytes).`);
      return;
    }
    setText(await file.text());
    setPreview(null);
  };

  const validate = () =>
    start(async () => {
      setMessage(null);
      setServerErrors([]);
      const r = await previewSyllabusImportAction(exam.id, text, { examSlug: exam.slug, cycleYears: cycles.map((c) => c.cycle_year) });
      if (!r.ok) {
        setMessage(r.message);
        return;
      }
      setPreview(r.preview);
      setPreviewedText(text);
    });

  const create = () =>
    start(async () => {
      setMessage(null);
      setServerErrors([]);
      const r = await importSyllabusDraftAction(exam.id, text);
      if (!r.ok) {
        setMessage(r.message);
        if ("errors" in r && Array.isArray(r.errors)) setServerErrors(r.errors);
        return;
      }
      setTimeout(() => router.push(`/admin/syllabus/${r.versionId}`), 0);
    });

  const errors = [...(preview?.errors ?? []), ...serverErrors];

  return (
    <section aria-labelledby="import-title" className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4">
      <div className="flex flex-col gap-1">
        <h3 id="import-title" className="text-h3 font-semibold">
          Import draft from JSON
        </h3>
        <p className="max-w-prose text-body-sm text-fg-secondary">
          Paste or upload a syllabus file (contract version 1). It is checked first; nothing is saved until you create the draft.
          Topics must already exist in the taxonomy — the import never creates or guesses topics, and it never publishes.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="import-file" className="text-body-sm font-medium text-fg">
          Upload a .json file
        </label>
        <input
          id="import-file"
          type="file"
          accept=".json,application/json"
          onChange={(e) => void onFile(e.target.files?.[0])}
          className="focus-ring rounded-control text-body-sm text-fg-secondary file:mr-3 file:h-9 file:rounded-control file:border file:border-line-control file:bg-surface file:px-3 file:font-medium file:text-fg"
        />
      </div>
      <Field id="import-json" label="Or paste the JSON" help="Maximum 256 KB and 500 nodes.">
        <Textarea
          rows={8}
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          className="font-mono text-body-sm"
          placeholder='{ "contract_version": 1, "exam": "…", "papers": [ … ] }'
        />
      </Field>

      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" onClick={validate} loading={pending} disabled={!text.trim()} leadingIcon={<FileCheck2 aria-hidden="true" className="size-4" />}>
          Validate
        </Button>
        <Button onClick={create} disabled={!canCreate} leadingIcon={<FileUp aria-hidden="true" className="size-4" />}>
          Create draft
        </Button>
      </div>

      {message && (
        <Alert tone="danger" live>
          {message}
        </Alert>
      )}
      {preview && stale && <Alert tone="warning">The text changed after validation. Validate again before creating the draft.</Alert>}
      {draftExists && (
        <Alert tone="warning" title="A draft already exists for this cycle.">
          Publish, archive or delete the existing draft of {exam.title} for this cycle before importing a new one.
        </Alert>
      )}

      {preview && (
        <div className="flex flex-col gap-4" aria-live="polite">
          <div className="flex flex-wrap gap-2">
            <Badge tone={preview.valid ? "success" : "danger"}>{preview.valid ? "Valid" : plural(errors.length, "error")}</Badge>
            {preview.stats && (
              <>
                <Badge>{plural(preview.stats.papers, "paper")}</Badge>
                <Badge>{plural(preview.stats.sections, "section")}</Badge>
                <Badge>{plural(preview.stats.units, "unit")}</Badge>
                <Badge>{plural(preview.stats.mappings, "topic mapping")}</Badge>
                <Badge tone={preview.missingTopics.length ? "danger" : "neutral"}>{plural(preview.missingTopics.length, "missing topic")}</Badge>
              </>
            )}
          </div>

          {errors.length > 0 && (
            <div className="flex flex-col gap-2">
              <h4 className="text-body font-semibold">Errors</h4>
              <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto rounded-control border border-line p-3 text-body-sm">
                {errors.map((e, i) => (
                  <li key={`${e.path}-${e.code}-${i}`}>
                    <span className="font-medium text-danger-700">{e.code}</span> <code className="text-fg-secondary">{e.path}</code> — {e.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {preview.missingTopics.length > 0 && (
            <div className="flex flex-col gap-2">
              <h4 className="text-body font-semibold">Missing topics</h4>
              <p className="text-body-sm text-fg-secondary">
                Create these topics in Taxonomy first (or correct the file). Similar existing topics are shown as hints only; they are never applied.
              </p>
              <ul className="flex flex-col gap-1 text-body-sm">
                {preview.missingTopics.map((m) => (
                  <li key={m.path}>
                    <code className="font-medium text-fg">{m.path}</code>
                    {m.hints.length > 0 && <span className="text-fg-secondary"> — similar: {m.hints.join(", ")}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {payload && (
            <div className="flex flex-col gap-2">
              <h4 className="text-body font-semibold">Preview</h4>
              <p className="text-body-sm text-fg-secondary">
                {payload.exam} · {payload.cycle_year === null ? "All cycles (exam-wide)" : `${payload.cycle_year} cycle`}
                {payload.version_tag ? ` · ${payload.version_tag}` : ""}
              </p>
              <ol className="flex flex-col gap-3 text-body-sm">
                {payload.papers.map((p) => (
                  <li key={p.code} className="rounded-control border border-line p-3">
                    <p className="font-semibold text-fg">
                      Paper: {p.title} {range(p.expected_questions_min, p.expected_questions_max) && <span className="font-normal text-fg-secondary">· {range(p.expected_questions_min, p.expected_questions_max)}</span>}
                    </p>
                    <ol className="mt-2 flex flex-col gap-2 border-l border-line pl-3">
                      {p.sections.map((s) => (
                        <li key={s.code}>
                          <p className="font-medium text-fg">
                            Section: {s.title}{" "}
                            {range(s.expected_questions_min, s.expected_questions_max) && <span className="font-normal text-fg-secondary">· {range(s.expected_questions_min, s.expected_questions_max)}</span>}
                          </p>
                          <ol className="mt-1 flex flex-col gap-1 border-l border-line pl-3">
                            {s.units.map((u) => (
                              <li key={u.code} className="text-fg">
                                {u.title}
                                {u.weightage_tier && <span className="text-fg-secondary"> · {TIER_LABEL[u.weightage_tier]}</span>}
                                <span className="text-fg-secondary">
                                  {" "}
                                  →{" "}
                                  {u.topics.length === 0
                                    ? "no topics"
                                    : u.topics.map((t) => preview.resolvedTopics[t.topic] ?? `${t.topic} (missing)`).join(", ")}
                                </span>
                              </li>
                            ))}
                          </ol>
                        </li>
                      ))}
                    </ol>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
