"use client";

import React, { useState, useMemo, useTransition } from "react";
import {
  AdminQuestionHierarchyItem,
  AdminQuestionTaxonomy,
  AdminQuestionSummaryKPIs,
} from "@/services/admin.service";
import {
  createQuestionHierarchyAction,
  updateQuestionHierarchyAction,
  toggleQuestionStatusAction,
} from "@/app/admin/actions";
import { BulkImportModal } from "@/components/admin/bulk-import-modal";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import {
  HelpCircle,
  Plus,
  FileUp,
  Search,
  RotateCcw,
  Eye,
  Edit2,
  Power,
  X,
  ImageIcon,
  Layers,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

import { AdminBreadcrumbs } from "@/components/admin/admin-breadcrumbs";

interface Props {
  questions: AdminQuestionHierarchyItem[];
  taxonomy: AdminQuestionTaxonomy;
  kpis: AdminQuestionSummaryKPIs;
  initialCategory?: string;
  initialPattern?: string;
  initialSection?: string;
  initialTopic?: string;
}

export function AdminQuestionManager({
  questions,
  taxonomy,
  kpis,
  initialCategory,
  initialPattern,
  initialSection,
  initialTopic,
}: Props) {
  // Resolve initial filters against taxonomy
  const resolvedInitialCat = useMemo(() => {
    if (!initialCategory) return "ALL";
    const found = taxonomy.exams.find(
      (e) => e.slug.toLowerCase() === initialCategory.toLowerCase() || e.id === initialCategory || e.title.toLowerCase().includes(initialCategory.toLowerCase())
    );
    return found ? found.title : initialCategory;
  }, [initialCategory, taxonomy.exams]);

  const resolvedInitialPat = useMemo(() => {
    if (!initialPattern) return "ALL";
    const found = taxonomy.patterns.find(
      (p) => p.id === initialPattern || p.name.toLowerCase().includes(initialPattern.toLowerCase())
    );
    return found ? found.name : initialPattern;
  }, [initialPattern, taxonomy.patterns]);

  const resolvedInitialSec = useMemo(() => {
    if (!initialSection) return "ALL";
    const found = taxonomy.subjects.find(
      (s) => s.slug.toLowerCase() === initialSection.toLowerCase() || s.id === initialSection || s.name.toLowerCase().includes(initialSection.toLowerCase())
    );
    return found ? found.name : initialSection;
  }, [initialSection, taxonomy.subjects]);

  const resolvedInitialTop = useMemo(() => {
    if (!initialTopic) return "ALL";
    const found = taxonomy.topics.find(
      (t) => t.slug.toLowerCase() === initialTopic.toLowerCase() || t.id === initialTopic || t.name.toLowerCase().includes(initialTopic.toLowerCase())
    );
    return found ? found.name : initialTopic;
  }, [initialTopic, taxonomy.topics]);

  // Modal states
  const [showCreate, setShowCreate] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [selectedDetailQuestion, setSelectedDetailQuestion] = useState<AdminQuestionHierarchyItem | null>(null);
  const [editingQuestion, setEditingQuestion] = useState<AdminQuestionHierarchyItem | null>(null);

  // Form feedback state
  const [formFeedback, setFormFeedback] = useState<{ error?: string; message?: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  // Search and Filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>(resolvedInitialCat);
  const [selectedPattern, setSelectedPattern] = useState<string>(resolvedInitialPat);
  const [selectedSection, setSelectedSection] = useState<string>(resolvedInitialSec);
  const [selectedTopic, setSelectedTopic] = useState<string>(resolvedInitialTop);
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>("ALL");
  const [selectedLanguage, setSelectedLanguage] = useState<string>("ALL");
  const [selectedPyq, setSelectedPyq] = useState<string>("ALL");
  const [selectedOptionsType, setSelectedOptionsType] = useState<string>("ALL");
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL");
  const [selectedMockTest, setSelectedMockTest] = useState<string>("ALL");

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;

  // Cascading Filter Derived Lists
  const availablePatterns = useMemo(() => {
    if (selectedCategory === "ALL") return taxonomy.patterns;
    const selectedExam = taxonomy.exams.find((e) => e.title === selectedCategory || e.id === selectedCategory);
    if (!selectedExam) return taxonomy.patterns;
    return taxonomy.patterns.filter((p) => !p.examId || p.examId === selectedExam.id);
  }, [selectedCategory, taxonomy.patterns, taxonomy.exams]);

  const availableTopics = useMemo(() => {
    if (selectedSection === "ALL") return taxonomy.topics;
    const selectedSub = taxonomy.subjects.find((s) => s.name === selectedSection || s.id === selectedSection);
    if (!selectedSub) return taxonomy.topics;
    return taxonomy.topics.filter((t) => t.subjectId === selectedSub.id);
  }, [selectedSection, taxonomy.topics, taxonomy.subjects]);

  // Handle Category Filter Change (Resets downstream filters)
  const handleCategoryChange = (val: string) => {
    setSelectedCategory(val);
    setSelectedPattern("ALL");
    setCurrentPage(1);
  };

  // Handle Section Filter Change (Resets downstream topic filter)
  const handleSectionChange = (val: string) => {
    setSelectedSection(val);
    setSelectedTopic("ALL");
    setCurrentPage(1);
  };

  // Reset All Filters
  const handleResetFilters = () => {
    setSearchQuery("");
    setSelectedCategory("ALL");
    setSelectedPattern("ALL");
    setSelectedSection("ALL");
    setSelectedTopic("ALL");
    setSelectedDifficulty("ALL");
    setSelectedLanguage("ALL");
    setSelectedPyq("ALL");
    setSelectedOptionsType("ALL");
    setSelectedStatus("ALL");
    setSelectedMockTest("ALL");
    setCurrentPage(1);
  };

  // Filter & Search Logic
  const filteredQuestions = useMemo(() => {
    return questions.filter((q) => {
      // 1. Text Search
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchesStatement = q.statement.toLowerCase().includes(query);
        const matchesTopic = q.topicName.toLowerCase().includes(query);
        const matchesSection = q.sectionName.toLowerCase().includes(query);
        const matchesCategory = q.categoryName.toLowerCase().includes(query);
        const matchesPyq = q.pyqSource?.toLowerCase().includes(query) || String(q.pyqYear || "").includes(query);
        if (!matchesStatement && !matchesTopic && !matchesSection && !matchesCategory && !matchesPyq) {
          return false;
        }
      }

      // 2. Category Filter
      if (selectedCategory !== "ALL" && q.categoryName !== selectedCategory && q.categoryId !== selectedCategory) {
        return false;
      }

      // 3. Pattern Filter
      if (selectedPattern !== "ALL" && q.patternName !== selectedPattern && q.patternId !== selectedPattern) {
        return false;
      }

      // 4. Section Filter
      if (selectedSection !== "ALL" && q.sectionName !== selectedSection && q.sectionId !== selectedSection) {
        return false;
      }

      // 5. Topic Filter
      if (selectedTopic !== "ALL" && q.topicName !== selectedTopic && q.topicId !== selectedTopic) {
        return false;
      }

      // 6. Difficulty Filter
      if (selectedDifficulty !== "ALL" && q.difficulty !== selectedDifficulty.toLowerCase()) {
        return false;
      }

      // 7. Language Filter
      if (selectedLanguage !== "ALL" && q.language !== selectedLanguage) {
        return false;
      }

      // 8. PYQ Filter
      if (selectedPyq === "PYQ_ONLY" && !q.isPyq) return false;
      if (selectedPyq === "NON_PYQ" && q.isPyq) return false;

      // 9. Options Type Filter
      if (selectedOptionsType !== "ALL" && q.optionsType !== selectedOptionsType.toLowerCase()) {
        return false;
      }

      // 10. Status Filter
      if (selectedStatus !== "ALL" && q.status !== selectedStatus.toLowerCase()) {
        return false;
      }

      // 11. Mock Test Association Filter
      if (selectedMockTest !== "ALL") {
        const hasMock = q.mockTestAssociations.some((m) => m.mockTestTitle === selectedMockTest || m.mockTestId === selectedMockTest);
        if (!hasMock) return false;
      }

      return true;
    });
  }, [
    questions,
    searchQuery,
    selectedCategory,
    selectedPattern,
    selectedSection,
    selectedTopic,
    selectedDifficulty,
    selectedLanguage,
    selectedPyq,
    selectedOptionsType,
    selectedStatus,
    selectedMockTest,
  ]);

  // Paginated Questions
  const totalPages = Math.max(1, Math.ceil(filteredQuestions.length / pageSize));
  const paginatedQuestions = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredQuestions.slice(start, start + pageSize);
  }, [filteredQuestions, currentPage, pageSize]);

  // Handle Toggle Status Action
  const handleToggleStatus = (questionId: string, currentStatus: string) => {
    startTransition(async () => {
      const res = await toggleQuestionStatusAction(questionId, currentStatus);
      if (res.error) setFormFeedback({ error: res.error });
      else setFormFeedback({ message: res.message });
      setTimeout(() => setFormFeedback(null), 3000);
    });
  };

  // Create Form State with Cascading
  const [createSection, setCreateSection] = useState<string>("");
  const [createOptionsType, setCreateOptionsType] = useState<string>("text");

  const createAvailableTopics = useMemo(() => {
    if (!createSection) return taxonomy.topics;
    return taxonomy.topics.filter((t) => t.subjectId === createSection);
  }, [createSection, taxonomy.topics]);

  const breadcrumbItems = useMemo(() => {
    const items: Array<{ label: string; href?: string; active?: boolean }> = [{ label: "Categories", href: "/admin/categories" }];
    if (selectedCategory !== "ALL") {
      items.push({ label: selectedCategory, href: `/admin/patterns?category=${encodeURIComponent(selectedCategory)}` });
    }
    if (selectedPattern !== "ALL") {
      items.push({ label: selectedPattern, href: `/admin/sections?pattern=${encodeURIComponent(selectedPattern)}` });
    }
    if (selectedSection !== "ALL") {
      items.push({ label: selectedSection, href: `/admin/questions?section=${encodeURIComponent(selectedSection)}` });
    }
    if (selectedTopic !== "ALL") {
      items.push({ label: selectedTopic, href: `/admin/questions?section=${encodeURIComponent(selectedSection)}&topic=${encodeURIComponent(selectedTopic)}` });
    }
    items.push({ label: "Questions", active: true });
    return items;
  }, [selectedCategory, selectedPattern, selectedSection, selectedTopic]);

  return (
    <div className="space-y-6 max-w-7xl pb-12">
      {/* Dynamic Hierarchy Breadcrumbs */}
      <AdminBreadcrumbs items={breadcrumbItems} />

      {/* Header & Global Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
            <HelpCircle className="w-6 h-6 text-blue-600" /> Question Bank CMS &amp; Hierarchy
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Manage questions with Category &rarr; Pattern &rarr; Section &rarr; Topic &rarr; Schedule hierarchy.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowBulkImport(true)}
            className="font-bold border-indigo-200 text-indigo-700 hover:bg-indigo-50 cursor-pointer"
          >
            <FileUp className="w-4 h-4 mr-1.5" /> Bulk Import
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={() => {
              setShowCreate(true);
              setEditingQuestion(null);
            }}
            className="font-bold bg-blue-600 hover:bg-blue-700 shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4 mr-1.5" /> Add Question
          </Button>
        </div>
      </div>

      {/* Global Form Notification */}
      {formFeedback?.error && (
        <Alert variant="error" className="animate-in fade-in">
          {formFeedback.error}
        </Alert>
      )}
      {formFeedback?.message && (
        <Alert variant="success" className="animate-in fade-in">
          {formFeedback.message}
        </Alert>
      )}

      {/* Summary KPI Statistics Banner */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Card className="p-4 bg-white border-slate-200">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider font-mono">
            Total Questions
          </span>
          <p className="text-2xl font-black text-slate-900 mt-1">{kpis.totalQuestions}</p>
          <span className="text-[10px] text-slate-400 font-medium">In database</span>
        </Card>

        <Card className="p-4 bg-emerald-50/60 border-emerald-200">
          <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider font-mono">
            Active / Live
          </span>
          <p className="text-2xl font-black text-emerald-900 mt-1">{kpis.activeQuestions}</p>
          <span className="text-[10px] text-emerald-700 font-medium">Published</span>
        </Card>

        <Card className="p-4 bg-blue-50/60 border-blue-200">
          <span className="text-[11px] font-bold text-blue-800 uppercase tracking-wider font-mono">
            PYQ Questions
          </span>
          <p className="text-2xl font-black text-blue-900 mt-1">{kpis.pyqQuestions}</p>
          <span className="text-[10px] text-blue-700 font-medium">Previous Year</span>
        </Card>

        <Card className="p-4 bg-amber-50/60 border-amber-200">
          <span className="text-[11px] font-bold text-amber-800 uppercase tracking-wider font-mono">
            Image Questions
          </span>
          <p className="text-2xl font-black text-amber-900 mt-1">{kpis.imageQuestions}</p>
          <span className="text-[10px] text-amber-700 font-medium">Diagrams/Images</span>
        </Card>

        <Card className="p-4 bg-rose-50/60 border-rose-200">
          <span className="text-[11px] font-bold text-rose-800 uppercase tracking-wider font-mono">
            Unassigned
          </span>
          <p className="text-2xl font-black text-rose-900 mt-1">{kpis.unassignedQuestions}</p>
          <span className="text-[10px] text-rose-700 font-medium">Missing topic/section</span>
        </Card>
      </div>

      {/* Secondary Hierarchy Badges */}
      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
        <span className="font-bold text-slate-800 flex items-center gap-1">
          <Layers className="w-3.5 h-3.5 text-blue-600" /> Hierarchy:
        </span>
        <Badge variant="outline" className="bg-white">
          {kpis.totalExams} Categories
        </Badge>
        <Badge variant="outline" className="bg-white">
          {kpis.totalPatterns} Patterns
        </Badge>
        <Badge variant="outline" className="bg-white">
          {kpis.totalSections} Sections
        </Badge>
        <Badge variant="outline" className="bg-white">
          {kpis.totalTopics} Topics
        </Badge>
      </div>

      {/* Practical Cascading Filters & Search Bar */}
      <Card className="p-4 bg-white border-slate-200 space-y-3">
        <div className="flex flex-col sm:flex-row items-center gap-3">
          {/* Search Input */}
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search by question text, topic, section, category, or PYQ source..."
              className="w-full pl-9 pr-3 py-2 text-xs font-medium rounded-xl border border-slate-200 focus:outline-hidden focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-slate-50/50"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleResetFilters}
            className="text-xs text-slate-500 hover:text-slate-900 cursor-pointer shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1" /> Reset Filters
          </Button>
        </div>

        {/* Dependent Filter Dropdowns */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 pt-1">
          {/* 1. Category */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Category
            </label>
            <select
              value={selectedCategory}
              onChange={(e) => handleCategoryChange(e.target.value)}
              className="w-full p-1.5 text-xs font-semibold rounded-lg border border-slate-200 bg-white"
            >
              <option value="ALL">All Categories</option>
              {taxonomy.exams.map((e) => (
                <option key={e.id} value={e.title}>
                  {e.title}
                </option>
              ))}
            </select>
          </div>

          {/* 2. Pattern (Cascading) */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Pattern
            </label>
            <select
              value={selectedPattern}
              onChange={(e) => {
                setSelectedPattern(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full p-1.5 text-xs font-semibold rounded-lg border border-slate-200 bg-white"
            >
              <option value="ALL">All Patterns</option>
              {availablePatterns.map((p) => (
                <option key={p.id} value={p.name}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* 3. Section (Subject) */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Section
            </label>
            <select
              value={selectedSection}
              onChange={(e) => handleSectionChange(e.target.value)}
              className="w-full p-1.5 text-xs font-semibold rounded-lg border border-slate-200 bg-white"
            >
              <option value="ALL">All Sections</option>
              {taxonomy.subjects.map((s) => (
                <option key={s.id} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* 4. Topic (Cascading) */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Topic
            </label>
            <select
              value={selectedTopic}
              onChange={(e) => {
                setSelectedTopic(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full p-1.5 text-xs font-semibold rounded-lg border border-slate-200 bg-white"
            >
              <option value="ALL">All Topics</option>
              {availableTopics.map((t) => (
                <option key={t.id} value={t.name}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          {/* 5. Difficulty */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Difficulty
            </label>
            <select
              value={selectedDifficulty}
              onChange={(e) => {
                setSelectedDifficulty(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full p-1.5 text-xs font-semibold rounded-lg border border-slate-200 bg-white"
            >
              <option value="ALL">All Difficulties</option>
              <option value="EASY">Easy</option>
              <option value="MEDIUM">Medium</option>
              <option value="HARD">Hard</option>
            </select>
          </div>

          {/* 6. PYQ Filter */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              PYQ Status
            </label>
            <select
              value={selectedPyq}
              onChange={(e) => {
                setSelectedPyq(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full p-1.5 text-xs font-semibold rounded-lg border border-slate-200 bg-white"
            >
              <option value="ALL">All Questions</option>
              <option value="PYQ_ONLY">PYQ Only</option>
              <option value="NON_PYQ">Non-PYQ Only</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Main Question Management Table */}
      <Card className="p-0 border-slate-200 bg-white overflow-hidden shadow-xs">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-900">
              Showing {filteredQuestions.length} Question{filteredQuestions.length === 1 ? "" : "s"}
            </span>
            {filteredQuestions.length !== questions.length && (
              <Badge variant="neutral" className="text-[10px]">
                Filtered from {questions.length}
              </Badge>
            )}
          </div>
          <span className="text-[11px] text-slate-400 font-mono">
            Page {currentPage} of {totalPages}
          </span>
        </div>

        {filteredQuestions.length === 0 ? (
          <div className="py-16 text-center space-y-3">
            <HelpCircle className="w-10 h-10 mx-auto text-slate-300" />
            <h3 className="text-sm font-bold text-slate-700">No Questions Match Current Filters</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Try adjusting your search criteria or click &quot;Reset Filters&quot; to view all questions.
            </p>
            <Button variant="outline" size="sm" onClick={handleResetFilters} className="font-bold text-xs">
              Reset Filters
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-500 font-mono text-[11px]">
                  <th className="py-3 px-4 font-bold">CATEGORY</th>
                  <th className="py-3 px-3 font-bold">SECTION &amp; TOPIC</th>
                  <th className="py-3 px-3 font-bold min-w-[280px]">QUESTION STATEMENT</th>
                  <th className="py-3 px-3 font-bold">DIFFICULTY</th>
                  <th className="py-3 px-3 font-bold">PYQ</th>
                  <th className="py-3 px-3 font-bold">MOCK / SCHED</th>
                  <th className="py-3 px-3 font-bold">STATUS</th>
                  <th className="py-3 px-4 font-bold text-right">ACTIONS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {paginatedQuestions.map((q) => {
                  return (
                    <tr
                      key={q.id}
                      className="hover:bg-slate-50/80 transition-colors group cursor-pointer"
                      onClick={() => setSelectedDetailQuestion(q)}
                    >
                      {/* Category */}
                      <td className="py-3 px-4">
                        <span className="font-bold text-slate-900 block truncate max-w-[130px]">
                          {q.categoryName}
                        </span>
                        <span className="text-[10px] text-slate-400 block truncate max-w-[130px]">
                          {q.patternName}
                        </span>
                      </td>

                      {/* Section & Topic */}
                      <td className="py-3 px-3">
                        <span
                          className={`font-semibold block truncate max-w-[160px] ${
                            q.sectionName === "Unassigned" ? "text-rose-600 italic" : "text-slate-800"
                          }`}
                        >
                          {q.sectionName}
                        </span>
                        <span
                          className={`text-[10px] block truncate max-w-[160px] ${
                            q.topicName === "Unassigned" ? "text-rose-500 italic" : "text-slate-500"
                          }`}
                        >
                          {q.topicName}
                        </span>
                      </td>

                      {/* Question Statement */}
                      <td className="py-3 px-3">
                        <div className="flex items-start gap-1.5">
                          {q.imageUrl && (
                            <span title="Contains diagram or image">
                              <ImageIcon className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" />
                            </span>
                          )}
                          <p className="text-slate-900 font-medium line-clamp-2 max-w-md leading-relaxed">
                            {q.statement}
                          </p>
                        </div>
                      </td>

                      {/* Difficulty */}
                      <td className="py-3 px-3">
                        <Badge
                          variant={
                            q.difficulty === "easy"
                              ? "success"
                              : q.difficulty === "hard"
                              ? "error"
                              : "warning"
                          }
                          className="text-[10px] uppercase font-bold"
                        >
                          {q.difficulty}
                        </Badge>
                      </td>

                      {/* PYQ */}
                      <td className="py-3 px-3">
                        {q.isPyq ? (
                          <Badge variant="indigo" className="text-[10px] font-semibold whitespace-nowrap">
                            {q.pyqYear ? `${q.pyqYear} • ` : ""}
                            {q.pyqSource || "PYQ"}
                          </Badge>
                        ) : (
                          <span className="text-slate-400 text-[11px]">Non-PYQ</span>
                        )}
                      </td>

                      {/* Mock Test Association */}
                      <td className="py-3 px-3">
                        {q.mockTestAssociations.length > 0 ? (
                          <Badge variant="outline" className="text-[10px] text-blue-700 bg-blue-50/60 border-blue-200">
                            {q.mockTestAssociations[0].mockTestTitle}
                          </Badge>
                        ) : (
                          <span className="text-slate-400 text-[11px]">—</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-3">
                        <Badge
                          variant={q.status === "published" ? "success" : "neutral"}
                          className="text-[10px] uppercase font-bold"
                        >
                          {q.status === "published" ? "ACTIVE" : "DRAFT"}
                        </Badge>
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            title="View Question Details"
                            onClick={() => setSelectedDetailQuestion(q)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            title="Edit Question"
                            onClick={() => {
                              setEditingQuestion(q);
                              setShowCreate(false);
                            }}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition cursor-pointer"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            title={q.status === "published" ? "Deactivate Question" : "Activate Question"}
                            onClick={() => handleToggleStatus(q.id, q.status)}
                            disabled={isPending}
                            className={`p-1.5 rounded-lg transition cursor-pointer ${
                              q.status === "published"
                                ? "text-slate-400 hover:text-red-600 hover:bg-red-50"
                                : "text-slate-400 hover:text-emerald-600 hover:bg-emerald-50"
                            }`}
                          >
                            <Power className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {filteredQuestions.length > pageSize && (
          <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
            <span className="text-xs text-slate-500 font-medium">
              Showing {(currentPage - 1) * pageSize + 1} to{" "}
              {Math.min(currentPage * pageSize, filteredQuestions.length)} of {filteredQuestions.length} questions
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="text-xs font-bold"
              >
                <ChevronLeft className="w-3.5 h-3.5 mr-1" /> Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="text-xs font-bold"
              >
                Next <ChevronRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* QUESTION DETAIL MODAL / DRAWER */}
      {selectedDetailQuestion && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white max-w-3xl w-full rounded-2xl shadow-2xl border border-slate-200 overflow-hidden max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
              <div className="flex items-center gap-2">
                <Badge variant="indigo" className="text-xs font-bold">
                  {selectedDetailQuestion.categoryName}
                </Badge>
                <span className="text-xs text-slate-400 font-mono">&rarr;</span>
                <span className="text-xs font-bold text-slate-700">{selectedDetailQuestion.sectionName}</span>
                <span className="text-xs text-slate-400 font-mono">&rarr;</span>
                <span className="text-xs font-semibold text-slate-600">{selectedDetailQuestion.topicName}</span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDetailQuestion(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content Viewport */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              {/* Question Statement */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-400 font-mono uppercase tracking-wider">
                    Question Statement
                  </span>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px] font-bold uppercase">
                      {selectedDetailQuestion.difficulty}
                    </Badge>
                    <Badge variant="neutral" className="text-[10px]">
                      {selectedDetailQuestion.language}
                    </Badge>
                  </div>
                </div>
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-sm font-semibold text-slate-900 leading-relaxed whitespace-pre-wrap">
                  {selectedDetailQuestion.statement}
                </div>
                {/* Render Question Diagram/Image if present */}
                {selectedDetailQuestion.imageUrl && (
                  <div className="p-2 border border-slate-200 rounded-xl bg-white max-w-md">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={selectedDetailQuestion.imageUrl}
                      alt="Question Diagram"
                      className="max-h-64 rounded-lg mx-auto object-contain"
                    />
                  </div>
                )}
              </div>

              {/* Options Grid */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-400 font-mono uppercase tracking-wider">
                  Options &amp; Correct Answer
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {selectedDetailQuestion.options.map((opt) => {
                    const isCorrect = opt.key === selectedDetailQuestion.correctOptionKey;
                    return (
                      <div
                        key={opt.key}
                        className={`p-3 rounded-xl border flex items-start gap-3 transition-colors ${
                          isCorrect
                            ? "bg-emerald-50 border-emerald-300 ring-2 ring-emerald-400/20"
                            : "bg-white border-slate-200 text-slate-700"
                        }`}
                      >
                        <span
                          className={`w-6 h-6 rounded-lg text-xs font-black flex items-center justify-center shrink-0 ${
                            isCorrect ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {opt.key}
                        </span>
                        <div className="text-xs font-medium pt-0.5 leading-relaxed">
                          {opt.text}
                          {opt.imageUrl && (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img src={opt.imageUrl} alt={`Option ${opt.key}`} className="mt-1 max-h-20 rounded" />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Explanation / Solution */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-400 font-mono uppercase tracking-wider">
                  Solution Explanation
                </span>
                <div className="p-4 rounded-xl bg-blue-50/50 border border-blue-200 text-xs font-medium text-slate-800 leading-relaxed whitespace-pre-wrap">
                  {selectedDetailQuestion.explanationMd}
                </div>
              </div>

              {/* Mock Test Associations */}
              {selectedDetailQuestion.mockTestAssociations.length > 0 && (
                <div className="space-y-2">
                  <span className="text-xs font-bold text-slate-400 font-mono uppercase tracking-wider">
                    Mock Test &amp; Schedule Associations
                  </span>
                  <div className="space-y-1.5">
                    {selectedDetailQuestion.mockTestAssociations.map((m) => (
                      <div
                        key={m.mockTestId}
                        className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs flex items-center justify-between"
                      >
                        <span className="font-bold text-slate-900">{m.mockTestTitle}</span>
                        <span className="text-slate-500 font-medium">
                          Section: {m.sectionName} (Q#{m.questionOrder})
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer Actions */}
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
              <span className="text-[11px] text-slate-400 font-mono">
                ID: {selectedDetailQuestion.id.slice(0, 8)}...
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const toEdit = selectedDetailQuestion;
                    setSelectedDetailQuestion(null);
                    setEditingQuestion(toEdit);
                  }}
                  className="font-bold text-xs"
                >
                  <Edit2 className="w-3.5 h-3.5 mr-1" /> Edit Question
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => setSelectedDetailQuestion(null)}
                  className="font-bold text-xs"
                >
                  Close
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CREATE QUESTION MODAL */}
      {showCreate && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white max-w-2xl w-full rounded-2xl shadow-2xl border border-slate-200 overflow-hidden max-h-[90vh] flex flex-col">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-blue-50/50">
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <Plus className="w-5 h-5 text-blue-600" /> Create New Question
              </h3>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              action={(formData) => {
                startTransition(async () => {
                  const res = await createQuestionHierarchyAction(null, formData);
                  if (res.error) setFormFeedback({ error: res.error });
                  else {
                    setFormFeedback({ message: res.message });
                    setShowCreate(false);
                  }
                  setTimeout(() => setFormFeedback(null), 3000);
                });
              }}
              className="p-6 overflow-y-auto space-y-4 flex-1"
            >
              {/* Cascading Taxonomy Section */}
              <div className="grid grid-cols-2 gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Section / Subject</label>
                  <select
                    value={createSection}
                    onChange={(e) => setCreateSection(e.target.value)}
                    className="w-full p-2 text-xs font-semibold rounded-lg border border-slate-200 bg-white"
                  >
                    <option value="">Select Section</option>
                    {taxonomy.subjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Canonical Topic</label>
                  <select
                    name="topicId"
                    className="w-full p-2 text-xs font-semibold rounded-lg border border-slate-200 bg-white"
                    required
                  >
                    <option value="">Select Topic</option>
                    {createAvailableTopics.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Statement */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Question Statement</label>
                <textarea
                  name="statement"
                  rows={3}
                  placeholder="Enter complete question statement..."
                  required
                  className="w-full p-3 text-xs font-medium rounded-xl border border-slate-200 focus:outline-hidden focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white"
                />
              </div>

              {/* Options Type & Image */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Question Diagram / Image URL</label>
                  <input
                    type="url"
                    name="questionImageUrl"
                    placeholder="https://..."
                    className="w-full p-2 text-xs font-medium rounded-lg border border-slate-200 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Options Type</label>
                  <select
                    name="optionsType"
                    value={createOptionsType}
                    onChange={(e) => setCreateOptionsType(e.target.value)}
                    className="w-full p-2 text-xs font-semibold rounded-lg border border-slate-200 bg-white"
                  >
                    <option value="text">Text Options</option>
                    <option value="image">Image Options</option>
                    <option value="mixed">Mixed Options</option>
                  </select>
                </div>
              </div>

              {/* Options A - D */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-700">Options (A, B, C, D)</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-slate-500">Option A</span>
                    <input
                      type="text"
                      name="optAText"
                      placeholder="Option A Text"
                      required
                      className="w-full p-2 text-xs rounded-lg border border-slate-200"
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-slate-500">Option B</span>
                    <input
                      type="text"
                      name="optBText"
                      placeholder="Option B Text"
                      required
                      className="w-full p-2 text-xs rounded-lg border border-slate-200"
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-slate-500">Option C</span>
                    <input
                      type="text"
                      name="optCText"
                      placeholder="Option C Text"
                      required
                      className="w-full p-2 text-xs rounded-lg border border-slate-200"
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-slate-500">Option D</span>
                    <input
                      type="text"
                      name="optDText"
                      placeholder="Option D Text"
                      required
                      className="w-full p-2 text-xs rounded-lg border border-slate-200"
                    />
                  </div>
                </div>
              </div>

              {/* Correct Option & Difficulty */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Correct Answer</label>
                  <select
                    name="correctOptionKey"
                    className="w-full p-2 text-xs font-bold rounded-lg border border-slate-200 bg-white"
                  >
                    <option value="A">Option A</option>
                    <option value="B">Option B</option>
                    <option value="C">Option C</option>
                    <option value="D">Option D</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Difficulty</label>
                  <select
                    name="difficulty"
                    defaultValue="medium"
                    className="w-full p-2 text-xs font-semibold rounded-lg border border-slate-200 bg-white"
                  >
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Language</label>
                  <select
                    name="language"
                    defaultValue="hi"
                    className="w-full p-2 text-xs font-semibold rounded-lg border border-slate-200 bg-white"
                  >
                    <option value="hi">Hindi</option>
                    <option value="en">English</option>
                  </select>
                </div>
              </div>

              {/* Explanation */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Solution Explanation</label>
                <textarea
                  name="explanation"
                  rows={2}
                  placeholder="Detailed rationale or step-by-step solution..."
                  className="w-full p-3 text-xs font-medium rounded-xl border border-slate-200 bg-white"
                />
              </div>

              {/* PYQ Metadata */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">PYQ Year (Optional)</label>
                  <input
                    type="number"
                    name="pyqYear"
                    placeholder="e.g. 2024"
                    className="w-full p-2 text-xs rounded-lg border border-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">PYQ Source / Exam</label>
                  <input
                    type="text"
                    name="pyqSource"
                    placeholder="e.g. SSC CGL / UPP"
                    className="w-full p-2 text-xs rounded-lg border border-slate-200"
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowCreate(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="default" size="sm" isLoading={isPending} className="font-bold bg-blue-600">
                  Save &amp; Publish Question
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT QUESTION MODAL */}
      {editingQuestion && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white max-w-2xl w-full rounded-2xl shadow-2xl border border-slate-200 overflow-hidden max-h-[90vh] flex flex-col">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-amber-50/50">
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-amber-600" /> Edit Question (ID: {editingQuestion.id.slice(0, 8)})
              </h3>
              <button
                type="button"
                onClick={() => setEditingQuestion(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              action={(formData) => {
                startTransition(async () => {
                  const res = await updateQuestionHierarchyAction(editingQuestion.id, formData);
                  if (res.error) setFormFeedback({ error: res.error });
                  else {
                    setFormFeedback({ message: res.message });
                    setEditingQuestion(null);
                  }
                  setTimeout(() => setFormFeedback(null), 3000);
                });
              }}
              className="p-6 overflow-y-auto space-y-4 flex-1"
            >
              {/* Topic Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Canonical Topic</label>
                <select
                  name="topicId"
                  defaultValue={editingQuestion.topicId || ""}
                  className="w-full p-2 text-xs font-semibold rounded-lg border border-slate-200 bg-white"
                >
                  <option value="">Unassigned</option>
                  {taxonomy.topics.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Statement */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Question Statement</label>
                <textarea
                  name="statement"
                  rows={3}
                  defaultValue={editingQuestion.statement}
                  required
                  className="w-full p-3 text-xs font-medium rounded-xl border border-slate-200 bg-white"
                />
              </div>

              {/* Image URL */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Question Image URL</label>
                <input
                  type="url"
                  name="questionImageUrl"
                  defaultValue={editingQuestion.imageUrl || ""}
                  placeholder="https://..."
                  className="w-full p-2 text-xs font-medium rounded-lg border border-slate-200 bg-white"
                />
              </div>

              {/* Options */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-700">Options (A, B, C, D)</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-slate-500">Option A</span>
                    <input
                      type="text"
                      name="optAText"
                      defaultValue={editingQuestion.options.find((o) => o.key === "A")?.text || ""}
                      className="w-full p-2 text-xs rounded-lg border border-slate-200"
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-slate-500">Option B</span>
                    <input
                      type="text"
                      name="optBText"
                      defaultValue={editingQuestion.options.find((o) => o.key === "B")?.text || ""}
                      className="w-full p-2 text-xs rounded-lg border border-slate-200"
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-slate-500">Option C</span>
                    <input
                      type="text"
                      name="optCText"
                      defaultValue={editingQuestion.options.find((o) => o.key === "C")?.text || ""}
                      className="w-full p-2 text-xs rounded-lg border border-slate-200"
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-slate-500">Option D</span>
                    <input
                      type="text"
                      name="optDText"
                      defaultValue={editingQuestion.options.find((o) => o.key === "D")?.text || ""}
                      className="w-full p-2 text-xs rounded-lg border border-slate-200"
                    />
                  </div>
                </div>
              </div>

              {/* Correct Option & Difficulty */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Correct Answer</label>
                  <select
                    name="correctOptionKey"
                    defaultValue={editingQuestion.correctOptionKey}
                    className="w-full p-2 text-xs font-bold rounded-lg border border-slate-200 bg-white"
                  >
                    <option value="A">Option A</option>
                    <option value="B">Option B</option>
                    <option value="C">Option C</option>
                    <option value="D">Option D</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Difficulty</label>
                  <select
                    name="difficulty"
                    defaultValue={editingQuestion.difficulty}
                    className="w-full p-2 text-xs font-semibold rounded-lg border border-slate-200 bg-white"
                  >
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Language</label>
                  <select
                    name="language"
                    defaultValue={editingQuestion.language === "Hindi" ? "hi" : "en"}
                    className="w-full p-2 text-xs font-semibold rounded-lg border border-slate-200 bg-white"
                  >
                    <option value="hi">Hindi</option>
                    <option value="en">English</option>
                  </select>
                </div>
              </div>

              {/* Explanation */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Solution Explanation</label>
                <textarea
                  name="explanation"
                  rows={2}
                  defaultValue={editingQuestion.explanationMd}
                  className="w-full p-3 text-xs font-medium rounded-xl border border-slate-200 bg-white"
                />
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <Button type="button" variant="outline" size="sm" onClick={() => setEditingQuestion(null)}>
                  Cancel
                </Button>
                <Button type="submit" variant="default" size="sm" isLoading={isPending} className="font-bold bg-amber-600 hover:bg-amber-700">
                  Update Question
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Import Modal */}
      {showBulkImport && (
        <BulkImportModal defaultEntity="questions" onClose={() => setShowBulkImport(false)} />
      )}
    </div>
  );
}
