'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { CurrentAffairsHeader } from '@/components/admin/current-affairs/current-affairs-header';
import { CurrentAffairsStatsBar } from '@/components/admin/current-affairs/current-affairs-stats-bar';
import { CurrentAffairsFilterBar } from '@/components/admin/current-affairs/current-affairs-filter-bar';
import { CurrentAffairsTable } from '@/components/admin/current-affairs/current-affairs-table';
import { CurrentAffairsPromptModal } from '@/components/admin/current-affairs/current-affairs-prompt-modal';
import { CurrentAffairsImportModal } from '@/components/admin/current-affairs/current-affairs-import-modal';
import { CurrentAffairsEditorDrawer } from '@/components/admin/current-affairs/current-affairs-editor-drawer';
import { CurrentAffairsPreviewModal } from '@/components/admin/current-affairs/current-affairs-preview-modal';
import { CurrentAffairsReviewWorkbench } from '@/components/admin/current-affairs/current-affairs-review-workbench';
import { CurrentAffairsDiffModal } from '@/components/admin/current-affairs/current-affairs-diff-modal';
import { CurrentAffairsHistoryModal } from '@/components/admin/current-affairs/current-affairs-history-modal';
import { CurrentAffairsQuizModal } from '@/components/admin/current-affairs/current-affairs-quiz-modal';
import {
  AdminCurrentAffairsDashboardStats,
  AdminCurrentAffairsListItem,
} from '@/types/current-affairs';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';

