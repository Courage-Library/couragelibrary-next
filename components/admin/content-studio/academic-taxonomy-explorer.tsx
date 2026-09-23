"use client";

import React, { useState } from "react";
import { AcademicExplorerNode } from "@/services/admin-content-studio.service";
import {
  Folder,
  FolderOpen,
  BookOpen,
  ChevronRight,
  ChevronDown,
  Layers,
  CheckCircle2,
  FileText,
  Search,
} from "lucide-react";

interface Props {
  tree: AcademicExplorerNode[];
  selectedUnitId: string | null;
  onSelectUnit: (unitId: string) => void;
}

export const AcademicTaxonomyExplorer: React.FC<Props> = ({
  tree,
  selectedUnitId,
  onSelectUnit,
}) => {
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});
  const [searchTerm, setSearchTerm] = useState("");

  const toggleExpand = (id: string) => {
    setExpandedNodes((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const filterTree = (nodes: AcademicExplorerNode[]): AcademicExplorerNode[] => {
    if (!searchTerm.trim()) return nodes;
    const term = searchTerm.toLowerCase();

    return nodes
      .map((node) => {
        const matchesSelf = node.name.toLowerCase().includes(term);
        const filteredChildren = node.children ? filterTree(node.children) : [];
        if (matchesSelf || filteredChildren.length > 0) {
          return { ...node, children: filteredChildren };
        }
        return null;
      })
      .filter(Boolean) as AcademicExplorerNode[];
  };

  const filteredTree = filterTree(tree);

  return (
    <div className="flex h-full flex-col border-r border-slate-200 bg-white">
      <div className="border-b border-slate-200 p-3 bg-slate-50/50">
        <div className="flex items-center gap-2 text-slate-800 font-bold text-xs uppercase tracking-wider">
          <Layers className="h-4 w-4 text-blue-700" />
          <span>Academic Taxonomy</span>
        </div>
        <div className="relative mt-2">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search subjects, topics, units..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-hidden focus:ring-1 focus:ring-blue-600 shadow-2xs"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 text-xs">
        {filteredTree.length === 0 ? (
          <div className="p-4 text-center text-slate-400">No matching taxonomy nodes found.</div>
        ) : (
          filteredTree.map((subject) => (
            <div key={subject.id} className="mb-1">
              <button
                type="button"
                onClick={() => toggleExpand(subject.id)}
                className="flex w-full items-center justify-between rounded-lg p-2 font-bold text-slate-900 hover:bg-slate-100 transition"
              >
                <div className="flex items-center gap-1.5 truncate">
                  {expandedNodes[subject.id] ? (
                    <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                  )}
                  <BookOpen className="h-4 w-4 shrink-0 text-blue-700" />
                  <span className="truncate">{subject.name}</span>
                </div>
                <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600 border border-slate-200/60">
                  {subject.publishedCount}/{subject.unitCount}
                </span>
              </button>

              {expandedNodes[subject.id] && subject.children && (
                <div className="ml-3 border-l border-slate-200 pl-2">
                  {subject.children.map((topic) => (
                    <div key={topic.id} className="mb-0.5">
                      <button
                        type="button"
                        onClick={() => toggleExpand(topic.id)}
                        className="flex w-full items-center justify-between rounded-md p-1.5 font-semibold text-slate-700 hover:bg-slate-100 transition"
                      >
                        <div className="flex items-center gap-1.5 truncate">
                          {expandedNodes[topic.id] ? (
                            <ChevronDown className="h-3 w-3 shrink-0 text-slate-400" />
                          ) : (
                            <ChevronRight className="h-3 w-3 shrink-0 text-slate-400" />
                          )}
                          <Folder className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                          <span className="truncate">{topic.name}</span>
                        </div>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {topic.publishedCount}/{topic.unitCount}
                        </span>
                      </button>

                      {expandedNodes[topic.id] && topic.children && (
                        <div className="ml-3 space-y-0.5 border-l border-slate-200 pl-2">
                          {topic.children.map((unit) => {
                            const isSelected = unit.id === selectedUnitId;
                            const isPublished = (unit.publishedCount || 0) > 0;

                            return (
                              <button
                                key={unit.id}
                                type="button"
                                onClick={() => onSelectUnit(unit.id)}
                                className={`flex w-full items-center justify-between rounded-md p-1.5 text-left transition ${
                                  isSelected
                                    ? "bg-blue-50 font-bold text-blue-800 border-l-2 border-blue-700 pl-2"
                                    : "text-slate-600 hover:bg-slate-100"
                                }`}
                              >
                                <div className="flex items-center gap-1.5 truncate">
                                  <FileText className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                                  <span className="truncate">{unit.name}</span>
                                </div>
                                {isPublished && (
                                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
