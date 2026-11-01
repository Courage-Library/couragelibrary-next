import type { Metadata } from "next";
import { requireAdminPage } from "@/lib/auth/require-admin";
import { listAdminCategories } from "@/lib/exams/category-admin";
import { CategoriesPanel } from "@/components/admin/exam-onboarding/categories-panel";

export const metadata: Metadata = { title: "Exam categories", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** HOME-1 (128): exam categories — staff read-only, admins edit (actions are admin-only). */
export default async function ExamCategoriesPage() {
  const viewer = await requireAdminPage({ allowStaff: true, path: "/admin/exams/categories" });
  const list = await listAdminCategories();
  if (!list.ok) {
    return (
      <p role="alert" className="rounded-card border border-danger-200 bg-danger-50 px-4 py-3 text-[13px] text-danger-800">
        The categories could not be loaded right now. Reload the page.
      </p>
    );
  }
  return <CategoriesPanel categories={list.data} canEdit={viewer.role === "admin"} />;
}
