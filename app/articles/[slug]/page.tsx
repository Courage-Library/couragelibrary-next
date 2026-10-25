import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Metadata } from "next";
import { ArrowLeft, ArrowRight, BookOpen, Clock, Lock } from "lucide-react";
import { ContentService } from "@/services/content.service";
import { Container } from "@/components/ui/layout";
import { ButtonLink } from "@/components/ui/button";
import { constructMetadata } from "@/lib/seo/metadata";
import { generateArticleSchema, generateBreadcrumbSchema } from "@/lib/seo/jsonld";
import { ControlledContentRenderer } from "@/components/learning/controlled-content-renderer";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { topicLearnHref, topicPracticeHref } from "@/lib/learn/topic";

// GAP2-2a: rendered per viewer (PRO documents are locked server-side); never cached across users.
export const dynamic = "force-dynamic";

/**
 * F6 article reader (R1, R4, R10): light reading surface; the ONE primary action is "Practice this topic" (F2 topic
 * practice — shown only when the topic can be practiced); related topics go to their article or their canonical topic
 * entry (/learn/topics/<id>) — never to a dead practice link. One article per document type per topic (no duplicates).
 */
interface Props {
  params: Promise<{ slug: string }>;
}

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  CONCEPT_LESSON: "Concept lesson",
  WORKED_EXAMPLES: "Worked examples",
  FORMULA_SHORTCUT_SHEET: "Formula and shortcut sheet",
  COMMON_TRAPS_AND_MISTAKES: "Common traps and mistakes",
  PYQ_DEEP_DIVE: "Previous-year questions explained",
  TOPIC_SUMMARY_REVISION: "Topic summary for revision",
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const article = await ContentService.getArticleBySlug(slug);
  if (!article) return constructMetadata({ title: "Article not found", noIndex: true });
  return constructMetadata({
    title: article.metaTitle || article.title,
    description: article.metaDescription || article.excerpt || `Study notes: ${article.title}.`,
    canonicalUrl: `/articles/${slug}`,
    ogType: "article",
    publishedTime: article.publishedAt || undefined,
    ogImage: article.featuredImageUrl || undefined,
  });
}

export default async function ArticleReaderPage({ params }: Props) {
  const { slug } = await params;
  const article = await ContentService.getArticleBySlug(slug);
  if (!article) notFound();

  const topicId = article.topicId || article.relatedTopicId || null;
  const supabase = await createServerSupabaseClient();
  const [relatedResources, practiceHref] = await Promise.all([
    topicId ? ContentService.getRelatedLearningResources(topicId) : Promise.resolve([]),
    topicPracticeHref(supabase, topicId),
  ]);

  const breadcrumbsList = [
    { label: "Home", href: "/" },
    { label: "Articles", href: "/articles" },
    ...(article.subjectName ? [{ label: article.subjectName, href: `/articles?subject=${encodeURIComponent(article.subjectName)}` }] : []),
    { label: article.title, href: `/articles/${article.slug}` },
  ];
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      generateBreadcrumbSchema(breadcrumbsList),
      generateArticleSchema({
        headline: article.metaTitle || article.title,
        description: article.metaDescription || article.excerpt || article.title,
        url: `/articles/${article.slug}`,
        image: article.featuredImageUrl || undefined,
        datePublished: article.publishedAt || undefined,
        authorName: "Courage Library",
      }),
    ],
  };
  const docTypeLabel = article.documentType ? DOCUMENT_TYPE_LABELS[article.documentType] || article.documentType.replace(/_/g, " ").toLowerCase() : "Article";

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-canvas py-6 sm:py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Container className="flex max-w-3xl flex-col gap-6">
        <nav aria-label="Breadcrumbs" className="flex flex-wrap items-center gap-x-2 text-body-sm text-fg-secondary">
          <Link href="/articles" className="focus-ring inline-flex min-h-12 items-center gap-1.5 font-medium hover:text-fg">
            <ArrowLeft aria-hidden="true" className="size-4" /> Articles
          </Link>
          {article.subjectName && <span>/ {article.subjectName}</span>}
          {article.topicName && <span>/ {article.topicName}</span>}
        </nav>

        <article className="flex flex-col gap-6 rounded-card border border-line bg-surface p-4 sm:p-8" data-article="">
          <header className="flex flex-col gap-3 border-b border-line pb-6">
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-body-sm text-fg-secondary">
              <span className="font-semibold text-fg">{docTypeLabel}</span>
              <span className="inline-flex items-center gap-1">
                <Clock aria-hidden="true" className="size-4" /> {article.readingTimeMinutes} min read
              </span>
              {article.topicName && <span>Topic: {article.topicName}</span>}
            </p>
            <h1 className="text-h1 font-bold text-fg">{article.title}</h1>
            {article.excerpt && <p className="text-body-lg text-fg-secondary">{article.excerpt}</p>}
          </header>

          <div className="text-body text-fg">
            {article.isLocked ? (
              <div className="flex flex-col items-center gap-3 rounded-card border border-line bg-surface-sunken p-6 text-center" data-testid="learning-locked-panel">
                <Lock aria-hidden="true" className="size-6 text-fg-secondary" />
                <h2 className="text-h3 font-semibold text-fg">This lesson is part of Courage Library PRO</h2>
                <p className="text-body text-fg-secondary">The full lesson, worked examples and exam traps are in PRO.</p>
                <ButtonLink href="/billing" variant="secondary" size="lg" className="min-h-12">
                  See PRO
                </ButtonLink>
              </div>
            ) : (
              <ControlledContentRenderer contentMdx={article.contentBody || ""} />
            )}
          </div>

          {relatedResources.length > 0 && (
            <section aria-labelledby="related-title" className="flex flex-col gap-3 border-t border-line pt-6">
              <h2 id="related-title" className="text-h3 font-semibold text-fg">
                Related topics
              </h2>
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {relatedResources.map((rel) => (
                  <li key={rel.topicId}>
                    <Link
                      href={rel.learningSlug ? `/articles/${rel.learningSlug}` : topicLearnHref(rel.topicId)}
                      className="focus-ring flex min-h-12 items-center justify-between gap-2 rounded-control border border-line px-3 py-2 text-body text-fg hover:bg-ink-50"
                    >
                      <span>
                        {rel.topicName}
                        <span className="block text-body-sm text-fg-secondary">{rel.relationshipType ? rel.relationshipType.toLowerCase().replace(/_/g, " ") : "related"}</span>
                      </span>
                      <BookOpen aria-hidden="true" className="size-4 shrink-0 text-fg-secondary" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {topicId && (
            <section aria-labelledby="next-step-title" className="flex flex-col gap-3 border-t border-line pt-6" data-article-next="">
              <h2 id="next-step-title" className="text-h3 font-semibold text-fg">
                Next step
              </h2>
              {practiceHref ? (
                <>
                  <p className="text-body text-fg-secondary">Check what you just read: questions on this topic, each with its explanation.</p>
                  <ButtonLink href={practiceHref} size="lg" className="min-h-12 self-start" trailingIcon={<ArrowRight aria-hidden="true" className="size-4" />} data-practice-topic="">
                    Practice this topic
                  </ButtonLink>
                </>
              ) : (
                <p className="text-body text-fg-secondary">Practice questions for this topic are not ready yet.</p>
              )}
              <Link href="/mock-tests" className="focus-ring inline-flex min-h-12 w-fit items-center text-body-sm font-medium text-link underline underline-offset-2">
                Or take a mock test
              </Link>
            </section>
          )}
        </article>
      </Container>
    </div>
  );
}
