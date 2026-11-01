"use client";

import { ErrorContent } from "@/components/errors/error-content";

/* errors in the root layout's own children (no route group) */
export default function ErrorBoundary(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorContent {...props} />;
}
