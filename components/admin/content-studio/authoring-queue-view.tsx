"use client";

import React, { useState, useMemo, useEffect } from "react";
import {
  AuthoringQueueTask,
  AuthoringWorkflowStatus,
  AuthoringTaskPriority,
} from "@/types/authoring-queue";
import { DocumentType } from "@/types/learning-compiler";
import { CANONICAL_DOCUMENT_TYPES } from "@/types/curriculum-coverage";
import {
  getAuthoringQueueAction,
  generateTaskPromptAction,
  generateBatchPromptBundleAction,
  importTaskOutputAction,
} from "@/app/admin/content/actions";
import {
  ListTodo,
  Layers,
  Sparkles,
  FileCode,
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  Copy,
  Check,
  Download,
  Upload,
  Search,
  Filter,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  FileText,
  ChevronDown,
  HelpCircle,
  Hash,
  BrainCircuit,
  Maximize2,
} from "lucide-react";

interface Props {
  initialQueue?: AuthoringQueueTask[];
  onSelectUnitDocType?: (unitId: string, docType: DocumentType) => void;
}

const STATUS_CONFIG: Record<
  AuthoringWorkflowStatus,
  { label: string; bg: string; text: string; border: string; icon: any }
> = {
  PENDING: {
    label: "Pending",
    bg: "bg-slate-50",
    text: "text-slate-600",
    border: "border-slate-200",
    icon: Clock,
  },
  PROMPT_READY: {
    label: "Prompt Ready",
    bg: "bg-sky-50",
    text: "text-sky-800",
    border: "border-sky-200",
    icon: Sparkles,
  },
  PROMPT_COPIED: {
    label: "Prompt Copied",
    bg: "bg-blue-50",
    text: "text-blue-800",
    border: "border-blue-200",
    icon: Copy,
  },
  AWAITING_EXTERNAL_AI: {
    label: "Awaiting AI",
    bg: "bg-amber-50",
    text: "text-amber-800",
    border: "border-amber-200",
    icon: BrainCircuit,
  },
  OUTPUT_RECEIVED: {
    label: "Output Received",
    bg: "bg-indigo-50",
    text: "text-indigo-800",
    border: "border-indigo-200",
    icon: Download,
  },
  VALIDATED: {
    label: "Validated",
    bg: "bg-cyan-50",
    text: "text-cyan-800",
    border: "border-cyan-200",
    icon: ShieldCheck,
  },
  IN_REVIEW: {
    label: "In Review",
    bg: "bg-purple-50",
    text: "text-purple-800",
    border: "border-purple-200",
    icon: Clock,
  },
  APPROVED: {
    label: "Approved",
    bg: "bg-blue-50",
    text: "text-blue-800",
    border: "border-blue-200",
    icon: CheckCircle2,
  },
  COMPILED: {
    label: "Compiled",
    bg: "bg-teal-50",
    text: "text-teal-800",
    border: "border-teal-200",
    icon: FileCode,
  },
  PUBLISHED: {
    label: "Published",
    bg: "bg-emerald-50",
    text: "text-emerald-800",
    border: "border-emerald-200",
    icon: CheckCircle2,
  },
  VALIDATION_FAILED: {
    label: "Validation Failed",
    bg: "bg-rose-50",
    text: "text-rose-800",
    border: "border-rose-200",
    icon: XCircle,
  },
  REJECTED: {
    label: "Rejected",
    bg: "bg-red-50",
    text: "text-red-800",
    border: "border-red-200",
    icon: AlertTriangle,
  },
  CANCELLED: {
    label: "Cancelled",
    bg: "bg-slate-100",
    text: "text-slate-500",
    border: "border-slate-300",
    icon: XCircle,
  },
};

const PRIORITY_BADGES: Record<AuthoringTaskPriority, { label: string; bg: string; text: string }> = {
  CRITICAL: { label: "Critical Priority", bg: "bg-rose-100 text-rose-800 border border-rose-200", text: "text-rose-800" },
  HIGH: { label: "High Priority", bg: "bg-orange-100 text-orange-800 border border-orange-200", text: "text-orange-800" },
  NORMAL: { label: "Normal Priority", bg: "bg-amber-50 text-amber-800 border border-amber-200", text: "text-amber-800" },
  LOW: { label: "Low Priority", bg: "bg-slate-100 text-slate-700 border border-slate-200", text: "text-slate-700" },
};

