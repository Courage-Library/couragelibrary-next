import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AssessmentService } from "@/services/assessment.service";
import { Container } from "@/components/ui/container";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Target, Clock, Layers } from "lucide-react";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function ExamDetailPage({ params }: Props) {
  const { slug } = await params;
  const exam = await AssessmentService.getExamDetail(slug);

  if (!exam) {
    notFound();
  }

  return (
    <div className="py-10 bg-slate-50/50 min-h-[calc(100vh-4rem)]">
      <Container className="space-y-8">
        <div>
          <Link
            href="/exams"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 transition-colors mb-4"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Exam Directory
          </Link>

          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center gap-2">
              <Badge variant="indigo" className="text-xs">
                {exam.category}
              </Badge>
              <Badge variant="outline" className="text-xs">
                {exam.conductingOrg}
              </Badge>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              {exam.title}
            </h1>
            {exam.description && (
              <p className="text-sm text-slate-600 max-w-3xl leading-relaxed">
                {exam.description}
              </p>
            )}
          </div>
        </div>

        {/* Exam Sections Grid */}
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Available Mock Tests (2 Cols) */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Target className="w-5 h-5 text-blue-600" />
                Available Mock Tests
              </h2>
              <Badge variant="outline" className="text-xs">
                {exam.mockTests.length} Tests
              </Badge>
            </div>

            {exam.mockTests.length === 0 ? (
              <Card className="p-8 text-center text-slate-400 space-y-2">
                <Target className="w-8 h-8 mx-auto opacity-50" />
                <p className="text-sm">Mock tests for this exam are being prepared.</p>
              </Card>
            ) : (
              <div className="space-y-3">
                {exam.mockTests.map((mt) => (
                  <div
                    key={mt.id}
                    className="p-5 rounded-2xl bg-white border border-slate-200 hover:border-blue-300 hover:shadow-xs transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        {mt.isFree && (
                          <Badge variant="success" className="text-[10px]">
                            FREE
                          </Badge>
                        )}
                        <span className="text-xs font-semibold text-slate-500">
                          {mt.totalQuestions} Questions â€¢ {mt.totalMarks} Marks
                        </span>
                      </div>
                      <h3 className="font-bold text-base text-slate-900">{mt.title}</h3>
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <Clock className="w-3.5 h-3.5" />
                        <span>{mt.durationMinutes} Minutes</span>
                      </div>
                    </div>
                    <Link href={`/mock-tests/${mt.id}`}>
                      <Button size="md" variant="default" className="w-full sm:w-auto font-semibold">
                        Start Test
                      </Button>
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Subjects & Syllabus (1 Col) */}
          <div className="space-y-4">
            <div className="pb-2 border-b border-slate-200">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Layers className="w-5 h-5 text-indigo-600" />
                Syllabus Subjects
              </h2>
            </div>

            <Card>
              <CardContent className="p-4 space-y-2.5">
                {exam.subjects.map((sub) => (
                  <div
                    key={sub.id}
                    className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between text-xs"
                  >
                    <span className="font-bold text-slate-800">{sub.name}</span>
                    <span className="font-mono text-[10px] text-slate-400 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                      {sub.code}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </Container>
    </div>
  );
}