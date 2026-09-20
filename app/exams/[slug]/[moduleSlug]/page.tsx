import React from "react";
import { notFound } from "next/navigation";
import { Metadata } from "next";
import { ExamKnowledgeCandidateService } from "@/services/exam-knowledge/exam-knowledge-candidate.service";
import { ExamModuleRegistry } from "@/services/exam-knowledge/exam-module-registry";
import { ExamModuleReaderView } from "@/components/exams/exam-module-reader-view";
import { ExamModuleKey } from "@/types/exam-knowledge";
import { constructMetadata } from "@/lib/seo/metadata";

export const revalidate = 60; // ISR baseline

interface Props {
  params: Promise<{ slug: string; moduleSlug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, moduleSlug } = await params;
  const moduleKey = ExamModuleRegistry.getModuleKeyFromSlug(moduleSlug);

  if (!moduleKey) {
    return constructMetadata({ title: "Module Not Found", noIndex: true });
  }

  const result = await ExamKnowledgeCandidateService.getExamKnowledgeCandidateView({
    examSlug: slug,
  });

  if (result.status !== "FOUND" || !result.data) {
    return constructMetadata({ title: "Exam Not Found", noIndex: true });
  }

  const modDef = ExamModuleRegistry.getModuleDefinition(moduleKey);
  const exam = result.data.exam;

  return constructMetadata({
    title: `${modDef.displayName} — ${exam.title}`,
    description: modDef.purpose,
    canonicalUrl: `/exams/${slug}/${moduleSlug}`,
  });
}

export default async function ExamModuleReaderPage({ params }: Props) {
  const { slug, moduleSlug } = await params;
  const moduleKey = ExamModuleRegistry.getModuleKeyFromSlug(moduleSlug);

  if (!moduleKey) {
    notFound();
  }

  const result = await ExamKnowledgeCandidateService.getExamKnowledgeCandidateView({
    examSlug: slug,
  });

  if (result.status !== "FOUND" || !result.data) {
    notFound();
  }

  const data = result.data;
  const publishedModule = data.publishedModules[moduleKey as ExamModuleKey];

  if (!publishedModule) {
    notFound();
  }

  const jsonLd = {
    "@context": "https://schema.org",
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
        name: data.exam.title,
        item: `https://couragelibrary.com/exams/${data.exam.slug}`,
      },
      {
        "@type": "ListItem",
        position: 4,
        name: publishedModule.displayName,
        item: `https://couragelibrary.com/exams/${data.exam.slug}/${moduleSlug}`,
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ExamModuleReaderView
        examSlug={data.exam.slug}
        examTitle={data.exam.title}
        moduleData={publishedModule}
        cycleYear={data.activeCycle?.cycleYear}
      />
    </>
  );
}
