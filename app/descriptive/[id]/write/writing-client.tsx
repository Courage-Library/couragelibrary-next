"use client";

import React, { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { DescriptiveQuestionDetail } from "@/services/descriptive.service";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Send, Upload, FileText, ShieldAlert } from "lucide-react";

interface AnswerWritingClientProps {
  question: DescriptiveQuestionDetail;
}

export function AnswerWritingClient({ question }: AnswerWritingClientProps) {
  const router = useRouter();
  const [submissionType, setSubmissionType] = useState<"TYPED_TEXT" | "ATTACHED_SCRIPT_PDF">("TYPED_TEXT");
  const [answerText, setAnswerText] = useState("");
  const [pdfUrlInput, setPdfUrlInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Live word count calculation
  const wordCount = useMemo(() => {
    if (!answerText.trim()) return 0;
    return answerText.trim().split(/\s+/).length;
  }, [answerText]);

  const isMaxExceeded = wordCount > question.wordLimitMax;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (submissionType === "TYPED_TEXT") {
      if (wordCount === 0) {
        setErrorMsg("Please write your answer text before submitting.");
        return;
      }
      if (isMaxExceeded) {
        setErrorMsg(`Word limit exceeded! Max allowed is ${question.wordLimitMax} words.`);
        return;
      }
    } else {
      if (!pdfUrlInput.trim()) {
        setErrorMsg("Please provide a valid PDF script attachment URL.");
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/descriptive/submit-answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId: question.id,
          answerText: submissionType === "TYPED_TEXT" ? answerText : undefined,
          attachmentUrl: submissionType === "ATTACHED_SCRIPT_PDF" ? pdfUrlInput : undefined,
          submissionType,
        }),
      });

      const data = await res.json();
      if (data.success && data.submission_id) {
        router.push(`/descriptive/submissions/${data.submission_id}`);
      } else {
        setErrorMsg(data.error || "Failed to submit answer.");
      }
    } catch {
      setErrorMsg("Network error submitting answer.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="py-8 bg-slate-50/50 min-h-[calc(100vh-4rem)] px-4">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Link
            href={`/descriptive/${question.slug}`}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Question
          </Link>

          <div className="flex items-center gap-2">
            <Badge variant="indigo" className="text-[10px]">
              {question.maxMarks} MARKS
            </Badge>
            <Badge variant="outline" className="text-[10px]">
              LIMIT: {question.wordLimitMax} WORDS
            </Badge>
          </div>
        </div>

        {/* Question Banner */}
        <Card className="p-5 bg-slate-900 text-white space-y-2 rounded-2xl shadow-sm">
          <span className="text-[10px] uppercase font-bold text-slate-400 font-mono tracking-wider">
            QUESTION PROMPT
          </span>
          <p className="text-sm sm:text-base font-semibold leading-relaxed">
            {question.questionText}
          </p>
        </Card>

        {/* Submission Mode Toggle */}
        <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
          <button
            type="button"
            onClick={() => setSubmissionType("TYPED_TEXT")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              submissionType === "TYPED_TEXT"
                ? "bg-blue-600 text-white shadow-xs"
                : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            <FileText className="w-3.5 h-3.5 inline mr-1.5" /> Typed Answer Studio
          </button>
          <button
            type="button"
            onClick={() => setSubmissionType("ATTACHED_SCRIPT_PDF")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              submissionType === "ATTACHED_SCRIPT_PDF"
                ? "bg-blue-600 text-white shadow-xs"
                : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            <Upload className="w-3.5 h-3.5 inline mr-1.5" /> Attach Answer Script PDF
          </button>
        </div>

        {errorMsg && (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {submissionType === "TYPED_TEXT" ? (
            <Card className="p-6 space-y-4 border-slate-200">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-700">Write Your Mains Response</span>
                <span className={`font-mono font-bold ${isMaxExceeded ? "text-rose-600 font-extrabold" : "text-blue-600"}`}>
                  {wordCount} / {question.wordLimitMax} Words
                </span>
              </div>

              <textarea
                rows={14}
                value={answerText}
                onChange={(e) => setAnswerText(e.target.value)}
                placeholder="Begin writing your structured essay/answer here (Introduction, Body Paragraphs, Conclusion)..."
                className="w-full p-4 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none text-sm text-slate-900 leading-relaxed font-serif resize-y"
              />
            </Card>
          ) : (
            <Card className="p-6 space-y-4 border-slate-200">
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-900">Upload / Attach Answer Script PDF</h3>
                <p className="text-xs text-slate-500">
                  Enter the secure attachment storage URL for your handwritten answer script.
                </p>
              </div>

              <input
                type="text"
                value={pdfUrlInput}
                onChange={(e) => setPdfUrlInput(e.target.value)}
                placeholder="https://.../my-handwritten-script.pdf"
                className="w-full p-3 rounded-xl border border-slate-200 text-xs font-mono outline-none focus:border-blue-500"
              />
            </Card>
          )}

          <div className="flex items-center justify-end gap-3">
            <Link href={`/descriptive/${question.slug}`}>
              <Button type="button" variant="outline" size="lg" className="font-semibold">
                Cancel
              </Button>
            </Link>
            <Button
              type="submit"
              size="lg"
              variant="default"
              className="bg-blue-600 hover:bg-blue-700 font-bold px-8"
              isLoading={isSubmitting}
            >
              <Send className="w-4 h-4 mr-2" /> Submit for Evaluation
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
