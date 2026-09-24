import { redirect } from "next/navigation";

export const revalidate = 0;

interface Props {
  searchParams?: Promise<{ examId?: string; cycleId?: string }>;
}

export default async function AdminExamOnboardingPage({ searchParams }: Props) {
  const resolvedParams = searchParams ? await searchParams : {};
  if (resolvedParams.examId) {
    redirect(`/admin/exam-knowledge?examId=${resolvedParams.examId}${resolvedParams.cycleId ? `&cycleId=${resolvedParams.cycleId}` : ""}`);
  }
  redirect("/admin/exams");
}
