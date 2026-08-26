"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AdminScheduleItem, AdminCategoryItem } from "@/services/admin.service";
import { AdminBreadcrumbs } from "@/components/admin/admin-breadcrumbs";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Calendar,
  Search,
  GitBranch,
  FileCheck2,
  HelpCircle,
  Filter,
} from "lucide-react";

interface Props {
  schedules: AdminScheduleItem[];
  categories: AdminCategoryItem[];
  currentCategory?: string;
}

export function AdminSchedulesManager({ schedules, categories, currentCategory }: Props) {
  const router = useRouter();
  const [selectedCategory, setSelectedCategory] = useState(currentCategory || "ALL");
  const [searchQuery, setSearchQuery] = useState("");

  const activeCategoryObj = useMemo(() => {
    if (!currentCategory || currentCategory === "ALL") return null;
    return categories.find((c) => c.slug === currentCategory || c.id === currentCategory);
  }, [categories, currentCategory]);

  const filtered = useMemo(() => {
    return schedules.filter((s) => {
      if (selectedCategory !== "ALL") {
        const matchesCategory =
          s.categoryId === selectedCategory ||
          s.categorySlug.toLowerCase() === selectedCategory.toLowerCase();
        if (!matchesCategory) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        return (
          s.categoryName.toLowerCase().includes(q) ||
          String(s.cycleYear).includes(q) ||
          s.status.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [schedules, selectedCategory, searchQuery]);

  const handleCategoryChange = (cat: string) => {
    setSelectedCategory(cat);
    if (cat === "ALL") {
      router.push("/admin/schedules");
    } else {
      router.push(`/admin/schedules?category=${cat}`);
    }
  };

  const breadcrumbs = [
    { label: "Categories", href: "/admin/categories" },
    ...(activeCategoryObj
      ? [{ label: activeCategoryObj.title, href: `/admin/schedules?category=${activeCategoryObj.slug}` }]
      : []),
    { label: "Schedules", active: true },
  ];

  return (
    <div className="space-y-6 max-w-7xl pb-12">
      {/* Breadcrumbs */}
      <AdminBreadcrumbs items={breadcrumbs} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
            <Calendar className="w-6 h-6 text-purple-600" /> Exam Schedule &amp; Cycle Management
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Recruitment notifications, application timelines, exam dates, and blueprint mappings.
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
            placeholder="Search schedules by exam name or cycle year..."
            className="w-full pl-9 pr-3 py-2 text-xs font-medium rounded-xl border border-slate-200 bg-slate-50/50 focus:outline-hidden focus:border-purple-500"
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

      {/* Schedules Cards Grid */}
      {filtered.length === 0 ? (
        <Card className="p-12 text-center bg-white border-slate-200 space-y-2">
          <Calendar className="w-8 h-8 mx-auto text-slate-300" />
          <p className="text-xs text-slate-500 font-medium">No exam schedules found for this selection.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((item) => (
            <Card
              key={item.id}
              className="p-5 bg-white border-slate-200 hover:border-purple-300 transition shadow-xs flex flex-col justify-between space-y-4"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-[11px] font-bold text-purple-600 tracking-tight block">
                      {item.categoryName}
                    </span>
                    <h3 className="text-base font-black text-slate-900 leading-tight mt-0.5">
                      Recruitment Cycle {item.cycleYear}
                    </h3>
                  </div>
                  <Badge variant={item.status === "active" ? "success" : "neutral"} className="text-[10px] uppercase font-bold">
                    {item.status}
                  </Badge>
                </div>

                {/* Timeline Info */}
                <div className="mt-3 space-y-1.5 text-xs text-slate-600 font-medium">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 font-mono text-[11px]">Notification:</span>
                    <span>{item.notificationDate ? new Date(item.notificationDate).toLocaleDateString() : "TBA"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 font-mono text-[11px]">Application Window:</span>
                    <span>
                      {item.applicationStartDate ? new Date(item.applicationStartDate).toLocaleDateString() : "TBA"} —{" "}
                      {item.applicationEndDate ? new Date(item.applicationEndDate).toLocaleDateString() : "TBA"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 font-mono text-[11px]">Exam Window:</span>
                    <span className="font-bold text-slate-800">
                      {item.examWindowStart ? new Date(item.examWindowStart).toLocaleDateString() : "Scheduled Soon"}
                    </span>
                  </div>
                </div>

                {/* Connected Entity Metrics */}
                <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-slate-100 text-center font-mono">
                  <div className="p-2 rounded-lg bg-indigo-50/60 border border-indigo-100">
                    <span className="text-[10px] text-indigo-700 font-bold block uppercase">Patterns</span>
                    <span className="text-base font-black text-indigo-900">{item.patternsCount}</span>
                  </div>
                  <div className="p-2 rounded-lg bg-blue-50/60 border border-blue-100">
                    <span className="text-[10px] text-blue-700 font-bold block uppercase">Mock Tests</span>
                    <span className="text-base font-black text-blue-900">{item.mockTestsCount}</span>
                  </div>
                </div>
              </div>

              {/* Connected Action Links */}
              <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center gap-1.5">
                <Link href={`/admin/patterns?category=${item.categorySlug}`}>
                  <Button variant="outline" size="sm" className="text-xs font-bold text-indigo-700 border-indigo-200 hover:bg-indigo-50">
                    <GitBranch className="w-3.5 h-3.5 mr-1" /> View Related Patterns
                  </Button>
                </Link>
                <Link href={`/admin/mock-tests?category=${item.categorySlug}`}>
                  <Button variant="outline" size="sm" className="text-xs font-bold text-blue-700 border-blue-200 hover:bg-blue-50">
                    <FileCheck2 className="w-3.5 h-3.5 mr-1" /> View Related Mock Tests
                  </Button>
                </Link>
                <Link href={`/admin/questions?category=${item.categorySlug}`}>
                  <Button variant="ghost" size="sm" className="text-xs font-bold text-emerald-700 hover:bg-emerald-50">
                    <HelpCircle className="w-3.5 h-3.5 mr-1" /> Questions
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
