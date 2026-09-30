"use client";

import React, { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  X,
  ShieldAlert,
  Clock,
  Sparkles,
  ArrowRight,
  User,
  History,
  AlertTriangle,
  FolderTree,
  Tag,
  CheckCircle2,
  HelpCircle,
  EyeOff,
  XCircle,
  Undo2,
  FolderPlus,
  Network,
} from "lucide-react";
import type {
  WorkItemDetailResponse,
  ResolutionAction,
  ResolveWorkItemApiPayload,
  HierarchicalReadinessNode,
} from "@/types/dynamic-syllabus-reconciliation";
import { getStatusBadgeVariant } from "./syllabus-tree-view";
import { ResolutionDialogs } from "./resolution-dialogs";

interface WorkItemDetailDrawerProps {
  nodeId: string | null;
  syllabusVersionId: string;
  onClose: () => void;
  onResolutionSuccess: () => void;
  rootTree?: HierarchicalReadinessNode[];
}

export function WorkItemDetailDrawer({
  nodeId,
  syllabusVersionId,
  onClose,
  onResolutionSuccess,
  rootTree = [],
}: WorkItemDetailDrawerProps) {
  const [detail, setDetail] = useState<WorkItemDetailResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [conflictError, setConflictError] = useState<string | null>(null);

  const [activeAction, setActiveAction] = useState<ResolutionAction | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchWorkItemDetail = async () => {
    if (!nodeId) return;
    setIsLoading(true);
    setFetchError(null);
    try {
      const res = await fetch(`/api/admin/syllabus-reconciliation/work-item/${nodeId}`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || "Failed to load work item details");
      }
      setDetail(data.data);
      // Auto-select primary suggested action
      if (data.data?.availableActions?.length > 0) {
        setActiveAction(data.data.availableActions[0]);
      } else {
        setActiveAction(null);
      }
    } catch (err: any) {
      setFetchError(err.message || "An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (nodeId) {
      setConflictError(null);
      setActionError(null);
      fetchWorkItemDetail();
    } else {
      setDetail(null);
      setActiveAction(null);
    }
  }, [nodeId]);

  if (!nodeId) return null;

  const handleExecuteAction = async (payload: ResolveWorkItemApiPayload) => {
    setIsSubmitting(true);
    setActionError(null);
    setConflictError(null);
    try {
      const res = await fetch("/api/admin/syllabus-reconciliation/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        if (res.status === 409 || data.error?.code === "RESOLUTION_CONFLICT") {
          setConflictError(
            "This syllabus item changed before your action was completed. Reloading current state..."
          );
          await fetchWorkItemDetail();
          onResolutionSuccess();
          return;
        }
        throw new Error(data.error?.message || "Failed to execute resolution action");
      }

      // Success
      await fetchWorkItemDetail();
      onResolutionSuccess();
    } catch (err: any) {
      setActionError(err.message || "Failed to execute action");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getActionIcon = (action: ResolutionAction) => {
    switch (action) {
      case "ACCEPT_PROPOSED_MATCH":
        return <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" />;
      case "ACCEPT_EXISTING_MATCH":
        return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />;
      case "RESOLVE_AMBIGUOUS":
        return <HelpCircle className="w-3.5 h-3.5 text-purple-400" />;
      case "CREATE_NEW_CANONICAL_NODE":
        return <FolderPlus className="w-3.5 h-3.5 text-amber-400" />;
      case "CREATE_NEW_SUBJECT":
        return <FolderPlus className="w-3.5 h-3.5 text-rose-400" />;
      case "CREATE_NEW_SUBTREE":
        return <Network className="w-3.5 h-3.5 text-indigo-400" />;
      case "ADD_ALIAS":
        return <Tag className="w-3.5 h-3.5 text-teal-400" />;
      case "IGNORE_REQUIREMENT":
        return <EyeOff className="w-3.5 h-3.5 text-slate-400" />;
      case "REJECT_PROPOSAL":
        return <XCircle className="w-3.5 h-3.5 text-rose-400" />;
      case "UNMAP_AND_REVIEW":
        return <Undo2 className="w-3.5 h-3.5 text-amber-400" />;
      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full max-w-xl bg-slate-900 text-slate-200 border-l border-slate-800 shadow-2xl flex flex-col h-[100dvh] overflow-hidden">
      {/* Drawer Header */}
      <div className="p-4 border-b border-slate-800 bg-slate-950 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <FolderTree className="w-4 h-4 text-blue-400" />
          <h2 className="text-sm font-bold text-white tracking-tight">
            Work Item Resolution Detail
          </h2>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition"
          aria-label="Close drawer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Drawer Body */}
      <div className="flex-1 overflow-y-auto p-4 md:p-5 space-y-5">
        {isLoading && !detail ? (
          <div className="space-y-4 animate-pulse">
            <div className="h-6 bg-slate-800 rounded-sm w-3/4"></div>
            <div className="h-4 bg-slate-800 rounded-sm w-1/2"></div>
            <div className="h-28 bg-slate-800 rounded-lg"></div>
          </div>
        ) : fetchError ? (
          <div className="p-4 bg-rose-950/50 border border-rose-800 rounded-lg text-rose-200 text-xs space-y-2">
            <div className="font-semibold text-rose-300">Error Loading Work Item</div>
            <p>{fetchError}</p>
            <Button size="sm" variant="outline" onClick={fetchWorkItemDetail}>
              Retry
            </Button>
          </div>
        ) : detail ? (
          <>
            {/* 409 Conflict Banner */}
            {conflictError && (
              <div className="p-3 bg-amber-950/60 border border-amber-700 rounded-lg text-amber-200 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>{conflictError}</span>
              </div>
            )}

            {/* Action Error Banner */}
            {actionError && (
              <div className="p-3 bg-rose-950/60 border border-rose-800 rounded-lg text-rose-200 text-xs flex items-center gap-2">
                <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{actionError}</span>
              </div>
            )}

            {/* 1. Syllabus Requirement Summary */}
            <div className="p-3.5 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-base font-bold text-white">
                    {detail.syllabusNode.rawTitle}
                  </h3>
                  <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                    {detail.path}
                  </div>
                </div>

                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span
                    className={`font-mono text-[9px] font-bold px-1.5 py-0.5 rounded ${
                      detail.priority === "BLOCKING"
                        ? "bg-rose-950 text-rose-300 border border-rose-800"
                        : detail.priority === "HIGH"
                        ? "bg-amber-950 text-amber-300 border border-amber-800"
                        : "bg-slate-800 text-slate-400 border border-slate-700"
                    }`}
                  >
                    {detail.priority}
                  </span>
                  {detail.isBlocking && (
                    <span className="flex items-center gap-0.5 text-[9px] text-rose-400 font-mono">
                      <ShieldAlert className="w-2.5 h-2.5" />
                      BLOCKING GAP
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-800/80 text-[10px] text-slate-400">
                <Badge variant="neutral" className="px-1.5 py-0 bg-slate-800 font-mono">
                  Depth: {detail.syllabusNode.nodeDepth}
                </Badge>
                {detail.syllabusNode.isMandatory && (
                  <Badge variant="warning" className="px-1.5 py-0 bg-amber-950/80 text-amber-300 border-amber-800 font-mono">
                    Mandatory
                  </Badge>
                )}
                {detail.syllabusNode.weightageTier && (
                  <Badge variant="neutral" className="px-1.5 py-0 bg-slate-800 text-slate-300 font-mono">
                    Tier: {detail.syllabusNode.weightageTier}
                  </Badge>
                )}
                {detail.syllabusNode.cognitiveDepth && (
                  <Badge variant="neutral" className="px-1.5 py-0 bg-slate-800 text-slate-300 font-mono">
                    Cognitive: {detail.syllabusNode.cognitiveDepth}
                  </Badge>
                )}
              </div>
            </div>

            {/* 2. Current State & Mapping Status */}
            <div className="p-3.5 bg-slate-950/60 border border-slate-800 rounded-xl space-y-2.5 text-xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono block">
                Current Readiness State
              </span>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge
                    className={`text-xs font-mono uppercase px-2 py-0.5 border ${
                      getStatusBadgeVariant(detail.readinessState).colorClass
                    }`}
                  >
                    {getStatusBadgeVariant(detail.readinessState).label}
                  </Badge>
                  {detail.currentMapping && (
                    <span className="text-[11px] text-slate-400 font-mono">
                      Confidence: {Math.round(detail.currentMapping.match_confidence * 100)}%
                    </span>
                  )}
                </div>

                <div className="text-[10px] text-slate-400 font-mono">
                  Method: {detail.currentMapping?.match_method || "NONE"}
                </div>
              </div>

              {/* Mapped Canonical Target if exists */}
              {detail.canonicalTarget && (
                <div className="p-2.5 bg-slate-900 border border-emerald-800/40 rounded-lg space-y-1">
                  <div className="text-[10px] uppercase font-mono font-bold text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    Mapped Canonical Target:
                  </div>
                  <div className="font-semibold text-white">{detail.canonicalTarget.name}</div>
                  <div className="text-[10px] text-slate-400 font-mono">
                    {detail.canonicalTarget.hierarchy_path}
                  </div>
                </div>
              )}
            </div>

            {/* 3. Canonical Candidates */}
            {detail.candidateMatches && detail.candidateMatches.length > 0 && (
              <div className="p-3.5 bg-slate-950/60 border border-slate-800 rounded-xl space-y-2 text-xs">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono block">
                  Top Candidate Matches ({detail.candidateMatches.length})
                </span>
                <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                  {detail.candidateMatches.map((cand) => (
                    <div
                      key={cand.canonicalNodeId}
                      className="p-2 bg-slate-900/80 border border-slate-800 rounded-lg space-y-0.5 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-200">{cand.name}</span>
                        <Badge variant="indigo" className="text-[9px] font-mono">
                          {Math.round(cand.similarity * 100)}% match
                        </Badge>
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono truncate">
                        {cand.hierarchyPath}
                      </div>
                      <div className="text-[10px] text-slate-500 italic">
                        {cand.reason}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 4. Action Selector Tabs & Resolution Form */}
            <div className="space-y-3 pt-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono block">
                Available Resolution Actions
              </span>

              {/* Action Tabs */}
              <div className="flex flex-wrap gap-1.5">
                {(detail.availableActions || []).map((action) => {
                  const isActive = activeAction === action;
                  return (
                    <button
                      key={action}
                      onClick={() => setActiveAction(action)}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition select-none border ${
                        isActive
                          ? "bg-blue-600 text-white border-blue-500 font-semibold shadow-xs"
                          : "bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700 hover:text-white"
                      }`}
                    >
                      {getActionIcon(action)}
                      <span>{action.replace(/_/g, " ")}</span>
                    </button>
                  );
                })}
              </div>

              {/* Active Action Form */}
              {activeAction && (
                <div className="pt-2">
                  <ResolutionDialogs
                    item={detail}
                    syllabusVersionId={syllabusVersionId}
                    onExecuteAction={handleExecuteAction}
                    isSubmitting={isSubmitting}
                    selectedAction={activeAction}
                    onCancel={() => setActiveAction(null)}
                    rootTree={rootTree}
                  />
                </div>
              )}
            </div>

            {/* 5. Resolution History / Audit Log */}
            {detail.resolutionHistory && detail.resolutionHistory.length > 0 && (
              <div className="p-3.5 bg-slate-950/60 border border-slate-800 rounded-xl space-y-2 text-xs">
                <div className="flex items-center gap-1.5 text-slate-300 font-semibold text-xs">
                  <History className="w-3.5 h-3.5 text-slate-400" />
                  <span>Audit History</span>
                </div>

                <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                  {detail.resolutionHistory.map((hist, idx) => (
                    <div
                      key={idx}
                      className="p-2 bg-slate-900 border border-slate-800/80 rounded-md space-y-1 text-[11px]"
                    >
                      <div className="flex items-center justify-between text-slate-300">
                        <span className="font-semibold text-blue-400 font-mono">
                          {hist.action}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {new Date(hist.reviewedAt).toLocaleString()}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400 flex items-center gap-1 font-mono">
                        <span>{hist.previousStatus}</span>
                        <ArrowRight className="w-2.5 h-2.5 text-slate-500" />
                        <span className="text-emerald-400">{hist.newStatus}</span>
                      </div>
                      {hist.notes && (
                        <div className="text-[10px] text-slate-400 italic bg-slate-950 p-1 rounded border border-slate-800/60">
                          {hist.notes}
                        </div>
                      )}
                      {hist.reviewedBy && (
                        <div className="text-[9px] text-slate-500 font-mono">
                          Reviewer: {hist.reviewedBy}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
