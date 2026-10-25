import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { AssessmentService } from "@/services/assessment.service";

/**
 * EXAM-FINALIZE-1 daily sweep (vercel.json crons; Vercel Hobby allows one run a day). Vercel calls it with
 * `Authorization: Bearer $CRON_SECRET`; without a configured secret (≥ 16 chars) or with a wrong one it refuses (fails
 * closed). It runs the same finalizer as finalize-on-read — the one submit path, submitted_at = the server deadline —
 * over a bounded batch, and returns / logs COUNTS only (never ids or user data).
 */
export const dynamic = "force-dynamic";
const BATCH = 200;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET ?? "";
  if (secret.length < 16) return false;
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ ok: false }, { status: 401 });
  const counts = await AssessmentService.finalizeExpiredAttempts({ limit: BATCH });
  console.log(`[cron finalize-attempts] finalized=${counts.finalized} abandoned=${counts.abandoned} failed=${counts.failed}`);
  return NextResponse.json({ ok: counts.failed === 0, ...counts });
}
