import { NextResponse } from "next/server";
import { HealthService } from "@/services/health.service";

export const dynamic = "force-dynamic";

export async function GET() {
  const health = await HealthService.checkSystemHealth();
  const statusCode = health.status === "healthy" ? 200 : health.status === "degraded" ? 200 : 503;

  return NextResponse.json(
    {
      success: health.status !== "unhealthy",
      data: health,
      timestamp: new Date().toISOString(),
    },
    { status: statusCode }
  );
}
