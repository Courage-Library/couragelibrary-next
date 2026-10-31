import type { NextConfig } from "next";
import { CANONICAL_HOST_PATTERN } from "./config/site";
import { ADMIN_REDIRECTS } from "./lib/admin/nav-redirects";

const SHARP_LINUX_FILES = [
  "./node_modules/@img/sharp-linux-x64/**/*",
  "./node_modules/@img/sharp-libvips-linux-x64/**/*",
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // LOGO-P0 (2026-10-31): sharp's native binary finds libvips through the dynamic linker (RPATH), which file tracing cannot
  // follow — on Linux libvips is its own package, so it is listed explicitly for every route that runs the logo pipeline
  outputFileTracingIncludes: {
    "/admin/exams": SHARP_LINUX_FILES,
    "/api/health/image": SHARP_LINUX_FILES,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "ubawtavmfwvmxfrwwwws.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
  // UX-2b: the former Premium hub is retired; plans live on /pricing ("Free during early access. Pro coming soon.")
  redirects: async () => [
    { source: "/premium", destination: "/pricing", permanent: true },
    // ADMIN-IA-1: every moved admin address → its new place (308; the query string is kept)
    ...ADMIN_REDIRECTS.map((r) => ({ source: r.from, destination: r.to, permanent: true })),
  ],
  headers: async () => [
    // SEO-HYGIENE-1: every host that is not the production site (*.vercel.app, previews, localhost) is never indexed
    {
      source: "/(.*)",
      missing: [{ type: "host", value: CANONICAL_HOST_PATTERN }],
      headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
    },
    {
      source: "/(.*)",
      headers: [
        {
          key: "X-Content-Type-Options",
          value: "nosniff",
        },
        {
          key: "X-Frame-Options",
          value: "DENY",
        },
        {
          key: "Referrer-Policy",
          value: "strict-origin-when-cross-origin",
        },
        {
          key: "Permissions-Policy",
          value: "camera=(), microphone=(), geolocation=()",
        },
      ],
    },
  ],
};

export default nextConfig;
