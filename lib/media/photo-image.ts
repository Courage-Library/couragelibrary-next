import "server-only";
import { createHash } from "node:crypto";
import { loadSharp } from "@/lib/logos/logo-image";
import { sniffLogoFormat } from "@/lib/logos/logo-sniff";
import { PHOTO_MESSAGES, PHOTO_MIN_WIDTH, PHOTO_UPLOAD_MAX_BYTES, PHOTO_WIDTHS, photoRatioProblem } from "@/lib/media/photo-rules";

/**
 * HOME-1 (129): the ONLY way an image becomes the home page photo. Same trust rules as logos (lib/logos/logo-image.ts):
 * content-sniffed PNG / JPEG / WebP only (no SVG), ≤ 1 MB in (the browser resizes first), sharp loaded lazily, EXIF
 * orientation applied, every metadata chunk dropped, re-encoded. A photo keeps its aspect ratio (landscape-ish, see
 * photoRatioProblem) and is stored at 1280 px wide plus 768 / 390 px copies (one per breakpoint); the name is the
 * content hash of the 1280 px output.
 */
export type PhotoResult =
  | { ok: true; main: Buffer; sha256: string; width: number; height: number; variants: Record<768 | 390, Buffer> }
  | { ok: false; message: string };

export async function processHomePhoto(input: Buffer): Promise<PhotoResult> {
  if (!input.length) return { ok: false, message: PHOTO_MESSAGES.notImage };
  if (input.length > PHOTO_UPLOAD_MAX_BYTES) return { ok: false, message: PHOTO_MESSAGES.tooLarge(input.length) };
  const fmt = sniffLogoFormat(input);
  if (!fmt) return { ok: false, message: PHOTO_MESSAGES.notImage };
  let sharp;
  try {
    sharp = await loadSharp();
  } catch {
    return { ok: false, message: PHOTO_MESSAGES.unavailable };
  }
  try {
    const meta = await sharp(input, { failOn: "error", limitInputPixels: 25_000_000 }).metadata();
    if (meta.format !== fmt || !meta.width || !meta.height) return { ok: false, message: PHOTO_MESSAGES.notImage };
    const w = meta.orientation && meta.orientation >= 5 ? meta.height : meta.width;
    const h = meta.orientation && meta.orientation >= 5 ? meta.width : meta.height;
    if (w < PHOTO_MIN_WIDTH) return { ok: false, message: PHOTO_MESSAGES.tooNarrow(w) };
    const ratio = photoRatioProblem(w, h);
    if (ratio) return { ok: false, message: ratio };
    const at = (width: number) => sharp(input, { failOn: "error", limitInputPixels: 25_000_000 }).rotate().resize({ width, withoutEnlargement: true }).webp({ quality: 80, effort: 4 }).toBuffer({ resolveWithObject: true });
    const main = await at(PHOTO_WIDTHS[0]);
    const [m768, m390] = await Promise.all([at(768), at(390)]);
    return {
      ok: true,
      main: main.data,
      sha256: createHash("sha256").update(main.data).digest("hex"),
      width: main.info.width,
      height: main.info.height,
      variants: { 768: m768.data, 390: m390.data },
    };
  } catch {
    return { ok: false, message: PHOTO_MESSAGES.unreadable };
  }
}
