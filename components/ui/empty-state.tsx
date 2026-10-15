import type { ReactNode } from "react";
import { cn } from "./cn";

export type EmptyStateProps = {
  /** Decorative icon or illustration (hidden from assistive tech). */
  icon?: ReactNode;
  title: ReactNode;
  /** What it is, why it is empty. */
  description?: ReactNode;
  /** Always one clear next action. */
  action?: ReactNode;
  headingLevel?: 2 | 3 | 4;
  className?: string;
};

/** first-use · no results · cleared · coming soon — same layout, different copy. */
export function EmptyState({ icon, title, description, action, headingLevel = 3, className }: EmptyStateProps) {
  const Heading = `h${headingLevel}` as "h2" | "h3" | "h4";
  return (
    <div className={cn("flex flex-col items-center gap-3 rounded-card border border-dashed border-ink-300 bg-surface px-6 py-10 text-center", className)}>
      {icon && (
        <div aria-hidden="true" className="flex size-12 items-center justify-center rounded-full bg-primary-50 text-primary-600 [&_svg]:size-6">
          {icon}
        </div>
      )}
      <Heading className="text-h3 font-semibold text-fg">{title}</Heading>
      {description && <p className="max-w-prose text-body text-fg-secondary">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
