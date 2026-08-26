import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DescriptiveService } from "@/services/descriptive.service";
import { Container } from "@/components/ui/container";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, PenTool, Lock } from "lucide-react";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function DescriptiveQuestionDetailPage({ params }: Props) {
  const { id } = await params;
  const question = await DescriptiveService.getDescriptiveQuestionDetail(id);

  if (!question) {
    notFound();
  }

  return (
    <div className="py-10 bg-slate-50/50 min-h-[calc(100vh-4rem)]">
      <Container className="space-y-6 max-w-3xl">
        <Link
          href="/descriptive"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Mains Library
        </Link>

        {/* Question Info Card */}
        <Card className="p-6 sm:p-8 space-y-6 border-slate-200 shadow-sm">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="indigo" className="text-xs uppercase">
                {question.difficulty}
              </Badge>
              {question.examTitle && (
                <span className="text-xs font-semibold text-slate-500">{question.examTitle}</span>
              )}
              {question.topicName && (
                <span className="text-xs text-slate-400">• {question.topicName}</span>
              )}
            </div>

            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight leading-tight">
              {question.title}
            </h1>
          </div>

          {/* Guidelines & Limits */}
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100">
              <span className="text-xl font-black text-slate-900 block font-mono">{question.maxMarks}</span>
              <span className="text-xs text-slate-500 font-semibold">Max Marks</span>
            </div>
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100">
              <span className="text-xl font-black text-slate-900 block font-mono">{question.wordLimitMax}</span>
              <span className="text-xs text-slate-500 font-semibold">Word Limit</span>
            </div>
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100">
              <span className="text-xl font-black text-slate-900 block font-mono">
                {question.timeLimitMinutes ? `${question.timeLimitMinutes}m` : "Untimed"}
              </span>
              <span className="text-xs text-slate-500 font-semibold">Suggested Time</span>
            </div>
          </div>

          {/* Full Question Statement */}
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider font-mono">
              Question Statement
            </h2>
            <div className="p-5 rounded-2xl bg-slate-900 text-white font-medium text-sm sm:text-base leading-relaxed whitespace-pre-wrap shadow-xs">
              {question.questionText}
            </div>
          </div>

          {/* Evaluation Guidelines if present */}
          {question.evaluationGuidelinesMd && (
            <div className="p-4 rounded-2xl bg-blue-50/60 border border-blue-100 text-xs text-blue-950 space-y-1">
              <span className="font-bold block">Evaluation Guidelines:</span>
              <p className="leading-relaxed text-slate-700">{question.evaluationGuidelinesMd}</p>
            </div>
          )}

          {/* Model Answer status notice */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-slate-400" />
              <span>Model Answer & Rubric Solution:</span>
            </div>
            {question.modelAnswerMd ? (
              <Badge variant="success" className="text-[10px]">Unlocked (Evaluated)</Badge>
            ) : (
              <span className="text-[11px] text-slate-400 font-medium">Unlocked post-faculty evaluation</span>
            )}
          </div>

          {/* CTAs */}
          <div className="pt-2 flex flex-col sm:flex-row gap-3">
            <Link href={`/descriptive/${question.slug}/write`} className="w-full">
              <Button size="lg" variant="default" className="w-full bg-blue-600 hover:bg-blue-700 font-bold">
                <PenTool className="w-4 h-4 mr-2" /> Start Writing Answer
              </Button>
            </Link>
          </div>
        </Card>
      </Container>
    </div>
  );
}
