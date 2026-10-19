import React from "react";
import Link from "next/link";
import { Bookmark, Search } from "lucide-react";
import { Button, ButtonLink, buttonClasses } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/components/ui/cn";

interface MistakeFilterBarProps {
  subjects: Array<{ id: string; name: string }>;
  cognitiveTypes: Array<{ id: string; name: string }>;
  currentStatus: string;
  currentRepeated: boolean;
  currentBookmarked?: boolean;
  currentSubject: string;
  currentCognitive: string;
  currentSort: string;
  currentQuery: string;
  /** The current /mistakes query, used to build links that keep the other filters. */
  query?: Record<string, string | undefined>;
}

const STATUS_FILTERS = [
  { label: "All", val: "ALL" },
  { label: "Needs revision", val: "UNRESOLVED" },
  { label: "Repeated", val: "REPEATED" },
  { label: "Correct once", val: "REVISITING" },
  { label: "Mastered", val: "MASTERED" },
];

const SORTS = [
  { value: "recent", label: "Most recent" },
  { value: "repeated", label: "Most repeated" },
  { value: "oldest", label: "Oldest first" },
  { value: "topic", label: "By topic" },
];

/**
 * Server-rendered filters (UX-2b.3). Status and bookmark filters are links; search, subject, reason and sort are a
 * GET form with an explicit "Apply filters" button (no navigation on select change: WCAG 3.2.2; works without JS).
 * URL contract unchanged: status=<UNRESOLVED|REVISITING|MASTERED>, repeated=true, bookmarked=true, q, subject,
 * cognitive, sort; any filter change drops `page`.
 */
export function MistakeFilterBar({
  subjects,
  cognitiveTypes,
  currentStatus,
  currentRepeated,
  currentBookmarked = false,
  currentSubject,
  currentCognitive,
  currentSort,
  currentQuery,
  query = {},
}: MistakeFilterBarProps) {
  const hrefWith = (mutate: (p: URLSearchParams) => void) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) if (v && k !== "page") params.set(k, v);
    mutate(params);
    const s = params.toString();
    return s ? `/mistakes?${s}` : "/mistakes";
  };

  const statusHref = (val: string) =>
    hrefWith((p) => {
      if (val === "REPEATED") {
        p.set("repeated", "true");
        p.delete("status");
      } else {
        p.delete("repeated");
        if (val === "ALL") p.delete("status");
        else p.set("status", val);
      }
    });

  const bookmarkedHref = hrefWith((p) => {
    if (currentBookmarked) p.delete("bookmarked");
    else p.set("bookmarked", "true");
  });

  const activeStatus = currentRepeated ? "REPEATED" : currentStatus && currentStatus !== "ALL" ? currentStatus : "ALL";

  const hasActiveFilters = Boolean(
    (currentSubject && currentSubject !== "ALL") ||
      (currentCognitive && currentCognitive !== "ALL") ||
      (currentSort && currentSort !== "recent") ||
      currentBookmarked ||
      currentQuery,
  );

  // Clearing keeps the status filter, as before.
  const resetHref = (() => {
    const p = new URLSearchParams();
    if (currentStatus && currentStatus !== "ALL") p.set("status", currentStatus);
    if (currentRepeated) p.set("repeated", "true");
    const s = p.toString();
    return s ? `/mistakes?${s}` : "/mistakes";
  })();

  return (
    <section aria-labelledby="mistake-filters-title" className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4">
      <h3 id="mistake-filters-title" className="sr-only">
        Filter your mistakes
      </h3>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <nav aria-label="Show mistakes by status" className="-mx-1 overflow-x-auto px-1">
          <ul className="flex w-max gap-1 rounded-control bg-surface-sunken p-1">
            {STATUS_FILTERS.map((f) => {
              const selected = activeStatus === f.val;
              return (
                <li key={f.val}>
                  <Link
                    href={statusHref(f.val)}
                    prefetch={false}
                    aria-current={selected ? "page" : undefined}
                    className={cn(
                      "focus-ring inline-flex h-11 min-w-11 items-center justify-center whitespace-nowrap rounded-control px-3 text-body-sm font-medium transition-colors duration-120 ease-standard",
                      selected ? "bg-surface text-fg shadow-e1" : "text-fg-secondary hover:text-fg",
                    )}
                  >
                    {f.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <Link
          href={bookmarkedHref}
          prefetch={false}
          aria-current={currentBookmarked ? "page" : undefined}
          className={cn(buttonClasses({ variant: currentBookmarked ? "ghost" : "secondary" }), currentBookmarked && "bg-primary-50", "self-start")}
        >
          <Bookmark aria-hidden="true" className={cn("size-4", currentBookmarked && "fill-current")} />
          {currentBookmarked ? "Showing bookmarked only" : "Bookmarked only"}
        </Link>
      </div>

      <form method="get" action="/mistakes" className="flex flex-col gap-3">
        {/* keep the status / bookmark filters across a form submit */}
        {currentStatus && currentStatus !== "ALL" && <input type="hidden" name="status" value={currentStatus} />}
        {currentRepeated && <input type="hidden" name="repeated" value="true" />}
        {currentBookmarked && <input type="hidden" name="bookmarked" value="true" />}

        <Field id="mistake-search" label="Search your mistakes">
          <Input
            type="search"
            name="q"
            defaultValue={currentQuery}
            placeholder="Question, topic or subject"
            prefix={<Search aria-hidden="true" className="size-4" />}
          />
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field id="mistake-subject" label="Subject">
            <Select name="subject" defaultValue={currentSubject || "ALL"}>
              <option value="ALL">All subjects</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="mistake-cognitive" label="Why it went wrong">
            <Select name="cognitive" defaultValue={currentCognitive || "ALL"}>
              <option value="ALL">All reasons</option>
              {cognitiveTypes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="mistake-sort" label="Sort by">
            <Select name="sort" defaultValue={currentSort || "recent"} options={SORTS} />
          </Field>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {hasActiveFilters && (
            <ButtonLink href={resetHref} variant="ghost" prefetch={false}>
              Clear filters
            </ButtonLink>
          )}
          <Button type="submit" variant="secondary">
            Apply filters
          </Button>
        </div>
      </form>
    </section>
  );
}
