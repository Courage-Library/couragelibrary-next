import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/auth/require-admin";
import { LessonAdminService } from "@/services/lessons/lesson-admin.service";
import { LessonEditor } from "@/components/admin/lessons/lesson-editor";

export const metadata: Metadata = { title: "Edit lesson", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminLessonEditPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ lang?: string }> }) {
  await requireAdminPage({ path: "/admin/lessons" }); // SEC-1C: first; admin only
  const { id } = await params;
  const { lang } = await searchParams;
  const language = lang === "hi" ? "hi" : "en";
  const r = await LessonAdminService.getEditor(id, language);
  if (!r.success && r.code === "NOT_FOUND") notFound();
  return <LessonEditor data={r.success ? r.data : null} loadError={r.success ? null : r.error} />;
}
