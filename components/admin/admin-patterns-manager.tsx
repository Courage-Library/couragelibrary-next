"use client";

import { actionErrorMessage } from "@/lib/actions/action-result";
import React, { useState, useMemo, useActionState, useTransition, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AdminPatternItem, AdminCategoryItem } from "@/services/admin.service";
import { createPatternAction, updatePatternAction, togglePatternStatusAction, deletePatternAction } from "@/app/admin/actions";
import { StudioDrawer } from "@/components/admin/studio/studio-drawer";
import { StudioEmpty, StudioField, StudioPageHeader, StudioPanel, StudioStatStrip, studioControl, studioPrimaryAction, studioQuietAction } from "@/components/admin/studio/studio-page";
import { StatusChip } from "@/components/admin/status-chip";
import { Edit2, Power, Trash2, ChevronLeft, ChevronRight, Plus } from "lucide-react";

interface Props {
  patterns: AdminPatternItem[];
  categories: AdminCategoryItem[];
  currentCategory?: string;
}

const PAGE_SIZE = 8;
type StatusFilter = "ALL" | "ACTIVE" | "INACTIVE";

/**
 * Courage Studio phase 3 batch 2 — Patterns on the Studio template: ONE primary ("New pattern") opening the create form
 * in the Studio drawer, edit in the same drawer, a stat strip that filters (aria-pressed), labelled filters, rows with
 * named icon actions and v3 status chips, honest empty states, labelled pagination.
 */
