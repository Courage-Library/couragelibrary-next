"use client";

import { actionErrorMessage } from "@/lib/actions/action-result";
import React, { useState, useMemo, useActionState, useTransition, useEffect } from "react";
import Link from "next/link";
import { AdminCategoryItem } from "@/services/admin.service";
import { createCategoryAction, updateCategoryAction, toggleCategoryStatusAction } from "@/app/admin/actions";
import { StudioDrawer } from "@/components/admin/studio/studio-drawer";
import { StudioEmpty, StudioField, StudioPageHeader, StudioPanel, StudioStatStrip, studioControl, studioPrimaryAction, studioQuietAction } from "@/components/admin/studio/studio-page";
import { StatusChip } from "@/components/admin/status-chip";
import { Edit2, Power, Plus } from "lucide-react";

interface Props {
  categories: AdminCategoryItem[];
}

type StatusFilter = "ALL" | "ACTIVE" | "INACTIVE";
const BOARDS = [
  "Staff Selection Commission (SSC)",
  "State Police Recruitment",
  "Defence (Army / Navy / Air Force)",
  "Railway Recruitment Board (RRB)",
  "Banking & Insurance",
  "Teaching & State PSC",
];

/**
 * Courage Studio phase 3 batch 2 — Categories on the Studio template: ONE primary ("New category") opening the form in
 * the Studio drawer, edit in the same drawer, a stat strip that filters by status (aria-pressed), a labelled search,
 * rows with named icon actions, v3 status chips and the connected counts, honest empty states. A failed toggle is shown
 * (it used to be silent).
 */
