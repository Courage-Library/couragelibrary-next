import React from "react";
import Link from "next/link";
import { DescriptiveService } from "@/services/descriptive.service";
import { Container } from "@/components/ui/container";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UserCheck, ArrowRight, ShieldCheck } from "lucide-react";

export const revalidate = 0;

export default async function FacultyEvaluationsQueuePage() {
  const queue = await DescriptiveService.getFacultyEvaluationQueue();

  return (
    <div className="py-10 bg-slate-50/50 min-h-[calc(100vh-4rem)]">
      <Container className="space-y-6 max-w-4xl">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Badge variant="indigo" className="text-xs">
              Phase 3Q / 3P Faculty Evaluation Console
            </Badge>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <UserCheck className="w-7 h-7 text-purple-700" />
              Faculty Review Queue
            </h1>
          </div>
          <span className="font-mono text-xs font-bold text-slate-500 bg-white px-3 py-1 rounded-xl border border-slate-200">
            {queue.length} Pending
          </span>
        </div>

        {queue.length === 0 ? (
          <Card className="p-12 text-center text-slate-400 space-y-3">
            <ShieldCheck className="w-10 h-10 mx-auto text-emerald-500 opacity-60" />
            <h3 className="text-base font-bold text-slate-700">Review Queue Empty</h3>
            <p className="text-xs">All assigned student Mains submissions have been evaluated.</p>
          </Card>
        ) : (
          <div className="space-y-3.5">
            {queue.map((sub) => (
              <div
                key={sub.id}
                className="p-5 rounded-2xl bg-white border border-slate-200 hover:border-purple-300 hover:shadow-xs transition-all space-y-3"
              >
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <Badge variant="warning" className="text-[10px]">
                      {sub.status}
                    </Badge>
                    <span className="font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md">
                      Attempt #{sub.attemptNumber}
                    </span>
                    {sub.examTitle && (
                      <span className="text-slate-400">• {sub.examTitle}</span>
                    )}
                  </div>

                  <span className="text-[11px] text-slate-400 font-mono">
                    Submitted: {new Date(sub.submittedAt).toLocaleString()}
                  </span>
                </div>

                <h3 className="font-bold text-slate-900 text-sm leading-snug">
                  {sub.questionTitle}
                </h3>

                <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                  <div className="flex items-center gap-4 text-slate-500 font-mono text-[11px]">
                    <span>Type: {sub.submissionType}</span>
                    <span>Words: {sub.wordCount}</span>
                  </div>

                  <Link href={`/faculty/evaluations/${sub.id}`}>
                    <Button size="sm" variant="default" className="bg-purple-700 hover:bg-purple-800 font-bold text-xs">
                      Evaluate Answer <ArrowRight className="w-3.5 h-3.5 ml-1" />
                    </Button>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </Container>
    </div>
  );
}
