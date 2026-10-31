/**
 * EXAM-LOGO-1: which logo an exam shows, and where it lives. Pure; safe in client components.
 * The exam's own override (if any) wins, else its conducting body's logo, else null → the initials tile (legacy exams
 * only: new exams cannot be created without a logo, and a course cannot launch without one).
 */
export const LOGO_BUCKET = "org-logos";
export const LOGO_DISPLAY_SIZES = { xs: 28, sm: 32, md: 48, tile: 64, lg: 72 } as const; // xs admin rows, sm cards, md page headers, tile admin body cards

export interface LogoSource {
  path: string | null;
  alt: string | null;
}
export interface ExamLogoInput {
  override?: LogoSource | null;
  org?: (LogoSource & { name?: string | null }) | null;
}
export interface ExamLogo {
  src: string;
  alt: string;
}

/**
 * LOGO-MEDIA-1 (2026-10-31): the SAME-ORIGIN URL of a stored logo path (orgs/<id>/<sha256>.webp | exams/<id>/<sha256>.webp);
 * null for anything else. next.config rewrites LOGO_MEDIA_PREFIX/<path> to the org-logos bucket server-side, so public
 * HTML never names the storage host / project ref (GATE-HYGIENE-1: the anonymous smoke scans every page for it).
 */
export const LOGO_MEDIA_PREFIX = "/media/logos";
export function logoPublicUrl(path: string | null | undefined): string | null {
  if (!path || !/^(orgs|exams)\/[0-9a-f-]{36}\/[0-9a-f]{64}\.webp$/.test(path)) return null;
  return `${LOGO_MEDIA_PREFIX}/${path}`;
}

export function examLogo(input: ExamLogoInput): ExamLogo | null {
  for (const s of [input.override, input.org]) {
    const src = s && s.alt ? logoPublicUrl(s.path) : null;
    if (src && s?.alt) return { src, alt: s.alt };
  }
  return null;
}

/** Up to 3 capital initials of a body / exam name ("Staff Selection Commission" → "SSC"). */
export function logoInitials(name: string | null | undefined): string {
  const words = (name || "").replace(/[^A-Za-z0-9 ]/g, " ").split(/\s+/).filter((w) => w && !/^(of|and|the|for)$/i.test(w));
  return (words.length > 1 ? words.map((w) => w[0]) : [(words[0] || "?").slice(0, 3)]).join("").slice(0, 3).toUpperCase();
}

export const NOT_AFFILIATED = (body: string) => `Courage Library is an independent platform and is not affiliated with ${body}.`;
