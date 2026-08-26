"use client";

import React, { useState, useCallback } from "react";
import Link from "next/link";
import { DrillQuestion } from "@/services/mistake.service";
import { QuestionRenderer } from "@/components/assessment/question-renderer";
import { QuestionOptions } from "@/components/assessment/question-options";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Coins,
} from "lucide-react";

interface DrillPlayerClientProps {
  drillId: string;
  questions: DrillQuestion[];
}

export function DrillPlayerClient({ drillId, questions }: DrillPlayerClientProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, { optionId: string; optionKey: string }>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<{
    correctCount: number;
    resolvedCount: number;
    coinsAwarded: number;
  } | null>(null);

  const currentQ = questions[currentIndex];
  const currentSelected = selectedAnswers[currentQ.question_id]?.optionKey || null;

  const handleSelectOption = (optionKey: string) => {
    const opt = currentQ.options.find((o) => o.option_key === optionKey);
    if (!opt) return;

    setSelectedAnswers((prev) => ({
      ...prev,
      [currentQ.question_id]: { optionId: opt.id, optionKey: opt.option_key },
    }));
  };

  const handleSubmitDrill = useCallback(async () => {
    setIsSubmitting(true);
    const answersPayload = questions.map((q) => {
      const selected = selectedAnswers[q.question_id];
      return {
        question_id: q.question_id,
        selected_option_id: selected?.optionId || "00000000-0000-0000-0000-000000000000",
        time_spent_seconds: 30,
      };
    });

    try {
      const res = await fetch("/api/mistakes/submit-drill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ drillId, answers: answersPayload }),
      });
      const data = await res.json();
      if (data.success) {
        setResult({
          correctCount: data.correct_count || 0,
          resolvedCount: data.mistakes_resolved_count || 0,
          coinsAwarded: data.coins_awarded || 0,
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [drillId, questions, selectedAnswers]);

  if (result) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center p-4">
        <Card className="max-w-md w-full p-6 text-center space-y-6 border-slate-200 shadow-lg">
          <div className="w-14 h-14 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto border border-emerald-200">
            <CheckCircle2 className="w-8 h-8" />
          </div>

          <div className="space-y-1">
            <h2 className="text-2xl font-black text-slate-900">Drill Completed!</h2>
            <p className="text-xs text-slate-500">Your mistake remediation drill has been evaluated.</p>
          </div>

          <div className="grid grid-cols-3 gap-2.5 text-center text-xs">
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
              <span className="font-bold text-emerald-800 text-lg block">{result.correctCount}/{questions.length}</span>
              <span className="text-emerald-600 text-[10px] font-semibold">Correct</span>
            </div>
            <div className="p-3 rounded-xl bg-blue-50 border border-blue-200">
              <span className="font-bold text-blue-800 text-lg block">{result.resolvedCount}</span>
              <span className="text-blue-600 text-[10px] font-semibold">Mastered</span>
            </div>
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
              <div className="flex items-center justify-center gap-1 font-bold text-amber-800 text-lg">
                <Coins className="w-4 h-4 text-amber-500 fill-amber-500" />
                +{result.coinsAwarded}
              </div>
              <span className="text-amber-600 text-[10px] font-semibold">Coins</span>
            </div>
          </div>

          <div className="pt-2">
            <Link href="/mistakes">
              <Button size="lg" variant="default" className="w-full bg-blue-600 hover:bg-blue-700 font-bold">
                Return to Mistake Notebook
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="py-10 bg-slate-50/50 min-h-[calc(100vh-4rem)]">
      <div className="max-w-3xl mx-auto px-4 space-y-6">
        {/* Drill Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <Badge variant="indigo" className="text-xs">
              Remediation Drill
            </Badge>
            <span className="text-xs font-semibold text-slate-500">
              Question {currentIndex + 1} of {questions.length}
            </span>
          </div>
          <Button
            size="sm"
            variant="default"
            className="bg-emerald-600 hover:bg-emerald-700 font-bold text-xs"
            onClick={handleSubmitDrill}
            isLoading={isSubmitting}
          >
            Submit Drill
          </Button>
        </div>

        {/* Main Question Box */}
        <Card className="p-6 space-y-6">
          <QuestionRenderer
            questionNumber={currentIndex + 1}
            questionText={currentQ.question_text}
            marks={2}
            negativeMark={0}
          />

          <QuestionOptions
            options={currentQ.options.map((o) => ({ key: o.option_key, text: o.option_text }))}
            selectedOption={currentSelected}
            onSelectOption={handleSelectOption}
          />
        </Card>

        {/* Navigation */}
        <div className="flex items-center justify-between pt-2">
          <Button
            variant="outline"
            size="sm"
            disabled={currentIndex === 0}
            onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
          >
            <ChevronLeft className="w-4 h-4 mr-1" /> Previous
          </Button>
          <Button
            variant="default"
            size="sm"
            disabled={currentIndex === questions.length - 1}
            onClick={() => setCurrentIndex((prev) => Math.min(questions.length - 1, prev + 1))}
          >
            Next <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
}