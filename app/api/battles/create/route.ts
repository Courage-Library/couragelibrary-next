import { featureDisabledApiResponse } from "@/lib/features/gates";
import { BattleService } from "@/services/battle.service";
import { NextResponse, type NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const featureDisabled = featureDisabledApiResponse("BATTLES");
  if (featureDisabled) return featureDisabled;
  try {
    // PAY-1 B3 (owner decision 6): the tier never comes from the client — FREE arenas only (147 refuses anything else)
    const { topicId, isPrivate } = await request.json();
    const result = await BattleService.findOrCreateBattleRoom(topicId, isPrivate, "FREE");
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
