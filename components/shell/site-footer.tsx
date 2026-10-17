"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandLogo } from "@/components/brand/logo";
import { siteConfig } from "@/config/site";
import { LANDING_BRAND_LINE, SHELL_COPY } from "@/content/landing";
import { FOOTER_NAV } from "./nav-config";

const linkClasses =
  "focus-ring inline-flex min-h-11 items-center rounded-badge text-body-sm text-fg-secondary underline-offset-2 hover:text-fg hover:underline md:min-h-9";

/**
 * Site footer (contentinfo). Only working routes are linked; About and the legal pages are added when UX-2b
 * builds them. UX-2a: brand line, support e-mail and location; content width 1200 px (decision #46). Hidden in
 * admin (admin has its own layout).
 */
export function SiteFooter() {
  const pathname = usePathname() ?? "/";
  if (pathname.startsWith("/admin")) return null;
  return (
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto grid w-full max-w-[1200px] gap-8 px-4 py-12 md:grid-cols-3 md:px-6 lg:grid-cols-5 lg:px-8">
        <div className="flex flex-col gap-3 md:col-span-3 lg:col-span-1">
          <BrandLogo size="sm" />
          <p className="max-w-xs text-body-sm text-fg-secondary">{LANDING_BRAND_LINE}</p>
        </div>
        {FOOTER_NAV.map((group) => (
          <nav key={group.heading} aria-label={group.heading} className="flex flex-col gap-2">
            <h2 className="text-body-sm font-semibold text-fg">{group.heading}</h2>
            <ul className="flex flex-col">
              {group.items.map((it) => (
                <li key={it.href}>
                  <Link href={it.href} className={linkClasses}>
                    {it.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
        <div className="flex flex-col gap-2">
          <h2 className="text-body-sm font-semibold text-fg">{SHELL_COPY.footerContactHeading}</h2>
          <address className="flex flex-col not-italic">
            <a href={`mailto:${SHELL_COPY.supportEmail}`} className={linkClasses}>
              {SHELL_COPY.supportEmail}
            </a>
            <span className="text-body-sm text-fg-secondary">{SHELL_COPY.location}</span>
          </address>
        </div>
      </div>
      <div className="border-t border-line">
        <p className="mx-auto w-full max-w-[1200px] px-4 py-4 text-body-sm text-fg-secondary md:px-6 lg:px-8">
          © {new Date().getFullYear()} {siteConfig.name}. {SHELL_COPY.location}.
        </p>
      </div>
    </footer>
  );
}
