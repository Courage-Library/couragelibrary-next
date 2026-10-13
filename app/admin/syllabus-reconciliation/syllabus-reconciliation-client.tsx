"use client";

import React, { useState, useEffect, useCallback } from "react";
import { WorkbenchHeader } from "@/components/admin/syllabus-reconciliation/workbench-header";
import { ReadinessSummaryCards } from "@/components/admin/syllabus-reconciliation/readiness-summary-cards";
import { SyllabusTreeView } from "@/components/admin/syllabus-reconciliation/syllabus-tree-view";
import { WorkQueueTable } from "@/components/admin/syllabus-reconciliation/work-queue-table";
import { WorkItemDetailDrawer } from "@/components/admin/syllabus-reconciliation/work-item-detail-drawer";
import {
  FolderTree,
  ClipboardList,
  Columns2,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import type {
  SyllabusVersionListItem,
  SyllabusReadinessReport,
  TaxonomyWorkQueueItem,
} from "@/types/dynamic-syllabus-reconciliation";

export default function SyllabusReconciliationPage() {
  const [versions, setVersions] = useState<SyllabusVersionListItem[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [report, setReport] = useState<SyllabusReadinessReport | null>(null);
  const [workQueue, setWorkQueue] = useState<TaxonomyWorkQueueItem[]>([]);
  const [workQueueTotalCount, setWorkQueueTotalCount] = useState<number>(0);
  const [workQueuePage, setWorkQueuePage] = useState<number>(1);
  const [workQueueLimit, setWorkQueueLimit] = useState<number>(20);
  const [workQueueTotalPages, setWorkQueueTotalPages] = useState<number>(1);

  // Filters
  const [selectedPriority, setSelectedPriority] = useState<string>("ALL");
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL");
  const [onlyBlocking, setOnlyBlocking] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Drawer / Selection
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"SPLIT" | "TREE_ONLY" | "QUEUE_ONLY">("SPLIT");

  // Loading & Errors
  const [isLoadingVersions, setIsLoadingVersions] = useState<boolean>(true);
  const [isLoadingDetail, setIsLoadingDetail] = useState<boolean>(false);
  const [isLoadingQueue, setIsLoadingQueue] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // 1. Fetch Syllabus Versions
  const fetchVersions = useCallback(async () => {
    setIsLoadingVersions(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/syllabus-reconciliation/versions?limit=50");
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || "Failed to load syllabus versions");
      }
      const list: SyllabusVersionListItem[] = json.data?.versions || [];
      setVersions(list);
      if (list.length > 0 && !selectedVersionId) {
        // Select active or first
        const active = list.find((v) => v.isActive);
        setSelectedVersionId(active ? active.id : list[0].id);
      }
    } catch (err: any) {
      setError(err.message || "Failed to fetch syllabus versions");
    } finally {
      setIsLoadingVersions(false);
    }
  }, [selectedVersionId]);

  useEffect(() => {
    fetchVersions();
  }, [fetchVersions]);

  // 2. Fetch Readiness Report for Selected Version
  const fetchReport = useCallback(async (versionId: string) => {
    setIsLoadingDetail(true);
    try {
      const res = await fetch(`/api/admin/syllabus-reconciliation/versions/${versionId}`);
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || "Failed to load syllabus readiness report");
      }
      setReport(json.data);
    } catch (err: any) {
      setError(err.message || "Failed to load syllabus version readiness");
    } finally {
      setIsLoadingDetail(false);
    }
  }, []);

  // 3. Fetch Work Queue
  const fetchWorkQueue = useCallback(
    async (versionId: string, page = 1, limit = 20) => {
      setIsLoadingQueue(true);
      try {
        const params = new URLSearchParams({
          syllabusVersionId: versionId,
          page: String(page),
          limit: String(limit),
        });

        if (selectedPriority !== "ALL") {
          params.append("priority", selectedPriority);
        }
        if (selectedStatus !== "ALL") {
          params.append("readinessState", selectedStatus);
        }
        if (onlyBlocking) {
          params.append("isMandatory", "true");
        }
        if (searchQuery.trim()) {
          params.append("search", searchQuery.trim());
        }

        const res = await fetch(`/api/admin/syllabus-reconciliation/work-queue?${params.toString()}`);
        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(json.error?.message || "Failed to load work queue");
        }
        setWorkQueue(json.data?.items || []);
        setWorkQueueTotalCount(json.data?.totalCount || 0);
        setWorkQueuePage(json.data?.page || 1);
        setWorkQueueTotalPages(json.data?.totalPages || 1);
      } catch (err: any) {
        console.error("Failed to fetch work queue:", err);
      } finally {
        setIsLoadingQueue(false);
      }
    },
    [selectedPriority, selectedStatus, onlyBlocking, searchQuery]
  );

  // Trigger data fetches when selectedVersionId changes
  useEffect(() => {
    if (selectedVersionId) {
      fetchReport(selectedVersionId);
      fetchWorkQueue(selectedVersionId, workQueuePage, workQueueLimit);
    }
  }, [selectedVersionId, fetchReport, fetchWorkQueue, workQueuePage, workQueueLimit]);

  // Combined Refresh
  const handleRefresh = async () => {
    if (selectedVersionId) {
      await Promise.all([
        fetchReport(selectedVersionId),
        fetchWorkQueue(selectedVersionId, workQueuePage, workQueueLimit),
      ]);
    } else {
      await fetchVersions();
    }
  };

  // On successful resolution mutation
  const handleResolutionSuccess = async () => {
    if (selectedVersionId) {
      await Promise.all([
        fetchReport(selectedVersionId),
        fetchWorkQueue(selectedVersionId, workQueuePage, workQueueLimit),
      ]);
    }
  };

  const selectedVersion = versions.find((v) => v.id === selectedVersionId) || null;
  const blockingCount = report?.workQueue?.filter((i) => i.isBlocking)?.length || 0;

  return (
    <div className="min-h-screen bg-[#090D16] text-slate-100 p-3 md:p-6 space-y-6 max-w-[1800px] mx-auto">
      {/* 1. Top Header & Version Selector */}
      <WorkbenchHeader
        versions={versions}
        selectedVersionId={selectedVersionId}
        onSelectVersion={(vId) => {
          setSelectedVersionId(vId);
          setSelectedNodeId(null);
          setWorkQueuePage(1);
        }}
        isLoading={isLoadingVersions || isLoadingDetail}
        onRefresh={handleRefresh}
        selectedVersion={selectedVersion}
        report={report}
      />

      {/* Global Error Notice */}
      {error && (
        <div className="p-4 bg-rose-950/60 border border-rose-800 rounded-xl text-rose-200 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={handleRefresh}
            className="text-rose-300 underline font-medium hover:text-white"
          >
            Retry
          </button>
        </div>
      )}

      {/* 2. Readiness Summary Cards & Progress Distribution */}
      <ReadinessSummaryCards
        summary={report?.summary || null}
        blockingCount={blockingCount}
      />

      {/* 3. View Mode Switcher (Split / Tree Only / Queue Only) */}
      <div className="flex items-center justify-between gap-4 pt-2">
        <div className="flex items-center gap-1.5 p-1 bg-slate-900 border border-slate-800 rounded-lg text-xs">
          <button
            onClick={() => setViewMode("SPLIT")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md transition ${
              viewMode === "SPLIT"
                ? "bg-blue-600 text-white font-semibold"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Columns2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Split View</span>
          </button>
          <button
            onClick={() => setViewMode("TREE_ONLY")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md transition ${
              viewMode === "TREE_ONLY"
                ? "bg-blue-600 text-white font-semibold"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <FolderTree className="w-3.5 h-3.5" />
            <span>Hierarchy Tree</span>
          </button>
          <button
            onClick={() => setViewMode("QUEUE_ONLY")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md transition ${
              viewMode === "QUEUE_ONLY"
                ? "bg-blue-600 text-white font-semibold"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <ClipboardList className="w-3.5 h-3.5" />
            <span>Work Queue</span>
          </button>
        </div>

        {selectedNodeId && (
          <div className="text-xs text-blue-400 font-mono flex items-center gap-1.5">
            <span>Selected Node:</span>
            <code className="bg-slate-900 px-2 py-0.5 rounded border border-slate-800 text-[11px]">
              {selectedNodeId.slice(0, 8)}...
            </code>
          </div>
        )}
      </div>

      {/* 4. Main Workbench Workspace (Tree View + Work Queue) */}
      <div className="space-y-6">
        {viewMode === "SPLIT" ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left 5 Cols: Interactive Recursive Syllabus Tree */}
            <div className="lg:col-span-5">
              <SyllabusTreeView
                tree={report?.tree || []}
                selectedNodeId={selectedNodeId}
                onSelectNode={(nId) => setSelectedNodeId(nId)}
                isLoading={isLoadingDetail}
              />
            </div>

            {/* Right 7 Cols: Deterministic Work Queue Table */}
            <div className="lg:col-span-7">
              <WorkQueueTable
                items={workQueue}
                totalCount={workQueueTotalCount}
                page={workQueuePage}
                limit={workQueueLimit}
                totalPages={workQueueTotalPages}
                onPageChange={(p) => setWorkQueuePage(p)}
                onLimitChange={(l) => {
                  setWorkQueueLimit(l);
                  setWorkQueuePage(1);
                }}
                selectedPriority={selectedPriority}
                onPriorityChange={(p) => {
                  setSelectedPriority(p);
                  setWorkQueuePage(1);
                }}
                selectedStatus={selectedStatus}
                onStatusChange={(s) => {
                  setSelectedStatus(s);
                  setWorkQueuePage(1);
                }}
                onlyBlocking={onlyBlocking}
                onToggleBlocking={(b) => {
                  setOnlyBlocking(b);
                  setWorkQueuePage(1);
                }}
                searchQuery={searchQuery}
                onSearchChange={(q) => {
                  setSearchQuery(q);
                  setWorkQueuePage(1);
                }}
                onSelectNode={(nId) => setSelectedNodeId(nId)}
                selectedNodeId={selectedNodeId}
                isLoading={isLoadingQueue}
              />
            </div>
          </div>
        ) : viewMode === "TREE_ONLY" ? (
          <div>
            <SyllabusTreeView
              tree={report?.tree || []}
              selectedNodeId={selectedNodeId}
              onSelectNode={(nId) => setSelectedNodeId(nId)}
              isLoading={isLoadingDetail}
            />
          </div>
        ) : (
          <div>
            <WorkQueueTable
              items={workQueue}
              totalCount={workQueueTotalCount}
              page={workQueuePage}
              limit={workQueueLimit}
              totalPages={workQueueTotalPages}
              onPageChange={(p) => setWorkQueuePage(p)}
              onLimitChange={(l) => {
                setWorkQueueLimit(l);
                setWorkQueuePage(1);
              }}
              selectedPriority={selectedPriority}
              onPriorityChange={(p) => {
                setSelectedPriority(p);
                setWorkQueuePage(1);
              }}
              selectedStatus={selectedStatus}
              onStatusChange={(s) => {
                setSelectedStatus(s);
                setWorkQueuePage(1);
              }}
              onlyBlocking={onlyBlocking}
              onToggleBlocking={(b) => {
                setOnlyBlocking(b);
                setWorkQueuePage(1);
              }}
              searchQuery={searchQuery}
              onSearchChange={(q) => {
                setSearchQuery(q);
                setWorkQueuePage(1);
              }}
              onSelectNode={(nId) => setSelectedNodeId(nId)}
              selectedNodeId={selectedNodeId}
              isLoading={isLoadingQueue}
            />
          </div>
        )}
      </div>

      {/* 5. Slide-Over Detail Drawer */}
      {selectedVersionId && (
        <WorkItemDetailDrawer
          nodeId={selectedNodeId}
          syllabusVersionId={selectedVersionId}
          onClose={() => setSelectedNodeId(null)}
          onResolutionSuccess={handleResolutionSuccess}
          rootTree={report?.tree || []}
        />
      )}
    </div>
  );
}
