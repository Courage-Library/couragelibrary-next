import React from "react";
import Link from "next/link";
import { AssessmentService } from "@/services/assessment.service";
import { ResultViewClient } from "@/components/assessment/result-view-client";
import { Container } from "@/components/ui/container";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, ArrowLeft, Clock } from "lucide-react";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function MockTestResultPage({ params }: Props) {
  const { id } = await params;
  const data = await AssessmentService.getTestResult(id);

  if (!data) {
    const attemptStatus = await AssessmentService.getAttemptSubmissionStatus(id);
    const isSubmitted = attemptStatus?.isSubmitted;

    if (isSubmitted) {
      return (
        <div className="min-h-[calc(100vh-4rem)] bg-slate-50/60 py-12 flex items-center">
          <Container className="max-w-xl">
            <Card className="p-8 text-center bg-white border border-blue-200/80 rounded-3xl shadow-sm space-y-5">
              <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto border border-blue-200">
                <Clock className="w-6 h-6 animate-pulse" />
              </div>

              <div className="space-y-2">
                <h1 className="text-xl font-black text-slate-900 tracking-tight">
                  Your test has been submitted
                </h1>
                <p className="text-xs sm:text-sm text-slate-600 font-medium leading-relaxed">
                  Your test has been submitted. Your result is being prepared.
                </p>
              </div>

              <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
                <Link href="/mock-tests" className="w-full sm:w-auto">
                  <Button variant="default" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs">
                    <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
                    Mock Tests Command Center
                  </Button>
                </Link>
              </div>
            </Card>
          </Container>
        </div>
      );
    }

    return (
      <div className="min-h-[calc(100vh-4rem)] bg-slate-50/60 py-12 flex items-center">
        <Container className="max-w-xl">
          <Card className="p-8 text-center bg-white border border-slate-200/80 rounded-3xl shadow-sm space-y-5">
            <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mx-auto border border-amber-200">
              <AlertCircle className="w-6 h-6" />
            </div>

            <div className="space-y-2">
              <h1 className="text-xl font-black text-slate-900 tracking-tight">
                Evaluation Not Available
              </h1>
              <p className="text-xs sm:text-sm text-slate-600 font-medium leading-relaxed">
                We couldn&apos;t find a completed evaluation or score report for this mock test attempt.
                The attempt may still be in progress, unsubmitted, or expired.
              </p>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link href="/mock-tests" className="w-full sm:w-auto">
                <Button variant="default" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs">
                  <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
                  Mock Tests Command Center
                </Button>
              </Link>
            </div>
          </Card>
        </Container>
      </div>
    );
  }

  return <ResultViewClient data={data} />;
}