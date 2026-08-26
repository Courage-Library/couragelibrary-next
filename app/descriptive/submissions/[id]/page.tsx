import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DescriptiveService } from "@/services/descriptive.service";
import { Container } from "@/components/ui/container";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Award, BookOpen } from "lucide-react";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function SubmissionEvaluationDetailPage({ params }: Props) {
  const { id } = await params;
  const data = await DescriptiveService.getSubmissionDetail(id);

  if (!data) {
    notFound();
  }

  const { submission, evaluation, canEvaluate } = data;

  return (
    <div className="py-10 bg-slate-50/50 min-h-[calc(100vh-4rem)]">
      <Container className="space-y-6 max-w-4xl">
        <div className="flex items-center justify-between">
          <Link
            href="/descriptive/submissions"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to My Submissions
          </Link>

          {canEvaluate && submission.status !== "EVALUATED" && (
            <Link href={`/faculty/evaluations/${submission.id}`}>
              <Button size="sm" variant="default" className="bg-purple-700 hover:bg-purple-800 font-bold text-xs">
                Grade Submission in Faculty Console
              </Button>
            </Link>
          )}
        </div>

        {/* Scorecard Header Banner if evaluated */}
        {evaluation ? (
          <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-r from-emerald-900 via-teal-900 to-slate-900 text-white shadow-lg space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-1">
                <Badge variant="success" className="bg-white/20 text-white border-white/20">
                  OFFICIAL EVALUATION SCORECARD
                </Badge>
                <h1 className="text-2xl sm:text-3xl font-black">
                  {evaluation.totalScoreAwarded} / {submission.maxMarks} Marks ({evaluation.percentageScore}%)
                </h1>
              </div>

              <div className="text-right space-y-0.5">
                <span className="text-[10px] uppercase font-bold text-emerald-200 block">Evaluated By</span>
                <span className="text-xs font-bold bg-white/10 px-3 py-1 rounded-lg border border-white/15">
                  {evaluation.evaluatorType.replace(/_/g, " ")}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-6 rounded-3xl bg-amber-50 border border-amber-200 text-amber-900 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-700">STATUS: SUBMITTED</span>
              <h2 className="text-lg font-bold">Awaiting Faculty Evaluation</h2>
              <p className="text-xs text-amber-800">Your answer has been submitted and queued for rubric grading.</p>
            </div>
          </div>
        )}

        {/* Question Statement */}
        <Card className="p-6 space-y-2 border-slate-200">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider font-mono">
            Question Prompt
          </span>
          <h2 className="text-base font-bold text-slate-900">{submission.questionTitle}</h2>
          <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap">{submission.questionText}</p>
        </Card>

        {/* Student's Answer */}
        <Card className="p-6 space-y-3 border-slate-200">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-slate-700">Student Submitted Answer</span>
            <span className="text-slate-400 font-mono">
              Type: {submission.submissionType} • {submission.wordCount} words
            </span>
          </div>

          {submission.answerText ? (
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs sm:text-sm text-slate-900 leading-relaxed font-serif whitespace-pre-wrap">
              {submission.answerText}
            </div>
          ) : submission.attachmentUrl ? (
            <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-900 flex items-center justify-between">
              <span>Attached Handwritten PDF Script:</span>
              <a
                href={submission.attachmentUrl}
                target="_blank"
                rel="noreferrer"
                className="font-bold text-blue-700 underline"
              >
                View PDF Script
              </a>
            </div>
          ) : null}
        </Card>

        {/* Evaluation Rubric Breakdown */}
        {evaluation && (
          <div className="space-y-6">
            {/* Rubric Criteria Scores */}
            {evaluation.rubricScores && evaluation.rubricScores.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Award className="w-4 h-4 text-emerald-600" />
                    Rubric Criteria Evaluation
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {evaluation.rubricScores.map((r, i) => (
                    <div key={i} className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1.5">
                      <div className="flex items-center justify-between font-bold text-slate-900">
                        <span>{r.criterionName}</span>
                        <span className="font-mono text-emerald-700">
                          {r.scoreAwarded} / {r.maxPoints} pts
                        </span>
                      </div>
                      {r.feedback && (
                        <p className="text-slate-600 leading-relaxed">{r.feedback}</p>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Qualitative Feedback */}
            <div className="grid md:grid-cols-2 gap-4">
              {evaluation.strengthsFeedback && (
                <Card className="p-5 space-y-2 border-emerald-200 bg-emerald-50/40">
                  <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider block">
                    Key Strengths
                  </span>
                  <p className="text-xs text-slate-700 leading-relaxed">{evaluation.strengthsFeedback}</p>
                </Card>
              )}

              {evaluation.weaknessesFeedback && (
                <Card className="p-5 space-y-2 border-rose-200 bg-rose-50/40">
                  <span className="text-xs font-bold text-rose-800 uppercase tracking-wider block">
                    Areas for Improvement
                  </span>
                  <p className="text-xs text-slate-700 leading-relaxed">{evaluation.weaknessesFeedback}</p>
                </Card>
              )}
            </div>

            {/* Model Answer comparison */}
            {submission.modelAnswerMd && (
              <Card className="p-6 space-y-3 border-blue-200 bg-blue-50/30">
                <div className="flex items-center gap-2 text-blue-900 font-bold text-sm">
                  <BookOpen className="w-4 h-4 text-blue-600" />
                  Model Answer & Reference Solution
                </div>
                <div className="text-xs text-slate-800 leading-relaxed font-serif whitespace-pre-wrap">
                  {submission.modelAnswerMd}
                </div>
              </Card>
            )}
          </div>
        )}
      </Container>
    </div>
  );
}
