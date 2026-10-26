import { NextResponse } from "next/server";

/**
 * F9-B: the legacy order endpoint is retired. It called fn_create_payment_order, whose client EXECUTE was revoked by
 * migration 113; Pro orders are created only by the createProOrderAction server action (fn_create_pro_order, server
 * price). Always 410.
 */
export async function POST() {
  return NextResponse.json({ success: false, error: { code: "ENDPOINT_RETIRED", message: "This endpoint is no longer used." } }, { status: 410 });
}
