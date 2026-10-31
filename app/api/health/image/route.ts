import { NextResponse } from "next/server";
import { cachedImagePipelineWorks } from "@/lib/logos/image-health";

/**
 * LOGO-P0: public boolean probe — does the logo image pipeline (sharp, a native library) load and work in the deployed
 * runtime? { ok: true } 200 or { ok: false } 503; nothing else (no error text, no versions). Hit by prod-smoke.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const ok = await cachedImagePipelineWorks();
  return NextResponse.json({ ok }, { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
}
