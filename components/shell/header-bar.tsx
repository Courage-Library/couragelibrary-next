"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Coins, Menu } from "lucide-react";
import { BrandWordmark } from "@/components/brand/wordmark";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Dialog } from "@/components/ui/dialog";
import { AccountLinks } from "./account-links";
import { NavMenu, navLinkClasses } from "./nav-menu";
import { LEARN_MENU, LEARN_PREFIXES, STUDENT_NAV, isActive, visibleItems, type NavItem, type ShellFlags } from "./nav-config";
import type { ShellAccount } from "./shell-types";
import type { BrandImage } from "@/lib/brand/brand-rules";

function NavLinks({ items, pathname }: { items: NavItem[]; pathname: string }) {
  return (
    <>
      {items.map((it) => {
        const current = isActive(pathname, it);
        return (
          <li key={it.href}>
            <Link href={it.href} aria-current={current ? "page" : undefined} className={navLinkClasses(current)}>
              {it.label}
            </Link>
          </li>
        );
      })}
    </>
  );
}

function MobileSection({ title, items, pathname, onNavigate }: { title: string; items: NavItem[]; pathname: string; onNavigate: () => void }) {
  return (
    <section aria-label={title} className="flex flex-col gap-1">
      <h3 className="px-3 text-caption font-semibold uppercase tracking-wide text-fg-secondary">{title}</h3>
      <ul className="flex flex-col">
        {items.map((it) => {
          const current = isActive(pathname, it);
          return (
            <li key={it.href}>
              <Link
                href={it.href}
                onClick={onNavigate}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "focus-ring flex min-h-12 items-center rounded-control px-3 text-body font-medium",
                  current ? "bg-primary-50 text-primary-700" : "text-fg hover:bg-ink-100",
                )}
              >
                {it.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * COURSE-UX-1: the coin balance (COINS_LESSON_EARN on only). The shell makes no database query (UX-1b U-5): the browser
 * asks /api/coins/balance (the student's own wallet row) after the page is shown; nothing while loading or unknown, so
 * the header never shifts (the slot keeps its width only once a number exists, beside the account menu).
 */
function CoinBalance({ enabled }: { enabled?: boolean }) {
  const [n, setN] = useState<number | null>(null);
  const pathname = usePathname();
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    fetch("/api/coins/balance", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { balance?: unknown } | null) => live && setN(typeof j?.balance === "number" ? j.balance : null))
      .catch(() => null);
    return () => {
      live = false;
    };
  }, [enabled, pathname]);
  if (!enabled || n === null) return null;
  return (
    <Link href="/wallet" className="focus-ring inline-flex min-h-12 items-center gap-1.5 rounded-control px-3 text-body-sm font-semibold text-fg hover:bg-ink-50" data-testid="header-coins">
      <Coins aria-hidden="true" className="size-5 text-primary-700" />
      <span>{n}</span>
      <span className="sr-only">coins</span>
    </Link>
  );
}

/**
 * The SIGNED-IN header (student nav + account menu on desktop; on phones the bottom nav + this menu button).
 * NAV-1 Stage A: every visitor (signed out) gets THE visitor header (components/nav/visitor-header.tsx) instead — this
 * component is now signed-in only; NAV-1 Stage B replaces it with the student shell (sidebar / bottom bar).
 * HOME-1 design decision (owner, 2026-11-01): ONE solid, full-width, sticky white header — hairline bottom border, a
 * subtle shadow only after the page scrolls (box-shadow only: no layout shift), 64 px tall. 48 px actions. The mobile
 * menu is a native-dialog sheet (focus trap, Esc closes). Content width 1200 px (decision #46).
 */
export function HeaderBar({ account, flags, logo = null }: { account: ShellAccount; flags: ShellFlags; logo?: BrandImage | null }) {
  const pathname = usePathname() ?? "/";
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => setMenuOpen(false), [pathname]);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  if (pathname.startsWith("/admin")) return null;

  const learn = visibleItems(LEARN_MENU, flags);
  const primary = visibleItems(STUDENT_NAV, flags);
  const [before, after] = [primary.slice(0, 3), primary.slice(3)];

  const inner = (
    <>
        <BrandWordmark href="/dashboard" size="md" logo={logo} />

        <nav aria-label="Main" className="ml-4 hidden flex-1 lg:block">
          <ul className="flex items-center gap-1">
            <NavLinks items={before} pathname={pathname} />
            <li>
              <NavMenu label="Learn" listLabel="Learn" items={learn} activePrefixes={LEARN_PREFIXES} />
            </li>
            <NavLinks items={after} pathname={pathname} />
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <CoinBalance enabled={account.lessonCoins} />
          <div className="hidden lg:block">
            <NavMenu
              label={
                <>
                  <Avatar name={account.name} size="sm" decorative />
                  <span className="max-w-32 truncate">{account.name}</span>
                </>
              }
              triggerLabel={`Account: ${account.name}`}
              listLabel="Account"
              align="end"
              activePrefixes={["/notifications", "/wallet", "/store", "/billing", "/premium"]}
            >
              <AccountLinks account={account} />
            </NavMenu>
          </div>
          <Button
            variant="ghost"
            size="md"
            iconOnly
            className="size-12 rounded-control lg:hidden"
            aria-label="Open menu"
            aria-haspopup="dialog"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          >
            <Menu aria-hidden="true" className="size-6" />
          </Button>
        </div>
    </>
  );

  const menu = (
      <Dialog open={menuOpen} onOpenChange={setMenuOpen} variant="sheet" title="Menu">
        <nav aria-label="Mobile" className="flex flex-col gap-4">
          <div className="border-b border-line pb-3" data-menu-brand="">
            <BrandWordmark href="/dashboard" size="sm" logo={logo} />
          </div>
          <MobileSection title="Study" items={primary} pathname={pathname} onNavigate={() => setMenuOpen(false)} />
          <MobileSection title="Learn" items={learn} pathname={pathname} onNavigate={() => setMenuOpen(false)} />
        </nav>
      </Dialog>
  );

  return (
    <header className={cn("sticky top-0 z-30 border-b border-line bg-surface transition-shadow duration-120", scrolled ? "shadow-e2" : "shadow-none")} data-header-solid="" data-scrolled={scrolled ? "" : undefined}>
      <div className="mx-auto flex h-16 w-full max-w-[1200px] items-center gap-4 px-4 md:px-6 lg:px-8">{inner}</div>
      {menu}
    </header>
  );
}
