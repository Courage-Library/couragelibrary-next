import { redirect } from "next/navigation";
import { requireAdminPage } from "@/lib/auth/require-admin";

export const dynamic = "force-dynamic";

/** F2 (#79): question reports are admin-only and live at /admin/question-reports (this old address redirects). */
export default async function AdminReportsPage() {
  await requireAdminPage({ path: "/admin/reports" });
  redirect("/admin/question-reports");
}
