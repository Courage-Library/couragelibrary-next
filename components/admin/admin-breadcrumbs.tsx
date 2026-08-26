import React from "react";
import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";

export interface BreadcrumbItem {
  label: string;
  href?: string;
  active?: boolean;
}

interface Props {
  items: BreadcrumbItem[];
}

export function AdminBreadcrumbs({ items }: Props) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center space-x-1 text-xs text-slate-500 font-medium py-1 overflow-x-auto whitespace-nowrap">
      <Link
        href="/admin"
        className="flex items-center text-slate-400 hover:text-slate-700 transition-colors"
      >
        <Home className="w-3.5 h-3.5 mr-1 text-slate-400" /> Admin
      </Link>

      {items.map((item, index) => {
        const isLast = index === items.length - 1 || item.active;

        return (
          <React.Fragment key={index}>
            <ChevronRight className="w-3 h-3 text-slate-300 shrink-0" />
            {item.href && !isLast ? (
              <Link
                href={item.href}
                className="text-slate-500 hover:text-slate-900 transition-colors truncate max-w-[180px]"
              >
                {item.label}
              </Link>
            ) : (
              <span className={`truncate max-w-[200px] ${isLast ? "font-semibold text-slate-800" : "text-slate-500"}`}>
                {item.label}
              </span>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}
