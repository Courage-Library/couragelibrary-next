"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { studioQuietAction } from "@/components/admin/studio/studio-page";
import { LogoDrawer } from "@/components/admin/logos/logo-drawer";
import type { ExamLogo } from "@/lib/logos/exam-logo";

/**
 * EXAM-LOGO-1 + LOGO-UX-1: an exam's OWN logo (optional; wins over its conducting body's) — behind "Advanced", in the
 * same drawer as a body's logo. Admin only; same upload rules (resized in the browser, re-encoded, audited, alt text).
 */
export function ExamLogoOverride({ examId, examTitle, bodyName, current }: { examId: string; examTitle: string; bodyName: string; current: ExamLogo | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-1">
      <button type="button" className={`${studioQuietAction} px-0 text-[12px]`} onClick={() => setOpen(true)} data-exam-logo-advanced="">
        {current ? "Advanced: this exam uses its own logo" : "Advanced: use a different logo for this exam"}
      </button>
      {done && (
        <p role="status" className="text-[12px] text-success-800">
          {done}
        </p>
      )}
      {open && (
        <LogoDrawer
          open
          onClose={() => setOpen(false)}
          mode={{ kind: "EXAM", id: examId, name: examTitle, bodyName }}
          current={current}
          previewExamTitle={examTitle}
          canRemove
          onDone={(d) => {
            setOpen(false);
            setDone(d.action === "removed" ? `${examTitle} shows its body's logo again.` : `${examTitle} now shows its own logo.`);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
