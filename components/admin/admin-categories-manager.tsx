"use client";

import React, { useState, useMemo, useActionState, useTransition } from "react";
import Link from "next/link";
import { AdminCategoryItem } from "@/services/admin.service";
import {
  createCategoryAction,
  updateCategoryAction,
  toggleCategoryStatusAction,
} from "@/app/admin/actions";
import { AdminBreadcrumbs } from "@/components/admin/admin-breadcrumbs";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import {
  Layers,
  Search,
  PlusCircle,
  GitBranch,
  Calendar,
  HelpCircle,
  FileCheck2,
  Edit2,
  Power,
  X,
} from "lucide-react";

interface Props {
  categories: AdminCategoryItem[];
}

export function AdminCategoriesManager({ categories }: Props) {
  // Create Form State
  const [createState, createAction, isCreating] = useActionState(createCategoryAction, null);

  // Edit Modal State
  const [editingCategory, setEditingCategory] = useState<AdminCategoryItem | null>(null);
  const [editState, editAction, isEditing] = useActionState(updateCategoryAction, null);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState("");
  const [isToggling, startTransition] = useTransition();

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return categories;
    const q = searchQuery.toLowerCase().trim();
    return categories.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.slug.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q) ||
        (c.description && c.description.toLowerCase().includes(q))
    );
  }, [categories, searchQuery]);

  return (
    <div className="space-y-4 w-full pb-8">
      {/* Breadcrumb Bar */}
      <AdminBreadcrumbs
        items={[
          { label: "Mock Test Management", href: "/admin/mock-tests-management" },
          { label: "Categories", active: true },
        ]}
      />

      {/* Page Heading matching legacy control panel */}
      <div className="text-left space-y-1">
        <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
          <Layers className="w-6 h-6 text-blue-600" /> Mock Test Control Panel &mdash; Exam Categories
        </h1>
        <p className="text-xs text-slate-500 font-medium">
          Manage root examination categories powering Patterns, Sections, Questions, Schedules, and Mock Tests.
        </p>
      </div>

      {/* Feedback Alerts */}
      {createState?.error && <Alert variant="error">{createState.error}</Alert>}
      {createState?.message && <Alert variant="success">{createState.message}</Alert>}

      {/* TWO COLUMN WORKSPACE (Inspired by legacy categories.html) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: Add New Exam Category Form Card */}
        <div className="lg:col-span-5">
          <Card className="p-6 bg-white border-blue-200 shadow-sm border-t-4 border-t-blue-600 space-y-4 sticky top-4">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <PlusCircle className="w-5 h-5 text-blue-600" />
              <h2 className="text-base font-black text-slate-900">Add New Exam Category</h2>
            </div>

            <form action={createAction} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Category / Exam Title <span className="text-rose-500">*</span>
                </label>
                <input
                  name="title"
                  type="text"
                  placeholder="e.g. SSC CGL or UP Police Constable"
                  className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:border-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Conducting Board / Group
                </label>
                <select
                  name="category"
                  defaultValue="Staff Selection Commission (SSC)"
                  className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-blue-500"
                >
                  <option value="Staff Selection Commission (SSC)">Staff Selection Commission (SSC)</option>
                  <option value="State Police Recruitment">State Police Recruitment</option>
                  <option value="Defence (Army / Navy / Air Force)">Defence (Army / Navy / Air Force)</option>
                  <option value="Railway Recruitment Board (RRB)">Railway Recruitment Board (RRB)</option>
                  <option value="Banking &amp; Insurance">Banking &amp; Insurance</option>
                  <option value="Teaching &amp; State PSC">Teaching &amp; State PSC</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  URL Slug (Optional, auto-generated if blank)
                </label>
                <input
                  name="slug"
                  type="text"
                  placeholder="e.g. ssc-cgl"
                  className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Description
                </label>
                <textarea
                  name="description"
                  rows={3}
                  placeholder="Brief overview of the syllabus and eligibility requirements"
                  className="w-full px-3 py-2 text-xs font-medium rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <Button
                type="submit"
                variant="default"
                disabled={isCreating}
                className="w-full font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-sm flex items-center justify-center gap-2"
              >
                <PlusCircle className="w-4 h-4" />
                {isCreating ? "Creating Category..." : "Create Category"}
              </Button>
            </form>
          </Card>
        </div>

        {/* RIGHT COLUMN: Existing Categories List */}
        <div className="lg:col-span-7 space-y-4">
          {/* Search & Counter Header */}
          <Card className="p-4 bg-white border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search categories by title, slug, or board..."
                className="w-full pl-9 pr-3 py-2 text-xs font-medium rounded-xl border border-slate-200 bg-slate-50/50 focus:outline-none focus:border-blue-500"
              />
            </div>
            <span className="text-xs font-bold text-slate-500 font-mono shrink-0">
              Showing {filtered.length} of {categories.length} Categories
            </span>
          </Card>

          {/* Cards List */}
          {filtered.length === 0 ? (
            <Card className="p-12 text-center bg-white border-slate-200 space-y-2">
              <Layers className="w-8 h-8 mx-auto text-slate-300" />
              <p className="text-xs text-slate-500 font-medium">No exam categories match the search.</p>
            </Card>
          ) : (
            <div className="space-y-4">
              {filtered.map((cat) => (
                <Card
                  key={cat.id}
                  className="p-5 bg-white border-slate-200 hover:border-blue-300 transition shadow-xs space-y-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-black text-slate-900 leading-tight">
                          {cat.title}
                        </h3>
                        <Badge variant="outline" className="text-[10px] font-mono">
                          {cat.category}
                        </Badge>
                      </div>
                      <span className="text-[11px] font-mono text-slate-400 block mt-0.5">
                        Slug: {cat.slug}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <Badge variant={cat.isActive ? "success" : "neutral"} className="text-[10px] font-bold uppercase">
                        {cat.isActive ? "ACTIVE" : "DRAFT"}
                      </Badge>
                      <button
                        onClick={() => setEditingCategory(cat)}
                        className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-blue-600 hover:bg-slate-50 transition"
                        title="Edit Category"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Are you sure you want to ${cat.isActive ? "deactivate" : "activate"} "${cat.title}"?`)) {
                            startTransition(async () => {
                              await toggleCategoryStatusAction(cat.id, cat.isActive);
                            });
                          }
                        }}
                        disabled={isToggling}
                        className={`p-1.5 rounded-lg border ${
                          cat.isActive
                            ? "border-amber-200 text-amber-600 hover:bg-amber-50"
                            : "border-emerald-200 text-emerald-600 hover:bg-emerald-50"
                        } transition`}
                        title={cat.isActive ? "Deactivate" : "Activate"}
                      >
                        <Power className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {cat.description && (
                    <p className="text-xs text-slate-600 font-medium line-clamp-2">
                      {cat.description}
                    </p>
                  )}

                  {/* Connected Entity Metrics */}
                  <div className="grid grid-cols-4 gap-2 pt-3 border-t border-slate-100 text-center font-mono">
                    <div className="p-2 rounded-lg bg-blue-50/60 border border-blue-100">
                      <span className="text-[10px] text-blue-700 font-bold block uppercase">Patterns</span>
                      <span className="text-sm font-black text-blue-900">{cat.patternsCount}</span>
                    </div>
                    <div className="p-2 rounded-lg bg-emerald-50/60 border border-emerald-100">
                      <span className="text-[10px] text-emerald-700 font-bold block uppercase">Questions</span>
                      <span className="text-sm font-black text-emerald-900">{cat.questionsCount}</span>
                    </div>
                    <div className="p-2 rounded-lg bg-purple-50/60 border border-purple-100">
                      <span className="text-[10px] text-purple-700 font-bold block uppercase">Schedules</span>
                      <span className="text-sm font-black text-purple-900">{cat.schedulesCount}</span>
                    </div>
                    <div className="p-2 rounded-lg bg-amber-50/60 border border-amber-100">
                      <span className="text-[10px] text-amber-700 font-bold block uppercase">Mocks</span>
                      <span className="text-sm font-black text-amber-900">{cat.mockTestsCount}</span>
                    </div>
                  </div>

                  {/* Connected Action Links */}
                  <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-1.5">
                    <Link href={`/admin/patterns?category=${cat.slug}`}>
                      <Button variant="outline" size="sm" className="text-xs font-bold text-blue-700 border-blue-200 hover:bg-blue-50">
                        <GitBranch className="w-3.5 h-3.5 mr-1" /> Manage Patterns
                      </Button>
                    </Link>
                    <Link href={`/admin/schedules?category=${cat.slug}`}>
                      <Button variant="outline" size="sm" className="text-xs font-bold text-purple-700 border-purple-200 hover:bg-purple-50">
                        <Calendar className="w-3.5 h-3.5 mr-1" /> Manage Schedules
                      </Button>
                    </Link>
                    <Link href={`/admin/questions?category=${cat.slug}`}>
                      <Button variant="outline" size="sm" className="text-xs font-bold text-emerald-700 border-emerald-200 hover:bg-emerald-50">
                        <HelpCircle className="w-3.5 h-3.5 mr-1" /> View Questions
                      </Button>
                    </Link>
                    <Link href={`/admin/mock-tests?category=${cat.slug}`}>
                      <Button variant="ghost" size="sm" className="text-xs font-bold text-slate-600 hover:text-slate-900">
                        <FileCheck2 className="w-3.5 h-3.5 mr-1" /> Mocks
                      </Button>
                    </Link>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* EDIT CATEGORY MODAL */}
      {editingCategory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <Card className="w-full max-w-lg p-6 bg-white border-slate-200 shadow-2xl space-y-4 relative">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-blue-600" /> Edit Category: {editingCategory.title}
              </h3>
              <button
                onClick={() => setEditingCategory(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {editState?.error && <Alert variant="error">{editState.error}</Alert>}
            {editState?.message && <Alert variant="success">{editState.message}</Alert>}

            <form action={editAction} className="space-y-4">
              <input type="hidden" name="id" value={editingCategory.id} />

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Category Title</label>
                <input
                  name="title"
                  type="text"
                  defaultValue={editingCategory.title}
                  className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Conducting Board</label>
                <input
                  name="category"
                  type="text"
                  defaultValue={editingCategory.category}
                  className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Description</label>
                <textarea
                  name="description"
                  rows={3}
                  defaultValue={editingCategory.description || ""}
                  className="w-full px-3 py-2 text-xs font-medium rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <Button type="button" variant="outline" size="sm" onClick={() => setEditingCategory(null)}>
                  Cancel
                </Button>
                <Button type="submit" variant="default" size="sm" disabled={isEditing} className="font-bold bg-blue-600 hover:bg-blue-700">
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
