"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ListTree, Search, X } from "lucide-react";
import { isOpen as openRule, isVisible, matchTopics, normText, restoreState, setAllTopics, shortSubjectLabel, subjectCounts, toggleTopic, type BrowseItem, type OpenState } from "@/lib/syllabus/browse-state";

/**
 * SYLLABUS-UI-1 (owner 2026-11-12): ONE way to browse a long syllabus, shared by the student exam hub and the admin
 * intake review. Subject switcher (chips that scroll sideways on a phone, one row of tabs from md) → topics as collapsible
 * rows (collapsed by default; buttons with aria-expanded) → the topic's body. Search by topic / subtopic name (client side,
 * no new package); Expand all / Collapse all; a desktop rail of the subject's topics with scroll-spy; on smaller screens a
 * "Jump to topic" bottom sheet. Subject + open topics are remembered per session (sessionStorage, every access in
 * try/catch — the page works the same without it).
 * Sticky: exactly ONE sticky bar (switcher + search) and the rail beside it, both at `top: var(--sticky-offset)` — the one
 * offset token (globals.css: the site header's height; the admin page sets its own). Jump targets carry a scroll margin
 * of max(offset, 0) + the bar's measured height, so a topic never lands under the bar (a negative offset — the admin
 * pane's padding — is already the scroller's own edge).
 * keepMounted: every subject's topics and every topic body are in the server HTML (hidden until opened) — the student
 * page keeps its whole syllabus crawlable; without it (admin) only the open subject and open topics are rendered.
 * The state rules (search, open / closed, restore) are pure functions in lib/syllabus/browse-state.ts.
 */

/** Content is passed as rendered nodes (not render functions), so a server component can fill it. */
export type BrowseSubject = {
  id: string;
  label: string;
  /** above the subject's topic list */
  intro?: ReactNode;
};
export type BrowseTopic = {
  id: string;
  subjectId: string;
  name: string;
  /** further searchable names (subtopics, Hindi name …) */
  terms?: string[];
  /** inside the topic's toggle button: text and badges only (no links or buttons) */
  summary: ReactNode;
  /** beside the toggle (the topic's own buttons) */
  actions?: ReactNode;
  /** under the topic's header, shown open or closed */
  after?: ReactNode;
  /** the topic's body; none = nothing to open (no toggle) */
  body?: ReactNode;
};

type Props = {
  /** sessionStorage key (subject + open topics) */
  storageKey: string;
  /** "Syllabus", "Intake items" — names the regions for screen readers */
  label: string;
  subjects: BrowseSubject[];
  topics: BrowseTopic[];
  keepMounted?: boolean;
  /** extra content at the end of the sticky bar (e.g. progress) */
  barExtra?: ReactNode;
};

/** a topic opens only when it has a body */
const expandable = (t: BrowseTopic): boolean => t.body !== undefined && t.body !== null && t.body !== false;

/** class join without tailwind-merge (keeps that library out of the student page's bundle) */
const cx = (...c: Array<string | false | null | undefined>): string => c.filter(Boolean).join(" ");

const readSaved = (key: string): unknown => {
  try {
    const raw = window.sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
};
const writeSaved = (key: string, v: { subject: string; open: string[] }) => {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* private mode / storage blocked: the page works without it */
  }
};
const reducedMotion = () => {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
};

/** phone: pill chips that scroll sideways (44 px); md+: ONE row of underline tabs with tight padding (owner: all of an
 * exam's subjects fit at ≥ 1280 px; short labels via shortSubjectLabel). Whatever still overflows gets an edge fade +
 * arrow, so hidden tabs are obvious at any width. */
const tabBase =
  "focus-ring inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-4 text-body-sm font-semibold transition-colors duration-120 md:min-h-10 md:gap-1.5 md:rounded-none md:border-0 md:border-b-2 md:px-2.5";
const edgeBtn =
  "pointer-events-auto inline-flex size-11 items-center justify-center rounded-full border border-line-control bg-surface text-fg shadow-e1 hover:bg-ink-50 md:size-9";
const quietBtn =
  "focus-ring inline-flex min-h-11 items-center gap-2 rounded-control border border-line-control bg-surface px-3 text-body-sm font-semibold text-fg hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-50";

