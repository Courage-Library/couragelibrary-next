"use client";

import React, { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ChevronDown,
  ChevronRight,
  FolderTree,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  EyeOff,
  XCircle,
  Search,
  Maximize2,
  Minimize2,
  ShieldAlert,
  ArrowRight,
} from "lucide-react";
import type {
  HierarchicalReadinessNode,
  SyllabusReadinessState,
} from "@/types/dynamic-syllabus-reconciliation";

interface SyllabusTreeViewProps {
  tree: HierarchicalReadinessNode[];
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  isLoading?: boolean;
}

export function getStatusBadgeVariant(state: SyllabusReadinessState): {
  variant: "default" | "success" | "warning" | "destructive" | "error" | "outline" | "indigo" | "neutral";
  label: string;
  colorClass: string;
} {
  switch (state) {
    case "MATCHED":
      return { variant: "success", label: "Matched", colorClass: "bg-emerald-950/80 text-emerald-300 border-emerald-800" };
    case "MANUALLY_MAPPED":
      return { variant: "success", label: "Manual", colorClass: "bg-teal-950/80 text-teal-300 border-teal-800" };
    case "PROPOSED_REVIEW":
      return { variant: "indigo", label: "Proposed", colorClass: "bg-blue-950/80 text-blue-300 border-blue-800" };
    case "AMBIGUOUS_REVIEW":
      return { variant: "indigo", label: "Ambiguous", colorClass: "bg-purple-950/80 text-purple-300 border-purple-800" };
    case "NEW_SUBJECT_GAP":
      return { variant: "destructive", label: "Subject Gap", colorClass: "bg-rose-950/80 text-rose-300 border-rose-800" };
    case "NEW_NODE_GAP":
      return { variant: "warning", label: "Node Gap", colorClass: "bg-amber-950/80 text-amber-300 border-amber-800" };
    case "IGNORED":
      return { variant: "neutral", label: "Ignored", colorClass: "bg-slate-800 text-slate-400 border-slate-700" };
    case "REJECTED":
      return { variant: "destructive", label: "Rejected", colorClass: "bg-rose-950/80 text-rose-400 border-rose-800" };
    case "UNREVIEWED":
    default:
      return { variant: "neutral", label: "Unreviewed", colorClass: "bg-slate-800 text-slate-300 border-slate-700" };
  }
}

export function SyllabusTreeView({
  tree,
  selectedNodeId,
  onSelectNode,
  isLoading,
}: SyllabusTreeViewProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});

  // Helper to collect all node IDs for Expand All
  const allNodeIds = useMemo(() => {
    const ids: string[] = [];
    function traverse(nodes: HierarchicalReadinessNode[]) {
      for (const node of nodes) {
        if (node.children && node.children.length > 0) {
          ids.push(node.syllabusNodeId);
          traverse(node.children);
        }
      }
    }
    traverse(tree);
    return ids;
  }, [tree]);

  const handleToggleExpand = (nodeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedNodes((prev) => ({
      ...prev,
      [nodeId]: prev[nodeId] === undefined ? false : !prev[nodeId],
    }));
  };

  const handleExpandAll = () => {
    const next: Record<string, boolean> = {};
    for (const id of allNodeIds) {
      next[id] = true;
    }
    setExpandedNodes(next);
  };

  const handleCollapseAll = () => {
    const next: Record<string, boolean> = {};
    for (const id of allNodeIds) {
      next[id] = false;
    }
    setExpandedNodes(next);
  };

  // Filter tree recursively
  const filteredTree = useMemo(() => {
    if (!searchQuery.trim()) return tree;
    const q = searchQuery.toLowerCase().trim();

    function filterNodes(nodes: HierarchicalReadinessNode[]): HierarchicalReadinessNode[] {
      const result: HierarchicalReadinessNode[] = [];
      for (const node of nodes) {
        const matchesSelf =
          node.rawTitle.toLowerCase().includes(q) ||
          node.rawSlug.toLowerCase().includes(q) ||
          (node.mappedCanonicalPath && node.mappedCanonicalPath.toLowerCase().includes(q));

        const filteredChildren = node.children ? filterNodes(node.children) : [];
        if (matchesSelf || filteredChildren.length > 0) {
          result.push({
            ...node,
            children: filteredChildren,
          });
        }
      }
      return result;
    }

    return filterNodes(tree);
  }, [tree, searchQuery]);

  return (
    <div className="bg-slate-900/70 border border-slate-800 rounded-xl flex flex-col h-[700px] overflow-hidden">
      {/* Tree View Header Controls */}
      <div className="p-3 border-b border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 bg-slate-900/90 shrink-0">
        <div className="flex items-center gap-2">
          <FolderTree className="w-4 h-4 text-blue-400" />
          <span className="text-xs font-bold text-white uppercase tracking-wider font-mono">
            Syllabus Requirement Hierarchy
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Search Box */}
          <div className="relative flex-1 sm:w-48">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Filter tree nodes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-800/90 border border-slate-700/80 rounded-md pl-8 pr-2.5 py-1 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Expand/Collapse All */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleExpandAll}
            title="Expand All Nodes"
            className="h-7 px-2 border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs"
          >
            <Maximize2 className="w-3 h-3" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCollapseAll}
            title="Collapse All Nodes"
            className="h-7 px-2 border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs"
          >
            <Minimize2 className="w-3 h-3" />
          </Button>
        </div>
      </div>

      {/* Tree Content */}
      <div className="flex-1 overflow-y-auto p-2 md:p-3 space-y-0.5 divide-y divide-slate-800/40">
        {filteredTree.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-xs">
            {searchQuery ? "No syllabus nodes match filter query." : "No syllabus nodes in tree."}
          </div>
        ) : (
          filteredTree.map((node) => (
            <TreeNodeItem
              key={node.syllabusNodeId}
              node={node}
              depth={0}
              expandedNodes={expandedNodes}
              onToggleExpand={handleToggleExpand}
              selectedNodeId={selectedNodeId}
              onSelectNode={onSelectNode}
            />
          ))
        )}
      </div>
    </div>
  );
}

