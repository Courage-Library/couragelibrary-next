import React from "react";
import { AssessmentService } from "@/services/assessment.service";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { constructMetadata } from "@/lib/seo/metadata";
import { MockTestDashboardView } from "@/components/assessment/mock-test-dashboard-view";

export const revalidate = 0;

export const metadata = constructMetadata({
  title: "Mock Tests & Daily Practice Command Center",
  description:
    "Daily sectional tests, weekly mixed drills, full-length national mocks, and personalized multi-exam performance tracking.",
});

interface Props {
  searchParams: Promise<{ category?: string }>;
}

export default async function MockTestsDirectoryPage({ searchParams }: Props) {
  const params = await searchParams;
  const categorySlug = params.category;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const dashboardData = await AssessmentService.getStudentMockDashboardData(
    categorySlug,
    user?.id
  );

  return <MockTestDashboardView data={dashboardData} />;
}