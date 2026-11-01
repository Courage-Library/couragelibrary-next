"use client";

import { Suspense, use } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { BrandWordmark } from "@/components/brand/wordmark";
import { siteConfig } from "@/config/site";
import { LANDING_BRAND_LINE, SHELL_COPY } from "@/content/landing";
import type { PublicCategory } from "@/lib/exams/categories";
import { FOOTER_LEGAL, FOOTER_NAV, visibleItems, type NavItem, type ShellFlags } from "./nav-config";

// R10: every footer link is a ≥ 48 px target (was 36 px on desktop)
const linkClasses = "focus-ring inline-flex min-h-12 min-w-12 items-center rounded-badge text-body-sm text-fg-secondary underline-offset-2 hover:text-fg hover:underline";

export const FOOTER_NOT_AFFILIATED = "Courage Library is an independent platform and is not affiliated with any exam conducting body.";

/**
 * Site footer (contentinfo). Only working routes are linked. HOME-1: an "Exams" column with the live exam categories
 * (streamed: the shell never waits for it), the not-affiliated line in the bottom bar, ≥ 48 px links, and on phones
 * each column is a native <details> accordion (short page, no client state). Hidden in admin.
 */
export function SiteFooter({ flags, categories }: { flags: ShellFlags; categories?: Promise<PublicCategory[] | null> }) {
  const pathname = usePathname() ?? "/";
  if (pathname.startsWith("/admin")) return null;
  const groups: Array<{ heading: string; items: NavItem[] | null }> = [
    { heading: "Exams", items: null },
    ...FOOTER_NAV.map((g) => ({ heading: g.heading, items: visibleItems(g.items, flags) })),
  ];
  const list = (g: (typeof groups)[number]) =>
    g.items === null ? (
      <Suspense fallback={<ExamLinks categories={null} />}>{categories ? <StreamedExamLinks categories={categories} /> : <ExamLinks categories={null} />}</Suspense>
    ) : (
      <ul className="flex flex-col">
        {g.items.map((it) => (
          <li key={`${it.href}-${it.label}`}>
            <Link href={it.href} className={linkClasses}>
              {it.label}
            </Link>
          </li>
        ))}
      </ul>
    );
  const contact = (
    <address className="flex flex-col not-italic">
      <a href={`mailto:${SHELL_COPY.supportEmail}`} className={linkClasses}>
        {SHELL_COPY.supportEmail}
      </a>
      <span className="text-body-sm text-fg-secondary">{SHELL_COPY.location}</span>
    </address>
  );
  return (
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto w-full max-w-[1200px] px-4 py-8 md:px-6 md:py-12 lg:px-8">
        <div className="mb-6 flex flex-col gap-2 md:mb-8">
          <BrandWordmark size="sm" />
          <p className="max-w-xs text-body-sm text-fg-secondary">{LANDING_BRAND_LINE}</p>
        </div>
        {/* phones: one accordion per column */}
        <div className="flex flex-col divide-y divide-line border-y border-line md:hidden" data-footer-mobile="">
          {[...groups, { heading: SHELL_COPY.footerContactHeading, items: [] as NavItem[] }].map((g) => (
            <details key={g.heading} className="group">
              <summary className="focus-ring flex min-h-12 cursor-pointer list-none items-center justify-between text-body font-semibold text-fg">
                {g.heading}
                <ChevronDown aria-hidden="true" className="size-5 text-fg-secondary transition-transform group-open:rotate-180" />
              </summary>
              <div className="pb-3">{g.heading === SHELL_COPY.footerContactHeading ? contact : list(g)}</div>
            </details>
          ))}
        </div>
        {/* tablet / desktop: columns */}
        <div className="hidden gap-8 md:grid md:grid-cols-3 lg:grid-cols-5" data-footer-desktop="">
          {groups.map((g) => (
            <nav key={g.heading} aria-label={g.heading} className="flex flex-col gap-1">
              <h2 className="text-body-sm font-semibold text-fg">{g.heading}</h2>
              {list(g)}
            </nav>
          ))}
          <div className="flex flex-col gap-1">
            <h2 className="text-body-sm font-semibold text-fg">{SHELL_COPY.footerContactHeading}</h2>
            {contact}
          </div>
        </div>
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-2 px-4 py-4 md:px-6 lg:px-8">
          <p className="text-body-sm text-fg-secondary" data-not-affiliated="">
            {FOOTER_NOT_AFFILIATED}
          </p>
          <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
            <p className="text-body-sm text-fg-secondary">
              © {new Date().getFullYear()} {siteConfig.name}. {SHELL_COPY.location}.
            </p>
            <nav aria-label="Legal">
              <ul className="flex flex-wrap gap-x-4">
                {FOOTER_LEGAL.map((it) => (
                  <li key={it.href}>
                    <Link href={it.href} className={linkClasses}>
                      {it.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </div>
      </div>
    </footer>
  );
}

function StreamedExamLinks({ categories }: { categories: Promise<PublicCategory[] | null> }) {
  return <ExamLinks categories={use(categories)} />;
}

/** the categories that have exams first; "All exams" always (the fallback while loading or when the read failed) */
function ExamLinks({ categories }: { categories: PublicCategory[] | null }) {
  const live = (categories ?? []).filter((c) => c.activeExams > 0);
  return (
    <ul className="flex flex-col">
      {live.map((c) => (
        <li key={c.slug}>
          <Link href={`/exams/${c.slug}`} className={linkClasses}>
            {c.name}
          </Link>
        </li>
      ))}
      <li>
        <Link href="/exams" className={linkClasses}>
          All exams
        </Link>
      </li>
    </ul>
  );
}
