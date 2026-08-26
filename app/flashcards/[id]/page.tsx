import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FlashcardService } from "@/services/flashcard.service";
import { Container } from "@/components/ui/container";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function FlashcardDeckDetailPage({ params }: Props) {
  const { id } = await params;
  const deck = await FlashcardService.getDeckDetail(id);

  if (!deck) {
    notFound();
  }

  return (
    <div className="py-10 bg-slate-50/50 min-h-[calc(100vh-4rem)]">
      <Container className="space-y-6 max-w-3xl">
        <Link
          href="/flashcards"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Flashcards
        </Link>

        <Card className="p-6 sm:p-8 space-y-6 border-slate-200 shadow-sm">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant={deck.accessTier === "PRO" ? "indigo" : "outline"} className="text-xs">
                {deck.accessTier === "PRO" ? "PRO DECK" : "FREE"}
              </Badge>
              {deck.topicName && (
                <span className="text-xs font-semibold text-slate-500">{deck.topicName}</span>
              )}
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              {deck.title}
            </h1>
            {deck.description && (
              <p className="text-sm text-slate-600 leading-relaxed">
                {deck.description}
              </p>
            )}
          </div>

          {/* Deck Stats & Mastery Grid */}
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
              <span className="text-2xl font-black text-slate-900 block">{deck.cardCount}</span>
              <span className="text-xs text-slate-500 font-semibold">Total Cards</span>
            </div>
            <div className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-100">
              <span className="text-2xl font-black text-emerald-800 block">{deck.masteredCount}</span>
              <span className="text-xs text-emerald-700 font-semibold">Mastered</span>
            </div>
            <div className="p-4 rounded-2xl bg-blue-50/60 border border-blue-100">
              <span className="text-2xl font-black text-blue-800 block">{deck.masteryPercentage}%</span>
              <span className="text-xs text-blue-700 font-semibold">Mastery</span>
            </div>
          </div>

          {/* Entitlement Notice if PRO */}
          {deck.accessTier === "PRO" && !deck.hasProAccess && (
            <div className="p-4 rounded-2xl bg-purple-50 border border-purple-200 text-xs text-purple-900 space-y-1">
              <span className="font-bold block">âœ¨ PRO Deck Preview Available</span>
              <p className="text-purple-800">
                You can preview the first 3 cards of this curated deck. Subscribe to PRO for unlimited spaced repetition access.
              </p>
            </div>
          )}

          <div className="pt-2">
            <Link href={`/flashcards/${deck.id}/review`}>
              <Button size="lg" variant="default" className="w-full bg-blue-600 hover:bg-blue-700 font-bold">
                Start Spaced Repetition Review
              </Button>
            </Link>
          </div>
        </Card>
      </Container>
    </div>
  );
}