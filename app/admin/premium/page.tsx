import React from "react";
import { redirect } from "next/navigation";
import { AdminService } from "@/services/admin.service";
import { AdminPremiumService } from "@/services/admin-premium.service";
import { AdminPremiumManager } from "@/components/admin/premium/admin-premium-manager";
import { Alert } from "@/components/ui/alert";

export const metadata = {
  title: "Premium Control Center | Admin Studio | Courage Library",
  description: "Server-authoritative Premium governance, generator policies, exam availability, user entitlements, and audit trail.",
};

export const dynamic = "force-dynamic";

export default async function AdminPremiumPage() {
  const auth = await AdminService.checkIsAdminOrStaff();

  if (!auth.isAdmin) {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <Alert variant="error">
          Unauthorized access. You do not have permission to access the Premium Control Center.
        </Alert>
      </div>
    );
  }

  // Load consolidated overview, test series, and curated mocks in parallel
  const [overview, testSeries, curatedMocks] = await Promise.all([
    AdminPremiumService.getPremiumAdminOverview(),
    AdminPremiumService.listPremiumTestSeries(),
    AdminPremiumService.listCuratedPremiumMocks(),
  ]);

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <AdminPremiumManager
        initialGlobalConfig={overview.globalConfig}
        initialGeneratorPolicy={overview.generatorPolicy}
        initialExamConfigs={overview.examConfigs}
        initialTestTypeConfigs={overview.testTypeConfigs}
        initialAnalytics={overview.analytics}
        initialAuditLogs={overview.recentAuditLogs}
        initialTestSeries={testSeries}
        initialCuratedMocks={curatedMocks}
      />
    </div>
  );
}
