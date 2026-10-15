"use client";

import { cloneElement, isValidElement, useEffect, useId, useState, type ReactElement } from "react";
import { cn } from "./cn";

export type TooltipProps = {
  /** Short supplementary text. Never put essential information only in a tooltip. */
  content: string;
  /** One focusable element (button, link). It gets aria-describedby → the tooltip. */
  children: ReactElement<{ "aria-describedby"?: string }>;
  side?: "top" | "bottom";
  className?: string;
};

/**
 * Shows on hover and on keyboard focus; stays while the pointer moves onto it; Esc dismisses it
 * (WCAG 1.4.13 hoverable, persistent, dismissible).
 */
export function Tooltip({ content, children, side = "top", className }: TooltipProps) {
  const id = useId();
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const visible = (hover || focus) && !dismissed;

  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDismissed(true);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [visible]);

  const trigger = isValidElement(children)
    ? cloneElement(children, {
        "aria-describedby": [children.props["aria-describedby"], id].filter(Boolean).join(" "),
      })
    : children;

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => {
        setHover(true);
        setDismissed(false);
      }}
      onMouseLeave={() => setHover(false)}
      onFocus={() => {
        setFocus(true);
        setDismissed(false);
      }}
      onBlur={() => setFocus(false)}
    >
      {trigger}
      <span
        role="tooltip"
        id={id}
        hidden={!visible}
        className={cn(
          "absolute left-1/2 z-80 w-max max-w-64 -translate-x-1/2 rounded-control bg-ink-900 px-3 py-2 text-caption font-medium text-fg-inverse shadow-e2",
          side === "top" ? "bottom-full mb-2" : "top-full mt-2",
          className,
        )}
      >
        {content}
      </span>
    </span>
  );
}
