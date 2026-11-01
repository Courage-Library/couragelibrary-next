import "server-only";
import { createHash } from "crypto";
import { loadSharp, sniffLogoFormat } from "@/lib/logos/logo-image";
import { BRAND_MESSAGES, BRAND_UPLOAD_MAX_BYTES, type BrandKey } from "@/lib/brand/brand-rules";

/**
 * HOME-1 brand settings (131): the server pipeline for brand images — sniffed (PNG / JPEG / WebP only), checked for
 * shape, re-encoded (metadata dropped), sized copies. Never recolours: resize only.
 *   logos (header / footer): WebP, main ≤ 128 px tall (<sha>.webp) + a 64 px copy (<sha>-64.webp), alpha kept
 *   square mark: PNG 512 (<sha>.png) + 32 / 180 / 192 copies (<sha>-<size>.png)
 */
export type BrandFile = { suffix: string; buf: Buffer; type: "image/webp" | "image/png" };
export type BrandResult =
  | { ok: true; sha256: string; width: number; height: number; ext: "webp" | "png"; files: BrandFile[] }
  | { ok: false; message: string };

export async function processBrandImage(key: BrandKey, input: Buffer): Promise<BrandResult> {
  if (input.length > BRAND_UPLOAD_MAX_BYTES) return { ok: false, message: BRAND_MESSAGES.tooLarge };
  if (!sniffLogoFormat(input)) return { ok: false, message: BRAND_MESSAGES.notImage };
  const sharp = await loadSharp();
  let meta;
  try {
    meta = await sharp(input).metadata();
  } catch {
    return { ok: false, message: BRAND_MESSAGES.unreadable };
  }
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (key === "brand_square_mark") {
    if (w < 512 || h < 512 || Math.abs(w / h - 1) > 0.02) return { ok: false, message: BRAND_MESSAGES.markShape };
    const main = await sharp(input).rotate().resize({ width: 512, height: 512, fit: "cover" }).png({ compressionLevel: 9 }).toBuffer();
    const files: BrandFile[] = [{ suffix: ".png", buf: main, type: "image/png" }];
    for (const s of [32, 180, 192]) files.push({ suffix: `-${s}.png`, buf: await sharp(main).resize({ width: s, height: s }).png({ compressionLevel: 9 }).toBuffer(), type: "image/png" });
    return { ok: true, sha256: createHash("sha256").update(main).digest("hex"), width: 512, height: 512, ext: "png", files };
  }
  const ratio = w / h;
  if (w < 160 || h < 40 || ratio < 2 || ratio > 8) return { ok: false, message: BRAND_MESSAGES.logoShape };
  const mainH = Math.min(128, h);
  const main = await sharp(input).rotate().resize({ height: mainH }).webp({ quality: 92, alphaQuality: 100, effort: 6 }).toBuffer();
  const mm = await sharp(main).metadata();
  const small = await sharp(main).resize({ height: 64 }).webp({ quality: 92, alphaQuality: 100, effort: 6 }).toBuffer();
  return {
    ok: true,
    sha256: createHash("sha256").update(main).digest("hex"),
    width: mm.width ?? w,
    height: mm.height ?? mainH,
    ext: "webp",
    files: [{ suffix: ".webp", buf: main, type: "image/webp" }, { suffix: "-64.webp", buf: small, type: "image/webp" }],
  };
}
