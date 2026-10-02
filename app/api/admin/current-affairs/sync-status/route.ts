import { NextResponse } from 'next/server';
import { AdminService } from '@/services/admin.service';
import { CurrentAffairsProductionSyncService } from '@/services/current-affairs-production-sync.service';

/**
 * Protected Admin Endpoint: Ingestion Subsystem Health & Synchronization Metrics
 * Access: SuperAdmin and Staff only. Candidate access is rejected (401/403).
 */
export async function GET() {
  try {
    const authCheck = await AdminService.checkIsAdminOrStaff();
    if (!authCheck.isAdmin || !authCheck.userId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Administrative privileges required to access synchronization telemetry.',
          },
        },
        { status: 403 }
      );
    }

    const health = await CurrentAffairsProductionSyncService.checkHealth();

    return NextResponse.json({
      success: true,
      data: health,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error.message || 'Failed to retrieve synchronization status',
        },
      },
      { status: 500 }
    );
  }
}
