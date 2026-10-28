import { CheckCircle2 } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { completeLessonFormAction } from "@/app/articles/actions";

/**
 * CA-5 / PERF-LESSON-1: lesson progress for a signed-in student on an unlocked lesson — a SERVER component with a plain
 * <form action> (progressive enhancement: works without JavaScript, ships no client code to the lesson page). Opening the
 * lesson records READING on the server (the article page); "Mark as complete" posts COMPLETED (never undone).
 */
export function LessonProgress({ documentId, language, pagePath, status }: { documentId: string; language: "en" | "hi"; pagePath: string; status: "NOT_STARTED" | "READING" | "COMPLETED" }) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-line pt-6" data-testid="lesson-progress">
      {status === "COMPLETED" ? (
        <p className="inline-flex items-center gap-2 text-body font-semibold text-success-700">
          <CheckCircle2 aria-hidden="true" className="size-5" /> Lesson completed
        </p>
      ) : (
        <form action={completeLessonFormAction}>
          <input type="hidden" name="documentId" value={documentId} />
          <input type="hidden" name="language" value={language} />
          <input type="hidden" name="pagePath" value={pagePath} />
          <button type="submit" className={buttonClasses({ variant: "secondary", size: "lg", className: "min-h-12" })}>
            Mark as complete
          </button>
        </form>
      )}
    </div>
  );
}
