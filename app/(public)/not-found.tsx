import { NotFoundContent } from "@/components/errors/not-found-content";

/** PERF-HOME-1: a notFound() in the cached public group renders inside its cookie-free shell. */
export default function PublicNotFound() {
  return <NotFoundContent />;
}
