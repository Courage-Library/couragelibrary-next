import { notFound } from "next/navigation";
import { AdminMfaPanel, type MfaPreview } from "@/components/admin/admin-mfa-panel";
import { MfaAccountRow } from "@/components/admin/mfa/mfa-account";
import { maskEmail } from "@/lib/auth/mfa-ui";

/**
 * ADMIN-MFA-UX-1 test fixture: the REAL /admin/mfa panel in fixed states for the local page checks and screenshots
 * (scripts/live/test_admin_mfa_ux1_pages.cjs) — WITHOUT any sign-in, session or Supabase call. Safety:
 *   - a route only in a build made with EXAM_UX_FIXTURE=1 (next.config pageExtensions) — never in a deployed build; and a
 *     404 on a production deployment anyway (defence in depth)
 *   - the panel's `preview` prop skips every Supabase call and makes every action inert; sign-out is an inert button
 *   - the "secret" is the public RFC 6238 / Google Authenticator documentation example, and the "QR" is a locally drawn
 *     decorative pattern (it encodes nothing) — no real factor, key or code exists anywhere in this page
 * ?view= setup-1 | setup-2 | setup-3 | setup-3-error | success | return | return-error | already
 */
export const dynamic = "force-dynamic";

const DOC_EXAMPLE_KEY = "JBSWY3DPEHPK3PXP"; // public documentation example, not a secret
const FAKE_FACTOR = "00000000-0000-4000-8000-00000000f1a0";

function fakeQr(): string {
  let seed = 7;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  let cells = "";
  for (let y = 0; y < 29; y++)
    for (let x = 0; x < 29; x++) {
      const finder = (x < 8 && y < 8) || (x > 20 && y < 8) || (x < 8 && y > 20);
      if (!finder && rnd() > 0.55) cells += `<rect x="${x}" y="${y}" width="1" height="1"/>`;
    }
  // no colour literals (BRAND-1 B-03): the SVG default fill draws the dark cells; a finder's light ring is an even-odd
  // hole that shows the image's own white background
  const f = (x: number, y: number) => `<path fill-rule="evenodd" d="M${x} ${y}h7v7h-7z M${x + 1} ${y + 1}v5h5v-5z"/><rect x="${x + 2}" y="${y + 2}" width="3" height="3"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 29 29">${cells}${f(0, 0)}${f(22, 0)}${f(0, 22)}</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

export default async function AdminMfaFixturePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (process.env.VERCEL_ENV === "production" || process.env.EXAM_UX_FIXTURE !== "1") notFound();
  const view = (await searchParams).view;
  const enrolment = { factorId: FAKE_FACTOR, qr: fakeQr(), secret: DOC_EXAMPLE_KEY };
  const previews: Record<string, MfaPreview> = {
    "setup-1": { stage: { kind: "install" } },
    "setup-2": { stage: { kind: "scan", ...enrolment } },
    "setup-3": { stage: { kind: "code", ...enrolment }, code: "4821" },
    "setup-3-error": { stage: { kind: "code", ...enrolment }, error: "wrong-code" },
    success: { stage: { kind: "success" } },
    return: { stage: { kind: "verify", factorId: FAKE_FACTOR } },
    "return-error": { stage: { kind: "verify", factorId: FAKE_FACTOR }, error: "rate-limited" },
    already: { stage: { kind: "already" } },
  };
  const preview = previews[typeof view === "string" ? view : ""];
  if (!preview) notFound();
  const masked = maskEmail("jane.fixture@example.test");
  return <AdminMfaPanel next="/admin" maskedEmail={masked} account={<MfaAccountRow masked={masked} inert />} helpHref="mailto:help@example.test" preview={preview} />;
}
