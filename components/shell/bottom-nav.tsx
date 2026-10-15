"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, CircleUserRound, ClipboardList, LayoutDashboard, RotateCcw } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { Dialog } from "@/components/ui/dialog";
import { AccountLinks, accountItems } from "./account-links";
import { CONSOLE_ROUTES, LEARN_PREFIXES, isActive } from "./nav-config";
import type { ShellAccount } from "./shell-types";

const ITEMS = [
  { href: "/dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { href: "/mock-tests", label: "Tests", Icon: ClipboardList },
  { href: "/mistakes", label: "Mistakes", Icon: RotateCcw },
  { href: "/practice", label: "Learn", Icon: BookOpen, match: LEARN_PREFIXES },
];

const itemClasses = (active: boolean) =>
  cn(
    "focus-ring flex min-h-14 w-full flex-col items-center justify-center gap-0.5 rounded-control px-1 text-caption font-medium",
    active ? "text-primary-700" : "text-fg-secondary hover:text-fg",
  );

/**
 * Signed-in student bottom nav for phones and tablets (hidden from lg, where the header nav takes over).
 * Labels are always visible; the active item has aria-current="page". A spacer of the same height
 * (64 px + 1 px border + safe area) sits in
 * the page flow and both are server-rendered, so nothing shifts. Hidden in admin and in the test console.
 */
export function BottomNav({ account }: { account: ShellAccount }) {
  const pathname = usePathname() ?? "/";
  const [accountOpen, setAccountOpen] = useState(false);
  useEffect(() => setAccountOpen(false), [pathname]);
  if (pathname.startsWith("/admin") || CONSOLE_ROUTES.some((r) => r.test(pathname))) return null;
  const accountActive = accountItems(account).some((it) => isActive(pathname, it));

  return (
    <>
      <div aria-hidden="true" className="h-[calc(4rem+1px+env(safe-area-inset-bottom))] lg:hidden" />
      <nav
        aria-label="Student"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <ul className="mx-auto grid h-16 max-w-xl grid-cols-5 items-center px-1">
          {ITEMS.map(({ href, label, Icon, match }) => {
            const active = isActive(pathname, { href, match });
            return (
              <li key={href}>
                <Link href={href} aria-current={active ? "page" : undefined} className={itemClasses(active)}>
                  <Icon aria-hidden="true" className="size-6" />
                  {label}
                </Link>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              aria-haspopup="dialog"
              aria-expanded={accountOpen}
              onClick={() => setAccountOpen(true)}
              className={itemClasses(accountActive)}
            >
              <CircleUserRound aria-hidden="true" className="size-6" />
              Account
            </button>
          </li>
        </ul>
      </nav>
      <Dialog open={accountOpen} onOpenChange={setAccountOpen} variant="sheet" title="Account">
        <AccountLinks account={account} onNavigate={() => setAccountOpen(false)} />
      </Dialog>
    </>
  );
}
