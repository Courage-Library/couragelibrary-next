"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, BookOpen, Target, Sparkles, Layers } from "lucide-react";
import { CandidateExamSubject, CandidateExamTopic } from "@/types/exam-knowledge";

interface ExamSyllabusNavigatorProps {
  subjects: CandidateExamSubject[];
}

export function ExamSyllabusNavigator({ subjects }: ExamSyllabusNavigatorProps) {
  const [expandedSubjects, setExpandedSubjects] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    if (subjects.length > 0) {
      init[subjects[0].id] = true;
    }
    return init;
  });

  const toggleSubject = (id: string) => {
    setExpandedSubjects((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  if (!subjects || subjects.length === 0) {
    return (
      <Card className="p-8 text-center text-slate-400">
        <p className="text-xs">Syllabus breakdown is being aligned with the canonical curriculum.</p>
      </Card>
    );
  }

  const getImportanceBadge = (tier: string) => {
    if (tier === "HIGH_YIELD") {
      return (
        <Badge variant="success" className="text-[10px] font-bold">
          <Sparkles className="w-2.5 h-2.5 mr-1" /> High Yield
        </Badge>
      );
    }
    if (tier === "CORE") {
      return <Badge variant="outline" className="text-[10px]">Core</Badge>;
    }
    return <Badge variant="outline" className="text-[10px] text-slate-400">Optional</Badge>;
  };

  return (
    <div className="space-y-4">
      {subjects.map((subject) => {
        const isExpanded = Boolean(expandedSubjects[subject.id]);
        return (
          <Card key={subject.id} className="border-slate-200 shadow-xs overflow-hidden">
            <button
              type="button"
              onClick={() => toggleSubject(subject.id)}
              className="w-full p-5 text-left flex items-center justify-between hover:bg-slate-50/80 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-xs">
                  <Layers className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-base font-bold text-slate-900">{subject.name}</h4>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span>{subject.topics.length} Canonical Topics</span>
                    {subject.totalWeightagePercent && (
                      <span>• Weightage: {subject.totalWeightagePercent}%</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="text-slate-400">
                {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
              </div>
            </button>

            {isExpanded && (
              <CardContent className="p-0 border-t border-slate-100 divide-y divide-slate-100">
                {subject.topics.map((topic: CandidateExamTopic) => (
                  <div
                    key={topic.id}
                    className="p-4 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/50 transition-colors"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h5 className="text-sm font-bold text-slate-800">{topic.name}</h5>
                        {getImportanceBadge(topic.importanceTier)}
                        <Badge variant="outline" className="text-[10px] font-mono">
                          {topic.requiredDepth}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-500">
                        {topic.expectedQuestions.max > 0 && (
                          <span>
                            Expected: {topic.expectedQuestions.min}–{topic.expectedQuestions.max} Qs
                          </span>
                        )}
                        {topic.pyqCount > 0 && (
                          <span>• {topic.pyqCount} Questions in Bank</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {topic.learningDocumentSlug ? (
                        <Link href={`/${topic.learningDocumentSlug}`}>
                          <Button size="sm" variant="outline" className="text-xs font-bold">
                            <BookOpen className="w-3.5 h-3.5 mr-1 text-teal-600" /> Learn
                          </Button>
                        </Link>
                      ) : null}

                      {topic.practiceAvailable ? (
                        <Link href={`/practice?topic=${topic.id}`}>
                          <Button size="sm" variant="default" className="text-xs font-bold shadow-2xs">
                            <Target className="w-3.5 h-3.5 mr-1" /> Practice
                          </Button>
                        </Link>
                      ) : null}
                    </div>
                  </div>
                ))}
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}
