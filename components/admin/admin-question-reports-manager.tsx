"use client";

import React, { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Flag,
  Search,
  Filter,
  Check,
  Clock,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Eye,
  FileText,
  User,
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
  const [activeReport, setActiveReport] = useState<AdminQuestionReportItem | null>(
    reports.length > 0 ? reports[0] : null
  );
  const [resolutionStatus, setResolutionStatus] = useState<string>("UNDER_REVIEW");
  const [resolutionNotes, setResolutionNotes] = useState<string>("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateSuccessMessage, setUpdateSuccessMessage] = useState<string | null>(null);

  // Live KPI counts from real database data
  const totalCount = reports.length;
  const openCount = reports.filter((r) => r.status === "OPEN").length;
  const underReviewCount = reports.filter((r) => r.status === "UNDER_REVIEW").length;
  const resolvedCount = reports.filter((r) => r.status === "RESOLVED" || r.status === "VERIFIED").length;
  const rejectedCount = reports.filter((r) => r.status === "REJECTED").length;

  // Filter reports
  const filteredReports = reports.filter((r) => {
    if (selectedStatus !== "ALL" && r.status !== selectedStatus) return false;
    if (selectedIssueType !== "ALL" && r.issueType !== selectedIssueType) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchText = (r.questionText || "").toLowerCase().includes(q);
      const matchDesc = (r.description || "").toLowerCase().includes(q);
      const matchId = (r.id || "").toLowerCase().includes(q) || (r.questionId || "").toLowerCase().includes(q);
      return matchText || matchDesc || matchId;
    }
    return true;
  });

  const handleSelectReport = (r: AdminQuestionReportItem) => {
    setActiveReport(r);
    setResolutionStatus(r.status === "OPEN" ? "UNDER_REVIEW" : r.status);
    setResolutionNotes(r.resolutionNotes || "");
    setUpdateSuccessMessage(null);
  };

  const handleUpdateStatus = async (reportId: string, newStatus: string, notes: string) => {
    setIsUpdating(true);
    setUpdateSuccessMessage(null);
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

      const data = await res.json();
      if (res.ok && data.success) {
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
        setUpdateSuccessMessage("Report status updated successfully.");
        setTimeout(() => setUpdateSuccessMessage(null), 3500);
      } else {
        alert(data.error || "Failed to update report status.");
      }
    } catch (err) {
      console.error("[AdminQuestionReportsManager] Update error:", err);
      alert("Network communication error.");
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
      {/* ========================================================================= */}
      {/* REAL DATABASE KPI CARDS                                                   */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        <div
          onClick={() => setSelectedStatus("ALL")}
          className={`p-4 rounded-2xl bg-white border cursor-pointer transition-all ${
            selectedStatus === "ALL" ? "border-blue-500 ring-2 ring-blue-100 shadow-xs" : "border-slate-200 hover:border-slate-300"
          }`}
        >
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-bold uppercase tracking-wider">Total Reports</span>
            <FileText className="w-4 h-4 text-slate-400" />
          </div>
          <p className="text-2xl font-black text-slate-900 mt-2">{totalCount}</p>
          <span className="text-[10px] text-slate-400 font-medium">All logged errata</span>
        </div>

        <div
          onClick={() => setSelectedStatus("OPEN")}
          className={`p-4 rounded-2xl bg-white border cursor-pointer transition-all ${
            selectedStatus === "OPEN" ? "border-amber-500 ring-2 ring-amber-100 shadow-xs" : "border-slate-200 hover:border-slate-300"
          }`}
        >
          <div className="flex items-center justify-between text-amber-700">
            <span className="text-[11px] font-bold uppercase tracking-wider">New / Open</span>
            <AlertCircle className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-2xl font-black text-amber-900 mt-2">{openCount}</p>
          <span className="text-[10px] text-amber-600 font-medium">Pending triage</span>
        </div>

        <div
          onClick={() => setSelectedStatus("UNDER_REVIEW")}
          className={`p-4 rounded-2xl bg-white border cursor-pointer transition-all ${
            selectedStatus === "UNDER_REVIEW" ? "border-indigo-500 ring-2 ring-indigo-100 shadow-xs" : "border-slate-200 hover:border-slate-300"
          }`}
        >
          <div className="flex items-center justify-between text-indigo-700">
            <span className="text-[11px] font-bold uppercase tracking-wider">Under Review</span>
            <Clock className="w-4 h-4 text-indigo-600" />
          </div>
          <p className="text-2xl font-black text-indigo-900 mt-2">{underReviewCount}</p>
          <span className="text-[10px] text-indigo-600 font-medium">Being investigated</span>
        </div>

        <div
          onClick={() => setSelectedStatus("RESOLVED")}
          className={`p-4 rounded-2xl bg-white border cursor-pointer transition-all ${
            selectedStatus === "RESOLVED" ? "border-emerald-500 ring-2 ring-emerald-100 shadow-xs" : "border-slate-200 hover:border-slate-300"
          }`}
        >
          <div className="flex items-center justify-between text-emerald-700">
            <span className="text-[11px] font-bold uppercase tracking-wider">Resolved</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-black text-emerald-900 mt-2">{resolvedCount}</p>
          <span className="text-[10px] text-emerald-600 font-medium">Verified &amp; fixed</span>
        </div>

        <div
          onClick={() => setSelectedStatus("REJECTED")}
          className={`p-4 rounded-2xl bg-white border cursor-pointer transition-all ${
            selectedStatus === "REJECTED" ? "border-rose-500 ring-2 ring-rose-100 shadow-xs" : "border-slate-200 hover:border-slate-300"
          }`}
        >
          <div className="flex items-center justify-between text-rose-700">
            <span className="text-[11px] font-bold uppercase tracking-wider">Dismissed</span>
            <XCircle className="w-4 h-4 text-rose-600" />
          </div>
          <p className="text-2xl font-black text-rose-900 mt-2">{rejectedCount}</p>
          <span className="text-[10px] text-rose-600 font-medium">Invalid / rejected</span>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SEARCH & FILTER BAR                                                       */}
      {/* ========================================================================= */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-white rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-2 flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search reports by question text, candidate message, or report ID..."
            className="w-full text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:outline-hidden bg-transparent"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-slate-700 cursor-pointer"
          >
            <option value="ALL">All Statuses</option>
            <option value="OPEN">Open</option>
            <option value="UNDER_REVIEW">Under Review</option>
            <option value="VERIFIED">Verified (Issue Confirmed)</option>
            <option value="RESOLVED">Resolved (Fixed &amp; Closed)</option>
            <option value="REJECTED">Dismissed / Rejected</option>
          </select>

          <select
            value={selectedIssueType}
            onChange={(e) => setSelectedIssueType(e.target.value)}
            className="text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-slate-700 cursor-pointer"
          >
            <option value="ALL">All Issue Types</option>
            <option value="INCORRECT_ANSWER">Incorrect Answer</option>
            <option value="INCORRECT_EXPLANATION">Incorrect Explanation</option>
            <option value="TYPO">Typo / Grammar</option>
            <option value="AMBIGUOUS">Ambiguous Question</option>
            <option value="QUESTION_TEXT_ERROR">Question Text Error</option>
            <option value="FORMATTING">Formatting / Image Issue</option>
            <option value="OTHER">Other</option>
          </select>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* REPORTS LIST & INSPECTION WORKSPACE                                       */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Reports Table / List (7 cols) */}
        <div className="lg:col-span-7 space-y-3">
          {filteredReports.length === 0 ? (
            <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 text-slate-500 text-xs font-medium space-y-2">
              <AlertCircle className="w-6 h-6 text-slate-300 mx-auto" />
              <p className="font-bold text-slate-700">No question reports found</p>
              <p className="text-slate-400 text-[11px]">Adjust your status filter or search query.</p>
            </div>
          ) : (
            filteredReports.map((r) => {
              const isSelected = activeReport?.id === r.id;
              const maskedCandidate = `CL••••${(r.reporterUserId || "user").slice(-4)}`;
              return (
                <div
                  key={r.id}
                  onClick={() => handleSelectReport(r)}
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
                      <span className="text-[10px] font-mono text-slate-400">#{r.id.slice(0, 8)}</span>
                    </div>
                    {getStatusBadge(r.status)}
                  </div>

                  <p className="text-xs text-slate-700 line-clamp-2 font-medium">
                    {r.questionText || "Question text unavailable"}
                  </p>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                    <div className="flex items-center gap-1.5">
                      <User className="w-3 h-3 text-slate-400" />
                      <span className="font-mono text-[10px] text-slate-600">{maskedCandidate}</span>
                    </div>
                    <span className="font-mono text-slate-400">
                      {new Date(r.createdAt).toLocaleDateString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Selected Report Inspection & Resolution Workspace (5 cols) */}
        <div className="lg:col-span-5">
          {activeReport ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4 shadow-sm sticky top-20">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="min-w-0">
                  <h3 className="font-black text-sm text-slate-900">Inspect Question Report</h3>
                  <span className="text-[10px] font-mono text-slate-400">ID: #{activeReport.id}</span>
                </div>
                {getStatusBadge(activeReport.status)}
              </div>

              {/* Question Text */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Reported Question
                </span>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-medium leading-relaxed">
                  {activeReport.questionText || "No question text available"}
                </div>
              </div>

              {/* Options & Correct Answer Key */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Options &amp; Correct Answer Key
                </span>
                <div className="space-y-1 text-xs">
                  {activeReport.options && activeReport.options.length > 0 ? (
                    activeReport.options.map((opt) => (
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
                    ))
                  ) : (
                    <div className="text-[11px] text-slate-400 italic">No options recorded</div>
                  )}
                </div>
              </div>

              {/* Explanation */}
              {activeReport.explanation && (
                <div className="space-y-1.5">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    Official Explanation
                  </span>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 font-normal">
                    {activeReport.explanation}
                  </div>
                </div>
              )}

              {/* Candidate Feedback */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold text-amber-700 uppercase tracking-wider">
                  Candidate Feedback ({activeReport.issueType})
                </span>
                <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-xl text-xs text-amber-950 font-medium">
                  {activeReport.description}
                  {activeReport.suggestedFix && (
                    <div className="mt-2 pt-2 border-t border-amber-200/80 text-[11px]">
                      <span className="font-bold">Candidate Suggested Fix: </span>
                      {activeReport.suggestedFix}
                    </div>
                  )}
                </div>
              </div>

              {/* Resolution Action */}
              <div className="pt-3 border-t border-slate-100 space-y-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 block">Change Status</label>
                  <select
                    value={resolutionStatus}
                    onChange={(e) => setResolutionStatus(e.target.value)}
                    className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl p-2 text-slate-800 cursor-pointer"
                  >
                    <option value="OPEN">OPEN (Unreviewed)</option>
                    <option value="UNDER_REVIEW">UNDER REVIEW (Investigation in progress)</option>
                    <option value="VERIFIED">VERIFIED (Issue Confirmed / Bounty Granted)</option>
                    <option value="RESOLVED">RESOLVED (Fixed &amp; Closed)</option>
                    <option value="REJECTED">REJECTED (Invalid / Dismissed)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 block">Internal Staff Note</label>
                  <textarea
                    value={resolutionNotes}
                    onChange={(e) => setResolutionNotes(e.target.value)}
                    placeholder="Enter audit rationale, fix details, or explanation for rejection..."
                    rows={2}
                    className="w-full text-xs font-medium bg-slate-50 border border-slate-200 rounded-xl p-2 text-slate-800 resize-none focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                {updateSuccessMessage && (
                  <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>{updateSuccessMessage}</span>
                  </div>
                )}

                <Button
                  type="button"
                  size="sm"
                  disabled={isUpdating}
                  onClick={() => handleUpdateStatus(activeReport.id, resolutionStatus, resolutionNotes)}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs"
                >
                  {isUpdating ? "Saving..." : "Update Report Status"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="p-12 text-center bg-white rounded-2xl border border-dashed border-slate-200 text-slate-400 text-xs font-medium space-y-1">
              <Eye className="w-5 h-5 text-slate-300 mx-auto" />
              <p>Select a question report to inspect full details and take administrative action.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

