"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImageUp } from "lucide-react";
import { studioControl, studioPrimaryAction, studioQuietAction } from "@/components/admin/studio/studio-page";
import { ProgressBar } from "@/components/ui/progress";
import { removeHomePhotoAction, uploadHomePhotoAction } from "@/app/admin/system/photo-actions";
import { preparePhoto, type PreparedPhoto } from "@/lib/media/photo-prepare";
import { PHOTO_ACCEPT, PHOTO_MESSAGES, PHOTO_UPLOAD_MAX_BYTES, type HomePhoto } from "@/lib/media/photo-rules";

/**
 * HOME-1 (129): Settings › "Home page photo" — the real Kanpur library (space only, no identifiable faces). Drag and
 * drop or choose (keyboard: the button); PNG / JPG / WebP only; resized in the browser, re-encoded on the server into
 * 1280 / 768 / 390 px copies. Alt text and the "no recognisable person" confirmation are required. One primary
 * ("Save photo"); remove is quiet and confirmed. Every action call is wrapped (a failure is inline, never the error
 * boundary — LOGO-P0b).
 */
async function guarded<T>(call: () => Promise<T>): Promise<T | { success: false; message: string }> {
  try {
    return await call();
  } catch {
    return { success: false, message: PHOTO_MESSAGES.failed };
  }
}
const failText = (r: { message?: string; error?: string }) => r.message || r.error || PHOTO_MESSAGES.failed;

