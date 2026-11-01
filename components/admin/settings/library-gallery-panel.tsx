"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ImageUp } from "lucide-react";
import { studioControl, studioPrimaryAction, studioQuietAction } from "@/components/admin/studio/studio-page";
import { ProgressBar } from "@/components/ui/progress";
import { addGalleryPhotoAction, moveGalleryPhotoAction, removeGalleryPhotoAction, updateGalleryPhotoAction } from "@/app/(site)/admin/system/photo-actions";
import { preparePhoto, type PreparedPhoto } from "@/lib/media/photo-prepare";
import { GALLERY_MAX, PEOPLE_BASIS, PHOTO_ACCEPT, PHOTO_MESSAGES, PHOTO_UPLOAD_MAX_BYTES, type GalleryPhoto, type PeopleBasis } from "@/lib/media/photo-rules";

/**
 * HOME-1 (130): Settings › "Library photos" — up to 6 real photos of the Kanpur library, in order (the first is the
 * large one on the home page). Drag and drop or choose (keyboard: the button); PNG / JPG / WebP only; resized in the
 * browser, re-encoded on the server into 1280 / 768 / 390 px copies. Alt text and the people basis (no recognisable
 * person, or written consent obtained) are required for every photo. One primary ("Add photo"); move / edit /
 * remove are quiet, remove is confirmed. Every action call is wrapped (a failure is inline, never the error boundary —
 * LOGO-P0b).
 */
async function guarded<T>(call: () => Promise<T>): Promise<T | { success: false; message: string }> {
  try {
    return await call();
  } catch {
    return { success: false, message: PHOTO_MESSAGES.failed };
  }
}
const failText = (r: { message?: string; error?: string }) => r.message || r.error || PHOTO_MESSAGES.failed;
type Msg = { ok: boolean; text: string } | null;

function BasisChoice({ name, value, onChange }: { name: string; value: PeopleBasis | null; onChange: (v: PeopleBasis) => void }) {
  return (
    <fieldset className="mt-2">
      <legend className="text-[13px] font-semibold text-fg">People in the photo</legend>
      {(Object.keys(PEOPLE_BASIS) as PeopleBasis[]).map((k) => (
        <label key={k} className="flex min-h-12 items-center gap-2 text-[14px] text-fg">
          <input type="radio" name={name} value={k} checked={value === k} onChange={() => onChange(k)} className="size-5" data-gallery-basis={k} />
          {PEOPLE_BASIS[k]}
        </label>
      ))}
    </fieldset>
  );
}

