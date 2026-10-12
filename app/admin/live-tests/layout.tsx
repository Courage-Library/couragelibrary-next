import React from "react";
import { isFeatureEnabled } from "@/config/features";
import { FeatureDisabledPanel } from "@/components/admin/feature-disabled-panel";

/** Quarantine gate for every /admin/live-tests/** page (incl. client-rendered intelligence views). */
export default function AdminLiveTestsLayout({ children }: { children: React.ReactNode }) {
  if (!isFeatureEnabled("LIVE_TESTS")) return <FeatureDisabledPanel feature="LIVE_TESTS" />;
  return <>{children}</>;
}
