"use client";

import React, { useState, useMemo, useActionState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createMockTestAction } from "@/app/admin/actions";
import { AdminCategoryItem, AdminPatternItem } from "@/services/admin.service";
import { AdminBreadcrumbs } from "@/components/admin/admin-breadcrumbs";
import { BulkImportModal } from "@/components/admin/bulk-import-modal";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import {
  FileCheck2,
  Plus,
  FileUp,
  Sparkles,
  Search,
  Filter,
  HelpCircle,
  Layers,
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
  const [showCreate, setShowCreate] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [state, formAction, isPending] = useActionState(createMockTestAction, null);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState(currentCategory || "ALL");
  const [selectedPattern, setSelectedPattern] = useState(currentPattern || "ALL");

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
            Full-length mock test papers mapped to Category &rarr; Pattern &rarr; Sections &rarr; Questions.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowBulkImport(true)}
            className="font-bold border-indigo-200 text-indigo-700 hover:bg-indigo-50"
          >
            <FileUp className="w-4 h-4 mr-1.5" /> Bulk Import Mocks
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={() => setShowCreate(!showCreate)}
            className="font-bold bg-emerald-600 hover:bg-emerald-700 shadow-xs"
          >
            <Plus className="w-4 h-4 mr-1.5" /> Create Mock Test
          </Button>
        </div>
      </div>

      {showCreate && (
        <Card className="p-5 border-emerald-200 bg-emerald-50/30 space-y-4">
          <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-emerald-600" /> Create Mock Test Paper Blueprint
          </h3>
          {state?.error && <Alert variant="error">{state.error}</Alert>}
          {state?.message && <Alert variant="success">{state.message}</Alert>}

          <form action={formAction} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Input label="Mock Test Title" name="title" placeholder="e.g. SSC GD Full Mock Test 01" required />
              <Input label="URL Slug" name="slug" placeholder="ssc-gd-full-mock-01" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Duration (Minutes)</label>
                <input
                  type="number"
                  name="durationMinutes"
                  defaultValue={60}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Total Marks</label>
                <input
                  type="number"
                  name="totalMarks"
                  defaultValue={160}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold bg-white"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setShowCreate(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="default" size="sm" isLoading={isPending} className="font-bold">
                Save &amp; Publish Test
              </Button>
            </div>
          </form>
        </Card>
      )}

      {showBulkImport && (
        <BulkImportModal defaultEntity="mock_tests" onClose={() => setShowBulkImport(false)} />
      )}

      {/* Filter Bar */}
      <Card className="p-4 bg-white border-slate-200 flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search mock tests by title, category, or pattern..."
            className="w-full pl-9 pr-3 py-2 text-xs font-medium rounded-xl border border-slate-200 bg-slate-50/50 focus:outline-hidden focus:border-emerald-500"
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

      {/* Mock Tests Cards Grid */}
      {filtered.length === 0 ? (
        <Card className="p-12 text-center bg-white border-slate-200 space-y-2">
          <FileCheck2 className="w-8 h-8 mx-auto text-slate-300" />
          <p className="text-xs text-slate-500 font-medium">No mock test papers found for this selection.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((mock) => (
            <Card
              key={mock.id}
              className="p-5 bg-white border-slate-200 hover:border-emerald-300 transition shadow-xs flex flex-col justify-between space-y-4"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
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
                  <Badge variant={mock.isPublished ? "success" : "neutral"} className="text-[10px] uppercase font-bold">
                    {mock.isPublished ? "PUBLISHED" : "DRAFT"}
                  </Badge>
                </div>

                {/* Specs Grid */}
                <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-slate-100 text-center font-mono">
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
              </div>

              {/* Connected Actions */}
              <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center gap-1.5">
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
  );
}
