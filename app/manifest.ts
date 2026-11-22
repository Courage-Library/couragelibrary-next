import type { MetadataRoute } from "next";
import { BRAND_BACKGROUND_COLOR, BRAND_THEME_COLOR } from "@/config/brand";
import { siteConfig } from "@/config/site";
import { MANIFEST_ICONS } from "@/lib/seo/brand-icons";

/** Web app manifest (UX-1b): brand colours from config/brand.ts (mirrors the design tokens). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: siteConfig.name,
    short_name: siteConfig.name,
    description: siteConfig.description,
    start_url: "/",
    display: "standalone",
    background_color: BRAND_BACKGROUND_COLOR,
    theme_color: BRAND_THEME_COLOR,
    // SEO-1: the final logo suite, static files (any + maskable) — lib/seo/brand-icons.ts
    icons: MANIFEST_ICONS.map((i) => ({ ...i })),
  };
}
