import React from "react";
import { requireAdminPage } from "@/lib/auth/require-admin";
import AdminCurrentAffairsStudioPage from "./current-affairs-studio-client";

export const dynamic = "force-dynamic";

/** SEC-1C: server wrapper — authorizes before the client view (and its data calls) is sent. */
const CA_STATUSES = ["DRAFT", "IN_REVIEW", "APPROVED", "COMPILED", "PUBLISHED", "ARCHIVED"];

export default async function AdminCurrentAffairsStudioPageRoute({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireAdminPage({ allowStaff: true, path: "/admin/current-affairs" });
  const sp = await searchParams;
  // ADMIN-UX-1 phase B: Today deep link (?status=IN_REVIEW) — initial filter only, known values only
  const initialStatus = CA_STATUSES.includes(String(sp.status)) ? String(sp.status) : "ALL";
  return <AdminCurrentAffairsStudioPage initialStatus={initialStatus} />;
}
