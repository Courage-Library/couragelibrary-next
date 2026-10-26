import { NextResponse, type NextRequest } from "next/server";
import { getProDeps } from "@/lib/payments/pro-server";
import { handleWebhook } from "@/lib/payments/pro-flows";

/**
 * F9-B Razorpay webhook. The RAW body is verified (HMAC-SHA256 with RAZORPAY_WEBHOOK_SECRET, constant-time) before
 * anything is parsed; the event id (x-razorpay-event-id) is claimed once; paid events re-fetch the payment and go
 * through the ONE fulfil path. No session / cookies are used. Responses carry codes only.
 */
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const deps = getProDeps();
  if (!deps) return NextResponse.json({ ok: false, code: "PAYMENTS_UNAVAILABLE" }, { status: 503 });
  const rawBody = await request.text();
  const r = await handleWebhook(
    { rawBody, signature: request.headers.get("x-razorpay-signature"), eventId: request.headers.get("x-razorpay-event-id") },
    deps,
  );
  if (!r.ok) return NextResponse.json({ ok: false, code: r.code }, { status: r.status });
  return NextResponse.json({ ok: true, outcome: r.outcome });
}
