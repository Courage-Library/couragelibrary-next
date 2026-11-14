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
  // LOGO-P0 (2026-10-31): belt and braces — the tracer's sharp special case already emits sharp's installed @img packages;
  // the Linux binary + libvips are also listed explicitly for every route that runs the logo pipeline
  // (scripts/ci/sharp-trace-check.cjs proves the traced set alone encodes, with a negative control)
  outputFileTracingIncludes: {
    "/admin/exams": SHARP_LINUX_FILES,
    "/api/health/image": SHARP_LINUX_FILES,
  },
  // LOGO-P0b (2026-10-31): ROOT CAUSE of the /admin/exams crash — a logo upload over Next's default 1 MB Server Action
  // body limit was rejected (413) before our validation ran. 2 MB = the 1 MB file rule + multipart headroom. This applies
  // to EVERY Server Action: each file-accepting action caps its own file at 1 MB (logo, bulk-import image, reward
  // image) and every student-reachable action caps its own text (audit: docs/ops/LOGO_P0.md)
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
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
  // LOGO-MEDIA-1: logos are served from our own origin (lib/logos/exam-logo.ts LOGO_MEDIA_PREFIX) — the storage host /
  // project ref never appears in public HTML. Content-hash paths: immutable.
  rewrites: async () => {
    const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
    // HOME-1 brand: browsers ask for /favicon.ico; it is the 32 px brand icon (uploaded square mark or the official logo)
    const favicon = { source: "/favicon.ico", destination: "/brand/icon/32" };
    return base ? [{ source: "/media/logos/:path*", destination: `${base}/storage/v1/object/public/org-logos/:path*` }, favicon] : [favicon];
  },
  // UX-2b: the former Premium hub is retired; plans live on /pricing ("Free during early access. Pro coming soon.")
  redirects: async () => [
    { source: "/premium", destination: "/pricing", permanent: true },
    // PAY-1 B1 (PAY-LEGACY-RETIRE-1): the legacy checkout pages are retired; Pro is bought on /pricing (308)
    { source: "/checkout", destination: "/pricing", permanent: true },
    { source: "/checkout/:path*", destination: "/pricing", permanent: true },
    // LEGAL-PAGES-1: the grievance details live in Contact Us & Grievance, section 5.1 (308)
    { source: "/grievance", destination: "/contact#grievance-officer", permanent: true },
    // ADMIN-IA-1: every moved admin address → its new place (308; the query string is kept)
    ...ADMIN_REDIRECTS.map((r) => ({ source: r.from, destination: r.to, permanent: true })),
  ],
  headers: async () => [
    // LOGO-MEDIA-1: a logo path names exactly one image (content hash), so it never changes
    { source: "/media/logos/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
    // HOME-1 product screenshots: fixed names (re-captured in place), so a day of cache + a week of background refresh
    { source: "/marketing/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }] },
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
