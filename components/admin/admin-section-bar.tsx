"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/components/ui/cn";
import { activeSection, breadcrumbs, type NavGroup } from "@/lib/admin/nav";

/**
 * ADMIN-IA-1 phase B: above every admin page — breadcrumbs (Group › Section › Tab) and, for a section with several
 * pages, its route tabs + its page actions (verbs: Start intake, New lesson, Import questions). Everything comes from
 * the role-filtered nav the layout passes (lib/admin/nav.ts), so a tab or action the role cannot open is never shown;
 * the pages still guard themselves. Client side because the admin layout persists across navigations.
 */
export function AdminSectionBar({ nav }: { nav: NavGroup[] }) {
  const pathname = usePathname() || "/admin";
  const a = activeSection(pathname, nav);
  if (!a || a.item.href === "/admin") return null;
  const crumbs = breadcrumbs(pathname, nav);
  const tabs = a.item.tabs ?? [];
  const actions = (a.item.actions ?? []).filter((x) => !x.inPage);
  return (
    <div className="mb-5 flex flex-col gap-3" data-section-bar="">
      <nav aria-label="Breadcrumb">
        <ol className="flex flex-wrap items-center gap-1.5 text-[13px] text-fg-secondary">
          {crumbs.map((c, i) => {
            const last = i === crumbs.length - 1;
            return (
              <li key={`${c.label}-${i}`} className="flex items-center gap-1.5">
                {i > 0 && <span aria-hidden="true">›</span>}
                {c.href && !last ? (
                  <Link href={c.href} className="focus-ring rounded-badge text-link hover:underline">
                    {c.label}
                  </Link>
                ) : (
                  <span aria-current={last ? "page" : undefined} className={cn(last && "font-semibold text-fg")}>
                    {c.label}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
      {(tabs.length > 1 || actions.length > 0) && (
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line">
          {tabs.length > 1 ? (
            <nav aria-label={`${a.item.label} pages`} data-section-tabs="">
              <ul className="-mb-px flex flex-wrap gap-1">
                {tabs.map((t) => {
                  const on = a.tab?.href === t.href;
                  return (
                    <li key={t.href}>
                      <Link
                        href={t.href}
                        aria-current={on ? "page" : undefined}
                        className={cn(
                          "focus-ring inline-flex min-h-10 items-center rounded-t-control border-b-2 px-3 text-[14px] font-semibold",
                          on ? "border-primary-700 text-primary-800" : "border-transparent text-fg-secondary hover:border-line hover:text-fg",
                        )}
                      >
                        {t.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
          ) : (
            <span />
          )}
          {actions.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2" data-section-actions="">
              {actions.map((x) => (
                <Link
                  key={x.href + x.label}
                  href={x.href}
                  className="focus-ring inline-flex min-h-10 items-center gap-1.5 rounded-control border border-line-control bg-surface px-3 text-[13px] font-semibold text-fg hover:bg-ink-50"
                >
                  {x.label}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
