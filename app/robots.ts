import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { CANONICAL_SITE_URL, isCanonicalHost } from "@/config/site";

/**
 * SEO-HYGIENE-1: only the production host invites crawlers (and lists the sitemap, always on the canonical base);
 * every other host — *.vercel.app, previews, localhost — disallows everything (with the X-Robots-Tag noindex header
 * from next.config for whatever is fetched anyway).
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const h = await headers();
  if (!isCanonicalHost(h.get("x-forwarded-host") ?? h.get("host"))) {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/admin/", "/dashboard/"],
      },
    ],
    sitemap: `${CANONICAL_SITE_URL}/sitemap.xml`,
  };
}
