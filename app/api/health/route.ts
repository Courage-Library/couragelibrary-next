import { NextResponse } from "next/server";
import { HealthService } from "@/services/health.service";
import { deployedVersion } from "@/lib/deploy/version";

export const dynamic = "force-dynamic";

export async function GET() {
  const health = await HealthService.checkSystemHealth();
  const statusCode = health.status === "healthy" ? 200 : health.status === "degraded" ? 200 : 503;

  return NextResponse.json(
    {
      success: health.status !== "unhealthy",
      version: deployedVersion(), // short commit SHA of this deployment (deploy detection); no other env data
      data: health,
      timestamp: new Date().toISOString(),
    },
    { status: statusCode }
  );
}
