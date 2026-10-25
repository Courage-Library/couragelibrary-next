"use client";

/**
 * F1: "Add to my exams" — reuses the existing goal action (app/mock-tests/actions addUserExamGoalAction). The amber
 * primary of the exam page in the "signed in, not following" state. Shows only fixed copy, never the action's text.
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
        variant="accent-on-light"
        disabled={pending}
        aria-busy={pending}
        onClick={() =>
          start(async () => {
            const r = await addUserExamGoalAction(examId).catch(() => ({ success: false }));
            setMsg(r && "success" in r && r.success ? EXAM_PAGE.cta.added : EXAM_PAGE.cta.addFailed);
            if (r && "success" in r && r.success) router.refresh();
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
