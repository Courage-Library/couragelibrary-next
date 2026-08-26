"use client";

import React, { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { SubmissionEvaluationDetail } from "@/services/descriptive.service";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Award, ShieldAlert, Send } from "lucide-react";

interface FacultyEvalConsoleClientProps {
  detail: SubmissionEvaluationDetail;
}

export function FacultyEvalConsoleClient({ detail }: FacultyEvalConsoleClientProps) {
  const router = useRouter();
  const { submission, rubric } = detail;

  // Initialize criterion scores
  const defaultCriteria = rubric?.criteria || [
    { id: "c1", name: "Understanding of Core Concept", description: "Demonstration of foundational principles.", maxPoints: Math.round(submission.maxMarks * 0.4) },
    { id: "c2", name: "Structure & Logical Flow", description: "Clear introduction, body and conclusion.", maxPoints: Math.round(submission.maxMarks * 0.3) },
    { id: "c3", name: "Factual Accuracy & Depth", description: "Specific facts, case laws, data points.", maxPoints: Math.round(submission.maxMarks * 0.3) },
  ];

  const [scoresMap, setScoresMap] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    defaultCriteria.forEach((c) => {
      initial[c.id] = 0;
    });
    return initial;
  });

  const [strengths, setStrengths] = useState("");
  const [weaknesses, setWeaknesses] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Total calculated score sum
  const totalScore = useMemo(() => {
    return Object.values(scoresMap).reduce((sum, val) => sum + Number(val || 0), 0);
  }, [scoresMap]);

  const handleScoreChange = (criterionId: string, val: number, maxPts: number) => {
    const clamped = Math.max(0, Math.min(maxPts, val));
    setScoresMap((prev) => ({ ...prev, [criterionId]: clamped }));
  };

  const handleSubmitEvaluation = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setIsSubmitting(true);

    const rubricScoresPayload = defaultCriteria.map((c) => ({
      criterionId: c.id,
      criterionName: c.name,
      scoreAwarded: scoresMap[c.id] || 0,
      maxPoints: c.maxPoints,
    }));

    try {
      const res = await fetch("/api/descriptive/submit-evaluation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submissionId: submission.id,
          rubricScores: rubricScoresPayload,
          totalScore,
          strengths,
          weaknesses,
          evaluatorType: "HUMAN_FACULTY",
        }),
      });

      const data = await res.json();
      if (data.success) {
        router.push(`/descriptive/submissions/${submission.id}`);
      } else {
        setErrorMsg(data.error || "Failed to submit faculty evaluation");
      }
    } catch {
      setErrorMsg("Network error submitting evaluation");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="py-8 bg-slate-50/50 min-h-[calc(100vh-4rem)] px-4">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Link
            href="/faculty/evaluations"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Faculty Queue
          </Link>

          <Badge variant="indigo" className="text-[10px]">
            FACULTY GRADING CONSOLE
          </Badge>
        </div>

        {errorMsg && (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Left Column: Question & Student Answer */}
          <div className="space-y-4">
            <Card className="p-5 space-y-2 border-slate-200">
              <span className="text-[10px] uppercase font-bold text-slate-400 font-mono tracking-wider">
                QUESTION STATEMENT ({submission.maxMarks} MARKS)
              </span>
              <h3 className="font-bold text-slate-900 text-sm">{submission.questionTitle}</h3>
              <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap">
                {submission.questionText}
              </p>
            </Card>

            <Card className="p-5 space-y-3 border-slate-200">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-700">Student Submitted Response</span>
                <span className="text-slate-400 font-mono">Word Count: {submission.wordCount}</span>
              </div>

              {submission.answerText ? (
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 leading-relaxed font-serif whitespace-pre-wrap max-h-[500px] overflow-y-auto">
                  {submission.answerText}
                </div>
              ) : submission.attachmentUrl ? (
                <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-900">
                  <span className="font-bold block mb-1">Attached PDF Script:</span>
                  <a href={submission.attachmentUrl} target="_blank" rel="noreferrer" className="underline font-bold text-blue-700">
                    Open PDF in New Window
                  </a>
                </div>
              ) : null}
            </Card>
          </div>

          {/* Right Column: Faculty Evaluation Form */}
          <form onSubmit={handleSubmitEvaluation} className="space-y-4">
            <Card className="p-6 space-y-5 border-slate-200">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                  <Award className="w-5 h-5 text-purple-700" /> Rubric Evaluation Scorecard
                </h3>
                <span className="font-mono font-black text-lg text-purple-900 bg-purple-50 px-3 py-1 rounded-xl border border-purple-200">
                  {totalScore} / {submission.maxMarks} pts
                </span>
              </div>

              {/* Criteria Inputs */}
              <div className="space-y-4">
                {defaultCriteria.map((c) => (
                  <div key={c.id} className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-900">
                      <span>{c.name}</span>
                      <span className="text-slate-500 font-mono">Max {c.maxPoints} pts</span>
                    </div>
                    <p className="text-[11px] text-slate-500">{c.description}</p>
                    <input
                      type="number"
                      step="0.5"
                      min={0}
                      max={c.maxPoints}
                      value={scoresMap[c.id] || 0}
                      onChange={(e) => handleScoreChange(c.id, parseFloat(e.target.value) || 0, c.maxPoints)}
                      className="w-full p-2 rounded-lg border border-slate-200 text-xs font-mono font-bold outline-none focus:border-purple-600 bg-white"
                    />
                  </div>
                ))}
              </div>

              {/* Feedback Inputs */}
              <div className="space-y-3 pt-2 border-t border-slate-100">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Key Strengths</label>
                  <textarea
                    rows={2}
                    value={strengths}
                    onChange={(e) => setStrengths(e.target.value)}
                    placeholder="Highlight good arguments, introduction, or relevant facts..."
                    className="w-full p-3 rounded-xl border border-slate-200 text-xs outline-none focus:border-purple-600"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Areas for Improvement</label>
                  <textarea
                    rows={2}
                    value={weaknesses}
                    onChange={(e) => setWeaknesses(e.target.value)}
                    placeholder="Point out missing subheadings, vague statements, or word limit issues..."
                    className="w-full p-3 rounded-xl border border-slate-200 text-xs outline-none focus:border-purple-600"
                  />
                </div>
              </div>

              <Button
                type="submit"
                size="lg"
                variant="default"
                className="w-full bg-purple-700 hover:bg-purple-800 font-bold"
                isLoading={isSubmitting}
              >
                <Send className="w-4 h-4 mr-2" /> Complete Faculty Evaluation
              </Button>
            </Card>
          </form>
        </div>
      </div>
    </div>
  );
}
