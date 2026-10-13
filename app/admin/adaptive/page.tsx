import { isFeatureEnabled } from "@/config/features";
import { FeatureDisabledPanel } from "@/components/admin/feature-disabled-panel";
import React from "react";
import { AdminAdaptiveService } from "@/services/admin-adaptive.service";
import { AdminAdaptiveManager } from "@/components/admin/adaptive/admin-adaptive-manager";
import { requireAdminPage } from "@/lib/auth/require-admin";

export const metadata = {
  title: "Adaptive Testing Control Center | Admin Studio | Courage Library",
  description: "Server-authoritative Computerized Adaptive Testing (CAT) governance, algorithm versioning, psychometrics, and emergency controls.",
};

export const dynamic = "force-dynamic";

export default async function AdminAdaptivePage() {
  const auth = await requireAdminPage({ path: "/admin/adaptive" }); // SEC-1C: admin only
  if (!isFeatureEnabled("ADAPTIVE")) return <FeatureDisabledPanel feature="ADAPTIVE" />;

  // Load overview, blueprints, calibrations, audit logs, ability estimation, CAT, stopping & personalization telemetry in parallel
  const [
    overview,
    configs,
    calibrations,
    auditLogs,
    estimatorConfig,
    estimatorHealth,
    explorerAttempts,
    catConfig,
    catHealth,
    stoppingConfig,
    stoppingHealth,
    personalizationConfig,
    personalizationHealth,
  ] = await Promise.all([
    AdminAdaptiveService.getOverview(),
    AdminAdaptiveService.getAdaptiveConfigs(),
    AdminAdaptiveService.getItemCalibrations({ limit: 50 }),
    AdminAdaptiveService.getAuditLogs({ limit: 50 }),
    AdminAdaptiveService.getEstimatorConfig(),
    AdminAdaptiveService.getEstimatorHealth(),
    AdminAdaptiveService.getAbilityExplorerAttempts({ limit: 20 }),
    AdminAdaptiveService.getCATConfig(),
    AdminAdaptiveService.getCATHealth(),
    AdminAdaptiveService.getStoppingConfig(),
    AdminAdaptiveService.getStoppingHealth(),
    AdminAdaptiveService.getPersonalizationConfig(),
    AdminAdaptiveService.getPersonalizationHealth(),
  ]);

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <AdminAdaptiveManager
        initialOverview={overview}
        initialConfigs={configs}
        initialCalibrations={calibrations}
        initialAuditLogs={auditLogs}
        initialEstimatorConfig={estimatorConfig}
        initialEstimatorHealth={estimatorHealth}
        initialExplorerAttempts={explorerAttempts}
        initialCATConfig={catConfig}
        initialCATHealth={catHealth}
        initialStoppingConfig={stoppingConfig}
        initialStoppingHealth={stoppingHealth}
        initialPersonalizationConfig={personalizationConfig}
        initialPersonalizationHealth={personalizationHealth}
        userEmail={auth.userEmail || "admin@system.local"}
      />
    </div>
  );
}
