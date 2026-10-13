import { redirect } from "next/navigation";
import { requireAdminPage } from "@/lib/auth/require-admin";

export const dynamic = "force-dynamic";

export const revalidate = 0;

export default async function AdminAiOnboardingPage() {
  await requireAdminPage({ allowStaff: true, path: "/admin/exams/ai-onboarding" });
  redirect("/admin/exams");
}
