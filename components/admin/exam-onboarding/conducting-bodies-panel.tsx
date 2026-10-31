"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, CircleAlert, Plus } from "lucide-react";
import { ExamLogoBadge } from "@/components/exams/exam-logo-badge";
import { LogoDrawer, type LogoDrawerDone, type LogoDrawerMode } from "@/components/admin/logos/logo-drawer";
import { ToastProvider, useToast } from "@/components/ui/toast";
import { examLogo } from "@/lib/logos/exam-logo";
import type { ConductingOrgItem } from "@/services/exam-onboarding/exam-onboarding.service";

/**
 * EXAM-LOGO-1 + LOGO-UX-1 (owner 2026-10-31): the conducting bodies as a card grid — logo (64 px) or initials, name,
 * "Used by N exams", a status chip; bodies WITHOUT a logo first. An admin opens a card to add / replace / remove its logo
 * (components/admin/logos/logo-drawer.tsx) and adds a body with its logo from the "Add body" card. Staff see the cards
 * read-only. A new exam needs a body with a logo.
 */
export type BodyUsage = { count: number; firstExamTitle: string | null };

export function ConductingBodiesPanel(props: { orgs: ConductingOrgItem[]; canEdit: boolean; usage: Record<string, BodyUsage> }) {
  return (
    <ToastProvider>
      <Panel {...props} />
    </ToastProvider>
  );
}

function Panel({ orgs, canEdit, usage }: { orgs: ConductingOrgItem[]; canEdit: boolean; usage: Record<string, BodyUsage> }) {
  const router = useRouter();
  const { show } = useToast();
  const [drawer, setDrawer] = useState<{ mode: LogoDrawerMode; org: ConductingOrgItem | null } | null>(null);
  const cards = useMemo(
    () =>
      orgs
        .filter((o) => o.isActive)
        .map((o) => ({ org: o, logo: examLogo({ org: { path: o.logoPath ?? null, alt: o.logoAlt ?? null } }), use: usage[o.id] ?? { count: 0, firstExamTitle: null } }))
        .sort((a, b) => Number(Boolean(a.logo)) - Number(Boolean(b.logo)) || a.org.name.localeCompare(b.org.name)),
    [orgs, usage],
  );
  const missing = cards.filter((c) => !c.logo).length;
  const done = (d: LogoDrawerDone, count: number) => {
    setDrawer(null);
    const exams = `${count} exam${count === 1 ? "" : "s"}`;
    show({
      tone: "success",
      title: d.action === "removed" ? `Logo removed from ${d.name}` : d.action === "created" ? `${d.name} added with its logo` : "Logo saved",
      description: d.action === "removed" ? `Its ${exams} now show initials.` : d.action === "created" ? "It can now be chosen for new exams." : `Now showing on ${exams}.`,
    });
    router.refresh();
  };

  return (
    <section id="conducting-bodies" aria-labelledby="conducting-bodies-title" className="mt-8" data-conducting-bodies="">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="conducting-bodies-title" className="text-base font-semibold text-fg">
          Conducting bodies
        </h2>
        <p className="text-[13px] text-fg-secondary">{missing ? `${missing} without a logo` : "Every body has its logo"}</p>
      </div>
      <p className="mt-1 text-[13px] text-fg-secondary">
        Every exam shows its conducting body&apos;s official logo before the exam&apos;s name.{canEdit ? " Open a body to add, replace or remove its logo." : " Only admins can change logos."}
      </p>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="Conducting bodies">
        {cards.map(({ org, logo, use }) => {
          const inner = (
            <>
              <ExamLogoBadge logo={logo} name={org.name} size="tile" />
              <span className="min-w-0 flex-1 text-left">
                <span className="block text-[14px] font-semibold text-fg">{org.name}</span>
                <span className="mt-0.5 block text-[12px] text-fg-secondary">
                  Used by {use.count} exam{use.count === 1 ? "" : "s"}
                </span>
                {logo ? (
                  <span className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-success-200 bg-success-50 px-2 py-0.5 text-[11px] font-semibold text-success-800" data-logo-ok="">
                    <CheckCircle2 aria-hidden="true" className="size-3.5" /> Logo added
                  </span>
                ) : (
                  <span className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-danger-200 bg-danger-50 px-2 py-0.5 text-[11px] font-semibold text-danger-800" data-logo-missing="">
                    <CircleAlert aria-hidden="true" className="size-3.5" /> Logo missing
                  </span>
                )}
              </span>
            </>
          );
          return (
            <li key={org.id} data-org={org.slug}>
              {canEdit ? (
                <button
                  type="button"
                  className="focus-ring flex h-full w-full items-center gap-3 rounded-card border border-line bg-white p-4 text-left hover:border-primary-300 hover:bg-primary-50/40"
                  onClick={() => setDrawer({ mode: { kind: "ORG", id: org.id, name: org.name }, org })}
                  aria-label={`${org.name}: ${logo ? "logo added" : "logo missing"}, used by ${use.count} exam${use.count === 1 ? "" : "s"}. Open to ${logo ? "replace or remove the logo" : "add the logo"}`}
                >
                  {inner}
                </button>
              ) : (
                <div className="flex h-full items-center gap-3 rounded-card border border-line bg-white p-4">{inner}</div>
              )}
            </li>
          );
        })}
        {canEdit && (
          <li>
            <button
              type="button"
              className="focus-ring flex h-full min-h-[96px] w-full items-center justify-center gap-2 rounded-card border-2 border-dashed border-line bg-white p-4 text-[14px] font-semibold text-link hover:border-primary-300 hover:bg-primary-50/40"
              onClick={() => setDrawer({ mode: { kind: "NEW_BODY" }, org: null })}
              data-add-body=""
            >
              <Plus aria-hidden="true" className="size-4" /> Add body
            </button>
          </li>
        )}
      </ul>
      {canEdit && drawer && (
        <LogoDrawer
          open
          onClose={() => setDrawer(null)}
          mode={drawer.mode}
          current={drawer.org ? examLogo({ org: { path: drawer.org.logoPath ?? null, alt: drawer.org.logoAlt ?? null } }) : null}
          previewExamTitle={(drawer.org && usage[drawer.org.id]?.firstExamTitle) || "Exam name"}
          canRemove
          onDone={(d) => done(d, drawer.org ? (usage[drawer.org.id]?.count ?? 0) : 0)}
        />
      )}
    </section>
  );
}
