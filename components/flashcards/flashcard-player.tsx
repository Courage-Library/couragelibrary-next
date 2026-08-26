"use client";

import React, { useState } from "react";
import { ReviewFlashcard } from "@/services/flashcard.service";
import { Button } from "@/components/ui/button";

import { Badge } from "@/components/ui/badge";
import {
  RotateCcw,
  HelpCircle,
  Eye,
  CheckCircle2,
  AlertCircle,
  Zap,
} from "lucide-react";

interface FlashcardPlayerProps {
  card: ReviewFlashcard;
  cardNumber: number;
  totalCards: number;
  onRateCard: (rating: 1 | 2 | 3 | 4) => void;
  isSubmitting?: boolean;
}

export function FlashcardPlayer({
  card,
  cardNumber,
  totalCards,
  onRateCard,
  isSubmitting = false,
}: FlashcardPlayerProps) {
  const [isRevealed, setIsRevealed] = useState(false);
  const [showHint, setShowHint] = useState(false);

  const handleReveal = () => {
    setIsRevealed(true);
  };

  const handleRate = (rating: 1 | 2 | 3 | 4) => {
    setIsRevealed(false);
    setShowHint(false);
    onRateCard(rating);
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* Session Progress Header */}
      <div className="flex items-center justify-between text-xs text-slate-500 font-semibold pb-2">
        <span className="flex items-center gap-1.5">
          <Badge variant="indigo" className="text-[10px]">SM-2 SRS</Badge>
          <span>Card {cardNumber} of {totalCards}</span>
        </span>
        <span className="font-mono text-slate-400">
          Interval: {card.intervalDays}d â€¢ Ease: {card.easeFactor.toFixed(2)}
        </span>
      </div>

      {/* 3D Flashcard Container */}
      <div className="min-h-[320px] rounded-3xl bg-white border border-slate-200/90 p-6 sm:p-10 shadow-sm flex flex-col justify-between transition-all">
        {/* Front Prompt */}
        <div className="space-y-4">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider font-mono block">
            Prompt / Question
          </span>
          <div className="text-lg sm:text-xl font-bold text-slate-900 leading-relaxed whitespace-pre-wrap">
            {card.frontText}
          </div>

          {/* Latex Formulas if present */}
          {card.latexFormulas && card.latexFormulas.length > 0 && (
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 font-mono text-xs text-blue-900">
              {card.latexFormulas.join("  |  ")}
            </div>
          )}

          {/* Optional Hint Toggle */}
          {card.hint && (
            <div className="pt-2">
              {!showHint ? (
                <button
                  type="button"
                  onClick={() => setShowHint(true)}
                  className="text-xs font-semibold text-slate-400 hover:text-slate-700 flex items-center gap-1 cursor-pointer"
                >
                  <HelpCircle className="w-3.5 h-3.5" /> Show Hint
                </button>
              ) : (
                <p className="text-xs text-slate-600 bg-amber-50/60 p-2.5 rounded-xl border border-amber-200/60">
                  ðŸ’¡ Hint: {card.hint}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Back Answer (Hidden before reveal) */}
        {isRevealed ? (
          <div className="space-y-4 pt-6 mt-6 border-t border-slate-100 animate-in fade-in slide-in-from-bottom-2 duration-200">
            <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider font-mono block">
              Answer & Key Concept
            </span>
            <div className="text-base sm:text-lg font-bold text-emerald-950 leading-relaxed whitespace-pre-wrap">
              {card.backText}
            </div>

            {card.mnemonic && (
              <div className="p-3 rounded-xl bg-purple-50/60 border border-purple-200/60 text-xs text-purple-900 space-y-0.5">
                <span className="font-bold block">âš¡ Mnemonic Aid:</span>
                <p>{card.mnemonic}</p>
              </div>
            )}

            {card.explanation && (
              <p className="text-xs text-slate-600 leading-relaxed">
                {card.explanation}
              </p>
            )}
          </div>
        ) : (
          <div className="pt-8 flex justify-center">
            <Button
              size="lg"
              variant="default"
              className="bg-blue-600 hover:bg-blue-700 font-bold px-10 shadow-sm"
              onClick={handleReveal}
            >
              <Eye className="w-4 h-4 mr-2" /> Show Answer
            </Button>
          </div>
        )}
      </div>

      {/* 4 SM-2 Rating Buttons (Visible only after reveal) */}
      {isRevealed && (
        <div className="space-y-2 pt-2 animate-in fade-in duration-200">
          <span className="text-center text-xs font-bold text-slate-500 uppercase tracking-wider font-mono block">
            Rate Your Recall (SM-2 Interval)
          </span>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => handleRate(1)}
              className="p-3 rounded-2xl border border-red-200 bg-red-50/60 hover:bg-red-100 hover:border-red-300 text-left transition-all cursor-pointer group"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-red-700">1. AGAIN</span>
                <RotateCcw className="w-3.5 h-3.5 text-red-500" />
              </div>
              <span className="text-[10px] text-red-600/80 mt-0.5 block font-medium">
                Forgot / Reset (1d)
              </span>
            </button>

            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => handleRate(2)}
              className="p-3 rounded-2xl border border-amber-200 bg-amber-50/60 hover:bg-amber-100 hover:border-amber-300 text-left transition-all cursor-pointer group"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-amber-700">2. HARD</span>
                <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
              </div>
              <span className="text-[10px] text-amber-600/80 mt-0.5 block font-medium">
                Struggled recall
              </span>
            </button>

            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => handleRate(3)}
              className="p-3 rounded-2xl border border-blue-200 bg-blue-50/60 hover:bg-blue-100 hover:border-blue-300 text-left transition-all cursor-pointer group"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-blue-700">3. GOOD</span>
                <CheckCircle2 className="w-3.5 h-3.5 text-blue-500" />
              </div>
              <span className="text-[10px] text-blue-600/80 mt-0.5 block font-medium">
                Recalled normally
              </span>
            </button>

            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => handleRate(4)}
              className="p-3 rounded-2xl border border-emerald-200 bg-emerald-50/60 hover:bg-emerald-100 hover:border-emerald-300 text-left transition-all cursor-pointer group"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-emerald-700">4. EASY</span>
                <Zap className="w-3.5 h-3.5 text-emerald-500" />
              </div>
              <span className="text-[10px] text-emerald-600/80 mt-0.5 block font-medium">
                Instant recall (+30%)
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}