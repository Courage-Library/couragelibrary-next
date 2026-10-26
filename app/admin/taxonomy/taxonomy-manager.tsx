"use client";

import React, { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, FolderTree, Plus, Pencil, Power, ArrowUp, ArrowDown, X } from "lucide-react";
import {
  TaxonomyTreeNode,
  TaxonomyNodeType,
  allowedChildTypes,
  slugifyTaxonomyName,
  PROJECTED_NODE_TYPES,
} from "@/services/taxonomy/taxonomy.rules";
import {
  createTaxonomyNodeAction,
  renameTaxonomyNodeAction,
  setTaxonomyNodeActiveAction,
  reorderTaxonomyNodesAction,
} from "./actions";

interface Props {
  tree: TaxonomyTreeNode[];
  loadError: string | null;
}

type Editor =
  | { mode: "create"; parentId: string | null; parentType: TaxonomyNodeType | null }
  | { mode: "rename"; node: TaxonomyTreeNode }
  | null;

const TYPE_STYLES: Record<TaxonomyNodeType, string> = {
  SUBJECT: "bg-blue-50 text-blue-700 border-blue-200",
  DOMAIN: "bg-violet-50 text-violet-700 border-violet-200",
  TOPIC: "bg-emerald-50 text-emerald-700 border-emerald-200",
  SUBTOPIC: "bg-teal-50 text-teal-700 border-teal-200",
  CONCEPT: "bg-accent-50 text-accent-700 border-accent-200",
  METHOD: "bg-slate-100 text-slate-700 border-slate-200",
};

function countNodes(list: TaxonomyTreeNode[]): number {
  return list.reduce((n, c) => n + 1 + countNodes(c.children), 0);
}

