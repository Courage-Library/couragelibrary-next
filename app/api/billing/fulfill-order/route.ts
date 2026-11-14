import { NextResponse } from "next/server";

/**
 * PAY-1 B1 (PAY-LEGACY-RETIRE-1): the legacy fulfilment endpoint is retired. It once trusted a client-fabricated payment
 * id (SEC-1A containment) and later only answered 503 / 501. Pro is fulfilled only after server-side verification by
 * /api/payments/verify and /api/webhooks/razorpay (fn_fulfil_pro_order). Always 410, before any auth / DB work.
 */
export async function POST() {
  return NextResponse.json({ success: false, error: { code: "ENDPOINT_RETIRED", message: "This endpoint is no longer used." } }, { status: 410 });
}
