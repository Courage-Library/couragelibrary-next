import type { Metadata } from "next";
import { MasterLessonPageView, masterLessonMetadata } from "@/components/learning/master-lesson-page";

/** CA-6: the English master lesson page (canonical). /learn/topics/<id> (legacy entry) is a static route and wins. */
export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ path: string[] }>;
  searchParams: Promise<{ course?: string | string[] }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { path } = await params;
  return masterLessonMetadata(path, "en");
}

export default async function LearnMasterPage({ params, searchParams }: Props) {
  const [{ path }, sp] = await Promise.all([params, searchParams]);
  // COURSE-UX-1: ?course=<exam> shows the lesson inside that course (outline, previous / next); the canonical stays /learn
  return <MasterLessonPageView segments={path} language="en" courseSlug={typeof sp.course === "string" ? sp.course : null} />;
}
