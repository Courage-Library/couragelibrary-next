import { getAppEnv, validateSupabaseEnv } from "@/config/env";
import { logger } from "@/lib/logger";
import type { HealthCheckResult } from "@/types/common";

export class HealthService {
  /**
   * Safe, non-invasive health check that verifies network connectivity
   * to couragelibrary-next without altering or creating database state.
   */
  static async checkSystemHealth(): Promise<HealthCheckResult> {
    const env = getAppEnv();
    const envValidation = validateSupabaseEnv();

    const result: HealthCheckResult = {
      status: "healthy",
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || "development",
      supabase: {
        configured: envValidation.valid,
        reachable: false,
      },
      version: "0.1.0",
    };

    if (!envValidation.valid) {
      result.status = "degraded";
      result.supabase.error = envValidation.error;
      logger.warn("Health check: Supabase environment unconfigured", "HealthService", envValidation.error);
      return result;
    }

    try {
      const startTime = performance.now();
      const response = await fetch(`${env.supabaseUrl}/auth/v1/health`, {
        method: "GET",
        headers: {
          apikey: env.supabaseAnonKey,
          Authorization: `Bearer ${env.supabaseAnonKey}`,
        },
        next: { revalidate: 15 },
      });

      const latencyMs = Math.round(performance.now() - startTime);

      if (response.ok) {
        result.supabase.reachable = true;
        result.supabase.latencyMs = latencyMs;
        logger.info("Health check passed", "HealthService", { latencyMs });
      } else {
        result.status = "degraded";
        result.supabase.reachable = false;
        result.supabase.error = `Supabase responded with HTTP ${response.status}`;
        result.supabase.latencyMs = latencyMs;
        logger.warn("Health check: Supabase HTTP probe degraded", "HealthService", { status: response.status });
      }
    } catch (err) {
      result.status = "unhealthy";
      result.supabase.reachable = false;
      result.supabase.error = err instanceof Error ? err.message : "Connection failed";
      logger.error("Health check unexpected exception", "HealthService", err);
    }

    return result;
  }
}
