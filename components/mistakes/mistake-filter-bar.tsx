"use client";

import React, { useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Search, SlidersHorizontal, X, Bookmark } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MistakeFilterBarProps {
  subjects: Array<{ id: string; name: string }>;
  cognitiveTypes: Array<{ id: string; name: string }>;
  currentStatus: string;
  currentRepeated: boolean;
  currentBookmarked?: boolean;
  currentSubject: string;
  currentCognitive: string;
  currentSort: string;
  currentQuery: string;
}

export function MistakeFilterBar({
  subjects,
  cognitiveTypes,
  currentStatus,
  currentRepeated,
  currentBookmarked = false,
  currentSubject,
  currentCognitive,
  currentSort,
  currentQuery,
}: MistakeFilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [search, setSearch] = useState(currentQuery);
  const [showMoreFilters, setShowMoreFilters] = useState(
    Boolean((currentCognitive && currentCognitive !== "ALL") || (currentSubject && currentSubject !== "ALL"))
  );

  const updateParam = (key: string, value: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== "ALL" && value !== "") {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    // Always reset to page 1 on filter modification
    params.delete("page");

    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateParam("q", search.trim());
  };

  const handleClearSearch = () => {
    setSearch("");
    updateParam("q", null);
  };

  const handleTabClick = (tabValue: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("page");

    if (tabValue === "REPEATED") {
      params.set("repeated", "true");
      params.delete("status");
    } else {
      params.delete("repeated");
      if (tabValue === "ALL") {
        params.delete("status");
      } else {
        params.set("status", tabValue);
      }
    }

    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  };

  const handleToggleBookmarked = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("page");
    if (currentBookmarked) {
      params.delete("bookmarked");
    } else {
      params.set("bookmarked", "true");
    }
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  };

  const activeTab = currentRepeated
    ? "REPEATED"
    : currentStatus && currentStatus !== "ALL"
    ? currentStatus
    : "ALL";

  const hasActiveFilters = Boolean(
    (currentSubject && currentSubject !== "ALL") ||
    (currentCognitive && currentCognitive !== "ALL") ||
    (currentSort && currentSort !== "recent") ||
    currentBookmarked ||
    currentQuery
  );

  const handleResetFilters = () => {
    setSearch("");
    const params = new URLSearchParams();
    if (currentStatus && currentStatus !== "ALL") params.set("status", currentStatus);
    if (currentRepeated) params.set("repeated", "true");
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  };

  const tabs = [
    { label: "All Mistakes", val: "ALL" },
    { label: "Needs Revision", val: "UNRESOLVED" },
    { label: "Repeated", val: "REPEATED" },
    { label: "Improving", val: "REVISITING" },
    { label: "Mastered", val: "MASTERED" },
  ];

  return (
    <div className="space-y-3.5 bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
      {/* Segmented Status Tabs & Action Pills */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {tabs.map((tab) => {
            const isSelected = activeTab === tab.val;
            return (
              <button
                key={tab.val}
                type="button"
                onClick={() => handleTabClick(tab.val)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                  isSelected
                    ? "bg-blue-600 text-white shadow-xs"
                    : "bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          {/* Bookmarked Filter Pill */}
          <button
            type="button"
            onClick={handleToggleBookmarked}
            aria-pressed={currentBookmarked}
            className={`text-xs font-semibold flex items-center gap-1.5 px-3 py-1.5 rounded-xl border transition-all ${
              currentBookmarked
                ? "bg-indigo-50 border-indigo-200 text-indigo-700 shadow-xs"
                : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            }`}
          >
            <Bookmark
              className={`w-3.5 h-3.5 ${
                currentBookmarked ? "fill-indigo-600 text-indigo-600" : "text-slate-400"
              }`}
            />
            <span>Bookmarked</span>
          </button>

          {/* Expand Filters Toggle */}
          <button
            type="button"
            onClick={() => setShowMoreFilters(!showMoreFilters)}
            className={`text-xs font-semibold flex items-center gap-1.5 px-3 py-1.5 rounded-xl border transition-colors ${
              showMoreFilters || hasActiveFilters
                ? "bg-blue-50 border-blue-200 text-blue-700"
                : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Filters</span>
            {hasActiveFilters && (
              <span className="w-2 h-2 rounded-full bg-blue-600 shrink-0" />
            )}
          </button>
        </div>
      </div>

      {/* Primary Search Bar & Quick Dropdowns */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
        {/* Search Input */}
        <form onSubmit={handleSearchSubmit} className="sm:col-span-6 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search questions, topics or subjects..."
            className="w-full pl-9 pr-8 py-2 text-xs rounded-xl bg-slate-50 border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
          />
          {search && (
            <button
              type="button"
              onClick={handleClearSearch}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </form>

        {/* Subject Filter */}
        <div className="sm:col-span-3">
          <select
            value={currentSubject || "ALL"}
            onChange={(e) => updateParam("subject", e.target.value)}
            className="w-full py-2 px-3 text-xs rounded-xl bg-slate-50 border border-slate-200 text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          >
            <option value="ALL">All Subjects</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        {/* Sorting Dropdown */}
        <div className="sm:col-span-3">
          <select
            value={currentSort || "recent"}
            onChange={(e) => updateParam("sort", e.target.value)}
            className="w-full py-2 px-3 text-xs rounded-xl bg-slate-50 border border-slate-200 text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          >
            <option value="recent">Sort: Most Recent</option>
            <option value="repeated">Sort: Most Repeated</option>
            <option value="oldest">Sort: Oldest Unresolved</option>
            <option value="topic">Sort: By Topic</option>
          </select>
        </div>
      </div>

      {/* Expandable Secondary Filters */}
      {showMoreFilters && (
        <div className="pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-3 animate-in fade-in duration-200">
          <div>
            <label className="text-[11px] font-semibold text-slate-500 block mb-1">
              Cognitive Failure Mode
            </label>
            <select
              value={currentCognitive || "ALL"}
              onChange={(e) => updateParam("cognitive", e.target.value)}
              className="w-full py-2 px-3 text-xs rounded-xl bg-slate-50 border border-slate-200 text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            >
              <option value="ALL">All Error Archetypes</option>
              {cognitiveTypes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end justify-between">
            <span className="text-[11px] text-slate-400">
              {isPending ? "Updating notebook view..." : ""}
            </span>
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleResetFilters}
                className="text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 h-8 font-semibold"
              >
                Reset All Filters
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
