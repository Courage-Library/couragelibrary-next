"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ComponentType } from "react";
import {
  BarChart3, BookOpen, Building2, CalendarClock, ChevronDown, ClipboardCheck, Coins, CreditCard, FileQuestion, Flag,
  GraduationCap, Library, LifeBuoy, ListTree, Menu, Newspaper, Palette, Radio, ShieldCheck, Sparkles, Star, Trophy, Users, X,
  LayoutDashboard, Gift,
} from "lucide-react";
import { cn } from "@/components/ui/cn";
import { activeHref, type NavGroup, type NavIcon, type NavItem } from "@/lib/admin/nav";

/**
 * ADMIN-UX-1 phase B sidebar. Links come ONLY from lib/admin/nav.ts, already filtered for the role + flags on the server
 * (role-aware visibility is UI only — every page keeps its own guard).
 *   ≥ 1280 px: 248 px sidebar, scrolls on its own (never clipped at any height)
 *   768–1279 px: 64 px icon rail (labels for assistive tech + tooltip); "Menu" opens the full list
 *   < 768 px: a top bar "Menu" button opens the full list in a modal drawer (native <dialog>: focus trapped, Esc closes)
 * One aria-current="page" (longest-prefix match), real <button aria-expanded> for groups, visible focus everywhere.
 */
const ICONS: Record<NavIcon, ComponentType<{ className?: string; "aria-hidden"?: boolean }>> = {
  today: LayoutDashboard, drafts: ClipboardCheck, reports: FileQuestion, news: Newspaper, flag: Flag, questions: FileQuestion,
  mocks: CalendarClock, learning: BookOpen, syllabus: ListTree, exams: GraduationCap, users: Users, tickets: LifeBuoy,
  library: Library, institutes: Building2, billing: CreditCard, premium: Star, security: ShieldCheck, design: Palette,
  rewards: Gift, coins: Coins, badge: Trophy, live: Radio, adaptive: Sparkles,
};

function containsActive(item: NavItem, active: string | null): boolean {
  return !!active && (item.href === active || !!item.children?.some((c) => c.href === active));
}

