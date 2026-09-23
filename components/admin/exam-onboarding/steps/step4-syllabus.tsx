"use client";

import React, { useState } from "react";
import { CanonicalTaxonomySubject, SyllabusProjectionInput } from "@/services/exam-onboarding/exam-onboarding.service";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BookOpen, CheckSquare, Square, Layers } from "lucide-react";

interface Props {
  examId: string;
  taxonomy: CanonicalTaxonomySubject[];
  initialSelectedTopicIds: string[];
  onSaveSyllabus: (payload: SyllabusProjectionInput) => Promise<void>;
  onContinue: () => void;
  onBack: () => void;
  isSaving: boolean;
}

export function Step4Syllabus({ examId, taxonomy, initialSelectedTopicIds, onSaveSyllabus, onContinue, onBack, isSaving }: Props) {
  const [selectedTopicIds, setSelectedTopicIds] = useState<Set<string>>(new Set(initialSelectedTopicIds));
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const toggleTopic = (topicId: string) => {
    const next = new Set(selectedTopicIds);
    if (next.has(topicId)) next.delete(topicId);
    else next.add(topicId);
    setSelectedTopicIds(next);
  };

  const toggleSubjectAll = (subject: CanonicalTaxonomySubject) => {
    const allSelected = subject.topics.every((t) => selectedTopicIds.has(t.id));
    const next = new Set(selectedTopicIds);
    if (allSelected) {
      subject.topics.forEach((t) => next.delete(t.id));
    } else {
      subject.topics.forEach((t) => next.add(t.id));
    }
    setSelectedTopicIds(next);
  };

  const handleSave = async () => {
    setError(null);
    setSuccess(null);
    if (selectedTopicIds.size === 0) {
      setError("Please select at least 1 canonical topic to project onto the syllabus.");
      return;
    }

    const payload: SyllabusProjectionInput = {
      examId,
      subjects: taxonomy
        .filter((subj) => subj.topics.some((t) => selectedTopicIds.has(t.id)))
        .map((subj, sIdx) => ({
          subjectId: subj.id,
          displayOrder: sIdx,
          topics: subj.topics
            .filter((t) => selectedTopicIds.has(t.id))
            .map((t, tIdx) => ({
              topicId: t.id,
              weightageLevel: 'high' as const,
              priority: tIdx + 1,
            })),
        })),
    };

    try {
      await onSaveSyllabus(payload);
      setSuccess("Canonical syllabus projection saved successfully.");
    } catch (err: any) {
      setError(err.message || "Failed to save syllabus projection.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-blue-600" /> Step 4: Canonical Syllabus Projection &amp; Topic Weightages
        </h2>
        <p className="text-xs text-slate-500 font-medium">
          Select canonical topics to project onto this exam without duplicating underlying taxonomy rows.
        </p>
      </div>

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold rounded-xl">
          {error}
        </div>
      )}
      {success && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold rounded-xl">
          {success}
        </div>
      )}

      {/* Subjects Accordion / Cards */}
      <div className="space-y-4">
        {taxonomy.map((subject) => {
          const selectedCount = subject.topics.filter((t) => selectedTopicIds.has(t.id)).length;
          const isAllSelected = selectedCount === subject.topics.length && subject.topics.length > 0;

          return (
            <Card key={subject.id} className="p-5 bg-white border border-slate-200/80 rounded-2xl shadow-2xs space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <Layers className="w-4 h-4 text-blue-600" />
                  <h3 className="text-xs font-bold text-slate-900">{subject.name}</h3>
                  <Badge variant="indigo" className="text-[10px]">
                    {selectedCount} / {subject.topics.length} Selected
                  </Badge>
                </div>
                <button
                  type="button"
                  onClick={() => toggleSubjectAll(subject)}
                  className="text-xs font-bold text-blue-600 hover:text-blue-700"
                >
                  {isAllSelected ? "Deselect All" : "Select All"}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                {subject.topics.map((topic) => {
                  const isChecked = selectedTopicIds.has(topic.id);
                  return (
                    <div
                      key={topic.id}
                      onClick={() => toggleTopic(topic.id)}
                      className={`flex items-center gap-2 p-2 rounded-xl border text-xs font-semibold cursor-pointer transition select-none ${
                        isChecked
                          ? "bg-blue-50/70 border-blue-200 text-blue-900"
                          : "bg-slate-50/40 border-slate-200/70 text-slate-600 hover:bg-slate-100/50"
                      }`}
                    >
                      {isChecked ? (
                        <CheckSquare className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                      ) : (
                        <Square className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      )}
                      <span className="truncate">{topic.name}</span>
                    </div>
                  );
                })}
              </div>
            </Card>
          );
        })}
      </div>

      <div className="flex items-center justify-between">
        <Button
          type="button"
          onClick={onBack}
          variant="outline"
          className="text-xs font-bold px-5 py-2.5 rounded-xl border-slate-200"
        >
          ← Back to Step 3
        </Button>
        <div className="space-x-3">
          <Button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            variant="outline"
            className="text-xs font-bold px-5 py-2.5 rounded-xl border-slate-300"
          >
            {isSaving ? "Saving..." : "Save Selection"}
          </Button>
          <Button
            type="button"
            onClick={onContinue}
            className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-6 py-2.5 rounded-xl shadow-xs"
          >
            Continue to Step 5 →
          </Button>
        </div>
      </div>
    </div>
  );
}
