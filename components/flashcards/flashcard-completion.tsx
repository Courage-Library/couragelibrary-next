import React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CheckCircle2, Coins, RotateCcw } from "lucide-react";

interface FlashcardCompletionProps {
  deckTitle: string;
  ratingsCount: { again: number; hard: number; good: number; easy: number };
  onReviewAgain: () => void;
}

export function FlashcardCompletion({
  deckTitle,
  ratingsCount,
  onReviewAgain,
}: FlashcardCompletionProps) {
  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4">
      <Card className="max-w-md w-full p-6 text-center space-y-6 border-slate-200 shadow-lg">
        <div className="w-14 h-14 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto border border-emerald-200">
          <CheckCircle2 className="w-8 h-8" />
        </div>

        <div className="space-y-1">
          <h2 className="text-2xl font-black text-slate-900">Deck Review Finished!</h2>
          <p className="text-xs text-slate-500 font-medium">{deckTitle}</p>
        </div>

        <div className="grid grid-cols-4 gap-2 text-center text-xs">
          <div className="p-2.5 rounded-xl bg-red-50 border border-red-100">
            <span className="font-bold text-red-800 text-base block">{ratingsCount.again}</span>
            <span className="text-red-600 text-[10px] font-semibold">Again</span>
          </div>
          <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-100">
            <span className="font-bold text-amber-800 text-base block">{ratingsCount.hard}</span>
            <span className="text-amber-600 text-[10px] font-semibold">Hard</span>
          </div>
          <div className="p-2.5 rounded-xl bg-blue-50 border border-blue-100">
            <span className="font-bold text-blue-800 text-base block">{ratingsCount.good}</span>
            <span className="text-blue-600 text-[10px] font-semibold">Good</span>
          </div>
          <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-100">
            <span className="font-bold text-emerald-800 text-base block">{ratingsCount.easy}</span>
            <span className="text-emerald-600 text-[10px] font-semibold">Easy</span>
          </div>
        </div>

        <div className="p-3 rounded-2xl bg-amber-50/60 border border-amber-200 flex items-center justify-center gap-2 text-xs font-bold text-amber-900">
          <Coins className="w-4 h-4 text-amber-500 fill-amber-500" />
          <span>Active Recall Coins Awarded to Wallet!</span>
        </div>

        <div className="space-y-2 pt-2">
          <Button
            size="lg"
            variant="default"
            className="w-full bg-blue-600 hover:bg-blue-700 font-bold"
            onClick={onReviewAgain}
          >
            <RotateCcw className="w-4 h-4 mr-1.5" /> Review Deck Again
          </Button>

          <Link href="/flashcards" className="block">
            <Button size="md" variant="outline" className="w-full font-semibold">
              Back to Flashcard Library
            </Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}