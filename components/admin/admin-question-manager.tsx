"use client";

import React, { useState, useMemo, useTransition, useRef } from "react";
import Link from "next/link";
import {
  AdminQuestionHierarchyItem,
  AdminQuestionTaxonomy,
  AdminQuestionSummaryKPIs,
} from "@/services/admin.service";
import {
  createQuestionHierarchyAction,
  updateQuestionHierarchyAction,
  deleteQuestionAction,
  uploadBulkImportImageAction,
} from "@/app/admin/actions";
import { AdminBreadcrumbs } from "@/components/admin/admin-breadcrumbs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import {
  HelpCircle,
  PlusCircle,
  FileUp,
  Search,
  RotateCcw,
  Edit2,
  Trash2,
  X,
  Upload,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Underline,
} from "lucide-react";

interface Props {
  questions: AdminQuestionHierarchyItem[];
  taxonomy: AdminQuestionTaxonomy;
  kpis: AdminQuestionSummaryKPIs;
  initialCategory?: string;
  initialPattern?: string;
  initialSection?: string;
  initialTopic?: string;
}

const PAGE_SIZE = 20;

export function AdminQuestionManager({
  questions,
  taxonomy,
  initialCategory,
  initialPattern,
  initialSection,
}: Props) {
  // ----------------------------------------------------
  // Cascading Add Form State
  // ----------------------------------------------------
  const [formCategory, setFormCategory] = useState<string>(initialCategory || (taxonomy.exams[0]?.id || ""));
  const [formPattern, setFormPattern] = useState<string>(initialPattern || "");
  const [formSection, setFormSection] = useState<string>(initialSection || "");
  const [optionsType, setOptionsType] = useState<"text" | "image" | "mixed">("text");

  // Question Form Fields
  const [statement, setStatement] = useState("");
  const [questionImageUrl, setQuestionImageUrl] = useState("");
  const [optAText, setOptAText] = useState("");
  const [optAImg, setOptAImg] = useState("");
  const [optBText, setOptBText] = useState("");
  const [optBImg, setOptBImg] = useState("");
  const [optCText, setOptCText] = useState("");
  const [optCImg, setOptCImg] = useState("");
  const [optDText, setOptDText] = useState("");
  const [optDImg, setOptDImg] = useState("");
  const [correctAnswer, setCorrectAnswer] = useState("A");
  const [difficulty, setDifficulty] = useState("easy");
  const [pyqSource, setPyqSource] = useState("");
  const [pyqYear, setPyqYear] = useState("");
  const [language, setLanguage] = useState("english");
  const [explanation, setExplanation] = useState("");
  const [isUploadingImg, setIsUploadingImg] = useState(false);

  // Edit Modal State
  const [editingQuestion, setEditingQuestion] = useState<AdminQuestionHierarchyItem | null>(null);
  const [editStatement, setEditStatement] = useState("");
  const [editImgUrl, setEditImgUrl] = useState("");
  const [editOptAText, setEditOptAText] = useState("");
  const [editOptBText, setEditOptBText] = useState("");
  const [editOptCText, setEditOptCText] = useState("");
  const [editOptDText, setEditOptDText] = useState("");
  const [editCorrectAnswer, setEditCorrectAnswer] = useState("A");
  const [editDifficulty, setEditDifficulty] = useState("easy");
  const [editPyqSource, setEditPyqSource] = useState("");
  const [editPyqYear, setEditPyqYear] = useState("");
  const [editLanguage, setEditLanguage] = useState("english");
  const [editExplanation, setEditExplanation] = useState("");
  const [editIsActive, setEditIsActive] = useState(true);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("ALL");
  const [filterPattern, setFilterPattern] = useState<string>("ALL");
  const [filterSection, setFilterSection] = useState<string>("ALL");
  const [filterDifficulty, setFilterDifficulty] = useState<string>("ALL");
  const [filterPyq, setFilterPyq] = useState<string>("ALL");
  const [filterLanguage, setFilterLanguage] = useState<string>("ALL");
  const [currentPage, setCurrentPage] = useState(1);

  // Feedback State
  const [actionFeedback, setActionFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const addTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const editTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  // ----------------------------------------------------
  // Cascading Form Selectors
  // ----------------------------------------------------
  const availablePatternsForForm = useMemo(() => {
    if (!formCategory) return taxonomy.patterns;
    return taxonomy.patterns.filter((p) => !p.examId || p.examId === formCategory);
  }, [formCategory, taxonomy.patterns]);

  // Set default pattern when form category changes
  const handleFormCategoryChange = (catId: string) => {
    setFormCategory(catId);
    const validPatterns = taxonomy.patterns.filter((p) => !p.examId || p.examId === catId);
    setFormPattern(validPatterns[0]?.id || "");
    setFormSection(taxonomy.subjects[0]?.id || "");
  };

  const handleFormPatternChange = (patId: string) => {
    setFormPattern(patId);
    setFormSection(taxonomy.subjects[0]?.id || "");
  };

  // ----------------------------------------------------
  // Cascading Filter Selectors
  // ----------------------------------------------------
  const availablePatternsForFilter = useMemo(() => {
    if (filterCategory === "ALL") return taxonomy.patterns;
    return taxonomy.patterns.filter((p) => !p.examId || p.examId === filterCategory);
  }, [filterCategory, taxonomy.patterns]);

  const handleFilterCategoryChange = (catId: string) => {
    setFilterCategory(catId);
    setFilterPattern("ALL");
    setFilterSection("ALL");
    setCurrentPage(1);
  };

  const handleFilterPatternChange = (patId: string) => {
    setFilterPattern(patId);
    setFilterSection("ALL");
    setCurrentPage(1);
  };

  const resetAllFilters = () => {
    setSearchQuery("");
    setFilterCategory("ALL");
    setFilterPattern("ALL");
    setFilterSection("ALL");
    setFilterDifficulty("ALL");
    setFilterPyq("ALL");
    setFilterLanguage("ALL");
    setCurrentPage(1);
  };

  // ----------------------------------------------------
  // Underline Formatter
  // ----------------------------------------------------
  const applyUnderline = (isEdit: boolean) => {
    const ta = isEdit ? editTextareaRef.current : addTextareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    if (start === end) {
      alert("Please select the text first, then click Underline.");
      return;
    }
    const val = ta.value;
    const selected = val.substring(start, end);
    const wrapped = `[[u]]${selected}[[/u]]`;
    const newVal = val.substring(0, start) + wrapped + val.substring(end);
    if (isEdit) {
      setEditStatement(newVal);
    } else {
      setStatement(newVal);
    }
  };

  // ----------------------------------------------------
  // Image Upload Handlers
  // ----------------------------------------------------
  const handleImageUpload = async (file: File, target: "question" | "A" | "B" | "C" | "D" | "editQ") => {
    setIsUploadingImg(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("folder", target === "question" || target === "editQ" ? "questions" : "options");

    const res = await uploadBulkImportImageAction(formData);
    setIsUploadingImg(false);

    if (res.error) {
      alert("Image upload failed: " + res.error);
      return;
    }

    if (res.url) {
      if (target === "question") setQuestionImageUrl(res.url);
      else if (target === "editQ") setEditImgUrl(res.url);
      else if (target === "A") setOptAImg(res.url);
      else if (target === "B") setOptBImg(res.url);
      else if (target === "C") setOptCImg(res.url);
      else if (target === "D") setOptDImg(res.url);
    }
  };

  // ----------------------------------------------------
  // Create Question Submission
  // ----------------------------------------------------
  const handleCreateQuestion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formCategory || !statement || !correctAnswer) {
      setActionFeedback({ type: "error", text: "Please fill Category, Question Text, and Correct Answer." });
      return;
    }

    const formData = new FormData();
    formData.append("statement", statement);
    formData.append("topicId", formSection || (taxonomy.topics[0]?.id || ""));
    formData.append("difficulty", difficulty);
    formData.append("language", language);
    formData.append("optionsType", optionsType);
    if (questionImageUrl) formData.append("questionImageUrl", questionImageUrl);
    formData.append("correctOptionKey", correctAnswer);
    if (explanation) formData.append("explanation", explanation);
    if (pyqSource) formData.append("pyqSource", pyqSource);
    if (pyqYear) formData.append("pyqYear", pyqYear);

    formData.append("optAText", optAText);
    if (optAImg) formData.append("optAImg", optAImg);
    formData.append("optBText", optBText);
    if (optBImg) formData.append("optBImg", optBImg);
    formData.append("optCText", optCText);
    if (optCImg) formData.append("optCImg", optCImg);
    formData.append("optDText", optDText);
    if (optDImg) formData.append("optDImg", optDImg);

    startTransition(async () => {
      const res = await createQuestionHierarchyAction(null, formData);
      if (res.error) {
        setActionFeedback({ type: "error", text: res.error });
      } else {
        setActionFeedback({ type: "success", text: "✓ Question created successfully!" });
        setStatement("");
        setQuestionImageUrl("");
        setOptAText("");
        setOptAImg("");
        setOptBText("");
        setOptBImg("");
        setOptCText("");
        setOptCImg("");
        setOptDText("");
        setOptDImg("");
        setExplanation("");
        setPyqSource("");
        setPyqYear("");
      }
    });
  };

  // ----------------------------------------------------
  // Open Edit Modal
  // ----------------------------------------------------
  const openEditModal = (q: AdminQuestionHierarchyItem) => {
    setEditingQuestion(q);
    setEditStatement(q.statement || "");
    setEditImgUrl(q.imageUrl || "");
    const optA = q.options.find((o) => o.key === "A");
    const optB = q.options.find((o) => o.key === "B");
    const optC = q.options.find((o) => o.key === "C");
    const optD = q.options.find((o) => o.key === "D");
    setEditOptAText(optA?.text || "");
    setEditOptBText(optB?.text || "");
    setEditOptCText(optC?.text || "");
    setEditOptDText(optD?.text || "");
    setEditCorrectAnswer(q.correctOptionKey || "A");
    setEditDifficulty(q.difficulty || "easy");
    setEditPyqSource(q.pyqSource || "");
    setEditPyqYear(q.pyqYear ? String(q.pyqYear) : "");
    setEditLanguage(q.language || "english");
    setEditExplanation(q.explanationMd || "");
    setEditIsActive(q.status === "published");
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingQuestion || !editStatement) return;

    const formData = new FormData();
    formData.append("questionId", editingQuestion.id);
    formData.append("versionId", editingQuestion.versionId);
    formData.append("statement", editStatement);
    formData.append("topicId", editingQuestion.topicId || (taxonomy.topics[0]?.id || ""));
    formData.append("difficulty", editDifficulty);
    formData.append("language", editLanguage);
    formData.append("optionsType", editingQuestion.optionsType || "text");
    if (editImgUrl) formData.append("questionImageUrl", editImgUrl);
    formData.append("correctOptionKey", editCorrectAnswer);
    if (editExplanation) formData.append("explanation", editExplanation);
    if (editPyqSource) formData.append("pyqSource", editPyqSource);
    if (editPyqYear) formData.append("pyqYear", editPyqYear);

    formData.append("optAText", editOptAText);
    formData.append("optBText", editOptBText);
    formData.append("optCText", editOptCText);
    formData.append("optDText", editOptDText);

    startTransition(async () => {
      const res = await updateQuestionHierarchyAction(null, formData);
      if (res.error) {
        setActionFeedback({ type: "error", text: res.error });
      } else {
        setActionFeedback({ type: "success", text: "✓ Question updated successfully!" });
        setEditingQuestion(null);
      }
    });
  };

  // ----------------------------------------------------
  // Filter and Pagination Logic
  // ----------------------------------------------------
  const filteredQuestions = useMemo(() => {
    return questions.filter((q) => {
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

      if (filterCategory !== "ALL") {
        const matchesCat = q.categoryId === filterCategory || q.categoryName.toLowerCase() === filterCategory.toLowerCase();
        if (!matchesCat) return false;
      }

      if (filterPattern !== "ALL") {
        const matchesPat = q.patternId === filterPattern || q.patternName.toLowerCase() === filterPattern.toLowerCase();
        if (!matchesPat) return false;
      }

      if (filterSection !== "ALL") {
        const matchesSec = q.sectionId === filterSection || q.sectionName.toLowerCase() === filterSection.toLowerCase();
        if (!matchesSec) return false;
      }

      if (filterDifficulty !== "ALL" && q.difficulty.toLowerCase() !== filterDifficulty.toLowerCase()) {
        return false;
      }

      if (filterPyq === "pyq" && !q.isPyq && !q.pyqYear) {
        return false;
      }

      if (filterLanguage !== "ALL" && q.language.toLowerCase() !== filterLanguage.toLowerCase()) {
        return false;
      }

      return true;
    });
  }, [questions, searchQuery, filterCategory, filterPattern, filterSection, filterDifficulty, filterPyq, filterLanguage]);

  const totalItems = filteredQuestions.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  const validPage = Math.min(currentPage, totalPages);
  const startIndex = (validPage - 1) * PAGE_SIZE;
  const paginatedQuestions = filteredQuestions.slice(startIndex, startIndex + PAGE_SIZE);

  const breadcrumbs = [
    { label: "Mock Test Management", href: "/admin/mock-tests-management" },
    { label: "Categories", href: "/admin/categories" },
    { label: "Question Bank", active: true },
  ];

  return (
    <div className="space-y-6 max-w-7xl pb-16">
      {/* Breadcrumbs */}
      <AdminBreadcrumbs items={breadcrumbs} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2.5">
            <HelpCircle className="w-6 h-6 text-blue-600" /> Question Bank Studio
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 font-medium mt-0.5">
            Add and manage mock test questions with diagrams, options types, PYQ metadata, and bilingual support.
          </p>
        </div>
      </div>

      {/* Feedback Alerts */}
      {actionFeedback && (
        <Alert variant={actionFeedback.type === "success" ? "success" : "error"}>
          {actionFeedback.text}
        </Alert>
      )}

      {/* TWO COLUMN WORKSPACE */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: Add New Question Form */}
        <div className="lg:col-span-5 space-y-4">
          <Card className="p-5 sm:p-6 bg-white border border-slate-200/80 rounded-2xl shadow-2xs space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <PlusCircle className="w-5 h-5 text-blue-600" />
              <h2 className="text-sm font-bold text-slate-900">Add New Question</h2>
            </div>

            <form onSubmit={handleCreateQuestion} className="space-y-4">
              {/* Category / Pattern / Section Cascading Dropdowns */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Category <span className="text-rose-500">*</span>
                </label>
                <select
                  value={formCategory}
                  onChange={(e) => handleFormCategoryChange(e.target.value)}
                  className="w-full px-3 py-2.5 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-hidden focus:border-blue-500"
                  required
                >
                  <option value="">— Select Category —</option>
                  {taxonomy.exams.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Exam Pattern</label>
                <select
                  value={formPattern}
                  onChange={(e) => handleFormPatternChange(e.target.value)}
                  className="w-full px-3 py-2.5 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-hidden focus:border-blue-500"
                >
                  <option value="">— Select Pattern —</option>
                  {availablePatternsForForm.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Section</label>
                <select
                  value={formSection}
                  onChange={(e) => setFormSection(e.target.value)}
                  className="w-full px-3 py-2.5 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-hidden focus:border-blue-500"
                >
                  <option value="">— Select Section —</option>
                  {taxonomy.subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Question Text with Underline Helper */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-700">
                    Question Text <span className="text-rose-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => applyUnderline(false)}
                    className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-bold border border-slate-200 rounded-md bg-slate-50 hover:bg-blue-50 text-slate-700 hover:text-blue-600 transition"
                  >
                    <Underline className="w-3 h-3" /> Underline Selection
                  </button>
                </div>
                <textarea
                  ref={addTextareaRef}
                  value={statement}
                  onChange={(e) => setStatement(e.target.value)}
                  placeholder="Enter question statement... (supports [[u]]underline[[/u]])"
                  rows={3}
                  className="w-full px-3 py-2.5 text-xs font-mono rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-hidden focus:border-blue-500 resize-none"
                  required
                />
              </div>

              {/* Question Figure Image (Optional) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Question Figure <span className="text-slate-400 font-normal">(optional diagram)</span>
                </label>
                <div className="flex items-center gap-3">
                  <label className="flex-1 flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-dashed border-blue-200 bg-blue-50/50 hover:bg-blue-50 cursor-pointer text-xs font-semibold text-blue-700 transition">
                    <Upload className="w-4 h-4" />
                    <span>{questionImageUrl ? "✓ Figure Uploaded" : "Upload Diagram Image"}</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleImageUpload(file, "question");
                      }}
                    />
                  </label>
                  {questionImageUrl && (
                    <button
                      type="button"
                      onClick={() => setQuestionImageUrl("")}
                      className="text-xs text-rose-500 hover:underline shrink-0"
                    >
                      ✕ Remove
                    </button>
                  )}
                </div>
              </div>

              {/* Options Type Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Options Type</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setOptionsType("text")}
                    className={`py-2 text-xs font-bold rounded-xl border transition ${
                      optionsType === "text"
                        ? "bg-blue-50 text-blue-700 border-blue-500"
                        : "bg-white text-slate-600 border-slate-200"
                    }`}
                  >
                    Text
                  </button>
                  <button
                    type="button"
                    onClick={() => setOptionsType("image")}
                    className={`py-2 text-xs font-bold rounded-xl border transition ${
                      optionsType === "image"
                        ? "bg-blue-50 text-blue-700 border-blue-500"
                        : "bg-white text-slate-600 border-slate-200"
                    }`}
                  >
                    Images
                  </button>
                  <button
                    type="button"
                    onClick={() => setOptionsType("mixed")}
                    className={`py-2 text-xs font-bold rounded-xl border transition ${
                      optionsType === "mixed"
                        ? "bg-blue-50 text-blue-700 border-blue-500"
                        : "bg-white text-slate-600 border-slate-200"
                    }`}
                  >
                    Mixed
                  </button>
                </div>
              </div>

              {/* Options A-D Container */}
              <div className="space-y-3">
                {[
                  { key: "A", text: optAText, setText: setOptAText, img: optAImg, setImg: setOptAImg, color: "text-emerald-700" },
                  { key: "B", text: optBText, setText: setOptBText, img: optBImg, setImg: setOptBImg, color: "text-blue-700" },
                  { key: "C", text: optCText, setText: setOptCText, img: optCImg, setImg: setOptCImg, color: "text-purple-700" },
                  { key: "D", text: optDText, setText: setOptDText, img: optDImg, setImg: setOptDImg, color: "text-amber-700" },
                ].map((opt) => (
                  <div key={opt.key} className="p-3 rounded-xl border border-slate-200 bg-white space-y-2">
                    <label className={`block text-xs font-bold ${opt.color}`}>Option {opt.key}</label>
                    {(optionsType === "text" || optionsType === "mixed") && (
                      <input
                        type="text"
                        value={opt.text}
                        onChange={(e) => opt.setText(e.target.value)}
                        placeholder={`Option ${opt.key} text`}
                        className="w-full px-3 py-2 text-xs font-semibold rounded-lg border border-slate-200 bg-white focus:outline-hidden focus:border-blue-500"
                      />
                    )}
                    {(optionsType === "image" || optionsType === "mixed") && (
                      <div className="flex items-center gap-2">
                        <label className="flex-1 flex items-center justify-center gap-1.5 p-2 rounded-lg border border-dashed border-slate-200 bg-slate-50 hover:bg-blue-50 cursor-pointer text-xs font-medium text-slate-600">
                          <Upload className="w-3.5 h-3.5" />
                          <span>{opt.img ? `✓ Image for Option ${opt.key}` : `Upload Image ${opt.key}`}</span>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleImageUpload(file, opt.key as "A" | "B" | "C" | "D");
                            }}
                          />
                        </label>
                        {opt.img && (
                          <button
                            type="button"
                            onClick={() => opt.setImg("")}
                            className="text-xs text-rose-500 hover:underline"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Correct Answer & Difficulty */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Correct Answer <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={correctAnswer}
                    onChange={(e) => setCorrectAnswer(e.target.value)}
                    className="w-full px-3 py-2.5 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-hidden focus:border-blue-500"
                    required
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
                    value={difficulty}
                    onChange={(e) => setDifficulty(e.target.value)}
                    className="w-full px-3 py-2.5 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-hidden focus:border-blue-500"
                  >
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                </div>
              </div>

              {/* PYQ Details */}
              <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/60 space-y-3">
                <label className="block text-xs font-bold text-amber-900 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-amber-600" />
                  PYQ Details <span className="text-amber-700 font-normal">(optional)</span>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="text"
                    value={pyqSource}
                    onChange={(e) => setPyqSource(e.target.value)}
                    placeholder="e.g. SSC CGL, Railway"
                    className="w-full px-3 py-2 text-xs font-semibold rounded-lg border border-amber-200 bg-white focus:outline-hidden focus:border-amber-500"
                  />
                  <input
                    type="number"
                    value={pyqYear}
                    onChange={(e) => setPyqYear(e.target.value)}
                    placeholder="e.g. 2022"
                    min={1990}
                    max={2030}
                    className="w-full px-3 py-2 text-xs font-semibold rounded-lg border border-amber-200 bg-white focus:outline-hidden focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Language Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Language</label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="w-full px-3 py-2.5 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-hidden focus:border-blue-500"
                >
                  <option value="english">English</option>
                  <option value="hindi">Hindi (हिंदी)</option>
                </select>
              </div>

              {/* Explanation */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Explanation</label>
                <textarea
                  value={explanation}
                  onChange={(e) => setExplanation(e.target.value)}
                  placeholder="Explain the solution..."
                  rows={2}
                  className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-hidden focus:border-blue-500 resize-none"
                />
              </div>

              {/* Submit Button */}
              <Button
                type="submit"
                variant="default"
                disabled={isPending || isUploadingImg}
                className="w-full font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-2xs flex items-center justify-center gap-2 py-2.5 rounded-xl transition"
              >
                <PlusCircle className="w-4 h-4" />
                {isPending ? "Saving Question..." : "Add Question"}
              </Button>
            </form>
          </Card>

          {/* Bulk Import Link Box */}
          <Card className="p-5 rounded-2xl border border-slate-200/80 bg-white shadow-2xs space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600 shrink-0">
                <FileUp className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-xs font-bold text-slate-900">Bulk Question Importer</h3>
                <p className="text-[11px] text-slate-500 leading-relaxed mt-0.5">
                  Generate AI prompts, bulk-upload option diagrams, validate CSV, and preview exam view simulations.
                </p>
                <Link href="/admin/bulk-import" className="inline-block mt-2.5">
                  <Button size="sm" variant="outline" className="text-xs font-semibold border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900 shadow-2xs">
                    Open Bulk Import Studio →
                  </Button>
                </Link>
              </div>
            </div>
          </Card>
        </div>

        {/* RIGHT COLUMN: Question Bank List & Filters */}
        <div className="lg:col-span-7 space-y-4">
          {/* Filters Bar */}
          <Card className="p-4 bg-white border-slate-200/80 rounded-2xl shadow-2xs space-y-3">
            <div className="relative w-full">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Search question text, section, or PYQ..."
                className="w-full pl-9 pr-3 py-2 text-xs font-medium rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-hidden focus:border-blue-500"
              />
            </div>

            {/* Filter Dropdowns Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <select
                value={filterCategory}
                onChange={(e) => handleFilterCategoryChange(e.target.value)}
                className="p-2 text-xs font-semibold rounded-lg border border-slate-200 bg-white"
              >
                <option value="ALL">All Categories</option>
                {taxonomy.exams.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>

              <select
                value={filterPattern}
                onChange={(e) => handleFilterPatternChange(e.target.value)}
                className="p-2 text-xs font-semibold rounded-lg border border-slate-200 bg-white"
              >
                <option value="ALL">All Patterns</option>
                {availablePatternsForFilter.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>

              <select
                value={filterSection}
                onChange={(e) => {
                  setFilterSection(e.target.value);
                  setCurrentPage(1);
                }}
                className="p-2 text-xs font-semibold rounded-lg border border-slate-200 bg-white"
              >
                <option value="ALL">All Sections</option>
                {taxonomy.subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>

              <select
                value={filterDifficulty}
                onChange={(e) => {
                  setFilterDifficulty(e.target.value);
                  setCurrentPage(1);
                }}
                className="p-2 text-xs font-semibold rounded-lg border border-slate-200 bg-white"
              >
                <option value="ALL">All Difficulties</option>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>

              <select
                value={filterPyq}
                onChange={(e) => {
                  setFilterPyq(e.target.value);
                  setCurrentPage(1);
                }}
                className="p-2 text-xs font-semibold rounded-lg border border-slate-200 bg-white"
              >
                <option value="ALL">All Types</option>
                <option value="pyq">PYQ Questions Only</option>
              </select>

              <select
                value={filterLanguage}
                onChange={(e) => {
                  setFilterLanguage(e.target.value);
                  setCurrentPage(1);
                }}
                className="p-2 text-xs font-semibold rounded-lg border border-slate-200 bg-white"
              >
                <option value="ALL">All Languages</option>
                <option value="english">English</option>
                <option value="hindi">Hindi</option>
              </select>
            </div>

            {/* Results Count & Reset Filters */}
            <div className="flex items-center justify-between pt-1 text-xs">
              <span className="text-slate-500">
                {totalItems === 0
                  ? "No questions found"
                  : `Showing ${startIndex + 1}–${Math.min(startIndex + PAGE_SIZE, totalItems)} of ${totalItems} questions`}
              </span>
              <button
                type="button"
                onClick={resetAllFilters}
                className="inline-flex items-center gap-1 font-semibold text-blue-600 hover:text-blue-700 transition"
              >
                <RotateCcw className="w-3 h-3" /> Reset filters
              </button>
            </div>
          </Card>

          {/* Question List Cards */}
          {paginatedQuestions.length === 0 ? (
            <Card className="p-12 text-center bg-white border-slate-200/80 rounded-2xl space-y-2">
              <HelpCircle className="w-8 h-8 mx-auto text-slate-300" />
              <p className="text-xs text-slate-500 font-medium">No questions match your filters.</p>
              <Button variant="outline" size="sm" onClick={resetAllFilters} className="text-xs font-semibold">
                Clear All Filters
              </Button>
            </Card>
          ) : (
            <div className="space-y-3">
              {paginatedQuestions.map((q) => (
                <Card
                  key={q.id}
                  className="p-4 bg-white border border-slate-200/80 hover:border-slate-300 rounded-2xl transition shadow-2xs space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <p className="text-xs font-semibold text-slate-800 leading-snug line-clamp-2">
                        {q.statement}
                        {q.imageUrl && (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={q.imageUrl}
                            alt="Figure"
                            className="h-7 w-10 object-contain rounded-md border border-slate-200 inline-block ml-1.5 align-middle"
                          />
                        )}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => openEditModal(q)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900 shadow-2xs transition"
                      >
                        <Edit2 className="w-3 h-3" /> Edit
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Are you sure you want to delete this question?`)) {
                            startTransition(async () => {
                              const res = await deleteQuestionAction(q.id);
                              if (res.error) setActionFeedback({ type: "error", text: res.error });
                              if (res.message) setActionFeedback({ type: "success", text: res.message });
                            });
                          }
                        }}
                        disabled={isPending}
                        className="p-1 rounded-lg border border-rose-200 text-rose-500 hover:bg-rose-50 transition"
                        title="Delete Question"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Badges Row matching legacy UI */}
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    {q.categoryName && (
                      <span className="bg-slate-100 border border-slate-200 text-slate-700 px-2 py-0.5 rounded-md font-semibold text-[11px]">
                        {q.categoryName}
                      </span>
                    )}
                    <span
                      className={`px-2 py-0.5 rounded-md font-semibold text-[11px] border capitalize ${
                        q.difficulty === "easy"
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : q.difficulty === "medium"
                          ? "bg-amber-50 text-amber-700 border-amber-200"
                          : "bg-rose-50 text-rose-700 border-rose-200"
                      }`}
                    >
                      {q.difficulty}
                    </span>
                    {(q.pyqYear || q.pyqSource) && (
                      <span className="bg-amber-50 border border-amber-200 text-amber-800 px-2 py-0.5 rounded-md font-semibold text-[11px]">
                        PYQ {q.pyqSource ? `${q.pyqSource} · ` : ""}{q.pyqYear || ""}
                      </span>
                    )}
                    {q.optionsType && q.optionsType !== "text" && (
                      <span className="bg-indigo-50 border border-indigo-200 text-indigo-700 px-2 py-0.5 rounded-md font-semibold text-[11px]">
                        {q.optionsType} options
                      </span>
                    )}
                    {q.language === "hindi" && (
                      <span className="bg-orange-50 border border-orange-200 text-orange-700 px-2 py-0.5 rounded-md font-semibold text-[11px]">
                        🇮🇳 Hindi
                      </span>
                    )}
                    {q.status !== "published" && (
                      <span className="bg-rose-50 border border-rose-200 text-rose-600 px-2 py-0.5 rounded-md font-semibold text-[11px]">
                        Inactive
                      </span>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-1.5 pt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={validPage === 1}
                className="px-2.5 py-1 text-xs"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </Button>

              {Array.from({ length: totalPages }, (_, i) => i + 1).map((pgNum) => (
                <Button
                  key={pgNum}
                  variant={pgNum === validPage ? "default" : "outline"}
                  size="sm"
                  onClick={() => setCurrentPage(pgNum)}
                  className={`text-xs px-3 py-1 font-bold ${
                    pgNum === validPage ? "bg-blue-600 text-white" : "border-slate-200 text-slate-700"
                  }`}
                >
                  {pgNum}
                </Button>
              ))}

              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={validPage === totalPages}
                className="px-2.5 py-1 text-xs"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* EDIT QUESTION MODAL */}
      {editingQuestion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <Card className="w-full max-w-xl max-h-[90vh] overflow-y-auto p-6 bg-white border-slate-200 shadow-2xl space-y-4 relative">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-blue-600" /> Edit Question
              </h3>
              <button
                onClick={() => setEditingQuestion(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              {/* Question Text */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-700">Question Text</label>
                  <button
                    type="button"
                    onClick={() => applyUnderline(true)}
                    className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-bold border border-slate-200 rounded-md bg-slate-50 hover:bg-blue-50 text-slate-700 hover:text-blue-600 transition"
                  >
                    <Underline className="w-3 h-3" /> Underline
                  </button>
                </div>
                <textarea
                  ref={editTextareaRef}
                  value={editStatement}
                  onChange={(e) => setEditStatement(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-200 bg-white focus:outline-hidden focus:border-blue-500 resize-none"
                  required
                />
              </div>

              {/* Question Figure */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Question Figure</label>
                <div className="flex items-center gap-3">
                  <label className="flex-1 flex items-center justify-center gap-2 p-2.5 rounded-xl border border-dashed border-slate-200 bg-slate-50 hover:bg-blue-50 cursor-pointer text-xs font-semibold text-slate-700 transition">
                    <Upload className="w-4 h-4" />
                    <span>{editImgUrl ? "✓ Replace Figure Image" : "Upload Figure"}</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleImageUpload(file, "editQ");
                      }}
                    />
                  </label>
                  {editImgUrl && (
                    <button
                      type="button"
                      onClick={() => setEditImgUrl("")}
                      className="text-xs text-rose-500 hover:underline shrink-0"
                    >
                      ✕ Remove
                    </button>
                  )}
                </div>
              </div>

              {/* Options A-D */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-700">Options</label>
                {[
                  { key: "A", val: editOptAText, setVal: setEditOptAText, color: "bg-emerald-100 text-emerald-800" },
                  { key: "B", val: editOptBText, setVal: setEditOptBText, color: "bg-blue-100 text-blue-800" },
                  { key: "C", val: editOptCText, setVal: setEditOptCText, color: "bg-purple-100 text-purple-800" },
                  { key: "D", val: editOptDText, setVal: setEditOptDText, color: "bg-amber-100 text-amber-800" },
                ].map((opt) => (
                  <div key={opt.key} className="flex items-center gap-2">
                    <span className={`w-7 h-7 rounded-lg text-xs font-black flex items-center justify-center shrink-0 ${opt.color}`}>
                      {opt.key}
                    </span>
                    <input
                      type="text"
                      value={opt.val}
                      onChange={(e) => opt.setVal(e.target.value)}
                      className="flex-1 px-3 py-2 text-xs font-semibold rounded-lg border border-slate-200 bg-white focus:outline-hidden focus:border-blue-500"
                      required
                    />
                  </div>
                ))}
              </div>

              {/* Correct Answer & Difficulty */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Correct Answer</label>
                  <select
                    value={editCorrectAnswer}
                    onChange={(e) => setEditCorrectAnswer(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-hidden focus:border-blue-500"
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
                    value={editDifficulty}
                    onChange={(e) => setEditDifficulty(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-hidden focus:border-blue-500"
                  >
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                </div>
              </div>

              {/* PYQ */}
              <div className="p-3 rounded-xl border border-amber-200 bg-amber-50/60 space-y-2">
                <label className="block text-xs font-bold text-amber-900">PYQ Details</label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={editPyqSource}
                    onChange={(e) => setEditPyqSource(e.target.value)}
                    placeholder="e.g. SSC CGL"
                    className="w-full px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-amber-200 bg-white"
                  />
                  <input
                    type="number"
                    value={editPyqYear}
                    onChange={(e) => setEditPyqYear(e.target.value)}
                    placeholder="e.g. 2022"
                    className="w-full px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-amber-200 bg-white"
                  />
                </div>
              </div>

              {/* Language */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Language</label>
                <select
                  value={editLanguage}
                  onChange={(e) => setEditLanguage(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-hidden focus:border-blue-500"
                >
                  <option value="english">English</option>
                  <option value="hindi">Hindi (हिंदी)</option>
                </select>
              </div>

              {/* Explanation */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Explanation</label>
                <textarea
                  value={editExplanation}
                  onChange={(e) => setEditExplanation(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-hidden focus:border-blue-500 resize-none"
                />
              </div>

              {/* Active toggle */}
              <div className="flex items-center gap-3 p-3 border border-slate-200 rounded-xl bg-slate-50">
                <input
                  type="checkbox"
                  id="editIsActive"
                  checked={editIsActive}
                  onChange={(e) => setEditIsActive(e.target.checked)}
                  className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
                />
                <label htmlFor="editIsActive" className="text-xs font-semibold text-slate-700 cursor-pointer">
                  Question is active (visible in exams)
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <Button type="button" variant="outline" size="sm" onClick={() => setEditingQuestion(null)}>
                  Cancel
                </Button>
                <Button type="submit" variant="default" size="sm" disabled={isPending} className="font-bold bg-blue-600 hover:bg-blue-700 text-white">
                  {isPending ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
