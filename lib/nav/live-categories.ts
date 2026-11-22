import "server-only";
import { loadLandingLiveData, type LandingLiveData } from "@/lib/landing/landing-page-data";

/**
 * NAV-1: the Exams menu's live data — the same cached public read as the landing cards, BOUNDED: it never rejects and
 * gives up after `ms` (Supabase slow or hanging → every tile "Coming soon", no link), so no page ever waits on it
 * (AUTH1-RESILIENCE-HANG). Never the service role, no cookie, no request header.
 */
export const NAV_LIVE_TIMEOUT_MS = 800;

export function loadNavLive(ms: number = NAV_LIVE_TIMEOUT_MS): Promise<LandingLiveData | null> {
  return Promise.race([
    loadLandingLiveData().catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}
