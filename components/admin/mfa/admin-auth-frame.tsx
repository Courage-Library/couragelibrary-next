import type { ReactNode } from "react";
import { BrandLogo } from "@/components/brand/logo";

/**
 * ADMIN-MFA-UX-1 (spec §1) — the frame of /admin/mfa: a plain logo bar (the site shell shows no header on /admin paths)
 * above the page. Shared by app/(site)/(admin-auth)/admin/layout.tsx and the local fixture, so screenshots show the real
 * chrome. No session, no admin data. Replaces the old back-to-studio link, which only looped back to /admin/mfa.
 */
export function AdminAuthFrame({ children }: { children: ReactNode }) {
  return (
    // BRAND-2 (#72): admin is a "never glass" zone, as in the admin shell
    <div data-admin-auth="" data-no-glass="" className="min-h-dvh w-full bg-cl-white text-cl-charcoal antialiased">
      <div className="flex h-16 items-center border-b border-cl-line px-4 sm:px-6" data-mfa-topbar="">
        <BrandLogo href="/" size="sm" />
      </div>
      {children}
    </div>
  );
}
