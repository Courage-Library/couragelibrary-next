"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { recordReadingAction } from "@/app/(site)/learn/actions";
import { FOCUS_KEY } from "@/lib/learning/focus-mode";

/**
 * COURSE-UX-1 lesson reader — the small client islands (everything else is server-rendered):
 *   ReadingProgressBar  a transform-only bar (no layout shift) showing how far through the lesson the reader is
 *   ReadingTracker      the furthest block seen → the server (resume position; the LAST block = end reached), at most
 *                       one save every 15 s plus the end; resumes at the server-saved block on return
 *   FocusToggle         focus mode (R13): hides the outline and "On this page"; remembered on this device only
 *   OutlineSheet        the course outline in a sheet (phones)
 * Icons arrive as server-rendered nodes (no icon library in these islands: the lesson page keeps its JS budget).
 */


export function ReadingProgressBar() {
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const article = document.querySelector<HTMLElement>("[data-lesson-blocks]");
      if (!article || !bar.current) return;
      const r = article.getBoundingClientRect();
      const total = r.height - window.innerHeight;
      const p = total <= 0 ? (r.top < window.innerHeight ? 1 : 0) : Math.min(1, Math.max(0, -r.top / total));
      bar.current.style.transform = `scaleX(${p})`;
    };
    const on = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", on, { passive: true });
    window.addEventListener("resize", on);
    return () => {
      window.removeEventListener("scroll", on);
      window.removeEventListener("resize", on);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 z-40 h-1 bg-transparent" data-reading-progress="">
      <div ref={bar} className="h-full origin-left bg-primary-700" style={{ transform: "scaleX(0)" }} />
    </div>
  );
}

export function ReadingTracker({ documentId, language, lastBlockId, resume }: { documentId: string; language: "en" | "hi"; lastBlockId: string | null; resume: boolean }) {
  useEffect(() => {
    const blocks = Array.from(document.querySelectorAll<HTMLElement>("[data-lesson-blocks] > [data-block-id]"));
    if (blocks.length === 0) return;
    const ids = blocks.map((b) => b.dataset.blockId as string);
    // resume at the server-saved block (only when arriving at the top, without an anchor)
    if (resume && lastBlockId && !window.location.hash && window.scrollY < 50) {
      const el = blocks[ids.indexOf(lastBlockId)];
      if (el && ids.indexOf(lastBlockId) > 0) el.scrollIntoView({ block: "start" });
    }
    let furthest = lastBlockId ? ids.indexOf(lastBlockId) : -1;
    let sent = furthest;
    let lastSent = 0;
    let endSent = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const send = () => {
      timer = null;
      if (furthest <= sent && !(furthest === ids.length - 1 && !endSent)) return;
      sent = furthest;
      lastSent = Date.now();
      if (furthest === ids.length - 1) endSent = true;
      void recordReadingAction({ documentId, language, blockId: ids[furthest] }).catch(() => null);
    };
    const schedule = () => {
      if (furthest === ids.length - 1 && !endSent) return send(); // the end is recorded at once
      if (timer) return;
      timer = setTimeout(send, Math.max(0, 15000 - (Date.now() - lastSent)));
    };
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const i = ids.indexOf((e.target as HTMLElement).dataset.blockId as string);
          if (i > furthest) furthest = i;
        }
        if (furthest > sent || (furthest === ids.length - 1 && !endSent)) schedule();
      },
      { rootMargin: "0px 0px -20% 0px" },
    );
    blocks.forEach((b) => io.observe(b));
    const flush = () => {
      if (document.visibilityState === "hidden" && furthest > sent) send();
    };
    document.addEventListener("visibilitychange", flush);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", flush);
      if (timer) clearTimeout(timer);
    };
  }, [documentId, language, lastBlockId, resume]);
  return null;
}


export function FocusToggle({ rootId, icon }: { rootId: string; icon: ReactNode }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    setOn(document.getElementById(rootId)?.dataset.focus === "on");
  }, [rootId]);
  const toggle = () => {
    const next = !on;
    setOn(next);
    const root = document.getElementById(rootId);
    if (root) root.dataset.focus = next ? "on" : "off";
    try {
      localStorage.setItem(FOCUS_KEY, next ? "on" : "off");
    } catch {
      /* private window: focus mode simply is not remembered */
    }
  };
  return (
    <button type="button" onClick={toggle} aria-pressed={on} className="focus-ring inline-flex min-h-12 items-center gap-2 rounded-control border border-line bg-surface px-3 text-body-sm font-medium text-fg hover:bg-ink-50" data-testid="focus-toggle">
      {icon}
      {on ? "Exit focus mode" : "Focus mode"}
    </button>
  );
}

export function OutlineSheet({ title, icon, closeIcon, children }: { title: string; icon: ReactNode; closeIcon: ReactNode; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" onClick={() => ref.current?.showModal()} className="focus-ring inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-control px-3 text-body-sm font-semibold text-fg hover:bg-ink-50" data-testid="outline-open">
        {icon}
        Outline
      </button>
      <dialog
        ref={ref}
        aria-label={title}
        className="m-0 mt-auto max-h-[85dvh] w-full max-w-none rounded-t-card border border-line bg-surface p-0 text-fg backdrop:bg-ink-900/40"
        onClick={(e) => {
          if (e.target === ref.current) ref.current?.close();
        }}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2">
          <p className="text-body font-semibold">{title}</p>
          <button type="button" onClick={() => ref.current?.close()} className="focus-ring inline-flex size-12 items-center justify-center rounded-control hover:bg-ink-50" aria-label="Close outline">
            {closeIcon}
          </button>
        </div>
        <div className="overflow-y-auto p-2">{children}</div>
      </dialog>
    </>
  );
}
