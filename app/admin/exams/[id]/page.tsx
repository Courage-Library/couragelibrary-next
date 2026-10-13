import { redirect } from "next/navigation";
import { requireAdminPage } from "@/lib/auth/require-admin";

interface Props {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

export default async function AdminExamDetailPage({ params }: Props) {
  await requireAdminPage({ allowStaff: true, path: "/admin/exams" });
  const resolvedParams = await params;
  const examId = resolvedParams.id;
  redirect(`/admin/exams/onboarding?examId=${examId}`);
}
