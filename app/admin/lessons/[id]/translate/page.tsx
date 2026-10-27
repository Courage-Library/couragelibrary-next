import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/auth/require-admin";
import { LessonAuthoringService } from "@/services/lessons/lesson-authoring.service";
import { LessonTranslation } from "@/components/admin/lessons/lesson-translation";

export const metadata: Metadata = { title: "Lesson translation", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** CA-4: the published English lesson → the TRANSLATE_HI prompt → paste → parity → draft → EN | HI review → publish. */
export default async function LessonTranslatePage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage({ path: "/admin/lessons" }); // SEC-1C: first; admin only
  const { id } = await params;
  const r = await LessonAuthoringService.translation(id);
  if (!r.success && r.code === "NOT_FOUND") notFound();
  return <LessonTranslation data={r.success ? r.data : null} loadError={r.success ? null : r.error} />;
}
