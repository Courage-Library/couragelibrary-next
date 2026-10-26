import React from "react";
import { requireAdminPage } from "@/lib/auth/require-admin";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { isFeatureEnabled } from "@/config/features";
import { isPaymentsEnabled } from "@/config/payments";
import { isSupportTicketsEnabled } from "@/lib/support/tickets";
import { AdminTopHeader } from "@/components/admin/admin-top-header";
import { visibleNav, type NavFlags } from "@/lib/admin/nav";

interface AdminLayoutProps {
  children: React.ReactNode;
}

export default async function AdminLayout({ children }: AdminLayoutProps) {
  // SEC-1C: same page guard as every admin page (anonymous → login, no role → 404). Not a security
  // boundary on its own — each page authorizes itself before fetching.
  const { role } = await requireAdminPage({ allowStaff: true, path: "/admin" });

  // ADMIN-UX-1 phase B (Q1): role-aware links — only pages this role can open, only live features
  const flags: NavFlags = { ADAPTIVE: isFeatureEnabled("ADAPTIVE"), LIVE_TESTS: isFeatureEnabled("LIVE_TESTS"), SUPPORT: isSupportTicketsEnabled(), PAYMENTS: isPaymentsEnabled() };
  const nav = visibleNav(role, flags);
  const searchPlaceholder = role === "admin" ? "Search questions, users, tickets…" : "Search questions and tickets…";

  return (
    // BRAND-2 (#72): admin is a "never glass" zone (data-no-glass turns every backdrop blur off)
    <div data-no-glass="" className="flex h-dvh max-h-dvh w-full flex-col overflow-hidden bg-canvas text-fg antialiased md:flex-row">
      <a
        href="#admin-content"
        className="sr-only z-90 rounded-control bg-surface px-4 py-3 text-body-sm font-semibold text-primary-700 shadow-e2 focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus-ring"
      >
        Skip to admin content
      </a>
      <AdminSidebar nav={nav} />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <AdminTopHeader nav={nav} role={role} searchPlaceholder={searchPlaceholder} />
        {/* the only scrolling region; the root shell already provides the single <main> landmark */}
        <div id="admin-content" tabIndex={-1} className="min-w-0 flex-1 overflow-y-auto p-4 outline-none sm:p-6">
          <div className="mx-auto w-full max-w-[1500px]">{children}</div>
        </div>
      </div>
    </div>
  );
}
