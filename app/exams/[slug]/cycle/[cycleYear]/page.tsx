import React from "react";
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
import { Badge } from "@/components/ui/badge";
import { FileText } from "lucide-react";
import { constructMetadata } from "@/lib/seo/metadata";

export const revalidate = 60; // ISR baseline

interface Props {
  params: Promise<{ slug: string; cycleYear: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, cycleYear } = await params;
  const yearNum = parseInt(cycleYear, 10);

  if (isNaN(yearNum)) {
    return constructMetadata({ title: "Invalid Cycle", noIndex: true });
  }

  const result = await ExamKnowledgeCandidateService.getExamKnowledgeCandidateView({
    examSlug: slug,
    cycleYear: yearNum,
  });

  if (result.status !== "FOUND" || !result.data) {
    return constructMetadata({ title: "Cycle Not Found", noIndex: true });
  }

  const exam = result.data.exam;

  return constructMetadata({
    title: `${exam.title} (${yearNum} Cycle) — Complete Exam Knowledge Hub`,
    description: `Official notification details, syllabus, exam patterns, posts, and eligibility for ${exam.title} ${yearNum}.`,
    canonicalUrl: `/exams/${slug}/cycle/${cycleYear}`,
  });
}

export default async function ExamCycleHubPage({ params }: Props) {
  const { slug, cycleYear } = await params;
  const yearNum = parseInt(cycleYear, 10);

  if (isNaN(yearNum)) {
    notFound();
  }

  const result = await ExamKnowledgeCandidateService.getExamKnowledgeCandidateView({
    examSlug: slug,
    cycleYear: yearNum,
  });

  if (result.status !== "FOUND" || !result.data) {
    notFound();
  }

  const data = result.data;
  const { exam, activeCycle, availableCycles, structuredFacts, curriculum, publishedModules, officialSources, metadata } = data;

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
            name: `${exam.title} (${yearNum})`,
            item: `https://couragelibrary.com/exams/${exam.slug}/cycle/${yearNum}`,
          },
        ],
      },
    ],
  };

  return (
    <div className="py-8 bg-slate-50/50 min-h-[calc(100vh-4rem)]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        <ExamHero data={data} />

        <ExamCycleSnapshot
          activeCycle={activeCycle}
          availableCycles={availableCycles}
          examSlug={exam.slug}
        />

        <ExamQuickNav
          availableModuleKeys={data.availableModuleKeys}
          hasPosts={structuredFacts.posts.length > 0}
          hasCurriculum={curriculum.subjects.length > 0}
          hasSources={officialSources.length > 0}
          hasFaqs={allFaqs.length > 0}
        />

        <section id="modules" className="space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-200">
            <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-600" />
              Published Guides ({activeCycle?.cycleLabel || `Cycle ${yearNum}`})
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

        {structuredFacts.posts.length > 0 && (
          <section id="posts" className="space-y-4">
            <ExamPostsTable posts={structuredFacts.posts} />
          </section>
        )}

        {curriculum.subjects.length > 0 && (
          <section id="syllabus" className="space-y-4">
            <ExamSyllabusNavigator subjects={curriculum.subjects} />
          </section>
        )}

        {allFaqs.length > 0 && (
          <section id="faqs" className="space-y-4">
            <ExamFaqAccordion faqs={allFaqs} />
          </section>
        )}

        {officialSources.length > 0 && (
          <section id="sources" className="space-y-4">
            <ExamOfficialSources sources={officialSources} />
          </section>
        )}
      </div>
    </div>
  );
}
