"use client";

import React, { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Plus } from "lucide-react";
import { StudioDrawer } from "@/components/admin/studio/studio-drawer";
import { studioControl, studioPrimaryAction, studioQuietAction } from "@/components/admin/studio/studio-page";
import { CategoryIcon } from "@/components/exams/category-icon";
import { LogoDrawer } from "@/components/admin/logos/logo-drawer";
import { ToastProvider, useToast } from "@/components/ui/toast";
import { saveCategoryAction } from "@/app/(site)/admin/exams/logo-actions";
import { bodySlug } from "@/lib/logos/logo-upload-guard";
import type { AdminCategory } from "@/lib/exams/category-admin";

/**
 * HOME-1: exam categories (the home tiles and /exams/<category>). Card grid like Conducting bodies: icon (64 px), name,
 * address, exam counts, status. Admins open a card to edit it (one primary "Save category"), change its icon (the
 * LogoDrawer, same safe pipeline) and move it up / down; the internal category is shown but locked. Staff: read-only.
 * Every action call is wrapped (a failure is an inline message, never the error boundary — LOGO-P0b).
 */
type Draft = { id: string | null; name: string; slug: string; slugTouched: boolean; shortDesc: string; displayOrder: number; isActive: boolean };
const FAILED = "The change could not be saved, so nothing was changed. Check your connection and try again.";
async function guarded<T>(call: () => Promise<T>): Promise<T | { success: false; message: string }> {
  try {
    return await call();
  } catch {
    return { success: false, message: FAILED };
  }
}
const failText = (r: { message?: string; error?: string }) => r.message || r.error || FAILED;

export function CategoriesPanel(props: { categories: AdminCategory[]; canEdit: boolean }) {
  return (
    <ToastProvider>
      <Panel {...props} />
    </ToastProvider>
  );
}

