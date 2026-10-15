import type { MetadataRoute } from "next";
import { BRAND_BACKGROUND_COLOR, BRAND_THEME_COLOR } from "@/config/brand";
import { siteConfig } from "@/config/site";

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
    icons: [{ src: "/images/logo.png", sizes: "245x229", type: "image/png" }],
  };
}
