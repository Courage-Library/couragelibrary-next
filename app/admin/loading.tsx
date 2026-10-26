import { PageLoading } from "@/components/shell/page-loading";

/** ADMIN-UX-1 phase B: admin route loading state — the shared design-system PageLoading (UX-2a #48). */
export default function AdminLoading() {
  return <PageLoading label="Loading admin page" />;
}
