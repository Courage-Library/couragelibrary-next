"use client";

/**
 * F1: "Add to my exams" — the goal action (app/mock-tests/actions addUserExamGoalAction; F1-a: existing cycle only, max 3). The amber
 * primary of the exam page in the "signed in, not following" state. Shows fixed copy only (the action never returns
 * database text).
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PillButton } from "@/components/ui/pill-button";
import { EXAM_PAGE } from "@/content/exam-page";
import { addUserExamGoalAction } from "@/app/mock-tests/actions";

export function AddExamButton({ examId, label }: { examId: string; label: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-start gap-2">
      <PillButton
        variant="primary"
        disabled={pending}
        aria-busy={pending}
        onClick={() =>
          start(async () => {
            // the action returns fixed copy only (F1-a): "Added…", the 3-exam limit, or a generic failure
            const r = await addUserExamGoalAction(examId).catch(() => null);
            setMsg(r?.success ? EXAM_PAGE.cta.added : (r?.error ?? EXAM_PAGE.cta.addFailed));
            if (r?.success) router.refresh();
          })
        }
      >
        {pending ? EXAM_PAGE.cta.adding : label}
      </PillButton>
      <p role="status" aria-live="polite" className="text-body-sm text-fg-secondary">
        {msg}
      </p>
    </div>
  );
}
