import React from "react";
import { requireAdminPage } from "@/lib/auth/require-admin";
import SyllabusReconciliationPage from "./syllabus-reconciliation-client";

export const dynamic = "force-dynamic";

/** SEC-1C: server wrapper — authorizes before the client view (and its data calls) is sent. */
export default async function SyllabusReconciliationPageRoute() {
  await requireAdminPage({ allowStaff: true, path: "/admin/syllabus-reconciliation" });
  return <SyllabusReconciliationPage />;
}
