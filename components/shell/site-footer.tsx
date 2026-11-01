"use client";

import { Suspense, use } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { BrandWordmark } from "@/components/brand/wordmark";
import { siteConfig } from "@/config/site";
import { LANDING_BRAND_LINE, SHELL_COPY } from "@/content/landing";
import type { PublicCategory } from "@/lib/exams/categories";
import type { BrandImage } from "@/lib/brand/brand-rules";
import { FOOTER_LEGAL, FOOTER_NAV, visibleItems, type NavItem, type ShellFlags } from "./nav-config";

// R10: every footer link is a ≥ 48 px target (was 36 px on desktop). HOME-1: on the deep-navy footer the links are
// light slate (ink-300 on ink-900 ≈ 11:1), white on hover, with the on-dark focus ring (accent-300).
const linkClasses =
  "focus-ring-on-dark inline-flex min-h-12 min-w-12 items-center rounded-badge text-body-sm text-ink-300 underline-offset-2 hover:text-fg-inverse hover:underline";

export const FOOTER_NOT_AFFILIATED = "Courage Library is an independent platform and is not affiliated with any exam conducting body.";

/**
 * Site footer (contentinfo). Only working routes are linked. HOME-1: an "Exams" column with the live exam categories
 * (streamed: the shell never waits for it), the not-affiliated line in the bottom bar, ≥ 48 px links, and on phones
 * each column is a native <details> accordion (short page, no client state). Hidden in admin.
 * HOME-1 design decision (owner, 2026-11-01): deep navy (ink-900), white headings, light-slate links and text
 * (≥ 4.5:1, registered in contrast-pairs.json), a thin cyan line on top to separate it from the gradient CTA band.
 */
export function SiteFooter({ flags, categories, logo = null }: { flags: ShellFlags; categories?: Promise<PublicCategory[] | null>; logo?: BrandImage | null }) {
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
      <span className="text-body-sm text-ink-300">{SHELL_COPY.location}</span>
    </address>
  );
  return (
    <footer className="border-t-2 border-accent-400 bg-ink-900 text-ink-300" data-footer-navy="">
      <div className="mx-auto w-full max-w-[1200px] px-4 py-8 md:px-6 md:py-12 lg:px-8">
        <div className="mb-6 flex flex-col gap-2 md:mb-8">
          <BrandWordmark size="sm" tone="white" logo={logo} />
          <p className="max-w-xs text-body-sm text-ink-300">{LANDING_BRAND_LINE}</p>
        </div>
        {/* phones: one accordion per column */}
        <div className="flex flex-col divide-y divide-ink-700 border-y border-ink-700 md:hidden" data-footer-mobile="">
          {[...groups, { heading: SHELL_COPY.footerContactHeading, items: [] as NavItem[] }].map((g) => (
            <details key={g.heading} className="group">
              <summary className="focus-ring-on-dark flex min-h-12 cursor-pointer list-none items-center justify-between text-body font-semibold text-fg-inverse [&::-webkit-details-marker]:hidden">
                {g.heading}
                <ChevronDown aria-hidden="true" className="size-5 text-ink-300 transition-transform group-open:rotate-180 motion-reduce:transition-none" />
              </summary>
              <div className="pb-3">{g.heading === SHELL_COPY.footerContactHeading ? contact : list(g)}</div>
            </details>
          ))}
        </div>
        {/* tablet / desktop: columns */}
        <div className="hidden gap-8 md:grid md:grid-cols-3 lg:grid-cols-5" data-footer-desktop="">
          {groups.map((g) => (
            <nav key={g.heading} aria-label={g.heading} className="flex flex-col gap-1">
              <h2 className="text-body-sm font-semibold text-fg-inverse">{g.heading}</h2>
              {list(g)}
            </nav>
          ))}
          <div className="flex flex-col gap-1">
            <h2 className="text-body-sm font-semibold text-fg-inverse">{SHELL_COPY.footerContactHeading}</h2>
            {contact}
          </div>
        </div>
      </div>
      <div className="border-t border-ink-700">
        <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-2 px-4 py-4 md:px-6 lg:px-8">
          <p className="text-body-sm text-ink-300" data-not-affiliated="">
            {FOOTER_NOT_AFFILIATED}
          </p>
          <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
            <p className="text-body-sm text-ink-300">
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
