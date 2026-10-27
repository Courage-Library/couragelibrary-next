"use client";

import React, { useState } from "react";
import Link from "next/link";
import { AnswerKeyUnavailableNotice } from "@/components/questions/answer-key-notice";
import { Check, Search, CheckCircle2, AlertTriangle } from "lucide-react";
import { StatusChip } from "@/components/admin/status-chip";
import { StudioDrawer } from "@/components/admin/studio/studio-drawer";
import { StudioEmpty, StudioField, StudioStatStrip, studioControl, studioPrimaryAction, type StudioStat } from "@/components/admin/studio/studio-page";

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
  correctOptionKey: string | null;
  explanation: string | null;
}

interface AdminQuestionReportsManagerProps {
  initialReports: AdminQuestionReportItem[];
  /** ADMIN-UX-1 phase B: Today deep link (?status=OPEN) */
  initialStatus?: string;
}

const STATUS_FILTERS: Array<{ key: string; label: string; tone: StudioStat["tone"] }> = [
  { key: "ALL", label: "All", tone: "muted" },
  { key: "OPEN", label: "Open", tone: "red" },
  { key: "UNDER_REVIEW", label: "Under review", tone: "blue" },
  { key: "VERIFIED", label: "Verified", tone: "teal" },
  { key: "RESOLVED", label: "Resolved", tone: "green" },
  { key: "REJECTED", label: "Dismissed", tone: "muted" },
];

/** Exactly the issue_type values the DB allows (question_errata_reports CHECK, migration 093). */
const ISSUE_LABEL: Record<string, string> = {
  INCORRECT_ANSWER: "Wrong answer key",
  INCORRECT_EXPLANATION: "Wrong explanation",
  TYPO: "Typo or unclear wording",
  AMBIGUOUS: "Ambiguous question",
  QUESTION_TEXT_ERROR: "Question text error",
  TRANSLATION_ERROR: "Translation error",
  OUTDATED_INFORMATION: "Outdated information",
  DUPLICATE: "Duplicate",
  FORMATTING: "Formatting or image",
  OTHER: "Other",
};
const issueLabel = (t: string) => ISSUE_LABEL[t] ?? t.replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase());

/**
 * Courage Studio list + drawer (phase 3 batch 1). D-5 fixed: every count equals the result of its own filter (Verified
 * and Resolved are separate). Rows and counts are real buttons; filters have visible labels; v3 status chips.
 */
