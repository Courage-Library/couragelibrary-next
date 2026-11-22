"use client";

import React, { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * RESULT-UX-1 §2.1 / §3.13 — sticky anchor chips (Summary · Next steps · Weak topics · Sections · Question review · Past
 * attempts) right under the student top bar; the active chip follows the scroll. Phones: the row scrolls sideways.
 * Re-attempt is hidden in this phase (RESULT-REATTEMPT-1: a new attempt is not allowed for normal mocks).
 */
export function JumpBar({ items }: { items: Array<{ id: string; label: string }> }) {
  const [active, setActive] = useState(items[0]?.id ?? "");
  const ids = items.map((i) => i.id).join(",");
  useEffect(() => {
    // the active chip = the last section whose top has passed the line just under the sticky bars (deterministic; the
    // last section wins once the page is scrolled to the end)
    let raf = 0;
    const update = () => {
      raf = 0;
      const line = 160;
      const els = ids.split(",").map((id) => document.getElementById(id)).filter((e): e is HTMLElement => Boolean(e));
      if (els.length === 0) return;
      const atEnd = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      let current = els[0].id;
      for (const el of els) if (el.getBoundingClientRect().top <= line) current = el.id;
      setActive(atEnd ? els[els.length - 1].id : current);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [ids]);

  return (
    <nav aria-label="On this page" className="sticky top-[var(--sticky-offset,0px)] z-20 -mx-4 border-b border-cl-line bg-cl-cloud/95 px-4 py-2 sm:-mx-6 sm:px-6 lg:mx-0 lg:rounded-xl lg:border lg:px-3" data-jump-bar="">
      <ul className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((i) => (
          <li key={i.id} className="shrink-0">
            <a
              href={`#${i.id}`}
              aria-current={active === i.id ? "location" : undefined}
              onClick={() => setActive(i.id)}
              className={cn(
                "focus-ring inline-flex min-h-11 items-center rounded-full border px-3.5 text-body-sm font-medium whitespace-nowrap",
                active === i.id ? "border-cl-charcoal bg-cl-charcoal text-cl-white" : "border-cl-line bg-cl-white text-cl-slate hover:text-cl-charcoal",
              )}
            >
              {i.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
