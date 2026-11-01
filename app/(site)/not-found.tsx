import { NotFoundContent } from "@/components/errors/not-found-content";

/** PERF-HOME-1: a notFound() in the session-shell group renders inside its AppShell. */
export default function SiteNotFound() {
  return <NotFoundContent />;
}
