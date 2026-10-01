'use client';

import React, { useEffect, useState } from 'react';
import {
  X,
  History,
  GitCompare,
  Eye,
  CheckCircle2,
  Clock,
  Globe2,
  Archive,
  Cpu,
  FileText,
} from 'lucide-react';
import {
  AdminCurrentAffairsFullArticle,
  AdminCurrentAffairsVersionDetail,
} from '@/types/current-affairs';
import { Badge } from '@/components/ui/badge';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  articleId: string | null;
  onOpenDiff: (v1: number, v2: number) => void;
  onPreviewVersion: (versionId: string) => void;
}

export function CurrentAffairsHistoryModal({
  isOpen,
  onClose,
  articleId,
  onOpenDiff,
  onPreviewVersion,
}: Props) {
  const [article, setArticle] = useState<AdminCurrentAffairsFullArticle | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedV1, setSelectedV1] = useState<number>(1);
  const [selectedV2, setSelectedV2] = useState<number>(2);

  useEffect(() => {
    if (!isOpen || !articleId) return;

    setIsLoading(true);
    fetch(`/api/admin/current-affairs/articles/${articleId}`)
      .then((res) => res.json())
      .then((json) => {
        if (json.success && json.data) {
          const art: AdminCurrentAffairsFullArticle = json.data;
          setArticle(art);
          if (art.versions.length >= 2) {
            setSelectedV1(art.versions[art.versions.length - 1].versionNumber);
            setSelectedV2(art.versions[0].versionNumber);
          }
        }
      })
      .finally(() => setIsLoading(false));
  }, [isOpen, articleId]);

  if (!isOpen) return null;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'DRAFT':
        return <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">DRAFT</span>;
      case 'IN_REVIEW':
        return <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">IN REVIEW</span>;
      case 'APPROVED':
        return <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">APPROVED</span>;
      case 'COMPILED':
        return <span className="text-[10px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">COMPILED</span>;
      case 'PUBLISHED':
        return <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">PUBLISHED</span>;
      case 'ARCHIVED':
        return <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">ARCHIVED</span>;
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-4xl w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
              <History className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Version History: {article?.slug}
              </h2>
              <p className="text-[11px] text-slate-500">
                Immutable publication audit trail &amp; version snapshots
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1 text-xs">
          {isLoading ? (
            <div className="p-12 text-center text-slate-500">Loading version history...</div>
          ) : !article ? (
            <div className="p-12 text-center text-slate-500">Article not found.</div>
          ) : (
            <>
              {/* Compare Trigger Bar */}
              {article.versions.length >= 2 && (
                <div className="p-3.5 rounded-xl bg-purple-50/60 border border-purple-200 flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <GitCompare className="w-4 h-4 text-purple-700" />
                    <span className="font-bold text-purple-950 text-xs">Compare Any Two Versions:</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={selectedV1}
                      onChange={(e) => setSelectedV1(Number(e.target.value))}
                      aria-label="Select first version to compare"
                      className="px-2 py-1 text-xs rounded border border-purple-200 bg-white font-mono"
                    >
                      {article.versions.map((v) => (
                        <option key={v.id} value={v.versionNumber}>
                          v{v.versionNumber} ({v.status})
                        </option>
                      ))}
                    </select>
                    <span className="text-purple-700 font-bold">vs</span>
                    <select
                      value={selectedV2}
                      onChange={(e) => setSelectedV2(Number(e.target.value))}
                      aria-label="Select second version to compare"
                      className="px-2 py-1 text-xs rounded border border-purple-200 bg-white font-mono"
                    >
                      {article.versions.map((v) => (
                        <option key={v.id} value={v.versionNumber}>
                          v{v.versionNumber} ({v.status})
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => {
                        onClose();
                        onOpenDiff(selectedV1, selectedV2);
                      }}
                      className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-lg transition-colors text-xs"
                    >
                      Compare
                    </button>
                  </div>
                </div>
              )}

              {/* Versions List */}
              <div className="space-y-3">
                {article.versions.map((ver) => (
                  <div
                    key={ver.id}
                    className="p-4 rounded-xl border border-slate-200 bg-white hover:border-slate-300 transition-all space-y-2"
                  >
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-bold text-blue-700">
                          v{ver.versionNumber}
                        </span>
                        {getStatusBadge(ver.status)}
                        {article.publishedVersionId === ver.id && (
                          <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200">
                            CURRENT PUBLISHED POINTER
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            onClose();
                            onPreviewVersion(ver.id);
                          }}
                          className="px-2.5 py-1 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-[11px] font-semibold flex items-center gap-1"
                        >
                          <Eye className="w-3.5 h-3.5" /> Preview Version
                        </button>
                      </div>
                    </div>

                    <div className="font-semibold text-slate-800 text-xs">
                      {ver.headline}
                    </div>

                    <div className="flex items-center gap-4 text-[11px] text-slate-500 font-mono flex-wrap pt-2 border-t border-slate-100">
                      <span>
                        Created: {new Date(ver.createdAt).toLocaleString('en-GB')}
                      </span>
                      {ver.publishedAt && (
                        <span>
                          Published: {new Date(ver.publishedAt).toLocaleString('en-GB')}
                        </span>
                      )}
                      <span>
                        Checksum: {ver.checksumSha256?.slice(0, 12)}...
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-6 py-3 border-t border-slate-200 bg-slate-50 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold"
          >
            Close History
          </button>
        </div>
      </div>
    </div>
  );
}
