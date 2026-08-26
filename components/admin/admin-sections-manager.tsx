"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { AdminSectionItem, AdminPatternItem, AdminCategoryItem } from "@/services/admin.service";
import { AdminBreadcrumbs } from "@/components/admin/admin-breadcrumbs";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Layers,
  Search,
  HelpCircle,
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
  const [searchQuery, setSearchQuery] = useState("");

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
            <Layers className="w-6 h-6 text-teal-600" /> Section Management
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Subject &amp; Section divisions configured for exam syllabus and pattern structures.
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

      {/* Search Bar */}
      <Card className="p-4 bg-white border-slate-200 flex items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search sections by name or slug..."
            className="w-full pl-9 pr-3 py-2 text-xs font-medium rounded-xl border border-slate-200 bg-slate-50/50 focus:outline-hidden focus:border-teal-500"
          />
        </div>
        <span className="text-xs font-bold text-slate-500 font-mono">
          {filtered.length} Section{filtered.length === 1 ? "" : "s"}
        </span>
      </Card>

      {/* Section Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((section) => {
          const categoryParam = activeCategoryObj?.slug || currentCategory || "";
          const patternParam = activePatternObj?.id || currentPattern || "";
          const questionUrl = `/admin/questions?section=${encodeURIComponent(section.name)}${categoryParam ? `&category=${categoryParam}` : ""}${patternParam ? `&pattern=${patternParam}` : ""}`;

          return (
            <Card
              key={section.id}
              className="p-5 bg-white border-slate-200 hover:border-teal-300 transition shadow-xs flex flex-col justify-between space-y-4"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-base font-black text-slate-900 leading-tight">
                      {section.name}
                    </h3>
                    <span className="text-[11px] font-mono text-slate-400 block mt-0.5">
                      Slug: {section.slug}
                    </span>
                  </div>
                  <Badge variant={section.isActive ? "success" : "neutral"} className="text-[10px] uppercase font-bold">
                    {section.isActive ? "ACTIVE" : "INACTIVE"}
                  </Badge>
                </div>

                {/* Metrics */}
                <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-slate-100 text-center font-mono">
                  <div className="p-2 rounded-lg bg-teal-50/60 border border-teal-100">
                    <span className="text-[10px] text-teal-700 font-bold block uppercase">Topics</span>
                    <span className="text-base font-black text-teal-900">{section.topicsCount}</span>
                  </div>
                  <div className="p-2 rounded-lg bg-emerald-50/60 border border-emerald-100">
                    <span className="text-[10px] text-emerald-700 font-bold block uppercase">Questions</span>
                    <span className="text-base font-black text-emerald-900">{section.questionCount}</span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
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
    </div>
  );
}
