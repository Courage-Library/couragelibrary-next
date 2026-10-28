"use client";

import { actionErrorMessage } from "@/lib/actions/action-result";
import React, { useState, useMemo, useActionState, useTransition, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AdminSectionItem, AdminPatternItem, AdminCategoryItem } from "@/services/admin.service";
import { createSectionAction, updateSectionAction, deleteSectionAction } from "@/app/admin/actions";
import { StudioDrawer } from "@/components/admin/studio/studio-drawer";
import { StudioEmpty, StudioField, StudioPageHeader, StudioPanel, StudioStatStrip, studioControl, studioPrimaryAction, studioQuietAction } from "@/components/admin/studio/studio-page";
import { Edit2, Trash2, ChevronLeft, ChevronRight, Plus } from "lucide-react";

interface Props {
  sections: AdminSectionItem[];
  patterns: AdminPatternItem[];
  categories: AdminCategoryItem[];
  /** GAP2-1b: existing active SUBJECT nodes; sections never create taxonomy. */
  subjects: { id: string; name: string }[];
  currentPattern?: string;
  currentCategory?: string;
}

const PAGE_SIZE = 10;
type BankFilter = "ALL" | "READY" | "SHORT";

/**
 * Courage Studio phase 3 batch 2 — Sections on the Studio template: ONE primary ("New section") opening the form in the
 * Studio drawer, edit in the same drawer, a stat strip that filters by question-bank readiness (aria-pressed, real
 * counts), labelled filters, rows with named icon actions, honest empty states, labelled pagination.
 */
