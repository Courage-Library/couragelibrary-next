"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { BrandLogo } from "@/components/brand/logo";
import { Avatar } from "@/components/ui/avatar";
import { Button, ButtonLink } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Dialog } from "@/components/ui/dialog";
import { AccountLinks } from "./account-links";
import { NavMenu, navLinkClasses } from "./nav-menu";
import { LEARN_MENU, LEARN_PREFIXES, PUBLIC_NAV, STUDENT_NAV, isActive, visibleItems, type NavItem, type ShellFlags } from "./nav-config";
import type { ShellAccount } from "./shell-types";

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
 * Site header for every non-admin route. Signed out: public nav + Log in / Sign up. Signed in: student nav
 * + account menu (desktop); on phones the student uses the bottom nav and this header keeps a menu button
 * for everything else. The mobile menu is a native-dialog sheet (focus trap, Esc closes).
 */
export function HeaderBar({ account, flags }: { account: ShellAccount | null; flags: ShellFlags }) {
  const pathname = usePathname() ?? "/";
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => setMenuOpen(false), [pathname]);
  if (pathname.startsWith("/admin")) return null;

  const learn = visibleItems(LEARN_MENU, flags);
  const primary = account ? STUDENT_NAV : PUBLIC_NAV;
  const [before, after] = account ? [primary.slice(0, 3), primary.slice(3)] : [primary.slice(0, 2), primary.slice(2)];

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
        <BrandLogo href={account ? "/dashboard" : "/"} size="md" />

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
          {account ? (
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
          ) : (
            <>
              <ButtonLink href="/auth/login" variant="ghost" size="sm" className="hidden sm:inline-flex">
                Log in
              </ButtonLink>
              <ButtonLink href="/auth/signup" size="sm">
                Sign up
              </ButtonLink>
            </>
          )}
          <Button
            variant="ghost"
            size="md"
            iconOnly
            className="lg:hidden"
            aria-label="Open menu"
            aria-haspopup="dialog"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          >
            <Menu aria-hidden="true" className="size-6" />
          </Button>
        </div>
      </div>

      <Dialog open={menuOpen} onOpenChange={setMenuOpen} variant="sheet" title="Menu">
        <nav aria-label="Mobile" className="flex flex-col gap-4">
          <MobileSection title={account ? "Study" : "Explore"} items={primary} pathname={pathname} onNavigate={() => setMenuOpen(false)} />
          <MobileSection title="Learn" items={learn} pathname={pathname} onNavigate={() => setMenuOpen(false)} />
          {!account && (
            <div className="flex flex-col gap-2 border-t border-line pt-4">
              <ButtonLink href="/auth/signup" fullWidth onClick={() => setMenuOpen(false)}>
                Sign up free
              </ButtonLink>
              <ButtonLink href="/auth/login" variant="secondary" fullWidth onClick={() => setMenuOpen(false)}>
                Log in
              </ButtonLink>
            </div>
          )}
        </nav>
      </Dialog>
    </header>
  );
}
