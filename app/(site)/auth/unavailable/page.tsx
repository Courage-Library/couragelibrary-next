import { SessionUnavailable } from "@/components/auth/session-unavailable";
import { sanitizeRedirectPath } from "@/lib/auth/safe-redirect";
import { constructMetadata } from "@/lib/seo/metadata";

export const metadata = constructMetadata({ title: "Connection problem", noIndex: true });

/**
 * AUTH-1 Stage 2a: where admin page guards send a visitor when the session could not be confirmed (Supabase
 * unreachable). It shows no data; "Try again" returns to the sanitized `next` (SEC-1D sanitizer, same origin only).
 */
export default async function SessionUnavailablePage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return <SessionUnavailable retryHref={sanitizeRedirectPath(next, "/")} />;
}