export function AdminSectionsManager({ sections, patterns, categories, subjects, currentPattern, currentCategory }: Props) {
  const router = useRouter();
  const [createState, createAction, isCreating] = useActionState(createSectionAction, null);
  const [editState, editAction, isEditing] = useActionState(updateSectionAction, null);
  const [addOpen, setAddOpen] = useState(false);
  const [editingSection, setEditingSection] = useState<AdminSectionItem | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPatternFilter, setSelectedPatternFilter] = useState(currentPattern || "ALL");
  const [bank, setBank] = useState<BankFilter>("ALL");
  const [currentPage, setCurrentPage] = useState(1);
  const [actionFeedback, setActionFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (createState?.message && !createState?.error) setAddOpen(false);
  }, [createState]);
  useEffect(() => {
    if (editState?.message && !editState?.error) setEditingSection(null);
  }, [editState]);

  const activePatternObj = useMemo(() => {
    if (!currentPattern || currentPattern === "ALL") return null;
    return patterns.find((p) => p.id === currentPattern || p.name.toLowerCase() === currentPattern.toLowerCase()) ?? null;
  }, [patterns, currentPattern]);
  const activeCategoryObj = useMemo(() => {
    if (activePatternObj) return categories.find((c) => c.slug === activePatternObj.categorySlug || c.id === activePatternObj.categoryId) ?? null;
    if (currentCategory && currentCategory !== "ALL") return categories.find((c) => c.slug === currentCategory || c.id === currentCategory) ?? null;
    return null;
  }, [categories, activePatternObj, currentCategory]);

  const ready = (s: AdminSectionItem) => (s.questionsInBank || 0) >= s.questionCount;
  const inPattern = useMemo(
    () => sections.filter((s) => selectedPatternFilter === "ALL" || s.patternId === selectedPatternFilter || (s.patternName && s.patternName.toLowerCase() === selectedPatternFilter.toLowerCase())),
    [sections, selectedPatternFilter]
  );
  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return inPattern.filter((s) => {
      if (bank === "READY" && !ready(s)) return false;
      if (bank === "SHORT" && ready(s)) return false;
      if (!q) return true;
      return s.name.toLowerCase().includes(q) || Boolean(s.patternName && s.patternName.toLowerCase().includes(q)) || Boolean(s.categoryName && s.categoryName.toLowerCase().includes(q)) || s.slug.toLowerCase().includes(q);
    });
  }, [inPattern, bank, searchQuery]);

  const totalItems = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  const validPage = Math.min(currentPage, totalPages);
  const startIndex = (validPage - 1) * PAGE_SIZE;
  const paginatedSections = filtered.slice(startIndex, startIndex + PAGE_SIZE);

  const handlePatternFilterChange = (pat: string) => {
    setSelectedPatternFilter(pat);
    setCurrentPage(1);
    router.push(pat === "ALL" ? "/admin/sections" : `/admin/sections?pattern=${pat}`);
  };
  const remove = (sec: AdminSectionItem) => {
    if (!confirm(`Delete section "${sec.name}"? This removes its blueprint rule.`)) return;
    startTransition(async () => {
      const res = await deleteSectionAction(sec.id);
      if (res.error) setActionFeedback({ type: "error", text: actionErrorMessage(res) });
      if (res.message) setActionFeedback({ type: "success", text: res.message });
    });
  };

  const counts = { ALL: inPattern.length, READY: inPattern.filter(ready).length, SHORT: inPattern.filter((s) => !ready(s)).length };
  const feedback = (kind: "success" | "error", text: string) => (
    <p role={kind === "error" ? "alert" : "status"} className={`rounded-card border px-4 py-3 text-[13px] ${kind === "success" ? "border-success-200 bg-success-50 text-success-800" : "border-danger-200 bg-danger-50 text-danger-800"}`}>
      {text}
    </p>
  );
  const patternLabel = (p: AdminPatternItem) => `${p.categoryName || "National"} — ${p.name}`;

  return (
    <div className="space-y-4 pb-8">
      <StudioPageHeader
        title="Sections"
        description={`The sections of each pattern: required questions and marks per question.${activePatternObj ? ` Showing ${patternLabel(activePatternObj)}.` : ""}`}
        primary={
          <button type="button" className={studioPrimaryAction} onClick={() => setAddOpen(true)}>
            <Plus aria-hidden="true" className="size-4" /> New section
          </button>
        }
        actions={
          <Link href={activeCategoryObj ? `/admin/patterns?category=${activeCategoryObj.slug}` : "/admin/patterns"} className={studioQuietAction}>
            Patterns
          </Link>
        }
      />

      {createState?.message && !createState?.error && feedback("success", createState.message)}
      {editState?.message && !editState?.error && feedback("success", editState.message)}
      {actionFeedback && feedback(actionFeedback.type, actionFeedback.text)}

      <StudioStatStrip
        label="Sections by question-bank readiness"
        onSelect={(k) => (setBank(k as BankFilter), setCurrentPage(1))}
        stats={[
          { key: "ALL", label: "All", value: counts.ALL, tone: "blue", active: bank === "ALL" },
          { key: "READY", label: "Enough questions", value: counts.READY, tone: "green", active: bank === "READY" },
          { key: "SHORT", label: "Short of questions", value: counts.SHORT, tone: "orange", active: bank === "SHORT" },
        ]}
      />

      <StudioPanel>
        <div className="grid gap-3 md:grid-cols-[2fr_1fr]">
          <StudioField label="Search" htmlFor="sc-search">
            <input id="sc-search" type="search" value={searchQuery} onChange={(e) => (setSearchQuery(e.target.value), setCurrentPage(1))} placeholder="Section, pattern or exam" className={studioControl} />
          </StudioField>
          <StudioField label="Pattern" htmlFor="sc-pattern">
            <select id="sc-pattern" value={selectedPatternFilter} onChange={(e) => handlePatternFilterChange(e.target.value)} className={studioControl}>
              <option value="ALL">All patterns</option>
              {patterns.map((p) => (
                <option key={p.id} value={p.id}>
                  {patternLabel(p)}
                </option>
              ))}
            </select>
          </StudioField>
        </div>
        <p className="mt-3 text-[13px] text-fg-secondary" aria-live="polite">
          {totalItems === 0 ? "No sections match." : `Showing ${startIndex + 1}–${Math.min(startIndex + PAGE_SIZE, totalItems)} of ${totalItems} section${totalItems === 1 ? "" : "s"}.`}
        </p>
      </StudioPanel>

      {paginatedSections.length === 0 ? (
        sections.length === 0 ? (
          <StudioEmpty title="No sections yet" body="Add the sections of a pattern: each one sets how many questions it needs and their marks." />
        ) : (
          <StudioEmpty title="No sections match" body="Change the search, the pattern or the readiness filter." />
        )
      ) : (
        <ul className="space-y-3" aria-label="Sections">
          {paginatedSections.map((sec) => {
            const totalMarks = (sec.questionCount * sec.marksPerQuestion).toFixed(1);
            const ok = ready(sec);
            const questionUrl = `/admin/questions?section=${encodeURIComponent(sec.name)}${sec.categorySlug ? `&category=${sec.categorySlug}` : ""}${sec.patternId ? `&pattern=${sec.patternId}` : ""}`;
            return (
              <li key={sec.id}>
                <StudioPanel>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[12px] font-semibold text-fg-secondary">
                        {sec.categoryName ? `${sec.categoryName} — ` : ""}
                        {sec.patternName || "Standard pattern"}
                      </p>
                      <h2 className="text-[16px] font-bold text-fg">{sec.name}</h2>
                      <p className="mt-2 text-[13px] text-fg">
                        {sec.questionCount} questions required · {sec.marksPerQuestion} marks each · {totalMarks} marks in total
                        {sec.negativeMark > 0 ? ` · −${sec.negativeMark} per wrong answer` : ""}
                      </p>
                      <p className={`mt-1 text-[13px] font-semibold ${ok ? "text-success-700" : "text-warning-800"}`}>
                        {sec.questionsInBank || 0} in the question bank{ok ? "" : ` — ${sec.questionCount - (sec.questionsInBank || 0)} short`}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button type="button" onClick={() => setEditingSection(sec)} aria-label={`Edit ${sec.name}`} className="focus-ring inline-flex size-10 items-center justify-center rounded-control text-fg-secondary hover:bg-ink-100">
                        <Edit2 aria-hidden="true" className="size-4" />
                      </button>
                      <button type="button" onClick={() => remove(sec)} disabled={isPending} aria-label={`Delete ${sec.name}`} className="focus-ring inline-flex size-10 items-center justify-center rounded-control text-danger-700 hover:bg-danger-50">
                        <Trash2 aria-hidden="true" className="size-4" />
                      </button>
                    </div>
                  </div>
                  <nav aria-label={`${sec.name}: related`} className="mt-3 flex flex-wrap gap-1 border-t border-line pt-2">
                    <Link href={questionUrl} className={studioQuietAction}>
                      Questions
                    </Link>
                    <Link href="/admin/bulk-import" className={studioQuietAction}>
                      Bulk import
                    </Link>
                  </nav>
                </StudioPanel>
              </li>
            );
          })}
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

      <StudioDrawer open={addOpen} onClose={() => setAddOpen(false)} title="New section" subtitle="A section belongs to a pattern and an existing subject of the master tree.">
        {createState?.error && <div className="mb-3">{feedback("error", actionErrorMessage(createState))}</div>}
        <form action={createAction} className="space-y-4">
          <StudioField label="Pattern" htmlFor="sc-new-pattern">
            <select id="sc-new-pattern" name="patternId" defaultValue={activePatternObj ? activePatternObj.id : patterns[0]?.id || ""} className={studioControl} required>
              <option value="">Choose a pattern</option>
              {patterns.map((p) => (
                <option key={p.id} value={p.id}>
                  {patternLabel(p)}
                </option>
              ))}
            </select>
          </StudioField>
          <StudioField label="Subject" htmlFor="sc-new-subject">
            <select id="sc-new-subject" name="subjectId" defaultValue="" className={studioControl} required>
              <option value="">Choose a subject</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </StudioField>
          <p className="-mt-2 text-[12px] text-fg-secondary">
            Missing a subject? Add it in the{" "}
            <Link href="/admin/taxonomy" className="font-semibold text-link underline">
              Master tree
            </Link>
            .
          </p>
          <StudioField label="Section name" htmlFor="sc-new-name">
            <input id="sc-new-name" name="name" type="text" placeholder="e.g. General Intelligence and Reasoning" className={studioControl} required />
          </StudioField>
          <div className="grid grid-cols-2 gap-3">
            <StudioField label="Questions required" htmlFor="sc-new-count">
              <input id="sc-new-count" name="questionCount" type="number" min={1} defaultValue={25} className={studioControl} required />
            </StudioField>
            <StudioField label="Marks per question" htmlFor="sc-new-marks">
              <input id="sc-new-marks" name="marksPerQuestion" type="number" step="0.01" min={0.1} defaultValue={2.0} className={studioControl} required />
            </StudioField>
          </div>
          <StudioField label="Negative mark per wrong answer" htmlFor="sc-new-negative">
            <input id="sc-new-negative" name="negativeMark" type="number" step="0.01" defaultValue={0.5} className={studioControl} />
          </StudioField>
          <div className="flex justify-end gap-2 border-t border-line pt-3">
            <button type="button" className={studioQuietAction} onClick={() => setAddOpen(false)}>
              Cancel
            </button>
            <button type="submit" className={`${studioQuietAction} border border-primary-700`} disabled={isCreating} aria-busy={isCreating}>
              {isCreating ? "Saving…" : "Add section"}
            </button>
          </div>
        </form>
      </StudioDrawer>

      <StudioDrawer open={!!editingSection} onClose={() => setEditingSection(null)} title={editingSection ? `Edit ${editingSection.name}` : "Edit section"}>
        {editState?.error && <div className="mb-3">{feedback("error", actionErrorMessage(editState))}</div>}
        {editingSection && (
          <form action={editAction} className="space-y-4">
            <input type="hidden" name="id" value={editingSection.id} />
            <StudioField label="Section name" htmlFor="sc-edit-name">
              <input id="sc-edit-name" name="name" type="text" defaultValue={editingSection.name} className={studioControl} required />
            </StudioField>
            <div className="grid grid-cols-2 gap-3">
              <StudioField label="Questions required" htmlFor="sc-edit-count">
                <input id="sc-edit-count" name="questionCount" type="number" min={1} defaultValue={editingSection.questionCount} className={studioControl} required />
              </StudioField>
              <StudioField label="Marks per question" htmlFor="sc-edit-marks">
                <input id="sc-edit-marks" name="marksPerQuestion" type="number" step="0.25" min={0.25} defaultValue={editingSection.marksPerQuestion} className={studioControl} required />
              </StudioField>
            </div>
            <StudioField label="Negative mark per wrong answer" htmlFor="sc-edit-negative">
              <input id="sc-edit-negative" name="negativeMark" type="number" step="0.01" defaultValue={editingSection.negativeMark} className={studioControl} />
            </StudioField>
            <div className="flex justify-end gap-2 border-t border-line pt-3">
              <button type="button" className={studioQuietAction} onClick={() => setEditingSection(null)}>
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
