"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { pageContext, type AdminRole, type NavGroup } from "@/lib/admin/nav";
import { AdminSearch } from "@/components/admin/admin-search";

/**
 * ADMIN-UX-1 phase B header: where you are (group / page, from the same nav config), global search (Ctrl/Cmd+K), the
 * real role (no hard-coded "Super Admin", no e-mail, no decorative badges or dead bell), and a link to the student site.
 */
export function AdminTopHeader({ nav, role, firstName, searchPlaceholder }: { nav: NavGroup[]; role: AdminRole; firstName: string | null; searchPlaceholder: string }) {
  const pathname = usePathname() || "/admin";
  const { title, group } = pageContext(pathname, nav);
  return (
    <header className="flex min-h-14 shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-surface px-4 py-2 lg:px-6">
      <p className="min-w-0 text-body-sm text-fg-secondary" data-admin-location="">
        {group && <span>{group} / </span>}
        <span className="font-semibold text-fg">{title}</span>
      </p>
      <div className="order-last w-full sm:order-none sm:w-auto sm:flex-1">
        <AdminSearch placeholder={searchPlaceholder} nav={nav} />
      </div>
      <div className="ml-auto flex items-center gap-2">
        <Link href="/" className="focus-ring inline-flex min-h-9 items-center gap-1 rounded-control px-2 text-[13px] font-semibold text-primary-700 hover:bg-primary-50">
          Student site <ExternalLink aria-hidden="true" className="size-3.5" />
        </Link>
        <span className="rounded-badge border border-line bg-ink-50 px-2 py-0.5 text-[11.5px] font-semibold text-fg-secondary" data-admin-role={role}>
          {role === "admin" ? "Admin" : "Staff"}
        </span>
        {/* STUDIO-P2-POLISH: first name + initial avatar (from the own profile; never the e-mail) */}
        <span className="flex items-center gap-2" data-admin-person="">
          {firstName && <span className="text-[14px] font-semibold text-fg">{firstName}</span>}
          <span aria-hidden="true" className="brand-gradient flex size-9 items-center justify-center rounded-full text-[14px] font-bold text-white">
            {(firstName ?? (role === "admin" ? "A" : "S")).charAt(0).toUpperCase()}
          </span>
        </span>
      </div>
    </header>
  );
}
