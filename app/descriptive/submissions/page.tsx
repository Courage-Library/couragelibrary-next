import React from "react";
import Link from "next/link";
import { DescriptiveService } from "@/services/descriptive.service";
import { Container } from "@/components/ui/container";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, ArrowRight, PenTool } from "lucide-react";

export const revalidate = 0;

export default async function StudentSubmissionsPage() {
  const submissions = await DescriptiveService.getUserSubmissions();

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "EVALUATED":
        return <Badge variant="success" className="text-[10px]">EVALUATED</Badge>;
      case "IN_REVIEW":
        return <Badge variant="warning" className="text-[10px]">IN REVIEW</Badge>;
      default:
        return <Badge variant="indigo" className="text-[10px]">SUBMITTED</Badge>;
    }
  };

  return (
    <div className="py-10 bg-slate-50/50 min-h-[calc(100vh-4rem)]">
      <Container className="space-y-6 max-w-4xl">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Badge variant="indigo" className="text-xs">
              Mains Practice Record
            </Badge>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              My Descriptive Submissions
            </h1>
          </div>
          <Link href="/descriptive">
            <Button size="sm" variant="default" className="bg-blue-600 hover:bg-blue-700 font-bold">
              <PenTool className="w-3.5 h-3.5 mr-1.5" /> Write New Answer
            </Button>
          </Link>
        </div>

        {submissions.length === 0 ? (
          <Card className="p-12 text-center text-slate-400 space-y-3">
            <FileText className="w-10 h-10 mx-auto opacity-50" />
            <h3 className="text-base font-bold text-slate-700">No Submissions Recorded</h3>
            <p className="text-xs">Pick a Mains descriptive question and write your first answer.</p>
          </Card>
        ) : (
          <div className="space-y-3.5">
            {submissions.map((sub) => (
              <div
                key={sub.id}
                className="p-5 rounded-2xl bg-white border border-slate-200 hover:border-slate-300 hover:shadow-xs transition-all space-y-3"
              >
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    {getStatusBadge(sub.status)}
                    <span className="font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md">
                      Attempt #{sub.attemptNumber}
                    </span>
                    {sub.examTitle && (
                      <span className="text-slate-400">• {sub.examTitle}</span>
                    )}
                  </div>

                  <span className="text-[11px] text-slate-400 font-mono">
                    {new Date(sub.submittedAt).toLocaleDateString()}
                  </span>
                </div>

                <h3 className="font-bold text-slate-900 text-sm leading-snug">
                  {sub.questionTitle}
                </h3>

                <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                  <div className="flex items-center gap-4 text-slate-500 font-mono text-[11px]">
                    <span>Type: {sub.submissionType.replace(/_/g, " ")}</span>
                    <span>Words: {sub.wordCount}</span>
                  </div>

                  <div className="flex items-center gap-4">
                    {sub.totalScoreAwarded !== undefined && (
                      <span className="font-mono font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                        Score: {sub.totalScoreAwarded} / {sub.maxMarks} ({sub.percentageScore}%)
                      </span>
                    )}
                    <Link
                      href={`/descriptive/submissions/${sub.id}`}
                      className="font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1"
                    >
                      View Details <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Container>
    </div>
  );
}
