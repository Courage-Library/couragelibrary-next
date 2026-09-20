import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Metadata } from "next";
import { ExamKnowledgeCandidateService } from "@/services/exam-knowledge/exam-knowledge-candidate.service";
import { ExamModuleRegistry } from "@/services/exam-knowledge/exam-module-registry";
import { ExamHero } from "@/components/exams/exam-hero";
import { ExamCycleSnapshot } from "@/components/exams/exam-cycle-snapshot";
import { ExamQuickNav } from "@/components/exams/exam-quick-nav";
import { ExamModuleCard } from "@/components/exams/exam-module-card";
import { ExamSyllabusNavigator } from "@/components/exams/exam-syllabus-navigator";
import { ExamPostsTable } from "@/components/exams/exam-posts-table";
import { ExamOfficialSources } from "@/components/exams/exam-official-sources";
import { ExamFaqAccordion } from "@/components/exams/exam-faq-accordion";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  FileText,
  CheckCircle2,
  Target,
  ArrowRight,
} from "lucide-react";
import { constructMetadata } from "@/lib/seo/metadata";

export const revalidate = 60; // ISR baseline

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const result = await ExamKnowledgeCandidateService.getExamKnowledgeCandidateView({
    examSlug: slug,
  });

  if (result.status !== "FOUND" || !result.data) {
    return constructMetadata({
      title: "Exam Not Found",
      noIndex: true,
    });
  }

  const exam = result.data.exam;
  const cycleText = result.data.activeCycle ? ` ${result.data.activeCycle.cycleYear}` : "";

  return constructMetadata({
    title: `${exam.title}${cycleText} — Complete Exam Knowledge Hub`,
    description:
      exam.description ||
      `Official notification dates, detailed syllabus, exam pattern, eligibility rules, and posts for ${exam.title}.`,
    canonicalUrl: `/exams/${slug}`,
  });
}

