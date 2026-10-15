"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { isActive, type NavItem } from "./nav-config";

export const navLinkClasses = (active: boolean) =>
  cn(
    "focus-ring inline-flex min-h-11 items-center gap-1 rounded-control px-3 text-body-sm font-medium transition-colors duration-120",
    active ? "bg-primary-50 text-primary-700" : "text-fg-secondary hover:bg-ink-100 hover:text-fg",
  );

export type NavMenuProps = {
  label: ReactNode;
  /** Accessible name of the menu's link list. */
  listLabel: string;
  items?: NavItem[];
  /** Custom panel content instead of `items` (e.g. the account panel). */
  children?: ReactNode;
  /** Accessible name of the trigger when its visible label is not enough. */
  triggerLabel?: string;
  /** Marks the trigger active when any of these prefixes match. */
  activePrefixes?: string[];
  /** Extra rows rendered after the links (e.g. a sign-out form). */
  footer?: ReactNode;
  align?: "start" | "end";
  triggerClassName?: string;
};

/**
 * Disclosure navigation menu (WAI-ARIA disclosure pattern, not an ARIA menu): a button with
 * aria-expanded controls a list of ordinary links. Esc closes and returns focus to the button;
 * clicking outside or navigating closes it.
 */
export function NavMenu({ label, listLabel, items = [], children, triggerLabel, activePrefixes = [], footer, align = "start", triggerClassName }: NavMenuProps) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const pathname = usePathname() ?? "/";
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const active = activePrefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-label={triggerLabel}
        onClick={() => setOpen((o) => !o)}
        className={cn(navLinkClasses(active), triggerClassName)}
      >
        {label}
        <ChevronDown aria-hidden="true" className={cn("size-4 transition-transform duration-120 motion-reduce:transition-none", open && "rotate-180")} />
      </button>
      <div
        id={`${id}-list`}
        hidden={!open}
        className={cn(
          "absolute top-full z-40 mt-2 w-64 rounded-card border border-line bg-surface p-2 shadow-e2",
          align === "end" ? "right-0" : "left-0",
        )}
      >
        {children ?? (
        <ul aria-label={listLabel} className="flex flex-col">
          {items.map((it) => {
            const current = isActive(pathname, it);
            return (
              <li key={it.href}>
                <Link
                  href={it.href}
                  aria-current={current ? "page" : undefined}
                  className={cn(
                    "focus-ring flex min-h-11 items-center rounded-control px-3 text-body-sm font-medium",
                    current ? "bg-primary-50 text-primary-700" : "text-fg hover:bg-ink-100",
                  )}
                >
                  {it.label}
                </Link>
              </li>
            );
          })}
        </ul>
        )}
        {footer && <div className="mt-1 border-t border-line pt-1">{footer}</div>}
      </div>
    </div>
  );
}
