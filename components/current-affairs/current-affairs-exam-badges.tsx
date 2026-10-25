'use client';

import React from 'react';
import { GraduationCap, Flame, Target } from 'lucide-react';

interface ExamMappingItem {
  examId: string;
  examTitle: string;
  examSlug: string;
  relevanceWeight: string;
  isHighYield: boolean;
}

interface CurrentAffairsExamBadgesProps {
  examMappings: ExamMappingItem[];
  examRelevanceNotes?: Record<string, { focus?: string; weight?: string }>;
}

const WEIGHT_BADGES: Record<string, { label: string; className: string }> = {
  CRITICAL: { label: 'Direct Syllabus Match', className: 'bg-rose-100 text-rose-800 border-rose-300' },
  HIGH: { label: 'High relevance', className: 'bg-primary-50 text-primary-800 border-primary-200' },
  MEDIUM: { label: 'Relevant Context', className: 'bg-blue-100 text-blue-800 border-blue-300' },
  LOW: { label: 'Background Reading', className: 'bg-slate-100 text-slate-700 border-slate-300' },
};

export const CurrentAffairsExamBadges: React.FC<CurrentAffairsExamBadgesProps> = ({
  examMappings,
  examRelevanceNotes = {},
}) => {
  if (!examMappings || examMappings.length === 0) return null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 md:p-6 my-6 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <GraduationCap className="w-5 h-5 text-indigo-600" />
        <h3 className="text-base font-bold text-slate-900">
          Target Exam Applicability
        </h3>
      </div>
      <p className="text-xs text-slate-500 mb-4">
        Exam-specific yield rating and syllabus alignment for competitive government examinations.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {examMappings.map((mapping, idx) => {
          const weight = (mapping.relevanceWeight || 'MEDIUM').toUpperCase();
          const badge = WEIGHT_BADGES[weight] || WEIGHT_BADGES.MEDIUM;
          const noteObj = examRelevanceNotes[mapping.examSlug] || examRelevanceNotes[mapping.examId];
          const focusText = noteObj?.focus;

          return (
            <div
              key={mapping.examId || idx}
              className="flex flex-col justify-between p-3.5 rounded-xl bg-slate-50 border border-slate-200/80"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="text-sm font-bold text-slate-900">
                    {mapping.examTitle || 'Competitive Exam'}
                  </span>
                  {mapping.isHighYield && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-caption font-extrabold bg-primary-50 text-primary-800 border border-primary-200">
                      <Flame aria-hidden="true" className="w-3 h-3 text-primary-700" />
                      High relevance
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 mb-2">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-caption font-semibold border ${badge.className}`}>
                    {badge.label}
                  </span>
                </div>

                {focusText && (
                  <p className="text-xs text-slate-600 line-clamp-2 mt-1">
                    <strong className="text-slate-800">Focus:</strong> {focusText}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
