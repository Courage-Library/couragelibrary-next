import React from "react";
import Link from "next/link";
import { FlashcardService } from "@/services/flashcard.service";
import { FlashcardDeckCard } from "@/components/flashcards/flashcard-deck-card";
import { Container } from "@/components/ui/container";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Zap, HelpCircle, BookOpen } from "lucide-react";
import { constructMetadata } from "@/lib/seo/metadata";

export const revalidate = 30;

export const metadata = constructMetadata({
  title: "Flashcards & Spaced Repetition",
  description: "Retain formulas, key terminology, and high-yield facts using SM-2 spaced repetition algorithms.",
});

export default async function FlashcardsDirectoryPage() {
  const decks = await FlashcardService.getFlashcardDecks();

  return (
    <div className="py-10 bg-slate-50/50 min-h-[calc(100vh-4rem)]">
      <Container className="space-y-8">
        <div className="space-y-2">
          <Badge variant="indigo" className="text-xs">
            Active Recall & SRS
          </Badge>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">
            Flashcard Library & Visual Formulas
          </h1>
          <p className="text-sm text-slate-600 max-w-2xl">
            Retain formulas, key terminology, and high-yield facts using SM-2 spaced repetition algorithms.
          </p>
        </div>

        {decks.length === 0 ? (
          <Card className="border-slate-200/80 shadow-xs">
            <CardContent className="py-16 text-center space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto shadow-xs">
                <Zap className="w-8 h-8" />
              </div>
              <div className="space-y-1 max-w-sm mx-auto">
                <h3 className="text-lg font-extrabold text-slate-900">No Flashcard Decks Published Yet</h3>
                <p className="text-xs text-slate-500">
                  Visual formula cards and active recall decks are being created. You can practice topic-wise questions or read study articles in the meantime.
                </p>
              </div>
              <div className="flex items-center justify-center gap-3 pt-2">
                <Link href="/practice">
                  <Button variant="default" size="sm" className="font-semibold shadow-xs">
                    <HelpCircle className="w-3.5 h-3.5 mr-1" /> Practice Questions
                  </Button>
                </Link>
                <Link href="/articles">
                  <Button variant="outline" size="sm" className="font-semibold">
                    <BookOpen className="w-3.5 h-3.5 mr-1 text-teal-600" /> Read Articles
                  </Button>
                </Link>
              </div>
            </CardContent>
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