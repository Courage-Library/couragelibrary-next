import "./landing.css";

/**
 * LANDING-1 route group for "/" (English) and "/hi" (Hindi). Owner L1 / route groups: the landing page has its OWN
 * header and footer (components/landing-v1), so "/exams" and "/category/*" keep PublicShell unchanged.
 * PERF-HOME-1: like the public layout, this reads NO cookie, NO request header and no session — the pages stay
 * cached (ISR) and identical for every visitor. Signed-in links come from the pre-paint data-auth hint.
 */
export default function LandingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