export function SyllabusBrowser({ storageKey, label, subjects, topics, keepMounted = false, barExtra }: Props) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const domId = useCallback((topicId: string) => `${uid}-t-${topicId}`, [uid]);
  const [active, setActive] = useState<string>(subjects[0]?.id ?? "");
  const [state, setState] = useState<OpenState>(() => ({ open: new Set(), closedInSearch: new Set() }));
  const [query, setQuery] = useState("");
  const [sheet, setSheet] = useState(false);
  const [current, setCurrent] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLOListElement>(null);
  const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const tablistRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState<{ left: boolean; right: boolean }>({ left: false, right: false });
  const q = normText(query);

  // ------------------------------------------------------------------ remembered per session
  useEffect(() => {
    const r = restoreState(readSaved(storageKey), subjects.map((x) => x.id), topics.map((t) => t.id));
    if (r.subject) setActive(r.subject);
    setState({ open: new Set(r.open), closedInSearch: new Set() });
    setRestored(true);
    // restore once per mount; later prop changes (a refresh after an admin decision) keep the live state
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);
  useEffect(() => {
    if (restored) writeSaved(storageKey, { subject: active, open: [...state.open] });
  }, [restored, storageKey, active, state.open]);
  useEffect(() => setState((s) => (s.closedInSearch.size ? { open: s.open, closedInSearch: new Set() } : s)), [q]);

  // ------------------------------------------------------------------ search + open / closed (lib/syllabus/browse-state)
  const items = useMemo(() => topics.map((t): BrowseItem => ({ id: t.id, subjectId: t.subjectId, name: t.name, terms: t.terms, expandable: expandable(t) })), [topics]);
  const itemOf = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const match = useMemo(() => matchTopics(items, q), [items, q]);
  const visible = useCallback((t: BrowseTopic) => isVisible(match, q, t.id), [match, q]);
  const isOpen = useCallback((t: BrowseTopic) => openRule(itemOf.get(t.id) as BrowseItem, state, q, match), [itemOf, state, q, match]);
  const bySubject = useMemo(() => {
    const m = new Map<string, BrowseTopic[]>();
    for (const s of subjects) m.set(s.id, []);
    for (const t of topics) m.get(t.subjectId)?.push(t);
    return m;
  }, [subjects, topics]);
  const counts = useMemo(() => subjectCounts(subjects.map((s) => s.id), items, q, match), [subjects, items, q, match]);
  const shownIn = (sid: string) => (bySubject.get(sid) ?? []).filter(visible);
  const activeTopics = bySubject.get(active) ?? [];
  const shown = activeTopics.filter(visible);
  const activeLabel = subjects.find((s) => s.id === active)?.label ?? label;

  const toggle = (t: BrowseTopic) => setState((s) => toggleTopic(s, itemOf.get(t.id) as BrowseItem, q, match));
  const setAll = (expand: boolean) => setState((s) => setAllTopics(s, shown.map((t) => itemOf.get(t.id) as BrowseItem), expand));

  // ------------------------------------------------------------------ tabs that do not fit: which edge hides some
  useEffect(() => {
    const el = tablistRef.current;
    if (!el) return;
    const update = () => {
      const left = el.scrollLeft > 1;
      const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
      setEdges((e) => (e.left === left && e.right === right ? e : { left, right }));
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    ro?.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro?.disconnect();
    };
  }, [subjects.length]);
  const scrollTabs = (dir: 1 | -1) => {
    const el = tablistRef.current;
    if (el) el.scrollBy({ left: dir * Math.max(120, el.clientWidth * 0.6), behavior: reducedMotion() ? "auto" : "smooth" });
  };

  // ------------------------------------------------------------------ the bar's height → the topics' scroll margin
  useEffect(() => {
    const bar = barRef.current;
    const root = rootRef.current;
    if (!bar || !root || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => root.style.setProperty("--syl-bar-h", `${Math.ceil(bar.getBoundingClientRect().height)}px`));
    ro.observe(bar);
    return () => ro.disconnect();
  }, []);

  // ------------------------------------------------------------------ scroll-spy (any scroller: the page or the admin pane)
  const shownIds = shown.map((t) => t.id).join("|");
  useEffect(() => {
    const ids = shownIds ? shownIds.split("|") : [];
    let raf = 0;
    const measure = () => {
      raf = 0;
      const line = (barRef.current?.getBoundingClientRect().bottom ?? 0) + 16;
      let cur: string | null = ids[0] ?? null;
      for (const id of ids) {
        const el = document.getElementById(domId(id));
        if (!el) continue;
        if (el.getBoundingClientRect().top <= line) cur = id;
        else break;
      }
      setCurrent(cur);
    };
    const onScroll = () => {
      if (!raf) raf = window.requestAnimationFrame(measure);
    };
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    measure();
    return () => {
      document.removeEventListener("scroll", onScroll, { capture: true });
      window.removeEventListener("resize", onScroll);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [shownIds, domId]);

  // the rail: as tall as the visible part of its scroller; keeps the current topic in view
  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const fit = () => {
      let sc: HTMLElement | null = rail.parentElement;
      while (sc && !/(auto|scroll)/.test(getComputedStyle(sc).overflowY)) sc = sc.parentElement;
      const box = sc && sc !== document.body && sc !== document.documentElement ? sc.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
      const top = parseFloat(getComputedStyle(rail.parentElement as HTMLElement).top) || 0;
      const head = rail.offsetTop;
      rail.style.maxHeight = `${Math.max(160, Math.floor(box.bottom - (box.top + Math.max(0, top)) - head - 16))}px`;
    };
    fit();
    window.addEventListener("resize", fit, { passive: true });
    return () => window.removeEventListener("resize", fit);
  }, [active]);
  useEffect(() => {
    const rail = railRef.current;
    const item = current && rail ? rail.querySelector<HTMLElement>(`[data-rail-id="${CSS.escape(current)}"]`) : null;
    if (!rail || !item) return;
    if (item.offsetTop < rail.scrollTop || item.offsetTop + item.offsetHeight > rail.scrollTop + rail.clientHeight) {
      rail.scrollTop = Math.max(0, item.offsetTop - rail.clientHeight / 3);
    }
  }, [current]);

  // ------------------------------------------------------------------ jump
  const jumpTo = (id: string, afterSheet = false) => {
    const go = () => {
      const el = document.getElementById(domId(id));
      if (!el) return;
      el.scrollIntoView({ block: "start", behavior: reducedMotion() ? "auto" : "smooth" });
      el.querySelector<HTMLElement>("[data-topic-toggle]")?.focus({ preventScroll: true });
      setCurrent(id);
    };
    if (afterSheet) {
      setSheet(false);
      window.setTimeout(go, 80); // after the dialog has closed and handed focus back
    } else go();
  };

  // ------------------------------------------------------------------ keyboard
  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const n = subjects.length;
    const to = e.key === "ArrowRight" ? (i + 1) % n : e.key === "ArrowLeft" ? (i - 1 + n) % n : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : -1;
    if (to < 0) return;
    e.preventDefault();
    const s = subjects[to];
    setActive(s.id);
    tabRefs.current.get(s.id)?.focus();
  };
  const onToggleKey = (e: KeyboardEvent<HTMLElement>) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
    const list = e.currentTarget.closest("[data-topic-list]");
    const all = list ? [...list.querySelectorAll<HTMLElement>("button[data-topic-toggle]")].filter((b) => b.offsetParent !== null) : [];
    const i = all.indexOf(e.currentTarget as HTMLElement);
    if (i < 0 || !all.length) return;
    e.preventDefault();
    const to = e.key === "ArrowDown" ? Math.min(all.length - 1, i + 1) : e.key === "ArrowUp" ? Math.max(0, i - 1) : e.key === "Home" ? 0 : all.length - 1;
    all[to].focus();
  };

  const tabs = subjects.length > 1;
  const tabId = (sid: string) => `${uid}-tab-${sid}`;
  const panelId = (sid: string) => `${uid}-panel-${sid}`;
  const others = q ? subjects.filter((s) => s.id !== active && shownIn(s.id).length > 0) : [];

  const renderTopic = (t: BrowseTopic, panelHidden: boolean) => {
    const show = visible(t);
    if (!keepMounted && !show) return null;
    const o = isOpen(t);
    const body = `${domId(t.id)}-body`;
    const actions = t.actions;
    const mountBody = expandable(t) && (keepMounted || o);
    return (
      <li
        key={t.id}
        id={domId(t.id)}
        data-topic={t.id}
        data-open={o ? "" : undefined}
        hidden={!show || undefined}
        className="scroll-mt-[calc(max(var(--sticky-offset),0px)+var(--syl-bar-h,4rem)+0.75rem)] rounded-card border border-line bg-surface"
      >
        <div className="flex flex-col sm:flex-row sm:items-center">
          {expandable(t) ? (
            <button
              type="button"
              data-topic-toggle=""
              aria-expanded={o}
              aria-controls={mountBody ? body : undefined}
              onClick={() => toggle(t)}
              onKeyDown={onToggleKey}
              tabIndex={panelHidden ? -1 : undefined}
              className="focus-ring flex min-h-12 min-w-0 flex-1 items-start gap-3 rounded-card px-3 py-3 text-left hover:bg-ink-50"
            >
              <ChevronDown aria-hidden="true" className={cx("mt-0.5 size-5 shrink-0 text-fg-secondary transition-transform duration-120", o && "rotate-180")} />
              <span className="min-w-0 flex-1">{t.summary}</span>
            </button>
          ) : (
            <div data-topic-toggle="" tabIndex={-1} className="flex min-h-12 min-w-0 flex-1 items-start gap-3 rounded-card px-3 py-3 outline-none focus-visible:ring-2 focus-visible:ring-primary-600">
              <span aria-hidden="true" className="size-5 shrink-0" />
              <span className="min-w-0 flex-1">{t.summary}</span>
            </div>
          )}
          {actions ? <div className="px-3 pb-3 pl-11 sm:py-2 sm:pl-0">{actions}</div> : null}
        </div>
        {t.after}
        {mountBody ? (
          <div id={body} hidden={!o || undefined} className="border-t border-line p-3" data-topic-body="">
            {t.body}
          </div>
        ) : null}
      </li>
    );
  };

  const renderPanel = (sid: string) => {
    const hidden = sid !== active;
    const list = bySubject.get(sid) ?? [];
    const n = shownIn(sid).length;
    return (
      <div
        key={sid}
        id={tabs ? panelId(sid) : undefined}
        role={tabs ? "tabpanel" : undefined}
        aria-labelledby={tabs ? tabId(sid) : undefined}
        hidden={hidden || undefined}
        className="flex flex-col gap-3"
        data-subject-panel={sid}
      >
        {subjects.find((s) => s.id === sid)?.intro}
        {q && n === 0 ? (
          <div className="flex flex-col gap-2 rounded-card border border-dashed border-line-control p-4 text-body-sm text-fg-secondary" data-search-empty="">
            <p>No topic or subtopic here matches “{query.trim()}”.</p>
            {!hidden && others.length > 0 && (
              <p className="flex flex-wrap items-center gap-2">
                Found in:
                {others.map((s) => (
                  <button key={s.id} type="button" className={quietBtn} onClick={() => setActive(s.id)}>
                    {s.label} ({shownIn(s.id).length})
                  </button>
                ))}
              </p>
            )}
          </div>
        ) : null}
        <ol className="flex flex-col gap-2" aria-label={`Topics in ${subjects.find((s) => s.id === sid)?.label ?? label}`} data-topic-list="">
          {list.map((t) => renderTopic(t, hidden))}
        </ol>
      </div>
    );
  };

  return (
    <div ref={rootRef} className="grid min-w-0 gap-4 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-5 xl:grid-cols-[14rem_minmax(0,1fr)]" data-syllabus-browser="">
      {/* desktop rail: the open subject's topics (scroll-spy) */}
      <aside className="hidden min-w-0 lg:block">
        <nav aria-label={`Topics in ${activeLabel}`} className="sticky top-(--sticky-offset) flex flex-col gap-2 pt-3" data-rail="">
          <p className="truncate px-2 text-body-sm font-semibold text-fg-secondary">{activeLabel}</p>
          <ol ref={railRef} className="relative flex flex-col gap-0.5 overflow-y-auto overscroll-contain pr-1" data-topic-rail="">
            {shown.map((t) => (
              <li key={t.id}>
                <a
                  href={`#${domId(t.id)}`}
                  data-rail-id={t.id}
                  aria-current={current === t.id ? "location" : undefined}
                  onClick={(e) => {
                    e.preventDefault(); // no hash in the URL
                    jumpTo(t.id);
                  }}
                  className="focus-ring block rounded-control border-l-2 border-transparent px-2 py-1.5 text-body-sm text-fg-secondary hover:bg-ink-50 hover:text-fg aria-[current=location]:border-primary-700 aria-[current=location]:bg-primary-50 aria-[current=location]:font-semibold aria-[current=location]:text-primary-800"
                >
                  {t.name}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      </aside>

      <div className="flex min-w-0 flex-col gap-3">
        {/* the ONE sticky bar */}
        <div ref={barRef} className="sticky top-(--sticky-offset) z-10 -mx-1 flex flex-col gap-2 border-b border-line bg-surface px-1 py-2" data-syllabus-bar="">
          {tabs && (
            <div className="relative min-w-0" data-subject-tabs-wrap="" data-overflow-left={edges.left ? "" : undefined} data-overflow-right={edges.right ? "" : undefined}>
            <div ref={tablistRef} role="tablist" aria-label="Subjects" className="-mx-1 flex gap-2 overflow-x-auto px-1 py-0.5 [scrollbar-width:none] md:gap-0.5 md:border-b md:border-line md:py-0 [&::-webkit-scrollbar]:hidden" data-subject-tabs="">
              {subjects.map((s, i) => {
                const sel = s.id === active;
                const n = counts.get(s.id) ?? 0;
                return (
                  <button
                    key={s.id}
                    ref={(el) => {
                      if (el) tabRefs.current.set(s.id, el);
                      else tabRefs.current.delete(s.id);
                    }}
                    id={tabId(s.id)}
                    type="button"
                    role="tab"
                    aria-selected={sel}
                    aria-controls={keepMounted || sel ? panelId(s.id) : undefined}
                    tabIndex={sel ? 0 : -1}
                    title={shortSubjectLabel(s.label) !== s.label ? s.label : undefined}
                    onClick={() => setActive(s.id)}
                    onKeyDown={(e) => onTabKey(e, i)}
                    className={cx(tabBase, sel ? "border-primary-700 bg-primary-50 text-primary-800 md:bg-transparent" : "border-line-control bg-surface text-fg hover:bg-ink-50 md:border-transparent md:bg-transparent md:text-fg-secondary md:hover:text-fg")}
                  >
                    {shortSubjectLabel(s.label)}
                    <span className={cx("rounded-full px-1.5 text-[12px] font-semibold", sel ? "bg-primary-100 text-primary-800" : "bg-ink-100 text-fg-secondary")}>{n}</span>
                  </button>
                );
              })}
            </div>
            {/* hidden tabs are obvious: a fade + arrow on the edge that hides some (mouse / touch; keyboard uses the arrow keys) */}
            {edges.left && (
              <div className="pointer-events-none absolute inset-y-0 left-0 flex w-14 items-center bg-linear-to-r from-surface via-surface/85 to-transparent" data-tabs-fade="left">
                <button type="button" tabIndex={-1} aria-hidden="true" onClick={() => scrollTabs(-1)} className={edgeBtn}>
                  <ChevronLeft className="size-5" />
                </button>
              </div>
            )}
            {edges.right && (
              <div className="pointer-events-none absolute inset-y-0 right-0 flex w-14 items-center justify-end bg-linear-to-l from-surface via-surface/85 to-transparent" data-tabs-fade="right">
                <button type="button" tabIndex={-1} aria-hidden="true" onClick={() => scrollTabs(1)} className={edgeBtn} data-tabs-more="">
                  <ChevronRight className="size-5" />
                </button>
              </div>
            )}
            </div>
          )}
          <div className="flex items-center gap-2">
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">Search topics and subtopics</span>
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-fg-secondary" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape" && query) {
                    e.preventDefault();
                    setQuery("");
                  }
                }}
                placeholder="Search topics"
                autoComplete="off"
                enterKeyHint="search"
                className="focus-ring h-11 w-full min-w-0 rounded-control border border-line-control bg-surface pl-10 pr-11 text-body text-fg placeholder:text-fg-secondary [&::-webkit-search-cancel-button]:hidden"
                data-syllabus-search=""
              />
              {query && (
                <button type="button" onClick={() => setQuery("")} className="focus-ring absolute right-0 top-0 inline-flex size-11 items-center justify-center rounded-control text-fg-secondary hover:text-fg" aria-label="Clear search">
                  <X aria-hidden="true" className="size-5" />
                </button>
              )}
            </label>
            <button type="button" onClick={() => setSheet(true)} className={cx(quietBtn, "shrink-0 lg:hidden")} aria-haspopup="dialog" data-jump-open="">
              <ListTree aria-hidden="true" className="size-5" />
              <span className="sm:hidden">Jump</span>
              <span className="hidden sm:inline">Jump to topic</span>
            </button>
            {barExtra}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-body-sm text-fg-secondary" aria-live="polite" data-topic-count="">
            {q ? `${shown.length} of ${activeTopics.length} topics match` : `${activeTopics.length} topic${activeTopics.length === 1 ? "" : "s"}`}
          </p>
          <div className="flex gap-2">
            <button type="button" className={quietBtn} onClick={() => setAll(true)} disabled={!shown.some((t) => expandable(t) && !isOpen(t))} data-expand-all="">
              Expand all
            </button>
            <button type="button" className={quietBtn} onClick={() => setAll(false)} disabled={!shown.some((t) => isOpen(t))} data-collapse-all="">
              Collapse all
            </button>
          </div>
        </div>

        {(keepMounted ? subjects.map((s) => s.id) : [active]).map(renderPanel)}
      </div>

      <JumpSheet open={sheet} onClose={() => setSheet(false)} subtitle={activeLabel}>
        <ol className="-mx-2 flex flex-col" data-jump-list="">
          {shown.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => jumpTo(t.id, true)}
                data-jump-id={t.id}
                aria-current={current === t.id ? "location" : undefined}
                className="focus-ring flex min-h-12 w-full items-center rounded-control px-3 text-left text-body text-fg hover:bg-ink-50 aria-[current=location]:bg-primary-50 aria-[current=location]:font-semibold aria-[current=location]:text-primary-800"
              >
                {t.name}
              </button>
            </li>
          ))}
          {shown.length === 0 && <li className="px-3 py-2 text-body-sm text-fg-secondary">No topic matches the search.</li>}
        </ol>
      </JumpSheet>
    </div>
  );
}

