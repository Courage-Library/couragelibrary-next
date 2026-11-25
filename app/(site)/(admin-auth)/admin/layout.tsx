import React from "react";
import Link from "next/link";

/**
 * ADMIN-MFA-LOOP-1: the shell for /admin/mfa ONLY. The enrol / verify page must render for an AAL1 admin / staff
 * session, so it cannot sit under app/(site)/admin/layout.tsx: that layout's guard requires AAL2 (ADMIN_MFA_REQUIRED on)
 * and redirected /admin/mfa to itself (ERR_TOO_MANY_REDIRECTS). This route group adds no URL segment — the URL stays
 * /admin/mfa. No guard and no admin data here: the page itself runs its own AAL1-permitting page guard first, and
 * this layout renders nothing that needs a session (no admin nav, no counts, no names).
 */
export default function AdminAuthLayout({ children }: { children: React.ReactNode }) {
  return (
    // BRAND-2 (#72): admin is a "never glass" zone, as in the admin shell
    <div data-admin-auth="" data-no-glass="" className="min-h-dvh w-full bg-canvas text-fg antialiased">
      <div className="mx-auto w-full max-w-xl px-4 pt-4">
        <Link href="/admin" className="text-body-sm font-semibold text-primary-700 focus-ring">
          ← Admin studio
        </Link>
      </div>
      {children}
    </div>
  );
}
