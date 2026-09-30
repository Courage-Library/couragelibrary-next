"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  AlertTriangle,
  FolderPlus,
  Network,
  Tag,
  EyeOff,
  XCircle,
  Undo2,
  Sparkles,
  HelpCircle,
  ArrowRight,
} from "lucide-react";
import type {
  CanonicalCandidateMatch,
  CanonicalNodeType,
  ResolutionAction,
  ResolveWorkItemApiPayload,
  WorkItemDetailResponse,
  HierarchicalReadinessNode,
} from "@/types/dynamic-syllabus-reconciliation";

interface ResolutionDialogsProps {
  item: WorkItemDetailResponse;
  syllabusVersionId: string;
  onExecuteAction: (payload: ResolveWorkItemApiPayload) => Promise<void>;
  isSubmitting: boolean;
  selectedAction: ResolutionAction | null;
  onCancel: () => void;
  rootTree?: HierarchicalReadinessNode[];
}

export function ResolutionDialogs({
  item,
  syllabusVersionId,
  onExecuteAction,
  isSubmitting,
  selectedAction,
  onCancel,
  rootTree = [],
}: ResolutionDialogsProps) {
  if (!selectedAction) return null;

  switch (selectedAction) {
    case "ACCEPT_PROPOSED_MATCH":
      return (
        <AcceptProposedMatchDialog
          item={item}
          syllabusVersionId={syllabusVersionId}
          onSubmit={onExecuteAction}
          onCancel={onCancel}
          isSubmitting={isSubmitting}
        />
      );
    case "ACCEPT_EXISTING_MATCH":
      return (
        <AcceptExistingMatchDialog
          item={item}
          syllabusVersionId={syllabusVersionId}
          onSubmit={onExecuteAction}
          onCancel={onCancel}
          isSubmitting={isSubmitting}
        />
      );
    case "RESOLVE_AMBIGUOUS":
      return (
        <ResolveAmbiguousDialog
          item={item}
          syllabusVersionId={syllabusVersionId}
          onSubmit={onExecuteAction}
          onCancel={onCancel}
          isSubmitting={isSubmitting}
        />
      );
    case "CREATE_NEW_CANONICAL_NODE":
      return (
        <CreateNewCanonicalNodeDialog
          item={item}
          syllabusVersionId={syllabusVersionId}
          onSubmit={onExecuteAction}
          onCancel={onCancel}
          isSubmitting={isSubmitting}
        />
      );
    case "CREATE_NEW_SUBJECT":
      return (
        <CreateNewSubjectDialog
          item={item}
          syllabusVersionId={syllabusVersionId}
          onSubmit={onExecuteAction}
          onCancel={onCancel}
          isSubmitting={isSubmitting}
        />
      );
    case "CREATE_NEW_SUBTREE":
      return (
        <CreateNewSubtreeDialog
          item={item}
          syllabusVersionId={syllabusVersionId}
          onSubmit={onExecuteAction}
          onCancel={onCancel}
          isSubmitting={isSubmitting}
          rootTree={rootTree}
        />
      );
    case "ADD_ALIAS":
      return (
        <AddAliasDialog
          item={item}
          syllabusVersionId={syllabusVersionId}
          onSubmit={onExecuteAction}
          onCancel={onCancel}
          isSubmitting={isSubmitting}
        />
      );
    case "IGNORE_REQUIREMENT":
      return (
        <IgnoreRequirementDialog
          item={item}
          syllabusVersionId={syllabusVersionId}
          onSubmit={onExecuteAction}
          onCancel={onCancel}
          isSubmitting={isSubmitting}
        />
      );
    case "REJECT_PROPOSAL":
      return (
        <RejectProposalDialog
          item={item}
          syllabusVersionId={syllabusVersionId}
          onSubmit={onExecuteAction}
          onCancel={onCancel}
          isSubmitting={isSubmitting}
        />
      );
    case "UNMAP_AND_REVIEW":
      return (
        <UnmapAndReviewDialog
          item={item}
          syllabusVersionId={syllabusVersionId}
          onSubmit={onExecuteAction}
          onCancel={onCancel}
          isSubmitting={isSubmitting}
        />
      );
    default:
      return null;
  }
}

