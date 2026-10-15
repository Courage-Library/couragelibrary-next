import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "./cn";

export type BreadcrumbItem = { label: string; href?: string };

export type BreadcrumbProps = {
  /** Root first; the last item is the current page. */
  items: BreadcrumbItem[];
  /** When set, also emits BreadcrumbList JSON-LD with absolute URLs. */
  structuredDataBaseUrl?: string;
  className?: string;
};

/** Full trail on desktop; parent-only back link on mobile. */
export function Breadcrumb({ items, structuredDataBaseUrl, className }: BreadcrumbProps) {
  const parent = [...items.slice(0, -1)].reverse().find((i) => i.href);
  const jsonLd = structuredDataBaseUrl
    ? {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: items.map((it, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: it.label,
          ...(it.href ? { item: new URL(it.href, structuredDataBaseUrl).toString() } : {}),
        })),
      }
    : null;
  return (
    <nav aria-label="Breadcrumb" className={cn("text-body-sm", className)}>
      {parent?.href && (
        <Link href={parent.href} className="focus-ring inline-flex min-h-11 items-center gap-1 rounded-badge font-medium text-link md:hidden">
          <ChevronLeft aria-hidden="true" className="size-4" />
          {parent.label}
        </Link>
      )}
      <ol className="hidden flex-wrap items-center gap-1 md:flex">
        {items.map((it, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${it.label}-${i}`} className="flex items-center gap-1">
              {last || !it.href ? (
                <span aria-current={last ? "page" : undefined} className={last ? "font-medium text-fg" : "text-fg-secondary"}>
                  {it.label}
                </span>
              ) : (
                <Link href={it.href} className="focus-ring rounded-badge text-fg-secondary underline-offset-2 hover:text-fg hover:underline">
                  {it.label}
                </Link>
              )}
              {!last && <ChevronRight aria-hidden="true" className="size-4 text-fg-muted" />}
            </li>
          );
        })}
      </ol>
      {jsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />}
    </nav>
  );
}
