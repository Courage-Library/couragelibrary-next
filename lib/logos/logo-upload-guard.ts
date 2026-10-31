/**
 * LOGO-P0b / LOGO-UX-1 (2026-10-31): what the BROWSER checks before a logo is sent. Root cause of the production crash:
 * the upload Server Action's request body went over Next's 1 MB limit (413), the action call threw, and the throw reached
 * the admin error boundary. Now: the browser refuses a payload over 1 MB (nothing is sent), resizes originals to
 * 512 × 512 before upload, and every logo action call is wrapped (any failure = an inline "nothing was saved").
 * The server still sniffs, validates (1 MB, 256 px) and re-encodes — the trust boundary is unchanged. Pure.
 */
export const LOGO_UPLOAD_MAX_BYTES = 1024 * 1024; // the payload actually sent (= the server's file rule)
export const LOGO_SOURCE_MAX_BYTES = 10 * 1024 * 1024; // an original the browser will try to resize
export const LOGO_MIN_SIDE = 256;
export const LOGO_OUT_SIDE = 512;
export const LOGO_ACCEPT = "image/png,image/jpeg,image/webp";

export const formatMb = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
/** a size for display: KB under 1 MB (a resized logo is usually 20–300 KB), else MB */
export const formatSize = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : formatMb(bytes));

export const LOGO_MESSAGES = {
  notImage: "Only PNG, JPG or WebP images can be used (SVG and other files are not accepted).",
  tooLarge: (bytes: number) => `File is ${formatMb(bytes)}; maximum is 1 MB. Resize to 512×512 and try again.`,
  sourceTooLarge: (bytes: number) => `File is ${formatMb(bytes)}; the largest image that can be resized here is 10 MB. Resize to 512×512 and try again.`,
  tooSmall: (w: number, h: number) => `The image is ${w} × ${h} pixels; a logo must be at least ${LOGO_MIN_SIDE} × ${LOGO_MIN_SIDE}.`,
  unreadable: "The image could not be read. Export it again as PNG and try again.",
  failed: "The logo could not be saved, so nothing was changed. Check your connection and try again.",
  altRequired: "Alt text is required (3 to 160 characters).",
} as const;

/** The size rule for the bytes about to be SENT: null = fine. */
export function uploadSizeProblem(bytes: number): string | null {
  return bytes > LOGO_UPLOAD_MAX_BYTES ? LOGO_MESSAGES.tooLarge(bytes) : null;
}

export function altProblem(alt: string): string | null {
  const a = alt.trim();
  return a.length < 3 || a.length > 160 ? LOGO_MESSAGES.altRequired : null;
}

/** A body's slug, exactly as the server makes it (ExamOnboardingService.createConductingOrg). */
export const bodySlug = (name: string) => name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
