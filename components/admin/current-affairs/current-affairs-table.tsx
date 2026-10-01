'use client';

import React from 'react';
import {
  AdminCurrentAffairsListItem,
  CurrentAffairsImportanceTier,
  CurrentAffairsStatus,
} from '@/types/current-affairs';
import { Badge } from '@/components/ui/badge';
import {
  Eye,
  Edit,
  Send,
  CheckCircle2,
  Cpu,
  Globe2,
  GitBranch,
  Archive,
  Trash2,
  History,
  AlertCircle,
  Clock,
  Layers,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

interface Props {
  items: AdminCurrentAffairsListItem[];
  isLoading: boolean;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onEdit: (item: AdminCurrentAffairsListItem) => void;
  onPreview: (item: AdminCurrentAffairsListItem) => void;
  onReview: (item: AdminCurrentAffairsListItem) => void;
  onSubmitForReview: (item: AdminCurrentAffairsListItem) => void;
  onCompile: (item: AdminCurrentAffairsListItem) => void;
  onPublish: (item: AdminCurrentAffairsListItem) => void;
  onCreateRevision: (item: AdminCurrentAffairsListItem) => void;
  onArchive: (item: AdminCurrentAffairsListItem) => void;
  onDiscard: (item: AdminCurrentAffairsListItem) => void;
  onViewHistory: (item: AdminCurrentAffairsListItem) => void;
}

export function CurrentAffairsTable({
  items,
  isLoading,
  page,
  totalPages,
  onPageChange,
  onEdit,
  onPreview,
  onReview,
  onSubmitForReview,
  onCompile,
  onPublish,
  onCreateRevision,
  onArchive,
  onDiscard,
  onViewHistory,
}: Props) {
  const getStatusBadge = (status: CurrentAffairsStatus) => {
    switch (status) {
      case 'DRAFT':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Draft
          </span>
        );
      case 'IN_REVIEW':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
            <Clock className="w-2.5 h-2.5" /> In Review
          </span>
        );
      case 'APPROVED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-2.5 h-2.5" /> Approved
          </span>
        );
      case 'COMPILED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
            <Cpu className="w-2.5 h-2.5" /> Compiled
          </span>
        );
      case 'PUBLISHED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
            <Globe2 className="w-2.5 h-2.5" /> Published
          </span>
        );
      case 'ARCHIVED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
            <Archive className="w-2.5 h-2.5" /> Archived
          </span>
        );
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  const getTierBadge = (tier: CurrentAffairsImportanceTier) => {
    switch (tier) {
      case 'CRITICAL':
        return <span className="text-[10px] font-bold text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">CRITICAL</span>;
      case 'HIGH':
        return <span className="text-[10px] font-bold text-orange-700 bg-orange-50 px-1.5 py-0.5 rounded border border-orange-200">HIGH</span>;
      case 'MEDIUM':
        return <span className="text-[10px] font-medium text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">MEDIUM</span>;
      case 'LOW':
        return <span className="text-[10px] font-medium text-slate-600 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200">LOW</span>;
    }
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center shadow-xs">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="mt-3 text-xs font-semibold text-slate-600">Loading current affairs records...</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center shadow-xs">
        <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
          <Layers className="w-6 h-6" />
        </div>
        <h3 className="mt-3 text-sm font-bold text-slate-800">No Current Affairs Found</h3>
        <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
          No articles match your active filter criteria. Try changing filters or create a new draft.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden flex flex-col">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-semibold text-[11px] uppercase tracking-wider">
              <th className="py-3 px-4 min-w-[280px]">Headline &amp; Slug</th>
              <th className="py-3 px-3 min-w-[95px]">Event Date</th>
              <th className="py-3 px-3 min-w-[120px]">Category</th>
              <th className="py-3 px-3 min-w-[85px]">Tier</th>
              <th className="py-3 px-3 min-w-[100px]">Status</th>
              <th className="py-3 px-3 min-w-[65px] text-center">Version</th>
              <th className="py-3 px-3 min-w-[110px]">Updated</th>
              <th className="py-3 px-4 min-w-[180px] text-right">Lifecycle Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((item) => {
              const status = item.latestVersionStatus || item.status;

              return (
                <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
                  {/* Headline & Details */}
                  <td className="py-3 px-4">
                    <div className="space-y-0.5">
                      <div className="font-semibold text-slate-900 line-clamp-1 hover:text-blue-600 cursor-pointer" onClick={() => onPreview(item)}>
                        {item.headline}
                      </div>
                      <div className="text-[11px] font-mono text-slate-400 truncate max-w-md">
                        /{item.slug}
                      </div>
                      {item.reviewFeedback && status === 'DRAFT' && (
                        <div className="inline-flex items-center gap-1 text-[10px] text-rose-600 font-medium bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200 mt-1">
                          <AlertCircle className="w-3 h-3" /> Changes Requested: {item.reviewFeedback}
                        </div>
                      )}
                    </div>
                  </td>

                  {/* Date */}
                  <td className="py-3 px-3 font-mono text-slate-600 whitespace-nowrap">
                    {item.newsDate}
                  </td>

                  {/* Category */}
                  <td className="py-3 px-3">
                    <span className="text-[11px] font-medium text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                      {item.category.replace(/_/g, ' ')}
                    </span>
                  </td>

                  {/* Importance */}
                  <td className="py-3 px-3">{getTierBadge(item.importanceTier)}</td>

                  {/* Status */}
                  <td className="py-3 px-3 whitespace-nowrap">{getStatusBadge(status)}</td>

                  {/* Version */}
                  <td className="py-3 px-3 text-center">
                    <button
                      onClick={() => onViewHistory(item)}
                      className="font-mono text-[11px] font-bold text-blue-600 hover:text-blue-800 hover:underline"
                    >
                      v{item.latestVersionNumber}
                    </button>
                  </td>

                  {/* Updated */}
                  <td className="py-3 px-3 text-slate-500 text-[11px] whitespace-nowrap font-mono">
                    {new Date(item.updatedAt).toLocaleDateString('en-GB', {
                      day: '2-digit',
                      month: 'short',
                    })}
                  </td>

                  {/* Actions Matrix */}
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-1 flex-wrap">
                      {/* Lifecycle Action Buttons */}
                      {status === 'DRAFT' && (
                        <>
                          <button
                            onClick={() => onEdit(item)}
                            className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1 transition-colors"
                            title="Edit Draft"
                          >
                            <Edit className="w-3.5 h-3.5 text-slate-600" />
                            <span className="hidden xl:inline">Edit</span>
                          </button>
                          <button
                            onClick={() => onPreview(item)}
                            className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1 transition-colors"
                            title="Preview Draft"
                          >
                            <Eye className="w-3.5 h-3.5 text-slate-500" />
                          </button>
                          <button
                            onClick={() => onSubmitForReview(item)}
                            className="p-1.5 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold flex items-center gap-1 transition-colors"
                            title="Submit for Editorial Review"
                          >
                            <Send className="w-3.5 h-3.5 text-blue-600" />
                            <span className="hidden xl:inline">Submit</span>
                          </button>
                          <button
                            onClick={() => onDiscard(item)}
                            className="p-1.5 rounded-lg border border-rose-200 bg-white hover:bg-rose-50 text-rose-600 text-xs transition-colors"
                            title="Discard Draft"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}

                      {status === 'IN_REVIEW' && (
                        <>
                          <button
                            onClick={() => onPreview(item)}
                            className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1 transition-colors"
                            title="Preview Draft"
                          >
                            <Eye className="w-3.5 h-3.5 text-slate-500" />
                          </button>
                          <button
                            onClick={() => onReview(item)}
                            className="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1 transition-colors shadow-xs"
                            title="Open Review Workbench"
                          >
                            <Clock className="w-3.5 h-3.5" />
                            <span>Review Workbench</span>
                          </button>
                        </>
                      )}

                      {status === 'APPROVED' && (
                        <>
                          <button
                            onClick={() => onPreview(item)}
                            className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1 transition-colors"
                            title="Preview"
                          >
                            <Eye className="w-3.5 h-3.5 text-slate-500" />
                          </button>
                          <button
                            onClick={() => onCompile(item)}
                            className="px-2.5 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold flex items-center gap-1 transition-colors shadow-xs"
                            title="Compile Sanitized AST"
                          >
                            <Cpu className="w-3.5 h-3.5" />
                            <span>Compile AST</span>
                          </button>
                        </>
                      )}

                      {status === 'COMPILED' && (
                        <>
                          <button
                            onClick={() => onPreview(item)}
                            className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1 transition-colors"
                            title="Preview"
                          >
                            <Eye className="w-3.5 h-3.5 text-slate-500" />
                          </button>
                          <button
                            onClick={() => onPublish(item)}
                            className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1 transition-colors shadow-xs"
                            title="Publish to Live Feed"
                          >
                            <Globe2 className="w-3.5 h-3.5" />
                            <span>Publish</span>
                          </button>
                        </>
                      )}

                      {status === 'PUBLISHED' && (
                        <>
                          <button
                            onClick={() => onPreview(item)}
                            className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1 transition-colors"
                            title="View Published Article"
                          >
                            <Eye className="w-3.5 h-3.5 text-slate-500" />
                            <span className="hidden xl:inline">View</span>
                          </button>
                          <button
                            onClick={() => onCreateRevision(item)}
                            className="p-1.5 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold flex items-center gap-1 transition-colors"
                            title="Create Revision v(N+1)"
                          >
                            <GitBranch className="w-3.5 h-3.5 text-blue-600" />
                            <span className="hidden xl:inline">Revision</span>
                          </button>
                          <button
                            onClick={() => onArchive(item)}
                            className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-600 text-xs transition-colors"
                            title="Archive Article"
                          >
                            <Archive className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}

                      {status === 'ARCHIVED' && (
                        <button
                          onClick={() => onViewHistory(item)}
                          className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-xs font-semibold flex items-center gap-1 transition-colors"
                          title="View Version History"
                        >
                          <History className="w-3.5 h-3.5" />
                          <span>History</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 bg-slate-50/50 border-t border-slate-200 text-xs text-slate-600">
          <span className="font-mono">
            Page {page} of {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
              className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed font-semibold flex items-center gap-1"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Previous
            </button>
            <button
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
              className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed font-semibold flex items-center gap-1"
            >
              Next <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