interface TreeNodeItemProps {
  node: HierarchicalReadinessNode;
  depth: number;
  expandedNodes: Record<string, boolean>;
  onToggleExpand: (nodeId: string, e: React.MouseEvent) => void;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
}

function TreeNodeItem({
  node,
  depth,
  expandedNodes,
  onToggleExpand,
  selectedNodeId,
  onSelectNode,
}: TreeNodeItemProps) {
  const hasChildren = node.children && node.children.length > 0;
  // Default to expanded if not explicitly set
  const isExpanded =
    expandedNodes[node.syllabusNodeId] !== undefined
      ? expandedNodes[node.syllabusNodeId]
      : true;

  const isSelected = selectedNodeId === node.syllabusNodeId;
  const statusInfo = getStatusBadgeVariant(node.readinessState);

  return (
    <div className="select-none">
      <div
        onClick={() => onSelectNode(node.syllabusNodeId)}
        className={`group flex items-center justify-between py-1.5 px-2 rounded-lg cursor-pointer transition-colors text-xs ${
          isSelected
            ? "bg-blue-600/20 border border-blue-500/50 text-white"
            : "hover:bg-slate-800/60 text-slate-300 border border-transparent"
        }`}
        style={{ paddingLeft: `${Math.max(8, depth * 20 + 8)}px` }}
      >
        {/* Left Side: Expand Icon, Title, Path */}
        <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
          {hasChildren ? (
            <button
              onClick={(e) => onToggleExpand(node.syllabusNodeId, e)}
              className="p-0.5 hover:bg-slate-700/60 rounded text-slate-400 hover:text-white shrink-0"
            >
              {isExpanded ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
            </button>
          ) : (
            <span className="w-3.5 shrink-0" />
          )}

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className={`font-medium truncate ${isSelected ? "text-blue-200 font-semibold" : "text-slate-200"}`}>
                {node.rawTitle}
              </span>

              {node.isBlocking && (
                <span className="shrink-0 flex items-center gap-0.5 px-1 py-0.2 bg-rose-950/80 border border-rose-800 text-[9px] font-mono text-rose-300 rounded font-bold">
                  <ShieldAlert className="w-2.5 h-2.5" />
                  BLOCKING
                </span>
              )}
            </div>

            {node.mappedCanonicalPath && (
              <div className="flex items-center gap-1 text-[10px] text-slate-400 truncate mt-0.5 font-mono">
                <ArrowRight className="w-2.5 h-2.5 text-slate-500 shrink-0" />
                <span className="text-emerald-400/90 truncate">{node.mappedCanonicalPath}</span>
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Status Badge, Confidence */}
        <div className="flex items-center gap-2 shrink-0">
          {node.confidence > 0 && (
            <span className="text-[10px] font-mono text-slate-400">
              {Math.round(node.confidence * 100)}%
            </span>
          )}

          <Badge
            className={`text-[10px] font-mono uppercase px-1.5 py-0.5 border ${statusInfo.colorClass}`}
          >
            {statusInfo.label}
          </Badge>
        </div>
      </div>

      {/* Recursive Children */}
      {hasChildren && isExpanded && (
        <div className="space-y-0.5">
          {node.children.map((child) => (
            <TreeNodeItem
              key={child.syllabusNodeId}
              node={child}
              depth={depth + 1}
              expandedNodes={expandedNodes}
              onToggleExpand={onToggleExpand}
              selectedNodeId={selectedNodeId}
              onSelectNode={onSelectNode}
            />
          ))}
        </div>
      )}
    </div>
  );
}
