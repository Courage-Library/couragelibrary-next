"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { studioControl, studioQuietAction } from "@/components/admin/studio/studio-page";
import { ExamLogoBadge } from "@/components/exams/exam-logo-badge";
import { createConductingOrgAction, removeOrgLogoAction, uploadOrgLogoAction } from "@/app/admin/exams/logo-actions";
import { examLogo } from "@/lib/logos/exam-logo";
import type { ConductingOrgItem } from "@/services/exam-onboarding/exam-onboarding.service";

/**
 * EXAM-LOGO-1: the conducting bodies and their official logos (uploaded ONCE per body; every exam of the body shows it).
 * Admins upload / replace / remove (the server re-encodes and audits); staff see the logos read-only. A new exam needs a
 * body with a logo, so a new body is added here and given its logo first.
 */
type Msg = { kind: "ok" | "error"; text: string } | null;
const failText = (r: { message?: string; error?: string }) => r.message || r.error || "Something went wrong.";

export function ConductingBodiesPanel({ orgs, canEdit }: { orgs: ConductingOrgItem[]; canEdit: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<Msg>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newSite, setNewSite] = useState("");
  const active = orgs.filter((o) => o.isActive);

  const upload = (org: ConductingOrgItem, form: HTMLFormElement) =>
    start(async () => {
      setMsg(null);
      const fd = new FormData(form);
      fd.set("id", org.id);
      const r = await uploadOrgLogoAction(fd);
      if (r.success) {
        setMsg({ kind: "ok", text: `${org.name}: logo saved.` });
        setEditing(null);
        router.refresh();
      } else setMsg({ kind: "error", text: failText(r) });
    });
  const remove = (org: ConductingOrgItem) =>
    start(async () => {
      setMsg(null);
      const r = await removeOrgLogoAction(org.id);
      setConfirmRemove(null);
      if (r.success) {
        setMsg({ kind: "ok", text: `${org.name}: logo removed.` });
        router.refresh();
      } else setMsg({ kind: "error", text: failText(r) });
    });
  const addBody = () =>
    start(async () => {
      setMsg(null);
      const r = await createConductingOrgAction(newName, newSite);
      if (r.success) {
        setMsg({ kind: "ok", text: `${newName.trim()} added: upload its official logo below.` });
        setNewName("");
        setNewSite("");
        setEditing(r.id);
        router.refresh();
      } else setMsg({ kind: "error", text: failText(r) });
    });

  return (
    <section id="conducting-bodies" aria-labelledby="conducting-bodies-title" className="mt-8 rounded-card border border-line bg-white p-5" data-conducting-bodies="">
      <h2 id="conducting-bodies-title" className="text-base font-semibold text-fg">
        Conducting bodies
      </h2>
      <p className="mt-1 text-[13px] text-fg-secondary">
        Every exam shows its conducting body&apos;s official logo. PNG, JPG or WebP, at least 256 × 256, at most 1 MB (no SVG). The image is re-encoded on upload.
      </p>
      {msg && (
        <p role="status" className={`mt-3 rounded-card px-3 py-2 text-[13px] ${msg.kind === "ok" ? "bg-emerald-50 text-emerald-900" : "bg-danger-50 text-danger-800"}`}>
          {msg.text}
        </p>
      )}
      <ul className="mt-4 divide-y divide-line" aria-label="Conducting bodies">
        {active.map((org) => {
          const logo = examLogo({ org: { path: org.logoPath ?? null, alt: org.logoAlt ?? null } });
          return (
            <li key={org.id} className="flex flex-wrap items-start gap-3 py-3" data-org={org.slug}>
              <ExamLogoBadge logo={logo} name={org.name} size="md" />
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold text-fg">{org.name}</p>
                <p className="text-[12px] text-fg-secondary">{logo ? `Alt text: ${org.logoAlt}` : <span className="font-semibold text-danger-800">Logo missing</span>}</p>
                {canEdit && editing === org.id && (
                  <form
                    className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
                    onSubmit={(e) => {
                      e.preventDefault();
                      upload(org, e.currentTarget);
                    }}
                  >
                    <label className="text-[12px] font-semibold text-fg">
                      Logo file
                      <input name="file" type="file" accept="image/png,image/jpeg,image/webp" required className={`${studioControl} mt-1 py-1.5`} />
                    </label>
                    <label className="text-[12px] font-semibold text-fg">
                      Alt text
                      <input name="alt" type="text" required minLength={3} maxLength={160} defaultValue={org.logoAlt || `${org.name} logo`} className={`${studioControl} mt-1`} />
                    </label>
                    <div className="flex gap-2">
                      <button type="submit" className={studioQuietAction} disabled={pending}>
                        {pending ? "Saving…" : "Save logo"}
                      </button>
                      <button type="button" className={studioQuietAction} onClick={() => setEditing(null)}>
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
              </div>
              {canEdit && editing !== org.id && (
                <div className="flex gap-2">
                  <button type="button" className={studioQuietAction} onClick={() => setEditing(org.id)} disabled={pending}>
                    {logo ? "Replace logo" : "Upload logo"}
                  </button>
                  {logo &&
                    (confirmRemove === org.id ? (
                      <>
                        <button type="button" className={studioQuietAction} onClick={() => remove(org)} disabled={pending}>
                          Confirm remove
                        </button>
                        <button type="button" className={studioQuietAction} onClick={() => setConfirmRemove(null)}>
                          Keep
                        </button>
                      </>
                    ) : (
                      <button type="button" className={studioQuietAction} onClick={() => setConfirmRemove(org.id)} disabled={pending}>
                        Remove
                      </button>
                    ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {canEdit && (
        <form
          className="mt-4 grid gap-2 border-t border-line pt-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            addBody();
          }}
        >
          <label className="text-[12px] font-semibold text-fg">
            New body (official name)
            <input value={newName} onChange={(e) => setNewName(e.target.value)} required minLength={3} maxLength={160} className={`${studioControl} mt-1`} placeholder="Institute of Banking Personnel Selection" />
          </label>
          <label className="text-[12px] font-semibold text-fg">
            Official website (optional)
            <input value={newSite} onChange={(e) => setNewSite(e.target.value)} type="url" className={`${studioControl} mt-1`} placeholder="https://" />
          </label>
          <button type="submit" className={studioQuietAction} disabled={pending || newName.trim().length < 3}>
            Add body
          </button>
        </form>
      )}
    </section>
  );
}
