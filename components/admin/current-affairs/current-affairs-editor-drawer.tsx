'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Save,
  Plus,
  Trash2,
  Globe2,
  FileCheck,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import {
  CurrentAffairsCategory,
  CurrentAffairsImportPayload,
  CurrentAffairsImportanceTier,
  CurrentAffairsSourceTier,
  ALL_CURRENT_AFFAIRS_CATEGORIES,
  AdminCurrentAffairsFullArticle,
} from '@/types/current-affairs';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  articleId?: string | null;
  onSaved: () => void;
}

export function CurrentAffairsEditorDrawer({
  isOpen,
  onClose,
  articleId,
  onSaved,
}: Props) {
  const isEditing = Boolean(articleId);

  // Form State
  const [headline, setHeadline] = useState('');
  const [slug, setSlug] = useState('');
  const [newsDate, setNewsDate] = useState(new Date().toISOString().split('T')[0]);
  const [category, setCategory] = useState<CurrentAffairsCategory>('NATIONAL');
  const [importanceTier, setImportanceTier] = useState<CurrentAffairsImportanceTier>('HIGH');
  const [summaryMd, setSummaryMd] = useState('');
  const [keyTakeaways, setKeyTakeaways] = useState<string[]>(['']);
  const [importantFacts, setImportantFacts] = useState<string[]>(['']);
  const [sources, setSources] = useState<
    Array<{
      title: string;
      publisher: string;
      url: string;
      tier: CurrentAffairsSourceTier;
      citationContext?: string;
    }>
  >([
    {
      title: '',
      publisher: '',
      url: '',
      tier: 'TIER_1',
      citationContext: '',
    },
  ]);

  const [activeVersionId, setActiveVersionId] = useState<string | null>(null);
  const [isLoadingArticle, setIsLoadingArticle] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Fetch article if editing
  useEffect(() => {
    if (!isOpen) return;

    if (articleId) {
      setIsLoadingArticle(true);
      fetch(`/api/admin/current-affairs/articles/${articleId}`)
        .then((res) => res.json())
        .then((json) => {
          if (json.success && json.data) {
            const art: AdminCurrentAffairsFullArticle = json.data;
            const v = art.activeVersion;
            setHeadline(v.headline);
            setSlug(art.slug);
            setNewsDate(art.newsDate);
            setCategory(art.category);
            setImportanceTier(art.importanceTier);
            setSummaryMd(v.summaryMd);
            setKeyTakeaways(v.keyTakeaways.length > 0 ? v.keyTakeaways : ['']);
            setImportantFacts(v.importantFacts.length > 0 ? v.importantFacts : ['']);
            setSources(
              v.sources.length > 0
                ? v.sources.map((s) => ({
                    title: s.title,
                    publisher: s.publisher,
                    url: s.url,
                    tier: s.tier,
                    citationContext: s.citationContext || '',
                  }))
                : [
                    {
                      title: '',
                      publisher: '',
                      url: '',
                      tier: 'TIER_1',
                      citationContext: '',
                    },
                  ]
            );
            setActiveVersionId(v.id);
          }
        })
        .finally(() => setIsLoadingArticle(false));
    } else {
      // Reset form for create
      setHeadline('');
      setSlug('');
      setNewsDate(new Date().toISOString().split('T')[0]);
      setCategory('NATIONAL');
      setImportanceTier('HIGH');
      setSummaryMd('');
      setKeyTakeaways(['']);
      setImportantFacts(['']);
      setSources([
        {
          title: '',
          publisher: '',
          url: '',
          tier: 'TIER_1',
          citationContext: '',
        },
      ]);
      setActiveVersionId(null);
      setErrors([]);
      setSuccessMessage(null);
    }
  }, [isOpen, articleId]);

  if (!isOpen) return null;

  const handleAddTakeaway = () => setKeyTakeaways([...keyTakeaways, '']);
  const handleRemoveTakeaway = (idx: number) =>
    setKeyTakeaways(keyTakeaways.filter((_, i) => i !== idx));

  const handleAddFact = () => setImportantFacts([...importantFacts, '']);
  const handleRemoveFact = (idx: number) =>
    setImportantFacts(importantFacts.filter((_, i) => i !== idx));

  const handleAddSource = () =>
    setSources([
      ...sources,
      {
        title: '',
        publisher: '',
        url: '',
        tier: 'TIER_2',
        citationContext: '',
      },
    ]);
  const handleRemoveSource = (idx: number) =>
    setSources(sources.filter((_, i) => i !== idx));

  const handleSave = async () => {
    setIsSaving(true);
    setErrors([]);
    setSuccessMessage(null);

    const payload: CurrentAffairsImportPayload = {
      headline: headline.trim(),
      slug: slug.trim() || undefined,
      newsDate,
      category,
      importanceTier,
      summaryMd: summaryMd.trim(),
      keyTakeaways: keyTakeaways.map((t) => t.trim()).filter(Boolean),
      importantFacts: importantFacts.map((f) => f.trim()).filter(Boolean),
      sources: sources
        .map((s) => ({
          title: s.title.trim(),
          publisher: s.publisher.trim(),
          url: s.url.trim(),
          tier: s.tier,
          citationContext: s.citationContext?.trim() || undefined,
        }))
        .filter((s) => s.url && s.title),
      taxonomyMappings: [],
      examMappings: [],
    };

    try {
      if (isEditing && articleId && activeVersionId) {
        // Save draft update
        const res = await fetch(`/api/admin/current-affairs/articles/${articleId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            versionId: activeVersionId,
            ...payload,
          }),
        });
        const json = await res.json();
        if (!res.ok || !json.success) {
          const errs = json.error?.errors || [json.error?.message || 'Failed to update draft'];
          setErrors(errs);
          return;
        }
        setSuccessMessage('Draft updated successfully!');
      } else {
        // Create manual draft
        const res = await fetch('/api/admin/current-affairs/articles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (!res.ok || !json.success) {
          const errs = json.error?.gateReport?.errors || [
            json.error?.message || 'Failed to create manual draft',
          ];
          setErrors(errs);
          return;
        }
        setSuccessMessage('Manual draft created successfully in DRAFT state!');
      }

      setTimeout(() => {
        onSaved();
        onClose();
      }, 700);
    } catch (err: any) {
      setErrors([err.message || 'Error occurred while saving']);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-slate-950/70 backdrop-blur-xs">
      <div className="bg-white w-full max-w-3xl h-full shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50/90 shrink-0">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              {isEditing ? 'Edit Current Affair Draft' : 'Create New Current Affair Draft'}
            </h2>
            <p className="text-[11px] text-slate-500">
              Structured editorial form with 5-gate validation enforcement
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Form */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1 text-xs">
          {isLoadingArticle ? (
            <div className="p-12 text-center text-slate-500">Loading article draft...</div>
          ) : (
            <>
              {/* Errors Display */}
              {errors.length > 0 && (
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-[11px] space-y-1">
                  <div className="flex items-center gap-1.5 font-bold">
                    <AlertTriangle className="w-4 h-4 text-rose-600" />
                    <span>Validation Errors Encountered</span>
                  </div>
                  <ul className="list-disc pl-5 space-y-0.5">
                    {errors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Success Message */}
              {successMessage && (
                <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{successMessage}</span>
                </div>
              )}

              {/* SECTION 1: IDENTITY */}
              <div className="space-y-3 p-4 rounded-xl bg-slate-50 border border-slate-200">
                <span className="font-bold text-slate-800 text-xs block uppercase tracking-wider font-mono">
                  1. Identity &amp; Master Event
                </span>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Headline <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Clear, objective news headline..."
                    value={headline}
                    onChange={(e) => setHeadline(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Event Date <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={newsDate}
                      onChange={(e) => setNewsDate(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Category <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value as CurrentAffairsCategory)}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white cursor-pointer"
                    >
                      {ALL_CURRENT_AFFAIRS_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat.replace(/_/g, ' ')}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Importance Tier
                    </label>
                    <select
                      value={importanceTier}
                      onChange={(e) =>
                        setImportanceTier(e.target.value as CurrentAffairsImportanceTier)
                      }
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white cursor-pointer"
                    >
                      <option value="CRITICAL">Critical</option>
                      <option value="HIGH">High</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="LOW">Low</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Slug (Auto-generated if empty)
                  </label>
                  <input
                    type="text"
                    placeholder="kebab-case-slug"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    className="w-full px-3 py-2 font-mono text-[11px] rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white"
                  />
                </div>
              </div>

              {/* SECTION 2: CONTENT */}
              <div className="space-y-3 p-4 rounded-xl bg-slate-50 border border-slate-200">
                <span className="font-bold text-slate-800 text-xs block uppercase tracking-wider font-mono">
                  2. Educational Body &amp; Content
                </span>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Summary Markdown <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    rows={6}
                    placeholder="Comprehensive explanation of the event, policy background, significance..."
                    value={summaryMd}
                    onChange={(e) => setSummaryMd(e.target.value)}
                    className="w-full p-3 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white font-mono"
                  />
                </div>

                {/* Key Takeaways */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[11px] font-bold text-slate-700">
                      Key Takeaways ({keyTakeaways.filter(Boolean).length})
                    </label>
                    <button
                      onClick={handleAddTakeaway}
                      className="text-[11px] text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" /> Add Takeaway
                    </button>
                  </div>
                  <div className="space-y-1.5">
                    {keyTakeaways.map((t, idx) => (
                      <div key={idx} className="flex items-center gap-1.5">
                        <input
                          type="text"
                          placeholder={`Takeaway #${idx + 1}`}
                          value={t}
                          onChange={(e) => {
                            const copy = [...keyTakeaways];
                            copy[idx] = e.target.value;
                            setKeyTakeaways(copy);
                          }}
                          className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white"
                        />
                        {keyTakeaways.length > 1 && (
                          <button
                            onClick={() => handleRemoveTakeaway(idx)}
                            className="p-1.5 text-slate-400 hover:text-rose-600"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Important Facts */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[11px] font-bold text-slate-700">
                      Important Facts ({importantFacts.filter(Boolean).length})
                    </label>
                    <button
                      onClick={handleAddFact}
                      className="text-[11px] text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" /> Add Fact
                    </button>
                  </div>
                  <div className="space-y-1.5">
                    {importantFacts.map((f, idx) => (
                      <div key={idx} className="flex items-center gap-1.5">
                        <input
                          type="text"
                          placeholder={`Fact #${idx + 1}`}
                          value={f}
                          onChange={(e) => {
                            const copy = [...importantFacts];
                            copy[idx] = e.target.value;
                            setImportantFacts(copy);
                          }}
                          className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white"
                        />
                        {importantFacts.length > 1 && (
                          <button
                            onClick={() => handleRemoveFact(idx)}
                            className="p-1.5 text-slate-400 hover:text-rose-600"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* SECTION 3: PROVENANCE */}
              <div className="space-y-3 p-4 rounded-xl bg-slate-50 border border-slate-200">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800 text-xs block uppercase tracking-wider font-mono">
                    3. Provenance &amp; Verification Sources
                  </span>
                  <button
                    onClick={handleAddSource}
                    className="text-[11px] text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> Add Source
                  </button>
                </div>

                <div className="space-y-3">
                  {sources.map((s, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-lg bg-white border border-slate-200 space-y-2 relative"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-[11px] text-slate-700 font-mono">
                          Source #{idx + 1}
                        </span>
                        {sources.length > 1 && (
                          <button
                            onClick={() => handleRemoveSource(idx)}
                            className="p-1 text-slate-400 hover:text-rose-600"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] font-medium text-slate-500 mb-0.5">
                            Title <span className="text-rose-500">*</span>
                          </label>
                          <input
                            type="text"
                            placeholder="Press Release / Notification Title"
                            value={s.title}
                            onChange={(e) => {
                              const copy = [...sources];
                              copy[idx].title = e.target.value;
                              setSources(copy);
                            }}
                            className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-200"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-medium text-slate-500 mb-0.5">
                            Publisher <span className="text-rose-500">*</span>
                          </label>
                          <input
                            type="text"
                            placeholder="e.g., Press Information Bureau"
                            value={s.publisher}
                            onChange={(e) => {
                              const copy = [...sources];
                              copy[idx].publisher = e.target.value;
                              setSources(copy);
                            }}
                            className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-200"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div className="sm:col-span-2">
                          <label className="block text-[10px] font-medium text-slate-500 mb-0.5">
                            HTTPS URL <span className="text-rose-500">*</span>
                          </label>
                          <input
                            type="url"
                            placeholder="https://..."
                            value={s.url}
                            onChange={(e) => {
                              const copy = [...sources];
                              copy[idx].url = e.target.value;
                              setSources(copy);
                            }}
                            className="w-full px-2.5 py-1.5 text-xs font-mono rounded border border-slate-200"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-medium text-slate-500 mb-0.5">
                            Source Tier
                          </label>
                          <select
                            value={s.tier}
                            onChange={(e) => {
                              const copy = [...sources];
                              copy[idx].tier = e.target.value as CurrentAffairsSourceTier;
                              setSources(copy);
                            }}
                            className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-200 bg-white"
                          >
                            <option value="TIER_1">Tier 1 (Govt / Primary)</option>
                            <option value="TIER_2">Tier 2 (Statutory / Reputable)</option>
                            <option value="TIER_3">Tier 3 (Recognized Media)</option>
                            <option value="TIER_4">Tier 4 (Academic / Other)</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-slate-50/90 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-900"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || !headline.trim() || !summaryMd.trim()}
            className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs disabled:opacity-40"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{isSaving ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Draft'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
