"use client";

import React, { useEffect, useRef } from "react";
import { X } from "lucide-react";

/**
 * Courage Studio drawer (phase 3): the "detail / edit" side panel of the list + drawer template. A native modal
 * <dialog> (focus trapped, Esc closes, background inert), labelled by its title, ≥ 44 px close button, scrolls on its
 * own. Opening / closing is controlled by the parent (`open` + `onClose`).
 */
export function StudioDrawer({ open, onClose, title, subtitle, children, footer, wide = false }: { open: boolean; onClose: () => void; title: string; subtitle?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useRef(`studio-drawer-${Math.random().toString(36).slice(2, 9)}`).current;
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className={`m-0 ml-auto h-dvh max-h-none ${wide ? "w-[min(56rem,100vw)]" : "w-[min(40rem,100vw)]"} bg-surface p-0 text-fg backdrop:bg-ink-950/50`}
      data-studio-drawer=""
    >
      {open && (
        <div className="flex h-full flex-col">
          <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
            <div className="min-w-0">
              <h2 id={titleId} className="text-[18px] font-bold text-fg">
                {title}
              </h2>
              {subtitle && <div className="mt-0.5 text-[13px] text-fg-secondary">{subtitle}</div>}
            </div>
            <button type="button" onClick={onClose} aria-label={`Close ${title}`} className="focus-ring inline-flex size-11 shrink-0 items-center justify-center rounded-control text-fg-secondary hover:bg-ink-50">
              <X aria-hidden="true" className="size-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}
