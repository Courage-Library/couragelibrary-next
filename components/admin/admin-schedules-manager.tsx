"use client";

import React, { useState, useMemo, useActionState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AdminScheduleItem, AdminCategoryItem } from "@/services/admin.service";
import {
  createScheduleAction,
  updateScheduleAction,
  toggleScheduleStatusAction,
} from "@/app/admin/actions";
import { AdminBreadcrumbs } from "@/components/admin/admin-breadcrumbs";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import {
  Calendar,
  Search,
  PlusCircle,
  GitBranch,
  FileCheck2,
  HelpCircle,
  Filter,
  Edit2,
  Power,
  X,
} from "lucide-react";

interface Props {
  schedules: AdminScheduleItem[];
  categories: AdminCategoryItem[];
  currentCategory?: string;
}

export function AdminSchedulesManager({ schedules, categories, currentCategory }: Props) {
  const router = useRouter();

  // Create Form State
  const [createState, createAction, isCreating] = useActionState(createScheduleAction, null);

  // Edit Modal State
  const [editingSchedule, setEditingSchedule] = useState<AdminScheduleItem | null>(null);
  const [editState, editAction, isEditing] = useActionState(updateScheduleAction, null);

  // Search & Filter
  const [selectedCategory, setSelectedCategory] = useState(currentCategory || "ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [isToggling, startTransition] = useTransition();

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
            Manage official recruitment notification releases, application deadlines, and exam test windows.
          </p>
        </div>
      </div>

      {/* Feedback Alerts */}
      {createState?.error && <Alert variant="error">{createState.error}</Alert>}
      {createState?.message && <Alert variant="success">{createState.message}</Alert>}

      {/* TWO COLUMN WORKSPACE */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: Add New Schedule Form Card */}
        <div className="lg:col-span-5">
          <Card className="p-6 bg-white border-purple-200 shadow-sm border-t-4 border-t-purple-600 space-y-4 sticky top-4">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <PlusCircle className="w-5 h-5 text-purple-600" />
              <h2 className="text-base font-black text-slate-900">Add New Exam Schedule</h2>
            </div>

            <form action={createAction} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Target Exam Category <span className="text-rose-500">*</span>
                </label>
                <select
                  name="categoryId"
                  defaultValue={activeCategoryObj ? activeCategoryObj.id : (categories[0]?.id || "")}
                  className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-purple-500"
                  required
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Recruitment Year
                  </label>
                  <input
                    name="cycleYear"
                    type="number"
                    defaultValue={2026}
                    className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Status
                  </label>
                  <select
                    name="status"
                    defaultValue="active"
                    className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-purple-500"
                  >
                    <option value="active">Active</option>
                    <option value="upcoming">Upcoming</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Notification Release Date
                </label>
                <input
                  name="notificationDate"
                  type="date"
                  className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Apply Start Date
                  </label>
                  <input
                    name="applicationStartDate"
                    type="date"
                    className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Apply End Date
                  </label>
                  <input
                    name="applicationEndDate"
                    type="date"
                    className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Exam Window Start
                  </label>
                  <input
                    name="examWindowStart"
                    type="date"
                    className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Exam Window End
                  </label>
                  <input
                    name="examWindowEnd"
                    type="date"
                    className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              <Button
                type="submit"
                variant="default"
                disabled={isCreating}
                className="w-full font-bold bg-purple-600 hover:bg-purple-700 text-white shadow-sm flex items-center justify-center gap-2"
              >
                <PlusCircle className="w-4 h-4" />
                {isCreating ? "Creating Schedule..." : "Create Schedule"}
              </Button>
            </form>
          </Card>
        </div>

        {/* RIGHT COLUMN: Existing Schedules List */}
        <div className="lg:col-span-7 space-y-4">
          {/* Filter Bar */}
          <Card className="p-4 bg-white border-slate-200 flex flex-col sm:flex-row items-center gap-3">
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search schedules by exam name or cycle year..."
                className="w-full pl-9 pr-3 py-2 text-xs font-medium rounded-xl border border-slate-200 bg-slate-50/50 focus:outline-none focus:border-purple-500"
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

          {/* Schedules Cards List */}
          {filtered.length === 0 ? (
            <Card className="p-12 text-center bg-white border-slate-200 space-y-2">
              <Calendar className="w-8 h-8 mx-auto text-slate-300" />
              <p className="text-xs text-slate-500 font-medium">No exam schedules found for this selection.</p>
            </Card>
          ) : (
            <div className="space-y-4">
              {filtered.map((item) => (
                <Card
                  key={item.id}
                  className="p-5 bg-white border-slate-200 hover:border-purple-300 transition shadow-xs space-y-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className="text-[11px] font-bold text-purple-600 tracking-tight block">
                        {item.categoryName}
                      </span>
                      <h3 className="text-base font-black text-slate-900 leading-tight mt-0.5">
                        Recruitment Cycle {item.cycleYear}
                      </h3>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <Badge variant={item.status === "active" ? "success" : "neutral"} className="text-[10px] uppercase font-bold">
                        {item.status}
                      </Badge>
                      <button
                        onClick={() => setEditingSchedule(item)}
                        className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-purple-600 hover:bg-slate-50 transition"
                        title="Edit Schedule"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Toggle status for ${item.categoryName} ${item.cycleYear}?`)) {
                            startTransition(async () => {
                              await toggleScheduleStatusAction(item.id, item.status);
                            });
                          }
                        }}
                        disabled={isToggling}
                        className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-purple-600 hover:bg-slate-50 transition"
                        title="Toggle Status"
                      >
                        <Power className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Timeline Info */}
                  <div className="space-y-1.5 text-xs text-slate-600 font-medium bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 font-mono text-[11px]">Notification:</span>
                      <span>{item.notificationDate ? new Date(item.notificationDate).toLocaleDateString() : "TBA"}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 font-mono text-[11px]">Application Window:</span>
                      <span>
                        {item.applicationStartDate ? new Date(item.applicationStartDate).toLocaleDateString() : "TBA"} &mdash;{" "}
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
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 text-center font-mono">
                    <div className="p-2 rounded-lg bg-indigo-50/60 border border-indigo-100">
                      <span className="text-[10px] text-indigo-700 font-bold block uppercase">Patterns</span>
                      <span className="text-sm font-black text-indigo-900">{item.patternsCount}</span>
                    </div>
                    <div className="p-2 rounded-lg bg-blue-50/60 border border-blue-100">
                      <span className="text-[10px] text-blue-700 font-bold block uppercase">Mock Tests</span>
                      <span className="text-sm font-black text-blue-900">{item.mockTestsCount}</span>
                    </div>
                  </div>

                  {/* Connected Action Links */}
                  <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-1.5">
                    <Link href={`/admin/patterns?category=${item.categorySlug}`}>
                      <Button variant="outline" size="sm" className="text-xs font-bold text-indigo-700 border-indigo-200 hover:bg-indigo-50">
                        <GitBranch className="w-3.5 h-3.5 mr-1" /> Related Patterns
                      </Button>
                    </Link>
                    <Link href={`/admin/mock-tests?category=${item.categorySlug}`}>
                      <Button variant="outline" size="sm" className="text-xs font-bold text-blue-700 border-blue-200 hover:bg-blue-50">
                        <FileCheck2 className="w-3.5 h-3.5 mr-1" /> Related Mock Tests
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
      </div>

      {/* EDIT SCHEDULE MODAL */}
      {editingSchedule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <Card className="w-full max-w-lg p-6 bg-white border-slate-200 shadow-2xl space-y-4 relative">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-purple-600" /> Edit Schedule: {editingSchedule.categoryName} ({editingSchedule.cycleYear})
              </h3>
              <button
                onClick={() => setEditingSchedule(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {editState?.error && <Alert variant="error">{editState.error}</Alert>}
            {editState?.message && <Alert variant="success">{editState.message}</Alert>}

            <form action={editAction} className="space-y-4">
              <input type="hidden" name="id" value={editingSchedule.id} />

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Recruitment Year</label>
                  <input
                    name="cycleYear"
                    type="number"
                    defaultValue={editingSchedule.cycleYear}
                    className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Status</label>
                  <select
                    name="status"
                    defaultValue={editingSchedule.status}
                    className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-purple-500"
                  >
                    <option value="active">Active</option>
                    <option value="upcoming">Upcoming</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Notification Release Date</label>
                <input
                  name="notificationDate"
                  type="date"
                  defaultValue={editingSchedule.notificationDate ? editingSchedule.notificationDate.split("T")[0] : ""}
                  className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Apply Start Date</label>
                  <input
                    name="applicationStartDate"
                    type="date"
                    defaultValue={editingSchedule.applicationStartDate ? editingSchedule.applicationStartDate.split("T")[0] : ""}
                    className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Apply End Date</label>
                  <input
                    name="applicationEndDate"
                    type="date"
                    defaultValue={editingSchedule.applicationEndDate ? editingSchedule.applicationEndDate.split("T")[0] : ""}
                    className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Exam Window Start</label>
                  <input
                    name="examWindowStart"
                    type="date"
                    defaultValue={editingSchedule.examWindowStart ? editingSchedule.examWindowStart.split("T")[0] : ""}
                    className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Exam Window End</label>
                  <input
                    name="examWindowEnd"
                    type="date"
                    defaultValue={editingSchedule.examWindowEnd ? editingSchedule.examWindowEnd.split("T")[0] : ""}
                    className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <Button type="button" variant="outline" size="sm" onClick={() => setEditingSchedule(null)}>
                  Cancel
                </Button>
                <Button type="submit" variant="default" size="sm" disabled={isEditing} className="font-bold bg-purple-600 hover:bg-purple-700">
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
