"use client";

/**
 * F5 "Add to Memory Lock" — a quiet secondary action on any question (never the primary, R4). Render it only when
 * the server says Memory Lock is on (MEMORY_LOCK_ENABLED). Fixed result copy; the state is announced politely.
 */
import { useState, useTransition } from "react";
import { BrandIcon } from "@/components/icons/brand-icon";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { MEMORY_LOCK } from "@/content/memory-lock";
import { addToMemoryLockAction } from "@/app/(site)/memory-lock/actions";

/** RESULT-UX-1: `iconOnly` = the same action as a 44 px icon button (aria-label + tooltip, aria-pressed once added);
 *  the default text button and the add flow are unchanged. */
export function AddToMemoryLockButton({ questionId, className, iconOnly = false }: { questionId: string; className?: string; iconOnly?: boolean }) {
  const [code, setCode] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const done = code === "ADDED" || code === "ALREADY_ADDED";
  const add = () =>
    start(async () => {
      setCode(await addToMemoryLockAction({ questionId }).catch(() => "FAILED" as const));
    });
  if (iconOnly) {
    const label = done ? MEMORY_LOCK.added : MEMORY_LOCK.add;
    return (
      <span className="relative inline-flex" data-add-memory-lock="">
        <Tooltip content={label} side="top">
          <button type="button" aria-label={label} aria-pressed={done} disabled={pending || done} onClick={add} className={className}>
            <BrandIcon name="memory-lock" size={18} />
          </button>
        </Tooltip>
        <span role="status" className="sr-only">
          {code && !done ? MEMORY_LOCK.addResults[code] ?? MEMORY_LOCK.addResults.FAILED : done ? label : ""}
        </span>
      </span>
    );
  }
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
        <BrandIcon name="memory-lock" size={18} className="-mx-px" />
        {done ? MEMORY_LOCK.added : MEMORY_LOCK.add}
      </Button>
      <span role="status" className="text-body-sm text-fg-secondary">
        {code && !done ? MEMORY_LOCK.addResults[code] ?? MEMORY_LOCK.addResults.FAILED : code === "ALREADY_ADDED" ? MEMORY_LOCK.addResults.ALREADY_ADDED : ""}
      </span>
    </span>
  );
}
