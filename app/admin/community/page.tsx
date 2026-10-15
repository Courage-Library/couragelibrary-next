import React from "react";
import { AdminService } from "@/services/admin.service";
import { AdminCommunityManager } from "@/components/admin/admin-community-manager";
import { requireAdminPage } from "@/lib/auth/require-admin";

export const dynamic = "force-dynamic";

export const revalidate = 0;

export default async function AdminCommunityPage() {
  await requireAdminPage({ allowStaff: true, path: "/admin/community" });
  const flags = await AdminService.getAdminCommunityFlags();

  // TYPES-1:B-ADM-COMMUNITY (tracked, owner Community) — the manager component's item type (ModerationFlagItem expects fields discussion_moderation_flags does not have).
  // @ts-expect-error TYPES-1:B-ADM-COMMUNITY — component/data shape mismatch (see above)
  return <AdminCommunityManager flags={flags} />;
}
