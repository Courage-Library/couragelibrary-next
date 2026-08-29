import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { GamificationService } from "@/services/gamification.service";
import { revalidatePath } from "next/cache";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ success: false, error: "Unauthorized. Please sign in." }, { status: 401 });
    }

    const body = await req.json();
    const { rewardId, shippingDetails } = body;

    if (!rewardId || typeof rewardId !== "string") {
      return NextResponse.json({ success: false, error: "Invalid reward selection." }, { status: 400 });
    }

    const result = await GamificationService.redeemStoreReward({
      userId: user.id,
      rewardId,
      shippingDetails,
    });

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error || "Redemption failed." }, { status: 400 });
    }

    // Invalidate relevant cache paths
    try {
      revalidatePath("/store");
      revalidatePath("/wallet");
      revalidatePath("/dashboard");
    } catch (e) {
      console.warn("[/api/store/redeem] Revalidation notice:", e);
    }

    return NextResponse.json({
      success: true,
      remainingBalance: result.remainingBalance,
      claimId: result.claimId,
      rewardTitle: result.rewardTitle,
    });
  } catch (err: unknown) {
    console.error("[/api/store/redeem] Unhandled error:", err);
    return NextResponse.json({ success: false, error: "An unexpected server error occurred." }, { status: 500 });
  }
}
