import { cn } from "./cn";

export type DividerProps = {
  orientation?: "horizontal" | "vertical";
  /** Short text in the middle, e.g. "or". */
  label?: string;
  className?: string;
};

export function Divider({ orientation = "horizontal", label, className }: DividerProps) {
  if (orientation === "vertical") {
    return <div role="separator" aria-orientation="vertical" className={cn("w-px self-stretch bg-line", className)} />;
  }
  if (label) {
    return (
      <div role="separator" aria-label={label} className={cn("flex items-center gap-3 text-body-sm text-fg-muted", className)}>
        <span aria-hidden="true" className="h-px flex-1 bg-line" />
        <span aria-hidden="true">{label}</span>
        <span aria-hidden="true" className="h-px flex-1 bg-line" />
      </div>
    );
  }
  return <hr className={cn("border-0 border-t border-line", className)} />;
}
