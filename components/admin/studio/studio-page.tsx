import React from "react";
import Link from "next/link";
import { cn } from "@/components/ui/cn";

/**
 * Courage Studio page template (phase 3, decision #84) — the same density as Today v2: title 28 px, one line of
 * description, ONE primary action (R4) + quiet secondary actions; a compact stat strip (label 11.5 px uppercase,
 * number 24 px) whose items can filter the list; panels with 18 px padding; honest empty states. Server-safe (no hooks).
 */
export function StudioPageHeader({ title, description, primary, actions, meta }: { title: string; description?: string; primary?: React.ReactNode; actions?: React.ReactNode; meta?: React.ReactNode }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3" data-studio-header="">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-[28px] font-bold leading-tight text-fg">{title}</h1>
          {meta}
        </div>
        {description && <p className="mt-1 max-w-3xl text-[14px] text-fg-secondary">{description}</p>}
      </div>
      {(primary || actions) && (
        <div className="flex flex-wrap items-center gap-2">
          {actions}
          {primary}
        </div>
      )}
    </header>
  );
}

/** Quiet secondary action (text button / link) — never a second solid primary. */
export const studioQuietAction =
  "focus-ring inline-flex min-h-10 items-center gap-1.5 rounded-control px-3 text-[13px] font-semibold text-link hover:bg-primary-50";
/** The ONE primary action of a Studio page (solid blue-700, R4). */
export const studioPrimaryAction =
  "focus-ring inline-flex min-h-10 items-center gap-1.5 rounded-control bg-primary-700 px-4 text-[14px] font-semibold text-white hover:bg-primary-800 disabled:cursor-not-allowed disabled:opacity-50";

export interface StudioStat {
  key: string;
  label: string;
  value: number | null;
  tone?: "blue" | "green" | "red" | "teal" | "muted" | "orange";
  /** the stat filters the list: render as a pressed-state button */
  active?: boolean;
}

const DOT: Record<NonNullable<StudioStat["tone"]>, string> = {
  blue: "bg-primary-700",
  green: "bg-success-600",
  red: "bg-danger-600",
  teal: "bg-accent-700",
  muted: "bg-ink-400",
  orange: "bg-warning-600",
};

/** A compact row of counts; when `onSelect` is given each count is a filter toggle (aria-pressed). */
export function StudioStatStrip({ stats, onSelect, label }: { stats: StudioStat[]; onSelect?: (key: string) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="grid grid-cols-[repeat(auto-fit,minmax(6.75rem,1fr))] gap-2" data-studio-stats="">
      {stats.map((s) => {
        const inner = (
          <>
            <span className="flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-[.08em] text-ink-500">
              {s.tone && <span aria-hidden="true" className={cn("size-2 rounded-full", DOT[s.tone])} />}
              {s.label}
            </span>
            <span className="text-[24px] font-extrabold leading-none tabular-nums text-fg">{s.value === null ? "–" : s.value}</span>
          </>
        );
        const cls = cn(
          "flex min-h-16 min-w-0 flex-col items-start justify-between gap-1.5 rounded-card border bg-surface px-3 py-2.5 text-left",
          s.active ? "border-primary-700 shadow-[inset_0_0_0_1px_var(--color-primary-700)]" : "border-line",
        );
        return onSelect ? (
          <button key={s.key} type="button" aria-pressed={!!s.active} onClick={() => onSelect(s.key)} className={cn(cls, "focus-ring hover:border-primary-200")}>
            {inner}
            {s.value === null && <span className="sr-only">Not available</span>}
          </button>
        ) : (
          <div key={s.key} className={cls}>
            {inner}
          </div>
        );
      })}
    </div>
  );
}

/** A Studio panel (18 px padding, card radius, hairline border). */
export function StudioPanel({ children, className, ...rest }: React.HTMLAttributes<HTMLElement> & { children: React.ReactNode }) {
  return (
    <section className={cn("rounded-card border border-line bg-surface p-[18px]", className)} {...rest}>
      {children}
    </section>
  );
}

/** Honest, useful empty state: what is empty + the one next step. */
export function StudioEmpty({ title, body, action, href }: { title: string; body: string; action?: string; href?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center" data-studio-empty="">
      <p className="text-[15px] font-semibold text-fg">{title}</p>
      <p className="max-w-md text-[13px] text-fg-secondary">{body}</p>
      {action && href && (
        <Link href={href} className={cn(studioQuietAction, "mt-1")}>
          {action} →
        </Link>
      )}
    </div>
  );
}

/** A labelled filter control (visible label; fixes unnamed selects). */
export function StudioField({ label, htmlFor, children, className }: { label: string; htmlFor: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-w-[9rem] flex-col gap-1", className)}>
      <label htmlFor={htmlFor} className="text-[11.5px] font-semibold uppercase tracking-[.08em] text-ink-500">
        {label}
      </label>
      {children}
    </div>
  );
}

/** Filter control classes (≥ 40 px, visible focus). */
export const studioControl =
  "focus-ring min-h-10 w-full rounded-control border border-line bg-surface px-3 text-[13px] text-fg";