function Panel({ categories, canEdit }: { categories: AdminCategory[]; canEdit: boolean }) {
  const router = useRouter();
  const { show } = useToast();
  const uid = useId();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [iconFor, setIconFor] = useState<AdminCategory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [moveMsg, setMoveMsg] = useState<string | null>(null);
  const editable = categories.filter((c) => !c.isInternal);

  const open = (c: AdminCategory | null) => {
    setError(null);
    setDraft(c ? { id: c.id, name: c.name, slug: c.slug, slugTouched: true, shortDesc: c.shortDesc, displayOrder: c.displayOrder, isActive: c.isActive }
      : { id: null, name: "", slug: "", slugTouched: false, shortDesc: "", displayOrder: (editable.at(-1)?.displayOrder ?? 0) + 1, isActive: true });
  };
  const slugOf = (d: Draft) => (d.slugTouched ? d.slug : bodySlug(d.name));

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    setError(null);
    const r = await guarded(() => saveCategoryAction({ id: draft.id, slug: slugOf(draft), name: draft.name, shortDesc: draft.shortDesc, displayOrder: draft.displayOrder, isActive: draft.isActive }));
    setBusy(false);
    if (!r.success) return setError(failText(r as { message?: string; error?: string }));
    setDraft(null);
    show({ tone: "success", title: draft.id ? "Category saved" : `${draft.name.trim()} added`, description: draft.id ? undefined : "Add its icon from its card, or keep the built-in one." });
    router.refresh();
  };

  // swap the order with the neighbour (two audited saves)
  const move = async (c: AdminCategory, dir: -1 | 1) => {
    const i = editable.findIndex((x) => x.id === c.id);
    const other = editable[i + dir];
    if (!other) return;
    setMoveMsg(null);
    const a = await guarded(() => saveCategoryAction({ id: c.id, slug: c.slug, name: c.name, shortDesc: c.shortDesc, displayOrder: other.displayOrder, isActive: c.isActive }));
    const b = a.success ? await guarded(() => saveCategoryAction({ id: other.id, slug: other.slug, name: other.name, shortDesc: other.shortDesc, displayOrder: c.displayOrder, isActive: other.isActive })) : a;
    if (!a.success || !b.success) setMoveMsg(failText((a.success ? b : a) as { message?: string; error?: string }));
    router.refresh();
  };

  return (
    <section aria-labelledby="categories-title" data-categories-panel="">
      <h2 id="categories-title" className="text-base font-semibold text-fg">
        Exam categories
      </h2>
      <p className="mt-1 text-[13px] text-fg-secondary">
        The home page shows these as tiles; each opens /exams/&lt;address&gt; with its exams. A category without an active exam shows &quot;Coming soon&quot;.
        {canEdit ? "" : " Only admins can change categories."}
      </p>
      {moveMsg && (
        <p role="alert" className="mt-3 rounded-card border border-danger-200 bg-danger-50 px-3 py-2 text-[13px] text-danger-800">
          {moveMsg}
        </p>
      )}
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="Exam categories">
        {categories.map((c, idx) => {
          const pos = editable.findIndex((x) => x.id === c.id);
          const inner = (
            <>
              <CategoryIcon category={c} px={64} />
              <span className="min-w-0 flex-1 text-left">
                <span className="block text-[15px] font-semibold text-fg">{c.name}</span>
                <span className="block font-mono text-[12px] text-fg-secondary">/exams/{c.slug}</span>
                <span className="mt-0.5 block text-[13px] text-fg-secondary">
                  {c.activeExams} active · {c.totalExams} total exam{c.totalExams === 1 ? "" : "s"}
                </span>
                <span className="mt-1.5 flex flex-wrap gap-1.5">
                  {c.isInternal ? (
                    <Chip tone="neutral">Internal (never public)</Chip>
                  ) : c.isActive ? (
                    <Chip tone="ok">{c.activeExams > 0 ? "Live" : "Coming soon"}</Chip>
                  ) : (
                    <Chip tone="neutral">Hidden</Chip>
                  )}
                  <Chip tone="neutral">{c.icon ? "Uploaded icon" : "Built-in icon"}</Chip>
                </span>
              </span>
            </>
          );
          return (
            <li key={c.id} className="flex flex-col rounded-card border border-line bg-white" data-category={c.slug}>
              {canEdit && !c.isInternal ? (
                <button type="button" className="focus-ring flex flex-1 items-center gap-3 rounded-t-card p-4 text-left hover:bg-primary-50/40" onClick={() => open(c)} aria-label={`Edit ${c.name}`}>
                  {inner}
                </button>
              ) : (
                <div className="flex flex-1 items-center gap-3 p-4">{inner}</div>
              )}
              {canEdit && !c.isInternal && (
                <div className="flex items-center gap-1 border-t border-line px-2 py-1">
                  <button type="button" className={studioQuietAction} onClick={() => setIconFor(c)} data-category-icon-edit="">
                    {c.icon ? "Change icon" : "Upload icon"}
                  </button>
                  <span className="ml-auto flex">
                    <button type="button" className={`${studioQuietAction} min-w-12 justify-center`} aria-label={`Move ${c.name} up`} disabled={pos <= 0} onClick={() => move(c, -1)}>
                      <ArrowUp aria-hidden="true" className="size-4" />
                    </button>
                    <button type="button" className={`${studioQuietAction} min-w-12 justify-center`} aria-label={`Move ${c.name} down`} disabled={pos < 0 || pos >= editable.length - 1} onClick={() => move(c, 1)}>
                      <ArrowDown aria-hidden="true" className="size-4" />
                    </button>
                  </span>
                </div>
              )}
              <span className="sr-only">{idx + 1}</span>
            </li>
          );
        })}
        {canEdit && (
          <li>
            <button type="button" className="focus-ring flex h-full min-h-[120px] w-full items-center justify-center gap-2 rounded-card border-2 border-dashed border-line bg-white p-4 text-[14px] font-semibold text-link hover:border-primary-300 hover:bg-primary-50/40" onClick={() => open(null)} data-add-category="">
              <Plus aria-hidden="true" className="size-4" /> Add category
            </button>
          </li>
        )}
      </ul>

      {canEdit && draft && (
        <StudioDrawer
          open
          onClose={() => setDraft(null)}
          title={draft.id ? `Edit ${draft.name || "category"}` : "Add a category"}
          subtitle="Shown on the home page and at /exams/<address>."
          footer={
            <>
              <button type="button" className={studioQuietAction} onClick={() => setDraft(null)} disabled={busy}>
                Cancel
              </button>
              <button type="button" className={studioPrimaryAction} onClick={save} disabled={busy || draft.name.trim().length < 2 || !slugOf(draft)} data-category-save="">
                {busy ? "Saving…" : "Save category"}
              </button>
            </>
          }
        >
          <div className="grid gap-4" data-category-drawer="">
            <label className="text-[13px] font-semibold text-fg" htmlFor={`${uid}-name`}>
              Name
              <input id={`${uid}-name`} value={draft.name} maxLength={60} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={`${studioControl} mt-1`} placeholder="Railway" />
            </label>
            <label className="text-[13px] font-semibold text-fg" htmlFor={`${uid}-slug`}>
              Address
              <span className="mt-1 flex items-center gap-1 font-mono text-[13px] font-normal text-fg-secondary">
                /exams/
                <input id={`${uid}-slug`} value={slugOf(draft)} maxLength={40} onChange={(e) => setDraft({ ...draft, slug: e.target.value.toLowerCase(), slugTouched: true })} className={`${studioControl} font-mono`} />
              </span>
            </label>
            <label className="text-[13px] font-semibold text-fg" htmlFor={`${uid}-desc`}>
              One line (optional)
              <input id={`${uid}-desc`} value={draft.shortDesc} maxLength={140} onChange={(e) => setDraft({ ...draft, shortDesc: e.target.value })} className={`${studioControl} mt-1`} placeholder="Railway recruitment exams: NTPC, Group D, ALP and more." />
            </label>
            <label className="text-[13px] font-semibold text-fg" htmlFor={`${uid}-order`}>
              Order on the home page
              <input id={`${uid}-order`} type="number" min={0} max={999} value={draft.displayOrder} onChange={(e) => setDraft({ ...draft, displayOrder: Number(e.target.value) || 0 })} className={`${studioControl} mt-1 w-28`} />
            </label>
            <label className="flex min-h-12 items-center gap-2 text-[14px] font-semibold text-fg">
              <input type="checkbox" checked={draft.isActive} onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })} className="size-5" />
              Shown on the site
            </label>
            {error && (
              <p role="alert" className="rounded-card border border-danger-200 bg-danger-50 px-3 py-2 text-[13px] text-danger-800" data-category-error="">
                {error}
              </p>
            )}
          </div>
        </StudioDrawer>
      )}

      {canEdit && iconFor && (
        <LogoDrawer
          open
          onClose={() => setIconFor(null)}
          mode={{ kind: "CATEGORY", id: iconFor.id, name: iconFor.name }}
          current={iconFor.icon}
          previewExamTitle={iconFor.name}
          canRemove
          onDone={(d) => {
            setIconFor(null);
            show({ tone: "success", title: d.action === "removed" ? `${iconFor.name}: built-in icon again` : `${iconFor.name}: icon saved` });
            router.refresh();
          }}
        />
      )}
    </section>
  );
}

function Chip({ tone, children }: { tone: "ok" | "neutral"; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[14px] font-semibold ${tone === "ok" ? "border-success-200 bg-success-50 text-success-800" : "border-line bg-ink-50 text-fg-secondary"}`}>
      {children}
    </span>
  );
}
