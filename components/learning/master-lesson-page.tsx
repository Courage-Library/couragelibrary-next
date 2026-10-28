import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookOpen, Lock } from "lucide-react";
import { Container } from "@/components/ui/layout";
import { ButtonLink } from "@/components/ui/button";
import { LessonBlocksRenderer } from "@/components/learning/lesson-blocks-renderer";
import { KatexMath } from "@/components/learning/katex-math";
import { LessonProgress } from "@/components/learning/lesson-progress";
import { constructMetadata } from "@/lib/seo/metadata";
import { generateBreadcrumbSchema } from "@/lib/seo/jsonld";
import { jsonLdText, learningResourceSchema, lessonAlternates, PAYWALL_SELECTOR } from "@/lib/learn/seo";
import { learnHref, segmentsToHierarchyPath } from "@/lib/learn/paths";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { topicPracticeHref } from "@/lib/learn/topic";
import { getMasterLessonPage, loadMasterData } from "@/services/learning/master-lesson.service";
import { saveLessonProgressAction } from "@/app/articles/actions";

/**
 * CA-6 master lesson page (design G) — /learn/<subject>/<topic>[/<subtopic>[/<concept>]] (EN, canonical, full text) and
 * /hi/learn/… (Hindi when published; otherwise English, noindex, canonical → EN). Server-rendered; the lesson data is
 * cached (tag "learn") and revalidated on publish; viewer state (Pro access, progress) per request. A Pro lesson shows
 * title + intro + outline (indexable) and a gated section without the body (paywalled-content markup). English UI (R9).
 */

const LEVEL: Record<string, string> = { TOPIC: "Topic", SUBTOPIC: "Subtopic", CONCEPT: "Concept" };

export async function masterLessonMetadata(segments: string[], language: "en" | "hi"): Promise<Metadata> {
  const path = segmentsToHierarchyPath(segments);
  const data = path ? await loadMasterData(path) : null;
  if (!path || !data) return constructMetadata({ title: "Lesson not found", noIndex: true });
  const alt = lessonAlternates({ enPath: learnHref(path), hiPath: learnHref(path, "hi"), language, hiPublished: Boolean(data.lesson?.hi), hasLesson: Boolean(data.lesson) });
  const version = data.lesson ? (language === "hi" && data.lesson.hi ? data.lesson.hi : data.lesson.en) : null;
  const title = version?.meta.seo?.meta_title || version?.meta.title || data.node.name;
  const description = version?.meta.seo?.meta_description || version?.meta.summary || `${data.node.name}: study notes${data.node.subjectName ? ` for ${data.node.subjectName}` : ""}.`;
  const base = constructMetadata({ title, description, canonicalUrl: alt.canonical, ogType: "article", publishedTime: data.lesson?.publishedAt || undefined, noIndex: alt.noIndex });
  return { ...base, alternates: { ...base.alternates, ...(alt.languages ? { languages: alt.languages } : {}) } };
}

