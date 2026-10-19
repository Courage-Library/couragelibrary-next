import React from "react";
import { Pagination } from "@/components/ui/pagination";

interface MistakePaginationProps {
  currentPage: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
  /** The current /mistakes query (filters are kept; only `page` changes). */
  query?: Record<string, string | undefined>;
}

/** Real links (no client router): every page has a URL, works without JS, and keeps the active filters. */
export function MistakePagination({ currentPage, totalPages, totalCount, pageSize, query = {} }: MistakePaginationProps) {
  const hrefFor = (p: number) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) if (v && k !== "page") qs.set(k, v);
    if (p > 1) qs.set("page", String(p));
    const s = qs.toString();
    return s ? `/mistakes?${s}` : "/mistakes";
  };
  const start = (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, totalCount);

  return (
    <div className="flex flex-col gap-3 pt-2">
      <p className="text-body-sm text-fg-secondary" aria-live="polite">
        {totalPages <= 1
          ? `Showing ${totalCount} ${totalCount === 1 ? "mistake" : "mistakes"}`
          : `Showing ${start}–${end} of ${totalCount} mistakes`}
      </p>
      <Pagination page={currentPage} totalPages={totalPages} hrefFor={hrefFor} />
    </div>
  );
}
