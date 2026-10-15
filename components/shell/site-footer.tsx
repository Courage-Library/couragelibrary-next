"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandLogo } from "@/components/brand/logo";
import { siteConfig } from "@/config/site";
import { FOOTER_NAV } from "./nav-config";

/**
 * Site footer (contentinfo). Only working routes are linked; About, Contact and the legal pages are added
 * when UX-2 builds them. Hidden in admin (admin has its own layout).
 */
export function SiteFooter() {
  const pathname = usePathname() ?? "/";
  if (pathname.startsWith("/admin")) return null;
  return (
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-4 lg:px-8">
        <div className="flex flex-col gap-3">
          <BrandLogo size="sm" />
          <p className="max-w-xs text-body-sm text-fg-secondary">{siteConfig.tagline}</p>
        </div>
        {FOOTER_NAV.map((group) => (
          <nav key={group.heading} aria-label={group.heading} className="flex flex-col gap-2">
            <h2 className="text-body-sm font-semibold text-fg">{group.heading}</h2>
            <ul className="flex flex-col">
              {group.items.map((it) => (
                <li key={it.href}>
                  <Link
                    href={it.href}
                    className="focus-ring inline-flex min-h-11 items-center rounded-badge text-body-sm text-fg-secondary underline-offset-2 hover:text-fg hover:underline md:min-h-9"
                  >
                    {it.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-line">
        <p className="mx-auto w-full max-w-7xl px-4 py-4 text-body-sm text-fg-secondary sm:px-6 lg:px-8">
          © {new Date().getFullYear()} {siteConfig.name}. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
