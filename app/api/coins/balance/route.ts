import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSessionState } from "@/lib/auth/session-state";
import { isLessonCoinsEarnEnabled } from "@/lib/coins/flag";

/**
 * COURSE-UX-1: the signed-in student's coin balance for the header — only while lesson coins are on
 * (COINS_LESSON_EARN; else 404). The session client reads the student's OWN wallet row (RLS); no user id is accepted.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET() {
  if (!isLessonCoinsEarnEnabled()) return NextResponse.json({ error: "Not found" }, { status: 404, headers: NO_STORE });
  const supabase = await createServerSupabaseClient();
  const session = await getSessionState(supabase);
  if (session.state !== "user") return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });
  const { data, error } = await supabase.from("coin_wallets").select("current_balance").maybeSingle();
  if (error) return NextResponse.json({ error: "Unavailable" }, { status: 503, headers: NO_STORE });
  return NextResponse.json({ balance: data?.current_balance ?? 0 }, { headers: NO_STORE });
}
