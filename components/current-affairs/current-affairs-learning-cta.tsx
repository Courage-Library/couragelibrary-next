'use client';

import React from 'react';
import Link from 'next/link';
import { BookOpen, HelpCircle, ArrowRight, Sparkles } from 'lucide-react';

interface RelatedLearningUnit {
  learningResourceId: string;
  title: string;
  slug: string;
}

interface RelatedQuestion {
  questionId: string;
  questionText: string;
  displayOrder: number;
}

interface CurrentAffairsLearningCtaProps {
  learningUnits: RelatedLearningUnit[];
  questions: RelatedQuestion[];
}

export const CurrentAffairsLearningCta: React.FC<CurrentAffairsLearningCtaProps> = ({
  learningUnits,
  questions,
}) => {
  if (
    (!learningUnits || learningUnits.length === 0) &&
    (!questions || questions.length === 0)
  ) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/40 dark:bg-blue-950/20 p-5 md:p-6 my-6">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="w-5 h-5 text-blue-600 dark:text-blue-400" />
        <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
          Continue Learning &amp; Deep Practice
        </h3>
      </div>
      <p className="text-xs text-slate-600 dark:text-slate-400 mb-4">
        Connect today&apos;s current event to fundamental static syllabus concepts and practice exam-standard questions.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Linked Core Learning Units */}
        {learningUnits && learningUnits.length > 0 && (
          <div className="space-y-2.5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
              Core Static Syllabus Units
            </h4>
            <div className="space-y-2">
              {learningUnits.map((unit) => (
                <Link
                  key={unit.learningResourceId}
                  href={`/articles/${unit.slug}`}
                  className="group flex items-center justify-between p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 hover:border-blue-400 dark:hover:border-blue-500 transition-colors shadow-sm"
                >
                  <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 line-clamp-1">
                    {unit.title || 'Learning Article'}
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600 group-hover:translate-x-0.5 transition-all shrink-0 ml-2" />
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Linked Practice Questions */}
        {questions && questions.length > 0 && (
          <div className="space-y-2.5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <HelpCircle className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              Mapped Practice Questions ({questions.length})
            </h4>
            <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-2">
              <p className="text-xs text-slate-600 dark:text-slate-300">
                This event is linked to {questions.length} canonical Question Bank question{questions.length > 1 ? 's' : ''}.
              </p>
              <Link
                href="/practice"
                className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline"
              >
                <span>Practice in Topic Mode</span>
                <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
