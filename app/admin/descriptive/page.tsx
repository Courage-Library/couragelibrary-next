import React from "react";
import { AdminService } from "@/services/admin.service";
import { AdminDescriptiveManager } from "@/components/admin/admin-descriptive-manager";
import { requireAdminPage } from "@/lib/auth/require-admin";

export const dynamic = "force-dynamic";

export const revalidate = 0;

export default async function AdminDescriptivePage() {
  await requireAdminPage({ allowStaff: true, path: "/admin/descriptive" });
  const items = await AdminService.getAdminDescriptive();

  // TYPES-1:B-ADM-DESCRIPTIVE (tracked, owner Community) — the manager component's item type (DescriptiveItem (minWords, …) does not match descriptive_questions).
  // @ts-expect-error TYPES-1:B-ADM-DESCRIPTIVE — component/data shape mismatch (see above)
  return <AdminDescriptiveManager items={items} />;
}
