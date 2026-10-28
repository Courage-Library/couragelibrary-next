import type { Metadata } from "next";
import { MasterLessonPageView, masterLessonMetadata } from "@/components/learning/master-lesson-page";

/** CA-6: the English master lesson page (canonical). /learn/topics/<id> (legacy entry) is a static route and wins. */
export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ path: string[] }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { path } = await params;
  return masterLessonMetadata(path, "en");
}

export default async function LearnMasterPage({ params }: Props) {
  const { path } = await params;
  return <MasterLessonPageView segments={path} language="en" />;
}
