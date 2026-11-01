"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import { ImageUp } from "lucide-react";
import { StudioDrawer } from "@/components/admin/studio/studio-drawer";
import { studioControl, studioPrimaryAction, studioQuietAction } from "@/components/admin/studio/studio-page";
import { ExamLogoBadge } from "@/components/exams/exam-logo-badge";
import { ProgressBar } from "@/components/ui/progress";
import { createConductingOrgWithLogoAction, removeCategoryIconAction, removeExamLogoOverrideAction, removeOrgLogoAction, uploadCategoryIconAction, uploadExamLogoOverrideAction, uploadOrgLogoAction } from "@/app/admin/exams/logo-actions";
import { prepareLogo, type PreparedLogo } from "@/lib/logos/logo-prepare";
import { LOGO_ACCEPT, LOGO_MESSAGES, altProblem, bodySlug, formatSize, uploadSizeProblem } from "@/lib/logos/logo-upload-guard";
import type { ExamLogo } from "@/lib/logos/exam-logo";

/**
 * LOGO-UX-1 (owner 2026-10-31): THE logo editor — a body's logo, an exam's own logo (advanced) and a new body with its
 * logo all use this drawer. Drag and drop or choose a file (keyboard: the "Choose a file" button); PNG / JPG / WebP only.
 * The browser resizes / pads the image to 512 × 512 BEFORE upload (lib/logos/logo-prepare.ts), so the request stays
 * small; the server still sniffs, validates and re-encodes. Live preview at the real placements (hub 48, card 32, admin
 * row 28). One primary ("Save logo" / "Add body"); remove is quiet and confirmed. Every action call is wrapped: a failed
 * request (413, network, server error) is an inline "nothing was saved", never the page's error boundary (LOGO-P0b).
 */
export type LogoDrawerMode = { kind: "ORG"; id: string; name: string } | { kind: "EXAM"; id: string; name: string; bodyName: string } | { kind: "NEW_BODY" } | { kind: "CATEGORY"; id: string; name: string };
export type LogoDrawerDone = { action: "saved" | "removed" | "created"; name: string };

type Failure = { success: false; message?: string; error?: string };
/** any thrown action call (413, network, server error) becomes an ordinary failure */
async function guarded<T extends { success: boolean }>(call: () => Promise<T>): Promise<T | Failure> {
  try {
    return await call();
  } catch {
    return { success: false, message: LOGO_MESSAGES.failed };
  }
}
const failText = (r: Failure) => r.message || r.error || LOGO_MESSAGES.failed;

