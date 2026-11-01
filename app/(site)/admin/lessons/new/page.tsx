import type { Metadata } from "next";
import { requireAdminPage } from "@/lib/auth/require-admin";
import { LessonAuthoringService } from "@/services/lessons/lesson-authoring.service";
import { LessonGenerator } from "@/components/admin/lessons/lesson-generator";

export const metadata: Metadata = { title: "Lesson prompt generator", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** CA-4: pick a node → the LESSON prompt with its exam coverage → paste the answer → checklist → English draft. */
export default async function LessonGeneratePage({ searchParams }: { searchParams: Promise<{ node?: string }> }) {
  await requireAdminPage({ path: "/admin/lessons" }); // SEC-1C: first; admin only
  const { node } = await searchParams;
  const [nodes, generator] = await Promise.all([LessonAuthoringService.listNodes(), node ? LessonAuthoringService.generator(node) : Promise.resolve(null)]);
  return (
    <LessonGenerator
      nodes={nodes.success ? nodes.data : []}
      selectedNodeId={node && generator?.success ? node : null}
      generator={generator && generator.success ? generator.data : null}
      loadError={!nodes.success ? nodes.error : generator && !generator.success ? generator.error : null}
      subjectMissing={generator && !generator.success && generator.code === "SUBJECT_TYPE_MISSING" ? { subjectName: generator.subjectName ?? null } : null}
    />
  );
}
