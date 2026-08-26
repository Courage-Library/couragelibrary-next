import { BattleService } from "@/services/battle.service";
import { NextResponse, type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const roomId = searchParams.get("id");
    if (!roomId) {
      return NextResponse.json({ success: false, error: "Room ID is required" }, { status: 400 });
    }
    const room = await BattleService.getBattleRoomDetails(roomId);
    return NextResponse.json({ success: true, room });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
