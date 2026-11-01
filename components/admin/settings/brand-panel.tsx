"use client";

import React, { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImageUp } from "lucide-react";
import { studioControl, studioPrimaryAction, studioQuietAction } from "@/components/admin/studio/studio-page";
import { removeBrandAssetAction, uploadBrandAssetAction } from "@/app/admin/system/brand-actions";
import { sniffLogoFormat } from "@/lib/logos/logo-sniff";
import { BRAND_ACCEPT, BRAND_KEYS, BRAND_MESSAGES, BRAND_SLOTS, BRAND_UPLOAD_MAX_BYTES, type BrandKey } from "@/lib/brand/brand-rules";

/**
 * HOME-1 brand settings (131): Settings › Brand — the header logo, the square mark (favicon / app icons) and the
 * optional footer logo. Each replaces the official logo (the default) once uploaded; removing one brings the default
 * back. PNG / JPG / WebP only (checked here and again on the server), alt text required. Every action call is wrapped
 * (a failure is inline, never the error boundary — LOGO-P0b).
 */
async function guarded<T>(call: () => Promise<T>): Promise<T | { success: false; message: string }> {
  try {
    return await call();
  } catch {
    return { success: false, message: BRAND_MESSAGES.failed };
  }
}
const failText = (r: { message?: string; error?: string }) => r.message || r.error || BRAND_MESSAGES.failed;

function BrandSlot({ slot, current }: { slot: BrandKey; current: { src: string; alt: string } | null }) {
  const router = useRouter();
  const uid = useId();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<{ blob: File; preview: string } | null>(null);
  const [alt, setAlt] = useState(current?.alt || "Courage Library");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirm, setConfirm] = useState(false);
  const meta = BRAND_SLOTS[slot];

  const choose = async (f: File | undefined | null) => {
    if (!f) return;
    setMsg(null);
    if (f.size > BRAND_UPLOAD_MAX_BYTES) return setMsg({ ok: false, text: BRAND_MESSAGES.tooLarge });
    if (!sniffLogoFormat(new Uint8Array(await f.slice(0, 16).arrayBuffer()))) return setMsg({ ok: false, text: BRAND_MESSAGES.notImage });
    setFile({ blob: f, preview: URL.createObjectURL(f) });
  };
  const save = async () => {
    if (!file) return;
    if (alt.trim().length < 3) return setMsg({ ok: false, text: BRAND_MESSAGES.altRequired });
    const fd = new FormData();
    fd.set("key", slot);
    fd.set("alt", alt.trim());
    fd.set("file", file.blob);
    setBusy(true);
    setMsg(null);
    const r = await guarded(() => uploadBrandAssetAction(fd));
    setBusy(false);
    if (!r.success) return setMsg({ ok: false, text: failText(r as { message?: string; error?: string }) });
    setFile(null);
    setMsg({ ok: true, text: "Saved. The site now uses this image." });
    router.refresh();
  };
  const remove = async () => {
    setBusy(true);
    setMsg(null);
    const r = await guarded(() => removeBrandAssetAction({ key: slot }));
    setBusy(false);
    setConfirm(false);
    if (!r.success) return setMsg({ ok: false, text: failText(r as { message?: string; error?: string }) });
    setMsg({ ok: true, text: "Removed. The site uses the official logo again." });
    router.refresh();
  };

  return (
    <li className="rounded-card border border-line p-3" data-brand-slot={slot}>
      <h3 className="text-[14px] font-semibold text-fg">{meta.title}</h3>
      <p className="mt-0.5 text-[13px] text-fg-secondary">{meta.help}</p>
      <div className={`mt-2 flex min-h-16 items-center justify-center rounded-control border border-line p-2 ${slot === "brand_footer_logo" ? "bg-ink-900" : "bg-surface"}`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- a local preview / our own same-origin copy */}
        <img src={file?.preview || current?.src || (slot === "brand_square_mark" ? "/brand/icon-192.png" : "/brand/mark-64.webp")} alt="" className="max-h-12 w-auto" />
        <span className="sr-only">{file ? "New image, not saved yet" : current ? "Uploaded image in use" : "The official logo (default) is in use"}</span>
      </div>
      <p className="mt-1 text-[13px] text-fg-secondary">{file ? "New image (not saved yet)." : current ? "Uploaded image in use." : "Default: the official logo."}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" className={studioQuietAction} onClick={() => input.current?.click()} disabled={busy}>
          <ImageUp aria-hidden="true" className="size-4" /> Choose a file
        </button>
        <input ref={input} type="file" accept={BRAND_ACCEPT} className="sr-only" tabIndex={-1} aria-label={`${meta.title} file`} onChange={(e) => { void choose(e.target.files?.[0]); e.target.value = ""; }} />
        {current && !confirm && (
          <button type="button" className={studioQuietAction} onClick={() => setConfirm(true)} disabled={busy}>
            Use the official logo again
          </button>
        )}
      </div>
      {confirm && (
        <div role="alertdialog" aria-label={`Remove the ${meta.title}`} className="mt-2 rounded-card border border-danger-200 bg-danger-50 p-3">
          <p className="text-[13px] font-semibold text-danger-800">Remove the uploaded image? The official logo is used again.</p>
          <div className="mt-2 flex gap-2">
            <button type="button" className={studioQuietAction} onClick={remove} disabled={busy}>Remove</button>
            <button type="button" className={studioQuietAction} onClick={() => setConfirm(false)}>Keep it</button>
          </div>
        </div>
      )}
      {file && (
        <>
          <label className="mt-2 block text-[13px] font-semibold text-fg" htmlFor={`${uid}-alt`}>
            Alt text
            <input id={`${uid}-alt`} value={alt} maxLength={120} onChange={(e) => setAlt(e.target.value)} className={`${studioControl} mt-1`} />
          </label>
          <div className="mt-2 flex justify-end">
            <button type="button" className={studioPrimaryAction} onClick={save} disabled={busy || alt.trim().length < 3}>
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </>
      )}
      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={`mt-2 rounded-card border px-3 py-2 text-[13px] ${msg.ok ? "border-success-200 bg-success-50 text-success-800" : "border-danger-200 bg-danger-50 text-danger-800"}`}>
          {msg.text}
        </p>
      )}
    </li>
  );
}

export function BrandPanel({ current }: { current: Partial<Record<BrandKey, { src: string; alt: string }>> }) {
  const uid = useId();
  return (
    <section aria-labelledby={`${uid}-title`} className="rounded-card border border-line bg-surface p-4" data-brand-panel="">
      <h2 id={`${uid}-title`} className="text-body font-semibold text-fg">
        Brand
      </h2>
      <p className="mt-1 text-[13px] text-fg-secondary">
        The official Courage Library logo is used everywhere by default. An uploaded image replaces it; the logo is never recoloured.
      </p>
      <ul className="mt-3 flex flex-col gap-3">
        {BRAND_KEYS.map((k) => (
          <BrandSlot key={k} slot={k} current={current[k] ?? null} />
        ))}
      </ul>
    </section>
  );
}
