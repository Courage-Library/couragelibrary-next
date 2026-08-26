import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const supabaseUser = await createServerSupabaseClient();
    const { data: { user } } = await supabaseUser.auth.getUser();

    if (!user) {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    }

    const { orderId, gatewayPaymentId, gatewaySignature, paymentMethod, amount, billingName, billingState } = await request.json();

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const { data, error } = await (supabaseAdmin.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>)(
      "fn_verify_and_fulfill_payment",
      {
        p_order_id: orderId,
        p_gateway_payment_id: gatewayPaymentId,
        p_gateway_signature: gatewaySignature,
        p_payment_method: paymentMethod || "UPI",
        p_amount: amount,
        p_billing_name: billingName || "Student",
        p_billing_address: null,
        p_billing_state: billingState || "DELHI",
      }
    );

    if (error || !data) {
      return NextResponse.json({ success: false, error: error?.message || "Fulfillment failed" }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
