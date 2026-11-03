import type { Metadata } from "next";
import { MasterLessonPageView, masterLessonMetadata } from "@/components/learning/master-lesson-page";

/** CA-6: the Hindi master lesson page — Hindi when published; otherwise English, noindex, canonical → /learn/… */
export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ path: string[] }>;
  searchParams: Promise<{ course?: string | string[] }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { path } = await params;
  return masterLessonMetadata(path, "hi");
}

export default async function HindiLearnMasterPage({ params, searchParams }: Props) {
  const [{ path }, sp] = await Promise.all([params, searchParams]);
  // COURSE-UX-1: ?course=<exam> shows the lesson inside that course (outline, previous / next); the canonical stays /learn
  return <MasterLessonPageView segments={path} language="hi" courseSlug={typeof sp.course === "string" ? sp.course : null} />;
}
