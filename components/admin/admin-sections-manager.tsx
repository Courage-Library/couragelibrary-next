"use client";

import React, { useState, useMemo, useActionState, useTransition } from "react";
import Link from "next/link";
import { AdminSectionItem, AdminPatternItem, AdminCategoryItem } from "@/services/admin.service";
import {
  createSectionAction,
  updateSectionAction,
  toggleSectionStatusAction,
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
  HelpCircle,
  Edit2,
  Power,
  X,
} from "lucide-react";

interface Props {
  sections: AdminSectionItem[];
  patterns: AdminPatternItem[];
  categories: AdminCategoryItem[];
  currentPattern?: string;
  currentCategory?: string;
}

export function AdminSectionsManager({
  sections,
  patterns,
  categories,
  currentPattern,
  currentCategory,
}: Props) {
  // Create Form State
  const [createState, createAction, isCreating] = useActionState(createSectionAction, null);

  // Edit Modal State
  const [editingSection, setEditingSection] = useState<AdminSectionItem | null>(null);
  const [editState, editAction, isEditing] = useActionState(updateSectionAction, null);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState("");
  const [isToggling, startTransition] = useTransition();

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
    if (!searchQuery.trim()) return sections;
    const q = searchQuery.toLowerCase().trim();
    return sections.filter((s) => s.name.toLowerCase().includes(q) || s.slug.toLowerCase().includes(q));
  }, [sections, searchQuery]);

  const breadcrumbs = [
    { label: "Mock Test Management", href: "/admin/mock-tests-management" },
    { label: "Categories", href: "/admin/categories" },
    ...(activeCategoryObj
      ? [{ label: activeCategoryObj.title, href: `/admin/patterns?category=${activeCategoryObj.slug}` }]
      : []),
    { label: "Patterns", href: activeCategoryObj ? `/admin/patterns?category=${activeCategoryObj.slug}` : "/admin/patterns" },
    ...(activePatternObj
      ? [{ label: activePatternObj.name, href: `/admin/sections?pattern=${activePatternObj.id}` }]
      : []),
    { label: "Sections", active: true },
  ];

  return (
    <div className="space-y-6 max-w-7xl pb-12">
      {/* Breadcrumbs */}
      <AdminBreadcrumbs items={breadcrumbs} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
            <Layers className="w-6 h-6 text-teal-600" /> Section &amp; Subject Management
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Manage subject divisions, canonical syllabus topics, marks weightage, and question banks.
          </p>
        </div>
      </div>

      {/* Context Badge if filtered */}
      {(activeCategoryObj || activePatternObj) && (
        <Card className="p-3 bg-teal-50/60 border-teal-200 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold text-teal-900">
            <span className="font-bold">Active Context:</span>
            {activeCategoryObj && <Badge variant="neutral" className="text-[10px]">{activeCategoryObj.title}</Badge>}
            {activePatternObj && <Badge variant="indigo" className="text-[10px]">{activePatternObj.name}</Badge>}
          </div>
          <Link href="/admin/sections">
            <Button variant="ghost" size="sm" className="text-[11px] font-bold text-teal-700 h-7">
              Clear Context
            </Button>
          </Link>
        </Card>
      )}

      {/* Feedback Alerts */}
      {createState?.error && <Alert variant="error">{createState.error}</Alert>}
      {createState?.message && <Alert variant="success">{createState.message}</Alert>}

      {/* TWO COLUMN WORKSPACE */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: Add New Section Form Card */}
        <div className="lg:col-span-5">
          <Card className="p-6 bg-white border-teal-200 shadow-sm border-t-4 border-t-teal-600 space-y-4 sticky top-4">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <PlusCircle className="w-5 h-5 text-teal-600" />
              <h2 className="text-base font-black text-slate-900">Add New Section</h2>
            </div>

            <form action={createAction} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Section Name <span className="text-rose-500">*</span>
                </label>
                <input
                  name="name"
                  type="text"
                  placeholder="e.g. General Awareness or English"
                  className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:border-teal-500"
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
                  placeholder="e.g. general-awareness"
                  className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:border-teal-500"
                />
              </div>

              <Button
                type="submit"
                variant="default"
                disabled={isCreating}
                className="w-full font-bold bg-teal-600 hover:bg-teal-700 text-white shadow-sm flex items-center justify-center gap-2"
              >
                <PlusCircle className="w-4 h-4" />
                {isCreating ? "Creating Section..." : "Create Section"}
              </Button>
            </form>
          </Card>
        </div>

        {/* RIGHT COLUMN: Existing Sections List */}
        <div className="lg:col-span-7 space-y-4">
          {/* Search Bar */}
          <Card className="p-4 bg-white border-slate-200 flex items-center justify-between gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search sections by name or slug..."
                className="w-full pl-9 pr-3 py-2 text-xs font-medium rounded-xl border border-slate-200 bg-slate-50/50 focus:outline-none focus:border-teal-500"
              />
            </div>
            <span className="text-xs font-bold text-slate-500 font-mono shrink-0">
              Showing {filtered.length} of {sections.length} Sections
            </span>
          </Card>

          {/* Section Cards List */}
          {filtered.length === 0 ? (
            <Card className="p-12 text-center bg-white border-slate-200 space-y-2">
              <Layers className="w-8 h-8 mx-auto text-slate-300" />
              <p className="text-xs text-slate-500 font-medium">No sections found.</p>
            </Card>
          ) : (
            <div className="space-y-4">
              {filtered.map((section) => {
                const categoryParam = activeCategoryObj?.slug || currentCategory || "";
                const patternParam = activePatternObj?.id || currentPattern || "";
                const questionUrl = `/admin/questions?section=${encodeURIComponent(section.name)}${categoryParam ? `&category=${categoryParam}` : ""}${patternParam ? `&pattern=${patternParam}` : ""}`;

                return (
                  <Card
                    key={section.id}
                    className="p-5 bg-white border-slate-200 hover:border-teal-300 transition shadow-xs space-y-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-base font-black text-slate-900 leading-tight">
                          {section.name}
                        </h3>
                        <span className="text-[11px] font-mono text-slate-400 block mt-0.5">
                          Slug: {section.slug}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <Badge variant={section.isActive ? "success" : "neutral"} className="text-[10px] uppercase font-bold">
                          {section.isActive ? "ACTIVE" : "INACTIVE"}
                        </Badge>
                        <button
                          onClick={() => setEditingSection(section)}
                          className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-teal-600 hover:bg-slate-50 transition"
                          title="Edit Section"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`Are you sure you want to ${section.isActive ? "deactivate" : "activate"} "${section.name}"?`)) {
                              startTransition(async () => {
                                await toggleSectionStatusAction(section.id, section.isActive);
                              });
                            }
                          }}
                          disabled={isToggling}
                          className={`p-1.5 rounded-lg border ${
                            section.isActive
                              ? "border-amber-200 text-amber-600 hover:bg-amber-50"
                              : "border-emerald-200 text-emerald-600 hover:bg-emerald-50"
                          } transition`}
                          title={section.isActive ? "Deactivate" : "Activate"}
                        >
                          <Power className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Metrics */}
                    <div className="grid grid-cols-2 gap-2 pt-3 border-t border-slate-100 text-center font-mono">
                      <div className="p-2 rounded-lg bg-teal-50/60 border border-teal-100">
                        <span className="text-[10px] text-teal-700 font-bold block uppercase">Topics</span>
                        <span className="text-base font-black text-teal-900">{section.topicsCount}</span>
                      </div>
                      <div className="p-2 rounded-lg bg-emerald-50/60 border border-emerald-100">
                        <span className="text-[10px] text-emerald-700 font-bold block uppercase">Questions</span>
                        <span className="text-base font-black text-emerald-900">{section.questionCount}</span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                      <Link href={questionUrl} className="w-full">
                        <Button variant="outline" size="sm" className="w-full text-xs font-bold text-emerald-700 border-emerald-200 hover:bg-emerald-50">
                          <HelpCircle className="w-3.5 h-3.5 mr-1" /> Manage Questions
                        </Button>
                      </Link>
                    </div>
                  </Card>
                );
              })}
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
                  className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-teal-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">URL Slug</label>
                <input
                  name="slug"
                  type="text"
                  defaultValue={editingSection.slug}
                  className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-teal-500"
                  required
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
