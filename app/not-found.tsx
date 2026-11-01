import { PublicShell } from "@/components/shell/public-shell";
import { NotFoundContent } from "@/components/errors/not-found-content";

/**
 * PERF-HOME-1: an unknown URL matches no route group, so the root layout (no shell since the split) renders this —
 * with the cookie-free public shell around it (header, footer).
 */
export default function NotFound() {
  return (
    <PublicShell>
      <NotFoundContent />
    </PublicShell>
  );
}