export function LogoDrawer({
  open,
  onClose,
  mode,
  current,
  previewExamTitle,
  canRemove,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  mode: LogoDrawerMode;
  current: ExamLogo | null;
  previewExamTitle: string;
  canRemove: boolean;
  onDone: (d: LogoDrawerDone) => void;
}) {
  const uid = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const ownerName = mode.kind === "NEW_BODY" ? name.trim() : mode.name;
  const [alt, setAlt] = useState("");
  const [altTouched, setAltTouched] = useState(false);
  const [prepared, setPrepared] = useState<Extract<PreparedLogo, { ok: true }> | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "preparing" | "saving" | "removing">(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [dragging, setDragging] = useState(false);

  // a fresh drawer each time it opens
  useEffect(() => {
    if (!open) return;
    setName("");
    setWebsite("");
    setAlt(current?.alt || "");
    setAltTouched(Boolean(current?.alt));
    setPrepared(null);
    setFileError(null);
    setError(null);
    setBusy(null);
    setConfirmRemove(false);
  }, [open, current?.alt]);
  useEffect(() => () => { if (prepared) URL.revokeObjectURL(prepared.previewUrl); }, [prepared]);
  const altValue = altTouched ? alt : ownerName ? `${ownerName} logo` : "";

  const choose = async (file: File | undefined | null) => {
    if (!file) return;
    setError(null);
    setFileError(null);
    setBusy("preparing");
    const p = await prepareLogo(file).catch(() => ({ ok: false as const, message: LOGO_MESSAGES.unreadable }));
    setBusy(null);
    if (!p.ok) {
      setPrepared(null);
      setFileError(p.message);
      return;
    }
    setPrepared(p);
  };

  const nameProblem = mode.kind === "NEW_BODY" && (name.trim().length < 3 || /[,()]/.test(name)) ? "Use the body's official name (3 to 160 characters, no commas or brackets)." : null;
  const siteProblem = mode.kind === "NEW_BODY" && website.trim() && !/^https:\/\/\S+$/.test(website.trim()) ? "The website must start with https://." : null;
  const canSave = Boolean(prepared) && !altProblem(altValue) && !nameProblem && !siteProblem && !busy;

  const save = async () => {
    if (!prepared) return;
    setError(null);
    // the bytes actually sent: over 1 MB → refused here, nothing is sent
    const tooBig = uploadSizeProblem(prepared.blob.size);
    if (tooBig) {
      setFileError(tooBig);
      return;
    }
    const a = altProblem(altValue);
    if (a) {
      setError(a);
      return;
    }
    const fd = new FormData();
    fd.set("file", new File([prepared.blob], prepared.blob.type === "image/png" ? "logo.png" : "logo.webp", { type: prepared.blob.type }));
    fd.set("alt", altValue.trim());
    setBusy("saving");
    let r;
    if (mode.kind === "NEW_BODY") {
      fd.set("name", name.trim());
      fd.set("website", website.trim());
      r = await guarded(() => createConductingOrgWithLogoAction(fd));
    } else {
      fd.set("id", mode.id);
      r = await guarded(() => (mode.kind === "ORG" ? uploadOrgLogoAction(fd) : mode.kind === "CATEGORY" ? uploadCategoryIconAction(fd) : uploadExamLogoOverrideAction(fd)));
    }
    setBusy(null);
    if (!r.success) {
      setError(failText(r as Failure));
      return;
    }
    onDone({ action: mode.kind === "NEW_BODY" ? "created" : "saved", name: ownerName });
  };

  const remove = async () => {
    if (mode.kind === "NEW_BODY") return;
    setError(null);
    setBusy("removing");
    const r = await guarded(() => (mode.kind === "ORG" ? removeOrgLogoAction(mode.id) : mode.kind === "CATEGORY" ? removeCategoryIconAction(mode.id) : removeExamLogoOverrideAction(mode.id)));
    setBusy(null);
    setConfirmRemove(false);
    if (!r.success) {
      setError(failText(r as Failure));
      return;
    }
    onDone({ action: "removed", name: ownerName });
  };

  const shown: ExamLogo | null = prepared ? { src: prepared.previewUrl, alt: altValue || "Logo preview" } : current;
  const bodyForTile = mode.kind === "EXAM" ? mode.bodyName : ownerName || "New body";
  const title = mode.kind === "NEW_BODY" ? "Add a conducting body" : mode.kind === "EXAM" ? `Exam's own logo: ${mode.name}` : mode.kind === "CATEGORY" ? `${mode.name} icon` : `${mode.name} logo`;
  const primaryLabel = mode.kind === "NEW_BODY" ? "Add body" : "Save logo";

  return (
    <StudioDrawer
      open={open}
      onClose={onClose}
      title={title}
      subtitle={mode.kind === "EXAM" ? "Advanced: this exam shows its own logo instead of its body's." : mode.kind === "CATEGORY" ? "Replaces the built-in line icon on the home tile and the category page." : "Every exam of the body shows this logo, before the exam's name."}
      footer={
        <>
          {canRemove && current && mode.kind !== "NEW_BODY" && !confirmRemove && (
            <button type="button" className={`${studioQuietAction} mr-auto`} onClick={() => setConfirmRemove(true)} disabled={Boolean(busy)}>
              {mode.kind === "EXAM" ? "Use the body's logo" : "Remove logo"}
            </button>
          )}
          <button type="button" className={studioQuietAction} onClick={onClose} disabled={busy === "saving"}>
            Cancel
          </button>
          <button type="button" className={studioPrimaryAction} onClick={save} disabled={!canSave} data-logo-save="">
            {busy === "saving" ? "Saving…" : primaryLabel}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-5" data-logo-drawer={mode.kind}>
        {mode.kind === "NEW_BODY" && (
          <div className="grid gap-3">
            <label className="text-[13px] font-semibold text-fg" htmlFor={`${uid}-name`}>
              Official name
              <input id={`${uid}-name`} value={name} onChange={(e) => setName(e.target.value)} maxLength={160} className={`${studioControl} mt-1`} placeholder="Institute of Banking Personnel Selection" aria-describedby={`${uid}-slug`} />
            </label>
            <p id={`${uid}-slug`} className="-mt-2 text-[12px] text-fg-secondary">
              Short name (set automatically): <span className="font-mono">{bodySlug(name) || "…"}</span>
            </p>
            <label className="text-[13px] font-semibold text-fg" htmlFor={`${uid}-site`}>
              Official website (optional)
              <input id={`${uid}-site`} value={website} onChange={(e) => setWebsite(e.target.value)} type="url" className={`${studioControl} mt-1`} placeholder="https://" />
            </label>
            {name && nameProblem && <p className="text-[12px] text-danger-800">{nameProblem}</p>}
            {siteProblem && <p className="text-[12px] text-danger-800">{siteProblem}</p>}
          </div>
        )}

        {confirmRemove && (
          <div role="alertdialog" aria-labelledby={`${uid}-rm`} className="rounded-card border border-danger-200 bg-danger-50 p-3">
            <p id={`${uid}-rm`} className="text-[13px] font-semibold text-danger-800">
              {mode.kind === "EXAM" ? "Stop using this exam's own logo? It will show its body's logo again." : mode.kind === "CATEGORY" ? "Remove this icon? The category shows its built-in line icon again." : "Remove this logo? Its exams will show initials until a new logo is saved."}
            </p>
            <div className="mt-2 flex gap-2">
              <button type="button" className={studioQuietAction} onClick={remove} disabled={busy === "removing"} data-logo-remove-confirm="">
                {busy === "removing" ? "Removing…" : mode.kind === "EXAM" ? "Use the body's logo" : "Remove logo"}
              </button>
              <button type="button" className={studioQuietAction} onClick={() => setConfirmRemove(false)}>
                Keep it
              </button>
            </div>
          </div>
        )}

        <div
          className={`flex flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed px-4 py-8 text-center ${dragging ? "border-primary-600 bg-primary-50" : "border-line bg-ink-50"}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void choose(e.dataTransfer.files?.[0]);
          }}
          data-logo-dropzone=""
        >
          <ImageUp aria-hidden="true" className="size-8 text-fg-secondary" />
          <p className="text-[14px] font-semibold text-fg">{current ? "Drag a new logo here to replace it" : prepared ? "Drag a different logo here" : "Drag the official logo here"}</p>
          <p className="text-[12px] text-fg-secondary">PNG, JPG or WebP, at least 256 × 256. It is resized to 512 × 512 before upload.</p>
          <button type="button" className={studioQuietAction} onClick={() => inputRef.current?.click()} disabled={Boolean(busy)}>
            Choose a file
          </button>
          <input
            ref={inputRef}
            type="file"
            accept={LOGO_ACCEPT}
            className="sr-only"
            tabIndex={-1}
            aria-label="Logo file"
            onChange={(e) => {
              void choose(e.target.files?.[0]);
              e.target.value = "";
            }}
            data-logo-input=""
          />
        </div>
        {fileError && (
          <p role="alert" className="-mt-3 text-[13px] font-semibold text-danger-800" data-logo-file-error="">
            {fileError}
          </p>
        )}
        {busy === "preparing" && <ProgressBar label="Preparing the image…" indeterminate showValue={false} />}

        <section aria-label="Preview" className="rounded-card border border-line bg-white p-4" data-logo-preview="">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-fg-secondary">Preview</p>
          {prepared && (
            <p className="mt-1 text-[12px] text-fg-secondary" data-logo-prepared="">
              Resized to 512 × 512, {formatSize(prepared.bytes)} (original {prepared.sourceWidth} × {prepared.sourceHeight}, {formatSize(prepared.sourceBytes)}).
            </p>
          )}
          {mode.kind === "CATEGORY" ? (
            <div className="mt-3 flex flex-wrap items-center gap-4">
              <div className="flex w-36 flex-col items-center gap-2 rounded-card border border-line px-3 py-4" data-preview-placement="tile">
                <ExamLogoBadge logo={shown} name={mode.name} size="tile" priority />
                <span className="text-[15px] font-semibold text-fg">{mode.name}</span>
              </div>
              <div className="flex items-center gap-3" data-preview-placement="category-page">
                <ExamLogoBadge logo={shown} name={mode.name} size="md" priority />
                <span className="text-[22px] font-bold text-fg">{mode.name} exams</span>
              </div>
            </div>
          ) : (
          <div className="mt-3 flex flex-col gap-3">
            <div className="flex items-center gap-3" data-preview-placement="hub">
              <ExamLogoBadge logo={shown} name={bodyForTile} size="md" priority />
              <span className="text-[22px] font-bold text-fg">{previewExamTitle}</span>
            </div>
            <div className="flex w-fit items-center gap-3 rounded-card border border-line px-3 py-2" data-preview-placement="card">
              <ExamLogoBadge logo={shown} name={bodyForTile} size="sm" priority />
              <span className="text-[15px] font-semibold text-fg">{previewExamTitle}</span>
            </div>
            <div className="flex items-center gap-2" data-preview-placement="admin">
              <ExamLogoBadge logo={shown} name={bodyForTile} size="xs" priority />
              <span className="text-[13px] font-bold text-fg">{previewExamTitle}</span>
            </div>
          </div>
          )}
        </section>

        <label className="text-[13px] font-semibold text-fg" htmlFor={`${uid}-alt`}>
          Alt text (read aloud by screen readers)
          <input
            id={`${uid}-alt`}
            value={altValue}
            onChange={(e) => {
              setAltTouched(true);
              setAlt(e.target.value);
            }}
            maxLength={160}
            required
            className={`${studioControl} mt-1`}
            data-logo-alt=""
          />
        </label>

        {busy === "saving" && <ProgressBar label="Uploading the logo…" indeterminate showValue={false} />}
        {error && (
          <p role="alert" className="rounded-card border border-danger-200 bg-danger-50 px-3 py-2 text-[13px] text-danger-800" data-logo-error="">
            {error}
          </p>
        )}
      </div>
    </StudioDrawer>
  );
}
