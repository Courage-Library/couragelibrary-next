import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/auth/require-admin";
import { SyllabusIntakeService } from "@/services/syllabus/intake.service";
import { IntakeReview } from "@/components/admin/syllabus/intake-review";

export const metadata: Metadata = { title: "Review syllabus intake", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function SyllabusIntakeReviewPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage({ path: "/admin/syllabus/intake" }); // SEC-1C: first; admin only (decisions write the master tree)
  const { id } = await params;
  const r = await SyllabusIntakeService.get(id);
  if (!r.success && r.code === "NOT_FOUND") notFound();
  return r.success ? (
    <IntakeReview session={r.data.session} items={r.data.items} nodes={r.data.nodes} loadError={null} />
  ) : (
    <IntakeReview session={null} items={[]} nodes={[]} loadError={r.error} />
  );
}