export function AdminPatternsManager({ patterns, categories, currentCategory }: Props) {
  const router = useRouter();
  const [createState, createAction, isCreating] = useActionState(createPatternAction, null);
  const [editState, editAction, isEditing] = useActionState(updatePatternAction, null);
  const [addOpen, setAddOpen] = useState(false);
  const [editingPattern, setEditingPattern] = useState<AdminPatternItem | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState(currentCategory || "ALL");
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [currentPage, setCurrentPage] = useState(1);
  const [actionFeedback, setActionFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  // a successful save closes its drawer
  useEffect(() => {
    if (createState?.message && !createState?.error) setAddOpen(false);
  }, [createState]);
  useEffect(() => {
    if (editState?.message && !editState?.error) setEditingPattern(null);
  }, [editState]);

  const activeCategoryObj = useMemo(() => {
    if (!currentCategory || currentCategory === "ALL") return null;
    return categories.find((c) => c.slug === currentCategory || c.id === currentCategory) ?? null;
  }, [categories, currentCategory]);

  const inCategory = useMemo(
    () =>
      patterns.filter((p) => selectedCategory === "ALL" || p.categoryId === selectedCategory || p.categorySlug.toLowerCase() === selectedCategory.toLowerCase()),
    [patterns, selectedCategory]
  );
  const filteredPatterns = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return inCategory.filter((p) => {
      if (status === "ACTIVE" && !p.isActive) return false;
      if (status === "INACTIVE" && p.isActive) return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q) || p.categoryName.toLowerCase().includes(q) || Boolean(p.tierName && p.tierName.toLowerCase().includes(q));
    });
  }, [inCategory, status, searchQuery]);

  const totalItems = filteredPatterns.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  const validPage = Math.min(currentPage, totalPages);
  const startIndex = (validPage - 1) * PAGE_SIZE;
  const paginatedPatterns = filteredPatterns.slice(startIndex, startIndex + PAGE_SIZE);

  const handleCategoryChange = (cat: string) => {
    setSelectedCategory(cat);
    setCurrentPage(1);
    router.push(cat === "ALL" ? "/admin/mock-tests/patterns" : `/admin/mock-tests/patterns?category=${cat}`);
  };

  const toggle = (pattern: AdminPatternItem) => {
    if (!confirm(`${pattern.isActive ? "Deactivate" : "Activate"} "${pattern.name}"?`)) return;
    startTransition(async () => {
      const res = await togglePatternStatusAction(pattern.id, pattern.isActive);
      if (res.error) setActionFeedback({ type: "error", text: actionErrorMessage(res) });
      if (res.message) setActionFeedback({ type: "success", text: res.message });
    });
  };
  const remove = (pattern: AdminPatternItem) => {
    const msg =
      pattern.sectionsCount > 0
        ? `"${pattern.name}" has ${pattern.sectionsCount} section(s). Deleting it removes those section blueprints. Delete it?`
        : `Delete pattern "${pattern.name}"? This cannot be undone.`;
    if (!confirm(msg)) return;
    startTransition(async () => {
      const res = await deletePatternAction(pattern.id);
      if (res.error) setActionFeedback({ type: "error", text: actionErrorMessage(res) });
      if (res.message) setActionFeedback({ type: "success", text: res.message });
    });
  };

  const counts = { ALL: inCategory.length, ACTIVE: inCategory.filter((p) => p.isActive).length, INACTIVE: inCategory.filter((p) => !p.isActive).length };
  const feedback = (kind: "success" | "error", text: string) => (
    <p role={kind === "error" ? "alert" : "status"} className={`rounded-card border px-4 py-3 text-[13px] ${kind === "success" ? "border-success-200 bg-success-50 text-success-800" : "border-danger-200 bg-danger-50 text-danger-800"}`}>
      {text}
    </p>
  );

  return (
    <div className="space-y-4 pb-8">
      <StudioPageHeader
        title="Patterns"
        description="The structure of each exam stage: questions, marks, duration and negative marking. Sections, questions and mock tests hang off a pattern."
        primary={
          <button type="button" className={studioPrimaryAction} onClick={() => setAddOpen(true)}>
            <Plus aria-hidden="true" className="size-4" /> New pattern
          </button>
        }
        actions={
          <Link href="/admin/exams" className={studioQuietAction}>
            Categories
          </Link>
        }
      />

      {createState?.message && !createState?.error && feedback("success", createState.message)}
      {editState?.message && !editState?.error && feedback("success", editState.message)}
      {actionFeedback && feedback(actionFeedback.type, actionFeedback.text)}

      <StudioStatStrip
        label="Patterns by status"
        onSelect={(k) => (setStatus(k as StatusFilter), setCurrentPage(1))}
        stats={[
          { key: "ALL", label: "All", value: counts.ALL, tone: "blue", active: status === "ALL" },
          { key: "ACTIVE", label: "Active", value: counts.ACTIVE, tone: "green", active: status === "ACTIVE" },
          { key: "INACTIVE", label: "Inactive", value: counts.INACTIVE, tone: "muted", active: status === "INACTIVE" },
        ]}
      />

      <StudioPanel>
        <div className="grid gap-3 md:grid-cols-[2fr_1fr]">
          <StudioField label="Search" htmlFor="pt-search">
            <input
              id="pt-search"
              type="search"
              value={searchQuery}
              onChange={(e) => (setSearchQuery(e.target.value), setCurrentPage(1))}
              placeholder="Pattern, exam or tier"
              className={studioControl}
            />
          </StudioField>
          <StudioField label="Exam category" htmlFor="pt-category">
            <select id="pt-category" value={selectedCategory} onChange={(e) => handleCategoryChange(e.target.value)} className={studioControl}>
              <option value="ALL">All categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.slug}>
                  {c.title}
                </option>
              ))}
            </select>
          </StudioField>
        </div>
        <p className="mt-3 text-[13px] text-fg-secondary" aria-live="polite">
          {totalItems === 0 ? "No patterns match." : `Showing ${startIndex + 1}–${Math.min(startIndex + PAGE_SIZE, totalItems)} of ${totalItems} pattern${totalItems === 1 ? "" : "s"}.`}
        </p>
      </StudioPanel>

      {paginatedPatterns.length === 0 ? (
        patterns.length === 0 ? (
          <StudioEmpty title="No patterns yet" body="Create the first pattern for an exam category; sections and mock tests build on it." />
        ) : (
          <StudioEmpty title="No patterns match" body="Change the search, the category or the status filter." />
        )
      ) : (
        <ul className="space-y-3" aria-label="Patterns">
          {paginatedPatterns.map((pattern) => (
            <li key={pattern.id}>
              <StudioPanel>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[12px] font-semibold text-fg-secondary">{pattern.categoryName}</p>
                    <h2 className="text-[16px] font-bold text-fg">{pattern.name}</h2>
                    {pattern.tierName && <p className="text-[13px] text-fg-secondary">{pattern.tierName}</p>}
                    <p className="mt-2 text-[13px] text-fg">
                      {pattern.totalQuestions} questions · {pattern.totalMarks} marks · {pattern.durationMinutes} min ·{" "}
                      {pattern.negativeMarkValue > 0 ? `−${pattern.negativeMarkValue} per wrong answer` : "no negative marking"} · {pattern.sectionsCount} section{pattern.sectionsCount === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <StatusChip status={pattern.isActive ? "ACTIVE" : "INACTIVE"} />
                    <button type="button" onClick={() => setEditingPattern(pattern)} aria-label={`Edit ${pattern.name}`} className="focus-ring inline-flex size-10 items-center justify-center rounded-control text-fg-secondary hover:bg-ink-100">
                      <Edit2 aria-hidden="true" className="size-4" />
                    </button>
                    <button type="button" onClick={() => toggle(pattern)} disabled={isPending} aria-label={`${pattern.isActive ? "Deactivate" : "Activate"} ${pattern.name}`} className="focus-ring inline-flex size-10 items-center justify-center rounded-control text-fg-secondary hover:bg-ink-100">
                      <Power aria-hidden="true" className="size-4" />
                    </button>
                    <button type="button" onClick={() => remove(pattern)} disabled={isPending} aria-label={`Delete ${pattern.name}`} className="focus-ring inline-flex size-10 items-center justify-center rounded-control text-danger-700 hover:bg-danger-50">
                      <Trash2 aria-hidden="true" className="size-4" />
                    </button>
                  </div>
                </div>
                <nav aria-label={`${pattern.name}: related`} className="mt-3 flex flex-wrap gap-1 border-t border-line pt-2">
                  <Link href={`/admin/mock-tests/sections?pattern=${pattern.id}&category=${pattern.categorySlug}`} className={studioQuietAction}>
                    Sections
                  </Link>
                  <Link href={`/admin/questions?category=${pattern.categorySlug}&pattern=${pattern.id}`} className={studioQuietAction}>
                    Questions
                  </Link>
                  <Link href={`/admin/mock-tests?pattern=${pattern.id}&category=${pattern.categorySlug}`} className={studioQuietAction}>
                    Mock tests
                  </Link>
                  <Link href={`/admin/exams/cycles?category=${pattern.categorySlug}`} className={studioQuietAction}>
                    Schedules
                  </Link>
                  <Link href="/admin/questions/import" className={studioQuietAction}>
                    Bulk import
                  </Link>
                </nav>
              </StudioPanel>
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 && (
        <nav aria-label="Pages" className="flex items-center justify-center gap-1">
          <button type="button" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={validPage === 1} aria-label="Previous page" className="focus-ring inline-flex size-10 items-center justify-center rounded-control hover:bg-ink-100 disabled:opacity-40">
            <ChevronLeft aria-hidden="true" className="size-4" />
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setCurrentPage(n)}
              aria-current={n === validPage ? "page" : undefined}
              aria-label={`Page ${n}`}
              className={`focus-ring inline-flex size-10 items-center justify-center rounded-control text-[13px] font-semibold ${n === validPage ? "border border-primary-700 bg-primary-50 text-primary-800" : "text-fg hover:bg-ink-100"}`}
            >
              {n}
            </button>
          ))}
          <button type="button" onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={validPage === totalPages} aria-label="Next page" className="focus-ring inline-flex size-10 items-center justify-center rounded-control hover:bg-ink-100 disabled:opacity-40">
            <ChevronRight aria-hidden="true" className="size-4" />
          </button>
        </nav>
      )}

      <StudioDrawer open={addOpen} onClose={() => setAddOpen(false)} title="New pattern" subtitle="Active patterns are available when you create mock tests.">
        {createState?.error && <div className="mb-3">{feedback("error", actionErrorMessage(createState))}</div>}
        <form action={createAction} className="space-y-4">
          <StudioField label="Exam category" htmlFor="pt-new-category">
            <select id="pt-new-category" name="categoryId" defaultValue={activeCategoryObj ? activeCategoryObj.id : categories[0]?.id || ""} className={studioControl} required>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </StudioField>
          <StudioField label="Pattern name" htmlFor="pt-new-name">
            <input id="pt-new-name" name="name" type="text" placeholder="e.g. Tier 1" className={studioControl} required />
          </StudioField>
          <StudioField label="Tier / exam stage" htmlFor="pt-new-tier">
            <input id="pt-new-tier" name="tierName" type="text" defaultValue="Tier 1 (CBE)" className={studioControl} />
          </StudioField>
          <div className="grid grid-cols-2 gap-3">
            <StudioField label="Total questions" htmlFor="pt-new-questions">
              <input id="pt-new-questions" name="totalQuestions" type="number" min={1} defaultValue={100} className={studioControl} required />
            </StudioField>
            <StudioField label="Total marks" htmlFor="pt-new-marks">
              <input id="pt-new-marks" name="totalMarks" type="number" min={1} defaultValue={200} className={studioControl} required />
            </StudioField>
            <StudioField label="Duration (minutes)" htmlFor="pt-new-duration">
              <input id="pt-new-duration" name="durationMinutes" type="number" min={1} defaultValue={60} className={studioControl} required />
            </StudioField>
            <StudioField label="Negative mark per wrong answer" htmlFor="pt-new-negative">
              <input id="pt-new-negative" name="negativeMarkValue" type="number" step="0.01" min={0} defaultValue={0.5} className={studioControl} />
            </StudioField>
          </div>
          <label htmlFor="pt-new-active" className="flex items-center gap-2 text-[13px] text-fg">
            <input id="pt-new-active" type="checkbox" name="isActive" defaultChecked className="size-4" />
            Active (available when creating mock tests)
          </label>
          <div className="flex justify-end gap-2 border-t border-line pt-3">
            <button type="button" className={studioQuietAction} onClick={() => setAddOpen(false)}>
              Cancel
            </button>
            <button type="submit" className={`${studioQuietAction} border border-primary-700`} disabled={isCreating} aria-busy={isCreating}>
              {isCreating ? "Creating…" : "Create pattern"}
            </button>
          </div>
        </form>
      </StudioDrawer>

      <StudioDrawer open={!!editingPattern} onClose={() => setEditingPattern(null)} title={editingPattern ? `Edit ${editingPattern.name}` : "Edit pattern"}>
        {editState?.error && <div className="mb-3">{feedback("error", actionErrorMessage(editState))}</div>}
        {editingPattern && (
          <form action={editAction} className="space-y-4">
            <input type="hidden" name="id" value={editingPattern.id} />
            <StudioField label="Pattern name" htmlFor="pt-edit-name">
              <input id="pt-edit-name" name="name" type="text" defaultValue={editingPattern.name} className={studioControl} required />
            </StudioField>
            <StudioField label="Tier / exam stage" htmlFor="pt-edit-tier">
              <input id="pt-edit-tier" name="tierName" type="text" defaultValue={editingPattern.tierName || ""} className={studioControl} />
            </StudioField>
            <div className="grid grid-cols-2 gap-3">
              <StudioField label="Duration (minutes)" htmlFor="pt-edit-duration">
                <input id="pt-edit-duration" name="durationMinutes" type="number" defaultValue={editingPattern.durationMinutes} className={studioControl} />
              </StudioField>
              <StudioField label="Total questions" htmlFor="pt-edit-questions">
                <input id="pt-edit-questions" name="totalQuestions" type="number" defaultValue={editingPattern.totalQuestions} className={studioControl} />
              </StudioField>
              <StudioField label="Total marks" htmlFor="pt-edit-marks">
                <input id="pt-edit-marks" name="totalMarks" type="number" defaultValue={editingPattern.totalMarks} className={studioControl} />
              </StudioField>
              <StudioField label="Negative mark per wrong answer" htmlFor="pt-edit-negative">
                <input id="pt-edit-negative" name="negativeMarkValue" type="number" step="0.01" defaultValue={editingPattern.negativeMarkValue} className={studioControl} />
              </StudioField>
            </div>
            <div className="flex justify-end gap-2 border-t border-line pt-3">
              <button type="button" className={studioQuietAction} onClick={() => setEditingPattern(null)}>
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
