import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AssessmentService } from "@/services/assessment.service";
import { Container } from "@/components/ui/container";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { QuestionReviewCard } from "@/components/assessment/question-review-card";
import { ArrowLeft } from "lucide-react";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function MockTestResultPage({ params }: Props) {
  const { id } = await params;
  const data = await AssessmentService.getTestResult(id);

  if (!data) {
    notFound();
  }

  const { result, test, sections, reviewQuestions } = data;

  return (
    <div className="py-10 bg-slate-50/50 min-h-[calc(100vh-4rem)]">
      <Container className="space-y-8 max-w-4xl">
        <div className="flex items-center justify-between">
          <Link
            href="/mock-tests"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Mock Tests
          </Link>
          <Badge variant="indigo" className="text-xs">
            Phase 3B Server-Evaluated Scorecard
          </Badge>
        </div>

        {/* Scorecard Hero Banner */}
        <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-900 rounded-3xl p-6 sm:p-8 text-white shadow-md space-y-6">
          <div className="space-y-1">
            <span className="text-blue-200 text-xs font-bold uppercase tracking-wider">
              Attempt Summary
            </span>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">{test.title}</h1>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-slate-900">
            <div className="p-4 rounded-2xl bg-white shadow-xs">
              <span className="text-2xl sm:text-3xl font-black text-blue-700 block">
                {result.totalScore.toFixed(1)}
              </span>
              <span className="text-xs font-semibold text-slate-500">Score / {result.maxScore}</span>
            </div>
            <div className="p-4 rounded-2xl bg-white shadow-xs">
              <span className="text-2xl sm:text-3xl font-black text-emerald-600 block">
                {result.accuracyPercentage.toFixed(1)}%
              </span>
              <span className="text-xs font-semibold text-slate-500">Accuracy</span>
            </div>
            <div className="p-4 rounded-2xl bg-white shadow-xs">
              <span className="text-2xl sm:text-3xl font-black text-slate-800 block">
                {result.correctCount} / {result.totalQuestions}
              </span>
              <span className="text-xs font-semibold text-slate-500">Correct Answers</span>
            </div>
            <div className="p-4 rounded-2xl bg-white shadow-xs">
              <span className="text-2xl sm:text-3xl font-black text-amber-600 block">
                {Math.round(result.timeSpentSeconds / 60)}m
              </span>
              <span className="text-xs font-semibold text-slate-500">Time Taken</span>
            </div>
          </div>
        </div>

        {/* Section-Wise Breakdown */}
        {sections.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Section-Wise Performance</CardTitle>
              <CardDescription className="text-xs">
                Detailed breakdown across examination sections
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden text-xs">
                {sections.map((sec) => (
                  <div key={sec.sectionName} className="p-4 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h4 className="font-bold text-sm text-slate-800">{sec.sectionName}</h4>
                      <span className="text-[11px] text-slate-500">
                        {sec.attemptedCount} / {sec.totalQuestions} Attempted ({sec.accuracyPercentage.toFixed(0)}% Accuracy)
                      </span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-md border border-emerald-200/60">
                        {sec.correctCount} Correct
                      </span>
                      <span className="font-bold text-red-700 bg-red-50 px-2 py-1 rounded-md border border-red-200/60">
                        {sec.incorrectCount} Incorrect
                      </span>
                      <span className="font-bold text-blue-700 bg-blue-50 px-2 py-1 rounded-md border border-blue-200/60">
                        {sec.sectionScore.toFixed(1)} / {sec.maxScore} Mks
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Question-Wise Review */}
        <div className="space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-200">
            <h2 className="text-lg font-bold text-slate-900">Question-By-Question Detailed Solutions</h2>
            <Badge variant="outline" className="text-xs">
              {reviewQuestions.length} Questions
            </Badge>
          </div>

          <div className="space-y-4">
            {reviewQuestions.map((q) => (
              <QuestionReviewCard
                key={q.questionOrder}
                questionOrder={q.questionOrder}
                sectionName={q.sectionName}
                questionText={q.questionText}
                questionImageUrl={q.questionImageUrl}
                optionsType={q.optionsType}
                options={q.options}
                selectedOption={q.selectedOption}
                correctOption={q.correctOption}
                isCorrect={q.isCorrect}
                marksAwarded={q.marksAwarded}
                explanation={q.explanation}
                topicName={q.topicName}
                topicSlug={q.topicSlug}
              />
            ))}
          </div>
        </div>
      </Container>
    </div>
  );
}