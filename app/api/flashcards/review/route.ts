import { FlashcardService } from "@/services/flashcard.service";
import { NextResponse, type NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { cardId, rating } = await request.json();
    const result = await FlashcardService.submitCardReview(cardId, Number(rating));
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}