/**
 * LOGO-UX-1: browser-side preparation of a logo BEFORE upload — sniff the bytes (PNG / JPEG / WebP only), decode with
 * the EXIF orientation applied, refuse under 256 px, pad onto a transparent 512 × 512 square and encode (WebP, PNG when
 * the browser cannot encode WebP). The result is small (typically < 200 KB), so an oversize original never reaches the
 * request limit. The server re-checks and re-encodes everything; this only keeps the payload small and the errors early.
 */
import { sniffLogoFormat } from "@/lib/logos/logo-sniff";
import { LOGO_MESSAGES, LOGO_MIN_SIDE, LOGO_OUT_SIDE, LOGO_SOURCE_MAX_BYTES, uploadSizeProblem } from "@/lib/logos/logo-upload-guard";

export type PreparedLogo = { ok: true; blob: Blob; previewUrl: string; bytes: number; sourceBytes: number; sourceWidth: number; sourceHeight: number } | { ok: false; message: string };

const toBlob = (canvas: HTMLCanvasElement, type: string) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.92));

export async function prepareLogo(file: File): Promise<PreparedLogo> {
  if (!file || file.size === 0) return { ok: false, message: LOGO_MESSAGES.notImage };
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (!sniffLogoFormat(head)) return { ok: false, message: LOGO_MESSAGES.notImage };
  if (file.size > LOGO_SOURCE_MAX_BYTES) return { ok: false, message: LOGO_MESSAGES.sourceTooLarge(file.size) };
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return { ok: false, message: LOGO_MESSAGES.unreadable };
  }
  try {
    const { width: w, height: h } = bitmap;
    if (w < LOGO_MIN_SIDE || h < LOGO_MIN_SIDE) return { ok: false, message: LOGO_MESSAGES.tooSmall(w, h) };
    const canvas = document.createElement("canvas");
    canvas.width = LOGO_OUT_SIDE;
    canvas.height = LOGO_OUT_SIDE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return { ok: false, message: LOGO_MESSAGES.unreadable };
    const scale = Math.min(LOGO_OUT_SIDE / w, LOGO_OUT_SIDE / h);
    const dw = Math.round(w * scale);
    const dh = Math.round(h * scale);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, Math.round((LOGO_OUT_SIDE - dw) / 2), Math.round((LOGO_OUT_SIDE - dh) / 2), dw, dh);
    let blob = await toBlob(canvas, "image/webp");
    if (!blob || blob.type !== "image/webp") blob = await toBlob(canvas, "image/png");
    if (!blob) return { ok: false, message: LOGO_MESSAGES.unreadable };
    const tooBig = uploadSizeProblem(blob.size);
    if (tooBig) return { ok: false, message: tooBig };
    return { ok: true, blob, previewUrl: URL.createObjectURL(blob), bytes: blob.size, sourceBytes: file.size, sourceWidth: w, sourceHeight: h };
  } finally {
    bitmap.close();
  }
}