export async function MasterLessonPageView({ segments, language }: { segments: string[]; language: "en" | "hi" }) {
  const page = await getMasterLessonPage(segments, language);
  if (!page) notFound();
  const { data } = page;
  if (!data.lesson && data.children.length === 0) notFound();

  const pagePath = learnHref(data.node.hierarchyPath, language);
  const supabase = await createServerSupabaseClient();
  const practiceHref = await topicPracticeHref(supabase, data.node.topicId);
  let progress = page.progress;
  if (progress === "NOT_STARTED" && data.lesson && page.shown) {
    // opening the lesson records READING (server only; a failure only skips the record)
    const r = await saveLessonProgressAction({ documentId: data.lesson.documentId, language: page.shown, status: "READING" }).catch(() => null);
    if (r?.ok) progress = r.status;
  }

  const version = data.lesson ? (page.shown === "hi" && data.lesson.hi ? data.lesson.hi : data.lesson.en) : null;
  const title = version?.meta.title || data.node.name;
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      generateBreadcrumbSchema([{ label: "Home", href: "/" }, ...data.breadcrumbs.map((b) => ({ label: b.name, ...(b.href ? { href: b.href } : {}) }))]),
      ...(version
        ? [
            learningResourceSchema({
              name: title,
              description: version.meta.summary || null,
              path: pagePath,
              language: page.shown === "hi" ? "hi" : "en",
              isFree: page.access === "FREE",
              datePublished: data.lesson?.publishedAt || null,
              about: [data.node.name, ...(data.node.topicName && data.node.topicName !== data.node.name ? [data.node.topicName] : []), ...(data.node.subjectName ? [data.node.subjectName] : [])],
            }),
          ]
        : []),
    ],
  };

  return (
    <div className="py-8 lg:py-12" data-master-lesson="">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdText(jsonLd) }} />
      <Container size="reading" className="flex flex-col gap-6">
        <nav aria-label="Breadcrumbs" className="flex flex-wrap items-center gap-x-2 text-body-sm text-fg-secondary">
          {data.breadcrumbs.map((b, i) => (
            <span key={i} className="inline-flex items-center gap-2">
              {i > 0 && <span aria-hidden="true">/</span>}
              {b.href && i < data.breadcrumbs.length - 1 ? (
                <Link href={b.href} className="focus-ring inline-flex min-h-12 items-center font-medium hover:text-fg">
                  {b.name}
                </Link>
              ) : (
                <span aria-current={i === data.breadcrumbs.length - 1 ? "page" : undefined}>{b.name}</span>
              )}
            </span>
          ))}
        </nav>

        <article className="flex flex-col gap-6 rounded-card border border-line bg-surface p-4 sm:p-8" data-article="">
          <header className="flex flex-col gap-3 border-b border-line pb-6">
            <p className="text-body-sm font-semibold text-fg-secondary">
              {LEVEL[data.node.nodeType] ?? "Lesson"}
              {data.node.subjectName ? ` · ${data.node.subjectName}` : ""}
            </p>
            <h1 className="text-h1 font-bold text-fg">{title}</h1>
            {version?.meta.summary && <p className="text-body-lg text-fg-secondary">{version.meta.summary}</p>}
          </header>

          {language === "hi" && data.lesson && !data.lesson.hi && (
            <p className="rounded-card border border-line bg-surface-sunken px-4 py-3 text-body-sm text-fg-secondary" data-testid="lesson-language-note">
              Hindi coming soon. This lesson is shown in English for now.
            </p>
          )}

          {!data.lesson ? (
            <p className="text-body text-fg-secondary">The lesson for this {LEVEL[data.node.nodeType]?.toLowerCase() ?? "node"} is being written. Its parts below already have lessons.</p>
          ) : page.locked && page.teaser ? (
            <>
              {page.teaser.outline.length > 0 && (
                <section aria-labelledby="outline-h">
                  <h2 id="outline-h" className="mb-2 text-h3 font-semibold text-fg">
                    In this lesson
                  </h2>
                  <ul className="ml-5 list-disc text-body text-fg">
                    {page.teaser.outline.map((o, i) => (
                      <li key={i}>{o}</li>
                    ))}
                  </ul>
                </section>
              )}
              <section className={`${PAYWALL_SELECTOR.slice(1)} flex flex-col items-center gap-3 rounded-card border border-line bg-surface-sunken p-6 text-center`} data-testid="learning-locked-panel">
                <Lock aria-hidden="true" className="size-6 text-fg-secondary" />
                <h2 className="text-h3 font-semibold text-fg">This lesson is part of Courage Library PRO</h2>
                <p className="text-body text-fg-secondary">The full lesson, worked examples and exam traps are in PRO.</p>
                <ButtonLink href="/billing" variant="secondary" size="lg" className="min-h-12">
                  See PRO
                </ButtonLink>
              </section>
            </>
          ) : page.body ? (
            <>
              <div lang={page.shown ?? "en"} className="text-body text-fg">
                <LessonBlocksRenderer blocks={page.body.blocks} links={page.body.links} Math={KatexMath} />
              </div>
              {progress && <LessonProgress documentId={data.lesson.documentId} language={page.shown ?? "en"} pagePath={pagePath} status={progress} />}
            </>
          ) : null}
        </article>

        {practiceHref && (
          <div>
            <ButtonLink href={practiceHref} variant="primary" size="lg" className="min-h-12">
              Practice this topic
            </ButtonLink>
          </div>
        )}

        {data.children.length > 0 && (
          <section aria-labelledby="parts-h" className="flex flex-col gap-2">
            <h2 id="parts-h" className="text-h3 font-semibold text-fg">
              Go deeper
            </h2>
            <ul className="flex flex-col">
              {data.children.map((c) => (
                <li key={c.href}>
                  <Link href={c.href} className="focus-ring flex min-h-12 items-center gap-3 rounded-control px-3 hover:bg-ink-50">
                    <BookOpen aria-hidden="true" className="size-5 text-primary-600" />
                    <span className="text-body font-medium text-fg">{c.name}</span>
                    <span className="text-body-sm text-fg-secondary">{LEVEL[c.nodeType] ?? ""}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {data.exams.length > 0 && (
          <section aria-labelledby="exams-h" className="flex flex-col gap-2">
            <h2 id="exams-h" className="text-h3 font-semibold text-fg">
              How exams ask this
            </h2>
            <ul className="flex flex-wrap gap-2">
              {data.exams.map((e) => (
                <li key={e.slug}>
                  <Link href={e.href} className="focus-ring inline-flex min-h-12 items-center rounded-control border border-line px-3 text-body font-medium text-link hover:bg-ink-50">
                    {e.title}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </Container>
    </div>
  );
}
