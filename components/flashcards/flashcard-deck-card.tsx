import React from "react";
import Link from "next/link";
import { FlashcardDeckItem } from "@/services/flashcard.service";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";


interface FlashcardDeckCardProps {
  deck: FlashcardDeckItem;
}

export function FlashcardDeckCard({ deck }: FlashcardDeckCardProps) {
  return (
    <Card className="p-5 hover:border-blue-300 hover:shadow-md transition-all flex flex-col justify-between h-full">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant={deck.accessTier === "PRO" ? "indigo" : "outline"} className="text-[10px]">
              {deck.accessTier === "PRO" ? "PRO DECK" : "FREE"}
            </Badge>
            {deck.isCurated && (
              <Badge variant="success" className="text-[10px]">
                CURATED
              </Badge>
            )}
          </div>
          {deck.dueCount > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-[10px] font-bold">
              {deck.dueCount} Due
            </span>
          )}
        </div>

        <div>
          <span className="text-xs text-slate-400 font-medium">
            {deck.examTitle || deck.subjectName || "Active Recall"}
          </span>
          <h3 className="font-bold text-base text-slate-900 mt-0.5">{deck.title}</h3>
          {deck.description && (
            <p className="text-xs text-slate-500 line-clamp-2 mt-1 leading-relaxed">
              {deck.description}
            </p>
          )}
        </div>

        {/* Mastery Progress Bar */}
        <div className="space-y-1.5 pt-2 border-t border-slate-100 text-xs">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-500">{deck.cardCount} Cards</span>
            <span className="font-mono font-bold text-blue-600">{deck.masteryPercentage}% Mastered</span>
          </div>
          <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-600 rounded-full transition-all"
              style={{ width: `${Math.min(100, deck.masteryPercentage)}%` }}
            />
          </div>
        </div>
      </div>

      <div className="pt-4 mt-4 border-t border-slate-100 flex items-center gap-2">
        <Link href={`/flashcards/${deck.slug || deck.id}`} className="w-1/2">
          <Button variant="outline" size="sm" className="w-full text-xs font-semibold">
            Details
          </Button>
        </Link>
        <Link href={`/flashcards/${deck.id}/review`} className="w-1/2">
          <Button variant="default" size="sm" className="w-full text-xs font-bold bg-blue-600 hover:bg-blue-700">
            Review Now
          </Button>
        </Link>
      </div>
    </Card>
  );
}