export function HomePhotoPanel({ current }: { current: HomePhoto | null }) {
  const router = useRouter();
  const uid = useId();
  const input = useRef<HTMLInputElement>(null);
  const [prepared, setPrepared] = useState<Extract<PreparedPhoto, { ok: true }> | null>(null);
  const [alt, setAlt] = useState(current?.alt ?? "");
  const [noFaces, setNoFaces] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<null | "preparing" | "saving" | "removing">(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [dragging, setDragging] = useState(false);
  useEffect(() => () => { if (prepared) URL.revokeObjectURL(prepared.previewUrl); }, [prepared]);

  const choose = async (file: File | undefined | null) => {
    if (!file) return;
    setMsg(null);
    setBusy("preparing");
    const p = await preparePhoto(file).catch(() => ({ ok: false as const, message: PHOTO_MESSAGES.unreadable }));
    setBusy(null);
    if (!p.ok) {
      setPrepared(null);
      setMsg({ ok: false, text: p.message });
      return;
    }
    setPrepared(p);
  };

  const save = async () => {
    if (!prepared) return;
    if (prepared.blob.size > PHOTO_UPLOAD_MAX_BYTES) return setMsg({ ok: false, text: PHOTO_MESSAGES.tooLarge(prepared.blob.size) });
    if (alt.trim().length < 3) return setMsg({ ok: false, text: PHOTO_MESSAGES.altRequired });
    if (!noFaces) return setMsg({ ok: false, text: PHOTO_MESSAGES.facesRequired });
    const fd = new FormData();
    fd.set("file", new File([prepared.blob], prepared.blob.type === "image/webp" ? "photo.webp" : "photo.jpg", { type: prepared.blob.type }));
    fd.set("alt", alt.trim());
    fd.set("noFaces", "yes");
    setBusy("saving");
    setMsg(null);
    const r = await guarded(() => uploadHomePhotoAction(fd));
    setBusy(null);
    if (!r.success) return setMsg({ ok: false, text: failText(r as { message?: string; error?: string }) });
    setPrepared(null);
    setNoFaces(false);
    setMsg({ ok: true, text: "Photo saved. It now shows on the home page." });
    router.refresh();
  };

  const remove = async () => {
    setBusy("removing");
    setMsg(null);
    const r = await guarded(() => removeHomePhotoAction());
    setBusy(null);
    setConfirmRemove(false);
    if (!r.success) return setMsg({ ok: false, text: failText(r as { message?: string; error?: string }) });
    setMsg({ ok: true, text: "Photo removed. The home page shows the text only." });
    router.refresh();
  };

  const shown = prepared ? { src: prepared.previewUrl, w: prepared.width, h: prepared.height } : current ? { src: current.src, w: current.width, h: current.height } : null;
  return (
    <section aria-labelledby={`${uid}-title`} className="rounded-card border border-line bg-surface p-4" data-home-photo-panel="">
      <h2 id={`${uid}-title`} className="text-body font-semibold text-fg">
        Home page photo
      </h2>
      <p className="mt-1 text-[13px] text-fg-secondary">
        A real photo of the Kanpur library, shown next to &quot;Built by a real library in Kanpur&quot;. Space only: no person may be recognisable. Landscape, at least 1280 px wide; PNG, JPG or WebP.
      </p>
      <div
        className={`mt-3 flex flex-col items-center gap-2 rounded-card border-2 border-dashed px-4 py-6 text-center ${dragging ? "border-primary-600 bg-primary-50" : "border-line bg-ink-50"}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); void choose(e.dataTransfer.files?.[0]); }}
        data-home-photo-dropzone=""
      >
        <ImageUp aria-hidden="true" className="size-7 text-fg-secondary" />
        <p className="text-[14px] font-semibold text-fg">{current || prepared ? "Drag a new photo here to replace it" : "Drag the photo here"}</p>
        <button type="button" className={studioQuietAction} onClick={() => input.current?.click()} disabled={Boolean(busy)}>
          Choose a file
        </button>
        <input ref={input} type="file" accept={PHOTO_ACCEPT} className="sr-only" tabIndex={-1} aria-label="Photo file" onChange={(e) => { void choose(e.target.files?.[0]); e.target.value = ""; }} data-home-photo-input="" />
      </div>
      {busy === "preparing" && <ProgressBar label="Preparing the photo…" indeterminate showValue={false} className="mt-3" />}
      {shown && (
        <figure className="mt-3" data-home-photo-preview="">
          {/* eslint-disable-next-line @next/next/no-img-element -- a local preview / our own same-origin copy */}
          <img src={shown.src} alt="" width={shown.w} height={shown.h} className="h-auto w-full max-w-md rounded-card border border-line" />
          <figcaption className="mt-1 text-[13px] text-fg-secondary">{prepared ? `New photo, ${prepared.width} × ${prepared.height} (not saved yet).` : "The photo on the home page now."}</figcaption>
        </figure>
      )}
      <label className="mt-3 block text-[13px] font-semibold text-fg" htmlFor={`${uid}-alt`}>
        Alt text (read aloud by screen readers)
        <input id={`${uid}-alt`} value={alt} maxLength={200} onChange={(e) => setAlt(e.target.value)} className={`${studioControl} mt-1`} placeholder="Reading room of the Courage Library, Kanpur" data-home-photo-alt="" />
      </label>
      {prepared && (
        <label className="mt-2 flex min-h-12 items-center gap-2 text-[14px] font-semibold text-fg">
          <input type="checkbox" checked={noFaces} onChange={(e) => setNoFaces(e.target.checked)} className="size-5" data-home-photo-noface="" />
          No person can be recognised in this photo
        </label>
      )}
      {busy === "saving" && <ProgressBar label="Uploading the photo…" indeterminate showValue={false} className="mt-3" />}
      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={`mt-3 rounded-card border px-3 py-2 text-[13px] ${msg.ok ? "border-success-200 bg-success-50 text-success-800" : "border-danger-200 bg-danger-50 text-danger-800"}`} data-home-photo-msg="">
          {msg.text}
        </p>
      )}
      {confirmRemove && (
        <div role="alertdialog" aria-label="Remove the home page photo" className="mt-3 rounded-card border border-danger-200 bg-danger-50 p-3">
          <p className="text-[13px] font-semibold text-danger-800">Remove the photo? The home page shows the text only.</p>
          <div className="mt-2 flex gap-2">
            <button type="button" className={studioQuietAction} onClick={remove} disabled={busy === "removing"}>{busy === "removing" ? "Removing…" : "Remove photo"}</button>
            <button type="button" className={studioQuietAction} onClick={() => setConfirmRemove(false)}>Keep it</button>
          </div>
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
        {current && !confirmRemove && (
          <button type="button" className={`${studioQuietAction} mr-auto`} onClick={() => setConfirmRemove(true)} disabled={Boolean(busy)}>
            Remove photo
          </button>
        )}
        <button type="button" className={studioPrimaryAction} onClick={save} disabled={!prepared || !noFaces || alt.trim().length < 3 || Boolean(busy)} data-home-photo-save="">
          {busy === "saving" ? "Saving…" : "Save photo"}
        </button>
      </div>
    </section>
  );
}
