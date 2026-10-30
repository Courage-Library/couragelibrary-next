import "server-only";
import { createHash } from "node:crypto";
import sharp from "sharp";

/**
 * EXAM-LOGO-1: the ONLY way an image becomes a logo. Content-sniffed (never the extension or the browser's type),
 * PNG / JPEG / WebP only — NO SVG (script risk); HTML or SVG renamed to .png is refused by its bytes before sharp ever
 * parses it. At most 1 MB in, at least 256 × 256. Re-encoded server-side: EXIF orientation applied, padded to a
 * transparent square, 512 × 512 WebP, every metadata chunk dropped (sharp keeps none unless asked). The stored name is
 * the content hash of the OUTPUT, so a path always names exactly one image.
 */
export const LOGO_MAX_BYTES = 1024 * 1024;
export const LOGO_MIN_SIDE = 256;
export const LOGO_OUT_SIDE = 512;
const LOGO_MAX_PIXELS = 25_000_000; // decompression-bomb guard

export type LogoFormat = "png" | "jpeg" | "webp";
export type LogoResult =
  | { ok: true; webp: Buffer; sha256: string; inFormat: LogoFormat; inWidth: number; inHeight: number }
  | { ok: false; code: "EMPTY" | "TOO_LARGE" | "NOT_AN_IMAGE" | "TOO_SMALL" | "UNREADABLE"; message: string };

/** The format named by the first bytes, or null (SVG / HTML / anything else). */
export function sniffLogoFormat(b: Uint8Array): LogoFormat | null {
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "webp";
  return null;
}

export async function processLogo(input: Buffer): Promise<LogoResult> {
  if (!input.length) return { ok: false, code: "EMPTY", message: "Choose an image file." };
  if (input.length > LOGO_MAX_BYTES) return { ok: false, code: "TOO_LARGE", message: "The logo must be at most 1 MB." };
  const fmt = sniffLogoFormat(input);
  if (!fmt) return { ok: false, code: "NOT_AN_IMAGE", message: "Upload a PNG, JPG or WebP image (SVG and other files are not accepted)." };
  try {
    const meta = await sharp(input, { failOn: "error", limitInputPixels: LOGO_MAX_PIXELS }).metadata();
    // the decoder must agree with the bytes (a PNG header on another format is refused)
    if (meta.format !== fmt || !meta.width || !meta.height) return { ok: false, code: "NOT_AN_IMAGE", message: "Upload a PNG, JPG or WebP image (SVG and other files are not accepted)." };
    const oriented = meta.orientation && meta.orientation >= 5 ? { w: meta.height, h: meta.width } : { w: meta.width, h: meta.height };
    if (oriented.w < LOGO_MIN_SIDE || oriented.h < LOGO_MIN_SIDE) return { ok: false, code: "TOO_SMALL", message: `The logo must be at least ${LOGO_MIN_SIDE} × ${LOGO_MIN_SIDE} pixels.` };
    const webp = await sharp(input, { failOn: "error", limitInputPixels: LOGO_MAX_PIXELS })
      .rotate()
      .resize(LOGO_OUT_SIDE, LOGO_OUT_SIDE, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .webp({ quality: 90, effort: 4 })
      .toBuffer();
    return { ok: true, webp, sha256: createHash("sha256").update(webp).digest("hex"), inFormat: fmt, inWidth: oriented.w, inHeight: oriented.h };
  } catch {
    return { ok: false, code: "UNREADABLE", message: "The image could not be read. Export it again as PNG and retry." };
  }
}