// -----------------------------------------------------------------------------
// 1. ACCEPT_PROPOSED_MATCH
// -----------------------------------------------------------------------------
function AcceptProposedMatchDialog({
  item,
  syllabusVersionId,
  onSubmit,
  onCancel,
  isSubmitting,
}: {
  item: WorkItemDetailResponse;
  syllabusVersionId: string;
  onSubmit: (p: ResolveWorkItemApiPayload) => Promise<void>;
  onCancel: () => void;
  isSubmitting: boolean;
}) {
  const topCandidate = item.candidateMatches?.[0] || null;
  const [notes, setNotes] = useState("");

  const handleConfirm = async () => {
    await onSubmit({
      syllabusVersionId,
      syllabusNodeId: item.syllabusNode.id,
      action: "ACCEPT_PROPOSED_MATCH",
      expectedState: item.readinessState,
      canonicalNodeId: topCandidate?.canonicalNodeId || item.currentMapping?.canonical_node_id || undefined,
      notes: notes.trim() || undefined,
    });
  };

  return (
    <div className="p-4 bg-slate-900 border border-blue-600/50 rounded-xl space-y-4">
      <div className="flex items-center gap-2 text-blue-400 font-bold text-sm">
        <CheckCircle2 className="w-4 h-4" />
        <span>Accept Proposed Match</span>
      </div>

      <p className="text-xs text-slate-300">
        Link this syllabus requirement to the algorithmically proposed canonical node.
      </p>

      {topCandidate ? (
        <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg space-y-1 text-xs">
          <div className="font-semibold text-slate-100 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-blue-400" />
            <span>{topCandidate.name}</span>
            <Badge variant="indigo" className="text-[10px] ml-auto">
              {Math.round(topCandidate.similarity * 100)}% match
            </Badge>
          </div>
          <div className="text-[10px] text-slate-400 font-mono">
            {topCandidate.hierarchyPath}
          </div>
          <div className="text-[10px] text-slate-500 italic">
            Reason: {topCandidate.reason}
          </div>
        </div>
      ) : (
        <div className="text-xs text-amber-400">
          No top candidate identified. Please verify the target canonical node.
        </div>
      )}

      <div>
        <label className="text-[11px] font-medium text-slate-400 block mb-1">
          Review Notes (Optional)
        </label>
        <Input
          placeholder="e.g. Confirmed exact curriculum alignment..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="bg-slate-950 text-xs border-slate-800"
        />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={handleConfirm}
          disabled={isSubmitting || (!topCandidate && !item.currentMapping?.canonical_node_id)}
          className="bg-blue-600 hover:bg-blue-500 text-white"
        >
          {isSubmitting ? "Accepting..." : "Confirm & Map"}
        </Button>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// 2. ACCEPT_EXISTING_MATCH
// -----------------------------------------------------------------------------
function AcceptExistingMatchDialog({
  item,
  syllabusVersionId,
  onSubmit,
  onCancel,
  isSubmitting,
}: {
  item: WorkItemDetailResponse;
  syllabusVersionId: string;
  onSubmit: (p: ResolveWorkItemApiPayload) => Promise<void>;
  onCancel: () => void;
  isSubmitting: boolean;
}) {
  const [selectedCanonicalId, setSelectedCanonicalId] = useState<string>(
    item.candidateMatches?.[0]?.canonicalNodeId || ""
  );
  const [customCanonicalId, setCustomCanonicalId] = useState("");
  const [notes, setNotes] = useState("");

  const targetId = customCanonicalId.trim() || selectedCanonicalId;

  const handleConfirm = async () => {
    if (!targetId) return;
    await onSubmit({
      syllabusVersionId,
      syllabusNodeId: item.syllabusNode.id,
      action: "ACCEPT_EXISTING_MATCH",
      expectedState: item.readinessState,
      canonicalNodeId: targetId,
      notes: notes.trim() || undefined,
    });
  };

  return (
    <div className="p-4 bg-slate-900 border border-slate-700 rounded-xl space-y-4">
      <div className="flex items-center gap-2 text-slate-100 font-bold text-sm">
        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
        <span>Map to Existing Canonical Node</span>
      </div>

      {item.candidateMatches && item.candidateMatches.length > 0 && (
        <div className="space-y-2">
          <label className="text-[11px] font-medium text-slate-400">
            Select from Candidates:
          </label>
          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {item.candidateMatches.map((cand) => (
              <label
                key={cand.canonicalNodeId}
                className={`flex items-start gap-2.5 p-2 rounded-lg border text-xs cursor-pointer transition-colors ${
                  selectedCanonicalId === cand.canonicalNodeId && !customCanonicalId
                    ? "bg-blue-950/60 border-blue-600 text-white"
                    : "bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700"
                }`}
              >
                <input
                  type="radio"
                  name="candidateMatch"
                  checked={selectedCanonicalId === cand.canonicalNodeId && !customCanonicalId}
                  onChange={() => {
                    setSelectedCanonicalId(cand.canonicalNodeId);
                    setCustomCanonicalId("");
                  }}
                  className="mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-200">{cand.name}</span>
                    <span className="text-[10px] font-mono text-slate-400">
                      {Math.round(cand.similarity * 100)}%
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono truncate">
                    {cand.hierarchyPath}
                  </div>
                </div>
              </label>
            ))}
          </div>
        </div>
      )}

      <div>
        <label className="text-[11px] font-medium text-slate-400 block mb-1">
          Or Enter Target Canonical Node UUID:
        </label>
        <Input
          placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
          value={customCanonicalId}
          onChange={(e) => setCustomCanonicalId(e.target.value)}
          className="bg-slate-950 text-xs border-slate-800 font-mono"
        />
      </div>

      <div>
        <label className="text-[11px] font-medium text-slate-400 block mb-1">
          Review Notes (Optional)
        </label>
        <Input
          placeholder="e.g. Verified manual alignment..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="bg-slate-950 text-xs border-slate-800"
        />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={handleConfirm}
          disabled={isSubmitting || !targetId}
          className="bg-emerald-600 hover:bg-emerald-500 text-white"
        >
          {isSubmitting ? "Mapping..." : "Map to Selected Node"}
        </Button>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// 3. RESOLVE_AMBIGUOUS
// -----------------------------------------------------------------------------
function ResolveAmbiguousDialog({
  item,
  syllabusVersionId,
  onSubmit,
  onCancel,
  isSubmitting,
}: {
  item: WorkItemDetailResponse;
  syllabusVersionId: string;
  onSubmit: (p: ResolveWorkItemApiPayload) => Promise<void>;
  onCancel: () => void;
  isSubmitting: boolean;
}) {
  const [selectedCanonicalId, setSelectedCanonicalId] = useState<string>(
    item.candidateMatches?.[0]?.canonicalNodeId || ""
  );
  const [notes, setNotes] = useState("");

  const handleConfirm = async () => {
    if (!selectedCanonicalId) return;
    await onSubmit({
      syllabusVersionId,
      syllabusNodeId: item.syllabusNode.id,
      action: "RESOLVE_AMBIGUOUS",
      expectedState: item.readinessState,
      canonicalNodeId: selectedCanonicalId,
      notes: notes.trim() || undefined,
    });
  };

  return (
    <div className="p-4 bg-slate-900 border border-purple-600/50 rounded-xl space-y-4">
      <div className="flex items-center gap-2 text-purple-400 font-bold text-sm">
        <HelpCircle className="w-4 h-4" />
        <span>Resolve Ambiguous Requirement</span>
      </div>

      <p className="text-xs text-slate-300">
        Multiple candidates matched this requirement with similar confidence. Select the canonical node that best represents this topic:
      </p>

      <div className="space-y-2">
        <label className="text-[11px] font-medium text-slate-400">
          Candidate Matches ({item.candidateMatches?.length || 0}):
        </label>
        <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
          {(item.candidateMatches || []).map((cand) => (
            <label
              key={cand.canonicalNodeId}
              className={`flex items-start gap-2.5 p-2 rounded-lg border text-xs cursor-pointer transition-colors ${
                selectedCanonicalId === cand.canonicalNodeId
                  ? "bg-purple-950/60 border-purple-500 text-white"
                  : "bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700"
              }`}
            >
              <input
                type="radio"
                name="ambiguousCandidate"
                checked={selectedCanonicalId === cand.canonicalNodeId}
                onChange={() => setSelectedCanonicalId(cand.canonicalNodeId)}
                className="mt-0.5"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-purple-200">{cand.name}</span>
                  <Badge variant="indigo" className="text-[10px]">
                    {Math.round(cand.similarity * 100)}%
                  </Badge>
                </div>
                <div className="text-[10px] text-slate-400 font-mono truncate mt-0.5">
                  {cand.hierarchyPath}
                </div>
                <div className="text-[10px] text-slate-500 italic mt-0.5">
                  {cand.reason}
                </div>
              </div>
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="text-[11px] font-medium text-slate-400 block mb-1">
          Disambiguation Notes (Optional)
        </label>
        <Input
          placeholder="e.g. Selected domain-specific canonical node..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="bg-slate-950 text-xs border-slate-800"
        />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={handleConfirm}
          disabled={isSubmitting || !selectedCanonicalId}
          className="bg-purple-600 hover:bg-purple-500 text-white"
        >
          {isSubmitting ? "Resolving..." : "Resolve Ambiguity"}
        </Button>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// 4. CREATE_NEW_CANONICAL_NODE
// -----------------------------------------------------------------------------
function CreateNewCanonicalNodeDialog({
  item,
  syllabusVersionId,
  onSubmit,
  onCancel,
  isSubmitting,
}: {
  item: WorkItemDetailResponse;
  syllabusVersionId: string;
  onSubmit: (p: ResolveWorkItemApiPayload) => Promise<void>;
  onCancel: () => void;
  isSubmitting: boolean;
}) {
  const [nodeName, setNodeName] = useState(item.syllabusNode.rawTitle);
  const [nodeSlug, setNodeSlug] = useState(item.syllabusNode.rawSlug);
  const [nodeType, setNodeType] = useState<CanonicalNodeType>("TOPIC");
  const [targetParentId, setTargetParentId] = useState("");
  const [notes, setNotes] = useState("");

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setNodeName(val);
    setNodeSlug(
      val
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
    );
  };

  const handleConfirm = async () => {
    if (!nodeName.trim() || !nodeSlug.trim()) return;
    await onSubmit({
      syllabusVersionId,
      syllabusNodeId: item.syllabusNode.id,
      action: "CREATE_NEW_CANONICAL_NODE",
      expectedState: item.readinessState,
      newNodeName: nodeName.trim(),
      newNodeSlug: nodeSlug.trim(),
      newNodeType: nodeType,
      targetParentId: targetParentId.trim() || undefined,
      notes: notes.trim() || undefined,
    });
  };

  return (
    <div className="p-4 bg-slate-900 border border-amber-600/50 rounded-xl space-y-4">
      <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
        <FolderPlus className="w-4 h-4" />
        <span>Create New Canonical Taxonomy Node</span>
      </div>

      <p className="text-xs text-slate-300">
        Mint a new canonical node in the academic hierarchy to permanently represent this gap.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-[11px] font-medium text-slate-400 block mb-1">
            Canonical Node Name *
          </label>
          <Input
            value={nodeName}
            onChange={handleNameChange}
            className="bg-slate-950 text-xs border-slate-800"
          />
        </div>

        <div>
          <label className="text-[11px] font-medium text-slate-400 block mb-1">
            Canonical Slug *
          </label>
          <Input
            value={nodeSlug}
            onChange={(e) => setNodeSlug(e.target.value)}
            className="bg-slate-950 text-xs border-slate-800 font-mono"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-[11px] font-medium text-slate-400 block mb-1">
            Node Type
          </label>
          <select
            value={nodeType}
            onChange={(e) => setNodeType(e.target.value as CanonicalNodeType)}
            className="w-full bg-slate-950 border border-slate-800 text-slate-200 rounded-md px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-amber-500"
          >
            <option value="TOPIC">TOPIC</option>
            <option value="SUBTOPIC">SUBTOPIC</option>
            <option value="CONCEPT">CONCEPT</option>
            <option value="METHOD">METHOD</option>
          </select>
        </div>

        <div>
          <label className="text-[11px] font-medium text-slate-400 block mb-1">
            Target Parent UUID (Optional)
          </label>
          <Input
            placeholder="UUID of parent canonical node"
            value={targetParentId}
            onChange={(e) => setTargetParentId(e.target.value)}
            className="bg-slate-950 text-xs border-slate-800 font-mono"
          />
        </div>
      </div>

      <div>
        <label className="text-[11px] font-medium text-slate-400 block mb-1">
          Creation Notes (Optional)
        </label>
        <Input
          placeholder="e.g. Added new standard module per official syllabus update..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="bg-slate-950 text-xs border-slate-800"
        />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={handleConfirm}
          disabled={isSubmitting || !nodeName.trim() || !nodeSlug.trim()}
          className="bg-amber-600 hover:bg-amber-500 text-white"
        >
          {isSubmitting ? "Creating..." : "Create Node & Map"}
        </Button>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// 5. CREATE_NEW_SUBJECT
// -----------------------------------------------------------------------------
function CreateNewSubjectDialog({
  item,
  syllabusVersionId,
  onSubmit,
  onCancel,
  isSubmitting,
}: {
  item: WorkItemDetailResponse;
  syllabusVersionId: string;
  onSubmit: (p: ResolveWorkItemApiPayload) => Promise<void>;
  onCancel: () => void;
  isSubmitting: boolean;
}) {
  const [subjectName, setSubjectName] = useState(item.syllabusNode.rawTitle);
  const [subjectSlug, setSubjectSlug] = useState(item.syllabusNode.rawSlug);
  const [notes, setNotes] = useState("");

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSubjectName(val);
    setSubjectSlug(
      val
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
    );
  };

  const handleConfirm = async () => {
    if (!subjectName.trim() || !subjectSlug.trim()) return;
    await onSubmit({
      syllabusVersionId,
      syllabusNodeId: item.syllabusNode.id,
      action: "CREATE_NEW_SUBJECT",
      expectedState: item.readinessState,
      newNodeName: subjectName.trim(),
      newNodeSlug: subjectSlug.trim(),
      notes: notes.trim() || undefined,
    });
  };

  return (
    <div className="p-4 bg-slate-900 border border-rose-600/50 rounded-xl space-y-4">
      <div className="flex items-center gap-2 text-rose-400 font-bold text-sm">
        <FolderPlus className="w-4 h-4" />
        <span>Create New Root Canonical Subject</span>
      </div>

      <div className="p-3 bg-rose-950/40 border border-rose-900/60 rounded-lg text-xs text-rose-200">
        <div className="font-semibold text-rose-300 mb-0.5">⚠️ Root Level Taxonomy Impact</div>
        This action creates a new top-level <strong>SUBJECT</strong> root in the canonical academic taxonomy.
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-[11px] font-medium text-slate-400 block mb-1">
            Subject Name *
          </label>
          <Input
            value={subjectName}
            onChange={handleNameChange}
            className="bg-slate-950 text-xs border-slate-800"
          />
        </div>

        <div>
          <label className="text-[11px] font-medium text-slate-400 block mb-1">
            Subject Slug *
          </label>
          <Input
            value={subjectSlug}
            onChange={(e) => setSubjectSlug(e.target.value)}
            className="bg-slate-950 text-xs border-slate-800 font-mono"
          />
        </div>
      </div>

      <div>
        <label className="text-[11px] font-medium text-slate-400 block mb-1">
          Creation Notes (Optional)
        </label>
        <Input
          placeholder="e.g. Created root subject for new examination track..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="bg-slate-950 text-xs border-slate-800"
        />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={handleConfirm}
          disabled={isSubmitting || !subjectName.trim() || !subjectSlug.trim()}
          className="bg-rose-600 hover:bg-rose-500 text-white"
        >
          {isSubmitting ? "Creating Root..." : "Create Root Subject"}
        </Button>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// 6. CREATE_NEW_SUBTREE
// -----------------------------------------------------------------------------
function CreateNewSubtreeDialog({
  item,
  syllabusVersionId,
  onSubmit,
  onCancel,
  isSubmitting,
  rootTree,
}: {
  item: WorkItemDetailResponse;
  syllabusVersionId: string;
  onSubmit: (p: ResolveWorkItemApiPayload) => Promise<void>;
  onCancel: () => void;
  isSubmitting: boolean;
  rootTree: HierarchicalReadinessNode[];
}) {
  const [notes, setNotes] = useState("");

  // Find this node and its descendants in the tree
  const subtreeNodes = React.useMemo(() => {
    function findNodeAndDescendants(
      nodes: HierarchicalReadinessNode[],
      targetId: string
    ): HierarchicalReadinessNode | null {
      for (const n of nodes) {
        if (n.syllabusNodeId === targetId) return n;
        if (n.children && n.children.length > 0) {
          const found = findNodeAndDescendants(n.children, targetId);
          if (found) return found;
        }
      }
      return null;
    }

    const root = findNodeAndDescendants(rootTree, item.syllabusNode.id);
    if (!root) {
      return [
        {
          syllabusNodeId: item.syllabusNode.id,
          name: item.syllabusNode.rawTitle,
          slug: item.syllabusNode.rawSlug,
          nodeType: item.syllabusNode.nodeDepth === 0 ? "SUBJECT" : "TOPIC",
          parentSyllabusNodeId: item.syllabusNode.parentNodeId,
        },
      ];
    }

    const flatList: any[] = [];
    function flatten(node: HierarchicalReadinessNode, parentId: string | null) {
      flatList.push({
        syllabusNodeId: node.syllabusNodeId,
        name: node.rawTitle,
        slug: node.rawSlug,
        nodeType: node.nodeDepth === 0 ? "SUBJECT" : node.nodeDepth === 1 ? "TOPIC" : "SUBTOPIC",
        parentSyllabusNodeId: parentId,
      });
      if (node.children) {
        for (const child of node.children) {
          flatten(child, node.syllabusNodeId);
        }
      }
    }
    flatten(root, item.syllabusNode.parentNodeId);
    return flatList;
  }, [rootTree, item]);

  const handleConfirm = async () => {
    await onSubmit({
      syllabusVersionId,
      syllabusNodeId: item.syllabusNode.id,
      action: "CREATE_NEW_SUBTREE",
      expectedState: item.readinessState,
      subtreeNodes,
      notes: notes.trim() || undefined,
    });
  };

  return (
    <div className="p-4 bg-slate-900 border border-indigo-600/50 rounded-xl space-y-4">
      <div className="flex items-center gap-2 text-indigo-400 font-bold text-sm">
        <Network className="w-4 h-4" />
        <span>Create Canonical Subtree</span>
      </div>

      <p className="text-xs text-slate-300">
        Atomically create a hierarchical branch of canonical taxonomy nodes for this requirement and all its descendant children ({subtreeNodes.length} nodes).
      </p>

      {/* Subtree Preview */}
      <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg space-y-1.5 max-h-48 overflow-y-auto">
        <span className="text-[10px] font-bold text-slate-400 uppercase font-mono block">
          Subtree Nodes Preview:
        </span>
        {subtreeNodes.map((sNode, idx) => (
          <div
            key={sNode.syllabusNodeId}
            className="flex items-center justify-between text-xs py-1 border-b border-slate-900 last:border-0"
          >
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500 font-mono text-[10px]">#{idx + 1}</span>
              <span className="text-slate-200 font-medium">{sNode.name}</span>
            </div>
            <Badge variant="neutral" className="text-[9px] font-mono">
              {sNode.nodeType}
            </Badge>
          </div>
        ))}
      </div>

      <div>
        <label className="text-[11px] font-medium text-slate-400 block mb-1">
          Subtree Notes (Optional)
        </label>
        <Input
          placeholder="e.g. Imported complete subject syllabus hierarchy..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="bg-slate-950 text-xs border-slate-800"
        />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={handleConfirm}
          disabled={isSubmitting || subtreeNodes.length === 0}
          className="bg-indigo-600 hover:bg-indigo-500 text-white"
        >
          {isSubmitting ? "Creating Subtree..." : `Create ${subtreeNodes.length} Subtree Nodes`}
        </Button>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// 7. ADD_ALIAS
// -----------------------------------------------------------------------------
function AddAliasDialog({
  item,
  syllabusVersionId,
  onSubmit,
  onCancel,
  isSubmitting,
}: {
  item: WorkItemDetailResponse;
  syllabusVersionId: string;
  onSubmit: (p: ResolveWorkItemApiPayload) => Promise<void>;
  onCancel: () => void;
  isSubmitting: boolean;
}) {
  const [aliasName, setAliasName] = useState(item.syllabusNode.rawTitle);
  const [aliasContext, setAliasContext] = useState("GLOBAL");
  const [canonicalNodeId, setCanonicalNodeId] = useState(
    item.currentMapping?.canonical_node_id || item.candidateMatches?.[0]?.canonicalNodeId || ""
  );
  const [notes, setNotes] = useState("");

  const handleConfirm = async () => {
    if (!aliasName.trim() || !canonicalNodeId.trim()) return;
    await onSubmit({
      syllabusVersionId,
      syllabusNodeId: item.syllabusNode.id,
      action: "ADD_ALIAS",
      expectedState: item.readinessState,
      canonicalNodeId: canonicalNodeId.trim(),
      aliasName: aliasName.trim(),
      aliasContext: aliasContext.trim() || "GLOBAL",
      notes: notes.trim() || undefined,
    });
  };

  return (
    <div className="p-4 bg-slate-900 border border-teal-600/50 rounded-xl space-y-4">
      <div className="flex items-center gap-2 text-teal-400 font-bold text-sm">
        <Tag className="w-4 h-4" />
        <span>Add Canonical Alias &amp; Map</span>
      </div>

      <p className="text-xs text-slate-300">
        Register an alias for an existing canonical node so future reconciliation runs automatically match this term.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-[11px] font-medium text-slate-400 block mb-1">
            Alias Name / Synonym *
          </label>
          <Input
            value={aliasName}
            onChange={(e) => setAliasName(e.target.value)}
            className="bg-slate-950 text-xs border-slate-800"
          />
        </div>

        <div>
          <label className="text-[11px] font-medium text-slate-400 block mb-1">
            Scope / Context
          </label>
          <Input
            value={aliasContext}
            onChange={(e) => setAliasContext(e.target.value)}
            className="bg-slate-950 text-xs border-slate-800 font-mono"
            placeholder="e.g. GLOBAL or SSC_CGL"
          />
        </div>
      </div>

      <div>
        <label className="text-[11px] font-medium text-slate-400 block mb-1">
          Target Canonical Node UUID *
        </label>
        <Input
          value={canonicalNodeId}
          onChange={(e) => setCanonicalNodeId(e.target.value)}
          className="bg-slate-950 text-xs border-slate-800 font-mono"
          placeholder="UUID of existing canonical node"
        />
      </div>

      <div>
        <label className="text-[11px] font-medium text-slate-400 block mb-1">
          Alias Notes (Optional)
        </label>
        <Input
          placeholder="e.g. Registered standard examination acronym..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="bg-slate-950 text-xs border-slate-800"
        />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={handleConfirm}
          disabled={isSubmitting || !aliasName.trim() || !canonicalNodeId.trim()}
          className="bg-teal-600 hover:bg-teal-500 text-white"
        >
          {isSubmitting ? "Adding Alias..." : "Add Alias & Map"}
        </Button>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// 8. IGNORE_REQUIREMENT
// -----------------------------------------------------------------------------
function IgnoreRequirementDialog({
  item,
  syllabusVersionId,
  onSubmit,
  onCancel,
  isSubmitting,
}: {
  item: WorkItemDetailResponse;
  syllabusVersionId: string;
  onSubmit: (p: ResolveWorkItemApiPayload) => Promise<void>;
  onCancel: () => void;
  isSubmitting: boolean;
}) {
  const [notes, setNotes] = useState("");

  const handleConfirm = async () => {
    if (!notes.trim()) return;
    await onSubmit({
      syllabusVersionId,
      syllabusNodeId: item.syllabusNode.id,
      action: "IGNORE_REQUIREMENT",
      expectedState: item.readinessState,
      notes: notes.trim(),
    });
  };

  return (
    <div className="p-4 bg-slate-900 border border-slate-700 rounded-xl space-y-4">
      <div className="flex items-center gap-2 text-slate-300 font-bold text-sm">
        <EyeOff className="w-4 h-4 text-slate-400" />
        <span>Ignore / Exclude Requirement</span>
      </div>

      <p className="text-xs text-slate-300">
        Mark this requirement as intentionally excluded. It will be removed from unresolved gaps and will not be counted in academic coverage.
      </p>

      <div>
        <label className="text-[11px] font-medium text-slate-300 block mb-1">
          Exclusion Reason / Justification *
        </label>
        <textarea
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Required: Provide the official reason why this syllabus requirement is excluded (e.g. Administrative guidelines header, non-examinable note)..."
          className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
        />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={handleConfirm}
          disabled={isSubmitting || !notes.trim()}
          className="bg-slate-700 hover:bg-slate-600 text-white"
        >
          {isSubmitting ? "Excluding..." : "Confirm Exclusion"}
        </Button>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// 9. REJECT_PROPOSAL
// -----------------------------------------------------------------------------
function RejectProposalDialog({
  item,
  syllabusVersionId,
  onSubmit,
  onCancel,
  isSubmitting,
}: {
  item: WorkItemDetailResponse;
  syllabusVersionId: string;
  onSubmit: (p: ResolveWorkItemApiPayload) => Promise<void>;
  onCancel: () => void;
  isSubmitting: boolean;
}) {
  const [notes, setNotes] = useState("");

  const handleConfirm = async () => {
    if (!notes.trim()) return;
    await onSubmit({
      syllabusVersionId,
      syllabusNodeId: item.syllabusNode.id,
      action: "REJECT_PROPOSAL",
      expectedState: item.readinessState,
      notes: notes.trim(),
    });
  };

  return (
    <div className="p-4 bg-slate-900 border border-rose-800/60 rounded-xl space-y-4">
      <div className="flex items-center gap-2 text-rose-400 font-bold text-sm">
        <XCircle className="w-4 h-4" />
        <span>Reject Automated Match Proposal</span>
      </div>

      <p className="text-xs text-slate-300">
        Reject the proposed mapping. The requirement will return to the review queue with status REJECTED for manual resolution.
      </p>

      <div>
        <label className="text-[11px] font-medium text-slate-300 block mb-1">
          Rejection Reason *
        </label>
        <textarea
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Required: State why the automated candidate match was rejected (e.g. False semantic cognate, different academic tier)..."
          className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
        />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={handleConfirm}
          disabled={isSubmitting || !notes.trim()}
          className="bg-rose-700 hover:bg-rose-600 text-white"
        >
          {isSubmitting ? "Rejecting..." : "Reject Proposal"}
        </Button>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// 10. UNMAP_AND_REVIEW
// -----------------------------------------------------------------------------
function UnmapAndReviewDialog({
  item,
  syllabusVersionId,
  onSubmit,
  onCancel,
  isSubmitting,
}: {
  item: WorkItemDetailResponse;
  syllabusVersionId: string;
  onSubmit: (p: ResolveWorkItemApiPayload) => Promise<void>;
  onCancel: () => void;
  isSubmitting: boolean;
}) {
  const [notes, setNotes] = useState("");

  const handleConfirm = async () => {
    await onSubmit({
      syllabusVersionId,
      syllabusNodeId: item.syllabusNode.id,
      action: "UNMAP_AND_REVIEW",
      expectedState: item.readinessState,
      notes: notes.trim() || undefined,
    });
  };

  return (
    <div className="p-4 bg-slate-900 border border-amber-600/50 rounded-xl space-y-4">
      <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
        <Undo2 className="w-4 h-4" />
        <span>Unmap &amp; Return to Review</span>
      </div>

      <div className="p-3 bg-amber-950/40 border border-amber-900/60 rounded-lg text-xs text-amber-200 space-y-1">
        <div className="font-semibold text-amber-300">Taxonomy Preservation Notice</div>
        <p>
          This action unlinks the syllabus requirement from its current canonical node and returns the requirement to the unreviewed work queue.
        </p>
        <p className="font-bold text-amber-400">
          The canonical taxonomy node itself will NOT be deleted or modified.
        </p>
      </div>

      <div>
        <label className="text-[11px] font-medium text-slate-400 block mb-1">
          Unmap Reason (Optional)
        </label>
        <Input
          placeholder="e.g. Reopening for re-assessment..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="bg-slate-950 text-xs border-slate-800"
        />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={handleConfirm}
          disabled={isSubmitting}
          className="bg-amber-600 hover:bg-amber-500 text-white"
        >
          {isSubmitting ? "Unmapping..." : "Confirm Unmap"}
        </Button>
      </div>
    </div>
  );
}
