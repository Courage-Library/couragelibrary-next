import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { AdminService } from '@/services/admin.service';
import { CurrentAffairsImportService } from '@/services/current-affairs-import.service';

/**
 * Validates machine-to-machine Bearer token with constant-time comparison
 */
function validateBearerToken(authHeader: string | null): boolean {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return false;
  }
  const token = authHeader.slice(7).trim();
  const configuredKey = process.env.CURRENT_AFFAIRS_INGESTION_KEY || process.env.INGESTION_SERVICE_SECRET;

  if (!configuredKey || !token) {
    return false;
  }

  const tokenBuf = Buffer.from(token);
  const keyBuf = Buffer.from(configuredKey);

  if (tokenBuf.length !== keyBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(tokenBuf, keyBuf);
}

export async function POST(req: NextRequest) {
  try {
    let authorUserId: string | null = null;
    let isAuthorized = false;

    // 1. Check machine-to-machine Bearer token
    const authHeader = req.headers.get('authorization');
    if (authHeader && validateBearerToken(authHeader)) {
      isAuthorized = true;
      authorUserId = null; // System / Automated Ingestion Actor
    }

    // 2. Fall back to interactive Admin/Staff browser session cookie
    if (!isAuthorized) {
      const authCheck = await AdminService.checkIsAdminOrStaff();
      if (authCheck.isAdmin && authCheck.userId) {
        isAuthorized = true;
        authorUserId = authCheck.userId;
      }
    }

    if (!isAuthorized) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Invalid authorization credentials or insufficient privileges to access this endpoint.',
          },
        },
        { status: 401 }
      );
    }

    const body = await req.json();
    const rawPayload = body.rawPayload || body;

    const result = await CurrentAffairsImportService.importDraft(rawPayload, authorUserId);

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'IMPORT_REJECTED',
            message: result.error || 'Import failed validation gates',
            gateReport: result.gateReport,
          },
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error.message || 'Failed to process external import',
        },
      },
      { status: 500 }
    );
  }
}
