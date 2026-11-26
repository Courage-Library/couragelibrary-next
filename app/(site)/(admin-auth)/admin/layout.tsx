import React from "react";
import { AdminAuthFrame } from "@/components/admin/mfa/admin-auth-frame";

/**
 * ADMIN-MFA-LOOP-1: the shell for /admin/mfa ONLY. The enrol / verify page must render for an AAL1 admin / staff
 * session, so it cannot sit under app/(site)/admin/layout.tsx: that layout's guard requires AAL2 (ADMIN_MFA_REQUIRED on)
 * and redirected /admin/mfa to itself (ERR_TOO_MANY_REDIRECTS). This route group adds no URL segment — the URL stays
 * /admin/mfa. No guard and no admin data here: the page itself runs its own AAL1-permitting page guard first, and
 * this layout renders nothing that needs a session (no admin nav, no counts, no names).
 * ADMIN-MFA-UX-1: the frame is a plain logo bar (components/admin/mfa/admin-auth-frame.tsx).
 */
export default function AdminAuthLayout({ children }: { children: React.ReactNode }) {
  return <AdminAuthFrame>{children}</AdminAuthFrame>;
}
