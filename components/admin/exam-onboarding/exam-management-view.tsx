"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AdminExamListItem, ConductingOrgItem } from "@/services/exam-onboarding/exam-onboarding.service";
import { AdminBreadcrumbs } from "@/components/admin/admin-breadcrumbs";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createExamDraftAction } from "@/app/admin/exams/actions";
import {
  GraduationCap,
  PlusCircle,
  Search,
  Building2,
  Calendar,
  Layers,
  CheckCircle2,
  ExternalLink,
  ArrowRight,
  ShieldCheck,
  Sparkles,
  BookOpen,
  X,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";

interface Props {
  initialExams: AdminExamListItem[];
  totalExams: number;
  publishedExams: number;
  draftExams: number;
  conductingOrgs?: ConductingOrgItem[];
}

export function ExamManagementView({
  initialExams,
  totalExams,
  publishedExams,
  draftExams,
  conductingOrgs = [],
}: Props) {
  const router = useRouter();
  const [exams, setExams] = useState<AdminExamListItem[]>(initialExams);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState("ALL");

  // Registration Dialog State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [isSlugCustomized, setIsSlugCustomized] = useState(false);
  const [orgId, setOrgId] = useState(conductingOrgs[0]?.id || "");
  const [isCreatingOrg, setIsCreatingOrg] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [newOrgWebsite, setNewOrgWebsite] = useState("");
  const [category, setCategory] = useState("National Recruitment");
  const [description, setDescription] = useState("");
  const [cycleYear, setCycleYear] = useState<number>(new Date().getFullYear());

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [createdResult, setCreatedResult] = useState<{
    examId: string;
    slug: string;
    title: string;
    cycleId?: string;
    orgName?: string;
  } | null>(null);

  const handleTitleChange = (val: string) => {
    setTitle(val);
    if (!isSlugCustomized) {
      setSlug(
        val
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
      );
    }
  };

  const handleResetForm = () => {
    setTitle("");
    setSlug("");
    setIsSlugCustomized(false);
    setOrgId(conductingOrgs[0]?.id || "");
    setIsCreatingOrg(false);
    setNewOrgName("");
    setNewOrgWebsite("");
    setCategory("National Recruitment");
    setDescription("");
    setCycleYear(new Date().getFullYear());
    setFormError(null);
    setCreatedResult(null);
  };

  const handleOpenAddModal = () => {
    handleResetForm();
    setIsAddModalOpen(true);
  };

  const handleCloseAddModal = () => {
    setIsAddModalOpen(false);
    handleResetForm();
  };

  const handleCreateExam = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!title.trim()) {
      setFormError("Examination Full Title is required.");
      return;
    }

    if (!isCreatingOrg && !orgId && conductingOrgs.length > 0) {
      setFormError("Please select a conducting authority.");
      return;
    }

    if (isCreatingOrg && !newOrgName.trim()) {
      setFormError("Please enter the new conducting authority name.");
      return;
    }

    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("title", title.trim());
      formData.append("slug", slug.trim());
      formData.append("orgId", isCreatingOrg ? "" : orgId);
      if (isCreatingOrg && newOrgName.trim()) {
        formData.append("newOrgName", newOrgName.trim());
      }
      if (isCreatingOrg && newOrgWebsite.trim()) {
        formData.append("newOrgWebsite", newOrgWebsite.trim());
      }
      formData.append("category", category.trim());
      formData.append("description", description.trim());
      if (cycleYear) {
        formData.append("cycleYear", cycleYear.toString());
      }

      const res = await createExamDraftAction(null, formData);
      if (res.error) {
        setFormError(res.error);
      } else if (res.success && res.data) {
        const orgDisplayName = isCreatingOrg
          ? newOrgName.trim()
          : conductingOrgs.find((o) => o.id === orgId)?.name || "Conducting Authority";

        setCreatedResult({
          examId: res.data.examId,
          slug: res.data.slug,
          title: res.data.title,
          cycleId: (res.data as any).cycleId,
          orgName: orgDisplayName,
        });
        router.refresh();
      }
    } catch (err: any) {
      setFormError(err.message || "Failed to register examination.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredExams = useMemo(() => {
    return exams.filter((e) => {
      const matchSearch =
        e.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.slug.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.conductingOrg.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchCategory = filterCategory === "ALL" || e.category === filterCategory;
      return matchSearch && matchCategory;
    });
  }, [exams, searchQuery, filterCategory]);

  const categories = useMemo(() => {
    const set = new Set(exams.map((e) => e.category));
    return ["ALL", ...Array.from(set)];
  }, [exams]);

  return (
    <div className="space-y-6 w-full pb-10">
      {/* Breadcrumbs */}
      <AdminBreadcrumbs
        items={[
          { label: "Dashboard", href: "/admin" },
          { label: "Examinations & Onboarding", active: true },
        ]}
      />

      {/* Page Heading */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2.5">
            <GraduationCap className="w-6 h-6 text-blue-600" /> Examination Management Hub
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 font-medium">
            Register and manage canonical examinations available across Courage Library.
          </p>
        </div>

        <Button
          onClick={handleOpenAddModal}
          className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl flex items-center gap-2 shadow-xs transition-colors"
        >
          <PlusCircle className="w-4 h-4" /> Add New Examination
        </Button>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4 bg-white border border-slate-200/80 rounded-2xl shadow-2xs space-y-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 font-mono">
            Total Examinations
          </span>
          <div className="text-2xl font-bold text-slate-900 font-mono">{totalExams}</div>
        </Card>

        <Card className="p-4 bg-white border border-slate-200/80 rounded-2xl shadow-2xs space-y-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 font-mono">
            Live Published Hubs
          </span>
          <div className="text-2xl font-bold text-emerald-600 font-mono">{publishedExams}</div>
        </Card>

        <Card className="p-4 bg-white border border-slate-200/80 rounded-2xl shadow-2xs space-y-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-amber-600 font-mono">
            Onboarding Drafts
          </span>
          <div className="text-2xl font-bold text-amber-600 font-mono">{draftExams}</div>
        </Card>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by examination title, slug, or conducting organization..."
            className="w-full pl-9 pr-4 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setFilterCategory(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap ${
                filterCategory === cat
                  ? "bg-slate-900 text-white shadow-xs"
                  : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Exams Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredExams.map((exam) => (
          <Card
            key={exam.id}
            className="p-5 bg-white border border-slate-200/80 rounded-2xl shadow-2xs flex flex-col justify-between space-y-4 hover:border-slate-300 transition"
          >
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <Badge
                  variant={exam.isActive ? "success" : "neutral"}
                  className="text-[10px] uppercase font-mono font-bold"
                >
                  {exam.isActive ? "PUBLISHED" : "DRAFT"}
                </Badge>
                <span className="text-[11px] font-mono text-slate-400">
                  {exam.category}
                </span>
              </div>

              <div>
                <h3 className="text-sm font-bold text-slate-900 line-clamp-1">{exam.title}</h3>
                <p className="text-[11px] font-mono text-slate-400">/exams/{exam.slug}</p>
              </div>

              <div className="space-y-1 text-xs text-slate-600">
                <div className="flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  <span className="truncate">{exam.conductingOrg.name}</span>
                </div>
                {exam.activeCycle && (
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                    <span>Cycle: {exam.activeCycle.cycleYear}</span>
                  </div>
                )}
                <div className="flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  <span>{exam.totalPublishedModulesCount} Published Knowledge Modules</span>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
              <Link
                href={`/admin/exam-knowledge?examId=${exam.id}${exam.activeCycle ? `&cycleId=${exam.activeCycle.id}` : ""}`}
                className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1"
              >
                <BookOpen className="w-3.5 h-3.5" /> Open Exam Knowledge <ArrowRight className="w-3 h-3" />
              </Link>

              {exam.isActive && (
                <Link
                  href={`/exams/${exam.slug}`}
                  target="_blank"
                  className="text-xs font-semibold text-slate-500 hover:text-slate-900 flex items-center gap-1"
                >
                  Hub <ExternalLink className="w-3 h-3" />
                </Link>
              )}
            </div>
          </Card>
        ))}
      </div>

      {/* ========================================================================= */}
      {/* MODAL: REGISTER NEW EXAMINATION                                           */}
      {/* ========================================================================= */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-200">
          <Card className="w-full max-w-lg bg-white border border-slate-200/90 rounded-3xl shadow-xl overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shadow-2xs">
                  <PlusCircle className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Register New Examination</h2>
                  <p className="text-[11px] text-slate-500">Create canonical examination identity in Courage Library</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCloseAddModal}
                className="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body: Form or Success */}
            {!createdResult ? (
              <form onSubmit={handleCreateExam} className="p-6 space-y-4">
                {formError && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2 font-medium">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>{formError}</span>
                  </div>
                )}

                {/* Exam Title */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 block">
                    Examination Full Title <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => handleTitleChange(e.target.value)}
                    placeholder="e.g. IBPS Probationary Officer (PO)"
                    autoFocus
                    required
                    className="w-full px-3.5 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>

                {/* Canonical Slug */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700 block">
                      Canonical URL Slug <span className="text-rose-500">*</span>
                    </label>
                    <span className="text-[10px] font-mono text-slate-400">/exams/{slug || "slug"}</span>
                  </div>
                  <input
                    type="text"
                    value={slug}
                    onChange={(e) => {
                      setIsSlugCustomized(true);
                      setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, ""));
                    }}
                    placeholder="e.g. ibps-po"
                    required
                    className="w-full px-3.5 py-2 text-xs font-mono font-semibold rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>

                {/* Conducting Organization */}
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700 block">
                      Conducting Authority <span className="text-rose-500">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setIsCreatingOrg(!isCreatingOrg)}
                      className="text-[11px] font-bold text-blue-600 hover:text-blue-700"
                    >
                      {isCreatingOrg ? "Select Existing Authority" : "+ Register New Authority"}
                    </button>
                  </div>

                  {!isCreatingOrg ? (
                    <select
                      value={orgId}
                      onChange={(e) => setOrgId(e.target.value)}
                      className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:border-blue-500"
                    >
                      {conductingOrgs.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name} ({o.slug})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="p-3 bg-blue-50/50 border border-blue-100 rounded-xl space-y-2">
                      <div>
                        <label className="text-[10px] font-bold text-slate-600 block mb-0.5">Authority Name *</label>
                        <input
                          type="text"
                          value={newOrgName}
                          onChange={(e) => setNewOrgName(e.target.value)}
                          placeholder="e.g. Institute of Banking Personnel Selection (IBPS)"
                          className="w-full px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-600 block mb-0.5">Official Portal URL</label>
                        <input
                          type="url"
                          value={newOrgWebsite}
                          onChange={(e) => setNewOrgWebsite(e.target.value)}
                          placeholder="https://ibps.in"
                          className="w-full px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Domain Category & Initial Cycle */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700 block">Recruitment Category</label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="w-full px-3 py-2 text-xs font-medium rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:border-blue-500"
                    >
                      <option value="National Recruitment">National Recruitment</option>
                      <option value="Banking & Financial">Banking & Financial</option>
                      <option value="Staff Selection">Staff Selection</option>
                      <option value="Railways Recruitment">Railways Recruitment</option>
                      <option value="Defence & Police">Defence & Police</option>
                      <option value="Civil Services & State PSC">Civil Services & State PSC</option>
                      <option value="Teaching & Education">Teaching & Education</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700 block">Initial Cycle Year</label>
                    <input
                      type="number"
                      value={cycleYear}
                      onChange={(e) => setCycleYear(parseInt(e.target.value, 10) || new Date().getFullYear())}
                      className="w-full px-3 py-2 text-xs font-medium rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                {/* Description */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700 block">
                    Overview Description <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={2}
                    placeholder="Brief scope of the examination..."
                    className="w-full px-3 py-2 text-xs font-medium rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:border-blue-500 resize-none"
                  />
                </div>

                {/* Action Buttons */}
                <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCloseAddModal}
                    className="text-xs font-semibold rounded-xl text-slate-600"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={isSubmitting || !title.trim()}
                    className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-5 py-2 rounded-xl shadow-xs disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1.5" /> Registering...
                      </>
                    ) : (
                      "Create Examination"
                    )}
                  </Button>
                </div>
              </form>
            ) : (
              /* Success View */
              <div className="p-6 text-center space-y-5">
                <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto shadow-2xs">
                  <CheckCircle2 className="w-8 h-8" />
                </div>

                <div className="space-y-1.5">
                  <h3 className="text-base font-bold text-slate-900">Examination Registered Successfully!</h3>
                  <p className="text-xs text-slate-500 max-w-xs mx-auto">
                    <strong>{createdResult.title}</strong> is now registered in the canonical catalog.
                  </p>
                </div>

                <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 text-xs space-y-1 text-left">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Canonical Slug:</span>
                    <span className="font-mono font-bold text-slate-800">/exams/{createdResult.slug}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Authority:</span>
                    <span className="font-bold text-slate-800">{createdResult.orgName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Status:</span>
                    <span className="font-bold text-amber-700">DRAFT (Unpublished)</span>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 pt-2">
                  <Link
                    href={`/admin/exam-knowledge?examId=${createdResult.examId}${createdResult.cycleId ? `&cycleId=${createdResult.cycleId}` : ""}`}
                  >
                    <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-5 py-2.5 rounded-xl flex items-center justify-center gap-2 shadow-xs">
                      <BookOpen className="w-4 h-4" /> Open Exam Knowledge Studio →
                    </Button>
                  </Link>
                  <Button
                    variant="outline"
                    onClick={handleCloseAddModal}
                    className="w-full sm:w-auto text-xs font-semibold rounded-xl text-slate-600"
                  >
                    Back to Hub
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
