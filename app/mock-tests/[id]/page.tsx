import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AssessmentService } from "@/services/assessment.service";
import { Container } from "@/components/ui/container";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ShieldAlert, CheckCircle2, ArrowLeft, Eye } from "lucide-react";
import { StartTestActionButton } from "@/components/assessment/start-test-action-button";

interface Props {
  params: Promise<{ id: string }>;
}

interface AttemptRow {
  id: string;
  status: string;
  started_at: string;
  submitted_at: string | null;
  test_results?: Array<{ id?: string; total_score?: number | null; score?: number | null }> | { id?: string; total_score?: number | null; score?: number | null } | null;
}

export default async function MockTestInstructionsPage({ params }: Props) {
  const { id } = await params;
  const [data, supabase] = await Promise.all([
    AssessmentService.getMockTestInstructions(id),
    createServerSupabaseClient(),
  ]);

  if (!data) {
    notFound();
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let userAttempt: { id: string; status: string } | null = null;
  if (user) {
    const { data: attempts } = await supabase
      .from("test_attempts")
      .select("id, status, started_at, submitted_at, test_results(id, total_score, score)")
      .eq("mock_test_id", id)
      .eq("user_id", user.id)
      .order("started_at", { ascending: false });

    const attemptsList = (attempts as unknown as AttemptRow[]) || [];
    // Priority 1: Submitted attempt strictly dominates
    const submittedAttempts = attemptsList.filter((a) =>
      a.submitted_at !== null || ["submitted", "completed", "evaluated"].includes(a.status)
    );

    if (submittedAttempts.length > 0) {
      submittedAttempts.sort((a, b) => {
        const trA = Array.isArray(a.test_results) ? a.test_results[0] : a.test_results;
        const trB = Array.isArray(b.test_results) ? b.test_results[0] : b.test_results;
        const hasValidA = trA && ((trA.total_score !== undefined && trA.total_score !== null) || (trA.score !== undefined && trA.score !== null)) ? 1 : 0;
        const hasValidB = trB && ((trB.total_score !== undefined && trB.total_score !== null) || (trB.score !== undefined && trB.score !== null)) ? 1 : 0;
        if (hasValidA !== hasValidB) return hasValidB - hasValidA;
        const timeA = new Date(a.submitted_at || a.started_at).getTime();
        const timeB = new Date(b.submitted_at || b.started_at).getTime();
        if (timeA !== timeB) return timeB - timeA;
        return String(b.id).localeCompare(String(a.id));
      });
      userAttempt = { id: submittedAttempts[0].id, status: submittedAttempts[0].status };
    } else {
      // Priority 2: In-Progress attempt
      const inProg = attemptsList.find((a) => a.status === "in_progress" && a.submitted_at === null);
      if (inProg) {
        userAttempt = { id: inProg.id, status: inProg.status };
      }
    }
  }

  const isCompleted = userAttempt ? ["submitted", "completed", "evaluated"].includes(userAttempt.status) : false;
  const isInProgress = userAttempt ? userAttempt.status === "in_progress" : false;

  return (
    <div className="py-10 bg-slate-50/50 min-h-[calc(100vh-4rem)]">
      <Container className="max-w-3xl space-y-6">
        <Link
          href="/mock-tests"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Mock Tests
        </Link>

        <Card className="border-slate-200/90 shadow-md">
          <CardHeader className="space-y-2 border-b border-slate-100 pb-6">
            <div className="flex items-center gap-2">
              <Badge variant="indigo" className="text-xs">
                {data.exam.category}
              </Badge>
              <span className="text-xs text-slate-500 font-semibold">{data.exam.title}</span>
            </div>
            <CardTitle className="text-2xl font-black text-slate-900 tracking-tight">
              {data.test.title}
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Official Examination Simulation &bull; Read instructions before launching test
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6 pt-6">
            {/* Key Test Stats */}
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="p-4 rounded-2xl bg-blue-50/60 border border-blue-100">
                <span className="text-xl font-black text-blue-900 block">{data.test.durationMinutes}m</span>
                <span className="text-xs text-blue-700 font-semibold">Total Duration</span>
              </div>
              <div className="p-4 rounded-2xl bg-indigo-50/60 border border-indigo-100">
                <span className="text-xl font-black text-indigo-900 block">{data.test.totalQuestions}</span>
                <span className="text-xs text-indigo-700 font-semibold">Questions</span>
              </div>
              <div className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-100">
                <span className="text-xl font-black text-emerald-900 block">{data.test.totalMarks}</span>
                <span className="text-xs text-emerald-700 font-semibold">Total Marks</span>
              </div>
            </div>

            {/* Section Breakdown */}
            {data.sections.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider font-mono">
                  Section Blueprint &amp; Marking Scheme
                </h4>
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden text-xs">
                  {data.sections.map((sec) => (
                    <div key={sec.id} className="p-3.5 bg-white flex items-center justify-between">
                      <span className="font-bold text-slate-800">{sec.name}</span>
                      <div className="flex items-center gap-4 text-slate-600">
                        <span>{sec.numQuestions} Qs</span>
                        <span className="text-emerald-700 font-semibold">+{sec.marksPerQuestion}</span>
                        <span className="text-red-700 font-semibold">-{sec.negativeMark}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* General Instructions */}
            <div className="space-y-2.5">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider font-mono">
                Important Test Rules
              </h4>
              <ul className="space-y-2 text-xs text-slate-600 leading-relaxed">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>The timer is authoritative and starts immediately upon clicking &quot;Start Test&quot;.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>Answers are automatically saved to your account in real time.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>You can navigate freely between sections and questions using the Question Palette.</span>
                </li>
                <li className="flex items-start gap-2">
                  <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>The test will automatically auto-submit when the countdown timer reaches 00:00.</span>
                </li>
              </ul>
            </div>
          </CardContent>

          <CardFooter className="flex items-center justify-between pt-6 border-t border-slate-100">
            <Link href="/mock-tests" prefetch={false}>
              <Button variant="outline" size="md">
                Back to Dashboard
              </Button>
            </Link>
            {isCompleted && userAttempt ? (
              <Link href={`/mock-tests/${userAttempt.id}/result`} prefetch={false}>
                <Button variant="default" size="lg" className="bg-emerald-600 hover:bg-emerald-700 font-bold px-8 shadow-sm text-white">
                  <Eye className="w-4 h-4 mr-2" />
                  View Completed Result
                </Button>
              </Link>
            ) : isInProgress ? (
              <StartTestActionButton
                testId={data.test.id}
                isResume
                size="lg"
                className="px-8 shadow-sm font-bold text-sm"
                label="Continue Test"
              />
            ) : (
              <StartTestActionButton
                testId={data.test.id}
                size="lg"
                className="px-8 shadow-sm font-bold text-sm"
                label="I Agree & Start Test"
              />
            )}
          </CardFooter>
        </Card>
      </Container>
    </div>
  );
}