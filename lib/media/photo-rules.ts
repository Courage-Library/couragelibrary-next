/**
 * HOME-1 (129 → 130): the library photo rules, shared by the browser (lib/media/photo-prepare.ts) and the server
 * (lib/media/photo-image.ts), and the gallery's public URLs. Pure; safe in client components.
 * 130 (design upgrade, "honest images"): up to 6 real library photos, ordered, each with alt text and the basis on which
 * people may appear (no recognisable person, or written consent obtained).
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
  facesRequired: "Confirm that no person can be recognised, or that everyone who can be recognised gave written consent.",
  galleryFull: "The gallery already has 6 photos. Remove one first.",
  duplicate: "This photo is already in the gallery.",
} as const;

export const GALLERY_MAX = 6;
/** stored in site_gallery.people_basis (130); the admin must choose one for every photo */
export const PEOPLE_BASIS = {
  NO_RECOGNISABLE_PERSON: "No person can be recognised in this photo",
  WRITTEN_CONSENT: "Everyone who can be recognised gave written consent",
} as const;
export type PeopleBasis = keyof typeof PEOPLE_BASIS;
export const isPeopleBasis = (v: unknown): v is PeopleBasis => typeof v === "string" && Object.prototype.hasOwnProperty.call(PEOPLE_BASIS, v);

/** landscape-ish only: from square (1 : 1) to 3 : 1 */
export function photoRatioProblem(width: number, height: number): string | null {
  const r = width / height;
  return r < 1 || r > 3 ? PHOTO_MESSAGES.badRatio : null;
}

export interface GalleryPhoto {
  id: string;
  position: number;
  src: string;
  srcSet: string;
  alt: string;
  width: number;
  height: number;
  peopleBasis: PeopleBasis;
}

const PATH_RE = /^site\/gallery\/[0-9a-f]{64}\.webp$/;
type GalleryRow = { id: string; position: number; path: string | null; alt: string; width: number; height: number; people_basis: string };
/** same-origin URLs (LOGO-MEDIA-1 rewrite: /media/logos/<path> → the bucket); never the storage host in HTML */
export function galleryPhotoFrom(row: GalleryRow | null | undefined): GalleryPhoto | null {
  if (!row || !row.path || !PATH_RE.test(row.path) || !row.alt || !isPeopleBasis(row.people_basis)) return null;
  const base = `/media/logos/${row.path}`;
  const v = (w: number) => base.replace(/\.webp$/, `-${w}.webp`);
  return {
    id: row.id,
    position: row.position,
    src: base,
    srcSet: `${v(390)} 390w, ${v(768)} 768w, ${base} 1280w`,
    alt: row.alt,
    width: row.width,
    height: row.height,
    peopleBasis: row.people_basis,
  };
}
