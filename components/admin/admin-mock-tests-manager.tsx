"use client";

import { actionErrorMessage } from "@/lib/actions/action-result";
import React, { useState, useMemo, useActionState, useTransition, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createMockTestAction, updateMockTestAction, toggleMockTestPublishAction } from "@/app/admin/actions";
import { AdminCategoryItem, AdminPatternItem } from "@/services/admin.service";
import { BulkImportModal } from "@/components/admin/bulk-import-modal";
import { StudioDrawer } from "@/components/admin/studio/studio-drawer";
import { StudioEmpty, StudioField, StudioPageHeader, StudioPanel, StudioStatStrip, studioControl, studioPrimaryAction, studioQuietAction } from "@/components/admin/studio/studio-page";
import { StatusChip } from "@/components/admin/status-chip";
import { Edit2, Power, Plus } from "lucide-react";

export interface MockTestItem {
  id: string;
  title: string;
  slug: string;
  durationMinutes: number;
  totalQuestions: number;
  totalMarks: number;
  isPublished: boolean;
  status: string;
  createdAt: string;
  categoryId: string;
  categoryName: string;
  categorySlug: string;
  patternId: string;
  patternName: string;
  sectionsCount: number;
}

interface Props {
  tests: MockTestItem[];
  categories: AdminCategoryItem[];
  patterns: AdminPatternItem[];
  currentCategory?: string;
  currentPattern?: string;
}

type PublishFilter = "ALL" | "PUBLISHED" | "DRAFT";

/**
 * Courage Studio phase 3 batch 2 — Mock tests on the Studio template: ONE primary ("New mock test") opening the form in
 * the Studio drawer, edit in the same drawer, "Bulk import" as a quiet action, a stat strip that filters by publish state
 * (aria-pressed), labelled filters (search, category, pattern — the pattern filter had no control before), rows with
 * named icon actions and v3 status chips, honest empty states. A failed publish toggle is shown (it used to be silent).
 */
