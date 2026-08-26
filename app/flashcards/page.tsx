import React from "react";
import { FlashcardService } from "@/services/flashcard.service";
import { FlashcardDeckCard } from "@/components/flashcards/flashcard-deck-card";
import { Container } from "@/components/ui/container";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Layers } from "lucide-react";

export const revalidate = 30;

export default async function FlashcardsDirectoryPage() {
  const decks = await FlashcardService.getFlashcardDecks();

  return (
    <div className="py-10 bg-slate-50/50 min-h-[calc(100vh-4rem)]">
      <Container className="space-y-8">
        <div className="space-y-2">
          <Badge variant="indigo" className="text-xs">
            Phase 3M Active Recall Decks
          </Badge>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">
            Flashcard Library & Visual Formulas
          </h1>
          <p className="text-sm text-slate-600 max-w-2xl">
            Retain formulas, key terminology, and high-yield facts using SM-2 spaced repetition algorithms.
          </p>
        </div>

        {decks.length === 0 ? (
          <Card className="p-12 text-center text-slate-400 space-y-3">
            <Layers className="w-10 h-10 mx-auto opacity-50" />
            <h3 className="text-base font-bold text-slate-700">No Flashcard Decks Published</h3>
            <p className="text-xs">New curated visual formula decks will be added shortly.</p>
          </Card>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {decks.map((deck) => (
              <FlashcardDeckCard key={deck.id} deck={deck} />
            ))}
          </div>
        )}
      </Container>
    </div>
  );
}