import type { Metadata } from "next";

/**
 * EXAM-UX-1 test fixture group — exists ONLY in a build made with EXAM_UX_FIXTURE=1 (next.config pageExtensions); never
 * in a deployed build. Mirrors NAV-1 exam focus: no site header, no student shell, no footer — only <main>.
 */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function FixtureLayout({ children }: { children: React.ReactNode }) {
  return (
    <main id="main-content" tabIndex={-1} className="min-h-dvh flex-1 outline-none" data-exam-focus="" data-exam-fixture="">
      {children}
    </main>
  );
}
