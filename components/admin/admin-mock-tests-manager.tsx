"use client";

import React, { useState, useMemo, useActionState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createMockTestAction,
  updateMockTestAction,
  toggleMockTestPublishAction,
} from "@/app/admin/actions";
import { AdminCategoryItem, AdminPatternItem } from "@/services/admin.service";
import { AdminBreadcrumbs } from "@/components/admin/admin-breadcrumbs";
import { BulkImportModal } from "@/components/admin/bulk-import-modal";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import {
  FileCheck2,
  PlusCircle,
  FileUp,
  Search,
  Filter,
  HelpCircle,
  Layers,
  Edit2,
  Power,
  X,
} from "lucide-react";

export interface MockTestItem {
  id: string;
  title: string;
  slug: string;
  durationMinutes: number;
  totalQuestions: number;
  totalMarks: number;
  isPublished: boolean;
  status: string;
  createdAt: string;
  categoryId: string;
  categoryName: string;
  categorySlug: string;
  patternId: string;
  patternName: string;
  sectionsCount: number;
}

interface Props {
  tests: MockTestItem[];
  categories: AdminCategoryItem[];
  patterns: AdminPatternItem[];
  currentCategory?: string;
  currentPattern?: string;
}

export function AdminMockTestsManager({
  tests,
  categories,
  patterns,
  currentCategory,
  currentPattern,
}: Props) {
  const router = useRouter();
  const [showBulkImport, setShowBulkImport] = useState(false);

  // Create Form State
  const [createState, createAction, isCreating] = useActionState(createMockTestAction, null);

  // Edit Modal State
  const [editingMock, setEditingMock] = useState<MockTestItem | null>(null);
  const [editState, editAction, isEditing] = useActionState(updateMockTestAction, null);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState(currentCategory || "ALL");
  const [selectedPattern, setSelectedPattern] = useState(currentPattern || "ALL");
  const [isToggling, startTransition] = useTransition();

  const activeCategoryObj = useMemo(() => {
    if (!currentCategory || currentCategory === "ALL") return null;
    return categories.find((c) => c.slug === currentCategory || c.id === currentCategory);
  }, [categories, currentCategory]);

  const activePatternObj = useMemo(() => {
    if (!currentPattern || currentPattern === "ALL") return null;
    return patterns.find((p) => p.id === currentPattern || p.name.toLowerCase() === currentPattern.toLowerCase());
  }, [patterns, currentPattern]);

  const filtered = useMemo(() => {
    return tests.filter((t) => {
      if (selectedCategory !== "ALL") {
        const matchesCategory =
          t.categoryId === selectedCategory ||
          t.categorySlug.toLowerCase() === selectedCategory.toLowerCase();
        if (!matchesCategory) return false;
      }
      if (selectedPattern !== "ALL") {
        const matchesPattern =
          t.patternId === selectedPattern ||
          t.patternName.toLowerCase() === selectedPattern.toLowerCase();
        if (!matchesPattern) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        return (
          t.title.toLowerCase().includes(q) ||
          t.categoryName.toLowerCase().includes(q) ||
          t.patternName.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [tests, selectedCategory, selectedPattern, searchQuery]);

  const handleCategoryChange = (cat: string) => {
    setSelectedCategory(cat);
    setSelectedPattern("ALL");
    if (cat === "ALL") {
      router.push("/admin/mock-tests");
    } else {
      router.push(`/admin/mock-tests?category=${cat}`);
    }
  };

  const breadcrumbs = [
    { label: "Mock Test Management", href: "/admin/mock-tests-management" },
    { label: "Categories", href: "/admin/categories" },
    ...(activeCategoryObj
      ? [{ label: activeCategoryObj.title, href: `/admin/patterns?category=${activeCategoryObj.slug}` }]
      : []),
    { label: "Patterns", href: activeCategoryObj ? `/admin/patterns?category=${activeCategoryObj.slug}` : "/admin/patterns" },
    ...(activePatternObj
      ? [{ label: activePatternObj.name, href: `/admin/mock-tests?pattern=${activePatternObj.id}` }]
      : []),
    { label: "Mock Tests", active: true },
  ];

  return (
    <div className="space-y-6 max-w-7xl pb-12">
      {/* Breadcrumbs */}
      <AdminBreadcrumbs items={breadcrumbs} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
            <FileCheck2 className="w-6 h-6 text-emerald-600" /> Mock Test Management &amp; Blueprints
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Create full-length exam papers, configure section time allocations, and publish test series.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowBulkImport(true)}
          className="font-bold border-indigo-200 text-indigo-700 hover:bg-indigo-50 shrink-0"
        >
          <FileUp className="w-4 h-4 mr-1.5" /> Bulk Import Mocks
        </Button>
      </div>

      {showBulkImport && (
        <BulkImportModal defaultEntity="mock_tests" onClose={() => setShowBulkImport(false)} />
      )}

      {/* Feedback Alerts */}
      {createState?.error && <Alert variant="error">{createState.error}</Alert>}
      {createState?.message && <Alert variant="success">{createState.message}</Alert>}

      {/* TWO COLUMN WORKSPACE */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: Add New Mock Test Form Card */}
        <div className="lg:col-span-5">
          <Card className="p-6 bg-white border-emerald-200 shadow-sm border-t-4 border-t-emerald-600 space-y-4 sticky top-4">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <PlusCircle className="w-5 h-5 text-emerald-600" />
              <h2 className="text-base font-black text-slate-900">Add New Mock Test</h2>
            </div>

            <form action={createAction} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Target Exam Category <span className="text-rose-500">*</span>
                </label>
                <select
                  name="categoryId"
                  defaultValue={activeCategoryObj ? activeCategoryObj.id : (categories[0]?.id || "")}
                  className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-emerald-500"
                  required
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Target Exam Pattern
                </label>
                <select
                  name="patternId"
                  defaultValue={activePatternObj ? activePatternObj.id : (patterns[0]?.id || "")}
                  className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="">Default Pattern</option>
                  {patterns.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.categoryName})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Mock Test Title <span className="text-rose-500">*</span>
                </label>
                <input
                  name="title"
                  type="text"
                  placeholder="e.g. SSC GD 2026 Full Length Mock Test 01"
                  className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  URL Slug (Optional, auto-generated if blank)
                </label>
                <input
                  name="slug"
                  type="text"
                  placeholder="e.g. ssc-gd-2026-full-mock-01"
                  className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Duration (M)
                  </label>
                  <input
                    name="durationMinutes"
                    type="number"
                    defaultValue={60}
                    className="w-full px-2 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Questions
                  </label>
                  <input
                    name="totalQuestions"
                    type="number"
                    defaultValue={80}
                    className="w-full px-2 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Total Marks
                  </label>
                  <input
                    name="totalMarks"
                    type="number"
                    defaultValue={160}
                    className="w-full px-2 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <Button
                type="submit"
                variant="default"
                disabled={isCreating}
                className="w-full font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm flex items-center justify-center gap-2"
              >
                <PlusCircle className="w-4 h-4" />
                {isCreating ? "Creating Mock Test..." : "Create Mock Test"}
              </Button>
            </form>
          </Card>
        </div>

        {/* RIGHT COLUMN: Existing Mock Tests List */}
        <div className="lg:col-span-7 space-y-4">
          {/* Filter Bar */}
          <Card className="p-4 bg-white border-slate-200 flex flex-col sm:flex-row items-center gap-3">
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search mock tests by title, category, or pattern..."
                className="w-full pl-9 pr-3 py-2 text-xs font-medium rounded-xl border border-slate-200 bg-slate-50/50 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Filter className="w-4 h-4 text-slate-400 shrink-0" />
              <select
                value={selectedCategory}
                onChange={(e) => handleCategoryChange(e.target.value)}
                className="p-2 text-xs font-semibold rounded-lg border border-slate-200 bg-white"
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

          {/* Mock Tests Cards List */}
          {filtered.length === 0 ? (
            <Card className="p-12 text-center bg-white border-slate-200 space-y-2">
              <FileCheck2 className="w-8 h-8 mx-auto text-slate-300" />
              <p className="text-xs text-slate-500 font-medium">No mock test papers found for this selection.</p>
            </Card>
          ) : (
            <div className="space-y-4">
              {filtered.map((mock) => (
                <Card
                  key={mock.id}
                  className="p-5 bg-white border-slate-200 hover:border-emerald-300 transition shadow-xs space-y-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className="text-[11px] font-bold text-emerald-600 tracking-tight block">
                        {mock.categoryName} &bull; {mock.patternName}
                      </span>
                      <h3 className="text-base font-black text-slate-900 leading-tight mt-0.5">
                        {mock.title}
                      </h3>
                      <span className="text-[11px] font-mono text-slate-400 block mt-0.5">
                        Slug: {mock.slug}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <Badge variant={mock.isPublished ? "success" : "neutral"} className="text-[10px] uppercase font-bold">
                        {mock.isPublished ? "PUBLISHED" : "DRAFT"}
                      </Badge>
                      <button
                        onClick={() => setEditingMock(mock)}
                        className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-emerald-600 hover:bg-slate-50 transition"
                        title="Edit Mock Test"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Toggle publish status for "${mock.title}"?`)) {
                            startTransition(async () => {
                              await toggleMockTestPublishAction(mock.id, mock.isPublished);
                            });
                          }
                        }}
                        disabled={isToggling}
                        className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-emerald-600 hover:bg-slate-50 transition"
                        title="Toggle Publish"
                      >
                        <Power className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Specs Grid */}
                  <div className="grid grid-cols-3 gap-2 pt-3 border-t border-slate-100 text-center font-mono">
                    <div className="p-2 rounded-lg bg-slate-50 border border-slate-200">
                      <span className="text-[10px] text-slate-500 font-bold block uppercase">Duration</span>
                      <span className="text-xs font-black text-slate-900">{mock.durationMinutes}m</span>
                    </div>
                    <div className="p-2 rounded-lg bg-slate-50 border border-slate-200">
                      <span className="text-[10px] text-slate-500 font-bold block uppercase">Questions</span>
                      <span className="text-xs font-black text-slate-900">{mock.totalQuestions}</span>
                    </div>
                    <div className="p-2 rounded-lg bg-slate-50 border border-slate-200">
                      <span className="text-[10px] text-slate-500 font-bold block uppercase">Marks</span>
                      <span className="text-xs font-black text-slate-900">{mock.totalMarks}</span>
                    </div>
                  </div>

                  {/* Connected Actions */}
                  <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-1.5">
                    <Link href={`/admin/questions?category=${mock.categorySlug}&pattern=${mock.patternId}`}>
                      <Button variant="outline" size="sm" className="text-xs font-bold text-emerald-700 border-emerald-200 hover:bg-emerald-50">
                        <HelpCircle className="w-3.5 h-3.5 mr-1" /> View Questions
                      </Button>
                    </Link>
                    <Link href={`/admin/sections?pattern=${mock.patternId}&category=${mock.categorySlug}`}>
                      <Button variant="outline" size="sm" className="text-xs font-bold text-teal-700 border-teal-200 hover:bg-teal-50">
                        <Layers className="w-3.5 h-3.5 mr-1" /> Manage Sections
                      </Button>
                    </Link>
                    <Link href={`/mock-tests/${mock.id}/take`} target="_blank">
                      <Button variant="ghost" size="sm" className="text-xs font-bold text-slate-600 hover:text-slate-900">
                        Preview Test Player &rarr;
                      </Button>
                    </Link>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* EDIT MOCK TEST MODAL */}
      {editingMock && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <Card className="w-full max-w-lg p-6 bg-white border-slate-200 shadow-2xl space-y-4 relative">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-emerald-600" /> Edit Mock Test: {editingMock.title}
              </h3>
              <button
                onClick={() => setEditingMock(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {editState?.error && <Alert variant="error">{editState.error}</Alert>}
            {editState?.message && <Alert variant="success">{editState.message}</Alert>}

            <form action={editAction} className="space-y-4">
              <input type="hidden" name="id" value={editingMock.id} />

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Mock Test Title</label>
                <input
                  name="title"
                  type="text"
                  defaultValue={editingMock.title}
                  className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">URL Slug</label>
                <input
                  name="slug"
                  type="text"
                  defaultValue={editingMock.slug}
                  className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Duration (M)</label>
                  <input
                    name="durationMinutes"
                    type="number"
                    defaultValue={editingMock.durationMinutes}
                    className="w-full px-2 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Questions</label>
                  <input
                    name="totalQuestions"
                    type="number"
                    defaultValue={editingMock.totalQuestions}
                    className="w-full px-2 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Marks</label>
                  <input
                    name="totalMarks"
                    type="number"
                    defaultValue={editingMock.totalMarks}
                    className="w-full px-2 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <Button type="button" variant="outline" size="sm" onClick={() => setEditingMock(null)}>
                  Cancel
                </Button>
                <Button type="submit" variant="default" size="sm" disabled={isEditing} className="font-bold bg-emerald-600 hover:bg-emerald-700">
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
