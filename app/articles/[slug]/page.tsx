import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Metadata } from "next";
import { ContentService } from "@/services/content.service";
import { Container } from "@/components/ui/container";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Target,
  BookOpen,
  ChevronRight,
  GitFork,
  CheckCircle2,
  Clock,
  Layers,
} from "lucide-react";
import { constructMetadata } from "@/lib/seo/metadata";
import { generateArticleSchema, generateBreadcrumbSchema } from "@/lib/seo/jsonld";
import { ControlledContentRenderer } from "@/components/learning/controlled-content-renderer";

export const revalidate = 60; // ISR baseline

interface Props {
  params: Promise<{ slug: string }>;
}

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  CONCEPT_LESSON: "Concept Lesson",
  WORKED_EXAMPLES: "Worked Examples",
  FORMULA_SHORTCUT_SHEET: "Formula & Shortcut Sheet",
  COMMON_TRAPS_AND_MISTAKES: "Common Traps & Mistakes",
  PYQ_DEEP_DIVE: "PYQ Deep Dive",
  TOPIC_SUMMARY_REVISION: "Topic Summary & Revision",
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const article = await ContentService.getArticleBySlug(slug);

  if (!article) {
    return constructMetadata({
      title: "Article Not Found",
      noIndex: true,
    });
  }

  return constructMetadata({
    title: article.metaTitle || article.title,
    description:
      article.metaDescription ||
      article.excerpt ||
      `Read complete article on ${article.title} at Courage Library.`,
    canonicalUrl: `/articles/${slug}`,
    ogType: "article",
    publishedTime: article.publishedAt || undefined,
    ogImage: article.featuredImageUrl || undefined,
  });
}

