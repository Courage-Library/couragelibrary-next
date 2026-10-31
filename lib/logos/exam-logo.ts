/**
 * EXAM-LOGO-1: which logo an exam shows, and where it lives. Pure; safe in client components.
 * The exam's own override (if any) wins, else its conducting body's logo, else null → the initials tile (legacy exams
 * only: new exams cannot be created without a logo, and a course cannot launch without one).
 */
export const LOGO_BUCKET = "org-logos";
export const LOGO_DISPLAY_SIZES = { xs: 28, sm: 32, md: 48, lg: 72 } as const; // xs admin rows, sm cards, md page headers

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

/** The public URL of a stored logo path (orgs/<id>/<sha256>.webp | exams/<id>/<sha256>.webp); null for anything else. */
export function logoPublicUrl(path: string | null | undefined, supabaseUrl: string | undefined = process.env.NEXT_PUBLIC_SUPABASE_URL): string | null {
  if (!path || !supabaseUrl || !/^(orgs|exams)\/[0-9a-f-]{36}\/[0-9a-f]{64}\.webp$/.test(path)) return null;
  return `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/${LOGO_BUCKET}/${path}`;
}

export function examLogo(input: ExamLogoInput, supabaseUrl?: string): ExamLogo | null {
  for (const s of [input.override, input.org]) {
    const src = s && s.alt ? logoPublicUrl(s.path, supabaseUrl) : null;
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
