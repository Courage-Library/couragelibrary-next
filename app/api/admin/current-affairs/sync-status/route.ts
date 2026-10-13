import { guardAdminRoute, toRouteErrorResponse } from "@/lib/auth/require-admin";
import { NextResponse } from 'next/server';
import { CurrentAffairsProductionSyncService } from '@/services/current-affairs-production-sync.service';

/**
 * Protected Admin Endpoint: Ingestion Subsystem Health & Synchronization Metrics
 * Access: SuperAdmin and Staff only. Candidate access is rejected (401/403).
 */
export async function GET() {
  try {
    const authCheck = await guardAdminRoute({ allowStaff: true });
    if (!authCheck.ok) return authCheck.response;

    const health = await CurrentAffairsProductionSyncService.checkHealth();

    return NextResponse.json({
      success: true,
      data: health,
    });
  } catch (error: any) {
    return toRouteErrorResponse("admin/current-affairs/sync-status GET", error);
  }
}
