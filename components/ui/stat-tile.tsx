import type { ReactNode } from "react";
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import { cn } from "./cn";
import { Skeleton } from "./skeleton";

export type StatTileProps = {
  label: ReactNode;
  /** null/undefined = no data yet ("—"). */
  value?: ReactNode | null;
  /** Change vs a previous period. `text` is required so the delta never relies on colour or arrow alone. */
  delta?: { direction: "up" | "down" | "flat"; text: string; /** true when "down" is good, e.g. time per question */ invert?: boolean };
  hint?: ReactNode;
  loading?: boolean;
  className?: string;
};

export function StatTile({ label, value, delta, hint, loading = false, className }: StatTileProps) {
  const empty = value === null || value === undefined;
  const good = delta && delta.direction !== "flat" && (delta.direction === "up") !== Boolean(delta.invert);
  const DeltaIcon = delta?.direction === "up" ? ArrowUpRight : delta?.direction === "down" ? ArrowDownRight : ArrowRight;
  return (
    <div className={cn("flex flex-col gap-1 rounded-card border border-line bg-surface p-4", className)} aria-busy={loading || undefined}>
      <span className="text-body-sm font-medium text-fg-secondary">{label}</span>
      {loading ? (
        <Skeleton className="h-8 w-24" />
      ) : (
        <span className="text-h2 font-semibold tabular-nums text-fg">
          {empty ? (
            <>
              <span aria-hidden="true">—</span>
              <span className="sr-only">No data yet</span>
            </>
          ) : (
            value
          )}
        </span>
      )}
      {!loading && delta && (
        <span
          className={cn(
            "inline-flex items-center gap-1 text-body-sm font-medium",
            delta.direction === "flat" ? "text-fg-secondary" : good ? "text-success-700" : "text-danger-700",
          )}
        >
          <DeltaIcon aria-hidden="true" className="size-4" />
          {delta.text}
        </span>
      )}
      {hint && <span className="text-body-sm text-fg-muted">{hint}</span>}
    </div>
  );
}
