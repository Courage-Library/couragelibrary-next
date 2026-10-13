import React from "react";
import { requireAdminPage } from "@/lib/auth/require-admin";
import { isFeatureEnabled } from "@/config/features";
import { FeatureDisabledPanel } from "@/components/admin/feature-disabled-panel";
import AdminEventCompetitionIntelligenceDeepDivePage from "./event-intelligence-client";

export const dynamic = "force-dynamic";

/** SEC-1C: server wrapper — authorizes before the client view (and its data calls) is sent. */
export default async function AdminEventCompetitionIntelligenceDeepDivePageRoute() {
  await requireAdminPage({ path: "/admin/live-tests" }); // SEC-1C: admin only
  if (!isFeatureEnabled("LIVE_TESTS")) return <FeatureDisabledPanel feature="LIVE_TESTS" />;
  return <AdminEventCompetitionIntelligenceDeepDivePage />;
}
