"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { logoutAction } from "@/app/auth/actions";
import { cn } from "@/components/ui/cn";
import { ACCOUNT_MENU, isActive, type NavItem } from "./nav-config";
import type { ShellAccount } from "./shell-types";
import { ONBOARDING_COPY } from "@/content/onboarding";

export function accountItems(account: ShellAccount): NavItem[] {
  const base = account.profile ? [{ href: "/settings/profile", label: "Profile" }, ...ACCOUNT_MENU] : ACCOUNT_MENU;
  const items = account.studyPreferences ? [...base, { href: "/onboarding", label: ONBOARDING_COPY.menuLink }] : base;
  return account.isStaff ? [...items, { href: "/admin", label: "Admin studio" }] : items;
}

/** Account links + sign out, shared by the desktop account menu and the mobile account sheet. */
export function AccountLinks({ account, onNavigate }: { account: ShellAccount; onNavigate?: () => void }) {
  const pathname = usePathname() ?? "/";
  return (
    <div className="flex flex-col gap-1">
      <div className="px-3 py-2">
        <p className="text-body-sm font-semibold text-fg">{account.name}</p>
        {account.email && <p className="truncate text-body-sm text-fg-secondary">{account.email}</p>}
      </div>
      <ul aria-label="Account" className="flex flex-col">
        {accountItems(account).map((it) => {
          const current = isActive(pathname, it);
          return (
            <li key={it.href}>
              <Link
                href={it.href}
                onClick={onNavigate}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "focus-ring flex min-h-11 items-center rounded-control px-3 text-body-sm font-medium",
                  current ? "bg-primary-50 text-primary-700" : "text-fg hover:bg-ink-100",
                )}
              >
                {it.label}
              </Link>
            </li>
          );
        })}
      </ul>
      <form action={logoutAction} className="border-t border-line pt-1">
        <button
          type="submit"
          className="focus-ring flex min-h-11 w-full items-center gap-2 rounded-control px-3 text-left text-body-sm font-medium text-danger-700 hover:bg-danger-50"
        >
          <LogOut aria-hidden="true" className="size-4" />
          Sign out
        </button>
      </form>
    </div>
  );
}
