import { redirect } from "next/navigation";

export const revalidate = 0;

export default async function AdminAiOnboardingPage() {
  redirect("/admin/exams");
}
