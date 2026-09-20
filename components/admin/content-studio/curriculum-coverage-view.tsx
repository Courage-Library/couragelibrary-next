"use client";

import React, { useState, useMemo } from "react";
import {
  CurriculumCoverageMatrix,
  CoverageSlotStatus,
  CANONICAL_DOCUMENT_TYPES,
} from "@/types/curriculum-coverage";
import { DocumentType } from "@/types/learning-compiler";
import {
  BookOpen,
  Award,
  CheckCircle2,
  Clock,
  Sparkles,
  Search,
  ChevronDown,
  ChevronRight,
  HelpCircle,
  AlertCircle,
  FileCode,
  ShieldCheck,
} from "lucide-react";

interface Props {
  report?: any;
  matrix?: CurriculumCoverageMatrix;
  onSelectUnitDocType?: (unitId: string, docType: DocumentType) => void;
}

const STATUS_CONFIG: Record<
  CoverageSlotStatus,
  { label: string; bg: string; text: string; border: string; icon: any }
> = {
  PUBLISHED: {
    label: "Published",
    bg: "bg-emerald-50 dark:bg-emerald-950/40",
    text: "text-emerald-700 dark:text-emerald-300",
    border: "border-emerald-200 dark:border-emerald-800",
    icon: CheckCircle2,
  },
  COMPILED: {
    label: "Compiled",
    bg: "bg-teal-50 dark:bg-teal-950/40",
    text: "text-teal-700 dark:text-teal-300",
    border: "border-teal-200 dark:border-teal-800",
    icon: FileCode,
  },
  APPROVED: {
    label: "Approved",
    bg: "bg-blue-50 dark:bg-blue-950/40",
    text: "text-blue-700 dark:text-blue-300",
    border: "border-blue-200 dark:border-blue-800",
    icon: ShieldCheck,
  },
  IN_REVIEW: {
    label: "In Review",
    bg: "bg-purple-50 dark:bg-purple-950/40",
    text: "text-purple-700 dark:text-purple-300",
    border: "border-purple-200 dark:border-purple-800",
    icon: Clock,
  },
  AI_GENERATED: {
    label: "AI Draft",
    bg: "bg-violet-50 dark:bg-violet-950/40",
    text: "text-violet-700 dark:text-violet-300",
    border: "border-violet-200 dark:border-violet-800",
    icon: Sparkles,
  },
  DRAFT: {
    label: "Draft",
    bg: "bg-amber-50 dark:bg-amber-950/40",
    text: "text-amber-700 dark:text-amber-300",
    border: "border-amber-200 dark:border-amber-800",
    icon: Clock,
  },
  STALE: {
    label: "Stale / Rev",
    bg: "bg-orange-50 dark:bg-orange-950/40",
    text: "text-orange-700 dark:text-orange-300",
    border: "border-orange-200 dark:border-orange-800",
    icon: AlertCircle,
  },
  NOT_CREATED: {
    label: "Not Created",
    bg: "bg-slate-50 dark:bg-slate-900",
    text: "text-slate-400 dark:text-slate-500",
    border: "border-slate-200 dark:border-slate-800",
    icon: HelpCircle,
  },
};

const DOC_TYPE_SHORT_LABELS: Record<DocumentType, string> = {
  CONCEPT_LESSON: "Concept",
  WORKED_EXAMPLES: "Worked Ex.",
  FORMULA_SHORTCUT_SHEET: "Formula/Tricks",
  COMMON_TRAPS_AND_MISTAKES: "Traps & Mistakes",
  PYQ_DEEP_DIVE: "PYQ Deep Dive",
  TOPIC_SUMMARY_REVISION: "Revision Summary",
};

