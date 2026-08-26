import React from "react";
import Link from "next/link";
import { MistakeService } from "@/services/mistake.service";
import { Container } from "@/components/ui/container";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  Brain,
  Zap,
  ArrowRight,
  Sparkles,
} from "lucide-react";

export const revalidate = 0; // Dynamic

interface Props {
  searchParams: Promise<{ status?: string; cognitive?: string }>;
}

export default async function MistakeVaultPage({ searchParams }: Props) {
  const { status = "ALL", cognitive = "ALL" } = await searchParams;

  const [summary, mistakes] = await Promise.all([
    MistakeService.getMistakeVaultSummary(),
    MistakeService.getMistakesList({
      status: status === "ALL" ? undefined : status,
      cognitiveType: cognitive === "ALL" ? undefined : cognitive,
    }),
  ]);

  const getStatusBadge = (lifecycleStatus: string) => {
    switch (lifecycleStatus) {
      case "MASTERED":
        return <Badge variant="success" className="text-[10px]">MASTERED</Badge>;
      case "REVISITING":
        return <Badge variant="warning" className="text-[10px]">REVISITING</Badge>;
      default:
        return <Badge variant="destructive" className="text-[10px]">UNRESOLVED</Badge>;
    }
  };

  return (
    <div className="py-10 bg-slate-50/50 min-h-[calc(100vh-4rem)]">
      <Container className="space-y-8">
        {/* Header Banner */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-gradient-to-r from-red-800 via-rose-800 to-amber-900 rounded-3xl p-6 sm:p-8 text-white shadow-md">
          <div className="space-y-2">
            <Badge variant="indigo" className="bg-white/20 text-white border-white/20">
              Phase 3O Mistake Vault
            </Badge>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
              Smart Mistake Notebook
            </h1>
            <p className="text-rose-100 text-sm max-w-xl">
              Turn errors into mastery. Track your cognitive error patterns, eliminate repeat slips, and build exam resilience.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link href="/mistakes/drill">
              <Button size="lg" variant="default" className="bg-white text-rose-900 hover:bg-rose-50 font-bold shadow-md">
                <Zap className="w-4 h-4 mr-1.5 text-amber-500 fill-amber-500" />
                Launch Remediation Drill
              </Button>
            </Link>
          </div>
        </div>

        {/* Vault Metrics Overview */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
          <Card className="p-4 bg-white border-slate-200">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500 font-semibold">Total Mistakes</span>
              <AlertTriangle className="w-4 h-4 text-slate-400" />
            </div>
            <span className="text-2xl font-black text-slate-900 mt-1 block">{summary.totalMistakes}</span>
          </Card>
          <Card className="p-4 bg-white border-slate-200">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500 font-semibold">Unresolved</span>
              <AlertTriangle className="w-4 h-4 text-red-500" />
            </div>
            <span className="text-2xl font-black text-red-600 mt-1 block">{summary.unresolvedCount}</span>
          </Card>
          <Card className="p-4 bg-white border-slate-200">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500 font-semibold">Revisiting</span>
              <RotateCcw className="w-4 h-4 text-amber-500" />
            </div>
            <span className="text-2xl font-black text-amber-600 mt-1 block">{summary.revisitingCount}</span>
          </Card>
          <Card className="p-4 bg-white border-slate-200">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500 font-semibold">Mastered</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            </div>
            <span className="text-2xl font-black text-emerald-600 mt-1 block">{summary.masteredCount}</span>
          </Card>
        </div>

        {/* Cognitive Breakdown & Weak Topics */}
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Main Mistakes Feed (2 Cols) */}
          <div className="lg:col-span-2 space-y-4">
            {/* Status Filter Tabs */}
            <div className="flex flex-wrap items-center gap-2 pb-2">
              {[
                { label: "All Mistakes", val: "ALL" },
                { label: "Unresolved", val: "UNRESOLVED" },
                { label: "Revisiting", val: "REVISITING" },
                { label: "Mastered", val: "MASTERED" },
              ].map((tab) => (
                <Link
                  key={tab.val}
                  href={`/mistakes?status=${tab.val}&cognitive=${cognitive}`}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                    status === tab.val
                      ? "bg-blue-600 text-white shadow-xs"
                      : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {tab.label}
                </Link>
              ))}
            </div>

            {/* Mistakes List */}
            {mistakes.length === 0 ? (
              <Card className="p-12 text-center text-slate-400 space-y-3">
                <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-500 opacity-60" />
                <h3 className="text-base font-bold text-slate-700">No Mistakes in This View</h3>
                <p className="text-xs">Keep up the great work or take another mock test to identify weak spots.</p>
              </Card>
            ) : (
              <div className="space-y-3.5">
                {mistakes.map((m) => (
                  <div
                    key={m.vaultId}
                    className="p-5 rounded-2xl bg-white border border-slate-200 hover:border-slate-300 hover:shadow-xs transition-all space-y-3"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        {getStatusBadge(m.lifecycleStatus)}
                        <span className="font-bold text-slate-700 bg-slate-100 px-2.5 py-0.5 rounded-md">
                          {m.primaryCognitiveName}
                        </span>
                        {m.topicName && (
                          <span className="text-slate-400">â€¢ {m.topicName}</span>
                        )}
                      </div>
                      <span className="text-[11px] text-slate-400 font-mono">
                        {m.totalMistakesCount} {m.totalMistakesCount === 1 ? "Error" : "Errors"}
                      </span>
                    </div>

                    <p className="text-sm font-medium text-slate-900 line-clamp-2 leading-relaxed">
                      {m.questionText}
                    </p>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                      <div className="text-slate-500 text-[11px]">
                        Consecutive Correct: <strong className="text-emerald-700 font-bold">{m.consecutiveCorrect}/2</strong>
                      </div>
                      <div className="flex items-center gap-3">
                        <Link
                          href={`/mistakes/${m.vaultId}`}
                          className="font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1"
                        >
                          View Detail <ArrowRight className="w-3 h-3" />
                        </Link>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right Column: Cognitive Diagnosis & Weak Areas (1 Col) */}
          <div className="space-y-6">
            {/* Cognitive Taxonomy Cards */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Brain className="w-4 h-4 text-purple-600" />
                  Cognitive Error Diagnosis
                </CardTitle>
                <CardDescription className="text-xs">
                  Error classification breakdown
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {summary.cognitiveBreakdown.map((cog) => (
                  <Link
                    key={cog.id}
                    href={`/mistakes?status=${status}&cognitive=${cog.id}`}
                    className={`p-3 rounded-xl border flex items-center justify-between text-xs transition-colors block ${
                      cognitive === cog.id
                        ? "bg-purple-50 border-purple-300 text-purple-900"
                        : "bg-slate-50 border-slate-100 hover:border-slate-200 text-slate-800"
                    }`}
                  >
                    <div>
                      <span className="font-bold block">{cog.name}</span>
                      <span className="text-[10px] text-slate-500 line-clamp-1">{cog.description}</span>
                    </div>
                    <span className="font-mono font-bold text-xs bg-white px-2 py-0.5 rounded-md border border-slate-200 shrink-0 ml-2">
                      {cog.count}
                    </span>
                  </Link>
                ))}
              </CardContent>
            </Card>

            {/* Weakest Topics */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  High-Error Topics
                </CardTitle>
                <CardDescription className="text-xs">
                  Prioritize these in your study sessions
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {summary.weakTopics.length === 0 ? (
                  <p className="text-xs text-slate-400 py-2">No concentrated weak topics detected.</p>
                ) : (
                  summary.weakTopics.map((wt) => (
                    <div key={wt.topicId} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-xs">
                      <span className="font-semibold text-slate-800 truncate max-w-[170px]">{wt.topicName}</span>
                      <span className="font-mono font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-md border border-red-100">
                        {wt.mistakeCount} slips
                      </span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </Container>
    </div>
  );
}