import React from "react";
import Link from "next/link";
import { MistakeLearningContentResolution } from "@/services/mistake.service";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  BookOpen,
  GraduationCap,
  Lock,
  ArrowRight,
  Clock,
  Zap,
  Info,
  CheckCircle2,
} from "lucide-react";

interface MistakeLearningSectionProps {
  vaultId: string;
  topicId?: string | null;
  topicName?: string | null;
  learningContent?: MistakeLearningContentResolution | null;
  isMastered?: boolean;
}

export function MistakeLearningSection({
  vaultId,
  topicId,
  topicName,
  learningContent,
  isMastered = false,
}: MistakeLearningSectionProps) {
  const primary = learningContent?.primaryResource;
  const hasContent = Boolean(learningContent?.hasLearningContent && primary);

  return (
    <div className="space-y-6">
      {/* 1. Dedicated Learn Topic Container */}
      <Card className="p-6 sm:p-7 border-slate-200 shadow-xs bg-white space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-700">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2">
                {isMastered ? "Topic Revision Material" : "Master This Topic & Concepts"}
                {isMastered && (
                  <Badge variant="success" className="text-[10px] py-0 px-1.5 font-bold">
                    <CheckCircle2 className="w-3 h-3 mr-0.5 inline" /> Mastered
                  </Badge>
                )}
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                {topicName ? `Canonical learning resources for ${topicName}` : "Curriculum learning resources"}
              </p>
            </div>
          </div>

          {topicName && (
            <Badge variant="outline" className="text-xs font-mono bg-slate-50 text-slate-600 border-slate-200">
              {topicName}
            </Badge>
          )}
        </div>

        {/* Content Body: Available Learning Resource vs Honest Fallback */}
        {hasContent && primary ? (
          <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-50 to-teal-50/30 border border-teal-100/80 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Badge
                  variant="indigo"
                  className={`text-[10px] font-bold uppercase tracking-wider ${
                    primary.resourceType === "COURSE_LESSON"
                      ? "bg-purple-700 text-white"
                      : "bg-teal-700 text-white"
                  }`}
                >
                  {primary.resourceType === "COURSE_LESSON" ? (
                    <span className="flex items-center gap-1">
                      <GraduationCap className="w-3 h-3" /> Course Lesson
                    </span>
                  ) : (
                    <span className="flex items-center gap-1">
                      <BookOpen className="w-3 h-3" /> Article
                    </span>
                  )}
                </Badge>

                {primary.readingTimeMinutes && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-mono text-slate-500">
                    <Clock className="w-3 h-3 text-slate-400" />
                    {primary.readingTimeMinutes} min study
                  </span>
                )}

                {primary.accessLevel !== "FREE" && (
                  <Badge variant="warning" className="text-[10px] font-bold">
                    {primary.isLocked ? (
                      <span className="flex items-center gap-1 text-amber-900">
                        <Lock className="w-3 h-3" /> PRO Required
                      </span>
                    ) : (
                      "PRO Access"
                    )}
                  </Badge>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <h4 className="text-base font-bold text-slate-900 leading-snug">
                {primary.title}
              </h4>
              {primary.description && (
                <p className="text-xs text-slate-600 leading-relaxed font-normal">
                  {primary.description}
                </p>
              )}
            </div>

            {/* Action CTA */}
            <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
              {primary.isLocked ? (
                <Link href="/billing" className="w-full sm:w-auto">
                  <Button
                    size="sm"
                    variant="default"
                    className="w-full sm:w-auto bg-amber-600 hover:bg-amber-700 font-bold text-xs shadow-xs flex items-center gap-1.5"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    Upgrade to PRO to Access Resource
                  </Button>
                </Link>
              ) : (
                <Link href={primary.canonicalUrl} className="w-full sm:w-auto">
                  <Button
                    size="sm"
                    variant="default"
                    className="w-full sm:w-auto bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs shadow-xs flex items-center gap-1.5"
                  >
                    {primary.resourceType === "COURSE_LESSON" ? "Open Course Lesson" : "Read Full Article"}
                    <ArrowRight className="w-3.5 h-3.5 ml-0.5" />
                  </Button>
                </Link>
              )}

              <span className="text-[11px] text-slate-400 font-medium">
                Canonical Resource • Curated by Subject Experts
              </span>
            </div>
          </div>
        ) : (
          /* Honest Unavailable State — No Guessing, No Hallucinated Links */
          <div className="p-5 rounded-2xl bg-slate-50/80 border border-slate-200/80 flex items-start gap-3.5 text-xs text-slate-600">
            <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-slate-800">
                Learning material is not available for this question yet.
              </p>
              <p className="text-slate-500 leading-relaxed">
                Our academic team publishes continuous deep-dive lessons. In the meantime, use targeted mistake drills below to practice and reinforce your understanding.
              </p>
            </div>
          </div>
        )}

        {/* Secondary Resources (if multiple exist) */}
        {learningContent?.allResources && learningContent.allResources.length > 1 && (
          <div className="pt-3 border-t border-slate-100 space-y-2.5">
            <h5 className="text-xs font-bold text-slate-700 uppercase tracking-wider font-mono">
              Additional Revision Resources ({learningContent.allResources.length - 1})
            </h5>
            <div className="grid gap-2">
              {learningContent.allResources.slice(1).map((res) => (
                <Link
                  key={res.id}
                  href={res.canonicalUrl}
                  className="p-3 rounded-xl bg-slate-50 hover:bg-teal-50/50 border border-slate-100 hover:border-teal-200 flex items-center justify-between text-xs transition-colors group"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="font-bold text-slate-800 group-hover:text-teal-900 transition-colors">
                      {res.title}
                    </span>
                    <Badge variant="outline" className="text-[10px] py-0">
                      {res.resourceType}
                    </Badge>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-teal-700 transition-colors" />
                </Link>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* 2. Practice & Retest Remediation CTA */}
      <Card className="p-6 sm:p-7 border-slate-200 shadow-xs bg-gradient-to-r from-blue-900 to-indigo-950 text-white space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1 max-w-xl">
            <div className="flex items-center gap-2">
              <Badge variant="warning" className="text-[10px] font-bold uppercase tracking-wider bg-amber-400 text-slate-950">
                <Zap className="w-3 h-3 mr-1 fill-current" /> Personal Remediation Loop
              </Badge>
            </div>
            <h3 className="text-lg font-black tracking-tight text-white">
              Ready to verify what you learned?
            </h3>
            <p className="text-xs text-blue-100 leading-relaxed">
              Answer this question correctly in 2 consecutive mistake drill sessions to promote this slip to <strong>MASTERED</strong>.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={
                topicId
                  ? `/mistakes/drill?topicId=${topicId}`
                  : `/mistakes/drill?singleVaultId=${vaultId}`
              }
            >
              <Button
                size="lg"
                variant="default"
                className="bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs shadow-md flex items-center gap-1.5"
              >
                <Zap className="w-4 h-4 fill-slate-950" />
                Launch Remediation Drill
              </Button>
            </Link>
          </div>
        </div>
      </Card>
    </div>
  );
}
