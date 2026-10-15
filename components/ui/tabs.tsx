"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "./cn";

export type TabItem = { value: string; label: ReactNode; content: ReactNode; disabled?: boolean };

export type TabsProps = {
  /** Accessible name of the tab list. */
  label: string;
  items: TabItem[];
  defaultValue?: string;
  /** Controlled value (e.g. synced with the URL when the tab changes page content). */
  value?: string;
  onValueChange?: (value: string) => void;
  /** underline: page sections · segmented: filters */
  variant?: "underline" | "segmented";
  className?: string;
};

/**
 * WAI-ARIA APG tabs with automatic activation: Left/Right arrows move and select, Home/End jump,
 * only the selected tab is in the tab order, the panel is focusable. Scrolls horizontally on mobile.
 */
export function Tabs({ label, items, defaultValue, value, onValueChange, variant = "underline", className }: TabsProps) {
  const uid = useId();
  const [inner, setInner] = useState(defaultValue ?? items.find((i) => !i.disabled)?.value);
  const selected = value ?? inner;
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const select = (v: string) => {
    if (value === undefined) setInner(v);
    onValueChange?.(v);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const enabled = items.filter((i) => !i.disabled);
    const idx = enabled.findIndex((i) => i.value === selected);
    let next: TabItem | undefined;
    if (e.key === "ArrowRight") next = enabled[(idx + 1) % enabled.length];
    else if (e.key === "ArrowLeft") next = enabled[(idx - 1 + enabled.length) % enabled.length];
    else if (e.key === "Home") next = enabled[0];
    else if (e.key === "End") next = enabled[enabled.length - 1];
    if (!next) return;
    e.preventDefault();
    select(next.value);
    refs.current[next.value]?.focus();
  };

  const id = (kind: "tab" | "panel", v: string) => `${uid}-${kind}-${v}`;

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div
        role="tablist"
        aria-label={label}
        onKeyDown={onKeyDown}
        className={cn(
          "flex max-w-full overflow-x-auto",
          variant === "underline" ? "gap-1 border-b border-line" : "w-fit gap-1 rounded-control bg-surface-sunken p-1",
        )}
      >
        {items.map((it) => {
          const isSel = it.value === selected;
          return (
            <button
              key={it.value}
              ref={(el) => {
                refs.current[it.value] = el;
              }}
              type="button"
              role="tab"
              id={id("tab", it.value)}
              aria-selected={isSel}
              aria-controls={id("panel", it.value)}
              tabIndex={isSel ? 0 : -1}
              disabled={it.disabled}
              onClick={() => select(it.value)}
              className={cn(
                "focus-ring inline-flex min-h-11 shrink-0 items-center whitespace-nowrap px-3 text-body-sm font-medium transition-colors duration-120 disabled:cursor-not-allowed disabled:text-ink-600",
                variant === "underline"
                  ? cn("-mb-px border-b-2", isSel ? "border-primary-600 text-primary-700" : "border-transparent text-fg-secondary hover:text-fg")
                  : cn("min-h-9 rounded-badge", isSel ? "bg-surface text-fg shadow-e1" : "text-fg-secondary hover:text-fg"),
              )}
            >
              {it.label}
            </button>
          );
        })}
      </div>
      {items.map((it) => (
        <div
          key={it.value}
          role="tabpanel"
          id={id("panel", it.value)}
          aria-labelledby={id("tab", it.value)}
          tabIndex={0}
          hidden={it.value !== selected}
          className="focus-ring rounded-control"
        >
          {it.content}
        </div>
      ))}
    </div>
  );
}
