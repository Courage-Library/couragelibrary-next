import React from "react";
import Link from "next/link";
import { DescriptiveService } from "@/services/descriptive.service";
import { Container } from "@/components/ui/container";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, PenTool, Sparkles, HelpCircle } from "lucide-react";
import { constructMetadata } from "@/lib/seo/metadata";

export const revalidate = 30;

export const metadata = constructMetadata({
  title: "Descriptive Answer Writing Studio",
  description: "Practice Mains answer writing with structured rubrics, word limit enforcement, and expert faculty evaluation.",
});

interface Props {
  searchParams: Promise<{ difficulty?: string }>;
}

export default async function DescriptiveLibraryPage({ searchParams }: Props) {
  const { difficulty = "ALL" } = await searchParams;
  const questions = await DescriptiveService.getDescriptiveQuestions({ difficulty });

  return (
    <div className="py-10 bg-slate-50/50 min-h-[calc(100vh-4rem)]">
      <Container className="space-y-8">
        {/* Header Banner */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6 bg-gradient-to-r from-slate-900 via-blue-950 to-indigo-950 rounded-3xl p-6 sm:p-8 text-white shadow-lg">
          <div className="space-y-2">
            <Badge variant="indigo" className="bg-white/20 text-white border-white/20">
              Mains Evaluation Studio
            </Badge>
            <h1 className="text-2xl sm:text-4xl font-black tracking-tight flex items-center gap-3">
              <PenTool className="w-8 h-8 text-blue-400" />
              Descriptive Answer Writing Studio
            </h1>
            <p className="text-blue-100 text-sm max-w-xl">
              Practice Mains answer writing with structured rubrics, word limit enforcement, and expert faculty evaluation.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link href="/descriptive/submissions">
              <Button size="lg" variant="default" className="bg-white text-slate-900 hover:bg-slate-100 font-bold shadow-md">
                <FileText className="w-4 h-4 mr-2 text-blue-600" />
                My Submissions History
              </Button>
            </Link>
          </div>
        </div>

        {/* Filter Chips */}
        <div className="flex flex-wrap items-center gap-2">
          {[
            { label: "All Questions", val: "ALL" },
            { label: "Easy", val: "easy" },
            { label: "Medium", val: "medium" },
            { label: "Hard", val: "hard" },
          ].map((tab) => (
            <Link
              key={tab.val}
              href={`/descriptive?difficulty=${tab.val}`}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                difficulty === tab.val
                  ? "bg-blue-600 text-white shadow-xs"
                  : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </div>

        {/* Questions Grid / Empty State */}
        {questions.length === 0 ? (
          <Card className="border-slate-200/80 shadow-xs">
            <CardContent className="py-16 text-center space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto shadow-xs">
                <PenTool className="w-8 h-8" />
              </div>
              <div className="space-y-1 max-w-sm mx-auto">
                <h3 className="text-lg font-extrabold text-slate-900">No Descriptive Questions Found</h3>
                <p className="text-xs text-slate-500">
                  UPSC and State PSC Mains questions with evaluation rubrics are being prepared. Try selecting a different filter or practice objective questions.
                </p>
              </div>
              <div className="flex items-center justify-center gap-3 pt-2">
                <Link href="/practice">
                  <Button variant="default" size="sm" className="font-semibold shadow-xs">
                    <HelpCircle className="w-3.5 h-3.5 mr-1" /> Practice Objective Qs
                  </Button>
                </Link>
                <Link href="/articles">
                  <Button variant="outline" size="sm" className="font-semibold">
                    <Sparkles className="w-3.5 h-3.5 mr-1 text-amber-500" /> Read Study Notes
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {questions.map((q) => (
              <Card key={q.id} className="p-5 flex flex-col justify-between hover:border-blue-300 hover:shadow-md transition-all">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          q.difficulty === "easy"
                            ? "success"
                            : q.difficulty === "hard"
                            ? "destructive"
                            : "warning"
                        }
                        className="text-[10px] uppercase"
                      >
                        {q.difficulty}
                      </Badge>
                      {q.examTitle && (
                        <span className="text-[11px] font-semibold text-slate-500">{q.examTitle}</span>
                      )}
                    </div>
                    <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100">
                      {q.maxMarks} Marks
                    </span>
                  </div>

                  <h3 className="font-bold text-slate-900 text-sm line-clamp-2 leading-relaxed">
                    {q.title}
                  </h3>

                  <p className="text-xs text-slate-500 line-clamp-2 leading-normal">
                    {q.questionText}
                  </p>

                  <div className="flex items-center gap-4 text-[11px] text-slate-500 pt-2 border-t border-slate-100 font-mono">
                    <span>Limit: {q.wordLimitMax} words</span>
                    {q.timeLimitMinutes && (
                      <span>Time: {q.timeLimitMinutes} mins</span>
                    )}
                  </div>
                </div>

                <div className="pt-4 mt-4 border-t border-slate-100 flex items-center gap-2">
                  <Link href={`/descriptive/${q.slug}`} className="w-1/2">
                    <Button variant="outline" size="sm" className="w-full text-xs font-semibold">
                      Instructions
                    </Button>
                  </Link>
                  <Link href={`/descriptive/${q.slug}/write`} className="w-1/2">
                    <Button variant="default" size="sm" className="w-full text-xs font-bold bg-blue-600 hover:bg-blue-700">
                      Write Answer
                    </Button>
                  </Link>
                </div>
              </Card>
            ))}
          </div>
        )}
      </Container>
    </div>
  );
}
