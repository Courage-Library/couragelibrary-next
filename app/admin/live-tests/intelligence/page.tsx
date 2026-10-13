import React from "react";
import { requireAdminPage } from "@/lib/auth/require-admin";
import { isFeatureEnabled } from "@/config/features";
import { FeatureDisabledPanel } from "@/components/admin/feature-disabled-panel";
import AdminMacroCompetitionIntelligencePage from "./macro-intelligence-client";

export const dynamic = "force-dynamic";

/** SEC-1C: server wrapper — authorizes before the client view (and its data calls) is sent. */
export default async function AdminMacroCompetitionIntelligencePageRoute() {
  await requireAdminPage({ path: "/admin/live-tests/intelligence" }); // SEC-1C: admin only
  if (!isFeatureEnabled("LIVE_TESTS")) return <FeatureDisabledPanel feature="LIVE_TESTS" />;
  return <AdminMacroCompetitionIntelligencePage />;
}
