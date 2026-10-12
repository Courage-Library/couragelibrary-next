import { NextResponse } from "next/server";
import { PAYMENTS_DISABLED_ERROR, isPaymentsEnabled } from "@/config/payments";

/**
 * SEC-1A emergency containment.
 * Fulfilment previously trusted a client-fabricated payment id with no gateway
 * signature verification and no order-ownership check. It now refuses all
 * requests before any auth/DB/RPC work. Fulfilment must only be re-enabled
 * after verified Razorpay signature + webhook handling is implemented.
 */
export async function POST() {
  if (!isPaymentsEnabled()) {
    return NextResponse.json({ success: false, error: PAYMENTS_DISABLED_ERROR }, { status: 503 });
  }

  // Even with the flag on, never fulfil without server-side gateway verification.
  return NextResponse.json(
    {
      success: false,
      error: {
        code: "PAYMENT_VERIFICATION_NOT_IMPLEMENTED",
        message: "Online payments are temporarily unavailable.",
      },
    },
    { status: 501 }
  );
}
