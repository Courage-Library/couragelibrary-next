"use client";

import { actionErrorMessage } from "@/lib/actions/action-result";
import React, { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AdminExamListItem, ConductingOrgItem } from "@/services/exam-onboarding/exam-onboarding.service";
import { Card } from "@/components/ui/legacy/card";
import { Badge } from "@/components/ui/legacy/badge";
import { Button } from "@/components/ui/legacy/button";
import { createExamDraftAction } from "@/app/admin/exams/actions";
import { ExamLogoBadge } from "@/components/exams/exam-logo-badge";
import { ConductingBodiesPanel } from "@/components/admin/exam-onboarding/conducting-bodies-panel";
import { ExamLogoOverride } from "@/components/admin/exam-onboarding/exam-logo-override";
import { examLogo } from "@/lib/logos/exam-logo";
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
  /** EXAM-LOGO-1: admins manage logos; staff see them read-only */
  canEditLogos?: boolean;
}

export function ExamManagementView({
  initialExams,
  totalExams,
  publishedExams,
  draftExams,
  conductingOrgs = [],
  canEditLogos = false,
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
  // EXAM-LOGO-1: only an active body WITH its logo can conduct a new exam (the server enforces the same rule)
  const usableOrgs = conductingOrgs.filter((o) => o.isActive && o.logoPath);
  const [orgId, setOrgId] = useState(usableOrgs[0]?.id || "");
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
    setOrgId(usableOrgs[0]?.id || "");
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

    if (!orgId) {
      setFormError("Choose the conducting body. A body needs its official logo first (Conducting bodies, below).");
      return;
    }

    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("title", title.trim());
      formData.append("slug", slug.trim());
      formData.append("orgId", orgId);
      formData.append("category", category.trim());
      formData.append("description", description.trim());
      if (cycleYear) {
        formData.append("cycleYear", cycleYear.toString());
      }

      const res = await createExamDraftAction(null, formData);
      if (res.error) {
        setFormError(actionErrorMessage(res));
      } else if (res.success && res.data) {
        const orgDisplayName = conductingOrgs.find((o) => o.id === orgId)?.name || "Conducting body";

        setCreatedResult({
          examId: res.data.examId,
          slug: res.data.slug,
          title: res.data.title,
          cycleId: res.data.cycleId,
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
          className="bg-primary-700 hover:bg-primary-800 text-white text-xs font-bold px-4 py-2.5 rounded-xl flex items-center gap-2 shadow-xs transition-colors"
        >
          <PlusCircle className="w-4 h-4" /> Add New Examination
        </Button>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4 bg-white border border-slate-200/80 rounded-2xl shadow-2xs space-y-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 font-mono">
            Total Examinations
          </span>
          <div className="text-2xl font-bold text-slate-900 font-mono">{totalExams}</div>
        </Card>

        <Card className="p-4 bg-white border border-slate-200/80 rounded-2xl shadow-2xs space-y-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 font-mono">
            Live Published Hubs
          </span>
          <div className="text-2xl font-bold text-emerald-700 font-mono">{publishedExams}</div>
        </Card>

        <Card className="p-4 bg-white border border-slate-200/80 rounded-2xl shadow-2xs space-y-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-accent-700 font-mono">
            Onboarding Drafts
          </span>
          <div className="text-2xl font-bold text-accent-700 font-mono">{draftExams}</div>
        </Card>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-600 absolute left-3.5 top-1/2 -translate-y-1/2" />
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
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
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
                <span className="text-[11px] font-mono text-slate-600">
                  {exam.category}
                </span>
              </div>

              <div>
                <div className="min-w-0 flex-1">
                {/* LOGO-PLACEMENT: the logo inline immediately before the exam name, on the same line */}
                <div className="flex items-center gap-2">
                  <ExamLogoBadge
                    logo={examLogo({ override: { path: exam.logoOverridePath ?? null, alt: exam.logoOverrideAlt ?? null }, org: { path: exam.conductingOrg.logoPath ?? null, alt: exam.conductingOrg.logoAlt ?? null } })}
                    name={exam.conductingOrg.name}
                    size="xs"
                  />
                  <h3 className="min-w-0 text-sm font-bold text-slate-900 line-clamp-1">{exam.title}</h3>
                </div>
                <div className="flex items-center justify-between gap-3 mt-0.5">
                  <p className="text-[11px] font-mono text-slate-600 truncate">/exams/{exam.slug}</p>
                  {exam.isActive && (
                    <Link
                      href={`/exams/${exam.slug}`}
                      target="_blank"
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-700 transition-colors shrink-0 group"
                    >
                      <span>View Hub</span>
                      <ExternalLink className="w-3 h-3 text-blue-500 group-hover:translate-x-0.5 transition-transform" />
                    </Link>
                  )}
                </div>
                {!exam.logoOverridePath && !exam.conductingOrg.logoPath && (
                  <span className="mt-1 inline-flex rounded-full border border-danger-200 bg-danger-50 px-2 py-0.5 text-[11px] font-semibold text-danger-800" data-logo-missing="">
                    Logo missing
                  </span>
                )}
                </div>
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

            {canEditLogos && (
              <ExamLogoOverride examId={exam.id} examTitle={exam.title} hasOverride={Boolean(exam.logoOverridePath)} />
            )}

            {/* Card Action Footer */}
            <div className="pt-3.5 border-t border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 text-xs font-semibold">
              <Link
                href={`/admin/exams/knowledge?examId=${exam.id}${exam.activeCycle ? `&cycleId=${exam.activeCycle.id}` : ""}`}
                className="inline-flex items-center gap-1.5 text-slate-700 hover:text-blue-600 transition-colors whitespace-nowrap group shrink-0"
              >
                <BookOpen className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span>Open Exam Knowledge</span>
                <ArrowRight className="w-3 h-3 text-slate-600 group-hover:text-blue-600 group-hover:translate-x-0.5 transition-all shrink-0" />
              </Link>

              <Link
                href={`/admin/exams/onboarding?examId=${exam.id}${exam.activeCycle ? `&cycleId=${exam.activeCycle.id}` : ""}`}
                className="inline-flex items-center gap-1.5 text-blue-600 hover:text-blue-700 font-bold transition-colors whitespace-nowrap group shrink-0"
              >
                <Layers className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span>Manage Examination</span>
                <ArrowRight className="w-3 h-3 text-blue-400 group-hover:text-blue-600 group-hover:translate-x-0.5 transition-all shrink-0" />
              </Link>
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
                className="w-7 h-7 rounded-lg text-slate-600 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center transition"
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
                    <span className="text-[10px] font-mono text-slate-600">/exams/{slug || "slug"}</span>
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
                    <label htmlFor="exam-org" className="text-xs font-bold text-slate-700 block">
                      Conducting body <span className="text-rose-500">*</span>
                    </label>
                    <a href="#conducting-bodies" onClick={handleCloseAddModal} className="text-[11px] font-bold text-blue-700 hover:text-blue-800">
                      Conducting bodies
                    </a>
                  </div>
                  <select
                    id="exam-org"
                    value={orgId}
                    onChange={(e) => setOrgId(e.target.value)}
                    aria-describedby="org-logo-hint"
                    className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:border-blue-500"
                  >
                    {conductingOrgs.filter((o) => o.isActive).map((o) => (
                      <option key={o.id} value={o.id} disabled={!o.logoPath}>
                        {o.name}{o.logoPath ? "" : " — upload its logo first"}
                      </option>
                    ))}
                  </select>
                  <p id="org-logo-hint" className="text-[11px] text-slate-600">
                    Every exam shows its conducting body&apos;s official logo. A new body is added, with its logo, under Conducting bodies.
                  </p>
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
                    Overview Description <span className="text-slate-600 font-normal">(Optional)</span>
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
                    className="bg-primary-700 hover:bg-primary-800 text-white text-xs font-bold px-5 py-2 rounded-xl shadow-xs disabled:opacity-50"
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
                <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center mx-auto shadow-2xs">
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
                    <span className="text-slate-600">Canonical Slug:</span>
                    <span className="font-mono font-bold text-slate-800">/exams/{createdResult.slug}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Authority:</span>
                    <span className="font-bold text-slate-800">{createdResult.orgName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Status:</span>
                    <span className="font-bold text-accent-700">DRAFT (Unpublished)</span>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 pt-2">
                  <Link
                    href={`/admin/exams/knowledge?examId=${createdResult.examId}${createdResult.cycleId ? `&cycleId=${createdResult.cycleId}` : ""}`}
                  >
                    <Button className="w-full bg-primary-700 hover:bg-primary-800 text-white text-xs font-bold px-5 py-2.5 rounded-xl flex items-center justify-center gap-2 shadow-xs">
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
      <ConductingBodiesPanel orgs={conductingOrgs} canEdit={canEditLogos} />
    </div>
  );
}
