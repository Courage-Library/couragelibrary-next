"use client";

import React, { useCallback, useRef, useState } from "react";
import { studioPrimaryAction } from "@/components/admin/studio/studio-page";

/**
 * GEN-CHECK-1: the "Check" of every paste screen (lesson generator, translation, syllabus intake). The check runs only
 * after the click (never per keystroke), shows a busy state, catches ANY exception and shows it, and always brings its
 * result into view: the result region scrolls into view, takes focus and is announced (aria-live).
 */
export function usePasteCheck(onException: (message: string) => void) {
  const [busy, setBusy] = useState(false);
  const regionRef = useRef<HTMLDivElement | null>(null);
  const run = useCallback(
    (fn: () => void) => {
      setBusy(true);
      // let the "Checking…" state paint before a big paste is parsed
      window.setTimeout(() => {
        try {
          fn();
        } catch (e) {
          onException(`The check failed unexpectedly (${e instanceof Error ? e.message : String(e)}). Nothing was saved; try again or paste the answer in parts.`);
        } finally {
          setBusy(false);
          window.setTimeout(() => {
            const el = regionRef.current;
            if (el) {
              el.scrollIntoView({ block: "start", behavior: "smooth" });
              el.focus({ preventScroll: true });
            }
          }, 30);
        }
      }, 20);
    },
    [onException]
  );
  return { busy, run, regionRef };
}

/** The step's ONE primary action (R4): a real button with a busy state. */
export function CheckButton({ busy, disabled, onClick, label = "Check" }: { busy: boolean; disabled?: boolean; onClick: () => void; label?: string }) {
  return (
    <button type="button" className={studioPrimaryAction} onClick={onClick} disabled={busy || disabled} aria-busy={busy}>
      {busy ? "Checking…" : label}
    </button>
  );
}

/** Where every check result lands: focusable, announced. */
export function CheckRegion({ regionRef, children }: { regionRef: React.RefObject<HTMLDivElement | null>; children: React.ReactNode }) {
  return (
    <div ref={regionRef} tabIndex={-1} role="region" aria-label="Check result" aria-live="polite" className="scroll-mt-24 outline-none focus-visible:ring-2 focus-visible:ring-primary-500">
      {children}
    </div>
  );
}

/** The notice / error list of a check (extraction notice, line:column, block id + field). */
export function CheckProblems<E extends { path: string; message: string }>({ notice, errors, title, action }: { notice?: string | null; errors: E[]; title: string; action?: (e: E, i: number) => React.ReactNode }) {
  return (
    <>
      {notice && <p className="mt-3 rounded-card border border-line bg-ink-50 px-4 py-2 text-[13px] text-fg">{notice}</p>}
      {errors.length > 0 && (
        <div className="mt-3 rounded-card border border-danger-200 bg-danger-50 px-4 py-3 text-[13px] text-danger-800">
          <p className="font-semibold">{title}</p>
          <ul className="mt-1 space-y-1" aria-label={title}>
            {errors.slice(0, 30).map((e, i) => (
              <li key={i}>
                <span className="font-mono">{e.path}</span> — {e.message}
                {action ? action(e, i) : null}
              </li>
            ))}
          </ul>
          {errors.length > 30 && <p className="mt-1">…and {errors.length - 30} more.</p>}
        </div>
      )}
    </>
  );
}
