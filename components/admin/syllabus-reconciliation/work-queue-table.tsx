"use client";

import React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ClipboardList,
  ShieldAlert,
  Search,
  Filter,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import type {
  TaxonomyWorkQueueItem,
  WorkQueuePriority,
  SyllabusReadinessState,
} from "@/types/dynamic-syllabus-reconciliation";
import { getStatusBadgeVariant } from "./syllabus-tree-view";

interface WorkQueueTableProps {
  items: TaxonomyWorkQueueItem[];
  totalCount: number;
  page: number;
  limit: number;
  totalPages: number;
  onPageChange: (newPage: number) => void;
  onLimitChange: (newLimit: number) => void;
  selectedPriority: string;
  onPriorityChange: (p: string) => void;
  selectedStatus: string;
  onStatusChange: (s: string) => void;
  onlyBlocking: boolean;
  onToggleBlocking: (val: boolean) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onSelectNode: (nodeId: string) => void;
  selectedNodeId: string | null;
  isLoading?: boolean;
}

export function WorkQueueTable({
  items,
  totalCount,
  page,
  limit,
  totalPages,
  onPageChange,
  onLimitChange,
  selectedPriority,
  onPriorityChange,
  selectedStatus,
  onStatusChange,
  onlyBlocking,
  onToggleBlocking,
  searchQuery,
  onSearchChange,
  onSelectNode,
  selectedNodeId,
  isLoading,
}: WorkQueueTableProps) {
  return (
    <div className="bg-slate-900/70 border border-slate-800 rounded-xl flex flex-col h-[700px] overflow-hidden">
      {/* Header & Filter Toolbar */}
      <div className="p-3.5 border-b border-slate-800 bg-slate-900/90 flex flex-col gap-3 shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-blue-400" />
            <h2 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
              Deterministic Work Queue ({totalCount} items)
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 cursor-pointer text-xs font-medium text-slate-300 select-none">
              <input
                type="checkbox"
                checked={onlyBlocking}
                onChange={(e) => onToggleBlocking(e.target.checked)}
                className="w-3.5 h-3.5 rounded-sm border-slate-700 bg-slate-800 text-rose-500 focus:ring-rose-500 focus:ring-offset-slate-900"
              />
              <span className={onlyBlocking ? "text-rose-300 font-bold" : "text-slate-400"}>
                Blocking Gaps Only
              </span>
            </label>
          </div>
        </div>

        {/* Filter Controls Row */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
          {/* Search */}
          <div className="relative sm:col-span-2">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Search title, path, or candidate..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full bg-slate-800/90 border border-slate-700/80 rounded-md pl-8 pr-2.5 py-1 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Priority Filter */}
          <div>
            <select
              value={selectedPriority}
              onChange={(e) => onPriorityChange(e.target.value)}
              className="w-full bg-slate-800/90 border border-slate-700/80 rounded-md px-2 py-1 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="ALL">All Priorities</option>
              <option value="BLOCKING">BLOCKING</option>
              <option value="HIGH">HIGH</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="LOW">LOW</option>
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={selectedStatus}
              onChange={(e) => onStatusChange(e.target.value)}
              className="w-full bg-slate-800/90 border border-slate-700/80 rounded-md px-2 py-1 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="ALL">All Statuses</option>
              <option value="PROPOSED_REVIEW">PROPOSED_REVIEW</option>
              <option value="AMBIGUOUS_REVIEW">AMBIGUOUS_REVIEW</option>
              <option value="NEW_SUBJECT_GAP">NEW_SUBJECT_GAP</option>
              <option value="NEW_NODE_GAP">NEW_NODE_GAP</option>
              <option value="IGNORED">IGNORED</option>
              <option value="REJECTED">REJECTED</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table Content */}
      <div className="flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center p-8 text-center text-slate-400">
            <CheckCircle2 className="w-10 h-10 text-emerald-400/60 mb-2" />
            <div className="text-sm font-semibold text-white">Work Queue Clear</div>
            <p className="text-xs text-slate-500 max-w-sm mt-1">
              No unresolved requirements matching the selected filter criteria.
            </p>
          </div>
        ) : (
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-950/80 text-slate-400 font-mono uppercase text-[10px] sticky top-0 z-10 border-b border-slate-800">
              <tr>
                <th className="py-2.5 px-3">Priority</th>
                <th className="py-2.5 px-3">Syllabus Requirement</th>
                <th className="py-2.5 px-3">Current Status</th>
                <th className="py-2.5 px-3">Candidate / Action</th>
                <th className="py-2.5 px-3 text-right">Resolve</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {items.map((item) => {
                const statusInfo = getStatusBadgeVariant(item.currentStatus);
                const isSelected = selectedNodeId === item.syllabusNodeId;

                return (
                  <tr
                    key={item.syllabusNodeId}
                    onClick={() => onSelectNode(item.syllabusNodeId)}
                    className={`cursor-pointer transition-colors ${
                      isSelected
                        ? "bg-blue-600/15 text-white"
                        : "hover:bg-slate-800/50"
                    }`}
                  >
                    {/* Priority */}
                    <td className="py-3 px-3 align-top whitespace-nowrap">
                      <div className="flex flex-col gap-1 items-start">
                        <span
                          className={`font-mono text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            item.priority === "BLOCKING"
                              ? "bg-rose-950 text-rose-300 border border-rose-800"
                              : item.priority === "HIGH"
                              ? "bg-amber-950 text-amber-300 border border-amber-800"
                              : "bg-slate-800 text-slate-400 border border-slate-700"
                          }`}
                        >
                          {item.priority}
                        </span>

                        {item.isBlocking && (
                          <span className="flex items-center gap-0.5 text-[9px] text-rose-400 font-mono">
                            <ShieldAlert className="w-2.5 h-2.5" />
                            GAP
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Syllabus Requirement */}
                    <td className="py-3 px-3 align-top max-w-xs">
                      <div className="font-semibold text-slate-100 line-clamp-1">
                        {item.syllabusTitle}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono truncate mt-0.5">
                        {item.syllabusPath}
                      </div>
                      <div className="flex items-center gap-1.5 mt-1">
                        <Badge
                          variant="neutral"
                          className="text-[9px] px-1 py-0 bg-slate-800 text-slate-400 font-mono"
                        >
                          Depth {item.syllabusDepth}
                        </Badge>
                        {item.isMandatory && (
                          <Badge
                            variant="warning"
                            className="text-[9px] px-1 py-0 bg-amber-950/60 text-amber-300 border-amber-800 font-mono"
                          >
                            Mandatory
                          </Badge>
                        )}
                      </div>
                    </td>

                    {/* Current Status */}
                    <td className="py-3 px-3 align-top whitespace-nowrap">
                      <Badge
                        className={`text-[10px] font-mono uppercase px-1.5 py-0.5 border ${statusInfo.colorClass}`}
                      >
                        {statusInfo.label}
                      </Badge>
                      {item.confidence > 0 && (
                        <div className="text-[10px] text-slate-400 font-mono mt-1">
                          Confidence: {Math.round(item.confidence * 100)}%
                        </div>
                      )}
                    </td>

                    {/* Candidate / Action */}
                    <td className="py-3 px-3 align-top max-w-xs">
                      {item.canonicalCandidate ? (
                        <div>
                          <div className="flex items-center gap-1 text-slate-200 font-medium truncate">
                            <Sparkles className="w-3 h-3 text-blue-400 shrink-0" />
                            <span className="truncate">{item.canonicalCandidate.name}</span>
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono truncate mt-0.5">
                            {item.canonicalCandidate.hierarchyPath}
                          </div>
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-500 italic">
                          No candidate match
                        </span>
                      )}
                      <div className="text-[10px] text-blue-400/90 font-mono mt-1">
                        Action: {item.requiredAction}
                      </div>
                    </td>

                    {/* Action Button */}
                    <td className="py-3 px-3 align-top text-right whitespace-nowrap">
                      <Button
                        size="sm"
                        variant={isSelected ? "default" : "outline"}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectNode(item.syllabusNodeId);
                        }}
                        className={`text-xs h-7 px-2.5 ${
                          isSelected
                            ? "bg-blue-600 hover:bg-blue-500 text-white"
                            : "border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200"
                        }`}
                      >
                        <span>Resolve</span>
                        <ArrowRight className="w-3 h-3 ml-1" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination Footer */}
      <div className="p-3 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between text-xs text-slate-400 shrink-0">
        <div className="flex items-center gap-2">
          <span>Show:</span>
          <select
            value={limit}
            onChange={(e) => onLimitChange(Number(e.target.value))}
            className="bg-slate-800 border border-slate-700 text-slate-200 rounded px-1.5 py-0.5 text-xs focus:outline-none"
          >
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
          </select>
          <span className="font-mono">
            Page {page} of {Math.max(1, totalPages)} ({totalCount} items)
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            className="h-7 px-2 border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-40"
          >
            <ChevronLeft className="w-3.5 h-3.5 mr-0.5" />
            Prev
          </Button>

          <Button
            size="sm"
            variant="outline"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            className="h-7 px-2 border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-40"
          >
            Next
            <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
