import React from "react";
import { requireAdminPage } from "@/lib/auth/require-admin";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { isFeatureEnabled } from "@/config/features";
import { AdminTopHeader } from "@/components/admin/admin-top-header";

interface AdminLayoutProps {
  children: React.ReactNode;
}

export default async function AdminLayout({ children }: AdminLayoutProps) {
  // SEC-1C: same page guard as every admin page (anonymous → login, no role → 404). Not a security
  // boundary on its own — each page authorizes itself before fetching.
  const { userEmail } = await requireAdminPage({ allowStaff: true, path: "/admin" });

  return (
    // BRAND-2 (#72): admin is a "never glass" zone (data-no-glass turns every backdrop blur off)
    <div data-no-glass="" className="h-[100dvh] max-h-[100dvh] w-full flex flex-col md:flex-row overflow-hidden bg-slate-900 text-slate-900 antialiased">
      {/* Desktop Fixed Non-Scrolling Sidebar at Viewport Top */}
      <AdminSidebar
        userEmail={userEmail || "admin@couragelibrary.com"}
        adaptiveEnabled={isFeatureEnabled("ADAPTIVE")}
        liveTestsEnabled={isFeatureEnabled("LIVE_TESTS")}
      />

      {/* Main Admin Application Workspace — Clean Light Mode */}
      <div className="flex-1 min-w-0 h-[100dvh] max-h-[100dvh] flex flex-col overflow-hidden bg-canvas">
        {/* Stationary Context Header */}
        <AdminTopHeader userEmail={userEmail} />

        {/* The ONLY Vertically Scrollable Region */}
        <main className="flex-1 min-w-0 w-full overflow-y-auto p-4 sm:p-6 lg:p-7">
          <div className="max-w-[1500px] mx-auto w-full">{children}</div>
        </main>
      </div>
    </div>
  );
}
