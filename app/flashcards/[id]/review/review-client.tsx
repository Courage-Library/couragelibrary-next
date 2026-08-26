"use client";

import React, { useState, useCallback } from "react";
import { ReviewSessionPayload } from "@/services/flashcard.service";
import { FlashcardPlayer } from "@/components/flashcards/flashcard-player";
import { FlashcardCompletion } from "@/components/flashcards/flashcard-completion";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

interface FlashcardReviewClientProps {
  session: ReviewSessionPayload;
}

export function FlashcardReviewClient({ session }: FlashcardReviewClientProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [ratingsCount, setRatingsCount] = useState({ again: 0, hard: 0, good: 0, easy: 0 });

  const currentCard = session.cards[currentIndex];

  const handleRateCard = useCallback(async (rating: 1 | 2 | 3 | 4) => {
    if (!currentCard) return;
    setIsSubmitting(true);

    if (rating === 1) setRatingsCount((p) => ({ ...p, again: p.again + 1 }));
    else if (rating === 2) setRatingsCount((p) => ({ ...p, hard: p.hard + 1 }));
    else if (rating === 3) setRatingsCount((p) => ({ ...p, good: p.good + 1 }));
    else if (rating === 4) setRatingsCount((p) => ({ ...p, easy: p.easy + 1 }));

    try {
      await fetch("/api/flashcards/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId: currentCard.id, rating }),
      });

      if (currentIndex + 1 >= session.cards.length) {
        // Complete session
        await fetch("/api/flashcards/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deckId: session.deck.id }),
        });
        setIsCompleted(true);
      } else {
        setCurrentIndex((prev) => prev + 1);
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [currentCard, currentIndex, session.cards.length, session.deck.id]);

  const handleReviewAgain = () => {
    setCurrentIndex(0);
    setIsCompleted(false);
    setRatingsCount({ again: 0, hard: 0, good: 0, easy: 0 });
  };

  if (isCompleted) {
    return (
      <FlashcardCompletion
        deckTitle={session.deck.title}
        ratingsCount={ratingsCount}
        onReviewAgain={handleReviewAgain}
      />
    );
  }

  return (
    <div className="py-8 bg-slate-50/50 min-h-[calc(100vh-4rem)] px-4">
      <div className="max-w-2xl mx-auto mb-4">
        <Link
          href={`/flashcards/${session.deck.id}`}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Deck
        </Link>
      </div>

      <FlashcardPlayer
        card={currentCard}
        cardNumber={currentIndex + 1}
        totalCards={session.cards.length}
        onRateCard={handleRateCard}
        isSubmitting={isSubmitting}
      />
    </div>
  );
}