"use client";

import React, { useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface MistakePaginationProps {
  currentPage: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
}

export function MistakePagination({
  currentPage,
  totalPages,
  totalCount,
  pageSize,
}: MistakePaginationProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  if (totalPages <= 1) {
    return (
      <div className="flex items-center justify-between text-xs text-slate-500 pt-2 px-1">
        <span>
          Showing {totalCount} {totalCount === 1 ? "mistake" : "mistakes"}
        </span>
      </div>
    );
  }

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > totalPages || newPage === currentPage) return;

    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(newPage));

    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  };

  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalCount);

  // Generate page numbers
  const pages: number[] = [];
  const maxDisplayedPages = 5;
  let startPage = Math.max(1, currentPage - Math.floor(maxDisplayedPages / 2));
  const endPage = Math.min(totalPages, startPage + maxDisplayedPages - 1);

  if (endPage - startPage + 1 < maxDisplayedPages) {
    startPage = Math.max(1, endPage - maxDisplayedPages + 1);
  }

  for (let i = startPage; i <= endPage; i++) {
    pages.push(i);
  }

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-3 px-1">
      <span className="text-xs text-slate-500 font-medium order-2 sm:order-1">
        Showing <strong className="text-slate-800">{startItem}–{endItem}</strong> of{" "}
        <strong className="text-slate-800">{totalCount}</strong> mistakes
      </span>

      <div className="flex items-center gap-1.5 order-1 sm:order-2">
        <Button
          variant="outline"
          size="sm"
          disabled={currentPage <= 1 || isPending}
          onClick={() => handlePageChange(currentPage - 1)}
          className="h-8 px-2 text-xs border-slate-200"
          aria-label="Previous page"
        >
          <ChevronLeft className="w-4 h-4 mr-0.5" /> Prev
        </Button>

        {pages.map((p) => (
          <button
            key={p}
            type="button"
            disabled={isPending}
            onClick={() => handlePageChange(p)}
            className={`w-8 h-8 rounded-lg text-xs font-semibold transition-all ${
              p === currentPage
                ? "bg-blue-600 text-white shadow-xs"
                : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
            }`}
          >
            {p}
          </button>
        ))}

        <Button
          variant="outline"
          size="sm"
          disabled={currentPage >= totalPages || isPending}
          onClick={() => handlePageChange(currentPage + 1)}
          className="h-8 px-2 text-xs border-slate-200"
          aria-label="Next page"
        >
          Next <ChevronRight className="w-4 h-4 ml-0.5" />
        </Button>
      </div>
    </div>
  );
}
