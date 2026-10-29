import React from "react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/auth/require-admin";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { isFeatureEnabled } from "@/config/features";
import { isPaymentsEnabled } from "@/config/payments";
import { isSupportTicketsEnabled } from "@/lib/support/tickets";
import { AdminTopHeader } from "@/components/admin/admin-top-header";
import { isAdminOnlyPath, visibleNav, type NavFlags } from "@/lib/admin/nav";
import { PATHNAME_HEADER } from "@/lib/http/pathname-header";
import { getAdminFirstName, getFocusQueueCount } from "@/lib/admin/today";

interface AdminLayoutProps {
  children: React.ReactNode;
}

export default async function AdminLayout({ children }: AdminLayoutProps) {
  // SEC-1C: same page guard as every admin page (anonymous → login, no role → 404). Not a security
  // boundary on its own — each page authorizes itself before fetching.
  const { role, userId } = await requireAdminPage({ allowStaff: true, path: "/admin" });

  // SEC-1C L-04 (option (a)): a staff user asking for an ADMIN-ONLY route gets the site 404 here, BEFORE any admin shell
  // renders or streams (single source: ADMIN_ONLY_ROUTES in lib/admin/nav.ts; the middleware forwards the pathname).
  // The page's own guard stays as defence in depth.
  if (role !== "admin" && isAdminOnlyPath((await headers()).get(PATHNAME_HEADER))) notFound();

  // ADMIN-UX-1 phase B (Q1): role-aware links — only pages this role can open, only live features
  const flags: NavFlags = { ADAPTIVE: isFeatureEnabled("ADAPTIVE"), LIVE_TESTS: isFeatureEnabled("LIVE_TESTS"), SUPPORT: isSupportTicketsEnabled(), PAYMENTS: isPaymentsEnabled() };
  const nav = visibleNav(role, flags);
  // Courage Studio: the Focus review badge (a count only; read after the guard, server side)
  const [inReview, firstName] = await Promise.all([getFocusQueueCount(), getAdminFirstName(userId)]);
  const searchPlaceholder = role === "admin" ? "Search questions, users, tickets…" : "Search questions and tickets…";

  return (
    // BRAND-2 (#72): admin is a "never glass" zone (data-no-glass turns every backdrop blur off)
    // SHELL-SCROLL-FIX-1: exactly one viewport tall and a containing block (relative): absolutely positioned descendants
    // (sr-only labels, menus) are clipped here instead of stretching the document; #admin-content is the ONE scroller
    <div data-admin-shell="" data-no-glass="" className="relative flex h-dvh max-h-dvh w-full flex-col overflow-hidden bg-canvas text-fg antialiased md:flex-row">
      <a
        href="#admin-content"
        className="sr-only z-90 rounded-control bg-surface px-4 py-3 text-body-sm font-semibold text-primary-700 shadow-e2 focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus-ring"
      >
        Skip to admin content
      </a>
      <AdminSidebar nav={nav} badges={{ inReview }} />

      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <AdminTopHeader nav={nav} role={role} firstName={firstName} searchPlaceholder={searchPlaceholder} />
        {/* the only scrolling region; the root shell already provides the single <main> landmark */}
        <div id="admin-content" tabIndex={-1} className="relative min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain p-4 outline-none sm:p-6 xl:px-[30px] xl:py-6">
          <div className="mx-auto w-full max-w-[1500px]">{children}</div>
        </div>
      </div>
    </div>
  );
}
