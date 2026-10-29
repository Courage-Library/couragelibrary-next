"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Search } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { StatusChip } from "@/components/admin/status-chip";
import { adminSearchAction } from "@/app/admin/search/actions";
import { searchEntries, type NavGroup } from "@/lib/admin/nav";
import type { AdminSearchResult, SearchGroup } from "@/lib/admin/search-core";

/**
 * ADMIN-UX-1 phase B — global search, Ctrl/Cmd+K. A modal Dialog (focus trapped, Esc closes, focus returns) with an
 * ARIA combobox + listbox: ↑ / ↓ move, Enter opens, results grouped (Questions / Users / Tickets). The server action
 * enforces every role rule; this component only renders what it returns.
 */
export function AdminSearch({ placeholder, nav }: { placeholder: string; nav: NavGroup[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AdminSearchResult[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const seq = useRef(0);
  const uid = useId();
  const listId = `${uid}-list`;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    // ADMIN-IA-1: "Go to" pages + actions from the role-filtered nav, matched locally from the first letter
    const lower = q.toLowerCase();
    const local: AdminSearchResult[] = q
      ? searchEntries(nav)
          .filter((e) => e.label.toLowerCase().includes(lower) || e.hint.toLowerCase().includes(lower))
          .slice(0, 8)
          .map((e) => ({ group: e.kind === "page" ? "Pages" : "Actions", id: `${e.kind}:${e.href}:${e.label}`, label: e.label, detail: e.hint, href: e.href }))
      : [];
    if (q.length < 2) {
      setResults(local);
      setActiveIdx(0);
      setState(local.length ? "done" : "idle");
      return;
    }
    const my = ++seq.current;
    setState("loading");
    const t = setTimeout(async () => {
      try {
        const r = await adminSearchAction(q);
        if (my !== seq.current) return;
        if (r.ok) {
          setResults([...local, ...r.results]);
          setActiveIdx(0);
          setState("done");
        } else setState("error");
      } catch {
        if (my === seq.current) setState("error");
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query, open, nav]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setResults([]);
    setState("idle");
  }, []);

  const go = (r: AdminSearchResult | undefined) => {
    if (!r) return;
    close();
    router.push(r.href);
  };

  const groups: SearchGroup[] = ["Pages", "Actions", "Questions", "Users", "Tickets"];
  const optionId = (i: number) => `${uid}-opt-${i}`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="focus-ring flex min-h-10 w-full max-w-xl items-center gap-2 rounded-control border border-line-control bg-surface px-3 text-body-sm text-fg-secondary hover:border-ink-400"
        aria-keyshortcuts="Control+K Meta+K"
      >
        <Search aria-hidden="true" className="size-4" />
        <span className="flex-1 text-left">{placeholder}</span>
        <kbd className="rounded border border-line bg-ink-50 px-1.5 text-caption text-fg-secondary">Ctrl K</kbd>
      </button>

      <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : close())} title="Search admin" className="gap-3">
        <div className="flex flex-col gap-3">
          <label htmlFor={`${uid}-input`} className="sr-only">
            {placeholder}
          </label>
          <input
            id={`${uid}-input`}
            autoFocus
            role="combobox"
            aria-expanded={results.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={results.length ? optionId(activeIdx) : undefined}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActiveIdx((i) => Math.min(results.length - 1, i + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActiveIdx((i) => Math.max(0, i - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                go(results[activeIdx]);
              }
            }}
            placeholder={placeholder}
            autoComplete="off"
            className="focus-ring min-h-11 w-full rounded-control border border-line-control bg-surface px-3 text-body"
          />
          <p className="text-caption text-fg-secondary" role="status" aria-live="polite">
            {state === "loading"
              ? "Searching…"
              : state === "error"
                ? "Search failed. Please try again."
                : state === "done"
                  ? results.length === 0
                    ? "No results."
                    : `${results.length} result${results.length === 1 ? "" : "s"}. Use the arrow keys and Enter.`
                  : "Type at least 2 characters: question text or ID, user email or username, ticket reference."}
          </p>
          <div id={listId} role="listbox" aria-label="Search results" className="flex max-h-[50dvh] flex-col gap-2 overflow-y-auto">
            {groups.map((g) => {
              const items = results.map((r, i) => ({ r, i })).filter((x) => x.r.group === g);
              if (!items.length) return null;
              return (
                <div key={g} role="group" aria-labelledby={`${uid}-${g}`}>
                  <p id={`${uid}-${g}`} className="px-2 pb-1 text-caption font-semibold uppercase tracking-wide text-fg-secondary">
                    {g}
                  </p>
                  {items.map(({ r, i }) => (
                    <div
                      key={r.group + r.id}
                      id={optionId(i)}
                      role="option"
                      aria-selected={i === activeIdx}
                      onMouseEnter={() => setActiveIdx(i)}
                      onClick={() => go(r)}
                      className={`flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-control px-2 text-body-sm ${i === activeIdx ? "bg-primary-50 text-fg" : "text-fg"}`}
                    >
                      <span className="truncate">{r.label}</span>
                      {r.detail && (r.group === "Users" || r.group === "Pages" || r.group === "Actions" ? <span className="shrink-0 text-caption text-fg-secondary">{r.detail}</span> : <StatusChip status={r.detail} className="shrink-0" />)}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </Dialog>
    </>
  );
}
