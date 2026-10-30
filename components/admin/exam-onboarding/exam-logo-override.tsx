"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { studioControl, studioQuietAction } from "@/components/admin/studio/studio-page";
import { removeExamLogoOverrideAction, uploadExamLogoOverrideAction } from "@/app/admin/exams/logo-actions";

/**
 * EXAM-LOGO-1: an exam's OWN logo (optional; wins over its conducting body's). Admin only; same upload rules
 * (re-encoded, audited, alt text required).
 */
export function ExamLogoOverride({ examId, examTitle, hasOverride }: { examId: string; examTitle: string; hasOverride: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const done = (r: { success: boolean; message?: string; error?: string }) => {
    if (r.success) {
      setOpen(false);
      setMsg(null);
      router.refresh();
    } else setMsg(r.message || r.error || "Something went wrong.");
  };
  if (!open) {
    return (
      <div className="flex gap-2">
        <button type="button" className={studioQuietAction} onClick={() => setOpen(true)}>
          {hasOverride ? "Replace exam logo" : "Exam's own logo"}
        </button>
        {hasOverride && (
          <button type="button" className={studioQuietAction} disabled={pending} onClick={() => start(async () => done(await removeExamLogoOverrideAction(examId)))}>
            Use the body&apos;s logo
          </button>
        )}
      </div>
    );
  }
  return (
    <form
      className="grid w-full gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        fd.set("id", examId);
        start(async () => done(await uploadExamLogoOverrideAction(fd)));
      }}
    >
      <label className="text-[12px] font-semibold text-fg">
        Logo file (PNG, JPG or WebP)
        <input name="file" type="file" accept="image/png,image/jpeg,image/webp" required className={`${studioControl} mt-1 py-1.5`} />
      </label>
      <label className="text-[12px] font-semibold text-fg">
        Alt text
        <input name="alt" type="text" required minLength={3} maxLength={160} defaultValue={`${examTitle} logo`} className={`${studioControl} mt-1`} />
      </label>
      {msg && (
        <p role="status" className="text-[12px] text-danger-800">
          {msg}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" className={studioQuietAction} disabled={pending}>
          {pending ? "Saving…" : "Save exam logo"}
        </button>
        <button type="button" className={studioQuietAction} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
