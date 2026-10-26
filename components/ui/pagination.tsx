import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "./cn";

export type PaginationProps = {
  page: number;
  totalPages: number;
  /** Builds the URL of a page (server components can pass a function). */
  hrefFor: (page: number) => string;
  className?: string;
};

/** 1 … 4 5 [6] 7 8 … 20 */
function pageList(page: number, total: number): Array<number | "gap"> {
  const out: Array<number | "gap"> = [];
  const window = new Set([1, total, page - 1, page, page + 1].filter((p) => p >= 1 && p <= total));
  let last = 0;
  for (const p of [...window].sort((a, b) => a - b)) {
    if (p - last > 1) out.push("gap");
    out.push(p);
    last = p;
  }
  return out;
}

const item =
  "focus-ring inline-flex h-11 min-w-11 items-center justify-center gap-1 rounded-control px-3 text-body-sm font-medium";

/** Numbered pages on desktop; "Page X of Y" with previous/next on mobile. */
export function Pagination({ page, totalPages, hrefFor, className }: PaginationProps) {
  if (totalPages <= 1) return null;
  const prev = page > 1 ? page - 1 : null;
  const next = page < totalPages ? page + 1 : null;
  return (
    <nav aria-label="Pagination" className={cn("flex items-center justify-between gap-2 md:justify-center", className)}>
      {prev ? (
        <Link href={hrefFor(prev)} className={cn(item, "text-fg hover:bg-ink-100")} rel="prev">
          <ChevronLeft aria-hidden="true" className="size-4" />
          Previous
        </Link>
      ) : (
        <span className={cn(item, "text-ink-600")} aria-disabled="true">
          <ChevronLeft aria-hidden="true" className="size-4" />
          Previous
        </span>
      )}
      <span className="text-body-sm text-fg-secondary md:hidden">
        Page {page} of {totalPages}
      </span>
      <ul className="hidden items-center gap-1 md:flex">
        {pageList(page, totalPages).map((p, i) =>
          p === "gap" ? (
            <li key={`gap-${i}`} aria-hidden="true" className="px-1 text-fg-muted">
              …
            </li>
          ) : (
            <li key={p}>
              <Link
                href={hrefFor(p)}
                aria-current={p === page ? "page" : undefined}
                aria-label={`Page ${p}`}
                className={cn(item, p === page ? "bg-primary-700 text-fg-inverse" : "text-fg hover:bg-ink-100")}
              >
                {p}
              </Link>
            </li>
          ),
        )}
      </ul>
      {next ? (
        <Link href={hrefFor(next)} className={cn(item, "text-fg hover:bg-ink-100")} rel="next">
          Next
          <ChevronRight aria-hidden="true" className="size-4" />
        </Link>
      ) : (
        <span className={cn(item, "text-ink-600")} aria-disabled="true">
          Next
          <ChevronRight aria-hidden="true" className="size-4" />
        </span>
      )}
    </nav>
  );
}
