/**
 * HOME-1: browser-side preparation of the home page photo BEFORE upload — sniff (PNG / JPEG / WebP only), decode with
 * EXIF orientation, check width ≥ 1280 and a landscape ratio, scale down to 1600 px wide and encode WebP (JPEG when the
 * browser cannot encode WebP), so the request stays under 1 MB. The server re-checks and re-encodes everything.
 */
import { sniffLogoFormat } from "@/lib/logos/logo-sniff";
import { PHOTO_MESSAGES, PHOTO_MIN_WIDTH, PHOTO_SEND_WIDTH, PHOTO_SOURCE_MAX_BYTES, PHOTO_UPLOAD_MAX_BYTES, photoRatioProblem } from "@/lib/media/photo-rules";

export type PreparedPhoto = { ok: true; blob: Blob; previewUrl: string; width: number; height: number; bytes: number } | { ok: false; message: string };

const toBlob = (c: HTMLCanvasElement, type: string, q: number) => new Promise<Blob | null>((r) => c.toBlob(r, type, q));

export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  if (!file || file.size === 0) return { ok: false, message: PHOTO_MESSAGES.notImage };
  if (!sniffLogoFormat(new Uint8Array(await file.slice(0, 16).arrayBuffer()))) return { ok: false, message: PHOTO_MESSAGES.notImage };
  if (file.size > PHOTO_SOURCE_MAX_BYTES) return { ok: false, message: PHOTO_MESSAGES.sourceTooLarge(file.size) };
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return { ok: false, message: PHOTO_MESSAGES.unreadable };
  }
  try {
    if (bmp.width < PHOTO_MIN_WIDTH) return { ok: false, message: PHOTO_MESSAGES.tooNarrow(bmp.width) };
    const ratio = photoRatioProblem(bmp.width, bmp.height);
    if (ratio) return { ok: false, message: ratio };
    const scale = Math.min(1, PHOTO_SEND_WIDTH / bmp.width);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return { ok: false, message: PHOTO_MESSAGES.unreadable };
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    let blob: Blob | null = null;
    for (const q of [0.85, 0.75, 0.65]) {
      blob = await toBlob(canvas, "image/webp", q);
      if (!blob || blob.type !== "image/webp") blob = await toBlob(canvas, "image/jpeg", q);
      if (blob && blob.size <= PHOTO_UPLOAD_MAX_BYTES) break;
    }
    if (!blob) return { ok: false, message: PHOTO_MESSAGES.unreadable };
    if (blob.size > PHOTO_UPLOAD_MAX_BYTES) return { ok: false, message: PHOTO_MESSAGES.tooLarge(blob.size) };
    return { ok: true, blob, previewUrl: URL.createObjectURL(blob), width: canvas.width, height: canvas.height, bytes: blob.size };
  } finally {
    bmp.close();
  }
}