export function AdminQuestionReportsManager({ initialReports, initialStatus = "ALL" }: AdminQuestionReportsManagerProps) {
  const [reports, setReports] = useState<AdminQuestionReportItem[]>(initialReports);
  const [selectedStatus, setSelectedStatus] = useState<string>(initialStatus);
  const [selectedIssueType, setSelectedIssueType] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [activeReport, setActiveReport] = useState<AdminQuestionReportItem | null>(null);
  const [resolutionStatus, setResolutionStatus] = useState<string>("UNDER_REVIEW");
  const [resolutionNotes, setResolutionNotes] = useState<string>("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateSuccessMessage, setUpdateSuccessMessage] = useState<string | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);

  // D-5: one count per status, the same predicate the filter uses (r.status === key)
  const countOf = (key: string) => (key === "ALL" ? reports.length : reports.filter((r) => r.status === key).length);
  const stats: StudioStat[] = STATUS_FILTERS.map((f) => ({ key: f.key, label: f.label, tone: f.tone, value: countOf(f.key), active: selectedStatus === f.key }));

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
    setUpdateError(null);
  };

  const handleUpdateStatus = async (reportId: string, newStatus: string, notes: string) => {
    setIsUpdating(true);
    setUpdateSuccessMessage(null);
    setUpdateError(null);
    try {
      const res = await fetch("/api/admin/reports/update-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId, status: newStatus, resolutionNotes: notes }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        const patch = { status: newStatus as AdminQuestionReportItem["status"], resolutionNotes: notes };
        setReports((prev) => prev.map((r) => (r.id === reportId ? { ...r, ...patch } : r)));
        if (activeReport?.id === reportId) setActiveReport((prev) => (prev ? { ...prev, ...patch } : null));
        setUpdateSuccessMessage("Saved.");
      } else {
        setUpdateError(data.error || "The status could not be saved. Nothing was changed.");
      }
    } catch (err) {
      console.error("[AdminQuestionReportsManager] Update error:", err);
      setUpdateError("The server could not be reached. Nothing was changed.");
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <StudioStatStrip label="Reports by status (select to filter)" stats={stats} onSelect={setSelectedStatus} />

      <section aria-label="Filter reports" className="flex flex-wrap items-end gap-3 rounded-card border border-line bg-surface p-[14px]">
        <StudioField label="Search" htmlFor="qr-search" className="min-w-[14rem] flex-1">
          <div className="relative">
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
            <input id="qr-search" type="search" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Question text, student message or report id" className={`${studioControl} pl-9`} />
          </div>
        </StudioField>
        <StudioField label="Status" htmlFor="qr-status">
          <select id="qr-status" value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value)} className={studioControl}>
            {STATUS_FILTERS.map((f) => (
              <option key={f.key} value={f.key}>
                {f.key === "ALL" ? "All statuses" : f.label}
              </option>
            ))}
          </select>
        </StudioField>
        <StudioField label="Issue" htmlFor="qr-issue">
          <select id="qr-issue" value={selectedIssueType} onChange={(e) => setSelectedIssueType(e.target.value)} className={studioControl}>
            <option value="ALL">All issues</option>
            {Object.keys(ISSUE_LABEL).map((k) => (
              <option key={k} value={k}>
                {ISSUE_LABEL[k]}
              </option>
            ))}
          </select>
        </StudioField>
        <p className="min-h-10 content-center text-[13px] text-fg-secondary" aria-live="polite">
          {filteredReports.length} {filteredReports.length === 1 ? "report" : "reports"}
        </p>
      </section>

      <section aria-label="Reports" className="rounded-card border border-line bg-surface">
        {filteredReports.length === 0 ? (
          <StudioEmpty
            title={reports.length === 0 ? "No reports yet" : "No reports match these filters"}
            body={reports.length === 0 ? "When a student reports a question, it appears here." : "Clear the search or pick another status."}
          />
        ) : (
          <ul className="divide-y divide-line">
            {filteredReports.map((r) => {
              const maskedCandidate = `CL••••${(r.reporterUserId || "user").slice(-4)}`;
              return (
                <li key={r.id}>
                  <button type="button" onClick={() => handleSelectReport(r)} className="focus-ring flex w-full flex-col gap-1 px-[18px] py-3 text-left hover:bg-ink-50" data-report-row="">
                    <span className="flex w-full flex-wrap items-center justify-between gap-2">
                      <span className="text-[13px] font-semibold text-fg">{issueLabel(r.issueType)}</span>
                      <StatusChip status={r.status} />
                    </span>
                    <span className="line-clamp-2 text-[13px] text-fg">{r.questionText || "Question text unavailable"}</span>
                    <span className="flex w-full flex-wrap justify-between gap-2 text-[12px] text-fg-secondary">
                      <span>
                        Student {maskedCandidate} · #{r.id.slice(0, 8)}
                      </span>
                      <time dateTime={r.createdAt}>{new Date(r.createdAt).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })}</time>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <StudioDrawer
        open={!!activeReport}
        onClose={() => setActiveReport(null)}
        title={activeReport ? issueLabel(activeReport.issueType) : "Report"}
        subtitle={activeReport ? <span className="flex items-center gap-2">#{activeReport.id.slice(0, 8)} <StatusChip status={activeReport.status} /></span> : null}
        footer={
          activeReport ? (
            <button type="button" disabled={isUpdating} onClick={() => handleUpdateStatus(activeReport.id, resolutionStatus, resolutionNotes)} className={studioPrimaryAction}>
              {isUpdating ? "Saving…" : "Save status"}
            </button>
          ) : null
        }
      >
        {activeReport && (
          <div className="flex flex-col gap-4 text-[13px]">
            <section className="space-y-1.5">
              <h3 className="text-[11.5px] font-semibold uppercase tracking-[.08em] text-ink-500">Reported question</h3>
              <p className="whitespace-pre-wrap rounded-control border border-line bg-ink-50 p-3 text-fg">{activeReport.questionText || "No question text available"}</p>
              {/* Q7: open the reported question in the admin question editor (admin side; no access change) */}
              {activeReport.questionId && (
                <Link
                  href={`/admin/questions?question=${encodeURIComponent(activeReport.questionId)}`}
                  data-open-question
                  className="focus-ring inline-flex min-h-11 items-center font-semibold text-link underline underline-offset-2"
                >
                  Open question
                </Link>
              )}
            </section>

            <section className="space-y-1.5">
              <h3 className="text-[11.5px] font-semibold uppercase tracking-[.08em] text-ink-500">Options and answer key</h3>
              {activeReport.correctOptionKey === null && <AnswerKeyUnavailableNotice scored />}
              {activeReport.options && activeReport.options.length > 0 ? (
                <ul className="space-y-1">
                  {activeReport.options.map((opt) => {
                    const right = activeReport.correctOptionKey !== null && opt.key === activeReport.correctOptionKey;
                    return (
                      <li key={opt.key} className={right ? "flex items-center justify-between gap-2 rounded-control border border-success-600 bg-success-50 px-3 py-2 font-semibold text-fg" : "flex items-center justify-between gap-2 rounded-control border border-line px-3 py-2 text-fg"}>
                        <span>
                          <span className="mr-1.5 font-bold">{opt.key}</span>
                          {opt.text}
                        </span>
                        {right && (
                          <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-success-700">
                            <Check aria-hidden="true" className="size-3.5" /> Answer key
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-fg-secondary">No options recorded.</p>
              )}
            </section>

            {activeReport.explanation && (
              <section className="space-y-1.5">
                <h3 className="text-[11.5px] font-semibold uppercase tracking-[.08em] text-ink-500">Explanation</h3>
                <p className="whitespace-pre-wrap rounded-control border border-line bg-ink-50 p-3 text-fg">{activeReport.explanation}</p>
              </section>
            )}

            <section className="space-y-1.5">
              <h3 className="text-[11.5px] font-semibold uppercase tracking-[.08em] text-ink-500">What the student said</h3>
              <div className="rounded-control border border-primary-200 bg-primary-50 p-3 text-fg">
                <p className="whitespace-pre-wrap">{activeReport.description}</p>
                {activeReport.suggestedFix && (
                  <p className="mt-2 border-t border-primary-200 pt-2">
                    <span className="font-semibold">Suggested fix: </span>
                    {activeReport.suggestedFix}
                  </p>
                )}
              </div>
            </section>

            <section className="space-y-3 border-t border-line pt-4">
              <StudioField label="Status" htmlFor="qr-resolution-status">
                <select id="qr-resolution-status" value={resolutionStatus} onChange={(e) => setResolutionStatus(e.target.value)} className={studioControl}>
                  <option value="OPEN">Open (not reviewed)</option>
                  <option value="UNDER_REVIEW">Under review</option>
                  <option value="VERIFIED">Verified (issue confirmed)</option>
                  <option value="RESOLVED">Resolved (fixed and closed)</option>
                  <option value="REJECTED">Dismissed (not an issue)</option>
                </select>
              </StudioField>
              <StudioField label="Internal note" htmlFor="qr-resolution-note">
                <textarea id="qr-resolution-note" value={resolutionNotes} onChange={(e) => setResolutionNotes(e.target.value)} placeholder="Why, and what was fixed (not shown to the student)" rows={3} className={`${studioControl} py-2`} />
              </StudioField>
              {updateSuccessMessage && (
                <p role="status" className="flex items-center gap-1.5 text-[13px] font-semibold text-success-700">
                  <CheckCircle2 aria-hidden="true" className="size-4" /> {updateSuccessMessage}
                </p>
              )}
              {updateError && (
                <p role="alert" className="flex items-center gap-1.5 text-[13px] font-semibold text-danger-700">
                  <AlertTriangle aria-hidden="true" className="size-4" /> {updateError}
                </p>
              )}
            </section>
          </div>
        )}
      </StudioDrawer>
    </div>
  );
}
