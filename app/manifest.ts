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
    // HOME-1 brand (131): the uploaded square mark, else the official logo padded to square (public/brand/)
    icons: [
      { src: "/brand/icon/192", sizes: "192x192", type: "image/png" },
      { src: "/brand/icon/512", sizes: "512x512", type: "image/png" },
    ],
  };
}
