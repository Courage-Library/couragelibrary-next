import "server-only";
import { readFile } from "fs/promises";
import { join } from "path";
import { ImageResponse } from "next/og";
import { loadBrandAssets } from "@/lib/brand/brand-assets";
import { squareMarkUrl } from "@/lib/brand/brand-rules";
import { siteConfig } from "@/config/site";
import { BRAND_PALETTE as C } from "@/config/brand";

/**
 * HOME-1 expert UX pass: the branded 1200 × 630 share image (Open Graph + Twitter) for home and for each category /
 * exam page. The brand mark is the uploaded square mark (Settings › Brand) or else the OFFICIAL logo
 * (public/images/logo.png) — shown as it is (never recoloured) on a white rounded plate. Text in white on the hero
 * navy → blue (brand colours v3, from the config/brand.ts mirror: no CSS reaches the image). Default font of next/og.
 */
export const OG_SIZE = { width: 1200, height: 630 } as const;
export const OG_CONTENT_TYPE = "image/png";

async function markDataUrl(): Promise<string> {
  try {
    const brand = await loadBrandAssets();
    const uploaded = squareMarkUrl({ path: brand.squareMarkPath }, 512);
    const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
    if (uploaded && base) {
      // server-side only (rendered into the PNG): the storage host never reaches a page
      const r = await fetch(`${base}/storage/v1/object/public/org-logos/${uploaded.replace(/^\/media\/logos\//, "")}`, { signal: AbortSignal.timeout(3000) });
      if (r.ok) return `data:image/png;base64,${Buffer.from(await r.arrayBuffer()).toString("base64")}`;
    }
  } catch {
    /* the official logo below */
  }
  const buf = await readFile(join(process.cwd(), "public/images/logo.png"));
  return `data:image/png;base64,${buf.toString("base64")}`;
}

export async function ogCard({ eyebrow, title, subtitle }: { eyebrow?: string; title: string; subtitle?: string }) {
  const mark = await markDataUrl();
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          color: C.surface,
          backgroundColor: C["primary-900"],
          backgroundImage: `linear-gradient(160deg, ${C["primary-900"]} 0%, ${C["primary-800"]} 60%, ${C["primary-700"]} 100%)`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ display: "flex", width: 88, height: 88, borderRadius: 20, backgroundColor: C.surface, alignItems: "center", justifyContent: "center" }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- next/og renders <img> into the PNG */}
            <img src={mark} width={72} height={72} alt="" style={{ objectFit: "contain" }} />
          </div>
          <div style={{ display: "flex", fontSize: 40, fontWeight: 700 }}>{siteConfig.name}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {eyebrow && <div style={{ display: "flex", fontSize: 30, color: C["accent-300"], fontWeight: 600 }}>{eyebrow}</div>}
          <div style={{ display: "flex", fontSize: title.length > 48 ? 58 : 68, fontWeight: 700, lineHeight: 1.1, maxWidth: 1000 }}>{title}</div>
          {subtitle && <div style={{ display: "flex", fontSize: 30, color: C["primary-100"], maxWidth: 1000 }}>{subtitle}</div>}
        </div>
        <div style={{ display: "flex", height: 8, width: 96, borderRadius: 8, backgroundColor: C["accent-400"] }} />
      </div>
    ),
    OG_SIZE,
  );
}