export function TaxonomyManager({ tree, loadError }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(tree.map((n) => n.id)));
  const [editor, setEditor] = useState<Editor>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const total = useMemo(() => countNodes(tree), [tree]);

  const run = (fn: () => Promise<{ success: boolean; error?: string }>, okText: string) => {
    startTransition(async () => {
      const res = await fn();
      if (res.success) {
        setMessage({ kind: "ok", text: okText });
        setEditor(null);
        router.refresh();
      } else {
        setMessage({ kind: "error", text: res.error || "The change could not be saved." });
      }
    });
  };

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const move = (siblings: TaxonomyTreeNode[], index: number, delta: number, parentId: string | null) => {
    const target = index + delta;
    if (target < 0 || target >= siblings.length) return;
    const ids = siblings.map((s) => s.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    run(() => reorderTaxonomyNodesAction(parentId, ids), "Order updated.");
  };

  const renderNodes = (nodes: TaxonomyTreeNode[], parentId: string | null): React.ReactNode =>
    nodes.map((node, index) => {
      const isOpen = expanded.has(node.id);
      const childTypes = allowedChildTypes(node.nodeType);
      return (
        <li key={node.id}>
          <div className={`group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50 ${node.isActive ? "" : "opacity-60"}`}>
            <button
              type="button"
              onClick={() => toggle(node.id)}
              className="w-5 h-5 flex items-center justify-center text-slate-400"
              aria-label={isOpen ? "Collapse" : "Expand"}
              disabled={node.children.length === 0}
            >
              {node.children.length > 0 ? (isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />) : null}
            </button>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${TYPE_STYLES[node.nodeType]}`}>{node.nodeType}</span>
            <span className="text-xs font-semibold text-slate-900">{node.name}</span>
            <span className="text-[10px] text-slate-400 font-mono">{node.slug}</span>
            {!node.isActive && <span className="text-[10px] font-bold text-rose-600">INACTIVE</span>}
            <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
              <button type="button" title="Move up" disabled={isPending || index === 0} onClick={() => move(nodes, index, -1, parentId)} className="p-1 rounded text-slate-500 hover:bg-slate-100 disabled:opacity-30">
                <ArrowUp className="w-3.5 h-3.5" />
              </button>
              <button type="button" title="Move down" disabled={isPending || index === nodes.length - 1} onClick={() => move(nodes, index, 1, parentId)} className="p-1 rounded text-slate-500 hover:bg-slate-100 disabled:opacity-30">
                <ArrowDown className="w-3.5 h-3.5" />
              </button>
              {childTypes.length > 0 && (
                <button type="button" title="Add child" disabled={isPending} onClick={() => setEditor({ mode: "create", parentId: node.id, parentType: node.nodeType })} className="p-1 rounded text-blue-600 hover:bg-blue-50">
                  <Plus className="w-3.5 h-3.5" />
                </button>
              )}
              <button type="button" title="Rename" disabled={isPending} onClick={() => setEditor({ mode: "rename", node })} className="p-1 rounded text-slate-600 hover:bg-slate-100">
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                title={node.isActive ? "Deactivate" : "Reactivate"}
                disabled={isPending}
                onClick={() => run(() => setTaxonomyNodeActiveAction(node.id, !node.isActive), node.isActive ? `"${node.name}" deactivated.` : `"${node.name}" reactivated.`)}
                className={`p-1 rounded ${node.isActive ? "text-rose-600 hover:bg-rose-50" : "text-emerald-600 hover:bg-emerald-50"}`}
              >
                <Power className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          {isOpen && node.children.length > 0 && <ul className="ml-5 border-l border-slate-200 pl-2">{renderNodes(node.children, node.id)}</ul>}
        </li>
      );
    });

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <FolderTree className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">Academic Taxonomy</h1>
            <p className="text-xs text-slate-500">
              The single source of subjects, topics and subtopics ({total} nodes). Subjects, topics and subtopics used across the app are projected from here automatically.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setEditor({ mode: "create", parentId: null, parentType: null })}
          className="px-3 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold inline-flex items-center gap-1.5 hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" /> Add subject
        </button>
      </div>

      {loadError && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">{loadError}</div>}
      {message && (
        <div className={`rounded-xl border px-4 py-3 text-xs font-semibold ${message.kind === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}`}>
          {message.text}
        </div>
      )}

      {editor && <NodeEditor key={editor.mode === "rename" ? editor.node.id : `new-${editor.parentId}`} editor={editor} pending={isPending} onCancel={() => setEditor(null)} onRun={run} />}

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        {tree.length === 0 ? (
          <p className="text-xs text-slate-500">No taxonomy nodes yet.</p>
        ) : (
          <ul className="space-y-0.5">{renderNodes(tree, null)}</ul>
        )}
      </div>
    </div>
  );
}

function NodeEditor({
  editor,
  pending,
  onCancel,
  onRun,
}: {
  editor: NonNullable<Editor>;
  pending: boolean;
  onCancel: () => void;
  onRun: (fn: () => Promise<{ success: boolean; error?: string }>, okText: string) => void;
}) {
  const childTypes = editor.mode === "create" ? allowedChildTypes(editor.parentType) : [];
  const [nodeType, setNodeType] = useState<TaxonomyNodeType>(editor.mode === "create" ? childTypes[0] : editor.node.nodeType);
  const [name, setName] = useState(editor.mode === "rename" ? editor.node.name : "");
  const [slug, setSlug] = useState(editor.mode === "rename" ? editor.node.slug : "");
  const [slugTouched, setSlugTouched] = useState(editor.mode === "rename");
  const [description, setDescription] = useState("");

  const effectiveSlug = slugTouched ? slug : slugifyTaxonomyName(name);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editor.mode === "create") {
      onRun(
        () => createTaxonomyNodeAction({ parentId: editor.parentId, nodeType, name, slug: effectiveSlug, description }),
        `${nodeType} "${name.trim()}" created.`
      );
    } else {
      onRun(() => renameTaxonomyNodeAction(editor.node.id, name, effectiveSlug), `Renamed to "${name.trim()}".`);
    }
  };

  return (
    <form onSubmit={submit} className="rounded-2xl border border-blue-200 bg-white p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-slate-900">{editor.mode === "create" ? (editor.parentId ? "Add child node" : "Add subject") : `Rename ${editor.node.nodeType.toLowerCase()}`}</h2>
        <button type="button" onClick={onCancel} className="p-1 rounded text-slate-400 hover:bg-slate-100" aria-label="Cancel">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {editor.mode === "create" && (
          <label className="block">
            <span className="block text-xs font-semibold text-slate-700 mb-1">Type</span>
            <select value={nodeType} onChange={(e) => setNodeType(e.target.value as TaxonomyNodeType)} className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white">
              {childTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="block">
          <span className="block text-xs font-semibold text-slate-700 mb-1">Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200" />
        </label>
        <label className="block">
          <span className="block text-xs font-semibold text-slate-700 mb-1">Slug</span>
          <input
            value={effectiveSlug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value);
            }}
            required
            className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-200"
          />
        </label>
      </div>
      {editor.mode === "create" && (
        <label className="block">
          <span className="block text-xs font-semibold text-slate-700 mb-1">Description (optional)</span>
          <input value={description} onChange={(e) => setDescription(e.target.value)} className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200" />
        </label>
      )}
      {editor.mode === "create" && PROJECTED_NODE_TYPES.includes(nodeType) && (
        <p className="text-[11px] text-slate-500">This {nodeType.toLowerCase()} is also published to the app&apos;s subject/topic lists with the same id. Its slug must be unique across all {nodeType.toLowerCase()}s.</p>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700">
          Cancel
        </button>
        <button type="submit" disabled={pending} className="px-3 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold disabled:opacity-50">
          {pending ? "Saving…" : editor.mode === "create" ? "Create" : "Save"}
        </button>
      </div>
    </form>
  );
}
