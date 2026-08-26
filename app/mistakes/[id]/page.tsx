import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MistakeService } from "@/services/mistake.service";
import { Container } from "@/components/ui/container";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Brain,
  History,
  Zap,
} from "lucide-react";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function MistakeDetailPage({ params }: Props) {
  const { id } = await params;
  const mistake = await MistakeService.getMistakeDetail(id);

  if (!mistake) {
    notFound();
  }

  return (
    <div className="py-10 bg-slate-50/50 min-h-[calc(100vh-4rem)]">
      <Container className="space-y-6 max-w-4xl">
        <Link
          href="/mistakes"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Mistake Notebook
        </Link>

        {/* Header Profile Card */}
        <div className="p-6 sm:p-8 rounded-3xl bg-white border border-slate-200 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Badge variant={mistake.lifecycleStatus === "MASTERED" ? "success" : "destructive"}>
                {mistake.lifecycleStatus}
              </Badge>
              <Badge variant="indigo">
                {mistake.primaryCognitiveName}
              </Badge>
              {mistake.topicName && (
                <span className="text-xs font-semibold text-slate-500">{mistake.topicName}</span>
              )}
            </div>
            <span className="text-xs text-slate-400 font-mono">
              Total Occurrences: <strong className="text-slate-800">{mistake.totalMistakesCount}</strong>
            </span>
          </div>

          <div className="pt-2">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider font-mono mb-2">
              Question Prompt
            </h2>
            <div className="text-base font-semibold text-slate-900 leading-relaxed whitespace-pre-wrap">
              {mistake.questionText}
            </div>
          </div>

          {/* Options */}
          <div className="space-y-2 pt-2">
            {mistake.options.map((opt) => {
              const isTargetCorrect = opt.key === mistake.correctOptionKey;
              return (
                <div
                  key={opt.key}
                  className={`p-3.5 rounded-xl border text-xs flex items-start gap-3 ${
                    isTargetCorrect
                      ? "bg-emerald-50/80 border-emerald-500 text-emerald-950 font-semibold"
                      : "bg-slate-50/60 border-slate-200 text-slate-700"
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-md text-[10px] font-bold flex items-center justify-center shrink-0 ${
                      isTargetCorrect ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-600"
                    }`}
                  >
                    {opt.key}
                  </div>
                  <span className="pt-0.5">{opt.text}</span>
                </div>
              );
            })}
          </div>

          {/* Explanation */}
          {mistake.explanation && (
            <div className="p-4 rounded-2xl bg-blue-50/60 border border-blue-100 text-xs space-y-1.5">
              <span className="font-bold text-blue-900 block">Explanation & Conceptual Solution:</span>
              <p className="text-slate-700 leading-relaxed">{mistake.explanation}</p>
            </div>
          )}
        </div>

        {/* Cognitive Diagnosis & Remediation Guidance */}
        <div className="grid md:grid-cols-2 gap-6">
          <Card className="p-5 space-y-3">
            <div className="flex items-center gap-2 text-purple-700 font-bold text-sm">
              <Brain className="w-4 h-4" />
              Cognitive Diagnosis
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              {mistake.cognitiveDescription}
            </p>
            <div className="pt-3 border-t border-slate-100 space-y-1.5 text-xs">
              <strong className="text-slate-800 block">Prescribed Action:</strong>
              <p className="text-slate-600">{mistake.remediationGuidance}</p>
            </div>
          </Card>

          <Card className="p-5 space-y-3 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-blue-700 font-bold text-sm">
                <Zap className="w-4 h-4" />
                Targeted Remediation
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Complete targeted practice drills until you answer this question correctly 2 consecutive times to achieve <strong>MASTERED</strong> status.
              </p>
            </div>

            <Link href="/mistakes/drill">
              <Button size="md" variant="default" className="w-full bg-blue-600 hover:bg-blue-700 font-bold">
                Start Remediation Drill
              </Button>
            </Link>
          </Card>
        </div>

        {/* Historical Occurrences Timeline */}
        {mistake.occurrences.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <History className="w-4 h-4 text-slate-600" />
                Mistake Occurrence History
              </CardTitle>
              <CardDescription className="text-xs">
                Audit trail of past test errors for this question
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden text-xs">
                {mistake.occurrences.map((occ) => (
                  <div key={occ.id} className="p-3.5 bg-white flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-red-500" />
                      <div>
                        <span className="font-bold text-slate-800">{occ.sourceContext.replace(/_/g, " ")}</span>
                        <span className="text-[10px] text-slate-400 block">
                          {new Date(occ.occurredAt).toLocaleString()}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-slate-600 font-mono">
                      {occ.responseTimeSeconds !== null && (
                        <span>{occ.responseTimeSeconds}s response</span>
                      )}
                      <Badge variant="outline" className="text-[10px]">
                        {occ.heuristicConfidencePct}% Conf
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </Container>
    </div>
  );
}