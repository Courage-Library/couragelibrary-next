import type { ComponentProps } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "./cn";

export type TextLinkVariant = "inline" | "standalone" | "nav";

const VARIANTS: Record<TextLinkVariant, string> = {
  // Underlined in running text so it is distinguishable without colour (WCAG 1.4.1).
  inline: "text-link underline decoration-1 underline-offset-2 hover:text-primary-700 hover:decoration-2",
  standalone: "inline-flex items-center gap-1 font-medium text-link hover:text-primary-700 hover:underline underline-offset-2",
  nav: "inline-flex items-center rounded-control px-2 py-1 font-medium text-fg-secondary hover:bg-ink-100 hover:text-fg aria-[current=page]:bg-primary-50 aria-[current=page]:text-primary-700",
};

export type TextLinkProps = ComponentProps<typeof Link> & {
  variant?: TextLinkVariant;
  /** Opens in a new tab with rel="noopener noreferrer" and an " (opens in a new tab)" label for screen readers. */
  external?: boolean;
  /** For nav links: marks the current page. */
  current?: boolean;
};

export function TextLink({ variant = "inline", external = false, current, className, children, ...props }: TextLinkProps) {
  return (
    <Link
      className={cn("focus-ring rounded-badge", VARIANTS[variant], className)}
      aria-current={current ? "page" : undefined}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      {...props}
    >
      {children}
      {external && <span className="sr-only"> (opens in a new tab)</span>}
      {variant === "standalone" && <ChevronRight aria-hidden="true" className="size-4" />}
    </Link>
  );
}
