import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, BookOpen } from "lucide-react";
import { Container } from "@/components/ui/layout";
import { ButtonLink } from "@/components/ui/button";
import { constructMetadata } from "@/lib/seo/metadata";
import { generateBreadcrumbSchema } from "@/lib/seo/jsonld";
import { jsonLdText } from "@/lib/learn/seo";
import { siteConfig } from "@/config/site";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { topicPracticeHref } from "@/lib/learn/topic";
import { examMocks } from "@/lib/exams/exam-page-server";
import { WEIGHTAGE_LABEL } from "@/lib/learning/course-view";
import { getExamTopic } from "@/services/learning/exam-topic.service";
import { getPublishedExamNote } from "@/services/learning/exam-note.service";
import { ExamNoteBlocks } from "@/components/learning/exam-note-blocks";

/**
 * CA-6 exam-topic page — /exams/<exam>/<subject>/<topic>[/<subtopic>[/<concept>]] (the subject arrives as moduleSlug: a
 * one-segment /exams/<exam>/<module> is the exam-knowledge module page, unchanged). UNIQUE exam-specific content only:
 * how this exam asks the topic, weightage, that exam's previous-year questions, practice + mocks, a short lesson summary
 * and a link to the master lesson — never the lesson's full text. Self-canonical; noindex when it has nothing unique yet.
 */
export const dynamic = "force-dynamic";

/** "<Topic> for <Exam>: Rules, Examples & Practice" — the exam-topic page's <title> and H1 (canonical: this page). */
const examTopicTitle = (topic: string, exam: string) => `${topic} for ${exam}: Rules, Examples & Practice`;

interface Props {
  params: Promise<{ slug: string; moduleSlug: string; rest: string[] }>;
}

// CA-7: a published exam note is unique exam-specific content too
const indexable = (d: NonNullable<Awaited<ReturnType<typeof getExamTopic>>>, hasNote: boolean) => Boolean(d.lesson) || d.pyq.total > 0 || hasNote;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, moduleSlug, rest } = await params;
  const d = await getExamTopic(slug, [moduleSlug, ...rest]);
  if (!d) return constructMetadata({ title: "Topic not found", noIndex: true });
  return constructMetadata({
    // LESSON-PROMPT-QUALITY-1 E: the platform writes the exam-specific title (master lessons are exam-neutral)
    title: examTopicTitle(d.node.name, d.exam.title),
    description: `How ${d.exam.title} asks ${d.node.name}: weightage${d.pyq.total ? `, ${d.pyq.total} previous-year question${d.pyq.total === 1 ? "" : "s"}` : ""}, practice and the full lesson.`,
    canonicalUrl: d.path,
    noIndex: !indexable(d, Boolean(await getPublishedExamNote(d.exam.id, d.node.id, "en"))),
  });
}

