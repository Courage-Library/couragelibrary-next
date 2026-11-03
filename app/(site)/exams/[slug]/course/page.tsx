import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ExamBrandLogo } from "@/components/exams/exam-brand-logo";
import { Container } from "@/components/ui/layout";
import { ButtonLink } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { ProgressBar } from "@/components/ui/progress";
import { EmptyState } from "@/components/ui/empty-state";
import { SubjectCard } from "@/components/learning/course-ui";
import { constructMetadata } from "@/lib/seo/metadata";
import { ExamCourseService } from "@/services/learning/course.service";
import { completedText, lessonsReadyText, plural } from "@/lib/learning/course-structure";
import { courseSchema, jsonLdText } from "@/lib/learn/seo";
import { generateBreadcrumbSchema } from "@/lib/seo/jsonld";

/**
 * COURSE-UX-1 screen A — course home: ONE primary action (continue where you left off / start), overall progress and
 * one card per subject (progress ring, "x of y topics ready", high-yield count, practice). The whole syllabus is the
 * course (partial launch): counts are only what exists — no planned totals, no quotes, no year labels. English UI (R9).
 */
export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ slug: string }>;
}

const describe = (title: string) => `The ${title} course: every syllabus topic, its lessons and topic practice.`;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const course = await ExamCourseService.getCourse(slug);
  if (!course) return constructMetadata({ title: "Course not found", noIndex: true });
  return constructMetadata({
    title: `${course.exam.title} course`,
    description: describe(course.exam.title),
    canonicalUrl: `/exams/${slug}/course`,
    noIndex: course.preview || course.totals.lessons === 0,
  });
}

export default async function ExamCoursePage({ params }: Props) {
  const { slug } = await params;
  const course = await ExamCourseService.getCourse(slug);
  if (!course) notFound();
  const { totals } = course;
  const base = `/exams/${course.exam.slug}/course`;
  const first = course.order.find((l) => !l.locked) ?? null;
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      generateBreadcrumbSchema([{ label: "Home", href: "/" }, { label: course.exam.title, href: `/exams/${course.exam.slug}` }, { label: "Course", href: base }]),
      ...(totals.lessons > 0 && !course.preview
        ? [courseSchema({ name: `${course.exam.title} course`, description: describe(course.exam.title), path: base, lessons: course.order.map((l) => ({ name: l.name, path: l.href.split("?")[0] })) })]
        : []),
    ],
  };

  return (
    <Container className="flex flex-col gap-6 py-8 lg:py-12" data-course-home="">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdText(jsonLd) }} />
      <Breadcrumb items={[{ label: "Exams", href: "/exams" }, { label: course.exam.title, href: `/exams/${course.exam.slug}` }, { label: "Course" }]} />
      {course.preview && (
        <Alert tone="info" title="Preview — this course is not launched">
          Only staff see this page until the course is launched.
        </Alert>
      )}

      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <ExamBrandLogo slug={course.exam.slug} />
          <h1 className="text-h1 font-bold text-fg">{course.exam.title} course</h1>
        </div>
        <p className="text-body-lg text-fg-secondary" data-testid="course-counts">
          {totals.lessons > 0 ? `${lessonsReadyText(totals.lessons)} · ${totals.readyTopics} of ${plural(totals.topics, "topic")} ${totals.topics === 1 ? "has" : "have"} lessons` : `${plural(totals.topics, "topic")} · lessons are being written`}
        </p>
      </header>

      {course.state !== "AVAILABLE" || totals.topics === 0 ? (
        <EmptyState
          title="No published syllabus yet"
          description="The course appears once the syllabus for this exam is published."
          action={
            <ButtonLink href={`/exams/${course.exam.slug}`} variant="secondary" size="lg" className="min-h-12">
              Back to the exam
            </ButtonLink>
          }
        />
      ) : (
        <>
          <section aria-labelledby="continue-h" className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4 sm:flex-row sm:items-center sm:p-6" data-testid="course-continue">
            <div className="flex flex-1 flex-col gap-1">
              <h2 id="continue-h" className="text-body font-semibold text-fg-secondary">
                {course.continueLesson?.started ? "Continue where you left off" : course.signedIn ? "Your next lesson" : "Start the course"}
              </h2>
              {course.continueLesson ? (
                <p className="text-body-lg font-semibold text-fg">
                  {[course.continueLesson.subject, course.continueLesson.topic].filter(Boolean).join(" · ")}
                  {course.continueLesson.subject ? " › " : ""}
                  {course.continueLesson.name}
                </p>
              ) : first ? (
                <p className="text-body-lg font-semibold text-fg">{first.name}</p>
              ) : (
                <p className="text-body text-fg-secondary">Lessons appear here as they are published. Practice is open on the topics below.</p>
              )}
              {!course.signedIn && first && <p className="text-body-sm text-fg-secondary">Sign in to save your progress.</p>}
            </div>
            {(course.continueLesson || first) && (
              <ButtonLink href={course.continueLesson?.href ?? first!.href} variant="primary" size="lg" className="min-h-12">
                {course.continueLesson?.started ? "Continue" : "Start"}
              </ButtonLink>
            )}
          </section>

          {course.signedIn && totals.lessons > 0 && (
            <ProgressBar label="Your progress" value={totals.completed} max={totals.lessons} valueText={completedText(totals.completed, totals.lessons)} tone="success" />
          )}

          <section aria-labelledby="subjects-h" className="flex flex-col gap-3">
            <h2 id="subjects-h" className="text-h2 font-bold text-fg">
              Subjects
            </h2>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {course.subjects.map((s) => (
                <SubjectCard key={s.slug} subject={s} href={`${base}/${s.slug}`} />
              ))}
            </ul>
          </section>
        </>
      )}
    </Container>
  );
}
