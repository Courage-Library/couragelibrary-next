import type { Metadata } from "next";
import { requireAdminPage } from "@/lib/auth/require-admin";
import { DesignSystemPreview } from "@/components/admin/design-system/design-system-preview";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Design system | Courage Library Admin",
  robots: { index: false, follow: false },
};

/** UX-1a: design-system preview (tokens + every component state). Admin and staff; sample data only. */
export default async function DesignSystemPage() {
  await requireAdminPage({ allowStaff: true, path: "/admin/design-system" });
  return <DesignSystemPreview />;
}