export default async function ExamTopicPage({ params }: Props) {
  const { slug, moduleSlug, rest } = await params;
  const d = await getExamTopic(slug, [moduleSlug, ...rest]);
  if (!d) notFound();
  const supabase = await createServerSupabaseClient();
  const [practiceHref, mocks, note] = await Promise.all([topicPracticeHref(supabase, d.node.topicId), examMocks(d.exam.id), getPublishedExamNote(d.exam.id, d.node.id, "en")]);
  const q = d.expectedQuestions;
  const questionsText = q.avg !== null ? `about ${q.avg} question${q.avg === 1 ? "" : "s"} per paper` : q.max !== null ? `up to ${q.max} question${q.max === 1 ? "" : "s"}${q.min !== null && q.min !== q.max ? ` (at least ${q.min})` : ""}` : null;
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      generateBreadcrumbSchema([{ label: "Home", href: "/" }, { label: d.exam.title, href: `/exams/${d.exam.slug}` }, { label: d.node.name, href: d.path }]),
      { "@type": "WebPage", name: `${d.node.name} for ${d.exam.title}`, url: `${siteConfig.url}${d.path}`, about: { "@type": "Thing", name: d.node.name }, ...(d.lesson ? { relatedLink: `${siteConfig.url}${d.lesson.href}` } : {}) },
    ],
  };

  return (
    <div className="py-8 lg:py-12" data-exam-topic="">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdText(jsonLd) }} />
      <Container size="reading" className="flex flex-col gap-6">
        <nav aria-label="Breadcrumbs" className="flex flex-wrap items-center gap-x-2 text-body-sm text-fg-secondary">
          <Link href={`/exams/${d.exam.slug}`} className="focus-ring inline-flex min-h-12 items-center font-medium hover:text-fg">
            {d.exam.title}
          </Link>
          {d.node.subjectName && <span>/ {d.node.subjectName}</span>}
          <span aria-current="page">/ {d.node.name}</span>
        </nav>

        <header className="flex flex-col gap-2">
          <h1 className="text-h1 font-bold text-fg">
            {examTopicTitle(d.node.name, d.exam.title)}
          </h1>
          <p className="text-body-lg text-fg-secondary">
            {[d.weightageTier ? `${WEIGHTAGE_LABEL[d.weightageTier] ?? d.weightageTier} weightage` : null, questionsText].filter(Boolean).join(" · ") || "Part of the published syllabus."}
          </p>
        </header>

        {note && (
          <section aria-labelledby="note-h" className="flex flex-col gap-3" data-exam-note="">
            <h2 id="note-h" className="text-h3 font-semibold text-fg">
              {note.meta.title}
            </h2>
            <ExamNoteBlocks blocks={note.blocks} />
          </section>
        )}

        <section aria-labelledby="asked-h" className="flex flex-col gap-2">
          <h2 id="asked-h" className="text-h3 font-semibold text-fg">
            Where it sits in the {d.exam.title} syllabus
          </h2>
          <ul className="ml-5 list-disc text-body text-fg">
            {d.askedAs.map((a, i) => (
              <li key={i}>
                {a.syllabusPath}
                {a.tier ? <span className="text-fg-secondary"> ({a.tier})</span> : null}
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="pyq-h" className="flex flex-col gap-2">
          <h2 id="pyq-h" className="text-h3 font-semibold text-fg">
            Previous-year questions
          </h2>
          {d.pyq.total === 0 ? (
            <p className="text-body text-fg-secondary">No previous-year questions on this topic are published yet.</p>
          ) : (
            <ul className="flex flex-col gap-1 text-body text-fg">
              {d.pyq.byYear.map((y) => (
                <li key={y.year}>
                  <span className="font-semibold">{y.year}</span>: {y.count} question{y.count === 1 ? "" : "s"}
                  {y.stages.length ? <span className="text-fg-secondary"> · {y.stages.join(", ")}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        {d.lesson ? (
          <section aria-labelledby="lesson-h" className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4">
            <h2 id="lesson-h" className="text-h3 font-semibold text-fg">
              The lesson: {d.lesson.title}
            </h2>
            {d.lesson.summary && <p className="text-body text-fg-secondary">{d.lesson.summary}</p>}
            {d.lesson.outline.length > 0 && <p className="text-body-sm text-fg-secondary">Covers: {d.lesson.outline.join(" · ")}</p>}
            <div>
              <ButtonLink href={d.lesson.href} variant="primary" size="lg" className="min-h-12" trailingIcon={<ArrowRight aria-hidden="true" className="size-4" />}>
                Read the full lesson
              </ButtonLink>
            </div>
          </section>
        ) : (
          <p className="flex items-center gap-2 text-body text-fg-secondary">
            <BookOpen aria-hidden="true" className="size-5" /> The lesson for this topic is being written.
          </p>
        )}

        {(practiceHref || mocks.length > 0) && (
          <section aria-labelledby="practice-h" className="flex flex-col gap-2">
            <h2 id="practice-h" className="text-h3 font-semibold text-fg">
              Practice
            </h2>
            <ul className="flex flex-col">
              {practiceHref && (
                <li>
                  <Link href={practiceHref} className="focus-ring inline-flex min-h-12 items-center font-medium text-link">
                    Practice {d.node.topicName ?? d.node.name}
                  </Link>
                </li>
              )}
              {mocks.slice(0, 3).map((m) => (
                <li key={m.id}>
                  <Link href={`/mock-tests/${m.id}`} className="focus-ring inline-flex min-h-12 items-center font-medium text-link">
                    {m.title}
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
