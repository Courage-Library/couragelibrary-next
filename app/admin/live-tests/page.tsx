import { isFeatureEnabled } from "@/config/features";
import { FeatureDisabledPanel } from "@/components/admin/feature-disabled-panel";
import React from "react";
import { createAdminServerSupabaseClient } from "@/lib/supabase/server";
import { AdminLiveTestsManager } from "@/components/admin/live-tests/admin-live-tests-manager";
import { requireAdminPage } from "@/lib/auth/require-admin";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Admin Live Tests Manager | Courage Library",
};

export default async function AdminLiveTestsPage() {
  await requireAdminPage({ allowStaff: true, path: "/admin/live-tests" });
  if (!isFeatureEnabled("LIVE_TESTS")) return <FeatureDisabledPanel feature="LIVE_TESTS" />;
  const adminSb = createAdminServerSupabaseClient();

  // 1. Fetch events
  const { data: events } = await (adminSb as any)
    .from("live_test_events")
    .select("*")
    .order("created_at", { ascending: false });

  // 2. Fetch exams
  const { data: exams } = await (adminSb as any)
    .from("exams")
    .select("id, title")
    .order("title", { ascending: true });

  // 3. Fetch mock tests
  const { data: mockTests } = await (adminSb as any)
    .from("mock_tests")
    .select("id, title, duration_minutes")
    .order("title", { ascending: true });

  return (
    <div className="container mx-auto px-4 py-8">
      <AdminLiveTestsManager
        initialEvents={events || []}
        exams={exams || []}
        mockTests={mockTests || []}
      />
    </div>
  );
}
