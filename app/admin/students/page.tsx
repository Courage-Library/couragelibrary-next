import React from "react";
import { AdminUsersManager } from "@/components/admin/admin-users-manager";
import { requireAdminPage } from "@/lib/auth/require-admin";
import { listDirectoryUsers } from "@/lib/admin/users-directory";
import { parseEmailQuery, parsePage } from "@/lib/admin/users-directory-core";

export const dynamic = "force-dynamic";

export const revalidate = 0;

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<{ page?: string; q?: string }> }) {
  await requireAdminPage({ path: "/admin/students" }); // SEC-1C: admin only
  const sp = await searchParams;
  // D-2: service-role directory (server-only), real paging + server email search; only plain rows reach the client
  const data = await listDirectoryUsers({ page: parsePage(sp.page), query: parseEmailQuery(sp.q) });

  return <AdminUsersManager {...data} />;
}
