import { Container } from "@/components/ui/layout";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * UX-2a.1 (#48): segment loading UI for signed-in, data-heavy routes (the root app/loading.tsx was removed so
 * public pages paint their static content immediately). Design-system skeleton only; sized like a page header +
 * a card grid so the swap to real content stays stable (CLS).
 */
export function PageLoading({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" aria-busy="true" aria-label={label} className="py-8 lg:py-12">
      <Container className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-8 w-64 max-w-full" />
          <Skeleton shape="text" lines={2} className="max-w-xl" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-36 rounded-card" />
          <Skeleton className="h-36 rounded-card" />
          <Skeleton className="h-36 rounded-card" />
        </div>
        <Skeleton className="h-64 rounded-card" />
      </Container>
    </div>
  );
}
