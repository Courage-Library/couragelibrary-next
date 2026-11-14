import type { Metadata } from "next";
import { requireAdminPage } from "@/lib/auth/require-admin";
import { SyllabusMapService } from "@/services/syllabus/map-intake.service";
import { MapIntake } from "@/components/admin/syllabus/map-intake";

export const metadata: Metadata = { title: "Master tree & exam maps", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** SYLLABUS-MAP-1 B2: paste a MASTER_INTAKE or an EXAM_MAP file; recent files. */
export default async function SyllabusMapPage() {
  await requireAdminPage({ path: "/admin/syllabus/map" }); // admin only: decisions write the master tree (owner Q5)
  const r = await SyllabusMapService.list();
  return <MapIntake sessions={r.success ? r.data : []} loadError={r.success ? null : r.error} />;
}
