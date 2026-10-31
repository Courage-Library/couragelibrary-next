import "server-only";
import { loadSharp, processLogo } from "@/lib/logos/logo-image";

/**
 * LOGO-P0 (2026-10-31): does the logo pipeline work in THIS runtime? Loads sharp, draws a 256 × 256 PNG and runs it through
 * processLogo (the real upload path). true / false only — never an error text, a path or a version (the route is public).
 * The result is kept for a minute per instance, so the public route cannot be used to burn CPU.
 */
export interface ImageHealthDeps {
  loadSharp: typeof loadSharp;
  processLogo: typeof processLogo;
}

export async function imagePipelineWorks(deps: ImageHealthDeps = { loadSharp, processLogo }): Promise<boolean> {
  try {
    const sharp = await deps.loadSharp();
    const png = await sharp({ create: { width: 256, height: 256, channels: 4, background: { r: 29, g: 78, b: 216, alpha: 1 } } }).png().toBuffer();
    const out = await deps.processLogo(png);
    return out.ok && out.webp.length > 0 && /^[0-9a-f]{64}$/.test(out.sha256);
  } catch {
    return false;
  }
}

const TTL_MS = 60_000;
let last: { at: number; ok: boolean } | null = null;

export async function cachedImagePipelineWorks(): Promise<boolean> {
  if (last && Date.now() - last.at < TTL_MS) return last.ok;
  const ok = await imagePipelineWorks();
  last = { at: Date.now(), ok };
  return ok;
}
