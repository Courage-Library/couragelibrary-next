"use client";

import React, { useState } from "react";
import { ConductingOrgItem } from "@/services/exam-onboarding/exam-onboarding.service";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShieldCheck, Building2, Globe, FileText, PlusCircle, Check } from "lucide-react";

interface Props {
  initialData?: {
    id?: string;
    title: string;
    slug: string;
    orgId: string;
    category: string;
    description: string;
    officialWebsite?: string;
  };
  orgs: ConductingOrgItem[];
  onSave: (data: {
    title: string;
    slug: string;
    orgId: string;
    newOrgName?: string;
    newOrgWebsite?: string;
    category: string;
    description: string;
  }) => Promise<void>;
  isSaving: boolean;
}

export function Step1Identity({ initialData, orgs, onSave, isSaving }: Props) {
  const [title, setTitle] = useState(initialData?.title || "");
  const [slug, setSlug] = useState(initialData?.slug || "");
  const [isSlugCustomized, setIsSlugCustomized] = useState(Boolean(initialData?.slug));
  const [orgId, setOrgId] = useState(initialData?.orgId || (orgs[0]?.id || ""));
  const [isCreatingOrg, setIsCreatingOrg] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [newOrgWebsite, setNewOrgWebsite] = useState("");
  const [category, setCategory] = useState(initialData?.category || "National Recruitment");
  const [description, setDescription] = useState(initialData?.description || "");
  const [error, setError] = useState<string | null>(null);

  const handleTitleChange = (val: string) => {
    setTitle(val);
    if (!isSlugCustomized) {
      setSlug(val.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError("Exam Title is required.");
      return;
    }
    if (!isCreatingOrg && !orgId) {
      setError("Please select a conducting authority.");
      return;
    }
    if (isCreatingOrg && !newOrgName.trim()) {
      setError("Please enter the new conducting authority name.");
      return;
    }

    try {
      await onSave({
        title: title.trim(),
        slug: slug.trim(),
        orgId: isCreatingOrg ? "" : orgId,
        newOrgName: isCreatingOrg ? newOrgName.trim() : undefined,
        newOrgWebsite: isCreatingOrg ? newOrgWebsite.trim() : undefined,
        category: category.trim(),
        description: description.trim(),
      });
    } catch (err: any) {
      setError(err.message || "Failed to save exam identity.");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-blue-600" /> Step 1: Exam Identity &amp; Conducting Authority
        </h2>
        <p className="text-xs text-slate-500 font-medium">
          Define the evergreen identity, conducting organization, and canonical URL slug for this examination.
        </p>
      </div>

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold rounded-xl">
          {error}
        </div>
      )}

      <Card className="p-6 bg-white border border-slate-200/80 rounded-2xl shadow-2xs space-y-5">
        {/* Exam Title */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5">
            Examination Full Title <span className="text-rose-500">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="e.g. IBPS Probationary Officer (PO) or RRB Non-Technical Popular Categories"
            className="w-full px-3.5 py-2.5 text-xs font-semibold rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:border-blue-500 transition-colors"
            required
          />
        </div>

        {/* Canonical Slug */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs font-bold text-slate-700">
              Canonical URL Slug <span className="text-rose-500">*</span>
            </label>
            <span className="text-[10px] font-mono text-slate-400">
              /exams/{slug || "exam-slug"}
            </span>
          </div>
          <input
            type="text"
            value={slug}
            onChange={(e) => {
              setIsSlugCustomized(true);
              setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, ""));
            }}
            placeholder="e.g. ibps-po or rrb-ntpc"
            className="w-full px-3.5 py-2.5 text-xs font-mono font-semibold rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:border-blue-500 transition-colors"
            required
          />
        </div>

        {/* Conducting Organization */}
        <div className="space-y-3 pt-2 border-t border-slate-100">
          <div className="flex items-center justify-between">
            <label className="block text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Building2 className="w-4 h-4 text-blue-600" /> Conducting Organization <span className="text-rose-500">*</span>
            </label>
            <button
              type="button"
              onClick={() => setIsCreatingOrg(!isCreatingOrg)}
              className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1"
            >
              {isCreatingOrg ? "Select Existing Authority" : "+ Register New Authority"}
            </button>
          </div>

          {!isCreatingOrg ? (
            <select
              value={orgId}
              onChange={(e) => setOrgId(e.target.value)}
              className="w-full px-3.5 py-2.5 text-xs font-semibold rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:border-blue-500 transition-colors"
            >
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name} ({o.slug})
                </option>
              ))}
            </select>
          ) : (
            <div className="p-4 bg-blue-50/50 border border-blue-100 rounded-xl space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">New Authority Name *</label>
                <input
                  type="text"
                  value={newOrgName}
                  onChange={(e) => setNewOrgName(e.target.value)}
                  placeholder="e.g. Institute of Banking Personnel Selection (IBPS)"
                  className="w-full px-3 py-2 text-xs font-semibold rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Official Portal URL</label>
                <input
                  type="url"
                  value={newOrgWebsite}
                  onChange={(e) => setNewOrgWebsite(e.target.value)}
                  placeholder="https://ibps.in"
                  className="w-full px-3 py-2 text-xs font-semibold rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          )}
        </div>

        {/* Category Domain */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5">
            Recruitment Domain / Category
          </label>
          <input
            type="text"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="e.g. Banking, SSC, Railways, Defense, State PSC"
            className="w-full px-3.5 py-2.5 text-xs font-semibold rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5">
            Official Overview / Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Authoritative summary of the examination's scope, eligibility level, and participating departments..."
            className="w-full px-3.5 py-2.5 text-xs font-medium rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:border-blue-500 transition-colors resize-none"
          />
        </div>
      </Card>

      <div className="flex items-center justify-end gap-3">
        <Button
          type="submit"
          disabled={isSaving}
          className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-6 py-2.5 rounded-xl shadow-xs"
        >
          {isSaving ? "Saving..." : "Save & Continue to Step 2 →"}
        </Button>
      </div>
    </form>
  );
}
