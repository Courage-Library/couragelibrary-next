import type { ReactNode } from "react";
import { BrandIcon } from "@/components/icons/brand-icon";
import type { BrandIconName } from "@/lib/icons/brand-icon-data";

/**
 * AUTH-UX-1 (spec §2) — THE layout of every auth page (sign in, create account, forgot / reset password, confirm),
 * under the visitor header and above the PublicFooter (no sign-up band on auth pages — FOOTER-1).
 *   ≥ 1024 px: 50 / 50 — the brand panel (band gradient, logo-mark watermark ≈ 12 % white, tagline, one sentence, three
 *              true features, "Free during early access." only while the paywall switch is KNOWN to be off) and the form
 *              column (max 400 px, vertically centred)
 *   < 1024 px: no brand panel; the form first, 20 px side padding
 * The features are static and true (owner decision 3 — no current-affairs read on auth pages, no daily-mock claim).
 */
export const AUTH_PANEL_FEATURES: ReadonlyArray<{ icon: BrandIconName; text: string }> = [
  { icon: "mocks", text: "Timed mock tests with full analysis" },
  { icon: "practice", text: "Practice by topic" },
  { icon: "mistake-vault", text: "Mistake Vault for smart revision" },
];
export const AUTH_PANEL_TAGLINE = "Learn smarter. Prepare independently.";
export const AUTH_PANEL_SENTENCE = "Prepare for government exams with mock tests, topic practice and a Mistake Vault that turns every wrong answer into revision.";
export const AUTH_EARLY_ACCESS = "Free during early access.";

export function AuthShell({ earlyAccess, children }: { earlyAccess: boolean; children: ReactNode }) {
  return (
    <div className="cl-auth" data-auth-shell="">
      <aside className="cl-auth__panel" aria-label="About Courage Library" data-auth-panel="">
        {/* decoration: the logo mark as a ≈ 12 % white watermark */}
        {/* eslint-disable-next-line @next/next/no-img-element -- a static decorative SVG of the logo suite */}
        <img className="cl-auth__mark" src="/brand/courage-library-logo-suite/svg/mark-mono-white.svg" alt="" aria-hidden="true" width={420} height={420} />
        <div className="cl-auth__panel-in">
          <p className="cl-auth__tag font-heading">{AUTH_PANEL_TAGLINE}</p>
          <p className="cl-auth__sentence">{AUTH_PANEL_SENTENCE}</p>
          <ul className="cl-auth__features">
            {AUTH_PANEL_FEATURES.map((f) => (
              <li key={f.icon} data-auth-feature={f.icon}>
                <BrandIcon name={f.icon} size={24} onBlue />
                <span>{f.text}</span>
              </li>
            ))}
          </ul>
          {earlyAccess && (
            <p className="cl-auth__note" data-auth-early-access="">
              {AUTH_EARLY_ACCESS}
            </p>
          )}
        </div>
      </aside>
      <div className="cl-auth__main">
        <div className="cl-auth__col">{children}</div>
      </div>
    </div>
  );
}
