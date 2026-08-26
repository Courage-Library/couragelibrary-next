"use client";

import React, { useState, useMemo, useActionState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AdminSectionItem, AdminPatternItem, AdminCategoryItem } from "@/services/admin.service";
import {
  createSectionAction,
  updateSectionAction,
  deleteSectionAction,
} from "@/app/admin/actions";
import { AdminBreadcrumbs } from "@/components/admin/admin-breadcrumbs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import {
  Layers,
  Search,
  PlusCircle,
  HelpCircle,
  Filter,
  Edit2,
  Trash2,
  X,
  FileUp,
  Calculator,
  Star,
  CheckCircle2,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  HelpCircle as QuestionIcon,
} from "lucide-react";

interface Props {
  sections: AdminSectionItem[];
  patterns: AdminPatternItem[];
  categories: AdminCategoryItem[];
  currentPattern?: string;
  currentCategory?: string;
}

const PAGE_SIZE = 10;

export function AdminSectionsManager({
  sections,
  patterns,
  categories,
  currentPattern,
  currentCategory,
}: Props) {
  const router = useRouter();

  // Create Form State
  const [createState, createAction, isCreating] = useActionState(createSectionAction, null);

  // Edit Modal State
  const [editingSection, setEditingSection] = useState<AdminSectionItem | null>(null);
  const [editState, editAction, isEditing] = useActionState(updateSectionAction, null);

  // Search & Filter & Pagination
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPatternFilter, setSelectedPatternFilter] = useState(currentPattern || "ALL");
  const [currentPage, setCurrentPage] = useState(1);
  const [actionFeedback, setActionFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const activePatternObj = useMemo(() => {
    if (!currentPattern || currentPattern === "ALL") return null;
    return patterns.find((p) => p.id === currentPattern || p.name.toLowerCase() === currentPattern.toLowerCase());
  }, [patterns, currentPattern]);

  const activeCategoryObj = useMemo(() => {
    if (activePatternObj) {
      return categories.find((c) => c.slug === activePatternObj.categorySlug || c.id === activePatternObj.categoryId);
    }
    if (currentCategory && currentCategory !== "ALL") {
      return categories.find((c) => c.slug === currentCategory || c.id === currentCategory);
    }
    return null;
  }, [categories, activePatternObj, currentCategory]);

  const filtered = useMemo(() => {
    return sections.filter((s) => {
      if (selectedPatternFilter !== "ALL") {
        const matchesPattern =
          s.patternId === selectedPatternFilter ||
          (s.patternName && s.patternName.toLowerCase() === selectedPatternFilter.toLowerCase());
        if (!matchesPattern) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        return (
          s.name.toLowerCase().includes(q) ||
          (s.patternName && s.patternName.toLowerCase().includes(q)) ||
          (s.categoryName && s.categoryName.toLowerCase().includes(q)) ||
          s.slug.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [sections, selectedPatternFilter, searchQuery]);

  // Pagination calculation
  const totalItems = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  const validPage = Math.min(currentPage, totalPages);
  const startIndex = (validPage - 1) * PAGE_SIZE;
  const paginatedSections = filtered.slice(startIndex, startIndex + PAGE_SIZE);

  const handlePatternFilterChange = (pat: string) => {
    setSelectedPatternFilter(pat);
    setCurrentPage(1);
    if (pat === "ALL") {
      router.push("/admin/sections");
    } else {
      router.push(`/admin/sections?pattern=${pat}`);
    }
  };

  const breadcrumbs = [
    { label: "Mock Test Management", href: "/admin/mock-tests-management" },
    { label: "Categories", href: "/admin/categories" },
    ...(activeCategoryObj
      ? [{ label: activeCategoryObj.title, href: `/admin/patterns?category=${activeCategoryObj.slug}` }]
      : []),
    {
      label: "Patterns",
      href: activeCategoryObj ? `/admin/patterns?category=${activeCategoryObj.slug}` : "/admin/patterns",
    },
    ...(activePatternObj
      ? [{ label: activePatternObj.name, href: `/admin/sections?pattern=${activePatternObj.id}` }]
      : []),
    { label: "Sections", active: true },
  ];

  return (
    <div className="space-y-6 max-w-7xl pb-16">
      {/* Breadcrumbs */}
      <AdminBreadcrumbs items={breadcrumbs} />

      {/* Header matching original system */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
            <Layers className="w-7 h-7 text-teal-600" /> Pattern Sections Manager
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Create and manage exam sections, required question distributions, and marks per question under each pattern.
          </p>
        </div>
      </div>

      {/* Feedback Alerts */}
      {createState?.error && <Alert variant="error">{createState.error}</Alert>}
      {createState?.message && <Alert variant="success">{createState.message}</Alert>}
      {actionFeedback && (
        <Alert variant={actionFeedback.type === "success" ? "success" : "error"}>
          {actionFeedback.text}
        </Alert>
      )}

      {/* TWO COLUMN WORKSPACE (LEFT: ADD SECTION | RIGHT: EXISTING SECTIONS) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: Add New Section Form Card */}
        <div className="lg:col-span-5">
          <Card className="p-6 bg-white border-slate-200 shadow-sm border-l-4 border-l-teal-600 space-y-4 sticky top-4">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <PlusCircle className="w-5 h-5 text-teal-600" />
              <h2 className="text-base font-black text-slate-900">Add New Section</h2>
            </div>

            <form action={createAction} className="space-y-4">
              {/* Pattern Selector with Category — Pattern labels */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Select Pattern <span className="text-rose-500">*</span>
                </label>
                <select
                  name="patternId"
                  defaultValue={activePatternObj ? activePatternObj.id : (patterns[0]?.id || "")}
                  className="w-full px-3 py-2.5 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-hidden focus:border-teal-500"
                  required
                >
                  <option value="">— Select Pattern —</option>
                  {patterns.map((p) => {
                    const catLabel = p.categoryName || "National";
                    return (
                      <option key={p.id} value={p.id}>
                        {catLabel} — {p.name}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Section Name */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Section Name <span className="text-rose-500">*</span>
                </label>
                <input
                  name="name"
                  type="text"
                  placeholder="e.g. General Awareness"
                  className="w-full px-3 py-2.5 text-xs font-semibold rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-hidden focus:border-teal-500"
                  required
                />
              </div>

              {/* Number of Questions & Marks Per Question */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Number of Questions <span className="text-rose-500">*</span>
                  </label>
                  <input
                    name="questionCount"
                    type="number"
                    min={1}
                    defaultValue={25}
                    className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-hidden focus:border-teal-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Marks Per Question <span className="text-rose-500">*</span>
                  </label>
                  <input
                    name="marksPerQuestion"
                    type="number"
                    step="0.25"
                    min={0.25}
                    defaultValue={2.0}
                    className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-hidden focus:border-teal-500"
                    required
                  />
                </div>
              </div>

              {/* Negative Marking Value */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Negative Mark Per Wrong Answer
                </label>
                <input
                  name="negativeMark"
                  type="number"
                  step="0.01"
                  defaultValue={0.5}
                  className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-hidden focus:border-teal-500"
                />
              </div>

              {/* Add Section Button */}
              <Button
                type="submit"
                variant="default"
                disabled={isCreating}
                className="w-full font-bold bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white shadow-sm flex items-center justify-center gap-2 py-3 rounded-xl"
              >
                <PlusCircle className="w-4 h-4" />
                {isCreating ? "Saving Section..." : "Add Section"}
              </Button>
            </form>
          </Card>
        </div>

        {/* RIGHT COLUMN: Existing Sections with Search, Pattern Filter & Pagination */}
        <div className="lg:col-span-7 space-y-4">
          {/* Search & Pattern Filter Bar */}
          <Card className="p-4 bg-white border-slate-200 shadow-xs flex flex-col sm:flex-row items-center gap-3">
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Search sections by name, pattern, or category..."
                className="w-full pl-9 pr-3 py-2 text-xs font-medium rounded-xl border border-slate-200 bg-slate-50/50 focus:outline-hidden focus:border-teal-500"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Filter className="w-4 h-4 text-slate-400 shrink-0" />
              <select
                value={selectedPatternFilter}
                onChange={(e) => handlePatternFilterChange(e.target.value)}
                className="p-2 text-xs font-semibold rounded-lg border border-slate-200 bg-white min-w-[180px]"
              >
                <option value="ALL">All Patterns</option>
                {patterns.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.categoryName} — {p.name}
                  </option>
                ))}
              </select>
            </div>
          </Card>

          {/* Results Summary Banner */}
          <div className="flex items-center justify-between text-xs text-slate-500 px-1">
            <span>
              {totalItems === 0
                ? "No sections found."
                : `Showing ${startIndex + 1}–${Math.min(startIndex + PAGE_SIZE, totalItems)} of ${totalItems} section${
                    totalItems !== 1 ? "s" : ""
                  }`}
            </span>
            {selectedPatternFilter !== "ALL" && (
              <span className="font-semibold text-teal-600">Filtered by Pattern</span>
            )}
          </div>

          {/* Section Cards List */}
          {paginatedSections.length === 0 ? (
            <Card className="p-12 text-center bg-white border-slate-200 space-y-2">
              <Layers className="w-8 h-8 mx-auto text-slate-300" />
              <p className="text-xs text-slate-500 font-medium">No sections match your search.</p>
            </Card>
          ) : (
            <div className="space-y-4">
              {paginatedSections.map((sec) => {
                const totalMarks = (sec.questionCount * sec.marksPerQuestion).toFixed(1);
                const hasEnough = (sec.questionsInBank || 0) >= sec.questionCount;
                const questionUrl = `/admin/questions?section=${encodeURIComponent(sec.name)}${
                  sec.categorySlug ? `&category=${sec.categorySlug}` : ""
                }${sec.patternId ? `&pattern=${sec.patternId}` : ""}`;

                return (
                  <Card
                    key={sec.id}
                    className={`p-5 bg-white border-slate-200 hover:border-teal-300 transition shadow-xs space-y-4 border-l-4 ${
                      hasEnough ? "border-l-emerald-500" : "border-l-amber-500"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <span className="text-xs font-semibold text-teal-600 block mb-0.5">
                          {sec.categoryName ? `${sec.categoryName} — ` : ""}
                          {sec.patternName || "Standard Pattern"}
                        </span>
                        <h3 className="text-base font-black text-slate-900 leading-tight">
                          {sec.name}
                        </h3>

                        {/* ORIGINAL METRIC PILLS */}
                        <div className="flex flex-wrap items-center gap-2 mt-2.5">
                          <span className="inline-flex items-center text-xs bg-blue-50 text-blue-700 px-2.5 py-1 rounded-lg font-bold">
                            <QuestionIcon className="w-3 h-3 mr-1 text-blue-500" />
                            {sec.questionCount} Required
                          </span>
                          <span className="inline-flex items-center text-xs bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-lg font-bold">
                            <Star className="w-3 h-3 mr-1 text-emerald-500" />
                            {sec.marksPerQuestion} Marks each
                          </span>
                          <span className="inline-flex items-center text-xs bg-purple-50 text-purple-700 px-2.5 py-1 rounded-lg font-bold">
                            <Calculator className="w-3 h-3 mr-1 text-purple-500" />
                            {totalMarks} Total
                          </span>
                          <span
                            className={`inline-flex items-center text-xs px-2.5 py-1 rounded-lg font-bold ${
                              hasEnough
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-amber-50 text-amber-800"
                            }`}
                          >
                            {hasEnough ? (
                              <CheckCircle2 className="w-3 h-3 mr-1 text-emerald-600" />
                            ) : (
                              <AlertTriangle className="w-3 h-3 mr-1 text-amber-600" />
                            )}
                            {sec.questionsInBank || 0} in bank
                          </span>
                        </div>
                      </div>

                      {/* Quick Edit & Safe Delete Controls */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => setEditingSection(sec)}
                          className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-teal-600 hover:bg-slate-50 transition"
                          title="Edit Section"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            const qCount = sec.questionsInBank || 0;
                            if (qCount > 0) {
                              if (
                                !confirm(
                                  `⚠️ "${sec.name}" has ${qCount} question(s) linked.\n\nThe Section will be deleted but the questions will stay in the question bank.\n\nAre you sure you want to delete?`
                                )
                              )
                                return;
                            } else {
                              if (!confirm(`Delete section "${sec.name}"? This cannot be undone.`)) return;
                            }
                            startTransition(async () => {
                              const res = await deleteSectionAction(sec.id);
                              if (res.error) setActionFeedback({ type: "error", text: res.error });
                              if (res.message) setActionFeedback({ type: "success", text: res.message });
                            });
                          }}
                          disabled={isPending}
                          className="p-1.5 rounded-lg border border-rose-200 text-rose-500 hover:bg-rose-50 transition"
                          title="Delete Section"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Connected Action Links */}
                    <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2">
                      <Link href={questionUrl}>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs font-bold text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                        >
                          <HelpCircle className="w-3.5 h-3.5 mr-1" /> Manage Questions
                        </Button>
                      </Link>
                      <Link href="/admin/bulk-import">
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs font-bold text-rose-700 border-rose-200 hover:bg-rose-50"
                        >
                          <FileUp className="w-3.5 h-3.5 mr-1" /> Bulk Import
                        </Button>
                      </Link>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Pagination Controls */}
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
                    pgNum === validPage ? "bg-teal-600 text-white" : "border-slate-200 text-slate-700"
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

      {/* EDIT SECTION MODAL */}
      {editingSection && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <Card className="w-full max-w-lg p-6 bg-white border-slate-200 shadow-2xl space-y-4 relative">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-teal-600" /> Edit Section: {editingSection.name}
              </h3>
              <button
                onClick={() => setEditingSection(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {editState?.error && <Alert variant="error">{editState.error}</Alert>}
            {editState?.message && <Alert variant="success">{editState.message}</Alert>}

            <form action={editAction} className="space-y-4">
              <input type="hidden" name="id" value={editingSection.id} />

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Section Name</label>
                <input
                  name="name"
                  type="text"
                  defaultValue={editingSection.name}
                  className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-hidden focus:border-teal-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Required Questions</label>
                  <input
                    name="questionCount"
                    type="number"
                    min={1}
                    defaultValue={editingSection.questionCount}
                    className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-hidden focus:border-teal-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Marks Per Question</label>
                  <input
                    name="marksPerQuestion"
                    type="number"
                    step="0.25"
                    min={0.25}
                    defaultValue={editingSection.marksPerQuestion}
                    className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-hidden focus:border-teal-500"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Negative Mark</label>
                <input
                  name="negativeMark"
                  type="number"
                  step="0.01"
                  defaultValue={editingSection.negativeMark}
                  className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-hidden focus:border-teal-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <Button type="button" variant="outline" size="sm" onClick={() => setEditingSection(null)}>
                  Cancel
                </Button>
                <Button type="submit" variant="default" size="sm" disabled={isEditing} className="font-bold bg-teal-600 hover:bg-teal-700">
                  {isEditing ? "Updating..." : "Save Changes"}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
