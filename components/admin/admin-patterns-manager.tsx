"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AdminPatternItem, AdminCategoryItem } from "@/services/admin.service";
import { AdminBreadcrumbs } from "@/components/admin/admin-breadcrumbs";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  GitBranch,
  Search,
  Layers,
  HelpCircle,
  FileCheck2,
  Filter,
} from "lucide-react";

interface Props {
  patterns: AdminPatternItem[];
  categories: AdminCategoryItem[];
  currentCategory?: string;
}

export function AdminPatternsManager({ patterns, categories, currentCategory }: Props) {
  const router = useRouter();
  const [selectedCategory, setSelectedCategory] = useState(currentCategory || "ALL");
  const [searchQuery, setSearchQuery] = useState("");

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
            <GitBranch className="w-6 h-6 text-indigo-600" /> Pattern Management
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Blueprint structures defining exam duration, marks, negative marking, and sections.
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <Card className="p-4 bg-white border-slate-200 flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search patterns by name or tier..."
            className="w-full pl-9 pr-3 py-2 text-xs font-medium rounded-xl border border-slate-200 bg-slate-50/50 focus:outline-hidden focus:border-indigo-500"
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

      {/* Pattern Cards Grid */}
      {filtered.length === 0 ? (
        <Card className="p-12 text-center bg-white border-slate-200 space-y-2">
          <GitBranch className="w-8 h-8 mx-auto text-slate-300" />
          <p className="text-xs text-slate-500 font-medium">No patterns found for the selected category.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((pattern) => (
            <Card
              key={pattern.id}
              className="p-5 bg-white border-slate-200 hover:border-indigo-300 transition shadow-xs flex flex-col justify-between space-y-4"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
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
                  <Badge variant={pattern.isActive ? "success" : "neutral"} className="text-[10px] uppercase font-bold">
                    {pattern.isActive ? "ACTIVE" : "DRAFT"}
                  </Badge>
                </div>

                {/* Pattern Specifications */}
                <div className="grid grid-cols-4 gap-2 mt-4 pt-3 border-t border-slate-100 text-center font-mono">
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
              </div>

              {/* Connected Action Links */}
              <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center gap-1.5">
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
  );
}
