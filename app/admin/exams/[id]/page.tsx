import { redirect } from "next/navigation";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function AdminExamDetailPage({ params }: Props) {
  const resolvedParams = await params;
  const examId = resolvedParams.id;
  redirect(`/admin/exams/onboarding?examId=${examId}`);
}
