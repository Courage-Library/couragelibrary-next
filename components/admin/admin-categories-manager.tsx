"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { AdminCategoryItem } from "@/services/admin.service";
import { AdminBreadcrumbs } from "@/components/admin/admin-breadcrumbs";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Layers,
  Search,
  GitBranch,
  Calendar,
  HelpCircle,
  FileCheck2,
} from "lucide-react";

interface Props {
  categories: AdminCategoryItem[];
}

export function AdminCategoriesManager({ categories }: Props) {
  const [searchQuery, setSearchQuery] = useState("");

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return categories;
    const q = searchQuery.toLowerCase().trim();
    return categories.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.slug.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q)
    );
  }, [categories, searchQuery]);

  return (
    <div className="space-y-6 max-w-7xl pb-12">
      {/* Breadcrumb Bar */}
      <AdminBreadcrumbs items={[{ label: "Categories (Exams)", active: true }]} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
            <Layers className="w-6 h-6 text-blue-600" /> Category &amp; Exam Management
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Root content categories powering Patterns, Sections, Questions, Schedules, and Mock Tests.
          </p>
        </div>
      </div>

      {/* Search Bar */}
      <Card className="p-4 bg-white border-slate-200 flex items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search categories by title, slug, or board..."
            className="w-full pl-9 pr-3 py-2 text-xs font-medium rounded-xl border border-slate-200 bg-slate-50/50 focus:outline-hidden focus:border-blue-500"
          />
        </div>
        <span className="text-xs font-bold text-slate-500 font-mono">
          {filtered.length} Categor{filtered.length === 1 ? "y" : "ies"}
        </span>
      </Card>

      {/* Categories Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.map((cat) => (
          <Card
            key={cat.id}
            className="p-5 bg-white border-slate-200 hover:border-blue-300 transition shadow-xs flex flex-col justify-between space-y-4"
          >
            <div>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-base font-black text-slate-900 leading-tight">
                    {cat.title}
                  </h3>
                  <span className="text-[11px] font-mono text-slate-400 block mt-0.5">
                    Slug: {cat.slug}
                  </span>
                </div>
                <Badge variant={cat.isActive ? "success" : "neutral"} className="text-[10px] uppercase font-bold">
                  {cat.isActive ? "ACTIVE" : "DRAFT"}
                </Badge>
              </div>

              {cat.description && (
                <p className="text-xs text-slate-600 font-medium mt-2 line-clamp-2">
                  {cat.description}
                </p>
              )}

              {/* Connected Entity Metrics */}
              <div className="grid grid-cols-4 gap-2 mt-4 pt-3 border-t border-slate-100 text-center font-mono">
                <div className="p-2 rounded-lg bg-blue-50/60 border border-blue-100">
                  <span className="text-[10px] text-blue-700 font-bold block uppercase">Patterns</span>
                  <span className="text-base font-black text-blue-900">{cat.patternsCount}</span>
                </div>
                <div className="p-2 rounded-lg bg-emerald-50/60 border border-emerald-100">
                  <span className="text-[10px] text-emerald-700 font-bold block uppercase">Questions</span>
                  <span className="text-base font-black text-emerald-900">{cat.questionsCount}</span>
                </div>
                <div className="p-2 rounded-lg bg-purple-50/60 border border-purple-100">
                  <span className="text-[10px] text-purple-700 font-bold block uppercase">Schedules</span>
                  <span className="text-base font-black text-purple-900">{cat.schedulesCount}</span>
                </div>
                <div className="p-2 rounded-lg bg-amber-50/60 border border-amber-100">
                  <span className="text-[10px] text-amber-700 font-bold block uppercase">Mocks</span>
                  <span className="text-base font-black text-amber-900">{cat.mockTestsCount}</span>
                </div>
              </div>
            </div>

            {/* Connected Action Links */}
            <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center gap-1.5">
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
    </div>
  );
}
