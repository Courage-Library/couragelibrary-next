import React from "react";
import { notFound } from "next/navigation";
import { FlashcardService } from "@/services/flashcard.service";
import { FlashcardReviewClient } from "./review-client";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function FlashcardReviewPage({ params }: Props) {
  const { id } = await params;
  const session = await FlashcardService.getDeckCardsForReview(id);

  if (!session || session.cards.length === 0) {
    notFound();
  }

  return <FlashcardReviewClient session={session} />;
}