export function AdminCategoriesManager({ categories }: Props) {
  const [createState, createAction, isCreating] = useActionState(createCategoryAction, null);
  const [editState, editAction, isEditing] = useActionState(updateCategoryAction, null);
  const [addOpen, setAddOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<AdminCategoryItem | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [actionFeedback, setActionFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isToggling, startTransition] = useTransition();

  useEffect(() => {
    if (createState?.message && !createState?.error) setAddOpen(false);
  }, [createState]);
  useEffect(() => {
    if (editState?.message && !editState?.error) setEditingCategory(null);
  }, [editState]);

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return categories.filter((c) => {
      if (status === "ACTIVE" && !c.isActive) return false;
      if (status === "INACTIVE" && c.isActive) return false;
      if (!q) return true;
      return c.title.toLowerCase().includes(q) || c.slug.toLowerCase().includes(q) || c.category.toLowerCase().includes(q) || Boolean(c.description && c.description.toLowerCase().includes(q));
    });
  }, [categories, status, searchQuery]);

  const toggle = (cat: AdminCategoryItem) => {
    if (!confirm(`${cat.isActive ? "Deactivate" : "Activate"} "${cat.title}"?`)) return;
    startTransition(async () => {
      const res = await toggleCategoryStatusAction(cat.id, cat.isActive);
      if (res?.error) setActionFeedback({ type: "error", text: actionErrorMessage(res) });
      else setActionFeedback({ type: "success", text: res?.message || `"${cat.title}" ${cat.isActive ? "deactivated" : "activated"}.` });
    });
  };

  const counts = { ALL: categories.length, ACTIVE: categories.filter((c) => c.isActive).length, INACTIVE: categories.filter((c) => !c.isActive).length };
  const feedback = (kind: "success" | "error", text: string) => (
    <p role={kind === "error" ? "alert" : "status"} className={`rounded-card border px-4 py-3 text-[13px] ${kind === "success" ? "border-success-200 bg-success-50 text-success-800" : "border-danger-200 bg-danger-50 text-danger-800"}`}>
      {text}
    </p>
  );

  return (
    <div className="space-y-4 pb-8">
      <StudioPageHeader
        title="Categories"
        description="The exam categories that patterns, sections, questions, schedules and mock tests belong to."
        primary={
          <button type="button" className={studioPrimaryAction} onClick={() => setAddOpen(true)}>
            <Plus aria-hidden="true" className="size-4" /> New category
          </button>
        }
        actions={
          <Link href="/admin/patterns" className={studioQuietAction}>
            Patterns
          </Link>
        }
      />

      {createState?.message && !createState?.error && feedback("success", createState.message)}
      {editState?.message && !editState?.error && feedback("success", editState.message)}
      {actionFeedback && feedback(actionFeedback.type, actionFeedback.text)}

      <StudioStatStrip
        label="Categories by status"
        onSelect={(k) => setStatus(k as StatusFilter)}
        stats={[
          { key: "ALL", label: "All", value: counts.ALL, tone: "blue", active: status === "ALL" },
          { key: "ACTIVE", label: "Active", value: counts.ACTIVE, tone: "green", active: status === "ACTIVE" },
          { key: "INACTIVE", label: "Inactive", value: counts.INACTIVE, tone: "muted", active: status === "INACTIVE" },
        ]}
      />

      <StudioPanel>
        <StudioField label="Search" htmlFor="ct-search">
          <input id="ct-search" type="search" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Title, slug or board" className={studioControl} />
        </StudioField>
        <p className="mt-3 text-[13px] text-fg-secondary" aria-live="polite">
          Showing {filtered.length} of {categories.length} categor{categories.length === 1 ? "y" : "ies"}.
        </p>
      </StudioPanel>

      {filtered.length === 0 ? (
        categories.length === 0 ? (
          <StudioEmpty title="No categories yet" body="Create the first exam category; patterns and mock tests belong to one." />
        ) : (
          <StudioEmpty title="No categories match" body="Change the search or the status filter." />
        )
      ) : (
        <ul className="space-y-3" aria-label="Categories">
          {filtered.map((cat) => (
            <li key={cat.id}>
              <StudioPanel>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-[16px] font-bold text-fg">{cat.title}</h2>
                    <p className="text-[13px] text-fg-secondary">
                      {cat.category} · <span className="font-mono">{cat.slug}</span>
                    </p>
                    {cat.description && <p className="mt-1 line-clamp-2 text-[13px] text-fg">{cat.description}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <StatusChip status={cat.isActive ? "ACTIVE" : "INACTIVE"} />
                    <button type="button" onClick={() => setEditingCategory(cat)} aria-label={`Edit ${cat.title}`} className="focus-ring inline-flex size-10 items-center justify-center rounded-control text-fg-secondary hover:bg-ink-100">
                      <Edit2 aria-hidden="true" className="size-4" />
                    </button>
                    <button type="button" onClick={() => toggle(cat)} disabled={isToggling} aria-label={`${cat.isActive ? "Deactivate" : "Activate"} ${cat.title}`} className="focus-ring inline-flex size-10 items-center justify-center rounded-control text-fg-secondary hover:bg-ink-100">
                      <Power aria-hidden="true" className="size-4" />
                    </button>
                  </div>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-2 border-t border-line pt-3 sm:grid-cols-4">
                  {[
                    ["Patterns", cat.patternsCount],
                    ["Questions", cat.questionsCount],
                    ["Schedules", cat.schedulesCount],
                    ["Mock tests", cat.mockTestsCount],
                  ].map(([label, value]) => (
                    <div key={String(label)}>
                      <dt className="text-[11.5px] font-semibold uppercase tracking-wide text-fg-secondary">{label}</dt>
                      <dd className="text-[18px] font-bold text-fg">{value}</dd>
                    </div>
                  ))}
                </dl>
                <nav aria-label={`${cat.title}: related`} className="mt-3 flex flex-wrap gap-1 border-t border-line pt-2">
                  <Link href={`/admin/patterns?category=${cat.slug}`} className={studioQuietAction}>
                    Patterns
                  </Link>
                  <Link href={`/admin/schedules?category=${cat.slug}`} className={studioQuietAction}>
                    Schedules
                  </Link>
                  <Link href={`/admin/questions?category=${cat.slug}`} className={studioQuietAction}>
                    Questions
                  </Link>
                  <Link href={`/admin/mock-tests?category=${cat.slug}`} className={studioQuietAction}>
                    Mock tests
                  </Link>
                </nav>
              </StudioPanel>
            </li>
          ))}
        </ul>
      )}

      <StudioDrawer open={addOpen} onClose={() => setAddOpen(false)} title="New category">
        {createState?.error && <div className="mb-3">{feedback("error", actionErrorMessage(createState))}</div>}
        <form action={createAction} className="space-y-4">
          <StudioField label="Category / exam title" htmlFor="ct-new-title">
            <input id="ct-new-title" name="title" type="text" placeholder="e.g. SSC CGL or UP Police Constable" className={studioControl} required />
          </StudioField>
          <StudioField label="Conducting board / group" htmlFor="ct-new-board">
            <select id="ct-new-board" name="category" defaultValue={BOARDS[0]} className={studioControl}>
              {BOARDS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </StudioField>
          <StudioField label="URL slug (optional, generated when blank)" htmlFor="ct-new-slug">
            <input id="ct-new-slug" name="slug" type="text" placeholder="e.g. ssc-cgl" className={`${studioControl} font-mono`} />
          </StudioField>
          <StudioField label="Description" htmlFor="ct-new-description">
            <textarea id="ct-new-description" name="description" rows={3} placeholder="A short overview of the exam" className={`${studioControl} py-2`} />
          </StudioField>
          <div className="flex justify-end gap-2 border-t border-line pt-3">
            <button type="button" className={studioQuietAction} onClick={() => setAddOpen(false)}>
              Cancel
            </button>
            <button type="submit" className={`${studioQuietAction} border border-primary-700`} disabled={isCreating} aria-busy={isCreating}>
              {isCreating ? "Creating…" : "Create category"}
            </button>
          </div>
        </form>
      </StudioDrawer>

      <StudioDrawer open={!!editingCategory} onClose={() => setEditingCategory(null)} title={editingCategory ? `Edit ${editingCategory.title}` : "Edit category"}>
        {editState?.error && <div className="mb-3">{feedback("error", actionErrorMessage(editState))}</div>}
        {editingCategory && (
          <form action={editAction} className="space-y-4">
            <input type="hidden" name="id" value={editingCategory.id} />
            <StudioField label="Category title" htmlFor="ct-edit-title">
              <input id="ct-edit-title" name="title" type="text" defaultValue={editingCategory.title} className={studioControl} required />
            </StudioField>
            <StudioField label="Conducting board" htmlFor="ct-edit-board">
              <input id="ct-edit-board" name="category" type="text" defaultValue={editingCategory.category} className={studioControl} />
            </StudioField>
            <StudioField label="Description" htmlFor="ct-edit-description">
              <textarea id="ct-edit-description" name="description" rows={3} defaultValue={editingCategory.description || ""} className={`${studioControl} py-2`} />
            </StudioField>
            <div className="flex justify-end gap-2 border-t border-line pt-3">
              <button type="button" className={studioQuietAction} onClick={() => setEditingCategory(null)}>
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
