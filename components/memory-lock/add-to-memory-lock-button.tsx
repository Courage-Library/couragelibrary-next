"use client";

/**
 * F5 "Add to Memory Lock" — a quiet secondary action on any question (never the primary, R4). Render it only when
 * the server says Memory Lock is on (MEMORY_LOCK_ENABLED). Fixed result copy; the state is announced politely.
 */
import { useState, useTransition } from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MEMORY_LOCK } from "@/content/memory-lock";
import { addToMemoryLockAction } from "@/app/memory-lock/actions";

export function AddToMemoryLockButton({ questionId, className }: { questionId: string; className?: string }) {
  const [code, setCode] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const done = code === "ADDED" || code === "ALREADY_ADDED";
  return (
    <span className="inline-flex flex-col gap-1" data-add-memory-lock="">
      <Button
        variant="ghost"
        size="md"
        className={className ?? "min-h-12"}
        disabled={pending || done}
        onClick={() =>
          start(async () => {
            setCode(await addToMemoryLockAction({ questionId }).catch(() => "FAILED" as const));
          })
        }
      >
        <Lock aria-hidden="true" className="size-4" />
        {done ? MEMORY_LOCK.added : MEMORY_LOCK.add}
      </Button>
      <span role="status" className="text-body-sm text-fg-secondary">
        {code && !done ? MEMORY_LOCK.addResults[code] ?? MEMORY_LOCK.addResults.FAILED : code === "ALREADY_ADDED" ? MEMORY_LOCK.addResults.ALREADY_ADDED : ""}
      </span>
    </span>
  );
}