export function AuthoringQueueView({ initialQueue = [], onSelectUnitDocType }: Props) {
  const [tasks, setTasks] = useState<AuthoringQueueTask[]>(initialQueue);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  
  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [priorityFilter, setPriorityFilter] = useState<string>("ALL");
  const [docTypeFilter, setDocTypeFilter] = useState<string>("ALL");
  const [subjectFilter, setSubjectFilter] = useState<string>("ALL");

  // Modal States
  const [activePromptModal, setActivePromptModal] = useState<{
    title: string;
    markdown: string;
    taskCount: number;
  } | null>(null);
  
  const [importModalTask, setImportModalTask] = useState<AuthoringQueueTask | null>(null);
  const [rawJsonInput, setRawJsonInput] = useState("");
  const [aiTool, setAiTool] = useState("Claude 3.5 Sonnet");
  const [aiModel, setAiModel] = useState("claude-3-5-sonnet-20241022");
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<any | null>(null);
  const [copiedNotification, setCopiedNotification] = useState(false);

  // Load queue if not initialized
  const refreshQueue = async () => {
    setIsLoading(true);
    try {
      const res = await getAuthoringQueueAction();
      if (res.success && res.queue) {
        setTasks(res.queue);
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (initialQueue.length === 0) {
      refreshQueue();
    }
  }, []);

  // Filter tasks
  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (statusFilter !== "ALL" && t.workflowStatus !== statusFilter) return false;
      if (priorityFilter !== "ALL" && t.priority !== priorityFilter) return false;
      if (docTypeFilter !== "ALL" && t.documentType !== docTypeFilter) return false;
      if (subjectFilter !== "ALL" && t.subjectName !== subjectFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = (t.learningUnitTitle || t.unitTitle || "").toLowerCase().includes(q);
        const matchSlug = (t.learningUnitSlug || t.unitSlug || "").toLowerCase().includes(q);
        const matchTopic = (t.topicName || "").toLowerCase().includes(q);
        const matchSubject = (t.subjectName || "").toLowerCase().includes(q);
        if (!matchTitle && !matchSlug && !matchTopic && !matchSubject) return false;
      }
      return true;
    });
  }, [tasks, statusFilter, priorityFilter, docTypeFilter, subjectFilter, searchQuery]);

  // Unique subjects for filter
  const uniqueSubjects = useMemo(() => {
    const set = new Set<string>();
    tasks.forEach((t) => {
      if (t.subjectName) set.add(t.subjectName);
    });
    return Array.from(set).sort();
  }, [tasks]);

  // Summary Metrics
  const summary = useMemo(() => {
    const total = tasks.length;
    const pending = tasks.filter((t) => t.workflowStatus === "PENDING").length;
    const promptReady = tasks.filter((t) => t.workflowStatus === "PROMPT_READY" || t.workflowStatus === "PROMPT_COPIED" || t.workflowStatus === "AWAITING_EXTERNAL_AI").length;
    const inReview = tasks.filter((t) => t.workflowStatus === "IN_REVIEW").length;
    const published = tasks.filter((t) => t.workflowStatus === "PUBLISHED").length;
    const failed = tasks.filter((t) => t.workflowStatus === "VALIDATION_FAILED" || t.workflowStatus === "REJECTED").length;
    return { total, pending, promptReady, inReview, published, failed };
  }, [tasks]);

  // Handle Multi-Select
  const toggleSelectTask = (taskId: string) => {
    setSelectedTaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedTaskIds.size === filteredTasks.length) {
      setSelectedTaskIds(new Set());
    } else {
      setSelectedTaskIds(new Set(filteredTasks.map((t) => t.id)));
    }
  };

  // Generate Single Prompt
  const handleGenerateSinglePrompt = async (task: AuthoringQueueTask) => {
    setIsLoading(true);
    try {
      const res = await generateTaskPromptAction({
        learningUnitId: task.learningUnitId,
        documentType: task.documentType,
        targetExamId: task.targetExamId,
      });
      if (res.success && res.prompt) {
        setActivePromptModal({
          title: `Prompt: ${task.learningUnitTitle || task.unitTitle} (${task.documentType})`,
          markdown: res.prompt.promptMarkdown || res.prompt.promptText || "",
          taskCount: 1,
        });
        // Optimistically update status to PROMPT_COPIED
        setTasks((prev) =>
          prev.map((t) =>
            t.id === task.id ? { ...t, workflowStatus: "PROMPT_COPIED" } : t
          )
        );
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Generate Batch Prompt Bundle
  const handleGenerateBatchBundle = async () => {
    if (selectedTaskIds.size === 0) return;
    setIsLoading(true);
    try {
      const res = await generateBatchPromptBundleAction({
        taskIds: Array.from(selectedTaskIds),
      });
      if (res.success && res.bundle) {
        setActivePromptModal({
          title: `Batch Prompt Bundle (${res.bundle.taskCount} Tasks)`,
          markdown: res.bundle.bundleMarkdown || res.bundle.bundleText || "",
          taskCount: res.bundle.taskCount,
        });
        // Update all selected tasks to PROMPT_COPIED
        setTasks((prev) =>
          prev.map((t) =>
            selectedTaskIds.has(t.id) ? { ...t, workflowStatus: "PROMPT_COPIED" } : t
          )
        );
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Import Submit
  const handleImportSubmit = async () => {
    if (!importModalTask || !rawJsonInput.trim()) return;
    setImportLoading(true);
    setImportError(null);
    setImportSuccess(null);

    try {
      const res = await importTaskOutputAction({
        learningUnitId: importModalTask.learningUnitId,
        documentType: importModalTask.documentType,
        targetExamId: importModalTask.targetExamId,
        rawInput: rawJsonInput,
        aiToolUsed: aiTool,
        aiModelVersion: aiModel,
        expectedContextHash: importModalTask.contextHash || undefined,
      });

      if (!res.success) {
        setImportError(res.error || "Import failed");
      } else {
        setImportSuccess(res.result);
        await refreshQueue();
      }
    } catch (err: any) {
      setImportError(err.message || "Import error");
    } finally {
      setImportLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedNotification(true);
    setTimeout(() => setCopiedNotification(false), 2000);
  };

  return (
    <div className="flex flex-col gap-6 p-6 max-w-[1600px] mx-auto">
      {/* Header & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-700 text-white shadow-xs">
            <ListTodo className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-black text-slate-900 text-xl flex items-center gap-2">
              Controlled Authoring Queue
              <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-800 border border-blue-200">
                Phase 3F.4
              </span>
            </h1>
            <p className="text-xs text-slate-500">
              Human-operated batch prompt generation, structured AI ingestion, and revision management
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={refreshQueue}
            disabled={isLoading}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 disabled:opacity-50 transition"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
            Refresh Queue
          </button>
          
          <button
            type="button"
            onClick={handleGenerateBatchBundle}
            disabled={selectedTaskIds.size === 0 || isLoading}
            className="flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            <Sparkles className="h-4 w-4" />
            Generate Batch Prompt Bundle ({selectedTaskIds.size})
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Tasks</span>
          <p className="mt-1 text-2xl font-black text-slate-900">{summary.total}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Pending Tasks</span>
          <p className="mt-1 text-2xl font-black text-slate-600">{summary.pending}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs">
          <span className="text-[11px] font-bold text-sky-700 uppercase tracking-wider">Prompt In Flight</span>
          <p className="mt-1 text-2xl font-black text-sky-700">{summary.promptReady}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs">
          <span className="text-[11px] font-bold text-purple-700 uppercase tracking-wider">In Review</span>
          <p className="mt-1 text-2xl font-black text-purple-700">{summary.inReview}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs">
          <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">Published Docs</span>
          <p className="mt-1 text-2xl font-black text-emerald-700">{summary.published}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs">
          <span className="text-[11px] font-bold text-rose-700 uppercase tracking-wider">Validation Failed</span>
          <p className="mt-1 text-2xl font-black text-rose-700">{summary.failed}</p>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-2xs">
        <div className="flex flex-1 items-center gap-2 min-w-[260px]">
          <Search className="h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by unit title, slug, topic, subject..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-transparent text-xs font-medium text-slate-900 outline-none placeholder:text-slate-400"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={subjectFilter}
            onChange={(e) => setSubjectFilter(e.target.value)}
            aria-label="Filter by Subject"
            className="rounded-lg border border-slate-200 bg-slate-50/50 px-2.5 py-1.5 text-xs font-semibold text-slate-700 focus:border-blue-600 focus:outline-none"
          >
            <option value="ALL">All Subjects</option>
            {uniqueSubjects.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          <select
            value={docTypeFilter}
            onChange={(e) => setDocTypeFilter(e.target.value)}
            aria-label="Filter by Document Type"
            className="rounded-lg border border-slate-200 bg-slate-50/50 px-2.5 py-1.5 text-xs font-semibold text-slate-700 focus:border-blue-600 focus:outline-none"
          >
            <option value="ALL">All Document Types</option>
            {CANONICAL_DOCUMENT_TYPES.map((dt) => (
              <option key={dt} value={dt}>{dt.replace(/_/g, " ")}</option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter by Workflow Status"
            className="rounded-lg border border-slate-200 bg-slate-50/50 px-2.5 py-1.5 text-xs font-semibold text-slate-700 focus:border-blue-600 focus:outline-none"
          >
            <option value="ALL">All Workflow Statuses</option>
            {Object.keys(STATUS_CONFIG).map((s) => (
              <option key={s} value={s}>{STATUS_CONFIG[s as AuthoringWorkflowStatus].label}</option>
            ))}
          </select>

          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            aria-label="Filter by Priority"
            className="rounded-lg border border-slate-200 bg-slate-50/50 px-2.5 py-1.5 text-xs font-semibold text-slate-700 focus:border-blue-600 focus:outline-none"
          >
            <option value="ALL">All Priorities</option>
            <option value="CRITICAL">Critical Priority</option>
            <option value="HIGH">High Priority</option>
            <option value="NORMAL">Normal Priority</option>
            <option value="LOW">Low Priority</option>
          </select>
        </div>
      </div>

      {/* Tasks Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
              <tr>
                <th className="p-3 text-center w-10">
                  <input
                    type="checkbox"
                    checked={filteredTasks.length > 0 && selectedTaskIds.size === filteredTasks.length}
                    onChange={toggleSelectAll}
                    aria-label="Select all authoring tasks"
                    className="rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                  />
                </th>
                <th className="p-3">Priority</th>
                <th className="p-3">Learning Unit & Hierarchy</th>
                <th className="p-3">Document Type</th>
                <th className="p-3">Questions</th>
                <th className="p-3">Workflow Status</th>
                <th className="p-3">Context Hash</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredTasks.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-400">
                    No authoring tasks found matching the selected filters.
                  </td>
                </tr>
              ) : (
                filteredTasks.map((task) => {
                  const statusConf = STATUS_CONFIG[task.workflowStatus] || STATUS_CONFIG.PENDING;
                  const prioConf = PRIORITY_BADGES[task.priority] || PRIORITY_BADGES.NORMAL;
                  const StatusIcon = statusConf.icon;
                  const isSelected = selectedTaskIds.has(task.id);

                  return (
                    <tr
                      key={task.id}
                      className={`hover:bg-slate-50/80 transition ${
                        isSelected ? "bg-blue-50/40" : ""
                      }`}
                    >
                      <td className="p-3 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectTask(task.id)}
                          aria-label={`Select task for ${task.learningUnitTitle || task.unitTitle} - ${task.documentType}`}
                          className="rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                        />
                      </td>
                      <td className="p-3">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${prioConf.bg}`}>
                          {prioConf.label}
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-900">
                            {task.learningUnitTitle || task.unitTitle}
                          </span>
                          <span className="text-[11px] text-slate-500 font-medium">
                            {task.subjectName} &gt; {task.topicName}
                          </span>
                        </div>
                      </td>
                      <td className="p-3">
                        <span className="rounded-md bg-slate-100 px-2 py-1 font-mono text-[11px] font-semibold text-slate-700 border border-slate-200/60">
                          {task.documentType.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="p-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            task.questionCount > 0
                              ? "bg-blue-50 text-blue-800 border border-blue-200/60"
                              : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          {task.questionCount} {task.questionCount === 1 ? "Q" : "Qs"}
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold border shadow-2xs ${statusConf.bg} ${statusConf.text} ${statusConf.border}`}
                          >
                            <StatusIcon className="h-3 w-3" />
                            {statusConf.label}
                          </span>
                        </div>
                      </td>
                      <td className="p-3">
                        <span className="font-mono text-[10px] text-slate-400">
                          {task.contextHash ? `${task.contextHash.substring(0, 8)}...` : "—"}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            title="Generate / Copy Prompt"
                            onClick={() => handleGenerateSinglePrompt(task)}
                            className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-2xs"
                          >
                            <Sparkles className="h-3 w-3 text-blue-700" />
                            Prompt
                          </button>

                          <button
                            type="button"
                            title="Import AI Output JSON"
                            onClick={() => {
                              setImportModalTask(task);
                              setRawJsonInput("");
                              setImportError(null);
                              setImportSuccess(null);
                            }}
                            className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-2xs"
                          >
                            <Upload className="h-3 w-3 text-indigo-700" />
                            Import
                          </button>

                          {onSelectUnitDocType && (
                            <button
                              type="button"
                              title="Open in Academic Studio"
                              onClick={() => onSelectUnitDocType(task.learningUnitId, task.documentType)}
                              className="flex items-center gap-1 rounded-lg bg-slate-100 p-1.5 text-slate-600 hover:bg-slate-200 transition"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Prompt Modal (Single or Batch) */}
      {activePromptModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-blue-700" />
                <h3 className="font-bold text-slate-900 text-sm">
                  {activePromptModal.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setActivePromptModal(null)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                &times;
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <div className="mb-4 flex items-center justify-between rounded-lg bg-slate-50 p-3 border border-slate-200">
                <span className="text-xs text-slate-600">
                  Copy this prompt into your external AI tool (ChatGPT 4o, Claude 3.5 Sonnet, DeepSeek R1, etc.)
                </span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(activePromptModal.markdown)}
                  className="flex items-center gap-1.5 rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-800 shadow-2xs transition"
                >
                  {copiedNotification ? (
                    <>
                      <Check className="h-3.5 w-3.5" /> Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" /> Copy Prompt
                    </>
                  )}
                </button>
              </div>

              <textarea
                readOnly
                value={activePromptModal.markdown}
                className="h-96 w-full rounded-xl border border-slate-200 bg-slate-50/50 p-4 font-mono text-xs text-slate-800 outline-none leading-relaxed"
              />
            </div>

            <div className="flex items-center justify-end border-t border-slate-200 px-6 py-3">
              <button
                type="button"
                onClick={() => setActivePromptModal(null)}
                className="rounded-lg bg-slate-100 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* JSON Output Ingestion Modal */}
      {importModalTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl bg-white shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div className="flex items-center gap-2">
                <Upload className="h-5 w-5 text-blue-700" />
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">
                    Import AI Output: {importModalTask.learningUnitTitle || importModalTask.unitTitle}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Target Document: {importModalTask.documentType.replace(/_/g, " ")}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setImportModalTask(null)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                &times;
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {importError && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800 flex items-start gap-2">
                  <XCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-600" />
                  <div>
                    <p className="font-bold">Validation / Ingestion Error:</p>
                    <p className="mt-0.5">{importError}</p>
                  </div>
                </div>
              )}

              {importSuccess && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-emerald-600" />
                  <div>
                    <p className="font-bold">Import Successful!</p>
                    <p className="mt-0.5">
                      Draft version created and validated ({importSuccess.documentVersion?.version_number ? `v${importSuccess.documentVersion.version_number}` : "Draft"}).
                    </p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    AI Tool Used
                  </label>
                  <select
                    value={aiTool}
                    onChange={(e) => setAiTool(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50/50 p-2 text-xs font-medium text-slate-800 outline-none focus:border-blue-600"
                  >
                    <option value="Claude 3.5 Sonnet">Claude 3.5 Sonnet</option>
                    <option value="ChatGPT 4o">ChatGPT 4o</option>
                    <option value="Gemini 1.5 Pro">Gemini 1.5 Pro</option>
                    <option value="DeepSeek R1">DeepSeek R1</option>
                    <option value="Other External AI">Other External AI</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Model / Checkpoint Version
                  </label>
                  <input
                    type="text"
                    value={aiModel}
                    onChange={(e) => setAiModel(e.target.value)}
                    placeholder="e.g. claude-3-5-sonnet-20241022"
                    className="w-full rounded-lg border border-slate-200 bg-slate-50/50 p-2 text-xs font-medium text-slate-800 outline-none focus:border-blue-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Raw Structured JSON Output from External AI
                </label>
                <textarea
                  value={rawJsonInput}
                  onChange={(e) => setRawJsonInput(e.target.value)}
                  placeholder="Paste the complete JSON output (or ```json markdown block) returned by the AI here..."
                  className="h-64 w-full rounded-xl border border-slate-200 bg-slate-50/50 p-3 font-mono text-xs text-slate-800 outline-none leading-relaxed focus:border-blue-600 focus:bg-white"
                />
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-slate-200 px-6 py-3">
              <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                4-Gate Validation & Context Hash Check Guaranteed
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setImportModalTask(null)}
                  className="rounded-lg bg-slate-100 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200 transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleImportSubmit}
                  disabled={importLoading || !rawJsonInput.trim()}
                  className="flex items-center gap-1.5 rounded-lg bg-blue-700 px-4 py-2 text-xs font-bold text-white hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-2xs"
                >
                  <Upload className="h-3.5 w-3.5" />
                  {importLoading ? "Validating & Ingesting..." : "Validate & Ingest Draft"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