/**
 * The "Jump to topic" bottom sheet: a native <dialog> opened with showModal() (the page behind is inert, focus stays
 * inside, Esc and a backdrop tap close it, focus returns to the opener). Own markup instead of components/ui/dialog so
 * the student page does not load tailwind-merge for it.
 */
function JumpSheet({ open, onClose, subtitle, children }: { open: boolean; onClose: () => void; subtitle: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const titleId = `${useId().replace(/[^a-zA-Z0-9_-]/g, "")}-jump`;
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      opener.current = document.activeElement as HTMLElement | null;
      d.showModal();
    } else if (!open && d.open) d.close();
  }, [open]);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const closed = () => {
      opener.current?.focus?.({ preventScroll: true });
      onClose();
    };
    d.addEventListener("close", closed);
    return () => d.removeEventListener("close", closed);
  }, [onClose]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="z-60 mb-0 mt-auto w-full max-w-none bg-transparent p-0 text-fg backdrop:bg-ink-950/50 md:m-auto md:w-[calc(100%-2rem)] md:max-w-lg"
      data-jump-sheet=""
    >
      <div className="flex max-h-[85dvh] flex-col gap-3 overflow-y-auto rounded-t-sheet bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-e3 md:rounded-sheet md:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 id={titleId} className="text-h3 font-semibold text-fg">
              Jump to topic
            </h2>
            <p className="truncate text-body-sm text-fg-secondary">{subtitle}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="focus-ring -mr-2 -mt-2 inline-flex size-12 shrink-0 items-center justify-center rounded-control text-fg-secondary hover:bg-ink-100 hover:text-fg">
            <X aria-hidden="true" className="size-5" />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