export function AdminMockTestsManager({ tests, categories, patterns, currentCategory, currentPattern }: Props) {
  const router = useRouter();
  const [showBulkImport, setShowBulkImport] = useState(false);
  const activeCategoryObj = useMemo(() => (!currentCategory || currentCategory === "ALL" ? null : categories.find((c) => c.slug === currentCategory || c.id === currentCategory) ?? null), [categories, currentCategory]);

  const [createState, createAction, isCreating] = useActionState(createMockTestAction, null);
  const [editState, editAction, isEditing] = useActionState(updateMockTestAction, null);
  const [addOpen, setAddOpen] = useState(false);
  const [editingMock, setEditingMock] = useState<MockTestItem | null>(null);
  const [formCategoryId, setFormCategoryId] = useState(activeCategoryObj ? activeCategoryObj.id : categories[0]?.id || "");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState(currentCategory || "ALL");
  const [selectedPattern, setSelectedPattern] = useState(currentPattern || "ALL");
  const [publish, setPublish] = useState<PublishFilter>("ALL");
  const [actionFeedback, setActionFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isToggling, startTransition] = useTransition();

  useEffect(() => {
    if (createState?.message && !createState?.error) setAddOpen(false);
  }, [createState]);
  useEffect(() => {
    if (editState?.message && !editState?.error) setEditingMock(null);
  }, [editState]);

  const availablePatternsForForm = useMemo(() => (formCategoryId ? patterns.filter((p) => !p.categoryId || p.categoryId === formCategoryId) : patterns), [formCategoryId, patterns]);

  const scoped = useMemo(
    () =>
      tests.filter((t) => {
        if (selectedCategory !== "ALL" && !(t.categoryId === selectedCategory || t.categorySlug.toLowerCase() === selectedCategory.toLowerCase())) return false;
        if (selectedPattern !== "ALL" && !(t.patternId === selectedPattern || t.patternName.toLowerCase() === selectedPattern.toLowerCase())) return false;
        return true;
      }),
    [tests, selectedCategory, selectedPattern]
  );
  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return scoped.filter((t) => {
      if (publish === "PUBLISHED" && !t.isPublished) return false;
      if (publish === "DRAFT" && t.isPublished) return false;
      if (!q) return true;
      return t.title.toLowerCase().includes(q) || t.categoryName.toLowerCase().includes(q) || t.patternName.toLowerCase().includes(q);
    });
  }, [scoped, publish, searchQuery]);

  const handleCategoryChange = (cat: string) => {
    setSelectedCategory(cat);
    setSelectedPattern("ALL");
    router.push(cat === "ALL" ? "/admin/mock-tests" : `/admin/mock-tests?category=${cat}`);
  };
  const togglePublish = (mock: MockTestItem) => {
    if (!confirm(`${mock.isPublished ? "Unpublish" : "Publish"} "${mock.title}"?`)) return;
    startTransition(async () => {
      const res = await toggleMockTestPublishAction(mock.id, mock.isPublished);
      if (res?.error) setActionFeedback({ type: "error", text: actionErrorMessage(res) });
      else setActionFeedback({ type: "success", text: res?.message || `"${mock.title}" ${mock.isPublished ? "unpublished" : "published"}.` });
    });
  };

  const counts = { ALL: scoped.length, PUBLISHED: scoped.filter((t) => t.isPublished).length, DRAFT: scoped.filter((t) => !t.isPublished).length };
  const feedback = (kind: "success" | "error", text: string) => (
    <p role={kind === "error" ? "alert" : "status"} className={`rounded-card border px-4 py-3 text-[13px] ${kind === "success" ? "border-success-200 bg-success-50 text-success-800" : "border-danger-200 bg-danger-50 text-danger-800"}`}>
      {text}
    </p>
  );

  return (
    <div className="space-y-4 pb-8">
      <StudioPageHeader
        title="Mock tests"
        description="Full-length papers built on a pattern. Publish a paper to make it available to students."
        primary={
          <button type="button" className={studioPrimaryAction} onClick={() => setAddOpen(true)}>
            <Plus aria-hidden="true" className="size-4" /> New mock test
          </button>
        }
        actions={
          <>
            <button type="button" className={studioQuietAction} onClick={() => setShowBulkImport(true)}>
              Bulk import
            </button>
            <Link href="/admin/patterns" className={studioQuietAction}>
              Patterns
            </Link>
          </>
        }
      />

      {showBulkImport && <BulkImportModal defaultEntity="mock_tests" onClose={() => setShowBulkImport(false)} />}
      {createState?.message && !createState?.error && feedback("success", createState.message)}
      {editState?.message && !editState?.error && feedback("success", editState.message)}
      {actionFeedback && feedback(actionFeedback.type, actionFeedback.text)}

      <StudioStatStrip
        label="Mock tests by publish state"
        onSelect={(k) => setPublish(k as PublishFilter)}
        stats={[
          { key: "ALL", label: "All", value: counts.ALL, tone: "blue", active: publish === "ALL" },
          { key: "PUBLISHED", label: "Published", value: counts.PUBLISHED, tone: "green", active: publish === "PUBLISHED" },
          { key: "DRAFT", label: "Draft", value: counts.DRAFT, tone: "muted", active: publish === "DRAFT" },
        ]}
      />

      <StudioPanel>
        <div className="grid gap-3 md:grid-cols-3">
          <StudioField label="Search" htmlFor="mt-search">
            <input id="mt-search" type="search" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Title, exam or pattern" className={studioControl} />
          </StudioField>
          <StudioField label="Exam category" htmlFor="mt-category">
            <select id="mt-category" value={selectedCategory} onChange={(e) => handleCategoryChange(e.target.value)} className={studioControl}>
              <option value="ALL">All categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.slug}>
                  {c.title}
                </option>
              ))}
            </select>
          </StudioField>
          <StudioField label="Pattern" htmlFor="mt-pattern">
            <select id="mt-pattern" value={selectedPattern} onChange={(e) => setSelectedPattern(e.target.value)} className={studioControl}>
              <option value="ALL">All patterns</option>
              {patterns.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.categoryName ? ` (${p.categoryName})` : ""}
                </option>
              ))}
            </select>
          </StudioField>
        </div>
        <p className="mt-3 text-[13px] text-fg-secondary" aria-live="polite">
          Showing {filtered.length} of {tests.length} mock test{tests.length === 1 ? "" : "s"}.
        </p>
      </StudioPanel>

      {filtered.length === 0 ? (
        tests.length === 0 ? (
          <StudioEmpty title="No mock tests yet" body="Create the first paper on a pattern, or import several at once." />
        ) : (
          <StudioEmpty title="No mock tests match" body="Change the search, the filters or the publish state." />
        )
      ) : (
        <ul className="space-y-3" aria-label="Mock tests">
          {filtered.map((mock) => (
            <li key={mock.id}>
              <StudioPanel>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[12px] font-semibold text-fg-secondary">
                      {mock.categoryName} · {mock.patternName}
                    </p>
                    <h2 className="text-[16px] font-bold text-fg">{mock.title}</h2>
                    <p className="text-[12px] text-fg-secondary">
                      <span className="font-mono">{mock.slug}</span>
                    </p>
                    <p className="mt-2 text-[13px] text-fg">
                      {mock.durationMinutes} min · {mock.totalQuestions} questions · {mock.totalMarks} marks
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <StatusChip status={mock.isPublished ? "PUBLISHED" : "DRAFT"} />
                    <button type="button" onClick={() => setEditingMock(mock)} aria-label={`Edit ${mock.title}`} className="focus-ring inline-flex size-10 items-center justify-center rounded-control text-fg-secondary hover:bg-ink-100">
                      <Edit2 aria-hidden="true" className="size-4" />
                    </button>
                    <button type="button" onClick={() => togglePublish(mock)} disabled={isToggling} aria-label={`${mock.isPublished ? "Unpublish" : "Publish"} ${mock.title}`} className="focus-ring inline-flex size-10 items-center justify-center rounded-control text-fg-secondary hover:bg-ink-100">
                      <Power aria-hidden="true" className="size-4" />
                    </button>
                  </div>
                </div>
                <nav aria-label={`${mock.title}: related`} className="mt-3 flex flex-wrap gap-1 border-t border-line pt-2">
                  <Link href={`/admin/questions?category=${mock.categorySlug}&pattern=${mock.patternId}`} className={studioQuietAction}>
                    Questions
                  </Link>
                  <Link href={`/admin/sections?pattern=${mock.patternId}&category=${mock.categorySlug}`} className={studioQuietAction}>
                    Sections
                  </Link>
                  <Link href={`/mock-tests/${mock.id}/take`} target="_blank" className={studioQuietAction}>
                    Preview the test player <span className="sr-only">(opens in a new tab)</span>
                  </Link>
                </nav>
              </StudioPanel>
            </li>
          ))}
        </ul>
      )}

      <StudioDrawer open={addOpen} onClose={() => setAddOpen(false)} title="New mock test" subtitle="A new paper starts as a draft.">
        {createState?.error && <div className="mb-3">{feedback("error", actionErrorMessage(createState))}</div>}
        <form action={createAction} className="space-y-4">
          <StudioField label="Exam category" htmlFor="mt-new-category">
            <select id="mt-new-category" name="categoryId" value={formCategoryId} onChange={(e) => setFormCategoryId(e.target.value)} className={studioControl} required>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </StudioField>
          <StudioField label="Pattern" htmlFor="mt-new-pattern">
            <select id="mt-new-pattern" name="patternId" defaultValue={availablePatternsForForm[0]?.id || ""} className={studioControl}>
              <option value="">Default pattern</option>
              {availablePatternsForForm.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.categoryName ? ` (${p.categoryName})` : ""}
                </option>
              ))}
            </select>
          </StudioField>
          <StudioField label="Title" htmlFor="mt-new-title">
            <input id="mt-new-title" name="title" type="text" placeholder="e.g. SSC GD 2026 Full Length Mock Test 01" className={studioControl} required />
          </StudioField>
          <StudioField label="URL slug (optional, generated when blank)" htmlFor="mt-new-slug">
            <input id="mt-new-slug" name="slug" type="text" placeholder="e.g. ssc-gd-2026-full-mock-01" className={`${studioControl} font-mono`} />
          </StudioField>
          <div className="grid grid-cols-3 gap-3">
            <StudioField label="Duration (minutes)" htmlFor="mt-new-duration">
              <input id="mt-new-duration" name="durationMinutes" type="number" defaultValue={60} className={studioControl} />
            </StudioField>
            <StudioField label="Questions" htmlFor="mt-new-questions">
              <input id="mt-new-questions" name="totalQuestions" type="number" defaultValue={80} className={studioControl} />
            </StudioField>
            <StudioField label="Total marks" htmlFor="mt-new-marks">
              <input id="mt-new-marks" name="totalMarks" type="number" defaultValue={160} className={studioControl} />
            </StudioField>
          </div>
          <div className="flex justify-end gap-2 border-t border-line pt-3">
            <button type="button" className={studioQuietAction} onClick={() => setAddOpen(false)}>
              Cancel
            </button>
            <button type="submit" className={`${studioQuietAction} border border-primary-700`} disabled={isCreating} aria-busy={isCreating}>
              {isCreating ? "Creating…" : "Create mock test"}
            </button>
          </div>
        </form>
      </StudioDrawer>

      <StudioDrawer open={!!editingMock} onClose={() => setEditingMock(null)} title={editingMock ? `Edit ${editingMock.title}` : "Edit mock test"}>
        {editState?.error && <div className="mb-3">{feedback("error", actionErrorMessage(editState))}</div>}
        {editingMock && (
          <form action={editAction} className="space-y-4">
            <input type="hidden" name="id" value={editingMock.id} />
            <StudioField label="Title" htmlFor="mt-edit-title">
              <input id="mt-edit-title" name="title" type="text" defaultValue={editingMock.title} className={studioControl} required />
            </StudioField>
            <StudioField label="URL slug" htmlFor="mt-edit-slug">
              <input id="mt-edit-slug" name="slug" type="text" defaultValue={editingMock.slug} className={`${studioControl} font-mono`} required />
            </StudioField>
            <div className="grid grid-cols-3 gap-3">
              <StudioField label="Duration (minutes)" htmlFor="mt-edit-duration">
                <input id="mt-edit-duration" name="durationMinutes" type="number" defaultValue={editingMock.durationMinutes} className={studioControl} />
              </StudioField>
              <StudioField label="Questions" htmlFor="mt-edit-questions">
                <input id="mt-edit-questions" name="totalQuestions" type="number" defaultValue={editingMock.totalQuestions} className={studioControl} />
              </StudioField>
              <StudioField label="Total marks" htmlFor="mt-edit-marks">
                <input id="mt-edit-marks" name="totalMarks" type="number" defaultValue={editingMock.totalMarks} className={studioControl} />
              </StudioField>
            </div>
            <div className="flex justify-end gap-2 border-t border-line pt-3">
              <button type="button" className={studioQuietAction} onClick={() => setEditingMock(null)}>
                Cancel
              </button>
              <button type="submit" className={`${studioQuietAction} border border-primary-700`} disabled={isEditing} aria-busy={isEditing}>
                {isEditing ? "Saving…" : "Save changes"}
              </button>
            </div>
          </form>
        )}
      </StudioDrawer>
    </div>
  );
}
