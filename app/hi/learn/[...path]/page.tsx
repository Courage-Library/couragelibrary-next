import type { Metadata } from "next";
import { MasterLessonPageView, masterLessonMetadata } from "@/components/learning/master-lesson-page";

/** CA-6: the Hindi master lesson page — Hindi when published; otherwise English, noindex, canonical → /learn/… */
export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ path: string[] }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { path } = await params;
  return masterLessonMetadata(path, "hi");
}

export default async function HindiLearnMasterPage({ params }: Props) {
  const { path } = await params;
  return <MasterLessonPageView segments={path} language="hi" />;
}
