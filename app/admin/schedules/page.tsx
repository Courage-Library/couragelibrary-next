import React from "react";
import { AdminService } from "@/services/admin.service";
import { AdminSchedulesManager } from "@/components/admin/admin-schedules-manager";

export const revalidate = 0;

interface Props {
  searchParams: Promise<{ category?: string }>;
}

export default async function AdminSchedulesPage({ searchParams }: Props) {
  const params = await searchParams;
  const categoryFilter = params.category;

  const [schedules, categories, dailyProgramData] = await Promise.all([
    AdminService.getAdminSchedules(categoryFilter),
    AdminService.getAdminCategories(),
    AdminService.getAdminDailyMockProgram(categoryFilter),
  ]);

  return (
    <AdminSchedulesManager
      schedules={schedules}
      categories={categories}
      dailyProgramData={dailyProgramData}
      currentCategory={categoryFilter}
    />
  );
}
