/**
 * COURAGE LIBRARY — PHASE 5E.2: CERTIFICATES & SECURE VERIFICATION SERVICE
 *
 * Server-authoritative certificate generation, cryptographic signing,
 * lifecycle state transitions, errata supersession, and privacy-safe public verification.
 */

import { createAdminServerSupabaseClient } from "@/lib/supabase/server";
import {
  LiveCertificateType,
  LiveCertificateStatus,
  LiveTestCertificate,
  LiveTestCertificatePolicy,
  LiveTestCertificatePublicVerification,
  LiveTestCertificateGenerationResult,
} from "@/types/live-test";
import crypto from "crypto";

const SIGNING_KEYS: Record<string, string> = {
  v1: process.env.LIVE_CERTIFICATE_SIGNING_KEY_V1 || "COURAGE_LIVE_CERT_SIGNING_KEY_V1",
};

export class LiveTestCertificateService {
  /**
   * Constructs the deterministic canonical payload for cryptographic signing.
   */
  public static buildCanonicalPayload(params: {
    eventId: string;
    userId: string;
    snapshotId: string;
    certificateType: LiveCertificateType;
    finalScore: number;
    finalRank: number | null;
    finalPercentile: number | null;
    policyVersion: number;
    issuedAtIso: string;
  }): string {
    const scoreStr = Number(params.finalScore).toFixed(2);
    const rankStr = params.finalRank !== null && params.finalRank !== undefined ? String(params.finalRank) : "NULL";
    const percentileStr = params.finalPercentile !== null && params.finalPercentile !== undefined
      ? Number(params.finalPercentile).toFixed(2)
      : "0.00";

    return `CL_CERT_V1|${params.eventId}|${params.userId}|${params.snapshotId}|${params.certificateType}|${scoreStr}|${rankStr}|${percentileStr}|${params.policyVersion}|${params.issuedAtIso}`;
  }

  /**
   * Generates HMAC-SHA256 digital signature over the canonical payload hash.
   */
  public static generateSignature(
    payload: string,
    keyVersion: string = "v1"
  ): { canonicalHash: string; signature: string } {
    const secret = SIGNING_KEYS[keyVersion] || SIGNING_KEYS["v1"];
    const canonicalHash = crypto.createHash("sha256").update(payload, "utf8").digest("hex");
    const signature = crypto.createHmac("sha256", secret).update(canonicalHash, "utf8").digest("hex");
    return { canonicalHash, signature };
  }

  /**
   * Generates or re-evaluates certificates for an active event snapshot.
   */
  public static async generateLiveEventCertificates(
    eventId: string,
    adminId: string
  ): Promise<LiveTestCertificateGenerationResult> {
    try {
      const adminSb = await createAdminServerSupabaseClient();
      const { data, error } = await (adminSb.rpc as any)("fn_generate_live_test_certificates", {
        p_event_id: eventId,
        p_admin_id: adminId,
      });

      if (error) {
        console.error("Error executing fn_generate_live_test_certificates:", error);
        return {
          success: false,
          eventId,
          error: error.message,
        };
      }

      const res = data as any;
      return {
        success: res?.success ?? true,
        eventId,
        snapshotId: res?.snapshot_id,
        generatedCount: res?.generated_count ?? 0,
        supersededCount: res?.superseded_count ?? 0,
        skippedCount: res?.skipped_count ?? 0,
      };
    } catch (err: any) {
      console.error("Failed to generate live event certificates:", err);
      return {
        success: false,
        eventId,
        error: err.message || "Failed to generate live event certificates",
      };
    }
  }

  /**
   * Public unauthenticated verification lookup with strict PII masking.
   */
  public static async verifyCertificatePublic(
    verificationCode: string,
    ipHash: string = "UNTRACKED"
  ): Promise<LiveTestCertificatePublicVerification> {
    try {
      const adminSb = await createAdminServerSupabaseClient();
      const cleanCode = verificationCode.trim().toUpperCase();

      const { data, error } = await (adminSb.rpc as any)("fn_verify_live_test_certificate_public", {
        p_verification_code: cleanCode,
        p_ip_hash: ipHash,
      });

      if (error || !data) {
        console.error("Error verifying certificate public:", error);
        return {
          valid: false,
          status: "NOT_FOUND",
          error: "Unable to verify certificate at this time.",
        };
      }

      return data as LiveTestCertificatePublicVerification;
    } catch (err: any) {
      console.error("Exception in verifyCertificatePublic:", err);
      return {
        valid: false,
        status: "NOT_FOUND",
        error: "Verification service temporarily unavailable.",
      };
    }
  }