export default function AdminCurrentAffairsStudioPage() {
  // State
  const [stats, setStats] = useState<AdminCurrentAffairsDashboardStats | null>(null);
  const [items, setItems] = useState<AdminCurrentAffairsListItem[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);

  // Filters
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedImportance, setSelectedImportance] = useState<string>('ALL');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Loading & Toast State
  const [isLoadingStats, setIsLoadingStats] = useState<boolean>(true);
  const [isLoadingList, setIsLoadingList] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Modals & Drawers
  const [isPromptModalOpen, setIsPromptModalOpen] = useState<boolean>(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState<boolean>(false);
  const [isQuizModalOpen, setIsQuizModalOpen] = useState<boolean>(false);
  const [isEditorDrawerOpen, setIsEditorDrawerOpen] = useState<boolean>(false);
  const [editingArticleId, setEditingArticleId] = useState<string | null>(null);

  const [previewArticleId, setPreviewArticleId] = useState<string | null>(null);
  const [previewVersionId, setPreviewVersionId] = useState<string | null>(null);

  const [reviewArticleId, setReviewArticleId] = useState<string | null>(null);
  const [historyArticleId, setHistoryArticleId] = useState<string | null>(null);

  const [diffState, setDiffState] = useState<{
    isOpen: boolean;
    articleId: string | null;
    v1: number;
    v2: number;
  }>({ isOpen: false, articleId: null, v1: 1, v2: 2 });

  const showToast = (type: 'success' | 'error', message: string) => {
    setToastMessage({ type, message });
    setTimeout(() => setToastMessage(null), 3500);
  };

  // 1. Fetch Stats
  const fetchStats = useCallback(async () => {
    setIsLoadingStats(true);
    try {
      const res = await fetch('/api/admin/current-affairs/stats');
      const json = await res.json();
      if (json.success && json.data) {
        setStats(json.data);
      }
    } catch {
      // Non-blocking
    } finally {
      setIsLoadingStats(false);
    }
  }, []);

  // 2. Fetch Articles List
  const fetchArticles = useCallback(
    async (currentPage = page) => {
      setIsLoadingList(true);
      try {
        const params = new URLSearchParams({
          page: String(currentPage),
          limit: '20',
        });
        if (selectedStatus !== 'ALL') {
          if (selectedStatus === 'NEEDS_CHANGES') {
            params.set('status', 'DRAFT');
          } else {
            params.set('status', selectedStatus);
          }
        }
        if (selectedCategory !== 'ALL') params.set('category', selectedCategory);
        if (selectedImportance !== 'ALL') params.set('importanceTier', selectedImportance);
        if (selectedDate) params.set('date', selectedDate);
        if (searchQuery.trim()) params.set('search', searchQuery.trim());

        const res = await fetch(`/api/admin/current-affairs/articles?${params.toString()}`);
        const json = await res.json();
        if (json.success && json.data) {
          setItems(json.data.items || []);
          setTotalCount(json.data.totalCount || 0);
          setTotalPages(json.data.totalPages || 1);
        }
      } catch (err: any) {
        showToast('error', err.message || 'Failed to fetch current affairs list');
      } finally {
        setIsLoadingList(false);
      }
    },
    [page, selectedStatus, selectedCategory, selectedImportance, selectedDate, searchQuery]
  );

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([fetchStats(), fetchArticles(1)]);
    setPage(1);
    setIsRefreshing(false);
  };

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    fetchArticles(page);
  }, [fetchArticles, page]);

  // Actions
  const handleOpenCreate = () => {
    setEditingArticleId(null);
    setIsEditorDrawerOpen(true);
  };

  const handleEdit = (item: AdminCurrentAffairsListItem) => {
    setEditingArticleId(item.id);
    setIsEditorDrawerOpen(true);
  };

  const handlePreview = (item: AdminCurrentAffairsListItem) => {
    setPreviewArticleId(item.id);
    setPreviewVersionId(item.latestVersionId || null);
  };

  const handleReview = (item: AdminCurrentAffairsListItem) => {
    setReviewArticleId(item.id);
  };

  const handleSubmitForReview = async (item: AdminCurrentAffairsListItem) => {
    try {
      const res = await fetch(`/api/admin/current-affairs/articles/${item.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ versionId: item.latestVersionId }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        showToast('error', json.error?.message || 'Failed to submit for review');
        return;
      }
      showToast('success', `Submitted "${item.headline}" for review`);
      handleRefresh();
    } catch (err: any) {
      showToast('error', err.message || 'Failed to submit article');
    }
  };

  const handleCompile = async (item: AdminCurrentAffairsListItem) => {
    try {
      const res = await fetch(`/api/admin/current-affairs/articles/${item.id}/compile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ versionId: item.latestVersionId }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        showToast('error', json.error?.message || 'Failed to compile AST');
        return;
      }
      showToast('success', `Compiled sanitized AST for "${item.headline}"`);
      handleRefresh();
    } catch (err: any) {
      showToast('error', err.message || 'Failed to compile article');
    }
  };

  const handlePublish = async (item: AdminCurrentAffairsListItem) => {
    try {
      const res = await fetch(`/api/admin/current-affairs/articles/${item.id}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ versionId: item.latestVersionId }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        showToast('error', json.error?.message || 'Failed to publish article');
        return;
      }
      showToast('success', `Published "${item.headline}" to live feed!`);
      handleRefresh();
    } catch (err: any) {
      showToast('error', err.message || 'Failed to publish article');
    }
  };

  const handleCreateRevision = async (item: AdminCurrentAffairsListItem) => {
    try {
      const res = await fetch(`/api/admin/current-affairs/articles/${item.id}/revision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        showToast('error', json.error?.message || 'Failed to create revision');
        return;
      }
      showToast('success', `Created Revision v${json.data?.versionNumber} in Draft state`);
      handleRefresh();
    } catch (err: any) {
      showToast('error', err.message || 'Failed to create revision');
    }
  };

  const handleArchive = async (item: AdminCurrentAffairsListItem) => {
    if (!confirm(`Are you sure you want to archive "${item.headline}"? Historical attempts remain preserved.`)) {
      return;
    }
    try {
      const res = await fetch(`/api/admin/current-affairs/articles/${item.id}/archive`, {
        method: 'POST',
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        showToast('error', json.error?.message || 'Failed to archive article');
        return;
      }
      showToast('success', `Archived "${item.headline}"`);
      handleRefresh();
    } catch (err: any) {
      showToast('error', err.message || 'Failed to archive article');
    }
  };

  const handleDiscard = async (item: AdminCurrentAffairsListItem) => {
    if (!confirm(`Discard draft for "${item.headline}"? This cannot be undone.`)) {
      return;
    }
    try {
      const res = await fetch(
        `/api/admin/current-affairs/articles/${item.id}?versionId=${item.latestVersionId}`,
        { method: 'DELETE' }
      );
      const json = await res.json();
      if (!res.ok || !json.success) {
        showToast('error', json.error?.message || 'Failed to discard draft');
        return;
      }
      showToast('success', 'Draft discarded successfully.');
      handleRefresh();
    } catch (err: any) {
      showToast('error', err.message || 'Failed to discard draft');
    }
  };

  return (
    <div className="space-y-5 pb-12">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed bottom-6 right-6 z-50 p-4 rounded-xl shadow-xl flex items-center gap-2.5 text-xs font-semibold animate-in slide-in-from-bottom-5 duration-200 ${
            toastMessage.type === 'success'
              ? 'bg-emerald-900 text-emerald-100 border border-emerald-700'
              : 'bg-rose-900 text-rose-100 border border-rose-700'
          }`}
        >
          {toastMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-rose-400" />
          )}
          <span>{toastMessage.message}</span>
        </div>
      )}

      {/* 1. Header with Actions */}
      <CurrentAffairsHeader
        onOpenCreate={handleOpenCreate}
        onOpenImport={() => setIsImportModalOpen(true)}
        onOpenPrompt={() => setIsPromptModalOpen(true)}
        onOpenQuiz={() => setIsQuizModalOpen(true)}
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
      />

      {/* 2. Overview Dashboard Metrics */}
      <CurrentAffairsStatsBar
        stats={stats}
        isLoading={isLoadingStats}
        selectedStatus={selectedStatus}
        onSelectStatus={(status) => {
          setSelectedStatus(status);
          setPage(1);
        }}
      />

      {/* 3. Search & Filter Bar */}
      <CurrentAffairsFilterBar
        search={searchQuery}
        onSearchChange={(val) => {
          setSearchQuery(val);
          setPage(1);
        }}
        category={selectedCategory}
        onCategoryChange={(val) => {
          setSelectedCategory(val);
          setPage(1);
        }}
        importanceTier={selectedImportance}
        onImportanceTierChange={(val) => {
          setSelectedImportance(val);
          setPage(1);
        }}
        date={selectedDate}
        onDateChange={(val) => {
          setSelectedDate(val);
          setPage(1);
        }}
        onReset={() => {
          setSelectedStatus('ALL');
          setSelectedCategory('ALL');
          setSelectedImportance('ALL');
          setSelectedDate('');
          setSearchQuery('');
          setPage(1);
        }}
        totalCount={totalCount}
      />

      {/* 4. Table / List */}
      <CurrentAffairsTable
        items={items}
        isLoading={isLoadingList}
        page={page}
        totalPages={totalPages}
        onPageChange={(p) => setPage(p)}
        onEdit={handleEdit}
        onPreview={handlePreview}
        onReview={handleReview}
        onSubmitForReview={handleSubmitForReview}
        onCompile={handleCompile}
        onPublish={handlePublish}
        onCreateRevision={handleCreateRevision}
        onArchive={handleArchive}
        onDiscard={handleDiscard}
        onViewHistory={(item) => setHistoryArticleId(item.id)}
      />

      {/* MODALS & DRAWERS */}
      <CurrentAffairsPromptModal
        isOpen={isPromptModalOpen}
        onClose={() => setIsPromptModalOpen(false)}
      />

      <CurrentAffairsImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImportSuccess={(articleId) => {
          showToast('success', 'External AI draft imported successfully into DRAFT state!');
          handleRefresh();
          setEditingArticleId(articleId);
          setIsEditorDrawerOpen(true);
        }}
      />

      <CurrentAffairsQuizModal
        isOpen={isQuizModalOpen}
        onClose={() => setIsQuizModalOpen(false)}
      />

      <CurrentAffairsEditorDrawer
        isOpen={isEditorDrawerOpen}
        onClose={() => {
          setIsEditorDrawerOpen(false);
          setEditingArticleId(null);
        }}
        articleId={editingArticleId}
        onSaved={() => {
          showToast('success', 'Current Affair draft saved successfully.');
          handleRefresh();
        }}
      />

      <CurrentAffairsPreviewModal
        isOpen={Boolean(previewArticleId)}
        onClose={() => {
          setPreviewArticleId(null);
          setPreviewVersionId(null);
        }}
        articleId={previewArticleId}
        versionId={previewVersionId}
      />

      <CurrentAffairsReviewWorkbench
        isOpen={Boolean(reviewArticleId)}
        onClose={() => setReviewArticleId(null)}
        articleId={reviewArticleId}
        onActionComplete={() => {
          showToast('success', 'Review action recorded successfully.');
          handleRefresh();
        }}
      />

      <CurrentAffairsHistoryModal
        isOpen={Boolean(historyArticleId)}
        onClose={() => setHistoryArticleId(null)}
        articleId={historyArticleId}
        onOpenDiff={(v1, v2) => {
          setDiffState({
            isOpen: true,
            articleId: historyArticleId,
            v1,
            v2,
          });
        }}
        onPreviewVersion={(verId) => {
          setPreviewArticleId(historyArticleId);
          setPreviewVersionId(verId);
        }}
      />

      <CurrentAffairsDiffModal
        isOpen={diffState.isOpen}
        onClose={() => setDiffState({ isOpen: false, articleId: null, v1: 1, v2: 2 })}
        articleId={diffState.articleId}
        v1Number={diffState.v1}
        v2Number={diffState.v2}
      />
    </div>
  );
}
