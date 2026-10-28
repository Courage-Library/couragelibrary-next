import type { NextConfig } from "next";
import { CANONICAL_HOST_PATTERN } from "./config/site";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
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
  redirects: async () => [{ source: "/premium", destination: "/pricing", permanent: true }],
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