export default async function ArticleReaderPage({ params }: Props) {
  const { slug } = await params;
  const article = await ContentService.getArticleBySlug(slug);

  if (!article) {
    notFound();
  }

  // Fetch knowledge graph relationships if topic ID is available
  const relatedResources = (article.topicId || article.relatedTopicId)
    ? await ContentService.getRelatedLearningResources(article.topicId || article.relatedTopicId!)
    : [];

  const breadcrumbsList = [
    { label: "Home", href: "/" },
    { label: "Articles", href: "/articles" },
  ];

  if (article.subjectName) {
    breadcrumbsList.push({
      label: article.subjectName,
      href: `/articles?subject=${encodeURIComponent(article.subjectName)}`,
    });
  }

  if (article.topicName) {
    breadcrumbsList.push({
      label: article.topicName,
      href: article.topicSlug ? `/practice?topic=${article.topicSlug}` : `/articles`,
    });
  }

  breadcrumbsList.push({
    label: article.title,
    href: `/articles/${article.slug}`,
  });

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      generateBreadcrumbSchema(breadcrumbsList),
      generateArticleSchema({
        headline: article.metaTitle || article.title,
        description:
          article.metaDescription || article.excerpt || article.title,
        url: `/articles/${article.slug}`,
        image: article.featuredImageUrl || undefined,
        datePublished: article.publishedAt || undefined,
        authorName: "Courage Library",
      }),
    ],
  };

  const docTypeLabel = article.documentType
    ? DOCUMENT_TYPE_LABELS[article.documentType] || article.documentType.replace(/_/g, " ")
    : "Article";

  return (
    <div className="py-8 sm:py-10 bg-slate-50/50 min-h-[calc(100vh-4rem)]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Container className="space-y-6 max-w-4xl">
        {/* Academic Breadcrumbs Navigation */}
        <nav aria-label="Breadcrumbs" className="flex items-center flex-wrap gap-1.5 text-xs text-slate-500 font-medium">
          <Link
            href="/articles"
            className="inline-flex items-center gap-1 hover:text-slate-900 transition-colors"
          >
            <ArrowLeft className="w-3 h-3 mr-0.5" /> Articles
          </Link>
          {article.subjectName && (
            <>
              <ChevronRight className="w-3 h-3 text-slate-400" />
              <span className="text-slate-600 font-semibold">{article.subjectName}</span>
            </>
          )}
          {article.topicName && (
            <>
              <ChevronRight className="w-3 h-3 text-slate-400" />
              <span className="text-slate-700 font-bold">{article.topicName}</span>
            </>
          )}
        </nav>

        {/* Article Reader Card */}
        <Card className="p-6 sm:p-10 space-y-6 border-slate-200 shadow-sm bg-white">
          <div className="space-y-3 pb-6 border-b border-slate-100">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="indigo" className="text-[11px] font-bold uppercase tracking-wider bg-teal-700 text-white">
                {docTypeLabel}
              </Badge>
              <Badge variant="outline" className="text-[11px] font-mono font-semibold text-slate-600 flex items-center gap-1">
                <Clock className="w-3 h-3 text-slate-400" />
                {article.readingTimeMinutes} MIN READ
              </Badge>
              {article.isCanonical && (
                <Badge variant="outline" className="text-[11px] font-bold text-teal-800 bg-teal-50/70 border-teal-200 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-teal-600" />
                  Canonical Lesson
                </Badge>
              )}
              {article.topicName && (
                <span className="text-xs font-bold text-slate-500 font-mono">
                  • {article.topicName}
                </span>
              )}
            </div>

            <h1 className="text-2xl sm:text-4xl font-black text-slate-900 tracking-tight leading-tight">
              {article.title}
            </h1>

            {article.excerpt && (
              <p className="text-sm sm:text-base text-slate-600 font-medium leading-relaxed">
                {article.excerpt}
              </p>
            )}
          </div>

          {/* Article Body */}
          <div className="text-slate-800 leading-relaxed font-sans">
            <ControlledContentRenderer contentMdx={article.contentBody || ""} />
          </div>

          {/* Related Knowledge Graph Topics */}
          {relatedResources.length > 0 && (
            <div className="pt-6 border-t border-slate-100 space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wider font-mono">
                <GitFork className="w-3.5 h-3.5 text-indigo-600" />
                Related Topics &amp; Knowledge Graph
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {relatedResources.map((rel) => (
                  <Link
                    key={rel.topicId}
                    href={rel.learningSlug ? `/articles/${rel.learningSlug}` : `/practice?topic=${rel.topicSlug || rel.topicId}`}
                    className="p-3 rounded-xl border border-slate-200 hover:border-teal-300 hover:bg-teal-50/30 transition flex items-center justify-between group"
                  >
                    <div className="space-y-0.5">
                      <div className="text-xs font-bold text-slate-900 group-hover:text-teal-900">
                        {rel.topicName}
                      </div>
                      <div className="text-[10px] text-slate-500 font-medium capitalize">
                        {rel.relationshipType ? rel.relationshipType.toLowerCase().replace(/_/g, " ") : "Prerequisite / Related"}
                        {rel.learningSlug && " • Full Lesson"}
                      </div>
                    </div>
                    <BookOpen className="w-4 h-4 text-slate-400 group-hover:text-teal-600 shrink-0 ml-2" />
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Learn More Topic Action Integration (Closed Learning Loop) */}
          {(article.topicId || article.relatedTopicId) && (
            <div className="p-6 rounded-2xl bg-gradient-to-r from-teal-950 via-slate-900 to-indigo-950 text-white space-y-3.5 mt-8 border border-teal-800/40 shadow-lg">
              <div className="flex items-center gap-2 font-black text-sm tracking-tight text-teal-300">
                <Target className="w-4 h-4 text-teal-400" />
                Closed Learning Loop: Master This Topic
              </div>
              <p className="text-xs text-slate-300 font-medium leading-relaxed">
                Reinforce what you learned in this study guide by testing your conceptual recall with practice questions, flashcards, or a timed mock exam.
              </p>
              <div className="flex flex-wrap gap-2.5 pt-1">
                <Link href={article.topicSlug ? `/practice?topic=${article.topicSlug}` : `/practice?topic=${article.topicId || article.relatedTopicId}`}>
                  <Button size="sm" variant="default" className="bg-teal-500 hover:bg-teal-600 text-slate-950 font-extrabold text-xs shadow-xs">
                    <BookOpen className="w-3.5 h-3.5 mr-1" /> Practice Topic Questions
                  </Button>
                </Link>
                <Link href="/flashcards">
                  <Button size="sm" variant="outline" className="border-white/30 text-white hover:bg-white/10 font-semibold text-xs">
                    <Layers className="w-3.5 h-3.5 mr-1" /> Review Flashcards
                  </Button>
                </Link>
                <Link href="/mock-tests">
                  <Button size="sm" variant="outline" className="border-white/30 text-white hover:bg-white/10 font-semibold text-xs">
                    Take Full Mock Test
                  </Button>
                </Link>
              </div>
            </div>
          )}
        </Card>
      </Container>
    </div>
  );
}

