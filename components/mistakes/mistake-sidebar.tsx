import React from "react";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Brain, Sparkles, BookOpen } from "lucide-react";

interface MistakeSidebarProps {
  cognitiveBreakdown: Array<{
    id: string;
    name: string;
    count: number;
    description: string;
  }>;
  weakTopics: Array<{
    topicId: string;
    topicName: string;
    mistakeCount: number;
  }>;
  currentCognitive?: string;
  currentStatus?: string;
}

export function MistakeSidebar({
  cognitiveBreakdown,
  weakTopics,
  currentCognitive,
  currentStatus,
}: MistakeSidebarProps) {
  return (
    <div className="space-y-6">
      {/* Cognitive Archetypes Breakdown */}
      <Card className="bg-white border-slate-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-bold flex items-center gap-2 text-slate-900">
            <Brain className="w-4 h-4 text-purple-600" />
            Cognitive Error Diagnosis
          </CardTitle>
          <CardDescription className="text-xs text-slate-500">
            Breakdown of root error patterns
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 pt-0">
          {cognitiveBreakdown.map((cog) => {
            const isSelected = currentCognitive === cog.id;
            return (
              <Link
                key={cog.id}
                href={
                  isSelected
                    ? `/mistakes${currentStatus && currentStatus !== "ALL" ? `?status=${currentStatus}` : ""}`
                    : `/mistakes?cognitive=${cog.id}${currentStatus && currentStatus !== "ALL" ? `&status=${currentStatus}` : ""}`
                }
                className={`p-2.5 rounded-xl border flex items-center justify-between text-xs transition-colors block ${
                  isSelected
                    ? "bg-purple-50 border-purple-300 text-purple-900"
                    : "bg-slate-50/60 border-slate-100 hover:border-slate-200 text-slate-800"
                }`}
              >
                <div className="pr-2">
                  <span className="font-bold block text-xs">{cog.name}</span>
                  <span className="text-[10px] text-slate-500 line-clamp-1">{cog.description}</span>
                </div>
                <span className="font-mono font-bold text-xs bg-white px-2 py-0.5 rounded-md border border-slate-200 shrink-0">
                  {cog.count}
                </span>
              </Link>
            );
          })}
        </CardContent>
      </Card>

      {/* High-Error Weak Topics */}
      <Card className="bg-white border-slate-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-bold flex items-center gap-2 text-slate-900">
            <Sparkles className="w-4 h-4 text-amber-500" />
            High-Error Topics
          </CardTitle>
          <CardDescription className="text-xs text-slate-500">
            Prioritize these areas for revision
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 pt-0">
          {weakTopics.length === 0 ? (
            <p className="text-xs text-slate-400 py-3 text-center">No concentrated weak topics detected.</p>
          ) : (
            weakTopics.map((wt) => (
              <div
                key={wt.topicId}
                className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50/70 border border-slate-100 text-xs"
              >
                <span className="font-semibold text-slate-800 truncate max-w-[160px] sm:max-w-[180px]">
                  {wt.topicName}
                </span>
                <span className="font-mono font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-100 text-[11px] shrink-0">
                  {wt.mistakeCount} {wt.mistakeCount === 1 ? "slip" : "slips"}
                </span>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
