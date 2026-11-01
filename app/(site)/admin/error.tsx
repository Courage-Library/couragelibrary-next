"use client";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/**
 * ADMIN-UX-1 phase B: admin route error state — an outage is shown as an error with Retry, never as "no data".
 * No error details are shown (they may contain internals); the server log has them.
 */
export default function AdminError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex max-w-xl flex-col gap-4">
      <Alert tone="danger" title="This page could not be loaded">
        Something went wrong while loading this admin page. Nothing was changed.
      </Alert>
      <div>
        <Button size="lg" onClick={reset}>
          Try again
        </Button>
      </div>
    </div>
  );
}