function GalleryItem({ photo, count, busy, run }: { photo: GalleryPhoto; count: number; busy: boolean; run: (call: () => Promise<unknown>, ok: string) => Promise<void> }) {
  const uid = useId();
  const [alt, setAlt] = useState(photo.alt);
  const [basis, setBasis] = useState<PeopleBasis>(photo.peopleBasis);
  const [confirm, setConfirm] = useState(false);
  const changed = alt.trim() !== photo.alt || basis !== photo.peopleBasis;
  return (
    <li className="flex flex-col gap-3 rounded-card border border-line p-3 sm:flex-row" data-gallery-item={photo.position}>
      {/* eslint-disable-next-line @next/next/no-img-element -- our own same-origin 390 px copy */}
      <img src={photo.src.replace(/\.webp$/, "-390.webp")} alt="" width={photo.width} height={photo.height} className="h-auto w-full rounded-card border border-line sm:w-48" />
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="text-[13px] font-semibold text-fg-secondary">{photo.position === 1 ? "Photo 1 (large on the home page)" : `Photo ${photo.position}`}</p>
        <label className="mt-1 block text-[13px] font-semibold text-fg" htmlFor={`${uid}-alt`}>
          Alt text
          <input id={`${uid}-alt`} value={alt} maxLength={200} onChange={(e) => setAlt(e.target.value)} className={`${studioControl} mt-1`} />
        </label>
        <BasisChoice name={`${uid}-basis`} value={basis} onChange={setBasis} />
        {confirm ? (
          <div role="alertdialog" aria-label={`Remove photo ${photo.position}`} className="mt-2 rounded-card border border-danger-200 bg-danger-50 p-3">
            <p className="text-[13px] font-semibold text-danger-800">Remove this photo from the home page?</p>
            <div className="mt-2 flex gap-2">
              <button type="button" className={studioQuietAction} disabled={busy} onClick={() => run(() => removeGalleryPhotoAction({ id: photo.id }), "Photo removed.")}>
                Remove photo
              </button>
              <button type="button" className={studioQuietAction} onClick={() => setConfirm(false)}>
                Keep it
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className={studioQuietAction} disabled={busy || photo.position === 1} aria-label={`Move photo ${photo.position} up`} onClick={() => run(() => moveGalleryPhotoAction({ id: photo.id, position: photo.position - 1 }), "Order saved.")}>
              <ArrowUp aria-hidden="true" className="size-4" /> Up
            </button>
            <button type="button" className={studioQuietAction} disabled={busy || photo.position === count} aria-label={`Move photo ${photo.position} down`} onClick={() => run(() => moveGalleryPhotoAction({ id: photo.id, position: photo.position + 1 }), "Order saved.")}>
              <ArrowDown aria-hidden="true" className="size-4" /> Down
            </button>
            <button type="button" className={studioQuietAction} disabled={busy || !changed || alt.trim().length < 3} onClick={() => run(() => updateGalleryPhotoAction({ id: photo.id, alt: alt.trim(), peopleBasis: basis }), "Photo details saved.")}>
              Save details
            </button>
            <button type="button" className={`${studioQuietAction} ml-auto`} disabled={busy} onClick={() => setConfirm(true)}>
              Remove
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

export function LibraryGalleryPanel({ photos }: { photos: GalleryPhoto[] }) {
  const router = useRouter();
  const uid = useId();
  const input = useRef<HTMLInputElement>(null);
  const [prepared, setPrepared] = useState<Extract<PreparedPhoto, { ok: true }> | null>(null);
  const [alt, setAlt] = useState("");
  const [basis, setBasis] = useState<PeopleBasis | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState<null | "preparing" | "saving" | "working">(null);
  const [dragging, setDragging] = useState(false);
  useEffect(() => () => { if (prepared) URL.revokeObjectURL(prepared.previewUrl); }, [prepared]);
  const full = photos.length >= GALLERY_MAX;

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

  const add = async () => {
    if (!prepared) return;
    if (prepared.blob.size > PHOTO_UPLOAD_MAX_BYTES) return setMsg({ ok: false, text: PHOTO_MESSAGES.tooLarge(prepared.blob.size) });
    if (alt.trim().length < 3) return setMsg({ ok: false, text: PHOTO_MESSAGES.altRequired });
    if (!basis) return setMsg({ ok: false, text: PHOTO_MESSAGES.facesRequired });
    const fd = new FormData();
    fd.set("file", new File([prepared.blob], prepared.blob.type === "image/webp" ? "photo.webp" : "photo.jpg", { type: prepared.blob.type }));
    fd.set("alt", alt.trim());
    fd.set("peopleBasis", basis);
    setBusy("saving");
    setMsg(null);
    const r = await guarded(() => addGalleryPhotoAction(fd));
    setBusy(null);
    if (!r.success) return setMsg({ ok: false, text: failText(r as { message?: string; error?: string }) });
    setPrepared(null);
    setAlt("");
    setBasis(null);
    setMsg({ ok: true, text: "Photo added. It now shows on the home page." });
    router.refresh();
  };

  const run = async (call: () => Promise<unknown>, okText: string) => {
    setBusy("working");
    setMsg(null);
    const r = (await guarded(call as () => Promise<{ success: boolean; message?: string; error?: string }>)) as { success: boolean; message?: string; error?: string };
    setBusy(null);
    if (!r.success) return setMsg({ ok: false, text: failText(r) });
    setMsg({ ok: true, text: okText });
    router.refresh();
  };

  return (
    <section aria-labelledby={`${uid}-title`} className="rounded-card border border-line bg-surface p-4" data-gallery-panel="">
      <h2 id={`${uid}-title`} className="text-body font-semibold text-fg">
        Library photos ({photos.length} of {GALLERY_MAX})
      </h2>
      <p className="mt-1 text-[13px] text-fg-secondary">
        Real photos of the Kanpur library for &quot;Built by a real library in Kanpur&quot; on the home page. The first photo is shown large. No stock photos and no AI images. Landscape, at least 1280 px wide; PNG, JPG or WebP.
      </p>
      {photos.length > 0 && (
        <ol className="mt-3 flex flex-col gap-3" aria-label="Photos in home page order">
          {photos.map((p) => (
            <GalleryItem key={`${p.id}-${p.position}-${p.alt}-${p.peopleBasis}`} photo={p} count={photos.length} busy={Boolean(busy)} run={run} />
          ))}
        </ol>
      )}
      {full ? (
        <p className="mt-3 text-[13px] text-fg-secondary" data-gallery-full="">
          {PHOTO_MESSAGES.galleryFull}
        </p>
      ) : (
        <>
          <div
            className={`mt-3 flex flex-col items-center gap-2 rounded-card border-2 border-dashed px-4 py-6 text-center ${dragging ? "border-primary-600 bg-primary-50" : "border-line bg-ink-50"}`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); void choose(e.dataTransfer.files?.[0]); }}
            data-gallery-dropzone=""
          >
            <ImageUp aria-hidden="true" className="size-7 text-fg-secondary" />
            <p className="text-[14px] font-semibold text-fg">Drag a photo here to add it</p>
            <button type="button" className={studioQuietAction} onClick={() => input.current?.click()} disabled={Boolean(busy)}>
              Choose a file
            </button>
            <input ref={input} type="file" accept={PHOTO_ACCEPT} className="sr-only" tabIndex={-1} aria-label="Photo file" onChange={(e) => { void choose(e.target.files?.[0]); e.target.value = ""; }} data-gallery-input="" />
          </div>
          {busy === "preparing" && <ProgressBar label="Preparing the photo…" indeterminate showValue={false} className="mt-3" />}
          {prepared && (
            <div className="mt-3" data-gallery-new="">
              <figure data-gallery-preview="">
                {/* eslint-disable-next-line @next/next/no-img-element -- a local preview */}
                <img src={prepared.previewUrl} alt="" width={prepared.width} height={prepared.height} className="h-auto w-full max-w-md rounded-card border border-line" />
                <figcaption className="mt-1 text-[13px] text-fg-secondary">{`New photo, ${prepared.width} × ${prepared.height} (not saved yet).`}</figcaption>
              </figure>
              <label className="mt-3 block text-[13px] font-semibold text-fg" htmlFor={`${uid}-alt`}>
                Alt text (read aloud by screen readers)
                <input id={`${uid}-alt`} value={alt} maxLength={200} onChange={(e) => setAlt(e.target.value)} className={`${studioControl} mt-1`} placeholder="Reading room of the Courage Library, Kanpur" data-gallery-alt="" />
              </label>
              <BasisChoice name={`${uid}-basis`} value={basis} onChange={setBasis} />
            </div>
          )}
          {busy === "saving" && <ProgressBar label="Uploading the photo…" indeterminate showValue={false} className="mt-3" />}
        </>
      )}
      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={`mt-3 rounded-card border px-3 py-2 text-[13px] ${msg.ok ? "border-success-200 bg-success-50 text-success-800" : "border-danger-200 bg-danger-50 text-danger-800"}`} data-gallery-msg="">
          {msg.text}
        </p>
      )}
      {!full && (
        <div className="mt-3 flex justify-end">
          <button type="button" className={studioPrimaryAction} onClick={add} disabled={!prepared || !basis || alt.trim().length < 3 || Boolean(busy)} data-gallery-save="">
            {busy === "saving" ? "Adding…" : "Add photo"}
          </button>
        </div>
      )}
    </section>
  );
}
