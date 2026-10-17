import { PageLoading } from "@/components/shell/page-loading";

// UX-2a.1 (#48): segment loading UI (replaces the removed root app/loading.tsx for this signed-in route).
export default function Loading() {
  return <PageLoading />;
}
