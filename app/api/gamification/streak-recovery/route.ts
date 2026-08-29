import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { GamificationService } from "@/services/gamification.service";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const eligibility = await GamificationService.getStreakRecoveryEligibility(user.id);
    return NextResponse.json({ success: true, eligibility });
  } catch (err: unknown) {
    console.error("[/api/gamification/streak-recovery GET] Error:", err);
    return NextResponse.json({ success: false, error: "Failed to evaluate streak recovery eligibility." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    let body: { idempotencyKey?: string } = {};
    try {
      body = (await req.json()) || {};
    } catch {
      // Body may be empty
    }

    const result = await GamificationService.applyStreakFreezeRecovery({
      userId: user.id,
      idempotencyKey: body?.idempotencyKey,
    });

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error || "Streak recovery failed." }, { status: 400 });
    }

    // Invalidate relevant cache paths
    try {
      revalidatePath("/wallet");
      revalidatePath("/store");
      revalidatePath("/dashboard");
      revalidatePath("/mock-tests");
    } catch (e) {
      console.warn("[/api/gamification/streak-recovery POST] Revalidation notice:", e);
    }

    return NextResponse.json({ success: true, result });
  } catch (err: unknown) {
    console.error("[/api/gamification/streak-recovery POST] Error:", err);
    return NextResponse.json({ success: false, error: "An unexpected server error occurred." }, { status: 500 });
  }
}

