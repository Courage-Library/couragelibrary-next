import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Circle, CircleDot, Lock } from "lucide-react";
import { Container } from "@/components/ui/layout";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ui/progress";
import { EmptyState } from "@/components/ui/empty-state";
import { constructMetadata } from "@/lib/seo/metadata";
import { ExamCourseService } from "@/services/learning/course.service";
import { WEIGHTAGE_LABEL, type CourseLessonView } from "@/lib/learning/course-view";

/**
 * CA-5 exam course (design E / F / I): generated from the exam's published syllabus ∩ the published lessons — chapters
 * are master topics in master order. Access per lesson from its MASTER-chapter position (one level for every exam);
 * a locked lesson links to its teaser, never to a body. A signed-in student sees their own progress and ONE primary
 * action: continue where they left off (else start). English UI (R9); the content language follows the preference.
 */
export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const course = await ExamCourseService.getCourse(slug);
  if (!course) return constructMetadata({ title: "Course not found", noIndex: true });
  return constructMetadata({
    title: `${course.exam.title} course`,
    description: `Every published lesson for the ${course.exam.title} syllabus, chapter by chapter.`,
    canonicalUrl: `/exams/${slug}/course`,
    noIndex: course.totals.lessons === 0,
  });
}

function LessonRow({ l, language }: { l: CourseLessonView; language: "en" | "hi" }) {
  const Icon = l.status === "COMPLETED" ? CheckCircle2 : l.status === "READING" ? CircleDot : Circle;
  const statusText = l.status === "COMPLETED" ? "Completed" : l.status === "READING" ? "In progress" : "Not started";
  return (
    <li>
      <Link href={l.href} className="focus-ring flex min-h-12 flex-wrap items-center gap-3 rounded-control px-3 py-2 hover:bg-ink-50">
        {l.locked ? <Lock aria-hidden="true" className="size-5 text-fg-secondary" /> : <Icon aria-hidden="true" className={`size-5 ${l.status === "COMPLETED" ? "text-success-700" : "text-fg-secondary"}`} />}
        <span className="flex-1 text-body font-medium text-fg">{l.name}</span>
        <span className="sr-only">{l.locked ? "Pro lesson, locked" : statusText}</span>
        {l.access === "PRO" ? <Badge tone="pro">Pro</Badge> : null}
        {language === "hi" && !l.hiAvailable ? <span className="text-body-sm text-fg-secondary">English for now</span> : null}
      </Link>
    </li>
  );
}

export default async function ExamCoursePage({ params }: Props) {
  const { slug } = await params;
  const course = await ExamCourseService.getCourse(slug);
  if (!course) notFound();
  const total = course.totals.lessons;

  return (
    <Container size="reading" className="flex flex-col gap-6 py-8 lg:py-12">
      <nav aria-label="Breadcrumb" className="text-body-sm text-fg-secondary">
        <Link href={`/exams/${course.exam.slug}`} className="focus-ring inline-flex min-h-12 items-center gap-1.5 font-medium hover:text-fg">
          <ArrowLeft aria-hidden="true" className="size-4" /> {course.exam.title}
        </Link>
      </nav>

      <header className="flex flex-col gap-3">
        <h1 className="text-h1 font-bold text-fg">{course.exam.title} course</h1>
        <p className="text-body-lg text-fg-secondary">
          {total > 0 ? `${total} lesson${total === 1 ? "" : "s"} in ${course.totals.chapters} chapter${course.totals.chapters === 1 ? "" : "s"}, in syllabus order.` : "Lessons for this syllabus are being written."}
        </p>
        {course.signedIn && total > 0 && <ProgressBar label="Your progress" value={course.completed} max={total} valueText={`${course.completed} of ${total} lessons completed`} tone="success" />}
        {course.continueLesson && (
          <div>
            <ButtonLink href={course.continueLesson.href} variant="primary" size="lg" className="min-h-12">
              {course.continueLesson.started ? "Continue where you left off" : "Start the next lesson"}
            </ButtonLink>
          </div>
        )}
      </header>

      {course.state !== "AVAILABLE" || total === 0 ? (
        <EmptyState
          title={course.state !== "AVAILABLE" ? "No published syllabus yet" : "No lessons yet"}
          description={course.state !== "AVAILABLE" ? "The course appears once the syllabus for this exam is published." : "Lessons appear here chapter by chapter as they are published."}
          action={
            <ButtonLink href={`/exams/${course.exam.slug}`} variant="secondary" size="lg" className="min-h-12">
              Back to the exam
            </ButtonLink>
          }
        />
      ) : (
        <ol className="flex flex-col gap-4" aria-label="Chapters">
          {course.chapters.map((c, i) => (
            <li key={c.topicId} className="rounded-card border border-line bg-surface p-4">
              <h2 className="text-h3 font-semibold text-fg">
                <span className="text-fg-secondary">{i + 1}.</span> {c.name}
              </h2>
              <p className="mb-2 text-body-sm text-fg-secondary">
                {[c.subjectName, c.weightageTier ? `${WEIGHTAGE_LABEL[c.weightageTier] ?? c.weightageTier} weightage` : null, c.expectedQuestionsMax !== null ? `up to ${c.expectedQuestionsMax} questions` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <ul className="flex flex-col" aria-label={`Lessons in ${c.name}`}>
                {c.lessons.map((l) => (
                  <LessonRow key={l.documentId} l={l} language={course.language} />
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </Container>
  );
}
