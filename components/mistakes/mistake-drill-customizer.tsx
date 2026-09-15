"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { generateDrillAction } from "@/app/mistakes/actions";
import { DrillConfigOptions, DrillSessionPayload, DrillFocusMode } from "@/services/mistake.service";
import {
  Zap,
  SlidersHorizontal,
  Flame,
  Bookmark,
  RotateCcw,
  Clock,
  BookOpen,
  HelpCircle,
  Sparkles,
  Layers,
} from "lucide-react";

interface MistakeDrillCustomizerProps {
  initialSubjectId?: string;
  initialTopicId?: string;
  initialFocus?: DrillFocusMode;
  initialSingleVaultId?: string;
  subjects?: Array<{ id: string; name: string }>;
  cognitiveTypes?: Array<{ id: string; name: string }>;
  onDrillGenerated?: (payload: DrillSessionPayload) => void;
}

export function MistakeDrillCustomizer({
  initialSubjectId,
  initialTopicId,
  initialFocus = "ALL",
  initialSingleVaultId,
  subjects = [],
  cognitiveTypes = [],
  onDrillGenerated,
}: MistakeDrillCustomizerProps) {
  const router = useRouter();
  const [questionLimit, setQuestionLimit] = useState<number>(10);
  const [focus, setFocus] = useState<DrillFocusMode>(initialFocus);
  const [subjectId, setSubjectId] = useState<string>(initialSubjectId || "ALL");
  const [cognitiveTypeId, setCognitiveTypeId] = useState<string>("ALL");
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleStartDrill = async () => {
    setIsGenerating(true);
    setErrorMessage(null);

    const config: DrillConfigOptions = {
      limit: questionLimit,
      focus,
      subjectId: subjectId === "ALL" ? undefined : subjectId,
      topicId: initialTopicId,
      cognitiveTypeId: cognitiveTypeId === "ALL" ? undefined : cognitiveTypeId,
      mode: "PRACTICE",
      singleVaultId: initialSingleVaultId,
    };

    try {
      const result = await generateDrillAction(config);
      if (result.success && result.drill_id && result.questions && result.questions.length > 0) {
        if (onDrillGenerated) {
          onDrillGenerated(result);
        } else {
          router.push(`/mistakes/drill?drillId=${result.drill_id}`);
        }
      } else {
        setErrorMessage(result.error || "No eligible mistake questions found for the selected criteria.");
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to start drill session. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-br from-indigo-900 via-blue-900 to-slate-900 text-white rounded-3xl p-6 sm:p-8 shadow-sm relative overflow-hidden">
        <div className="absolute -right-8 -bottom-8 w-40 h-40 bg-blue-500/10 rounded-full blur-2xl pointer-events-none" />
        <div className="relative space-y-3">
          <div className="flex items-center gap-2">
            <Badge variant="indigo" className="bg-blue-500/20 text-blue-200 border-blue-400/30 text-xs px-2.5 py-0.5">
              <Zap className="w-3 h-3 mr-1 text-amber-400 fill-amber-400" /> Personal Revision Drill
            </Badge>
            <span className="text-xs text-slate-300">Adaptive Priority Scoring</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
            Configure Your Remediation Drill
          </h1>
          <p className="text-slate-300 text-xs sm:text-sm leading-relaxed max-w-xl">
            Target your weakest concepts with precision. Questions are prioritized using your Mistake Priority Index (MPI) to maximize score recovery.
          </p>
        </div>
      </div>

      {/* Configuration Card */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
        {/* 1. Drill Length */}
        <div className="space-y-2.5">
          <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-blue-600" /> Question Count
          </label>
          <div className="grid grid-cols-4 gap-2.5">
            {[5, 10, 15, 20].map((count) => (
              <button
                key={count}
                type="button"
                onClick={() => setQuestionLimit(count)}
                className={`py-2.5 rounded-xl text-xs font-bold transition-all border ${
                  questionLimit === count
                    ? "bg-blue-600 text-white border-blue-600 shadow-xs ring-2 ring-blue-600/20"
                    : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 hover:border-slate-300"
                }`}
              >
                {count} Questions
              </button>
            ))}
          </div>
        </div>

        {/* 2. Target Focus Filter */}
        <div className="space-y-2.5">
          <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
            <SlidersHorizontal className="w-3.5 h-3.5 text-blue-600" /> Revision Focus
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {[
              { id: "ALL", label: "Smart Priority", desc: "Top MPI items", icon: Sparkles },
              { id: "DUE_REVISION", label: "Due Revision", desc: "Overdue slips", icon: Clock },
              { id: "HIGH_PRIORITY", label: "High Priority", desc: "MPI > 0.65", icon: Zap },
              { id: "UNRESOLVED", label: "Unresolved", desc: "0 correct streak", icon: Flame },
              { id: "REVISITING", label: "Improving", desc: "1/2 streak in prog", icon: RotateCcw },
              { id: "REPEATED", label: "Repeated Slips", desc: "Wrong 2+ times", icon: RotateCcw },
              { id: "BOOKMARKED", label: "Bookmarked", desc: "Saved questions", icon: Bookmark },
              { id: "MASTERED_REFRESH", label: "Refresher", desc: "Retention check", icon: BookOpen },
            ].map((f) => {
              const Icon = f.icon;
              const isSelected = focus === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFocus(f.id as DrillFocusMode)}
                  className={`p-3 text-left rounded-xl border transition-all ${
                    isSelected
                      ? "bg-blue-50/70 border-blue-600 ring-2 ring-blue-600/20"
                      : "bg-slate-50 border-slate-200 hover:bg-slate-100/80 hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <Icon className={`w-3.5 h-3.5 ${isSelected ? "text-blue-600" : "text-slate-500"}`} />
                    <span className={`text-xs font-bold ${isSelected ? "text-blue-900" : "text-slate-800"}`}>
                      {f.label}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 font-medium leading-tight">{f.desc}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* 3. Subject & Failure Mode Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
          {/* Subject Filter */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-slate-400" /> Subject Filter
            </label>
            <select
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              className="w-full text-xs font-medium bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
            >
              <option value="ALL">All Subjects</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* Cognitive Mode Filter */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
              <HelpCircle className="w-3.5 h-3.5 text-slate-400" /> Failure Mode
            </label>
            <select
              value={cognitiveTypeId}
              onChange={(e) => setCognitiveTypeId(e.target.value)}
              className="w-full text-xs font-medium bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
            >
              <option value="ALL">All Failure Modes</option>
              {cognitiveTypes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium">
            {errorMessage}
          </div>
        )}

        {/* Launch Button */}
        <div className="pt-2">
          <Button
            size="lg"
            onClick={handleStartDrill}
            disabled={isGenerating}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 text-sm shadow-sm flex items-center justify-center gap-2 rounded-xl"
          >
            {isGenerating ? (
              <span className="flex items-center gap-2">
                <RotateCcw className="w-4 h-4 animate-spin" /> Building Personal Drill...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-300 fill-amber-300" /> Start Remediation Drill ({questionLimit} Questions)
              </span>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
