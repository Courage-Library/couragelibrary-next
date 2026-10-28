"use client";

import { useEffect, useState, useTransition } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { saveLessonProgressAction } from "@/app/articles/actions";

/**
 * CA-5: lesson progress for a signed-in student on an unlocked lesson — opening the lesson records READING once;
 * "Mark as complete" records COMPLETED (never undone by reading again). Server-side the user is auth.uid().
 */
export function LessonProgress({ documentId, language, initialStatus }: { documentId: string; language: "en" | "hi"; initialStatus: "NOT_STARTED" | "READING" | "COMPLETED" }) {
  const [status, setStatus] = useState(initialStatus);
  const [pending, start] = useTransition();
  const [error, setError] = useState(false);

  useEffect(() => {
    if (initialStatus !== "NOT_STARTED") return;
    let live = true;
    saveLessonProgressAction({ documentId, language, status: "READING" }).then((r) => {
      if (live && r.ok) setStatus((s) => (s === "COMPLETED" ? s : r.status));
    });
    return () => {
      live = false;
    };
  }, [documentId, language, initialStatus]);

  const complete = () =>
    start(async () => {
      setError(false);
      const r = await saveLessonProgressAction({ documentId, language, status: "COMPLETED" });
      if (r.ok) setStatus("COMPLETED");
      else setError(true);
    });

  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-line pt-6" data-testid="lesson-progress">
      {status === "COMPLETED" ? (
        <p className="inline-flex items-center gap-2 text-body font-semibold text-success-700">
          <CheckCircle2 aria-hidden="true" className="size-5" /> Lesson completed
        </p>
      ) : (
        <Button variant="secondary" size="lg" className="min-h-12" onClick={complete} disabled={pending}>
          {pending ? "Saving…" : "Mark as complete"}
        </Button>
      )}
      <div role="status" aria-live="polite" className="text-body-sm text-danger-700">
        {error ? "Your progress could not be saved. Please try again." : null}
      </div>
    </div>
  );
}
