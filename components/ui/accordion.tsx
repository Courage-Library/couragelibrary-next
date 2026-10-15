"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "./cn";

export type AccordionItem = { id: string; title: ReactNode; content: ReactNode };

export type AccordionProps = {
  items: AccordionItem[];
  /** single: opening one closes the others · multiple: independent */
  type?: "single" | "multiple";
  defaultOpen?: string[];
  headingLevel?: 2 | 3 | 4;
  className?: string;
};

/** APG accordion: each header is a heading containing a <button aria-expanded>; panels are labelled regions. */
export function Accordion({ items, type = "single", defaultOpen = [], headingLevel = 3, className }: AccordionProps) {
  const uid = useId();
  const [open, setOpen] = useState<string[]>(defaultOpen);
  const Heading = `h${headingLevel}` as "h2" | "h3" | "h4";

  const toggle = (id: string) =>
    setOpen((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : type === "single" ? [id] : [...cur, id]));

  return (
    <div className={cn("divide-y divide-line rounded-card border border-line bg-surface", className)}>
      {items.map((it) => {
        const expanded = open.includes(it.id);
        const btnId = `${uid}-${it.id}-button`;
        const panelId = `${uid}-${it.id}-panel`;
        return (
          <div key={it.id}>
            <Heading className="text-body font-semibold text-fg">
              <button
                type="button"
                id={btnId}
                aria-expanded={expanded}
                aria-controls={panelId}
                onClick={() => toggle(it.id)}
                className="focus-ring flex min-h-12 w-full items-center justify-between gap-4 rounded-card px-4 py-3 text-left hover:bg-ink-50"
              >
                <span>{it.title}</span>
                <ChevronDown
                  aria-hidden="true"
                  className={cn("size-5 shrink-0 text-fg-secondary transition-transform duration-200 motion-reduce:transition-none", expanded && "rotate-180")}
                />
              </button>
            </Heading>
            <div id={panelId} role="region" aria-labelledby={btnId} hidden={!expanded} className="px-4 pb-4 text-body text-fg-secondary">
              {it.content}
            </div>
          </div>
        );
      })}
    </div>
  );
}
