import type { Metadata } from "next";
import { AdminAuthFrame } from "@/components/admin/mfa/admin-auth-frame";

/**
 * ADMIN-MFA-UX-1 test fixture group — exists ONLY in a build made with EXAM_UX_FIXTURE=1 (next.config pageExtensions);
 * never in a deployed build. Mirrors /admin/mfa: no site header or footer, the same logo-bar frame, one <main>.
 */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function MfaFixtureLayout({ children }: { children: React.ReactNode }) {
  return (
    <main id="main-content" tabIndex={-1} className="min-h-dvh flex-1 outline-none" data-mfa-fixture="">
      <AdminAuthFrame>{children}</AdminAuthFrame>
    </main>
  );
}
