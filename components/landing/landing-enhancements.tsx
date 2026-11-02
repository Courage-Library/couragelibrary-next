"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { LANDING_HERO } from "@/content/landing";

/**
 * HOME-1 expert UX pass — the landing page's only client code (tiny; no library):
 *  1. Phones: a slim sticky "Explore exams" bar. It appears only after the hero has left the viewport and hides again
 *     near the final call to action / the footer, so it never sits on top of them; while it shows, the page keeps a
 *     scroll-padding of its height (focused elements are never hidden under it). ≥ 48 px target; no layout shift (it
 *     is fixed and slides with transform); no motion with prefers-reduced-motion. Not shown to a signed-in student
 *     (their bottom nav is there).
 *  2. Reveal on scroll = PROGRESSIVE ENHANCEMENT (UX-IMP-1, owner): NOTHING is ever hidden. Every section is visible in
 *     the HTML (no JavaScript, crawlers, full-page captures); a section below the fold only gets a short rise (≤ 200 ms,
 *     transform only — no opacity change, no layout shift; CSS in app/globals.css) the moment it enters the viewport.
 *     Sections added later are picked up by a MutationObserver. prefers-reduced-motion / print → no motion at all.
 */
export function LandingEnhancements() {
  const [show, setShow] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const state = useRef({ heroGone: false, nearEnd: false });

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // 2. reveal on scroll
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) {
          e.target.setAttribute("data-revealed", "");
          io.unobserve(e.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.05 },
    );
    // below the fold → observed (still fully visible); it rises when it enters; in view → nothing to do
    const take = (el: Element) => {
      if (el.hasAttribute("data-reveal-watch") || el.hasAttribute("data-revealed")) return;
      if (el.getBoundingClientRect().top < window.innerHeight) return;
      el.setAttribute("data-reveal-watch", "");
      io.observe(el);
    };
    let mo: MutationObserver | null = null;
    if (!reduce) {
      document.documentElement.classList.add("reveal-on");
      document.querySelectorAll("[data-reveal]").forEach(take);
      // sections streamed in later (Suspense) carry data-reveal too
      mo = new MutationObserver((records) => {
        for (const r of records) r.addedNodes.forEach((n) => {
          if (!(n instanceof Element)) return;
          if (n.matches("[data-reveal]")) take(n);
          n.querySelectorAll("[data-reveal]").forEach(take);
        });
      });
      mo.observe(document.body, { childList: true, subtree: true });
    }

    // 1. the phone bar (never with the student bottom nav)
    const hero = document.querySelector("[data-hero]");
    const ends = [...document.querySelectorAll("[data-final-cta], body > footer, footer[data-footer-navy]")];
    const studentNav = document.querySelector('nav[aria-label="Student"]');
    let barIo: IntersectionObserver | null = null;
    if (hero && !studentNav) {
      setEnabled(true);
      const update = () => setShow(state.current.heroGone && !state.current.nearEnd);
      const seen = new Map<Element, boolean>();
      barIo = new IntersectionObserver((entries) => {
        for (const e of entries) {
          if (e.target === hero) state.current.heroGone = !e.isIntersecting && e.boundingClientRect.top < 0;
          else seen.set(e.target, e.isIntersecting);
        }
        state.current.nearEnd = [...seen.values()].some(Boolean);
        update();
      });
      barIo.observe(hero);
      ends.forEach((el) => barIo!.observe(el));
    }
    return () => {
      io.disconnect();
      mo?.disconnect();
      barIo?.disconnect();
      document.documentElement.classList.remove("reveal-on");
      document.documentElement.style.scrollPaddingBottom = "";
    };
  }, []);

  useEffect(() => {
    document.documentElement.style.scrollPaddingBottom = show ? "88px" : "";
  }, [show]);

  if (!enabled) return null;
  const cta = LANDING_HERO.secondaryCta;
  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 px-4 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2 shadow-e2 transition-transform duration-200 ease-out motion-reduce:transition-none md:hidden ${show ? "translate-y-0" : "invisible translate-y-full"}`}
      data-explore-bar=""
      data-shown={show ? "" : undefined}
      aria-hidden={show ? undefined : true}
    >
      <Link href={cta.href} tabIndex={show ? undefined : -1} className="focus-ring flex min-h-12 w-full items-center justify-center gap-2 rounded-control bg-primary-700 px-5 text-body font-semibold text-fg-inverse hover:bg-primary-800">
        {cta.label}
        <ArrowRight aria-hidden="true" className="size-5" />
      </Link>
    </div>
  );
}