export const CurriculumCoverageView: React.FC<Props> = ({
  matrix,
  report,
  onSelectUnitDocType,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedExamId, setSelectedExamId] = useState<string>("ALL");
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>("ALL");
  const [selectedDocType, setSelectedDocType] = useState<string>("ALL");
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL");
  const [expandedTopics, setExpandedTopics] = useState<Record<string, boolean>>({});

  const toggleTopic = (topicId: string) => {
    setExpandedTopics((prev) => ({
      ...prev,
      [topicId]: !prev[topicId],
    }));
  };

  // Filter subjects and topics (unconditionally hook called at top)
  const filteredSubjects = useMemo(() => {
    if (!matrix?.subjects) return [];
    return matrix.subjects
      .filter((sub) => selectedSubjectId === "ALL" || sub.subjectId === selectedSubjectId)
      .map((sub) => {
        const matchingTopics = sub.topics
          .filter((top) => {
            if (searchQuery.trim()) {
              const q = searchQuery.toLowerCase().trim();
              const matchTop = top.topicName.toLowerCase().includes(q);
              const matchUnits = top.units.some(
                (u) =>
                  u.unitTitle.toLowerCase().includes(q) ||
                  u.unitSlug.toLowerCase().includes(q)
              );
              if (!matchTop && !matchUnits) return false;
            }
            return true;
          })
          .map((top) => {
            const matchingUnits = top.units.filter((u) => {
              if (selectedExamId !== "ALL") {
                const isMapped = u.mappedExams.some((e) => e.examId === selectedExamId);
                if (!isMapped) return false;
              }
              if (selectedDocType !== "ALL" && selectedStatus !== "ALL") {
                const dt = selectedDocType as DocumentType;
                if (u.documentTypes[dt]?.status !== selectedStatus) return false;
              } else if (selectedStatus !== "ALL") {
                const hasStatus = Object.values(u.documentTypes).some(
                  (s) => s.status === selectedStatus
                );
                if (!hasStatus) return false;
              }
              return true;
            });
            return {
              ...top,
              units: matchingUnits,
            };
          })
          .filter((top) => top.units.length > 0 || !searchQuery.trim());

        return {
          ...sub,
          topics: matchingTopics,
        };
      })
      .filter((sub) => sub.topics.length > 0);
  }, [matrix, selectedSubjectId, selectedExamId, selectedDocType, selectedStatus, searchQuery]);

  // If full matrix is not supplied, render legacy report fallback
  if (!matrix) {
    if (!report) {
      return (
        <div className="p-8 text-center text-slate-500">
          Loading curriculum coverage data...
        </div>
      );
    }
    return (
      <div className="space-y-6 p-6">
        <div className="rounded-2xl border border-slate-200 bg-gradient-to-r from-indigo-900 to-slate-900 p-6 text-white shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <span className="font-semibold text-indigo-300 text-xs uppercase tracking-wider">
                Curriculum Coverage Engine
              </span>
              <h2 className="mt-1 font-black text-2xl">
                {report.examTitle || "Universal Academic Taxonomy"}
              </h2>
            </div>
            <div className="text-right">
              <span className="font-black text-4xl">{report.coveragePct}%</span>
              <div className="text-indigo-200 text-xs">
                {report.publishedUnits} / {report.totalUnits} Units Published
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {report.subjectBreakdown?.map((sub: any) => (
            <div
              key={sub.subjectId}
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="flex items-center justify-between font-bold text-slate-900 dark:text-slate-100">
                <span>{sub.subjectName}</span>
                <span className="font-mono text-indigo-600 dark:text-indigo-400">
                  {sub.coveragePct}%
                </span>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div
                  className="h-full bg-indigo-600 transition-all duration-500"
                  style={{ width: `${sub.coveragePct}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Top Banner Hero */}
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 text-white shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-indigo-500/20 px-2.5 py-0.5 font-semibold text-indigo-300 text-[11px] border border-indigo-400/30">
                <Award className="h-3 w-3" /> Curriculum Operations & Coverage Engine
              </span>
              <span className="text-[11px] text-slate-400">Phase 3F.2 Multi-Exam Matrix</span>
            </div>
            <h2 className="mt-2 font-black text-2xl tracking-tight">
              Canonical Curriculum Coverage
            </h2>
            <p className="mt-1 text-slate-300 text-xs max-w-xl">
              Strict derived coverage states across all 6 canonical document types, question bank authority links, and multi-exam syllabus projections.
            </p>
          </div>

          <div className="flex items-center gap-6 border-t md:border-t-0 md:border-l border-white/10 pt-4 md:pt-0 md:pl-6">
            <div className="text-left">
              <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Overall Coverage</div>
              <div className="font-black text-3xl text-emerald-400">{matrix.overall.overallCoveragePct}%</div>
              <div className="text-[11px] text-slate-300">
                {matrix.overall.publishedDocSlots} / {matrix.overall.totalDocSlots} Published Slots
              </div>
            </div>
            <div className="text-left">
              <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Question Bank</div>
              <div className="font-black text-3xl text-indigo-400">{matrix.overall.totalLinkedQuestions}</div>
              <div className="text-[11px] text-slate-300">Authoritative PYQs</div>
            </div>
          </div>
        </div>

        {/* Quick KPI Bar */}
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5 pt-4 border-t border-white/10 text-xs">
          <div className="rounded-lg bg-white/5 p-2.5">
            <div className="text-slate-400 text-[10px]">Total Units</div>
            <div className="font-bold text-sm text-white">{matrix.overall.totalUnits}</div>
          </div>
          <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-2.5">
            <div className="text-emerald-300 text-[10px]">Published</div>
            <div className="font-bold text-sm text-emerald-400">{matrix.overall.publishedDocSlots}</div>
          </div>
          <div className="rounded-lg bg-teal-500/10 border border-teal-500/20 p-2.5">
            <div className="text-teal-300 text-[10px]">Compiled</div>
            <div className="font-bold text-sm text-teal-400">{matrix.overall.compiledDocSlots}</div>
          </div>
          <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 p-2.5">
            <div className="text-blue-300 text-[10px]">Approved</div>
            <div className="font-bold text-sm text-blue-400">{matrix.overall.approvedDocSlots}</div>
          </div>
          <div className="rounded-lg bg-purple-500/10 border border-purple-500/20 p-2.5">
            <div className="text-purple-300 text-[10px]">In Review</div>
            <div className="font-bold text-sm text-purple-400">{matrix.overall.inReviewDocSlots}</div>
          </div>
          <div className="rounded-lg bg-violet-500/10 border border-violet-500/20 p-2.5">
            <div className="text-violet-300 text-[10px]">AI Drafts</div>
            <div className="font-bold text-sm text-violet-400">{matrix.overall.aiGeneratedDocSlots}</div>
          </div>
          <div className="rounded-lg bg-slate-800/80 p-2.5">
            <div className="text-slate-400 text-[10px]">Not Created</div>
            <div className="font-bold text-sm text-slate-300">{matrix.overall.notCreatedDocSlots}</div>
          </div>
        </div>
      </div>

      {/* Document Type Readiness Breakdown */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 shadow-2xs">
        <h3 className="font-bold text-slate-900 text-sm dark:text-slate-100 flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
          Document Type Coverage Breakdown (6 Canonical Types)
        </h3>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          {CANONICAL_DOCUMENT_TYPES.map((dt) => {
            const stat = matrix.byDocumentType[dt];
            return (
              <div
                key={dt}
                className="rounded-lg border border-slate-100 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-800/40"
              >
                <div className="font-semibold text-slate-800 text-xs dark:text-slate-200 truncate">
                  {DOC_TYPE_SHORT_LABELS[dt]}
                </div>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="font-mono font-bold text-sm text-indigo-600 dark:text-indigo-400">
                    {stat.coveragePct}%
                  </span>
                  <span className="text-[11px] text-slate-500">
                    {stat.publishedSlots}/{stat.totalSlots}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                  <div
                    className="h-full bg-indigo-600 transition-all duration-300"
                    style={{ width: `${stat.coveragePct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-2xs">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search Subject, Topic, or Unit..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-4 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
        </div>

        {/* Exam Filter */}
        <select
          value={selectedExamId}
          onChange={(e) => setSelectedExamId(e.target.value)}
          className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
        >
          <option value="ALL">All Exams</option>
          {matrix.exams.map((ex) => (
            <option key={ex.id} value={ex.id}>
              {ex.title}
            </option>
          ))}
        </select>

        {/* Subject Filter */}
        <select
          value={selectedSubjectId}
          onChange={(e) => setSelectedSubjectId(e.target.value)}
          className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
        >
          <option value="ALL">All Subjects</option>
          {matrix.subjects.map((s) => (
            <option key={s.subjectId} value={s.subjectId}>
              {s.subjectName}
            </option>
          ))}
        </select>

        {/* Document Type Filter */}
        <select
          value={selectedDocType}
          onChange={(e) => setSelectedDocType(e.target.value)}
          className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
        >
          <option value="ALL">All Doc Types</option>
          {CANONICAL_DOCUMENT_TYPES.map((dt) => (
            <option key={dt} value={dt}>
              {DOC_TYPE_SHORT_LABELS[dt]}
            </option>
          ))}
        </select>

        {/* Status Filter */}
        <select
          value={selectedStatus}
          onChange={(e) => setSelectedStatus(e.target.value)}
          className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
        >
          <option value="ALL">All Statuses</option>
          {Object.keys(STATUS_CONFIG).map((st) => (
            <option key={st} value={st}>
              {STATUS_CONFIG[st as CoverageSlotStatus].label}
            </option>
          ))}
        </select>
      </div>

      {/* Curriculum Hierarchical Matrix View */}
      <div className="space-y-6">
        {filteredSubjects.map((sub) => (
          <div
            key={sub.subjectId}
            className="rounded-2xl border border-slate-200 bg-white overflow-hidden dark:border-slate-800 dark:bg-slate-900 shadow-2xs"
          >
            {/* Subject Header */}
            <div className="flex items-center justify-between bg-slate-50/80 px-6 py-4 border-b border-slate-200 dark:border-slate-800 dark:bg-slate-800/50">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300 font-bold text-xs">
                  {sub.subjectName.substring(0, 2).toUpperCase()}
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm dark:text-slate-100">
                    {sub.subjectName}
                  </h3>
                  <div className="text-[11px] text-slate-500">
                    {sub.totalUnits} Units &bull; {sub.topics.length} Topics &bull; {sub.linkedQuestionCount} PYQs
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="text-right">
                  <span className="font-mono font-bold text-xs text-indigo-600 dark:text-indigo-400">
                    {sub.coveragePct}% Published
                  </span>
                  <div className="text-[10px] text-slate-400">
                    {sub.publishedDocSlots} / {sub.totalDocSlots} slots
                  </div>
                </div>
                <div className="w-24 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                  <div
                    className="h-full bg-indigo-600"
                    style={{ width: `${sub.coveragePct}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Topics Under Subject */}
            <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {sub.topics.map((top) => {
                const isExpanded = expandedTopics[top.topicId] !== false; // default expanded
                return (
                  <div key={top.topicId} className="p-4 sm:p-5">
                    {/* Topic Row Title */}
                    <div
                      onClick={() => toggleTopic(top.topicId)}
                      className="flex cursor-pointer items-center justify-between hover:bg-slate-50/60 -m-2 p-2 rounded-lg transition dark:hover:bg-slate-800/30"
                    >
                      <div className="flex items-center gap-2.5">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-slate-400" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-slate-400" />
                        )}
                        <span className="font-bold text-slate-900 text-xs dark:text-slate-200">
                          {top.topicName}
                        </span>
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                          {top.units.length} Units
                        </span>
                        {top.linkedQuestionCount > 0 && (
                          <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400 border border-indigo-200/50 dark:border-indigo-800/50">
                            {top.linkedQuestionCount} PYQs
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="font-mono text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                          {top.coveragePct}%
                        </span>
                        <div className="w-16 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                          <div
                            className="h-full bg-indigo-600"
                            style={{ width: `${top.coveragePct}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Units Table under Topic */}
                    {isExpanded && top.units.length > 0 && (
                      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-400">
                              <th className="py-2.5 px-3 w-[220px]">Canonical Learning Unit</th>
                              <th className="py-2.5 px-3 w-[120px]">Exam Scope</th>
                              {CANONICAL_DOCUMENT_TYPES.map((dt) => (
                                <th key={dt} className="py-2.5 px-2 text-center">
                                  {DOC_TYPE_SHORT_LABELS[dt]}
                                </th>
                              ))}
                              <th className="py-2.5 px-3 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                            {top.units.map((u) => (
                              <tr
                                key={u.unitId}
                                className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition"
                              >
                                <td className="py-3 px-3 font-medium text-slate-900 dark:text-slate-100">
                                  <div className="font-semibold text-xs">{u.unitTitle}</div>
                                  <div className="font-mono text-[10px] text-slate-400 truncate max-w-[200px]">
                                    {u.unitSlug}
                                  </div>
                                </td>

                                <td className="py-3 px-3">
                                  {u.mappedExams.length > 0 ? (
                                    <div className="flex flex-wrap gap-1">
                                      {u.mappedExams.map((me) => (
                                        <span
                                          key={me.examId}
                                          className="rounded bg-indigo-50 px-1.5 py-0.5 text-[9px] font-bold text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200/50 dark:border-indigo-800/50"
                                        >
                                          {me.examTitle}
                                        </span>
                                      ))}
                                    </div>
                                  ) : (
                                    <span className="text-[10px] text-slate-400">Unmapped</span>
                                  )}
                                </td>

                                {CANONICAL_DOCUMENT_TYPES.map((dt) => {
                                  const slot = u.documentTypes[dt];
                                  const cfg = STATUS_CONFIG[slot.status];
                                  const Icon = cfg.icon;

                                  return (
                                    <td key={dt} className="py-3 px-1 text-center">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          onSelectUnitDocType &&
                                          onSelectUnitDocType(u.unitId, dt)
                                        }
                                        title={`${DOC_TYPE_SHORT_LABELS[dt]}: ${cfg.label}`}
                                        className={`inline-flex items-center justify-center gap-1 rounded-md px-2 py-1 text-[10px] font-bold border transition hover:scale-105 ${cfg.bg} ${cfg.text} ${cfg.border}`}
                                      >
                                        <Icon className="h-3 w-3" />
                                        <span className="hidden xl:inline">{cfg.label}</span>
                                      </button>
                                    </td>
                                  );
                                })}

                                <td className="py-3 px-3 text-right">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onSelectUnitDocType &&
                                      onSelectUnitDocType(u.unitId, "CONCEPT_LESSON")
                                    }
                                    className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 px-2.5 py-1 text-[11px] font-bold text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:text-indigo-400 dark:hover:bg-indigo-900/50 border border-indigo-200/50 dark:border-indigo-800/50 transition"
                                  >
                                    <Sparkles className="h-3 w-3" />
                                    Author
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