export default async function ExamKnowledgeHubPage({ params }: Props) {
  const { slug } = await params;
  const result = await ExamKnowledgeCandidateService.getExamKnowledgeCandidateView({
    examSlug: slug,
  });

  if (result.status !== "FOUND" || !result.data) {
    notFound();
  }

  const data = result.data;
  const { exam, activeCycle, availableCycles, structuredFacts, curriculum, publishedModules, officialSources, metadata } = data;

  // Compile all published FAQs from all modules
  const allFaqs: Array<{ question: string; answer: string; category?: string }> = [];
  Object.values(publishedModules).forEach((mod) => {
    if (mod && Array.isArray(mod.faqs)) {
      allFaqs.push(...mod.faqs);
    }
  });

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Home",
            item: "https://couragelibrary.com",
          },
          {
            "@type": "ListItem",
            position: 2,
            name: "Exams",
            item: "https://couragelibrary.com/exams",
          },
          {
            "@type": "ListItem",
            position: 3,
            name: exam.title,
            item: `https://couragelibrary.com/exams/${exam.slug}`,
          },
        ],
      },
      ...(allFaqs.length > 0
        ? [
            {
              "@type": "FAQPage",
              mainEntity: allFaqs.map((faq) => ({
                "@type": "Question",
                name: faq.question,
                acceptedAnswer: {
                  "@type": "Answer",
                  text: faq.answer,
                },
              })),
            },
          ]
        : []),
    ],
  };

  return (
    <div className="py-8 bg-slate-50/50 min-h-[calc(100vh-4rem)]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        {/* 1. Hero Section */}
        <ExamHero data={data} />

        {/* 2. Cycle Snapshot */}
        <ExamCycleSnapshot
          activeCycle={activeCycle}
          availableCycles={availableCycles}
          examSlug={exam.slug}
        />

        {/* 3. Sticky Quick Navigation Bar */}
        <ExamQuickNav
          availableModuleKeys={data.availableModuleKeys}
          hasPosts={structuredFacts.posts.length > 0}
          hasCurriculum={curriculum.subjects.length > 0}
          hasSources={officialSources.length > 0}
          hasFaqs={allFaqs.length > 0}
        />

        {/* 4. Published Knowledge Modules Grid */}
        <section id="modules" className="space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-200">
            <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-600" />
              Published Exam Guides & Modules
            </h2>
            <Badge variant="outline" className="text-xs">
              {metadata.totalPublishedModulesCount} Available
            </Badge>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {ExamModuleRegistry.getAllModuleKeys().map((key) => {
              const mod = publishedModules[key];
              const def = ExamModuleRegistry.getModuleDefinition(key);
              return (
                <ExamModuleCard
                  key={key}
                  moduleKey={key}
                  displayName={def.displayName}
                  moduleData={mod}
                  examSlug={exam.slug}
                />
              );
            })}
          </div>
        </section>

        {/* 5. Eligibility Parameters Summary */}
        <section id="eligibility" className="space-y-4">
          <div className="pb-2 border-b border-slate-200">
            <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              Eligibility Criteria Summary
            </h2>
          </div>

          <Card className="rounded-2xl border-slate-200 bg-white">
            <CardContent className="p-6">
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Minimum Age
                  </span>
                  <div className="text-xl font-black text-slate-900">
                    {structuredFacts.eligibilityParameters.minAge
                      ? `${structuredFacts.eligibilityParameters.minAge} Years`
                      : "Prescribed in Rules"}
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Maximum Age
                  </span>
                  <div className="text-xl font-black text-slate-900">
                    {structuredFacts.eligibilityParameters.maxAge
                      ? `${structuredFacts.eligibilityParameters.maxAge} Years`
                      : "Prescribed in Rules"}
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Educational Qualification
                  </span>
                  <div className="text-base font-bold text-slate-900 line-clamp-2">
                    {structuredFacts.eligibilityParameters.educationMin ||
                      "Bachelor's Degree / Equivalent"}
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Nationality / Citizenship
                  </span>
                  <div className="text-base font-bold text-slate-900">
                    {structuredFacts.eligibilityParameters.nationality || "Citizen of India"}
                  </div>
                </div>
              </div>

              {publishedModules.ELIGIBILITY && (
                <div className="mt-6 pt-4 border-t border-slate-100 flex justify-end">
                  <Link href={`/exams/${exam.slug}/eligibility`}>
                    <Button variant="outline" size="sm" className="font-semibold text-xs gap-1.5">
                      View Full Eligibility & Age Relaxations <ArrowRight className="w-3.5 h-3.5" />
                    </Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        {/* 6. Posts & Salary Cadres */}
        {structuredFacts.posts.length > 0 && (
          <section id="posts" className="space-y-4">
            <ExamPostsTable posts={structuredFacts.posts} />
          </section>
        )}

        {/* 7. Exam Pattern */}
        {structuredFacts.patterns.length > 0 && (
          <section id="pattern" className="space-y-4">
            <div className="pb-2 border-b border-slate-200">
              <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
                <Target className="w-5 h-5 text-indigo-600" />
                Exam Pattern & Scheme of Examination
              </h2>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              {structuredFacts.patterns.map((pat) => (
                <Card key={pat.id} className="rounded-2xl border-slate-200 bg-white">
                  <CardContent className="p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-base text-slate-900">{pat.name}</h3>
                      {pat.tierName && (
                        <Badge variant="indigo" className="text-[10px]">
                          {pat.tierName}
                        </Badge>
                      )}
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center text-xs">
                      <div className="p-2 rounded-lg bg-slate-50 border border-slate-100">
                        <span className="text-slate-400 text-[10px] block">Duration</span>
                        <span className="font-bold text-slate-800">{pat.durationMinutes} Mins</span>
                      </div>
                      <div className="p-2 rounded-lg bg-slate-50 border border-slate-100">
                        <span className="text-slate-400 text-[10px] block">Questions</span>
                        <span className="font-bold text-slate-800">{pat.totalQuestions}</span>
                      </div>
                      <div className="p-2 rounded-lg bg-slate-50 border border-slate-100">
                        <span className="text-slate-400 text-[10px] block">Marks</span>
                        <span className="font-bold text-slate-800">{pat.totalMarks}</span>
                      </div>
                    </div>

                    {pat.sections.length > 0 && (
                      <div className="space-y-2 pt-2 border-t border-slate-100">
                        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                          Sectional Breakdown
                        </span>
                        <div className="space-y-1.5">
                          {pat.sections.map((sec, idx) => (
                            <div
                              key={idx}
                              className="flex items-center justify-between text-xs py-1 px-2.5 rounded-md bg-slate-50/80 border border-slate-100"
                            >
                              <span className="font-medium text-slate-700">{sec.name}</span>
                              <span className="font-mono text-slate-500 text-[11px]">
                                {sec.questionCount} Qs • {sec.questionCount * sec.marksPerQuestion} M
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

        {/* 8. Canonical Syllabus Navigator */}
        {curriculum.subjects.length > 0 && (
          <section id="syllabus" className="space-y-4">
            <ExamSyllabusNavigator subjects={curriculum.subjects} />
          </section>
        )}

        {/* 9. FAQs */}
        {allFaqs.length > 0 && (
          <section id="faqs" className="space-y-4">
            <ExamFaqAccordion faqs={allFaqs} />
          </section>
        )}

        {/* 10. Official Verified Sources */}
        {officialSources.length > 0 && (
          <section id="sources" className="space-y-4">
            <ExamOfficialSources sources={officialSources} />
          </section>
        )}
      </div>
    </div>
  );
}
