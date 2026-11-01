import SHOTS from "@/content/marketing-shots.json";

/**
 * HOME-1 design upgrade ("honest images"): the real product screenshots in public/marketing/ (captured from the local
 * build with the QA identity by scripts/content/capture-marketing.cjs; README there). Each shot has fixed-width WebP
 * copies, its stored width / height (the page reserves the box: no layout shift) and alt text. A missing shot → null
 * (the step renders without an image, never a broken one).
 */
export type ShotKey = "learn" | "practice" | "mock" | "analyze" | "revise" | "hero";
type ShotRecord = { width: number; height: number; alt: string; files: Record<string, { file: string; width: number; bytes: number }> };
export interface Shot {
  src: string;
  srcSet: string;
  width: number;
  height: number;
  alt: string;
}

export function shot(key: ShotKey): Shot | null {
  const r = (SHOTS as Record<string, ShotRecord | undefined>)[key];
  if (!r || !r.files || !r.alt) return null;
  const files = Object.values(r.files).sort((a, b) => a.width - b.width);
  if (!files.length) return null;
  const url = (f: { file: string }) => `/marketing/${f.file}`;
  return { src: url(files[files.length - 1]), srcSet: files.map((f) => `${url(f)} ${f.width}w`).join(", "), width: r.width, height: r.height, alt: r.alt };
}
