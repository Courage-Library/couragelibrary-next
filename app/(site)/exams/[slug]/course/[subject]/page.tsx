import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Container } from "@/components/ui/layout";
import { Alert } from "@/components/ui/alert";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { ProgressBar } from "@/components/ui/progress";
import { TopicBlock } from "@/components/learning/course-ui";
import { constructMetadata } from "@/lib/seo/metadata";
import { ExamCourseService } from "@/services/learning/course.service";
import { topicsReadyText } from "@/lib/learning/course-structure";

/**
 * COURSE-UX-1 screen B — subject page: every syllabus topic of the subject in syllabus order. A topic with lessons opens
 * to its lesson rows (state: done / in progress / new, minutes from the word count); a topic without a lesson says
 * "Coming soon" (text, not a link). Weightage badge from the published syllabus; Learn + Practice (real count) per topic.
 */
export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ slug: string; subject: string }>;
}

async function load(slug: string, subjectSlug: string) {
  const course = await ExamCourseService.getCourse(slug);
  const subject = course?.subjects.find((s) => s.slug === subjectSlug) ?? null;
  return course && subject ? { course, subject } : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, subject } = await params;
  const r = await load(slug, subject);
  if (!r) return constructMetadata({ title: "Not found", noIndex: true });
  return constructMetadata({
    title: `${r.subject.title} · ${r.course.exam.title} course`,
    description: `${r.subject.title} for ${r.course.exam.title}: every syllabus topic with its lessons and practice.`,
    canonicalUrl: `/exams/${slug}/course/${r.subject.slug}`,
    noIndex: r.course.preview || r.subject.totals.lessons === 0,
  });
}

export default async function CourseSubjectPage({ params }: Props) {
  const { slug, subject: subjectSlug } = await params;
  const r = await load(slug, subjectSlug);
  if (!r) notFound();
  const { course, subject } = r;
  const t = subject.totals;
  // the topic to open first: the one holding the next lesson, else the first topic with lessons
  const openUnit =
    subject.topics.find((x) => x.lessons.some((l) => l.status === "READING"))?.unitId ??
    subject.topics.find((x) => x.lessons.some((l) => l.status !== "COMPLETED"))?.unitId ??
    null;

  return (
    <Container className="flex flex-col gap-6 py-8 lg:py-12" data-course-subject="">
      <Breadcrumb
        items={[
          { label: course.exam.title, href: `/exams/${course.exam.slug}` },
          { label: "Course", href: `/exams/${course.exam.slug}/course` },
          { label: subject.title },
        ]}
      />
      {course.preview && <Alert tone="info" title="Preview — this course is not launched" />}
      <header className="flex flex-col gap-3">
        <h1 className="text-h1 font-bold text-fg">{subject.title}</h1>
        <p className="text-body-lg text-fg-secondary" data-testid="subject-counts">
          {topicsReadyText(t.readyTopics, t.topics)}
          {t.lessons > 0 ? ` · ${t.completed} of ${t.lessons} lessons completed` : ""}
        </p>
        {course.signedIn && t.lessons > 0 && <ProgressBar label={`${subject.title} progress`} value={t.completed} max={t.lessons} valueText={`${t.completed} of ${t.lessons} lessons completed`} tone="success" />}
      </header>
      <ol className="flex flex-col gap-3" aria-label={`Topics in ${subject.title}`}>
        {subject.topics.map((topic) => (
          <TopicBlock key={topic.unitId} topic={topic} open={topic.unitId === openUnit} />
        ))}
      </ol>
    </Container>
  );
}
