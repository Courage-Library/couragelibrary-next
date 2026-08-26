"use client";

import React, { useState, useMemo, useActionState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AdminPatternItem, AdminCategoryItem } from "@/services/admin.service";
import {
  createPatternAction,
  updatePatternAction,
  togglePatternStatusAction,
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
  Filter,
  Edit2,
  Power,
  X,
} from "lucide-react";

interface Props {
  patterns: AdminPatternItem[];
  categories: AdminCategoryItem[];
  currentCategory?: string;
}

export function AdminPatternsManager({ patterns, categories, currentCategory }: Props) {
  const router = useRouter();

  // Create Form State
  const [createState, createAction, isCreating] = useActionState(createPatternAction, null);

  // Edit Modal State
  const [editingPattern, setEditingPattern] = useState<AdminPatternItem | null>(null);
  const [editState, editAction, isEditing] = useActionState(updatePatternAction, null);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState(currentCategory || "ALL");
  const [isToggling, startTransition] = useTransition();

  const activeCategoryObj = useMemo(() => {
    if (!currentCategory || currentCategory === "ALL") return null;
    return categories.find((c) => c.slug === currentCategory || c.id === currentCategory);
  }, [categories, currentCategory]);

  const filtered = useMemo(() => {
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

  const handleCategoryChange = (cat: string) => {
    setSelectedCategory(cat);
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
    <div className="space-y-6 max-w-7xl pb-12">
      {/* Breadcrumbs */}
      <AdminBreadcrumbs items={breadcrumbs} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
            <GitBranch className="w-6 h-6 text-indigo-600" /> Pattern Management &amp; Blueprints
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Configure exam structure, tier specifications, marks distribution, and section mappings.
          </p>
        </div>
      </div>

      {/* Feedback Alerts */}
      {createState?.error && <Alert variant="error">{createState.error}</Alert>}
      {createState?.message && <Alert variant="success">{createState.message}</Alert>}

      {/* TWO COLUMN WORKSPACE */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: Create Pattern Form Card */}
        <div className="lg:col-span-5">
          <Card className="p-6 bg-white border-indigo-200 shadow-sm border-t-4 border-t-indigo-600 space-y-4 sticky top-4">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <PlusCircle className="w-5 h-5 text-indigo-600" />
              <h2 className="text-base font-black text-slate-900">Add New Pattern</h2>
            </div>

            <form action={createAction} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Parent Exam Category <span className="text-rose-500">*</span>
                </label>
                <select
                  name="categoryId"
                  defaultValue={activeCategoryObj ? activeCategoryObj.id : (categories[0]?.id || "")}
                  className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-indigo-500"
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
                  Pattern Name <span className="text-rose-500">*</span>
                </label>
                <input
                  name="name"
                  type="text"
                  placeholder="e.g. SSC GD - Mixed Sectional"
                  className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Tier / Exam Stage
                </label>
                <input
                  name="tierName"
                  type="text"
                  defaultValue="Tier 1 (CBE)"
                  className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Duration (Minutes)
                  </label>
                  <input
                    name="durationMinutes"
                    type="number"
                    defaultValue={60}
                    className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Total Questions
                  </label>
                  <input
                    name="totalQuestions"
                    type="number"
                    defaultValue={100}
                    className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Total Marks
                  </label>
                  <input
                    name="totalMarks"
                    type="number"
                    defaultValue={200}
                    className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Negative Marking
                  </label>
                  <input
                    name="negativeMarkValue"
                    type="number"
                    step="0.25"
                    defaultValue={0.5}
                    className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <Button
                type="submit"
                variant="default"
                disabled={isCreating}
                className="w-full font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm flex items-center justify-center gap-2"
              >
                <PlusCircle className="w-4 h-4" />
                {isCreating ? "Creating Pattern..." : "Create Pattern"}
              </Button>
            </form>
          </Card>
        </div>

        {/* RIGHT COLUMN: Existing Patterns List */}
        <div className="lg:col-span-7 space-y-4">
          {/* Filter Bar */}
          <Card className="p-4 bg-white border-slate-200 flex flex-col sm:flex-row items-center gap-3">
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search patterns by name or tier..."
                className="w-full pl-9 pr-3 py-2 text-xs font-medium rounded-xl border border-slate-200 bg-slate-50/50 focus:outline-none focus:border-indigo-500"
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

          {/* Pattern Cards List */}
          {filtered.length === 0 ? (
            <Card className="p-12 text-center bg-white border-slate-200 space-y-2">
              <GitBranch className="w-8 h-8 mx-auto text-slate-300" />
              <p className="text-xs text-slate-500 font-medium">No patterns found for the selected category.</p>
            </Card>
          ) : (
            <div className="space-y-4">
              {filtered.map((pattern) => (
                <Card
                  key={pattern.id}
                  className="p-5 bg-white border-slate-200 hover:border-indigo-300 transition shadow-xs space-y-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className="text-[11px] font-bold text-indigo-600 tracking-tight block">
                        {pattern.categoryName}
                      </span>
                      <h3 className="text-base font-black text-slate-900 leading-tight mt-0.5">
                        {pattern.name}
                      </h3>
                      {pattern.tierName && (
                        <span className="text-[11px] font-medium text-slate-500 block">
                          Tier: {pattern.tierName}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <Badge variant={pattern.isActive ? "success" : "neutral"} className="text-[10px] uppercase font-bold">
                        {pattern.isActive ? "ACTIVE" : "DRAFT"}
                      </Badge>
                      <button
                        onClick={() => setEditingPattern(pattern)}
                        className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-indigo-600 hover:bg-slate-50 transition"
                        title="Edit Pattern"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Are you sure you want to ${pattern.isActive ? "deactivate" : "activate"} "${pattern.name}"?`)) {
                            startTransition(async () => {
                              await togglePatternStatusAction(pattern.id, pattern.isActive);
                            });
                          }
                        }}
                        disabled={isToggling}
                        className={`p-1.5 rounded-lg border ${
                          pattern.isActive
                            ? "border-amber-200 text-amber-600 hover:bg-amber-50"
                            : "border-emerald-200 text-emerald-600 hover:bg-emerald-50"
                        } transition`}
                        title={pattern.isActive ? "Deactivate" : "Activate"}
                      >
                        <Power className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Pattern Specifications */}
                  <div className="grid grid-cols-4 gap-2 pt-3 border-t border-slate-100 text-center font-mono">
                    <div className="p-2 rounded-lg bg-slate-50 border border-slate-200">
                      <span className="text-[10px] text-slate-500 font-bold block uppercase">Duration</span>
                      <span className="text-xs font-black text-slate-900">{pattern.durationMinutes}m</span>
                    </div>
                    <div className="p-2 rounded-lg bg-slate-50 border border-slate-200">
                      <span className="text-[10px] text-slate-500 font-bold block uppercase">Questions</span>
                      <span className="text-xs font-black text-slate-900">{pattern.totalQuestions}</span>
                    </div>
                    <div className="p-2 rounded-lg bg-slate-50 border border-slate-200">
                      <span className="text-[10px] text-slate-500 font-bold block uppercase">Marks</span>
                      <span className="text-xs font-black text-slate-900">{pattern.totalMarks}</span>
                    </div>
                    <div className="p-2 rounded-lg bg-slate-50 border border-slate-200">
                      <span className="text-[10px] text-slate-500 font-bold block uppercase">Negative</span>
                      <span className="text-xs font-black text-rose-700">-{pattern.negativeMarkValue}</span>
                    </div>
                  </div>

                  {/* Connected Action Links */}
                  <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-1.5">
                    <Link href={`/admin/sections?pattern=${pattern.id}&category=${pattern.categorySlug}`}>
                      <Button variant="outline" size="sm" className="text-xs font-bold text-teal-700 border-teal-200 hover:bg-teal-50">
                        <Layers className="w-3.5 h-3.5 mr-1" /> Manage Sections
                      </Button>
                    </Link>
                    <Link href={`/admin/questions?pattern=${pattern.id}&category=${pattern.categorySlug}`}>
                      <Button variant="outline" size="sm" className="text-xs font-bold text-emerald-700 border-emerald-200 hover:bg-emerald-50">
                        <HelpCircle className="w-3.5 h-3.5 mr-1" /> View Questions
                      </Button>
                    </Link>
                    <Link href={`/admin/mock-tests?pattern=${pattern.id}&category=${pattern.categorySlug}`}>
                      <Button variant="outline" size="sm" className="text-xs font-bold text-blue-700 border-blue-200 hover:bg-blue-50">
                        <FileCheck2 className="w-3.5 h-3.5 mr-1" /> Manage Mock Tests
                      </Button>
                    </Link>
                  </div>
                </Card>
              ))}
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
                  className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Tier / Stage</label>
                <input
                  name="tierName"
                  type="text"
                  defaultValue={editingPattern.tierName || ""}
                  className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Duration (Mins)</label>
                  <input
                    name="durationMinutes"
                    type="number"
                    defaultValue={editingPattern.durationMinutes}
                    className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Total Questions</label>
                  <input
                    name="totalQuestions"
                    type="number"
                    defaultValue={editingPattern.totalQuestions}
                    className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-indigo-500"
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
                    className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Negative Marking</label>
                  <input
                    name="negativeMarkValue"
                    type="number"
                    step="0.25"
                    defaultValue={editingPattern.negativeMarkValue}
                    className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-indigo-500"
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
