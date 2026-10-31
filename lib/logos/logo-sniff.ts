/**
 * EXAM-LOGO-1 / LOGO-UX-1: which image format the first bytes name — PNG / JPEG / WebP, or null (SVG, HTML, anything
 * else). Pure; used by the server pipeline (lib/logos/logo-image.ts) and by the browser before anything is sent.
 */
export type LogoFormat = "png" | "jpeg" | "webp";

export function sniffLogoFormat(b: Uint8Array): LogoFormat | null {
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "webp";
  return null;
}
