import { NextResponse, type NextRequest } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import { getProDeps } from "@/lib/payments/pro-server";
import { verifyClientPayment } from "@/lib/payments/pro-flows";

/**
 * F9-B client success: HMAC (constant-time) → the caller's own order → payment fetched from Razorpay must match the
 * order snapshot → the ONE fulfil path (fn_fulfil_pro_order, CLIENT_VERIFY). The webhook may win the race; then this
 * returns already_fulfilled. Responses carry codes and dates only.
 */
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const deps = getProDeps();
  if (!deps) return NextResponse.json({ ok: false, code: "PAYMENTS_UNAVAILABLE" }, { status: 503 });
  const session = await getServerSession();
  if (session.state !== "user") return NextResponse.json({ ok: false, code: "UNAUTHENTICATED" }, { status: 401 });
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, code: "BAD_JSON" }, { status: 400 });
  }
  const r = await verifyClientPayment(
    { userId: session.user.id, orderId: body.razorpay_order_id, paymentId: body.razorpay_payment_id, signature: body.razorpay_signature },
    deps,
  );
  if (!r.ok) return NextResponse.json({ ok: false, code: r.code }, { status: r.status });
  return NextResponse.json({
    ok: true,
    alreadyFulfilled: r.result.already_fulfilled === true,
    startsAt: r.result.starts_at ?? null,
    expiresAt: r.result.expires_at ?? null,
    receiptNumber: r.result.receipt_number ?? null,
  });
}
