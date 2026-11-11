import type { Metadata } from "next";
import { MasterLessonPageView, masterLessonMetadata } from "@/components/learning/master-lesson-page";
import { learnHref } from "@/lib/learn/paths";
import { redirectToTopicCanon } from "@/services/learning/topic-canon.service";

/** CA-6: the English master lesson page (canonical). /learn/topics/<id> (legacy entry) is a static route and wins. */
export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ path: string[] }>;
  searchParams: Promise<{ course?: string | string[] }>;
}

// SEO-TOPIC-CANON-1: a subtopic a flagged topic serves → 308 to the topic URL (the ?course= context is kept)
const courseQuery = (course: string | string[] | undefined) => (typeof course === "string" ? `?${new URLSearchParams({ course })}` : "");

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ path }, sp] = await Promise.all([params, searchParams]);
  await redirectToTopicCanon(path, (p) => learnHref(p, "en"), courseQuery(sp.course));
  return masterLessonMetadata(path, "en");
}

export default async function LearnMasterPage({ params, searchParams }: Props) {
  const [{ path }, sp] = await Promise.all([params, searchParams]);
  await redirectToTopicCanon(path, (p) => learnHref(p, "en"), courseQuery(sp.course));
  // COURSE-UX-1: ?course=<exam> shows the lesson inside that course (outline, previous / next); the canonical stays /learn
  return <MasterLessonPageView segments={path} language="en" courseSlug={typeof sp.course === "string" ? sp.course : null} />;
}
