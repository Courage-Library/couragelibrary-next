"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { activeStudentKey } from "@/lib/nav/student-nav";
import { LANG_PREF_KEY, SIDEBAR_PREF_KEY } from "@/lib/ui/nav-prefs";

/**
 * NAV-1 Stage B — the student shell's only client code. It renders nothing visible; it enhances the server markup:
 *   - collapse toggle: <html data-sidebar="collapsed">, remembered in localStorage (applied before paint by the inline
 *     script in app/layout.tsx — no layout shift on reload)
 *   - avatar menu / sheet (native <details>): focus moves in, Tab is trapped, Esc / outside click / overlay close it and
 *     focus returns to the avatar; a route change closes it; the page behind does not scroll while the phone sheet is open
 *   - the active item + the top-bar title after client-side navigation
 *   - language (spec §4, client-side only): EN | हिंदी remembered; on a page with a Hindi version (an hreflang="hi"
 *     alternate in <head>) choosing हिंदी opens it, and later visits of such pages open the Hindi version; elsewhere the
 *     page stays English ("Hindi where available")
 */
const FOCUSABLE = 'a[href], button:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';
const store = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* blocked storage: the choice applies to this page only */
    }
  },
};
const alternate = (lang: "en" | "hi") => document.querySelector<HTMLLinkElement>(`link[rel="alternate"][hreflang="${lang}"]`)?.href ?? null;

export function StudentNavEnhancer() {
  const ref = useRef<HTMLSpanElement>(null);
  const pathname = usePathname() ?? "/";
  const router = useRouter();

  // active item + title + close the account menu on a route change; apply the remembered language where a Hindi page exists
  useEffect(() => {
    const shell = ref.current?.closest("[data-student-shell]");
    if (!shell) return;
    const key = activeStudentKey(pathname);
    let title = "";
    shell.querySelectorAll<HTMLElement>("[data-student-key]").forEach((a) => {
      const on = a.dataset.studentKey === key;
      if (on) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
      if (on && !title && a.closest(".cl-ss__nav")) title = a.querySelector(".cl-ss__lbl")?.textContent ?? "";
    });
    const t = shell.querySelector<HTMLElement>("[data-student-title]");
    if (t) t.textContent = title;
    const d = shell.querySelector<HTMLDetailsElement>("[data-account-menu]");
    if (d) d.open = false;
    const pref = store.get(LANG_PREF_KEY) === "hi" ? "hi" : "en";
    shell.querySelectorAll<HTMLButtonElement>("[data-lang-choice]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.langChoice === pref)));
    if (pref === "hi" && !/^\/hi(\/|$)/.test(pathname)) {
      const hi = alternate("hi");
      if (hi && new URL(hi).pathname !== pathname) router.replace(new URL(hi).pathname);
    }
  }, [pathname, router]);

  // sidebar collapse
  useEffect(() => {
    const shell = ref.current?.closest("[data-student-shell]");
    const btn = shell?.querySelector<HTMLButtonElement>("[data-sidebar-toggle]");
    if (!btn) return;
    const root = document.documentElement;
    const sync = () => {
      const collapsed = root.getAttribute("data-sidebar") === "collapsed";
      const label = collapsed ? btn.dataset.labelExpand ?? "Expand" : btn.dataset.labelCollapse ?? "Collapse";
      btn.setAttribute("aria-label", label);
      btn.setAttribute("title", label);
      btn.setAttribute("aria-expanded", String(!collapsed));
    };
    const onClick = () => {
      const collapsed = root.getAttribute("data-sidebar") !== "collapsed";
      if (collapsed) root.setAttribute("data-sidebar", "collapsed");
      else root.removeAttribute("data-sidebar");
      store.set(SIDEBAR_PREF_KEY, collapsed ? "collapsed" : "expanded");
      sync();
    };
    sync();
    btn.addEventListener("click", onClick);
    return () => btn.removeEventListener("click", onClick);
  }, []);

  // avatar menu (desktop dropdown) / sheet (phone)
  useEffect(() => {
    const shell = ref.current?.closest("[data-student-shell]");
    const d = shell?.querySelector<HTMLDetailsElement>("[data-account-menu]");
    const toggle = shell?.querySelector<HTMLElement>("[data-account-toggle]");
    const panel = shell?.querySelector<HTMLElement>("[data-account-panel]");
    const backdrop = shell?.querySelector<HTMLElement>("[data-account-backdrop]");
    if (!d || !toggle || !panel) return;
    const focusables = () => [toggle, ...[...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.getClientRects().length > 0)];
    const close = (focus = true) => {
      d.open = false;
      if (focus) toggle.focus();
    };
    const onToggle = () => {
      document.documentElement.toggleAttribute("data-account-open", d.open);
      toggle.setAttribute("aria-expanded", String(d.open));
      // the first VISIBLE item (on desktop the sheet-only links are hidden)
      if (d.open) focusables()[1]?.focus();
    };
    const onKey = (e: KeyboardEvent) => {
      if (!d.open) return;
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
    const onDocDown = (e: PointerEvent) => {
      if (d.open && !d.contains(e.target as Node)) close(false);
    };
    const onBackdrop = () => close();
    const onLang = (e: Event) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-lang-choice]");
      if (!b) return;
      const lang = b.dataset.langChoice === "hi" ? "hi" : "en";
      store.set(LANG_PREF_KEY, lang);
      panel.querySelectorAll<HTMLButtonElement>("[data-lang-choice]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      const target = alternate(lang);
      const here = location.pathname;
      if (target && new URL(target).pathname !== here) {
        close(false);
        router.push(new URL(target).pathname);
      }
    };
    toggle.setAttribute("aria-haspopup", "dialog");
    toggle.setAttribute("aria-expanded", "false");
    d.addEventListener("toggle", onToggle);
    d.addEventListener("keydown", onKey);
    panel.addEventListener("click", onLang);
    backdrop?.addEventListener("click", onBackdrop);
    document.addEventListener("pointerdown", onDocDown);
    return () => {
      d.removeEventListener("toggle", onToggle);
      d.removeEventListener("keydown", onKey);
      panel.removeEventListener("click", onLang);
      backdrop?.removeEventListener("click", onBackdrop);
      document.removeEventListener("pointerdown", onDocDown);
      document.documentElement.removeAttribute("data-account-open");
    };
  }, [router]);

  return <span ref={ref} hidden data-student-nav-enhancer="" />;
}
