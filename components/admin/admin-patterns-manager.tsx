"use client";

import React, { useState, useMemo, useActionState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AdminPatternItem, AdminCategoryItem } from "@/services/admin.service";
import {
  createPatternAction,
  updatePatternAction,
  togglePatternStatusAction,
  deletePatternAction,
} from "@/app/admin/actions";
import { AdminBreadcrumbs } from "@/components/admin/admin-breadcrumbs";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import {
  GitBranch,
  Search,
  PlusCircle,
  Layers,
  HelpCircle,
  FileCheck2,
  Calendar,
  FileUp,
  Filter,
  Edit2,
  Power,
  Trash2,
  X,
  Clock,
  Star,
  MinusCircle,
  HelpCircle as QuestionIcon,
  ChevronLeft,
  ChevronRight,
  FolderTree,
} from "lucide-react";

interface Props {
  patterns: AdminPatternItem[];
  categories: AdminCategoryItem[];
  currentCategory?: string;
}

const PAGE_SIZE = 8;

export function AdminPatternsManager({ patterns, categories, currentCategory }: Props) {
  const router = useRouter();

  // Create Form State
  const [createState, createAction, isCreating] = useActionState(createPatternAction, null);

  // Edit Modal State
  const [editingPattern, setEditingPattern] = useState<AdminPatternItem | null>(null);
  const [editState, editAction, isEditing] = useActionState(updatePatternAction, null);

  // Search & Filter & Pagination State
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState(currentCategory || "ALL");
  const [currentPage, setCurrentPage] = useState(1);
  const [actionFeedback, setActionFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const activeCategoryObj = useMemo(() => {
    if (!currentCategory || currentCategory === "ALL") return null;
    return categories.find((c) => c.slug === currentCategory || c.id === currentCategory);
  }, [categories, currentCategory]);

  const filteredPatterns = useMemo(() => {
    return patterns.filter((p) => {
      if (selectedCategory !== "ALL") {
        const matchesCategory =
          p.categoryId === selectedCategory ||
          p.categorySlug.toLowerCase() === selectedCategory.toLowerCase();
        if (!matchesCategory) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        return (
          p.name.toLowerCase().includes(q) ||
          p.categoryName.toLowerCase().includes(q) ||
          (p.tierName && p.tierName.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [patterns, selectedCategory, searchQuery]);

  // Pagination calculation
  const totalItems = filteredPatterns.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  const validPage = Math.min(currentPage, totalPages);
  const startIndex = (validPage - 1) * PAGE_SIZE;
  const paginatedPatterns = filteredPatterns.slice(startIndex, startIndex + PAGE_SIZE);

  const handleCategoryChange = (cat: string) => {
    setSelectedCategory(cat);
    setCurrentPage(1);
    if (cat === "ALL") {
      router.push("/admin/patterns");
    } else {
      router.push(`/admin/patterns?category=${cat}`);
    }
  };

  const breadcrumbs = [
    { label: "Mock Test Management", href: "/admin/mock-tests-management" },
    { label: "Categories", href: "/admin/categories" },
    ...(activeCategoryObj
      ? [{ label: activeCategoryObj.title, href: `/admin/patterns?category=${activeCategoryObj.slug}` }]
      : []),
    { label: "Patterns", active: true },
  ];

  return (
    <div className="space-y-4 w-full pb-8">
      {/* Breadcrumbs */}
      <AdminBreadcrumbs items={breadcrumbs} />

      {/* Header matching original system */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2.5">
            <GitBranch className="w-6 h-6 text-blue-600" /> Exam Pattern Builder
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 font-medium mt-0.5">
            Define structure, duration, questions count, and negative marking for each competitive exam.
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

      {/* TWO COLUMN WORKSPACE (LEFT: CREATE PATTERN | RIGHT: EXISTING PATTERNS) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: Create Pattern Form Card */}
        <div className="lg:col-span-5">
          <Card className="p-5 sm:p-6 bg-white border border-slate-200/80 rounded-2xl shadow-2xs space-y-4 sticky top-4">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <PlusCircle className="w-5 h-5 text-blue-600" />
              <h2 className="text-sm font-bold text-slate-900">Create New Pattern</h2>
            </div>

            <form action={createAction} className="space-y-4">
              {/* Category Dropdown */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Select Category <span className="text-rose-500">*</span>
                </label>
                <select
                  name="categoryId"
                  defaultValue={activeCategoryObj ? activeCategoryObj.id : (categories[0]?.id || "")}
                  className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-hidden focus:border-blue-500"
                  required
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </div>

              {/* Pattern Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Pattern Name <span className="text-rose-500">*</span>
                </label>
                <input
                  name="name"
                  type="text"
                  placeholder="e.g. Tier 1"
                  className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-hidden focus:border-blue-500"
                  required
                />
              </div>

              {/* Tier / Exam Stage */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Tier / Exam Stage
                </label>
                <input
                  name="tierName"
                  type="text"
                  defaultValue="Tier 1 (CBE)"
                  className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-hidden focus:border-blue-500"
                />
              </div>

              {/* Total Questions & Total Marks */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Total Questions <span className="text-rose-500">*</span>
                  </label>
                  <input
                    name="totalQuestions"
                    type="number"
                    min={1}
                    defaultValue={100}
                    className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-hidden focus:border-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Total Marks <span className="text-rose-500">*</span>
                  </label>
                  <input
                    name="totalMarks"
                    type="number"
                    min={1}
                    defaultValue={200}
                    className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-hidden focus:border-blue-500"
                    required
                  />
                </div>
              </div>

              {/* Duration Minutes & Negative Marks */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Duration (Minutes) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    name="durationMinutes"
                    type="number"
                    min={1}
                    defaultValue={60}
                    className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-hidden focus:border-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Negative Mark Value
                  </label>
                  <input
                    name="negativeMarkValue"
                    type="number"
                    step="0.01"
                    min={0}
                    defaultValue={0.5}
                    className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-hidden focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Status Toggle & Submit */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  name="isActive"
                  id="isActivePattern"
                  defaultChecked
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="isActivePattern" className="text-xs font-semibold text-slate-700">
                  Active (Immediately available in Mock Test creation)
                </label>
              </div>

              <Button
                type="submit"
                variant="default"
                disabled={isCreating}
                className="w-full font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-2xs flex items-center justify-center gap-2 py-2.5 rounded-xl transition"
              >
                <PlusCircle className="w-4 h-4" />
                {isCreating ? "Creating Pattern..." : "Create Pattern"}
              </Button>
            </form>
          </Card>
        </div>

        {/* RIGHT COLUMN: Existing Patterns with Search, Category Filter & Pagination */}
        <div className="lg:col-span-7 space-y-4">
          {/* Search & Category Filter Bar */}
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
                placeholder="Search by name or category..."
                className="w-full pl-9 pr-3 py-2 text-xs font-medium rounded-xl border border-slate-200 bg-slate-50/50 focus:outline-hidden focus:border-indigo-500"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Filter className="w-4 h-4 text-slate-400 shrink-0" />
              <select
                value={selectedCategory}
                onChange={(e) => handleCategoryChange(e.target.value)}
                className="p-2 text-xs font-semibold rounded-lg border border-slate-200 bg-white min-w-[150px]"
              >
                <option value="ALL">All Categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.slug}>
                    {c.title}
                  </option>
                ))}
              </select>
            </div>
          </Card>

          {/* Results Count Summary Banner */}
          <div className="flex items-center justify-between text-xs text-slate-500 px-1">
            <span>
              {totalItems === 0
                ? "No patterns found."
                : `Showing ${startIndex + 1}–${Math.min(startIndex + PAGE_SIZE, totalItems)} of ${totalItems} pattern${
                    totalItems !== 1 ? "s" : ""
                  }`}
            </span>
            {selectedCategory !== "ALL" && (
              <span className="font-semibold text-indigo-600">Filtered: {selectedCategory}</span>
            )}
          </div>

          {/* Pattern Cards List */}
          {paginatedPatterns.length === 0 ? (
            <Card className="p-12 text-center bg-white border-slate-200 space-y-2">
              <GitBranch className="w-8 h-8 mx-auto text-slate-300" />
              <p className="text-xs text-slate-500 font-medium">No patterns match your search criteria.</p>
            </Card>
          ) : (
            <div className="space-y-4">
              {paginatedPatterns.map((pattern) => (
                <Card
                  key={pattern.id}
                  className="p-5 bg-white border-slate-200 hover:border-indigo-300 transition shadow-xs space-y-4 border-l-4 border-l-blue-400"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <span className="text-xs font-semibold text-blue-500 block mb-0.5">
                        {pattern.categoryName}
                      </span>
                      <h3 className="text-base font-black text-slate-900 leading-tight">
                        {pattern.name}
                      </h3>
                      {pattern.tierName && (
                        <span className="text-[11px] font-medium text-slate-400 block mt-0.5">
                          {pattern.tierName}
                        </span>
                      )}

                      {/* METRIC PILLS — Clean Neutral Design */}
                      <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                        <span className="inline-flex items-center text-xs bg-slate-100 text-slate-700 border border-slate-200/70 px-2 py-0.5 rounded-md font-semibold">
                          <QuestionIcon className="w-3 h-3 mr-1 text-slate-500" />
                          {pattern.totalQuestions} Questions
                        </span>
                        <span className="inline-flex items-center text-xs bg-slate-100 text-slate-700 border border-slate-200/70 px-2 py-0.5 rounded-md font-semibold">
                          <Star className="w-3 h-3 mr-1 text-slate-500" />
                          {pattern.totalMarks} Marks
                        </span>
                        <span className="inline-flex items-center text-xs bg-slate-100 text-slate-700 border border-slate-200/70 px-2 py-0.5 rounded-md font-semibold">
                          <Clock className="w-3 h-3 mr-1 text-slate-500" />
                          {pattern.durationMinutes} Min
                        </span>
                        <span className="inline-flex items-center text-xs bg-slate-100 text-slate-700 border border-slate-200/70 px-2 py-0.5 rounded-md font-semibold">
                          <MinusCircle className="w-3 h-3 mr-1 text-slate-500" />
                          {pattern.negativeMarkValue > 0 ? `-${pattern.negativeMarkValue} Neg` : "No Neg"}
                        </span>
                        <span className="inline-flex items-center text-xs bg-slate-100 text-slate-700 border border-slate-200/70 px-2 py-0.5 rounded-md font-semibold">
                          <FolderTree className="w-3 h-3 mr-1 text-slate-500" />
                          {pattern.sectionsCount} Sections
                        </span>
                      </div>
                    </div>

                    {/* Quick Edit & Delete Controls */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Badge variant={pattern.isActive ? "success" : "neutral"} className="text-[10px] uppercase font-bold">
                        {pattern.isActive ? "ACTIVE" : "DRAFT"}
                      </Badge>
                      <button
                        onClick={() => setEditingPattern(pattern)}
                        className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-50 transition"
                        title="Edit Pattern"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => {
                          if (
                            confirm(
                              `Are you sure you want to ${pattern.isActive ? "deactivate" : "activate"} "${pattern.name}"?`
                            )
                          ) {
                            startTransition(async () => {
                              const res = await togglePatternStatusAction(pattern.id, pattern.isActive);
                              if (res.error) setActionFeedback({ type: "error", text: res.error });
                              if (res.message) setActionFeedback({ type: "success", text: res.message });
                            });
                          }
                        }}
                        disabled={isPending}
                        className={`p-1.5 rounded-lg border ${
                          pattern.isActive
                            ? "border-amber-200 text-amber-600 hover:bg-amber-50"
                            : "border-emerald-200 text-emerald-600 hover:bg-emerald-50"
                        } transition`}
                        title={pattern.isActive ? "Deactivate" : "Activate"}
                      >
                        <Power className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => {
                          if (pattern.sectionsCount > 0) {
                            if (
                              !confirm(
                                `⚠️ "${pattern.name}" has ${pattern.sectionsCount} section(s).\n\nDeleting removes associated section blueprints.\n\nAre you sure you want to delete?`
                              )
                            )
                              return;
                          } else {
                            if (!confirm(`Delete pattern "${pattern.name}"? This cannot be undone.`)) return;
                          }
                          startTransition(async () => {
                            const res = await deletePatternAction(pattern.id);
                            if (res.error) setActionFeedback({ type: "error", text: res.error });
                            if (res.message) setActionFeedback({ type: "success", text: res.message });
                          });
                        }}
                        disabled={isPending}
                        className="p-1.5 rounded-lg border border-rose-200 text-rose-500 hover:bg-rose-50 transition"
                        title="Delete Pattern"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Connected Hierarchical Action Links — Restrained, Clean Secondary Buttons */}
                  <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center gap-1.5">
                    <Link href={`/admin/sections?pattern=${pattern.id}&category=${pattern.categorySlug}`}>
                      <Button variant="outline" size="sm" className="text-xs font-semibold text-slate-700 border-slate-200 bg-white hover:bg-slate-50 hover:text-slate-900 shadow-2xs">
                        <Layers className="w-3.5 h-3.5 mr-1.5 text-slate-400" /> Manage Sections
                      </Button>
                    </Link>
                    <Link href={`/admin/questions?category=${pattern.categorySlug}&pattern=${pattern.id}`}>
                      <Button variant="outline" size="sm" className="text-xs font-semibold text-slate-700 border-slate-200 bg-white hover:bg-slate-50 hover:text-slate-900 shadow-2xs">
                        <HelpCircle className="w-3.5 h-3.5 mr-1.5 text-slate-400" /> View Questions
                      </Button>
                    </Link>
                    <Link href={`/admin/mock-tests?pattern=${pattern.id}&category=${pattern.categorySlug}`}>
                      <Button variant="outline" size="sm" className="text-xs font-semibold text-slate-700 border-slate-200 bg-white hover:bg-slate-50 hover:text-slate-900 shadow-2xs">
                        <FileCheck2 className="w-3.5 h-3.5 mr-1.5 text-slate-400" /> Manage Mock Tests
                      </Button>
                    </Link>
                    <Link href={`/admin/schedules?category=${pattern.categorySlug}`}>
                      <Button variant="outline" size="sm" className="text-xs font-semibold text-slate-700 border-slate-200 bg-white hover:bg-slate-50 hover:text-slate-900 shadow-2xs">
                        <Calendar className="w-3.5 h-3.5 mr-1.5 text-slate-400" /> Schedules
                      </Button>
                    </Link>
                    <Link href="/admin/bulk-import">
                      <Button variant="outline" size="sm" className="text-xs font-semibold text-slate-700 border-slate-200 bg-white hover:bg-slate-50 hover:text-slate-900 shadow-2xs">
                        <FileUp className="w-3.5 h-3.5 mr-1.5 text-slate-400" /> Bulk Import
                      </Button>
                    </Link>
                  </div>
                </Card>
              ))}
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
                    pgNum === validPage ? "bg-indigo-600 text-white" : "border-slate-200 text-slate-700"
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

      {/* EDIT PATTERN MODAL */}
      {editingPattern && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <Card className="w-full max-w-lg p-6 bg-white border-slate-200 shadow-2xl space-y-4 relative">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-indigo-600" /> Edit Pattern: {editingPattern.name}
              </h3>
              <button
                onClick={() => setEditingPattern(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {editState?.error && <Alert variant="error">{editState.error}</Alert>}
            {editState?.message && <Alert variant="success">{editState.message}</Alert>}

            <form action={editAction} className="space-y-4">
              <input type="hidden" name="id" value={editingPattern.id} />

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Pattern Name</label>
                <input
                  name="name"
                  type="text"
                  defaultValue={editingPattern.name}
                  className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-hidden focus:border-indigo-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Tier / Stage</label>
                <input
                  name="tierName"
                  type="text"
                  defaultValue={editingPattern.tierName || ""}
                  className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Duration (Mins)</label>
                  <input
                    name="durationMinutes"
                    type="number"
                    defaultValue={editingPattern.durationMinutes}
                    className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-hidden focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Total Questions</label>
                  <input
                    name="totalQuestions"
                    type="number"
                    defaultValue={editingPattern.totalQuestions}
                    className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-hidden focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Total Marks</label>
                  <input
                    name="totalMarks"
                    type="number"
                    defaultValue={editingPattern.totalMarks}
                    className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-hidden focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Negative Marking</label>
                  <input
                    name="negativeMarkValue"
                    type="number"
                    step="0.01"
                    defaultValue={editingPattern.negativeMarkValue}
                    className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-hidden focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <Button type="button" variant="outline" size="sm" onClick={() => setEditingPattern(null)}>
                  Cancel
                </Button>
                <Button type="submit" variant="default" size="sm" disabled={isEditing} className="font-bold bg-indigo-600 hover:bg-indigo-700">
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
