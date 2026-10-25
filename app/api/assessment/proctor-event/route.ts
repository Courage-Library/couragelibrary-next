import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isProctorEvent, isProctorLogEnabled } from "@/lib/assessment/proctor";

/**
 * PROCTOR-LOG-1: records one attempt event through fn_record_proctor_event (auth.uid(), the caller's own OPEN attempt,
 * append-only, rate-capped). Quiet by design (R8): the player never waits for or shows the result — every outcome is
 * 204 except malformed input (400). Flag off → 204, nothing recorded.
 */
const ID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  const { attemptId, type, seq } = body;
  if (typeof attemptId !== "string" || !ID_RX.test(attemptId) || !isProctorEvent(type) || !Number.isInteger(seq) || (seq as number) < 0 || (seq as number) > 100000) {
    return new NextResponse(null, { status: 400 });
  }
  if (!isProctorLogEnabled()) return new NextResponse(null, { status: 204 });
  try {
    const supabase = await createServerSupabaseClient();
    await supabase.rpc("fn_record_proctor_event", { p_attempt_id: attemptId, p_event_type: type, p_client_seq: seq as number });
  } catch {
    /* quiet: an event that cannot be recorded never disturbs the test */
  }
  return new NextResponse(null, { status: 204 });
}
