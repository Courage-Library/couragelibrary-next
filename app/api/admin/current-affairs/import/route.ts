import { guardAdminRoute, toRouteErrorResponse, sanitizeActionResult } from "@/lib/auth/require-admin";
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
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

    // 2. Otherwise: interactive Admin/Staff session via the canonical guard (SEC-1B).
    //    The bearer path above is the only non-session credential, for automated ingestion.
    if (!isAuthorized) {
      const auth = await guardAdminRoute(); // SEC-1B Q1: ingestion trigger, admin only (session path)
      if (!auth.ok) return auth.response;
      isAuthorized = true;
      authorUserId = auth.userId;
    }

    const body = await req.json();
    const rawPayload = body.rawPayload || body;

    const result = await CurrentAffairsImportService.importDraft(rawPayload, authorUserId);

    if (!result.success) {
      return NextResponse.json(
        sanitizeActionResult("admin/current-affairs/import", {
          success: false,
          error: {
            code: 'IMPORT_REJECTED',
            message: result.error || 'Import failed validation gates',
            gateReport: result.gateReport,
          },
        }),
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    return toRouteErrorResponse("admin/current-affairs/import POST", error);
  }
}
