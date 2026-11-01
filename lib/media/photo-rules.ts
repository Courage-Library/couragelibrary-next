/**
 * HOME-1 (129): the home page photo rules, shared by the browser (lib/media/photo-prepare.ts) and the server
 * (lib/media/photo-image.ts), and its public URLs. Pure; safe in client components.
 */
export const PHOTO_UPLOAD_MAX_BYTES = 1024 * 1024; // the payload actually sent (the browser resizes first)
export const PHOTO_SOURCE_MAX_BYTES = 15 * 1024 * 1024; // an original the browser will try to resize
export const PHOTO_MIN_WIDTH = 1280;
export const PHOTO_SEND_WIDTH = 1600; // the browser scales the original down to this before upload
export const PHOTO_WIDTHS = [1280, 768, 390] as const; // stored: <sha>.webp (1280), <sha>-768.webp, <sha>-390.webp
export const PHOTO_ACCEPT = "image/png,image/jpeg,image/webp";

const mb = (b: number) => `${(b / (1024 * 1024)).toFixed(1)} MB`;
export const PHOTO_MESSAGES = {
  notImage: "Only PNG, JPG or WebP photos can be used (SVG and other files are not accepted).",
  tooLarge: (b: number) => `File is ${mb(b)}; maximum is 1 MB. Resize the photo to 1600 px wide and try again.`,
  sourceTooLarge: (b: number) => `File is ${mb(b)}; the largest photo that can be resized here is 15 MB.`,
  tooNarrow: (w: number) => `The photo is ${w} px wide; it must be at least ${PHOTO_MIN_WIDTH} px wide.`,
  badRatio: "Use a landscape photo (between square and 3 : 1, wider than tall).",
  unreadable: "The photo could not be read. Export it again as JPG and try again.",
  unavailable: "The photo could not be processed, so nothing was saved. Try again later.",
  failed: "The photo could not be saved, so nothing was changed. Check your connection and try again.",
  altRequired: "Describe the photo for screen readers (3 to 200 characters).",
  facesRequired: "Confirm that no person can be recognised in the photo.",
} as const;

/** landscape-ish only: from square (1 : 1) to 3 : 1 */
export function photoRatioProblem(width: number, height: number): string | null {
  const r = width / height;
  return r < 1 || r > 3 ? PHOTO_MESSAGES.badRatio : null;
}

export interface HomePhoto {
  src: string;
  srcSet: string;
  alt: string;
  width: number;
  height: number;
}

const PATH_RE = /^site\/home_photo\/[0-9a-f]{64}\.webp$/;
/** same-origin URLs (LOGO-MEDIA-1 rewrite: /media/logos/<path> → the bucket); never the storage host in HTML */
export function homePhotoFrom(row: { path: string | null; alt: string; width: number; height: number } | null | undefined): HomePhoto | null {
  if (!row || !row.path || !PATH_RE.test(row.path) || !row.alt) return null;
  const base = `/media/logos/${row.path}`;
  const v = (w: number) => base.replace(/\.webp$/, `-${w}.webp`);
  return { src: base, srcSet: `${v(390)} 390w, ${v(768)} 768w, ${base} 1280w`, alt: row.alt, width: row.width, height: row.height };
}
