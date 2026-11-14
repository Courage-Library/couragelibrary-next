import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/auth/require-admin";
import { SyllabusMapService } from "@/services/syllabus/map-intake.service";
import { MapReview } from "@/components/admin/syllabus/map-review";

export const metadata: Metadata = { title: "Review master / exam map", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function SyllabusMapReviewPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage({ path: "/admin/syllabus/map" }); // SEC-1C: first; admin only (decisions write the master tree)
  const { id } = await params;
  const r = await SyllabusMapService.get(id);
  if (!r.success && r.code === "NOT_FOUND") notFound();
  return r.success ? <MapReview session={r.data.session} items={r.data.items} loadError={null} /> : <MapReview session={null} items={[]} loadError={r.error} />;
}
