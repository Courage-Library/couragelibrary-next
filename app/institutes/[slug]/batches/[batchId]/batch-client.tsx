"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BatchDetail } from "@/services/institute.service";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Calendar,
  FileText,
  Plus,
  ArrowRight,
  UserCheck,
  BookOpen,
} from "lucide-react";

interface BatchDashboardClientProps {
  batchDetail: BatchDetail;
}

export function BatchDashboardClient({ batchDetail }: BatchDashboardClientProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"CURRICULUM" | "ROSTER" | "CREATE_ASSIGNMENT">("CURRICULUM");
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [enrollMsg, setEnrollMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // New assignment form state
  const [asgnTitle, setAsgnTitle] = useState("");
  const [asgnType, setAsgnType] = useState<string>("MOCK_TEST");
  const [asgnContentId, setAsgnContentId] = useState("");
  const [asgnDueDate, setAsgnDueDate] = useState("");
  const [isCreatingAsgn, setIsCreatingAsgn] = useState(false);

  const isFull = batchDetail.activeStudentsCount >= batchDetail.maxCapacity;

  const handleEnroll = async () => {
    setEnrollMsg(null);
    setIsEnrolling(true);
    try {
      const res = await fetch("/api/institutes/enroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId: batchDetail.id }),
      });
      const data = await res.json();
      if (data.success) {
        setEnrollMsg({ type: "success", text: "Successfully enrolled in cohort!" });
        router.refresh();
      } else {
        setEnrollMsg({ type: "error", text: data.error || "Enrollment failed." });
      }
    } catch {
      setEnrollMsg({ type: "error", text: "Network error enrolling in cohort." });
    } finally {
      setIsEnrolling(false);
    }
  };

  const handleCreateAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!asgnTitle.trim() || !asgnContentId.trim()) return;

    setIsCreatingAsgn(true);
    try {
      const res = await fetch("/api/institutes/create-assignment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batchId: batchDetail.id,
          title: asgnTitle,
          assignmentType: asgnType,
          contentId: asgnContentId,
          dueAt: asgnDueDate ? new Date(asgnDueDate).toISOString() : undefined,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setAsgnTitle("");
        setAsgnContentId("");
        setActiveTab("CURRICULUM");
        router.refresh();
      } else {
        alert(data.error || "Failed to create assignment");
      }
    } catch {
      alert("Network error creating assignment");
    } finally {
      setIsCreatingAsgn(false);
    }
  };

  const getCtaText = (type: string) => {
    switch (type) {
      case "MOCK_TEST": return "Start Mock Test";
      case "FLASHCARD_DECK": return "Review Flashcards";
      case "MISTAKE_DRILL": return "Practice Mistakes";
      case "COURSE_LESSON": return "Study Lesson";
      default: return "Open Assignment";
    }
  };

  return (
    <div className="py-8 bg-slate-50/50 min-h-[calc(100vh-4rem)] px-4">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Navigation */}
        <Link
          href={`/institutes/${batchDetail.instituteSlug}`}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to {batchDetail.instituteName}
        </Link>

        {/* Batch Hero Banner */}
        <Card className="p-6 sm:p-8 space-y-4 border-slate-200 shadow-sm bg-white">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Badge variant="indigo" className="text-[10px]">
                  {batchDetail.instituteName}
                </Badge>
                {batchDetail.isEnrolled && (
                  <Badge variant="success" className="text-[10px]">ENROLLED ({batchDetail.userRole})</Badge>
                )}
                {isFull && !batchDetail.isEnrolled && (
                  <Badge variant="destructive" className="text-[10px]">BATCH FULL</Badge>
                )}
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                {batchDetail.name}
              </h1>
            </div>

            {/* Enrollment Action */}
            {!batchDetail.isEnrolled && (
              <Button
                onClick={handleEnroll}
                disabled={isFull || isEnrolling}
                isLoading={isEnrolling}
                size="lg"
                variant="default"
                className="bg-indigo-600 hover:bg-indigo-700 font-bold text-xs"
              >
                {isFull ? "Batch Capacity Full" : "Enroll in Batch"}
              </Button>
            )}
          </div>

          {enrollMsg && (
            <div
              className={`p-3.5 rounded-xl text-xs font-semibold ${
                enrollMsg.type === "success" ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-rose-50 text-rose-800 border border-rose-200"
              }`}
            >
              {enrollMsg.text}
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center pt-2 border-t border-slate-100 font-mono text-xs">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
              <span className="font-bold block text-slate-900">{batchDetail.activeStudentsCount} / {batchDetail.maxCapacity}</span>
              <span className="text-[10px] text-slate-500 font-sans">Active Students</span>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
              <span className="font-bold block text-slate-900">{batchDetail.assignments.length}</span>
              <span className="text-[10px] text-slate-500 font-sans">Assigned Items</span>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
              <span className="font-bold block text-slate-900">{batchDetail.targetExamTitle || "General"}</span>
              <span className="text-[10px] text-slate-500 font-sans">Target Stream</span>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
              <span className="font-bold block text-slate-900">{batchDetail.status}</span>
              <span className="text-[10px] text-slate-500 font-sans">Cohort Status</span>
            </div>
          </div>
        </Card>

        {/* Tab Navigation */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab("CURRICULUM")}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeTab === "CURRICULUM"
                  ? "bg-indigo-600 text-white shadow-xs"
                  : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              <BookOpen className="w-3.5 h-3.5 inline mr-1.5" /> Batch Curriculum ({batchDetail.assignments.length})
            </button>

            {batchDetail.hasFacultyAccess && (
              <button
                onClick={() => setActiveTab("ROSTER")}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  activeTab === "ROSTER"
                    ? "bg-indigo-600 text-white shadow-xs"
                    : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                <UserCheck className="w-3.5 h-3.5 inline mr-1.5" /> Faculty Roster ({batchDetail.members?.length || 0})
              </button>
            )}
          </div>

          {batchDetail.hasFacultyAccess && (
            <button
              onClick={() => setActiveTab("CREATE_ASSIGNMENT")}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                activeTab === "CREATE_ASSIGNMENT"
                  ? "bg-purple-700 text-white shadow-xs"
                  : "bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100"
              }`}
            >
              <Plus className="w-3.5 h-3.5 inline mr-1" /> Add Assignment
            </button>
          )}
        </div>

        {/* Tab Content 1: Curriculum Assignments */}
        {activeTab === "CURRICULUM" && (
          <div className="space-y-3.5">
            {batchDetail.assignments.length === 0 ? (
              <Card className="p-12 text-center text-slate-400 space-y-2">
                <FileText className="w-10 h-10 mx-auto opacity-50" />
                <h3 className="text-sm font-bold text-slate-700">No Assignments Yet</h3>
                <p className="text-xs">Your faculty mentor has not added assignments to this cohort yet.</p>
              </Card>
            ) : (
              batchDetail.assignments.map((asgn) => (
                <div
                  key={asgn.id}
                  className="p-5 rounded-2xl bg-white border border-slate-200 hover:border-indigo-300 hover:shadow-xs transition-all space-y-3"
                >
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <Badge variant="indigo" className="text-[10px]">
                        {asgn.assignmentType.replace(/_/g, " ")}
                      </Badge>
                      {asgn.isMandatory && (
                        <Badge variant="destructive" className="text-[10px]">MANDATORY</Badge>
                      )}
                    </div>

                    {asgn.dueAt && (
                      <span className="font-mono text-[11px] text-slate-500 flex items-center gap-1">
                        <Calendar className="w-3 h-3" /> Due: {new Date(asgn.dueAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>

                  <h3 className="font-bold text-slate-900 text-base leading-snug">
                    {asgn.title}
                  </h3>

                  {asgn.instructionsMd && (
                    <p className="text-xs text-slate-600 leading-relaxed">
                      {asgn.instructionsMd}
                    </p>
                  )}

                  <div className="flex items-center justify-end pt-2 border-t border-slate-100">
                    <Link href={asgn.deepLinkUrl}>
                      <Button size="sm" variant="default" className="bg-indigo-600 hover:bg-indigo-700 font-bold text-xs">
                        {getCtaText(asgn.assignmentType)} <ArrowRight className="w-3.5 h-3.5 ml-1" />
                      </Button>
                    </Link>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Tab Content 2: Roster View (Faculty/Admin) */}
        {activeTab === "ROSTER" && batchDetail.hasFacultyAccess && (
          <Card className="p-6 space-y-4">
            <h3 className="font-bold text-slate-900 text-sm">Cohort Member Roster</h3>
            <div className="space-y-2">
              {(batchDetail.members || []).map((m) => (
                <div key={m.id} className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between text-xs">
                  <div className="space-y-0.5">
                    <span className="font-mono font-bold text-slate-900">User ID: {m.userId.slice(0, 8)}...</span>
                    <span className="text-slate-400 block text-[10px]">Joined: {new Date(m.joinedAt).toLocaleDateString()}</span>
                  </div>
                  <Badge variant={m.role === "FACULTY" ? "indigo" : "outline"} className="text-[10px]">
                    {m.role}
                  </Badge>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Tab Content 3: Create Assignment Form (Faculty/Admin) */}
        {activeTab === "CREATE_ASSIGNMENT" && batchDetail.hasFacultyAccess && (
          <Card className="p-6 space-y-5 border-purple-200 bg-purple-50/20">
            <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
              <Plus className="w-5 h-5 text-purple-700" /> Create Batch Curriculum Assignment
            </h3>

            <form onSubmit={handleCreateAssignment} className="space-y-4 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Assignment Title</label>
                <input
                  type="text"
                  required
                  value={asgnTitle}
                  onChange={(e) => setAsgnTitle(e.target.value)}
                  placeholder="e.g., Weekly Full Mock Test 04"
                  className="w-full p-3 rounded-xl border border-slate-200 bg-white font-medium outline-none focus:border-purple-600"
                />
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Content Type</label>
                  <select
                    value={asgnType}
                    onChange={(e) => setAsgnType(e.target.value)}
                    className="w-full p-3 rounded-xl border border-slate-200 bg-white font-medium outline-none"
                  >
                    <option value="MOCK_TEST">Mock Test</option>
                    <option value="FLASHCARD_DECK">Flashcard Deck</option>
                    <option value="MISTAKE_DRILL">Mistake Drill (Topic)</option>
                    <option value="COURSE">Course</option>
                    <option value="COURSE_LESSON">Course Lesson</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Content UUID Reference</label>
                  <input
                    type="text"
                    required
                    value={asgnContentId}
                    onChange={(e) => setAsgnContentId(e.target.value)}
                    placeholder="Enter source content UUID"
                    className="w-full p-3 rounded-xl border border-slate-200 bg-white font-mono outline-none focus:border-purple-600"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Due Date (Optional)</label>
                <input
                  type="date"
                  value={asgnDueDate}
                  onChange={(e) => setAsgnDueDate(e.target.value)}
                  className="w-full p-3 rounded-xl border border-slate-200 bg-white font-medium outline-none"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setActiveTab("CURRICULUM")}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" variant="default" className="bg-purple-700 hover:bg-purple-800 font-bold" isLoading={isCreatingAsgn}>
                  Publish Assignment
                </Button>
              </div>
            </form>
          </Card>
        )}
      </div>
    </div>
  );
}
