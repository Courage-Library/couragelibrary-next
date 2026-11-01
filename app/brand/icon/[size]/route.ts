import { NextResponse } from "next/server";
import { loadBrandAssets } from "@/lib/brand/brand-assets";
import { ICON_SIZES, defaultIconUrl, squareMarkUrl, type IconSize } from "@/lib/brand/brand-rules";

/**
 * HOME-1 brand settings (131): the stable icon URLs (favicon 32, apple-touch 180, app icons 192 / 512) used by the
 * metadata and the manifest. They redirect to the uploaded square mark's copy when there is one, else to the
 * official logo's icon in public/brand/ (scripts/content/brand-defaults.cjs). Same-origin targets only; cached 1 h.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size } = await params;
  const n = Number(size) as IconSize;
  if (!ICON_SIZES.includes(n)) return new NextResponse("Not found", { status: 404 });
  const brand = await loadBrandAssets();
  const target = squareMarkUrl({ path: brand.squareMarkPath }, n) ?? defaultIconUrl(n);
  return NextResponse.redirect(new URL(target, req.url), { status: 307, headers: { "Cache-Control": "public, max-age=3600, s-maxage=3600" } });
}
