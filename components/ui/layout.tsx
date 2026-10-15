import type { ComponentProps, ElementType } from "react";
import { cn } from "./cn";

const CONTAINER = { default: "max-w-[1200px]", reading: "max-w-[720px]", full: "max-w-none" };

/** Page gutter 16 / 24 / 32 px; content max-width 1200 (720 for reading surfaces). */
export function Container({
  size = "default",
  as: Tag = "div",
  className,
  ...props
}: ComponentProps<"div"> & { size?: keyof typeof CONTAINER; as?: ElementType }) {
  return <Tag className={cn("mx-auto w-full px-4 md:px-6 lg:px-8", CONTAINER[size], className)} {...props} />;
}

/** Vertical section rhythm: 48 px mobile, 64 px desktop. */
export function Section({
  as: Tag = "section",
  spacing = "default",
  className,
  ...props
}: ComponentProps<"section"> & { as?: ElementType; spacing?: "default" | "compact" | "none" }) {
  const pad = { default: "py-12 lg:py-16", compact: "py-6 lg:py-8", none: "" }[spacing];
  return <Tag className={cn(pad, className)} {...props} />;
}

const GAPS = { 1: "gap-1", 2: "gap-2", 3: "gap-3", 4: "gap-4", 6: "gap-6", 8: "gap-8", 12: "gap-12", 16: "gap-16" };

export type StackProps = ComponentProps<"div"> & {
  as?: ElementType;
  direction?: "vertical" | "horizontal";
  /** Spacing step (4 px base). */
  gap?: keyof typeof GAPS;
  wrap?: boolean;
  align?: "start" | "center" | "end" | "stretch" | "baseline";
  justify?: "start" | "center" | "end" | "between";
};

/** Flex stack on the spacing scale (4, 8, 12, 16, 24, 32, 48, 64). */
export function Stack({
  as: Tag = "div",
  direction = "vertical",
  gap = 4,
  wrap = false,
  align,
  justify,
  className,
  ...props
}: StackProps) {
  return (
    <Tag
      className={cn(
        "flex",
        direction === "vertical" ? "flex-col" : "flex-row",
        GAPS[gap],
        wrap && "flex-wrap",
        align && { start: "items-start", center: "items-center", end: "items-end", stretch: "items-stretch", baseline: "items-baseline" }[align],
        justify && { start: "justify-start", center: "justify-center", end: "justify-end", between: "justify-between" }[justify],
        className,
      )}
      {...props}
    />
  );
}
