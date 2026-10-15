"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "./cn";

export type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  /**
   * modal: centred · sheet: bottom sheet on mobile, centred from md · fullscreen: console confirmations
   */
  variant?: "modal" | "sheet" | "fullscreen";
  /** false = Esc, backdrop click and the close button do nothing (e.g. "Submit test?" must be answered). */
  dismissible?: boolean;
  /** Buttons row; put the primary action last. */
  footer?: ReactNode;
  className?: string;
  children?: ReactNode;
};

/**
 * Native <dialog> opened with showModal(): the rest of the page becomes inert (focus is trapped and the
 * background is not reachable by screen readers); Esc closes unless `dismissible={false}`; focus returns
 * to the element that opened it; labelled by its title and described by its description.
 */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  variant = "modal",
  dismissible = true,
  footer,
  className,
  children,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  const uid = useId();
  const titleId = `${uid}-title`;
  const descId = `${uid}-desc`;

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      returnTo.current = document.activeElement as HTMLElement | null;
      d.showModal();
      document.documentElement.style.overflow = "hidden";
    } else if (!open && d.open) {
      d.close();
    }
  }, [open]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const onClose = () => {
      document.documentElement.style.overflow = "";
      returnTo.current?.focus?.();
      if (open) onOpenChange(false);
    };
    const onCancel = (e: Event) => {
      // Esc
      e.preventDefault();
      if (dismissible) onOpenChange(false);
    };
    d.addEventListener("close", onClose);
    d.addEventListener("cancel", onCancel);
    return () => {
      d.removeEventListener("close", onClose);
      d.removeEventListener("cancel", onCancel);
    };
  }, [open, dismissible, onOpenChange]);

  useEffect(() => () => {
    document.documentElement.style.overflow = "";
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onClick={(e) => {
        // A click on the dialog element itself (not its content) is a backdrop click.
        if (e.target === e.currentTarget && dismissible) onOpenChange(false);
      }}
      className={cn(
        "z-60 bg-transparent p-0 text-fg backdrop:bg-ink-950/50",
        variant === "modal" && "m-auto w-[calc(100%-2rem)] max-w-lg",
        variant === "sheet" && "mb-0 mt-auto w-full max-w-none md:m-auto md:w-[calc(100%-2rem)] md:max-w-lg",
        variant === "fullscreen" && "m-0 h-dvh max-h-none w-full max-w-none",
      )}
    >
      <div
        className={cn(
          "flex max-h-[85dvh] flex-col gap-4 overflow-y-auto bg-surface p-6 shadow-e3",
          variant === "modal" && "rounded-sheet",
          variant === "sheet" && "rounded-t-sheet pb-[max(1.5rem,env(safe-area-inset-bottom))] md:rounded-sheet",
          variant === "fullscreen" && "h-full max-h-none",
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h2 id={titleId} className="text-h3 font-semibold text-fg">
              {title}
            </h2>
            {description && (
              <p id={descId} className="text-body text-fg-secondary">
                {description}
              </p>
            )}
          </div>
          {dismissible && (
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label="Close"
              className="focus-ring -mr-2 -mt-2 inline-flex size-11 shrink-0 items-center justify-center rounded-control text-fg-secondary hover:bg-ink-100 hover:text-fg"
            >
              <X aria-hidden="true" className="size-5" />
            </button>
          )}
        </div>
        {children && <div className="text-body">{children}</div>}
        {footer && <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{footer}</div>}
      </div>
    </dialog>
  );
}
