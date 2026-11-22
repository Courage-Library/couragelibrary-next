import type { Metadata } from "next";

/**
 * RESULT-UX-1 test fixture group — exists ONLY in a build made with EXAM_UX_FIXTURE=1 (next.config pageExtensions); never
 * in a deployed build. The page renders THE student shell itself (fake account, no session), so no extra wrapper here.
 */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function ResultFixtureLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
