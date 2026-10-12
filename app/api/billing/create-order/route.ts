import { BillingService } from "@/services/billing.service";
import { NextResponse, type NextRequest } from "next/server";
import { PAYMENTS_DISABLED_ERROR, isPaymentsEnabled } from "@/config/payments";

export async function POST(request: NextRequest) {
  if (!isPaymentsEnabled()) {
    return NextResponse.json({ success: false, error: PAYMENTS_DISABLED_ERROR }, { status: 503 });
  }

  try {
    const payload = await request.json();
    const result = await BillingService.createPaymentOrder(payload);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
