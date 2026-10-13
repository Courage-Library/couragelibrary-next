import React from "react";
import { requireAdminPage } from "@/lib/auth/require-admin";
import AdminCurrentAffairsStudioPage from "./current-affairs-studio-client";

export const dynamic = "force-dynamic";

/** SEC-1C: server wrapper — authorizes before the client view (and its data calls) is sent. */
export default async function AdminCurrentAffairsStudioPageRoute() {
  await requireAdminPage({ allowStaff: true, path: "/admin/current-affairs" });
  return <AdminCurrentAffairsStudioPage />;
}
