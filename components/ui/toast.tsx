"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, Info, X, XCircle } from "lucide-react";
import { cn } from "./cn";

export type ToastTone = "success" | "error" | "info";
export type ToastInput = {
  tone?: ToastTone;
  title: string;
  description?: string;
  /** Defaults: errors stay until dismissed; others auto-dismiss after 5 s (paused on hover / focus). */
  persistent?: boolean;
};
type ToastItem = ToastInput & { id: number };

const ToastContext = createContext<{ show: (t: ToastInput) => void } | null>(null);

/** Never the only feedback for a critical action: pair with inline state. */
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

const TONES = {
  success: { Icon: CheckCircle2, icon: "text-success-700", label: "Success" },
  error: { Icon: XCircle, icon: "text-danger-700", label: "Error" },
  info: { Icon: Info, icon: "text-info-700", label: "Information" },
};

function ToastCard({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: number) => void }) {
  const tone = toast.tone ?? "info";
  const persistent = toast.persistent ?? tone === "error";
  const [paused, setPaused] = useState(false);
  const remaining = useRef(5000);
  const started = useRef(0);

  useEffect(() => {
    if (persistent || paused) return;
    started.current = Date.now();
    const t = setTimeout(() => onDismiss(toast.id), remaining.current);
    return () => {
      clearTimeout(t);
      remaining.current -= Date.now() - started.current;
    };
  }, [persistent, paused, onDismiss, toast.id]);

  const T = TONES[tone];
  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="pointer-events-auto flex items-start gap-3 rounded-card border border-line bg-surface p-4 text-fg shadow-e2"
    >
      <T.Icon aria-hidden="true" className={cn("mt-0.5 size-5 shrink-0", T.icon)} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="text-body-sm font-semibold">
          <span className="sr-only">{T.label}: </span>
          {toast.title}
        </p>
        {toast.description && <p className="text-body-sm text-fg-secondary">{toast.description}</p>}
      </div>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss notification"
        className="focus-ring -m-1 inline-flex size-8 shrink-0 items-center justify-center rounded-control text-fg-secondary hover:bg-ink-100"
      >
        <X aria-hidden="true" className="size-4" />
      </button>
    </div>
  );
}

/**
 * Mount once near the root. Two live regions exist before any toast appears (so announcements are
 * reliable): polite role="status" for success / info, assertive role="alert" for errors.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const show = useCallback((t: ToastInput) => setItems((cur) => [...cur, { ...t, id: nextId.current++ }]), []);
  const dismiss = useCallback((id: number) => setItems((cur) => cur.filter((x) => x.id !== id)), []);
  const polite = items.filter((t) => (t.tone ?? "info") !== "error");
  const assertive = items.filter((t) => t.tone === "error");
  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {/* BRAND-3 fix 4: below lg the student tab bar (4rem + 1px + safe area) owns the bottom edge — toasts sit above it */}
      <div className="pointer-events-none fixed inset-x-4 bottom-[calc(4rem+1px+env(safe-area-inset-bottom)+1rem)] z-70 flex flex-col gap-2 md:left-auto md:right-4 md:w-96 lg:bottom-4">
        <div role="alert" aria-live="assertive" className="flex flex-col gap-2">
          {assertive.map((t) => (
            <ToastCard key={t.id} toast={t} onDismiss={dismiss} />
          ))}
        </div>
        <div role="status" aria-live="polite" className="flex flex-col gap-2">
          {polite.map((t) => (
            <ToastCard key={t.id} toast={t} onDismiss={dismiss} />
          ))}
        </div>
      </div>
    </ToastContext.Provider>
  );
}
