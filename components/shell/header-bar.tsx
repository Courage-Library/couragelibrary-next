"use client";

import { Suspense, use, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { BrandWordmark } from "@/components/brand/wordmark";
import { Avatar } from "@/components/ui/avatar";
import { Button, ButtonLink } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Dialog } from "@/components/ui/dialog";
import { PillLink } from "@/components/ui/pill-button";
import { LANDING_HERO, SHELL_COPY } from "@/content/landing";
import { AccountLinks } from "./account-links";
import { NavMenu, navLinkClasses } from "./nav-menu";
import { LEARN_MENU, LEARN_PREFIXES, PUBLIC_NAV, STUDENT_NAV, isActive, visibleItems, type NavItem, type ShellFlags } from "./nav-config";
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

/** The sign-up-dependent start action: the closed view until the setting is known (and whenever it cannot be read). */
function StartAction({ signup, open, closed }: { signup?: Promise<boolean>; open: ReactNode; closed: ReactNode }) {
  if (!signup) return closed;
  return (
    <Suspense fallback={closed}>
      <ResolvedStartAction signup={signup} open={open} closed={closed} />
    </Suspense>
  );
}

function ResolvedStartAction({ signup, open, closed }: { signup: Promise<boolean>; open: ReactNode; closed: ReactNode }) {
  return use(signup) ? open : closed;
}

/**
 * Site header for every non-admin route. Signed out: public nav + Sign in / Get started. Signed in: student nav
 * + account menu (desktop); on phones the student uses the bottom nav and this header keeps a menu button
 * for everything else. UX-2a: the landing page ("/") always shows the public header; a signed-in visitor sees
 * "Go to dashboard" there instead of Sign in / Get started. The mobile menu is a native-dialog sheet (focus
 * trap, Esc closes). Content width 1200 px (decision #46).
 * HOME-1 design decision (owner, 2026-11-01; supersedes the #72 floating glass pill for the public header): ONE solid,
 * full-width, sticky white header for everyone — hairline bottom border, a subtle shadow only after the page scrolls
 * (box-shadow only: no layout shift), 64 px tall, nothing visible behind it. 48 px actions.
 * UX-FIX-1: "Sign in" is always visible in the bar (phones too). While public sign-up is CLOSED no action points to
 * /auth/signup — the start action is "Explore SSC CGL"; when it is open the one label is "Start free" as an outline
 * pill (BRAND-3 R4: the solid blue-700 primary belongs to the page — the header never adds a second solid CTA). `signup` is a promise streamed from AppShell: the start action resolves it in its own Suspense
 * boundary whose fallback is the closed view, so the shell never waits on the sign-up setting (Supabase outage → the
 * page still renders at once; AUTH1-RESILIENCE-HANG).
 */
export function HeaderBar({
  account,
  flags,
  signup,
  logo = null,
  publicStatic = false,
}: {
  account: ShellAccount | null;
  flags: ShellFlags;
  signup?: Promise<boolean>;
  logo?: BrandImage | null;
  /** PERF-HOME-1: the cached public pages — both link sets in the HTML, CSS shows one (html[data-auth], lib/ui/auth-hint.ts) */
  publicStatic?: boolean;
}) {
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
  const onLanding = pathname === "/";
  const student = account !== null && !onLanding;
  const primary = visibleItems(student ? STUDENT_NAV : PUBLIC_NAV, flags);
  const [before, after] = student ? [primary.slice(0, 3), primary.slice(3)] : [primary.slice(0, 1), primary.slice(1)];

  const inner = (
    <>
        <BrandWordmark href={student ? "/dashboard" : "/"} size="md" logo={logo} />

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
          {account && student ? (
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
          ) : account ? (
            <PillLink href="/dashboard" variant="outline" className="px-5">
              {SHELL_COPY.goToDashboard}
            </PillLink>
          ) : (
            <>
              {publicStatic && (
                <span className="auth-in contents">
                  <PillLink href="/dashboard" variant="outline" className="px-5" data-auth-link="dashboard">
                    {SHELL_COPY.goToDashboard}
                  </PillLink>
                </span>
              )}
              <span className={publicStatic ? "auth-out contents" : "contents"}>
              <ButtonLink href="/auth/login" variant="ghost" size="md" className="min-h-12 rounded-control px-3">
                {SHELL_COPY.signIn}
              </ButtonLink>
              <StartAction
                signup={signup}
                open={
                  <PillLink href="/auth/signup" variant="outline" className="hidden px-5 sm:inline-flex">
                    {SHELL_COPY.startFree}
                  </PillLink>
                }
                closed={
                  <PillLink href={LANDING_HERO.secondaryCta.href} variant="outline" className="hidden px-5 sm:inline-flex">
                    {LANDING_HERO.secondaryCta.label}
                  </PillLink>
                }
              />
              </span>
            </>
          )}
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
            <BrandWordmark href={student ? "/dashboard" : "/"} size="sm" logo={logo} />
          </div>
          <MobileSection title={student ? "Study" : "Explore"} items={primary} pathname={pathname} onNavigate={() => setMenuOpen(false)} />
          <MobileSection title="Learn" items={learn} pathname={pathname} onNavigate={() => setMenuOpen(false)} />
          {!account && publicStatic && (
            <div className="auth-in flex flex-col gap-2 border-t border-line pt-4">
              <ButtonLink href="/dashboard" size="lg" fullWidth onClick={() => setMenuOpen(false)}>
                {SHELL_COPY.goToDashboard}
              </ButtonLink>
            </div>
          )}
          {!account && (
            <div className={`${publicStatic ? "auth-out " : ""}flex flex-col gap-2 border-t border-line pt-4`}>
              <StartAction
                signup={signup}
                open={
                  <PillLink href="/auth/signup" variant="outline" fullWidth onClick={() => setMenuOpen(false)}>
                    {SHELL_COPY.startFree}
                  </PillLink>
                }
                closed={
                  <ButtonLink href={LANDING_HERO.secondaryCta.href} size="lg" fullWidth onClick={() => setMenuOpen(false)}>
                    {LANDING_HERO.secondaryCta.label}
                  </ButtonLink>
                }
              />
              <ButtonLink href="/auth/login" variant="secondary" size="lg" fullWidth onClick={() => setMenuOpen(false)}>
                {SHELL_COPY.signIn}
              </ButtonLink>
            </div>
          )}
          {account && !student && (
            <div className="flex flex-col gap-2 border-t border-line pt-4">
              <ButtonLink href="/dashboard" size="lg" fullWidth onClick={() => setMenuOpen(false)}>
                {SHELL_COPY.goToDashboard}
              </ButtonLink>
            </div>
          )}
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
