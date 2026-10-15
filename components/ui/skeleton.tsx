import { cn } from "./cn";

export type SkeletonProps = {
  shape?: "text" | "block" | "circle";
  /** For shape="text": number of lines (the last one is shorter). */
  lines?: number;
  className?: string;
};

/**
 * Loading placeholder sized like the final content (CLS ≤ 0.1). Hidden from assistive tech: set
 * `aria-busy="true"` on the loading region instead. Pulses only when motion is allowed.
 */
export function Skeleton({ shape = "block", lines = 3, className }: SkeletonProps) {
  const base = "bg-ink-200 motion-safe:animate-pulse";
  if (shape === "text") {
    return (
      <div aria-hidden="true" className={cn("flex flex-col gap-2", className)}>
        {Array.from({ length: lines }, (_, i) => (
          <div key={i} className={cn(base, "h-4 rounded-badge", i === lines - 1 && lines > 1 ? "w-2/3" : "w-full")} />
        ))}
      </div>
    );
  }
  return <div aria-hidden="true" className={cn(base, shape === "circle" ? "rounded-full" : "rounded-control", className)} />;
}
