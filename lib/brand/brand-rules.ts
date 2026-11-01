/**
 * HOME-1 brand settings (131): the brand image rules, shared by the admin panel (browser) and the server pipeline, and
 * the public URLs. Pure; safe in client components.
 * The official logo (public/images/logo.png → public/brand/, scripts/content/brand-defaults.cjs) is the DEFAULT; an
 * uploaded asset replaces it. The logo is a brand asset: never recoloured or redrawn (palette rules do not apply).
 */
export const BRAND_KEYS = ["brand_header_logo", "brand_square_mark", "brand_footer_logo"] as const;
export type BrandKey = (typeof BRAND_KEYS)[number];
export const isBrandKey = (v: unknown): v is BrandKey => typeof v === "string" && (BRAND_KEYS as readonly string[]).includes(v);

export const BRAND_UPLOAD_MAX_BYTES = 1024 * 1024;
export const BRAND_ACCEPT = "image/png,image/jpeg,image/webp";
export const ICON_SIZES = [32, 180, 192, 512] as const;
export type IconSize = (typeof ICON_SIZES)[number];

export const BRAND_SLOTS: Record<BrandKey, { title: string; help: string }> = {
  brand_header_logo: {
    title: "Header logo (horizontal)",
    help: "Shown in the site header and the menu instead of the official logo + name. Landscape, 2 : 1 to 8 : 1, at least 160 × 40 px.",
  },
  brand_square_mark: {
    title: "Square mark (favicon and app icons)",
    help: "Square, at least 512 × 512 px. Used for the browser tab icon, the phone home-screen icons and the share image.",
  },
  brand_footer_logo: {
    title: "Footer logo for the dark footer (optional)",
    help: "A light or white version for the navy footer. Without it, the official logo is shown on a small white plate.",
  },
};

export const BRAND_MESSAGES = {
  notImage: "Only PNG, JPG or WebP files can be used (SVG and other files are not accepted).",
  tooLarge: "The file is larger than 1 MB. Export it smaller and try again.",
  logoShape: "Use a landscape logo between 2 : 1 and 8 : 1, at least 160 px wide and 40 px tall.",
  markShape: "Use a square image (same width and height), at least 512 × 512 px.",
  unreadable: "The image could not be read. Export it again as PNG and try again.",
  unavailable: "The image could not be processed, so nothing was saved. Try again later.",
  failed: "The image could not be saved, so nothing was changed. Check your connection and try again.",
  altRequired: "Describe the logo for screen readers (3 to 120 characters), for example \"Courage Library\".",
} as const;

/** a brand image ready for <img>: src + 2x / 3x srcSet, the intrinsic size of the 1x copy, alt */
export interface BrandImage {
  src: string;
  srcSet: string;
  width: number;
  height: number;
  alt: string;
}

/** the official logo (repo default): the mark, 32 px tall (34 × 32); copies at 2x and 3x */
export const DEFAULT_MARK: BrandImage = {
  src: "/brand/mark-32.webp",
  srcSet: "/brand/mark-32.webp 1x, /brand/mark-64.webp 2x, /brand/mark-96.webp 3x",
  width: 34,
  height: 32,
  alt: "",
};

const PATH_RE: Record<BrandKey, RegExp> = {
  brand_header_logo: /^site\/brand_header_logo\/[0-9a-f]{64}\.webp$/,
  brand_square_mark: /^site\/brand_square_mark\/[0-9a-f]{64}\.png$/,
  brand_footer_logo: /^site\/brand_footer_logo\/[0-9a-f]{64}\.webp$/,
};

/** an uploaded logo row → a 32 px tall image (the stored main copy is 128 px tall, a 64 px copy sits next to it) */
export function brandLogoFrom(key: "brand_header_logo" | "brand_footer_logo", row: { path: string | null; alt: string; width: number; height: number } | null | undefined): BrandImage | null {
  if (!row || !row.path || !PATH_RE[key].test(row.path) || !row.alt || row.height <= 0) return null;
  const base = `/media/logos/${row.path}`;
  const h = 32;
  return { src: base.replace(/\.webp$/, "-64.webp"), srcSet: `${base.replace(/\.webp$/, "-64.webp")} 2x, ${base} 4x`, width: Math.round((row.width * h) / row.height), height: h, alt: row.alt };
}

/** the uploaded square mark's icon URL for a size, or null */
export function squareMarkUrl(row: { path: string | null } | null | undefined, size: IconSize): string | null {
  if (!row || !row.path || !PATH_RE.brand_square_mark.test(row.path)) return null;
  const base = `/media/logos/${row.path}`;
  return size === 512 ? base : base.replace(/\.png$/, `-${size}.png`);
}

export const defaultIconUrl = (size: IconSize) => `/brand/icon-${size}.png`;