function NavTree({ nav, active, rail, onNavigate }: { nav: NavGroup[]; active: string | null; rail: boolean; onNavigate?: () => void }) {
  const [openItems, setOpenItems] = useState<Record<string, boolean>>({});
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  return (
    <ul className="flex flex-col gap-1">
      {nav.map((g) => {
        const groupHasActive = g.items.some((it) => containsActive(it, active));
        const groupOpen = !g.collapsed || groupHasActive || openGroups[g.id] === true;
        return (
          <li key={g.id} className={cn(g.label && "mt-3 first:mt-0")}>
            {g.label &&
              (rail ? (
                <div className="mx-auto my-1 h-px w-8 bg-white/15" aria-hidden="true" />
              ) : g.collapsed ? (
                <button
                  type="button"
                  aria-expanded={groupOpen}
                  onClick={() => setOpenGroups((o) => ({ ...o, [g.id]: !groupOpen }))}
                  className="focus-ring-on-dark flex min-h-9 w-full items-center justify-between rounded-control px-3 text-caption font-semibold uppercase tracking-wide text-primary-200 hover:text-white"
                >
                  {g.label}
                  <ChevronDown aria-hidden="true" className={cn("size-4 transition-transform", groupOpen && "rotate-180")} />
                </button>
              ) : (
                <p className="px-3 pb-1 text-caption font-semibold uppercase tracking-wide text-primary-200">{g.label}</p>
              ))}
            {(groupOpen || rail) && (
              <ul className="flex flex-col gap-0.5" aria-label={g.label ?? undefined}>
                {g.items.map((it) => {
                  const Icon = ICONS[it.icon];
                  const hasKids = !!it.children?.length && !rail;
                  const itemActive = containsActive(it, active);
                  const expanded = hasKids && (itemActive || openItems[it.href + it.label] === true);
                  const linkClass = (on: boolean) =>
                    cn(
                      "focus-ring-on-dark flex min-h-10 items-center gap-3 rounded-control px-3 text-body-sm font-medium text-primary-100 hover:bg-white/10 hover:text-white",
                      rail && "justify-center px-0",
                      on && "bg-white/15 font-semibold text-white shadow-[inset_3px_0_0_var(--color-primary-400)]",
                    );
                  if (!hasKids) {
                    const on = it.href === active || (rail && itemActive);
                    return (
                      <li key={it.href + it.label}>
                        <Link href={it.href} aria-current={on ? "page" : undefined} className={linkClass(on)} title={rail ? it.label : undefined} onClick={onNavigate}>
                          <Icon aria-hidden={true} className="size-5 shrink-0" />
                          <span className={cn(rail && "sr-only")}>{it.label}</span>
                        </Link>
                      </li>
                    );
                  }
                  return (
                    <li key={it.href + it.label}>
                      <button
                        type="button"
                        aria-expanded={expanded}
                        onClick={() => setOpenItems((o) => ({ ...o, [it.href + it.label]: !expanded }))}
                        className={cn(linkClass(false), "w-full justify-between", itemActive && "text-white")}
                      >
                        <span className="flex items-center gap-3">
                          <Icon aria-hidden={true} className="size-5 shrink-0" />
                          {it.label}
                        </span>
                        <ChevronDown aria-hidden="true" className={cn("size-4 transition-transform", expanded && "rotate-180")} />
                      </button>
                      {expanded && (
                        <ul className="ml-8 mt-0.5 flex flex-col gap-0.5 border-l border-white/15 pl-2">
                          {it.children!.map((c) => {
                            const on = c.href === active;
                            return (
                              <li key={c.href}>
                                <Link href={c.href} aria-current={on ? "page" : undefined} className={cn(linkClass(on), "min-h-9")} onClick={onNavigate}>
                                  {c.label}
                                </Link>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Brand({ rail }: { rail: boolean }) {
  return (
    <Link href="/admin" className="focus-ring-on-dark mb-3 flex min-h-11 items-center gap-2 rounded-control px-3 text-white">
      <BarChart3 aria-hidden="true" className="size-6 shrink-0 text-primary-300" />
      <span className={cn("text-body font-bold", rail && "sr-only")}>Courage Library · Admin</span>
    </Link>
  );
}

export function AdminSidebar({ nav }: { nav: NavGroup[] }) {
  const pathname = usePathname() || "/admin";
  const active = activeHref(pathname, nav);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (drawerOpen && !d.open) d.showModal();
    if (!drawerOpen && d.open) d.close();
  }, [drawerOpen]);
  useEffect(() => setDrawerOpen(false), [pathname]);

  return (
    <>
      {/* < 768 px: top bar with the menu button */}
      <div className="flex min-h-14 items-center gap-2 bg-primary-900 px-3 md:hidden">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="focus-ring-on-dark inline-flex size-11 items-center justify-center rounded-control text-white hover:bg-white/10"
          aria-label="Open admin menu"
        >
          <Menu aria-hidden="true" className="size-6" />
        </button>
        <span className="text-body font-bold text-white">Courage Library · Admin</span>
      </div>

      {/* 768–1279 px rail */}
      <aside aria-label="Admin navigation" className="hidden h-dvh w-16 shrink-0 flex-col overflow-y-auto bg-primary-900 px-2 py-3 md:flex xl:hidden">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="focus-ring-on-dark mb-2 inline-flex size-11 items-center justify-center self-center rounded-control text-white hover:bg-white/10"
          aria-label="Show all admin links"
          title="Show all admin links"
        >
          <Menu aria-hidden="true" className="size-5" />
        </button>
        <nav aria-label="Admin">
          <NavTree nav={nav} active={active} rail />
        </nav>
      </aside>

      {/* ≥ 1280 px full sidebar */}
      <aside aria-label="Admin navigation" className="hidden h-dvh w-62 shrink-0 flex-col overflow-y-auto bg-primary-900 px-3 py-4 xl:flex">
        <Brand rail={false} />
        <nav aria-label="Admin">
          <NavTree nav={nav} active={active} rail={false} />
        </nav>
      </aside>

      {/* the drawer (phones + rail "Menu"): native modal dialog */}
      <dialog
        ref={dialogRef}
        aria-label="Admin menu"
        onClose={() => setDrawerOpen(false)}
        onClick={(e) => {
          if (e.target === e.currentTarget) setDrawerOpen(false);
        }}
        className="m-0 h-dvh max-h-none w-72 max-w-[85vw] bg-primary-900 p-0 backdrop:bg-ink-950/50"
      >
        <div className="flex h-full flex-col overflow-y-auto px-3 py-4">
          <div className="mb-2 flex items-center justify-between">
            <Brand rail={false} />
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              className="focus-ring-on-dark inline-flex size-11 items-center justify-center rounded-control text-white hover:bg-white/10"
              aria-label="Close admin menu"
            >
              <X aria-hidden="true" className="size-5" />
            </button>
          </div>
          <nav aria-label="Admin (menu)">
            <NavTree nav={nav} active={active} rail={false} onNavigate={() => setDrawerOpen(false)} />
          </nav>
        </div>
      </dialog>
    </>
  );
}
