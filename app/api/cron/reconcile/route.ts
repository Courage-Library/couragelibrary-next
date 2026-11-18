import { NextRequest, NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { getReconcileDeps } from "@/lib/payments/pro-server";
import { runReconciliation } from "@/lib/payments/pro-flows";

/**
 * PAY-1 B4 reconciliation (owner R1, 2026-11-18). A GitHub Actions schedule (every 15 min) only TRIGGERS this route; the
 * Razorpay keys stay in the Vercel env and never reach GitHub.
 *   - POST only (no GET handler → 405); the ONLY auth is `Authorization: Bearer $CRON_SECRET` (≥ 16 chars), compared in
 *     constant time over SHA-256 digests (no length leak); anything else → 401, before any read
 *   - checkout closed (payments off, keys missing, …) → 200 { skipped } — nothing is read or written
 *   - one run at a time (a lease row): an overlapping trigger → 200 { outcome: "busy" }; every step is idempotent anyway
 *   - returns / logs COUNTS only (never ids or user data)
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
  const deps = getReconcileDeps();
  if (!deps) return NextResponse.json({ ok: true, skipped: "CHECKOUT_CLOSED" });
  const s = await runReconciliation(deps);
  console.log(`[cron reconcile] outcome=${s.outcome} checked=${s.checked} ${Object.entries(s.counts).map(([k, n]) => `${k}=${n}`).join(" ")} double=${s.doubleCharges} refunds_replayed=${s.refundsReplayed} refunds_waiting=${s.refundsWaiting}`);
  return NextResponse.json({ ok: true, ...s });
}
