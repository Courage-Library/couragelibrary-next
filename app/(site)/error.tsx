"use client";

import { ErrorContent } from "@/components/errors/error-content";

/* PERF-HOME-1: the error boundary inside the group, so an error keeps the header and footer */
export default function ErrorBoundary(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorContent {...props} />;
}
