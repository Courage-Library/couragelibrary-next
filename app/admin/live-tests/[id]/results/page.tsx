import React from "react";
import { notFound } from "next/navigation";
import { createAdminServerSupabaseClient } from "@/lib/supabase/server";
import { LiveTestResultService } from "@/services/live-test-result.service";
import { AdminLiveTestResultsManager } from "@/components/admin/live-tests/admin-live-test-results-manager";

interface Props {
  params: Promise<{ id: string }>;
}

export const metadata = {
  title: "Admin Live Test Results Manager | Courage Library",
};

export default async function AdminLiveTestResultsPage({ params }: Props) {
  const { id } = await params;
  const adminSb = createAdminServerSupabaseClient();

  // 1. Fetch Event
  const { data: event } = await (adminSb as any)
    .from("live_test_events")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!event) {
    notFound();
  }

  // 2. Fetch Snapshots Summary
  const summary = await LiveTestResultService.getAdminResultsSummary(id);

  // 3. Fetch Top Leaderboard Entries
  const targetSnapshotId = summary.activeSnapshot?.id || summary.snapshots[0]?.id;
  let leaderboardEntries: any[] = [];
  if (targetSnapshotId) {
    const { data: entries } = await (adminSb as any)
      .from("live_test_leaderboard_entries")
      .select("*")
      .eq("snapshot_id", targetSnapshotId)
      .order("rank", { ascending: true })
      .order("time_spent_seconds", { ascending: true })
      .limit(100);

    leaderboardEntries = entries || [];
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <AdminLiveTestResultsManager
        event={event}
        snapshots={summary.snapshots}
        activeSnapshot={summary.activeSnapshot}
        leaderboardEntries={leaderboardEntries}
      />
    </div>
  );
}