  /**
   * Fetches active certificate for a candidate in a specific live test event.
   */
  public static async getCandidateEventCertificate(
    eventId: string,
    userId: string
  ): Promise<LiveTestCertificate | null> {
    try {
      const adminSb = await createAdminServerSupabaseClient();
      const { data, error } = await (adminSb as any)
        .from("live_test_certificates")
        .select("*")
        .eq("live_test_event_id", eventId)
        .eq("user_id", userId)
        .eq("status", "ISSUED")
        .order("issued_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error("Error fetching candidate event certificate:", error);
        return null;
      }

      return data as LiveTestCertificate | null;
    } catch (err) {
      console.error("Failed to fetch candidate event certificate:", err);
      return null;
    }
  }

  /**
   * Fetches all certificates for a candidate across all live test events.
   */
  public static async getCandidateCertificates(userId: string): Promise<LiveTestCertificate[]> {
    try {
      const adminSb = await createAdminServerSupabaseClient();
      const { data, error } = await (adminSb as any)
        .from("live_test_certificates")
        .select("*")
        .eq("user_id", userId)
        .order("issued_at", { ascending: false });

      if (error) {
        console.error("Error fetching candidate certificates:", error);
        return [];
      }

      return (data || []) as LiveTestCertificate[];
    } catch (err) {
      console.error("Failed to fetch candidate certificates:", err);
      return [];
    }
  }

  /**
   * Fetches all certificate records for an event (Admin view).
   */
  public static async getEventCertificatesAdmin(
    eventId: string,
    statusFilter?: LiveCertificateStatus
  ): Promise<LiveTestCertificate[]> {
    try {
      const adminSb = await createAdminServerSupabaseClient();
      let query = (adminSb as any)
        .from("live_test_certificates")
        .select("*")
        .eq("live_test_event_id", eventId)
        .order("created_at", { ascending: false });

      if (statusFilter) {
        query = query.eq("status", statusFilter);
      }

      const { data, error } = await query;
      if (error) {
        console.error("Error fetching event certificates for admin:", error);
        return [];
      }

      return (data || []) as LiveTestCertificate[];
    } catch (err) {
      console.error("Failed to fetch event certificates for admin:", err);
      return [];
    }
  }

  /**
   * Revokes a certificate administratively.
   */
  public static async revokeCertificate(
    certificateId: string,
    adminId: string,
    reason: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const adminSb = await createAdminServerSupabaseClient();
      const { data, error } = await (adminSb.rpc as any)("fn_revoke_live_test_certificate", {
        p_certificate_id: certificateId,
        p_admin_id: adminId,
        p_reason: reason,
      });

      if (error) {
        console.error("Error revoking certificate:", error);
        return { success: false, error: error.message };
      }

      const res = data as any;
      return { success: res?.success ?? true };
    } catch (err: any) {
      return { success: false, error: err.message || "Failed to revoke certificate" };
    }
  }

  /**
   * Fetches certificate policies (event-specific or global defaults).
   */
  public static async getCertificatePolicies(
    eventId?: string
  ): Promise<LiveTestCertificatePolicy[]> {
    try {
      const adminSb = await createAdminServerSupabaseClient();
      let query = (adminSb as any)
        .from("live_test_certificate_policies")
        .select("*")
        .eq("is_active", true)
        .order("priority", { ascending: true });

      if (eventId) {
        query = query.or(`live_test_event_id.eq.${eventId},live_test_event_id.is.null`);
      } else {
        query = query.is("live_test_event_id", null);
      }

      const { data, error } = await query;
      if (error) {
        console.error("Error fetching certificate policies:", error);
        return [];
      }

      return (data || []) as LiveTestCertificatePolicy[];
    } catch (err) {
      console.error("Failed to fetch certificate policies:", err);
      return [];
    }
  }
}
