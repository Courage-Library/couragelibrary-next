import type { ComponentProps, ElementType, ReactNode } from "react";
import Link from "next/link";
import { cn } from "./cn";

export type CardProps = ComponentProps<"div"> & {
  /** plain: border only · interactive: hover elevation, use <CardLink> once inside · selected: primary border */
  variant?: "plain" | "interactive" | "selected";
  padding?: "none" | "sm" | "md";
  as?: ElementType;
};

const PADDING = { none: "", sm: "p-4", md: "p-4 sm:p-6" };

export function Card({ variant = "plain", padding = "md", as: Tag = "div", className, ...props }: CardProps) {
  return (
    <Tag
      className={cn(
        "relative flex flex-col gap-3 rounded-card border border-line bg-surface text-fg",
        PADDING[padding],
        variant === "interactive" &&
          "transition-shadow duration-200 ease-standard hover:border-ink-300 hover:shadow-e1 has-[a[data-card-link]:focus-visible]:outline-2 has-[a[data-card-link]:focus-visible]:outline-offset-2 has-[a[data-card-link]:focus-visible]:outline-focus",
        variant === "selected" && "border-2 border-primary-600 bg-primary-50",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-1", className)} {...props} />;
}

export function CardTitle({
  as: Tag = "h3",
  className,
  ...props
}: ComponentProps<"h3"> & { as?: "h2" | "h3" | "h4" }) {
  return <Tag className={cn("text-h3 font-semibold text-fg", className)} {...props} />;
}

export function CardDescription({ className, ...props }: ComponentProps<"p">) {
  return <p className={cn("text-body-sm text-fg-secondary", className)} {...props} />;
}

export function CardBody({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-2 text-body", className)} {...props} />;
}

export function CardFooter({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("mt-auto flex flex-wrap items-center gap-2 pt-1", className)} {...props} />;
}

/**
 * The single link of an interactive card (usually wraps the title text). Its ::after stretches over the
 * whole card so the card is one click target without nested links; the card shows the focus ring.
 * Other buttons inside the card must sit above it (`relative z-10`).
 */
export function CardLink({ className, children, ...props }: ComponentProps<typeof Link> & { children: ReactNode }) {
  return (
    <Link
      data-card-link=""
      className={cn("outline-none after:absolute after:inset-0 after:rounded-card hover:underline", className)}
      {...props}
    >
      {children}
    </Link>
  );
}
