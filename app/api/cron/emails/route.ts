import { NextRequest, NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { emailEnabled, getEmailJobDeps } from "@/lib/email/pro-email-server";
import { runEmailJob } from "@/lib/email/pro-emails";

/**
 * PAY-1 B5 e-mail job (owner D8 + E1–E7, 2026-11-18): the D7 / D1 expiry reminders (from 09:00 India time), the
 * catch-up of receipts / refund confirmations the immediate send missed, and the retries of FAILED sends. Same pattern
 * as /api/cron/reconcile: a GitHub Actions schedule only TRIGGERS it; the ZeptoMail token stays in the Vercel env.
 *   - POST only (no GET handler → 405); the ONLY auth is `Authorization: Bearer $CRON_SECRET` (≥ 16 chars), compared in
 *     constant time over SHA-256 digests; anything else → 401, before any read
 *   - e-mail off (EMAIL_APP_ENABLED not "true" or no token) → 200 { skipped } — nothing is read or written
 *   - one run at a time (lease "pro_emails"); each e-mail at most once (email_events.event_key UNIQUE)
 *   - returns / logs COUNTS only (never ids, addresses or user data)
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const digest = (s: string) => createHash("sha256").update(s).digest();
function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET ?? "";
  if (secret.length < 16) return false;
  return timingSafeEqual(digest(req.headers.get("authorization") ?? ""), digest(`Bearer ${secret}`));
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ ok: false }, { status: 401 });
  if (!emailEnabled()) return NextResponse.json({ ok: true, skipped: "EMAIL_OFF" });
  const s = await runEmailJob(getEmailJobDeps());
  console.log(`[cron emails] outcome=${s.outcome} expired_claims=${s.expiredClaims} reminders=${s.reminders} ${Object.entries(s.counts).map(([k, n]) => `${k}=${n}`).join(" ")}`);
  return NextResponse.json({ ok: true, ...s });
}
