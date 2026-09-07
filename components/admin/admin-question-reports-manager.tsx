"use client";

import React, { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Flag,
  Search,
  Filter,
  Check,
} from "lucide-react";

export interface AdminQuestionReportItem {
  id: string;
  reporterUserId: string;
  questionId: string;
  questionVersionId: string;
  issueType: string;
  description: string;
  suggestedFix: string | null;
  status: "OPEN" | "UNDER_REVIEW" | "VERIFIED" | "RESOLVED" | "REJECTED";
  resolutionNotes: string | null;
  rewardCoinsGranted: number;
  createdAt: string;
  questionText: string;
  options: Array<{ id: string; key: string; text: string }>;
  correctOptionKey: string;
  explanation: string | null;
}

interface AdminQuestionReportsManagerProps {
  initialReports: AdminQuestionReportItem[];
}

export function AdminQuestionReportsManager({ initialReports }: AdminQuestionReportsManagerProps) {
  const [reports, setReports] = useState<AdminQuestionReportItem[]>(initialReports);
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL");
  const [selectedIssueType, setSelectedIssueType] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [activeReport, setActiveReport] = useState<AdminQuestionReportItem | null>(null);
  const [resolutionStatus, setResolutionStatus] = useState<string>("RESOLVED");
  const [resolutionNotes, setResolutionNotes] = useState<string>("");
  const [isUpdating, setIsUpdating] = useState(false);

  // Filter reports
  const filteredReports = reports.filter((r) => {
    if (selectedStatus !== "ALL" && r.status !== selectedStatus) return false;
    if (selectedIssueType !== "ALL" && r.issueType !== selectedIssueType) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchText = (r.questionText || "").toLowerCase().includes(q);
      const matchDesc = (r.description || "").toLowerCase().includes(q);
      const matchId = (r.questionId || "").toLowerCase().includes(q);
      return matchText || matchDesc || matchId;
    }
    return true;
  });

  const handleUpdateStatus = async (reportId: string, newStatus: string, notes: string) => {
    setIsUpdating(true);
    try {
      const res = await fetch("/api/admin/reports/update-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportId,
          status: newStatus,
          resolutionNotes: notes,
        }),
      });

      if (res.ok) {
        setReports((prev) =>
          prev.map((r) =>
            r.id === reportId
              ? { ...r, status: newStatus as AdminQuestionReportItem["status"], resolutionNotes: notes }
              : r
          )
        );
        if (activeReport?.id === reportId) {
          setActiveReport((prev) =>
            prev
              ? { ...prev, status: newStatus as AdminQuestionReportItem["status"], resolutionNotes: notes }
              : null
          );
        }
      }
    } catch (err) {
      console.error("[AdminQuestionReportsManager] Update error:", err);
    } finally {
      setIsUpdating(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "OPEN":
        return <Badge variant="warning">OPEN</Badge>;
      case "UNDER_REVIEW":
        return <Badge variant="indigo">UNDER REVIEW</Badge>;
      case "VERIFIED":
      case "RESOLVED":
        return <Badge variant="success">RESOLVED</Badge>;
      case "REJECTED":
        return <Badge variant="destructive">REJECTED</Badge>;
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Search & Filter Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-white rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-2 flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by question text, report notes, or question ID..."
            className="w-full text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:outline-hidden bg-transparent"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-slate-700"
          >
            <option value="ALL">All Statuses</option>
            <option value="OPEN">Open</option>
            <option value="UNDER_REVIEW">Under Review</option>
            <option value="RESOLVED">Resolved</option>
            <option value="REJECTED">Rejected</option>
          </select>

          <select
            value={selectedIssueType}
            onChange={(e) => setSelectedIssueType(e.target.value)}
            className="text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-slate-700"
          >
            <option value="ALL">All Issue Types</option>
            <option value="TYPO">Typo / Grammar</option>
            <option value="INCORRECT_ANSWER">Incorrect Answer</option>
            <option value="AMBIGUOUS">Ambiguous / Multiple Options</option>
            <option value="FORMATTING">Formatting / Image</option>
            <option value="OTHER">Other</option>
          </select>
        </div>
      </div>

      {/* Reports List & Detail Pane */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Reports Table / List */}
        <div className="lg:col-span-7 space-y-3">
          {filteredReports.length === 0 ? (
            <div className="p-8 text-center bg-white rounded-2xl border border-slate-200 text-slate-500 text-xs font-medium">
              No question reports match your filter criteria.
            </div>
          ) : (
            filteredReports.map((r) => {
              const isSelected = activeReport?.id === r.id;
              return (
                <div
                  key={r.id}
                  onClick={() => {
                    setActiveReport(r);
                    setResolutionStatus(r.status === "OPEN" ? "UNDER_REVIEW" : r.status);
                    setResolutionNotes(r.resolutionNotes || "");
                  }}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer bg-white space-y-2.5 ${
                    isSelected
                      ? "border-blue-500 ring-2 ring-blue-100 shadow-sm"
                      : "border-slate-200 hover:border-slate-300 shadow-xs"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Flag className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span className="text-xs font-bold text-slate-900">{r.issueType}</span>
                    </div>
                    {getStatusBadge(r.status)}
                  </div>

                  <p className="text-xs text-slate-600 line-clamp-2 font-medium">
                    {r.questionText || "Question text unavailable"}
                  </p>

                  <div className="pt-1.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                    <span>Report: {r.description}</span>
                    <span className="font-mono">{new Date(r.createdAt).toLocaleDateString("en-IN")}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Selected Report Inspection & Resolution Drawer */}
        <div className="lg:col-span-5">
          {activeReport ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4 shadow-sm sticky top-20">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h3 className="font-black text-sm text-slate-900">Inspect Question Report</h3>
                {getStatusBadge(activeReport.status)}
              </div>

              {/* Question Text */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Reported Question
                </span>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-medium">
                  {activeReport.questionText}
                </div>
              </div>

              {/* Options & Key */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Options &amp; Correct Key
                </span>
                <div className="space-y-1 text-xs">
                  {activeReport.options.map((opt) => (
                    <div
                      key={opt.key}
                      className={`px-2.5 py-1.5 rounded-lg flex items-center justify-between ${
                        opt.key === activeReport.correctOptionKey
                          ? "bg-emerald-50 text-emerald-900 border border-emerald-200 font-bold"
                          : "bg-slate-50 text-slate-700"
                      }`}
                    >
                      <span>
                        <span className="font-mono font-bold mr-1.5">[{opt.key}]</span>
                        {opt.text}
                      </span>
                      {opt.key === activeReport.correctOptionKey && (
                        <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Student Report Notes */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold text-amber-700 uppercase tracking-wider">
                  Candidate Feedback ({activeReport.issueType})
                </span>
                <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-xl text-xs text-amber-950 font-medium">
                  {activeReport.description}
                  {activeReport.suggestedFix && (
                    <div className="mt-1.5 pt-1.5 border-t border-amber-200/80 text-[11px]">
                      <span className="font-bold">Suggested Fix: </span>
                      {activeReport.suggestedFix}
                    </div>
                  )}
                </div>
              </div>

              {/* Resolution Action */}
              <div className="pt-2 border-t border-slate-100 space-y-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 block">Update Status</label>
                  <select
                    value={resolutionStatus}
                    onChange={(e) => setResolutionStatus(e.target.value)}
                    className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl p-2 text-slate-800"
                  >
                    <option value="OPEN">OPEN</option>
                    <option value="UNDER_REVIEW">UNDER REVIEW</option>
                    <option value="RESOLVED">RESOLVED (Valid Issue)</option>
                    <option value="REJECTED">REJECTED (Invalid / False Report)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 block">Staff Resolution Notes</label>
                  <textarea
                    value={resolutionNotes}
                    onChange={(e) => setResolutionNotes(e.target.value)}
                    placeholder="Enter notes about correction made or rationale for rejection..."
                    rows={2}
                    className="w-full text-xs font-medium bg-slate-50 border border-slate-200 rounded-xl p-2 text-slate-800 resize-none"
                  />
                </div>

                <Button
                  type="button"
                  size="sm"
                  disabled={isUpdating}
                  onClick={() => handleUpdateStatus(activeReport.id, resolutionStatus, resolutionNotes)}
                  className="w-full bg-blue-600 hover:bg-blue-700 font-bold text-xs"
                >
                  {isUpdating ? "Saving..." : "Update Report Status"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center bg-white rounded-2xl border border-dashed border-slate-200 text-slate-400 text-xs font-medium">
              Select a question report from the list to inspect details and take staff action.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
