"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { activeVisitorKey } from "@/lib/nav/visitor-nav";

/**
 * NAV-1 Stage A — the visitor header's only client code (kept small: the landing's First Load JS budget, BRAND2 P-07).
 * It renders nothing visible; it enhances the server-rendered header it sits in:
 *   - Exams menu: click / Enter / Space toggle (the trigger stays a real link to /exams without JavaScript), hover with
 *     a ~150 ms intent delay on pointer devices, ArrowDown/ArrowUp/Home/End move between the menu's links, Esc and
 *     outside click close it and return focus to the trigger, a route change closes it
 *   - phone drawer (native <details>): focus moves in, Tab is trapped between the toggle and the panel, Esc and the
 *     overlay close it (focus back to the toggle), the page behind does not scroll, a route change closes it
 *   - the active link (aria-current) on the cached pages, where the server cannot know the path
 */
const INTENT_MS = 150;
const FOCUSABLE = 'a[href], summary, button:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function VisitorNavEnhancer() {
  const ref = useRef<HTMLSpanElement>(null);
  const pathname = usePathname() ?? "/";

  // active section + close everything on a route change
  useEffect(() => {
    const header = ref.current?.closest("[data-visitor-header]");
    if (!header) return;
    const key = activeVisitorKey(pathname);
    header.querySelectorAll<HTMLElement>("[data-nav-key]").forEach((a) => {
      if (a.dataset.navKey === key) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
    // UX-IMP-1 I-8: an action pointing to this page says so (the cached pages cannot know the path on the server)
    header.querySelectorAll<HTMLAnchorElement>("[data-nav-action]").forEach((a) => {
      if (new URL(a.href, location.href).pathname === pathname) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
    header.querySelectorAll<HTMLDetailsElement>("details[open]").forEach((d) => (d.open = false));
    const panel = header.querySelector<HTMLElement>("[data-exams-panel]");
    const trigger = header.querySelector<HTMLElement>("[data-exams-trigger]");
    if (panel && trigger) {
      panel.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
    }
  }, [pathname]);

  // Exams menu
  useEffect(() => {
    const header = ref.current?.closest("[data-visitor-header]");
    const wrap = header?.querySelector<HTMLElement>("[data-exams-menu]");
    const trigger = header?.querySelector<HTMLElement>("[data-exams-trigger]");
    const panel = header?.querySelector<HTMLElement>("[data-exams-panel]");
    if (!wrap || !trigger || !panel) return;
    let timer: number | undefined;
    const items = () => [...panel.querySelectorAll<HTMLElement>("[data-exams-item]")];
    const isOpen = () => !panel.hidden;
    const setOpen = (open: boolean, focus?: "first" | "last" | "trigger") => {
      panel.hidden = !open;
      trigger.setAttribute("aria-expanded", String(open));
      if (focus === "first") items()[0]?.focus();
      if (focus === "last") items().at(-1)?.focus();
      if (focus === "trigger") trigger.focus();
    };
    const onClick = (e: MouseEvent) => {
      e.preventDefault();
      setOpen(!isOpen());
    };
    const onTriggerKey = (e: KeyboardEvent) => {
      if (e.key === " " || e.key === "Spacebar") {
        e.preventDefault();
        setOpen(!isOpen(), isOpen() ? undefined : "first");
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setOpen(true, "first");
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setOpen(true, "last");
      } else if (e.key === "Escape" && isOpen()) {
        setOpen(false, "trigger");
      }
    };
    const onPanelKey = (e: KeyboardEvent) => {
      const list = items();
      const i = list.indexOf(document.activeElement as HTMLElement);
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false, "trigger");
      } else if (e.key === "ArrowDown" || e.key === "ArrowRight") {
        e.preventDefault();
        list[(i + 1) % list.length]?.focus();
      } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
        e.preventDefault();
        list[(i - 1 + list.length) % list.length]?.focus();
      } else if (e.key === "Home") {
        e.preventDefault();
        list[0]?.focus();
      } else if (e.key === "End") {
        e.preventDefault();
        list.at(-1)?.focus();
      }
    };
    const onDocDown = (e: PointerEvent) => {
      if (isOpen() && !wrap.contains(e.target as Node)) setOpen(false);
    };
    const onFocusOut = (e: FocusEvent) => {
      if (isOpen() && e.relatedTarget && !wrap.contains(e.relatedTarget as Node)) setOpen(false);
    };
    const hover = window.matchMedia("(hover: hover) and (pointer: fine)");
    const onEnter = () => {
      if (!hover.matches) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setOpen(true), INTENT_MS);
    };
    const onLeave = () => {
      if (!hover.matches) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setOpen(false), INTENT_MS);
    };
    trigger.setAttribute("aria-haspopup", "true");
    trigger.addEventListener("click", onClick);
    trigger.addEventListener("keydown", onTriggerKey);
    panel.addEventListener("keydown", onPanelKey);
    wrap.addEventListener("focusout", onFocusOut);
    wrap.addEventListener("pointerenter", onEnter);
    wrap.addEventListener("pointerleave", onLeave);
    document.addEventListener("pointerdown", onDocDown);
    return () => {
      window.clearTimeout(timer);
      trigger.removeEventListener("click", onClick);
      trigger.removeEventListener("keydown", onTriggerKey);
      panel.removeEventListener("keydown", onPanelKey);
      wrap.removeEventListener("focusout", onFocusOut);
      wrap.removeEventListener("pointerenter", onEnter);
      wrap.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("pointerdown", onDocDown);
    };
  }, []);

  // phone drawer
  useEffect(() => {
    const header = ref.current?.closest("[data-visitor-header]");
    const drawer = header?.querySelector<HTMLDetailsElement>("[data-nav-drawer]");
    const toggle = header?.querySelector<HTMLElement>("[data-drawer-toggle]");
    const panel = header?.querySelector<HTMLElement>("[data-drawer-panel]");
    const backdrop = header?.querySelector<HTMLElement>("[data-drawer-backdrop]");
    if (!drawer || !toggle || !panel) return;
    const focusables = () => [toggle, ...[...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.getClientRects().length > 0)];
    const close = () => {
      drawer.open = false;
      toggle.focus();
    };
    const onToggle = () => {
      document.documentElement.toggleAttribute("data-nav-drawer-open", drawer.open);
      toggle.setAttribute("aria-label", drawer.open ? toggle.dataset.closeLabel || "Close menu" : toggle.dataset.openLabel || "Menu");
      if (drawer.open) focusables()[1]?.focus(); // the first VISIBLE item in the panel
    };
    const onKey = (e: KeyboardEvent) => {
      if (!drawer.open) return;
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      } else if (e.key === "Tab") {
        const list = focusables();
        const i = list.indexOf(document.activeElement as HTMLElement);
        if (e.shiftKey && i <= 0) {
          e.preventDefault();
          list.at(-1)?.focus();
        } else if (!e.shiftKey && i === list.length - 1) {
          e.preventDefault();
          list[0]?.focus();
        }
      }
    };
    toggle.dataset.openLabel = toggle.getAttribute("aria-label") ?? "Menu";
    drawer.addEventListener("toggle", onToggle);
    drawer.addEventListener("keydown", onKey);
    backdrop?.addEventListener("click", close);
    return () => {
      drawer.removeEventListener("toggle", onToggle);
      drawer.removeEventListener("keydown", onKey);
      backdrop?.removeEventListener("click", close);
      document.documentElement.removeAttribute("data-nav-drawer-open");
    };
  }, []);

  return <span ref={ref} hidden data-visitor-nav-enhancer="" />;
}
